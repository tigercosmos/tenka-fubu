import { describe, expect, it } from 'vitest';
import { Graphics, Polygon, type StrokeInstruction } from 'pixi.js';
import { buildFullState } from '../helpers/fullState';
import { selectMapStaticModel } from '@core/state/selectors';
import { createWaterFeatures } from '@ui/map/terrain/terrainDraw';
import { buildTerrainPack } from '@ui/map/terrain/terrainPack';
import { buildRoadsLayer, drawBridge } from '@ui/map/roads/roadsDraw';
import { edgePolyline, edgeVisualPolyline } from '@ui/map/roads/roadGeometry';
import { MAP_PALETTE_NUM } from '@ui/styles/tokens';
import { collectRiverBridgeFootprints } from '@ui/map/constrainedCoast';

type Point = { x: number; y: number };
type Interval = [number, number];
type Capsule = { a: Point; b: Point; radius: number };
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
const sub = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y });

function range(value: number, slope: number, low: number, high: number): Interval | null {
  if (Math.abs(slope) < 1e-12) return value >= low && value <= high ? [-Infinity, Infinity] : null;
  const a = (low - value) / slope,
    b = (high - value) / slope;
  return [Math.min(a, b), Math.max(a, b)];
}

// Independent exact finite segment capsule intersection, including BOTH round caps.
function capsuleIntervals(origin: Point, axis: Point, capsule: Capsule): Interval[] {
  const intervals: Interval[] = [];
  const delta = sub(capsule.b, capsule.a),
    length = Math.hypot(delta.x, delta.y);
  if (length > 0) {
    const v = { x: delta.x / length, y: delta.y / length },
      offset = sub(origin, capsule.a);
    const across = range(cross(v, offset), cross(v, axis), -capsule.radius, capsule.radius);
    const along = range(dot(v, offset), dot(v, axis), 0, length);
    if (across && along) {
      const start = Math.max(across[0], along[0]),
        end = Math.min(across[1], along[1]);
      if (start <= end) intervals.push([start, end]);
    }
  }
  for (const center of [capsule.a, capsule.b]) {
    const offset = sub(center, origin),
      along = dot(offset, axis),
      distance = Math.abs(cross(axis, offset));
    if (distance <= capsule.radius) {
      const half = Math.sqrt(Math.max(0, capsule.radius ** 2 - distance ** 2));
      intervals.push([along - half, along + half]);
    }
  }
  return intervals;
}

function nearestAxis(points: readonly Point[], center: Point): Point {
  let best = Infinity,
    axis = { x: 1, y: 0 };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!,
      b = points[i]!,
      v = sub(b, a),
      length = Math.hypot(v.x, v.y);
    if (!length) continue;
    const t = Math.max(0, Math.min(1, dot(sub(center, a), v) / length ** 2));
    const distance = Math.hypot(center.x - a.x - t * v.x, center.y - a.y - t * v.y);
    if (distance < best) {
      best = distance;
      axis = { x: v.x / length, y: v.y / length };
    }
  }
  return axis;
}

function paint(graphics: Graphics) {
  return graphics.context.instructions.map((instruction) => {
    if (instruction.action !== 'fill' && instruction.action !== 'stroke')
      throw new Error('unexpected bridge instruction');
    return {
      action: instruction.action,
      style: {
        color: instruction.data.style.color,
        alpha: instruction.data.style.alpha,
        ...(instruction.action === 'stroke'
          ? { width: instruction.data.style.width, cap: instruction.data.style.cap }
          : {}),
      },
      shapes: instruction.data.path.shapePath.shapePrimitives.map((primitive) => {
        expect(primitive.shape).toBeInstanceOf(Polygon);
        return [...(primitive.shape as Polygon).points];
      }),
    };
  });
}

describe('actual normalized river paint and physical bridge contact', () => {
  it('includes finite round caps rather than treating every river segment as an infinite strip', () => {
    const origin = { x: 0, y: 0 },
      axis = { x: 1, y: 0 };
    const capOnly = capsuleIntervals(origin, axis, {
      a: { x: 2, y: 1 },
      b: { x: 2, y: 3 },
      radius: 2,
    });
    expect(capOnly).toHaveLength(1);
    expect(capOnly[0]![0]).toBeCloseTo(2 - Math.sqrt(3), 12);
    expect(capOnly[0]![1]).toBeCloseTo(2 + Math.sqrt(3), 12);
    expect(
      capsuleIntervals(origin, axis, {
        a: { x: 2, y: 3 },
        b: { x: 2, y: 5 },
        radius: 2,
      }),
    ).toEqual([]);
    const pointCaps = capsuleIntervals(origin, axis, {
      a: { x: 4, y: 0 },
      b: { x: 4, y: 0 },
      radius: 1,
    });
    expect(pointCaps.every(([a, b]) => a === 3 && b === 5)).toBe(true);
    expect(pointCaps).toHaveLength(2);
  });

  it('extracts real runtime stroke capsules and proves both bridge centers wet and outer abutments dry', async () => {
    const state = await buildFullState({ seed: 42 });
    const graph = selectMapStaticModel(state).graph;
    const terrain = buildTerrainPack(),
      snapshot = JSON.stringify(terrain.rivers);
    const water = createWaterFeatures(terrain.rivers, [], collectRiverBridgeFootprints(graph));
    try {
      const groups: { paint: Capsule[]; mask: Capsule[] | null }[] = [];
      const extract = (graphics: Graphics, mask = false): Capsule[] => {
        const capsules: Capsule[] = [];
        const strokes = graphics.context.instructions.filter(
          (i): i is StrokeInstruction => i.action === 'stroke',
        );
        // Each runtime leg is now one textured base stroke (untinted white),
        // or the canonical solid fallback. Extract geometry independently of pigment.
        for (const stroke of strokes) {
          if (!mask && stroke.data.style.color === 0xffffff) {
            expect(stroke.data.style.textureSpace).toBe('global');
            expect(stroke.data.style.texture).toBeDefined();
          } else if (!mask) {
            expect(stroke.data.style.color).toBe(MAP_PALETTE_NUM.waterRiver);
          }
          expect(stroke.data.style.cap).toBe('round');
          expect(stroke.data.path.shapePath.shapePrimitives).toHaveLength(1);
          const shape = stroke.data.path.shapePath.shapePrimitives[0]!.shape;
          expect(shape).toBeInstanceOf(Polygon);
          const p = (shape as Polygon).points;
          expect(p).toHaveLength(4);
          capsules.push({
            a: { x: p[0]!, y: p[1]! },
            b: { x: p[2]!, y: p[3]! },
            radius: stroke.data.style.width / 2,
          });
        }
        return capsules;
      };
      for (const child of water.container.children.slice(1)) {
        groups.push({ paint: extract(child as Graphics), mask: null });
        for (const group of child.children) {
          expect(group.children).toHaveLength(2);
          const mask = group.children[1] as Graphics;
          expect(group.mask).toBe(mask);
          groups.push({ paint: extract(group.children[0] as Graphics), mask: extract(mask, true) });
        }
      }
      expect(groups.reduce((sum, group) => sum + (group.mask ?? group.paint).length, 0)).toBe(
        terrain.rivers.reduce((sum, river) => sum + river.points.length - 1, 0),
      );
      expect(groups.reduce((sum, group) => sum + group.paint.length, 0)).toBe(
        water
          .getRiverMaterialDiagnostics()
          .rivers.reduce((sum, river) => sum + river.displaySegments.length, 0),
      );
      const bridges = [...graph.edges.values()].filter((edge) => edge.bridges?.length);
      expect(bridges).toHaveLength(2);
      for (const edge of bridges) {
        const center = { x: edge.bridges![0]!, y: edge.bridges![1]! };
        const raw = edgePolyline(edge, graph)!,
          visual = edgeVisualPolyline(edge, graph)!;
        expect(visual[0]).toEqual(raw[0]);
        expect(visual.at(-1)).toEqual(raw.at(-1));
        const axis = nearestAxis(visual, center);
        expect(axis.x).toBeCloseTo(nearestAxis(raw, center).x, 12);
        expect(axis.y).toBeCloseTo(nearestAxis(raw, center).y, 12);
        // Visible water is actual display paint INTERSECTED with its original
        // capsule mask. Sampling only the mask would not prove wet bridge centers.
        const intervals = groups.flatMap((group) => {
          const painted = group.paint.flatMap((capsule) => capsuleIntervals(center, axis, capsule));
          if (!group.mask) return painted;
          const masked = group.mask.flatMap((capsule) => capsuleIntervals(center, axis, capsule));
          return painted.flatMap(([a, b]) =>
            masked.flatMap(([c, d]): Interval[] =>
              Math.max(a, c) <= Math.min(b, d) ? [[Math.max(a, c), Math.min(b, d)]] : [],
            ),
          );
        });
        const local = intervals.filter(([a, b]) => a <= 11 && b >= -11);
        expect(local.length).toBeGreaterThan(0);
        expect(local.some(([a, b]) => a <= 0 && b >= 0)).toBe(true);
        for (const [a, b] of local) {
          expect(a).toBeGreaterThan(-8);
          expect(b).toBeLessThan(8);
        }
        for (const endpoint of [-11, 11])
          expect(intervals.some(([a, b]) => a <= endpoint && b >= endpoint)).toBe(false);
      }
      expect(JSON.stringify(terrain.rivers)).toBe(snapshot);
    } finally {
      water.destroy();
    }
  });

  it('draws identical real bridge geometry at mid and near with original centers and tangents, far hidden', async () => {
    const state = await buildFullState({ seed: 42 });
    const graph = selectMapStaticModel(state).graph;
    const layer = buildRoadsLayer(graph);
    const expected = new Graphics();
    try {
      for (const edge of graph.edges.values()) {
        for (let i = 0; i < (edge.bridges?.length ?? 0); i += 2) {
          const center = { x: edge.bridges![i]!, y: edge.bridges![i + 1]! };
          const axis = nearestAxis(edgePolyline(edge, graph)!, center);
          drawBridge(expected, center.x, center.y, Math.atan2(axis.y, axis.x), 1);
        }
      }
      expect(paint(expected).length).toBeGreaterThan(0);
      for (const stage of ['mid', 'near'] as const) {
        layer.setStage(stage);
        expect(layer.tiers.bridge.visible).toBe(true);
        expect(paint(layer.tiers.bridge)).toEqual(paint(expected));
      }
      layer.setStage('far');
      expect(layer.tiers.bridge.visible).toBe(false);
    } finally {
      layer.destroy();
      expected.destroy();
    }
  });
});
