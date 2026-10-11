import {
  BitmapText,
  BufferImageSource,
  Container,
  Graphics,
  Sprite,
  Texture,
  TextStyle,
} from 'pixi.js';
import type { MapStaticData, MapViewState } from '../mapViewTypes';
import type { TerritoryGrid } from '../territoryGrid';
import { MAPVIEW, WORLD_SIZE } from '../mapViewConfig';
import { armyWorldPos } from '../dirty';
import { projectPolyline, type PointProjection } from '../roads/projectPolyline';
import { createProjectedTerrainOverlay } from '../terrain/terrainProjectedOverlay';
import { clanColorNum, TOKENS_NUM } from '@ui/styles/tokens';
import { LABEL_STYLE, labelTextStyle } from '../labelStyle';
import {
  analysisSignature,
  buildAnalysisMarks,
  buildFactionPixels,
  type AnalysisMark,
  type MapAnalysisMode,
} from './analysisModel';

// Pixi caches halo bitmap fonts by TextStyle identity, not by appearance. Reuse
// immutable styles across overlays/remounts: the canonical clan palette and three
// weight sizes bound this process-wide cache. Text destruction must not destroy them.
const factionStyles = new Map<string, TextStyle>();
function factionStyle(fill: number, size: number): TextStyle {
  const key = `${fill}|${size}`;
  let style = factionStyles.get(key);
  if (style === undefined) {
    style = new TextStyle(labelTextStyle({ ...LABEL_STYLE.province, fill, size }));
    factionStyles.set(key, style);
  }
  return style;
}

function destroyFactionLabel(label: BitmapText): void {
  // Pixi's text destroy leaves the retained style subscription attached. Its
  // public setter detaches it; destroy only the fresh, unrendered owned style.
  label.style = {};
  label.parent?.removeChild(label);
  label.destroy({ style: true });
}

export function drawAnalysisMarks(
  graphics: Graphics,
  marks: readonly AnalysisMark[],
  project?: PointProjection,
): void {
  graphics.clear();
  for (const mark of marks) {
    const sourcePoints = project
      ? Array.from({ length: Math.floor(mark.points.length / 2) }, (_, index) => ({
          x: mark.points[index * 2]!,
          y: mark.points[index * 2 + 1]!,
        }))
      : null;
    const points =
      sourcePoints && project && !mark.dashed
        ? (mark.radius === undefined
            ? projectPolyline(sourcePoints, project).points
            : sourcePoints.map(project)
          ).flatMap((point) => [point.x, point.y])
        : mark.points;
    const x = points[0] ?? 0;
    const y = points[1] ?? 0;
    if (mark.radius !== undefined) {
      graphics
        .circle(x, y, mark.radius)
        .fill({ color: mark.color, alpha: 0.22 })
        .stroke({ color: mark.color, width: mark.width });
      if (mark.double)
        graphics.circle(x, y, mark.radius + 7).stroke({ color: mark.color, width: 2 });
    } else {
      if (mark.dashed && sourcePoints && project) {
        for (let i = 0; i + 1 < sourcePoints.length; i++) {
          const a = sourcePoints[i]!,
            b = sourcePoints[i + 1]!;
          const length = Math.hypot(b.x - a.x, b.y - a.y);
          for (let start = 0; start < length; start += 20) {
            const end = Math.min(length, start + 12);
            const dash = projectPolyline(
              [
                {
                  x: a.x + ((b.x - a.x) * start) / length,
                  y: a.y + ((b.y - a.y) * start) / length,
                },
                { x: a.x + ((b.x - a.x) * end) / length, y: a.y + ((b.y - a.y) * end) / length },
              ],
              project,
            ).points;
            graphics.moveTo(dash[0]!.x, dash[0]!.y);
            for (const point of dash.slice(1)) graphics.lineTo(point.x, point.y);
          }
        }
        graphics.stroke({ color: mark.color, width: mark.width });
        continue;
      }
      if (mark.dashed) {
        for (let i = 0; i + 3 < points.length; i += 2) {
          const ax = points[i] ?? 0;
          const ay = points[i + 1] ?? 0;
          const bx = points[i + 2] ?? 0;
          const by = points[i + 3] ?? 0;
          const length = Math.hypot(bx - ax, by - ay);
          for (let start = 0; start < length; start += 20) {
            const end = Math.min(length, start + 12);
            graphics.moveTo(ax + ((bx - ax) * start) / length, ay + ((by - ay) * start) / length);
            graphics.lineTo(ax + ((bx - ax) * end) / length, ay + ((by - ay) * end) / length);
          }
        }
        graphics.stroke({ color: mark.color, width: mark.width });
        continue;
      }
      graphics.moveTo(x, y);
      for (let i = 2; i + 1 < points.length; i += 2)
        graphics.lineTo(points[i] ?? 0, points[i + 1] ?? 0);
      graphics.stroke({ color: mark.color, width: mark.width });
    }
  }
}

export function createAnalysisOverlay(
  data: MapStaticData,
  grid: TerritoryGrid,
  field?: Parameters<typeof createProjectedTerrainOverlay>[1],
) {
  const container = new Container();
  container.label = 'analysisTheme';
  container.eventMode = 'none';
  const annotations = new Container();
  annotations.label = 'factionAnnotations';
  annotations.eventMode = 'none';
  annotations.visible = false;
  const graphics = new Graphics();
  container.addChild(graphics);
  let projectedRaster: ReturnType<typeof createProjectedTerrainOverlay> | null = null;
  let sprite: Sprite | ReturnType<typeof createProjectedTerrainOverlay>['mesh'] | null = null;
  let source: BufferImageSource | null = null;
  let texture: Texture | null = null;
  let rasterBuffer: Uint8Array | null = null;
  let signature: string | null = null;
  let redraws = 0;
  let disposed = false;
  let labelSignature: string | null = null;
  const labels: BitmapText[] = [];
  const dots = new Map<string, { graphics: Graphics; signature: string }>();
  let scale = 1;
  function syncAnnotations(view: MapViewState): void {
    const next = JSON.stringify(view.castles.map((c) => [c.id, c.ownerClanId]));
    if (next !== labelSignature) {
      labelSignature = next;
      for (const label of labels.splice(0)) destroyFactionLabel(label);
      const groups = new Map<string, { x: number; y: number; count: number }>();
      for (const castle of view.castles) {
        const pos = data.graph.nodes.get(castle.id)?.pos;
        if (pos === undefined) continue;
        const group = groups.get(castle.ownerClanId) ?? { x: 0, y: 0, count: 0 };
        group.x += pos.x;
        group.y += pos.y;
        group.count += 1;
        groups.set(castle.ownerClanId, group);
      }
      for (const [owner, group] of groups) {
        const name = data.names?.[owner];
        if (name === undefined) continue;
        const label = new BitmapText({
          text: name,
          style: factionStyle(
            data.clanColorIndex[owner] === undefined
              ? TOKENS_NUM.ink700
              : clanColorNum(data.clanColorIndex[owner]),
            group.count >= 8 ? 20 : group.count >= 3 ? 16 : 13,
          ),
        });
        label.anchor.set(0.5, 0.5);
        const canonical = { x: group.x / group.count, y: group.y / group.count };
        const scene = field?.project(canonical) ?? canonical;
        label.position.set(scene.x, scene.y);
        label.scale.set(1 / scale);
        annotations.addChild(label);
        labels.push(label);
      }
    }
    const liveDots = new Set<string>();
    for (const army of view.armies) {
      // Preserve selected and warning chips rather than replacing their useful state badges.
      if (
        army.selected ||
        army.foodDays < MAPVIEW.armySupplyLowDays ||
        army.status === 'engaged' ||
        army.status === 'sieging'
      )
        continue;
      const pos = armyWorldPos(army, data.graph);
      if (pos === null) continue;
      const index = data.clanColorIndex[army.clanId];
      const color = index === undefined ? TOKENS_NUM.neutralClanless : clanColorNum(index);
      let entry = dots.get(army.id);
      if (entry === undefined) {
        entry = { graphics: new Graphics(), signature: '' };
        dots.set(army.id, entry);
        annotations.addChild(entry.graphics);
      }
      const dot = entry.graphics;
      const nextSignature = `${color}|${army.relation}`;
      if (entry.signature !== nextSignature) {
        dot.clear();
        if (army.relation === 'enemy') dot.poly([-3, 3, 0, -3, 3, 3]);
        else if (army.relation === 'neutral') dot.poly([0, -3, 3, 0, 0, 3, -3, 0]);
        else dot.circle(0, 0, 3);
        dot.fill(color).stroke({ color: TOKENS_NUM.ink900, width: 1 });
        if (army.relation === 'friendly')
          dot.circle(0, 0, 1.5).stroke({ color: TOKENS_NUM.ink900, width: 0.7 });
        entry.signature = nextSignature;
      }
      const scene = field?.project(pos) ?? pos;
      dot.position.set(scene.x, scene.y);
      dot.scale.set(1 / scale);
      liveDots.add(army.id);
    }
    for (const [id, entry] of dots)
      if (!liveDots.has(id)) {
        annotations.removeChild(entry.graphics);
        entry.graphics.destroy();
        dots.delete(id);
      }
  }
  return {
    container,
    annotations,
    setScale(next: number): void {
      if (next === scale) return;
      scale = next;
      for (const child of annotations.children) child.scale.set(1 / scale);
    },
    get redraws(): number {
      return redraws;
    },
    get ownedTextures(): number {
      return disposed || texture === null ? 0 : 1;
    },
    getProjectionDiagnostics() {
      return projectedRaster?.getDiagnostics() ?? null;
    },
    update(view: MapViewState, mode: MapAnalysisMode, opacity: number): void {
      if (disposed) return;
      container.visible = mode !== 'none';
      annotations.visible = mode === 'faction';
      container.alpha = Number.isFinite(opacity) ? Math.max(0, Math.min(1, opacity)) : 0.55;
      if (mode === 'faction') syncAnnotations(view);
      const next = analysisSignature(view, mode);
      if (next === signature) return;
      signature = next;
      graphics.visible = mode !== 'faction';
      if (sprite !== null) sprite.visible = mode === 'faction';
      if (mode === 'none') return;
      if (mode === 'faction') {
        const pixels = buildFactionPixels(grid, data, view);
        if (source === null) {
          rasterBuffer = pixels;
          source = new BufferImageSource({
            resource: pixels,
            width: grid.size,
            height: grid.size,
            scaleMode: 'nearest',
            alphaMode: 'premultiply-alpha-on-upload',
            label: 'analysisFaction',
          });
          texture = new Texture({ source });
          if (field) {
            projectedRaster = createProjectedTerrainOverlay(texture, field);
            sprite = projectedRaster.mesh;
          } else {
            sprite = new Sprite(texture);
            sprite.width = WORLD_SIZE;
            sprite.height = WORLD_SIZE;
          }
          container.addChild(sprite);
        } else {
          // Keep the same resource allocation and update its contents in place.
          rasterBuffer?.set(pixels);
          source.update();
        }
      } else drawAnalysisMarks(graphics, buildAnalysisMarks(data, view, mode), field?.project);
      redraws += 1;
    },
    destroy(): void {
      if (disposed) return;
      disposed = true;
      container.parent?.removeChild(container);
      if (sprite !== null) {
        container.removeChild(sprite);
        if (projectedRaster) projectedRaster.destroy();
        else sprite.destroy({ texture: false });
      }
      texture?.destroy(false);
      source?.destroy();
      for (const label of labels.splice(0)) destroyFactionLabel(label);
      annotations.parent?.removeChild(annotations);
      annotations.destroy({ children: true });
      container.destroy({ children: true });
    },
  };
}
