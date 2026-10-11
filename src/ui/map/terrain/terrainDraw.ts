// 地形／水系純繪製輔助函式（terrainBase relief／forest 烘焙紋理 Sprite 建構、waterFeatures
// 河川／湖泊向量繪製）。
//
// 規格：M6-V5 技術設計文件 §4.4（本檔逐字實作）、§3.1 VD3（三級 LOD 顯示矩陣）、
// plan/04-map-and-movement.md §3.10.1（圖層 1 terrainBase／圖層 2 前身之水系內容）。
//
// 設計要點：
// - `createTerrainSprite`：relief／forest／territory 共用的烘焙紋理 Sprite 建構（鋪滿
//   `TERRAIN_SPRITE_WORLD`＝4096 世界單位）；scaleMode（linear）由呼叫端（`MapRenderer`）於
//   texture source 設定，本函式不碰 texture 內容。
// - `createWaterFeatures`：init 一次建 4 個 `Graphics`（湖恆顯 1 個＋河依 widthClass 分派 3 個），
//   LOD 只切 `visible`，不重繪（04 §3.10.1／M6-V5 §3.3 效能考量：河湖形狀整局不變）。
// - 決定論：河依 `id` 字典序處理（雖對繪製結果無影響，仍與既有 mapDraw 慣例一致、利於快照）。
// - taper：沿線比例 `lerp(RIVER_TAPER_HEAD, 1, i/(segCount-1))`——第一段（上游）＝
//   `RIVER_TAPER_HEAD`（0.4×），最後一段（下游／河口）＝恰好 1.0×（「上游細下游寬」，
//   §4.4／§6.3）；單一段河流（僅 2 點）無比例可插，退回 1.0×（無 taper 意義）。
// - 色彩取自 `MAP_PALETTE_NUM`／`LAKE_SURFACE`；河川圖紋使用白色 tint 保留原始材質。

import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { LodStage } from '../lod';
import { MAP_PALETTE_NUM } from '@ui/styles/tokens';
import {
  RIVER_WIDTH,
  TERRAIN_SPRITE_WORLD,
  TERRAIN_RELIEF,
  TERRAIN_GROUND_COLOR,
  LAKE_SURFACE,
} from '../mapViewConfig';
import type { MapStaticData } from '../mapViewTypes';
import { buildDisplayLake, type LakePoint } from './displayLakeGeometry';
import { createLakeSurfaceMaterial } from './lakeSurfaceMaterial';
import {
  createRiverSurfaceMaterial,
  RIVER_SURFACE_LIMITS,
  riverBoundsTuple,
  inspectRiverBounds,
  probeRiverSurfaceBoundsPair,
  type RiverMaterialFactoryStage,
  type RiverBoundsTuple,
  type RiverSurfaceBounds,
} from './riverSurfaceMaterial';
import {
  buildDisplayRiver,
  buildNaturalDisplayRiver,
  type RiverDisplayConstraints,
  type RiverKeepout,
  type RiverDisplaySegment,
} from './displayRiverGeometry';

type Rivers = NonNullable<MapStaticData['terrain']>['rivers'];
type Lakes = NonNullable<MapStaticData['terrain']>['lakes'];

type Point = { x: number; y: number };
export interface ReliefFace {
  mountainId?: string;
  forestId?: string;
  points: readonly Point[];
  shade: 'hill' | 'woodedHill' | 'forestLight' | 'forestDark';
  illumination?: number;
  ground?: readonly Point[];
  heights?: readonly number[];
  elevation?: number;
  slope?: number;
}

export interface CanopyCluster {
  forestId: string;
  center: Point;
  radius: number;
  height: number;
}

function insidePolygon(p: Point, polygon: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      inside = !inside;
  }
  return inside;
}

/** Bounded deterministic sampling, with edge clearance for the entire projected canopy. */
export function buildForestCanopies(
  terrain: NonNullable<MapStaticData['terrain']>,
): CanopyCluster[] {
  const clusters: CanopyCluster[] = [];
  for (const forest of [...(terrain.forests ?? [])].sort((a, b) => a.id.localeCompare(b.id))) {
    if (clusters.length >= TERRAIN_RELIEF.canopyTotal) break;
    const polygon = forest.polygon;
    if (polygon.length < 3) continue;
    const minX = Math.min(...polygon.map((p) => p.x));
    const minY = Math.min(...polygon.map((p) => p.y));
    const maxX = Math.max(...polygon.map((p) => p.x));
    const maxY = Math.max(...polygon.map((p) => p.y));
    const spacing = Math.max(
      TERRAIN_RELIEF.canopySpacing,
      (maxX - minX) / TERRAIN_RELIEF.canopyScanSide,
      (maxY - minY) / TERRAIN_RELIEF.canopyScanSide,
    );
    let count = 0;
    for (
      let y = minY + spacing / 2;
      y < maxY && count < TERRAIN_RELIEF.canopyPerPatch;
      y += spacing
    ) {
      for (
        let x = minX + spacing / 2;
        x < maxX && count < TERRAIN_RELIEF.canopyPerPatch;
        x += spacing
      ) {
        if (clusters.length >= TERRAIN_RELIEF.canopyTotal) return clusters;
        const center = { x, y };
        if (!insidePolygon(center, polygon)) continue;
        const radius = 8 + (count % 3);
        const height = TERRAIN_RELIEF.forestHeight + 13 + (count % 4);
        const clearance = height + radius;
        const clear = polygon.every((a, i) => {
          const b = polygon[(i + 1) % polygon.length]!;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const length2 = dx * dx + dy * dy;
          const t =
            length2 === 0
              ? 0
              : Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / length2));
          return Math.hypot(x - a.x - t * dx, y - a.y - t * dy) >= clearance;
        });
        if (!clear) continue;
        clusters.push({ forestId: forest.id, center, radius, height });
        count += 1;
      }
    }
  }
  return clusters;
}

function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length2 = dx * dx + dy * dy;
  const t =
    length2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length2));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

type Triangle = [Point, Point, Point];
function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

/** Ear clipping preserves concave authored footprints, unlike a center fan. */
function triangulate(polygon: readonly Point[]): Triangle[] {
  const points = [...polygon];
  const triangles: Triangle[] = [];
  const area = points.reduce((sum, a, i) => {
    const b = points[(i + 1) % points.length]!;
    return sum + a.x * b.y - b.x * a.y;
  }, 0);
  if (area < 0) points.reverse();
  while (points.length > 3) {
    let clipped = false;
    for (let i = 0; i < points.length; i += 1) {
      const a = points[(i + points.length - 1) % points.length]!;
      const b = points[i]!;
      const c = points[(i + 1) % points.length]!;
      if (cross(a, b, c) <= 0) continue;
      if (
        points.some(
          (p) =>
            p !== a &&
            p !== b &&
            p !== c &&
            cross(a, b, p) >= 0 &&
            cross(b, c, p) >= 0 &&
            cross(c, a, p) >= 0,
        )
      )
        continue;
      triangles.push([a, b, c]);
      points.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (points.length === 3) triangles.push([points[0]!, points[1]!, points[2]!]);
  return triangles;
}

/** Continuous height field fades to ground at the mass boundary, with smooth ridge crests. */
export function buildReliefFaces(terrain: NonNullable<MapStaticData['terrain']>): ReliefFace[] {
  const faces: ReliefFace[] = [];
  const lift = (p: Point, height: number): Point => ({
    x: p.x + height * TERRAIN_RELIEF.projectionX,
    y: p.y - height,
  });
  let hillCount = 0;
  const heightFields: ((p: Point) => number)[] = [];
  for (const mountain of [...(terrain.mountains ?? [])].sort((a, b) => a.id.localeCompare(b.id))) {
    const triangles = triangulate(mountain.mass);
    if (triangles.length === 0) continue;
    const budget = Math.min(
      TERRAIN_RELIEF.hillFacesPerPatch,
      TERRAIN_RELIEF.hillFacesTotal - hillCount,
    );
    if (budget < triangles.length) break;
    const longest = Math.max(
      ...triangles.flatMap(([a, b, c]) => [
        Math.hypot(a.x - b.x, a.y - b.y),
        Math.hypot(b.x - c.x, b.y - c.y),
        Math.hypot(c.x - a.x, c.y - a.y),
      ]),
    );
    const depth = Math.min(
      4,
      Math.max(0, Math.ceil(Math.log2(longest / TERRAIN_RELIEF.hillGrid))),
      Math.floor(Math.log(budget / triangles.length) / Math.log(4)),
    );
    const heights = new Map<string, number>();
    const heightAt = (p: Point): number => {
      const key = `${p.x},${p.y}`;
      const cached = heights.get(key);
      if (cached !== undefined) return cached;
      if (!insidePolygon(p, mountain.mass)) {
        heights.set(key, 0);
        return 0;
      }
      const edgeDistance = Math.min(
        ...mountain.mass.map((a, i) =>
          segmentDistance(p, a, mountain.mass[(i + 1) % mountain.mass.length]!),
        ),
      );
      const t = Math.min(1, edgeDistance / TERRAIN_RELIEF.hillEdgeFade);
      const fade = t * t * (3 - 2 * t);
      let crestNumerator = 0;
      let crestDenominator = 0;
      mountain.ridges.forEach((ridge, index) => {
        let ridgeDistance = Infinity;
        let ridgeWave = 1;
        let arc = 0;
        for (let i = 1; i < ridge.length; i += 1) {
          const a = ridge[i - 1]!,
            b = ridge[i]!;
          const dx = b.x - a.x,
            dy = b.y - a.y;
          const length = Math.hypot(dx, dy);
          const distance = segmentDistance(p, a, b);
          if (distance < ridgeDistance) {
            ridgeDistance = distance;
            const t =
              length === 0
                ? 0
                : Math.max(
                    0,
                    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (length * length)),
                  );
            ridgeWave =
              0.84 +
              0.16 *
                Math.cos((arc + t * length) / TERRAIN_RELIEF.hillRidgeUndulation + index * 0.4);
          }
          arc += length;
        }
        if (Number.isFinite(ridgeDistance)) {
          const weight = Math.exp(-((ridgeDistance / TERRAIN_RELIEF.hillRidgeWidth) ** 2));
          // Smooth approximation of the strongest crest; no nearest-ridge material discontinuity.
          crestNumerator += weight ** 4 * ridgeWave;
          crestDenominator += weight ** 3;
        }
      });
      const crest =
        mountain.ridges.length === 0
          ? 0.65
          : crestDenominator > 1e-12
            ? crestNumerator / crestDenominator
            : 0;
      const height = TERRAIN_RELIEF.mountainHeight[mountain.tier] * fade * (0.15 + 0.85 * crest);
      heights.set(key, height);
      return height;
    };
    heightFields.push((p) => (insidePolygon(p, mountain.mass) ? heightAt(p) : 0));
    const subdivide = (triangle: Triangle, remaining: number): void => {
      const [a, b, c] = triangle;
      if (remaining > 0) {
        const midpoint = (p: Point, q: Point): Point => ({
          x: (p.x + q.x) / 2,
          y: (p.y + q.y) / 2,
        });
        const ab = midpoint(a, b),
          bc = midpoint(b, c),
          ca = midpoint(c, a);
        for (const child of [
          [a, ab, ca],
          [ab, b, bc],
          [ca, bc, c],
          [ab, bc, ca],
        ] as Triangle[])
          subdivide(child, remaining - 1);
        return;
      }
      const hs = triangle.map(heightAt);
      const center = { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
      // Sample the continuous height field, not the ear-clipped triangle's planar normal.
      const epsilon = TERRAIN_RELIEF.hillNormalSample;
      const dx =
        (heightAt({ x: center.x + epsilon, y: center.y }) -
          heightAt({ x: center.x - epsilon, y: center.y })) /
        (2 * epsilon);
      const dy =
        (heightAt({ x: center.x, y: center.y + epsilon }) -
          heightAt({ x: center.x, y: center.y - epsilon })) /
        (2 * epsilon);
      const slope = Math.hypot(dx, dy);
      const illumination = Math.max(
        0.25,
        Math.min(1, (0.45 * dx + 0.55 * dy + 0.8) / Math.hypot(dx, dy, 1)),
      );
      const wooded = (terrain.forests ?? []).some((forest) =>
        insidePolygon(center, forest.polygon),
      );
      faces.push({
        mountainId: mountain.id,
        points: triangle.map((p, i) => lift(p, hs[i]!)),
        shade: wooded ? 'woodedHill' : 'hill',
        ground: triangle,
        heights: hs,
        illumination,
        elevation: heightAt(center) / TERRAIN_RELIEF.mountainHeight[mountain.tier],
        slope,
      });
      hillCount += 1;
    };
    for (const triangle of triangles) subdivide(triangle, depth);
  }
  // Forest color on slopes follows the same mesh. No opaque raised polygon covers hill crests.
  const groundHeight = (p: Point): number =>
    Math.max(0, ...heightFields.map((height) => height(p)));
  for (const cluster of buildForestCanopies(terrain)) {
    const { center, radius, height } = cluster;
    const base = [
      { x: center.x - radius, y: center.y },
      { x: center.x, y: center.y - radius },
      { x: center.x + radius, y: center.y },
      { x: center.x, y: center.y + radius },
    ].map((p) => lift(p, groundHeight(p)));
    const peak = lift(center, groundHeight(center) + height);
    const polygon = terrain.forests?.find((forest) => forest.id === cluster.forestId)?.polygon;
    if (!polygon || ![...base, peak].every((p) => insidePolygon(p, polygon))) continue;
    const mountainId = terrain.mountains?.find((mountain) =>
      insidePolygon(center, mountain.mass),
    )?.id;
    for (let i = 0; i < 4; i += 1) {
      faces.push({
        ...(mountainId === undefined ? {} : { mountainId }),
        forestId: cluster.forestId,
        points: [base[i]!, base[(i + 1) % 4]!, peak],
        shade: i < 2 ? 'forestLight' : 'forestDark',
      });
    }
  }
  return faces;
}

/** One static Graphics batch; no per-frame regeneration, resources owned by its container. */
export function createDimensionalTerrain(
  terrain: NonNullable<MapStaticData['terrain']>,
  rasterMountainIds: ReadonlySet<string> = new Set(),
  rasterForestIds: ReadonlySet<string> = new Set(),
): Container {
  const container = new Container();
  container.label = 'atlas-relief-2.5d';
  const gfx = new Graphics();
  container.addChild(gfx);
  drawDimensionalTerrain(gfx, terrain, rasterMountainIds, rasterForestIds);
  return container;
}

/** Shared actual draw path for the runtime batch and headless geometry diagnostics. */
export function drawDimensionalTerrain(
  gfx: Graphics,
  terrain: NonNullable<MapStaticData['terrain']>,
  rasterMountainIds: ReadonlySet<string> = new Set(),
  rasterForestIds: ReadonlySet<string> = new Set(),
): void {
  for (const face of buildReliefFaces(terrain)) {
    // Successful artwork replaces only its own mountain's visual faces/canopies.
    // Height samples, authored coordinates and fallback geometry remain unchanged.
    if (face.mountainId !== undefined && rasterMountainIds.has(face.mountainId)) continue;
    if (face.forestId !== undefined && rasterForestIds.has(face.forestId)) continue;
    const color = terrainFaceColor(face);
    gfx.poly(flat(face.points)).fill({ color, alpha: 1 });
    // Opaque, matching subpixel coverage prevents AA cracks between adjoining hill faces.
    // The static narrow stroke does not move heightfield vertices or gameplay anchors.
    if (face.ground !== undefined) gfx.stroke({ color, alpha: 1, width: 0.35, join: 'round' });
  }
}

/** Flat/zero-height hills match the actual tinted land; rock appears with elevation and slope. */
export function terrainFaceColor(face: ReliefFace): number {
  if (face.shade === 'forestLight')
    return mixColor(MAP_PALETTE_NUM.forestMoss, MAP_PALETTE_NUM.plainLight, 0.22);
  if (face.shade === 'forestDark')
    return mixColor(MAP_PALETTE_NUM.forestMoss, MAP_PALETTE_NUM.seaDeep, 0.35);
  const elevation = Math.max(0, Math.min(1, face.elevation ?? 0));
  const rock = elevation * elevation * Math.min(1, (face.slope ?? 0) * 1.3) * 0.45;
  const ground =
    face.shade === 'woodedHill'
      ? mixColor(TERRAIN_GROUND_COLOR, MAP_PALETTE_NUM.forestMoss, 0.35)
      : TERRAIN_GROUND_COLOR;
  const base = mixColor(ground, MAP_PALETTE_NUM.reliefInk, rock);
  const light = (face.illumination ?? 0.8) - 0.8;
  return light > 0
    ? mixColor(base, MAP_PALETTE_NUM.plainLight, light * 0.6)
    : mixColor(base, MAP_PALETTE_NUM.seaDeep, -light * 0.5);
}

function mixColor(a: number, b: number, factor: number): number {
  const channel = (shift: number): number =>
    Math.round(((a >> shift) & 255) * (1 - factor) + ((b >> shift) & 255) * factor);
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/**
 * relief／forest／territory 共用的烘焙紋理 Sprite（04 §3.10.1 圖層 1「terrainBase」）：鋪滿
 * `TERRAIN_SPRITE_WORLD`（4096）世界單位，左上角原點對齊世界座標 (0,0)。
 * `scaleMode`（linear）由呼叫端於 texture source 設定，本函式為純幾何建構。
 */
export function createTerrainSprite(texture: Texture): Sprite {
  const s = new Sprite(texture);
  s.position.set(0, 0);
  s.setSize(TERRAIN_SPRITE_WORLD, TERRAIN_SPRITE_WORLD);
  return s;
}

export type RiverRuntimeProbeOrder = 'retained-first' | 'canonical-first';
export type RiverRuntimeInspectionTiming = 'before' | 'after';
type RuntimeProbeRivers = ReadonlyArray<NonNullable<MapStaticData['terrain']>['rivers'][number]>;

/** Explicit same-realm diagnostic: observe actual inputs/import identity before either route. */
export function probeRiverRuntimeIdentity(
  retainedRivers: RuntimeProbeRivers,
  canonicalRivers: RuntimeProbeRivers,
  directProbe: typeof probeRiverSurfaceBoundsPair,
  retainedProbe: (
    firstId: string,
    secondId: string,
  ) => ReturnType<typeof probeRiverSurfaceBoundsPair>,
  firstId: string,
  secondId: string,
  order: RiverRuntimeProbeOrder,
  inspectionTiming: RiverRuntimeInspectionTiming = 'before',
) {
  if (order !== 'retained-first' && order !== 'canonical-first')
    throw new Error('Invalid river runtime probe order');
  if (inspectionTiming !== 'before' && inspectionTiming !== 'after')
    throw new Error('Invalid river runtime inspection timing');
  if (retainedRivers.length > 32 || canonicalRivers.length > 32) return null;
  const first = retainedRivers.find((river) => river.id === firstId);
  const second = retainedRivers.find((river) => river.id === secondId);
  const canonicalFirst = canonicalRivers.find((river) => river.id === firstId);
  const canonicalSecond = canonicalRivers.find((river) => river.id === secondId);
  if (!first || !second || !canonicalFirst || !canonicalSecond) return null;
  if (
    first.points.length > RIVER_SURFACE_LIMITS.maxPoints ||
    second.points.length > RIVER_SURFACE_LIMITS.maxPoints ||
    canonicalFirst.points.length > RIVER_SURFACE_LIMITS.maxPoints ||
    canonicalSecond.points.length > RIVER_SURFACE_LIMITS.maxPoints
  )
    return null;
  // Capture primitives in the same prefix in both modes. Rich evidence is
  // deliberately allocated either before or after both actual producer routes.
  const probeImportEqualsDirect = probeRiverSurfaceBoundsPair === directProbe;
  const firstRiverReferenceEqual = first === canonicalFirst;
  const secondRiverReferenceEqual = second === canonicalSecond;
  const firstPointsReferenceEqual = first.points === canonicalFirst.points;
  const secondPointsReferenceEqual = second.points === canonicalSecond.points;
  const firstCount = first.points.length;
  const secondCount = second.points.length;
  const canonicalFirstCount = canonicalFirst.points.length;
  const canonicalSecondCount = canonicalSecond.points.length;
  const firstWidth = RIVER_WIDTH[first.widthClass];
  const secondWidth = RIVER_WIDTH[second.widthClass];
  const canonicalFirstWidth = RIVER_WIDTH[canonicalFirst.widthClass];
  const canonicalSecondWidth = RIVER_WIDTH[canonicalSecond.widthClass];
  let pointReferencesEqual =
    firstCount === canonicalFirstCount && secondCount === canonicalSecondCount;
  let coordinateValuesEqual = pointReferencesEqual;
  let coordinateValuesFinite = true;
  for (let i = 0; i < Math.max(firstCount, canonicalFirstCount); i++) {
    const a = first.points[i];
    const b = canonicalFirst.points[i];
    pointReferencesEqual &&= a === b;
    coordinateValuesEqual &&= a?.x === b?.x && a?.y === b?.y;
    coordinateValuesFinite &&=
      Number.isFinite(a?.x) &&
      Number.isFinite(a?.y) &&
      Number.isFinite(b?.x) &&
      Number.isFinite(b?.y);
  }
  for (let i = 0; i < Math.max(secondCount, canonicalSecondCount); i++) {
    const a = second.points[i];
    const b = canonicalSecond.points[i];
    pointReferencesEqual &&= a === b;
    coordinateValuesEqual &&= a?.x === b?.x && a?.y === b?.y;
    coordinateValuesFinite &&=
      Number.isFinite(a?.x) &&
      Number.isFinite(a?.y) &&
      Number.isFinite(b?.x) &&
      Number.isFinite(b?.y);
  }
  const inspectPoints = (points: readonly { x: number; y: number }[]) =>
    Object.freeze({
      arrayPrototypeIsNative: Object.getPrototypeOf(points) === Array.prototype,
      frozen: Object.isFrozen(points),
      points: Object.freeze(
        points.map((point) =>
          Object.freeze({
            prototypeIsNative: Object.getPrototypeOf(point) === Object.prototype,
            frozen: Object.isFrozen(point),
            descriptors: Object.freeze(
              (['x', 'y'] as const).map((key) => {
                const descriptor = Object.getOwnPropertyDescriptor(point, key);
                return Object.freeze({
                  value: typeof descriptor?.value === 'number' ? descriptor.value : null,
                  data: descriptor !== undefined && 'value' in descriptor,
                  writable: descriptor?.writable === true,
                  configurable: descriptor?.configurable === true,
                  enumerable: descriptor?.enumerable === true,
                });
              }),
            ),
          }),
        ),
      ),
    });
  const captureIdentity = () =>
    Object.freeze({
      probeImportEqualsDirect: probeRiverSurfaceBoundsPair === directProbe,
      rivers: Object.freeze(
        [
          [first, canonicalFirst],
          [second, canonicalSecond],
        ].map(([retained, canonical]) => {
          const a = retained!;
          const b = canonical!;
          return Object.freeze({
            id: a.id,
            riverReferenceEqualsCanonical: a === b,
            pointsReferenceEqualsCanonical: a.points === b.points,
            pointReferencesEqual:
              a.points.length === b.points.length &&
              a.points.every((point, i) => point === b.points[i]),
            retainedWidth: RIVER_WIDTH[a.widthClass],
            canonicalWidth: RIVER_WIDTH[b.widthClass],
            retained: inspectPoints(a.points),
            canonical: inspectPoints(b.points),
          });
        }),
      ),
    });
  const identityBefore = inspectionTiming === 'before' ? captureIdentity() : null;
  const canonicalCall = () =>
    directProbe(
      canonicalFirst.points,
      RIVER_WIDTH[canonicalFirst.widthClass],
      canonicalSecond.points,
      RIVER_WIDTH[canonicalSecond.widthClass],
    );
  let retained: ReturnType<typeof probeRiverSurfaceBoundsPair>;
  let canonical: ReturnType<typeof probeRiverSurfaceBoundsPair>;
  if (order === 'retained-first') {
    retained = retainedProbe(firstId, secondId);
    canonical = canonicalCall();
  } else {
    canonical = canonicalCall();
    retained = retainedProbe(firstId, secondId);
  }
  const identityAfter = inspectionTiming === 'after' ? captureIdentity() : null;
  return Object.freeze({
    order,
    inspectionTiming,
    identityBefore,
    identityAfter,
    primitiveBefore: Object.freeze({
      probeImportEqualsDirect,
      firstRiverReferenceEqual,
      secondRiverReferenceEqual,
      firstPointsReferenceEqual,
      secondPointsReferenceEqual,
      firstCount,
      secondCount,
      canonicalFirstCount,
      canonicalSecondCount,
      firstWidth,
      secondWidth,
      canonicalFirstWidth,
      canonicalSecondWidth,
      pointReferencesEqual,
      coordinateValuesEqual,
      coordinateValuesFinite,
    }),
    retained,
    canonical,
  });
}

export interface WaterFeatures {
  readonly container: Container;
  getLakeGeometry(): readonly {
    readonly id: string;
    readonly points: readonly LakePoint[];
    readonly originalBounds: {
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    };
  }[];
  getMaterialDiagnostics(): Readonly<{
    ownedTextures: number;
    ownedSources: number;
    ownedStyleListeners: number;
    rgbaBytes: number;
    lakes: readonly Readonly<{
      id: string;
      width: number;
      height: number;
      rgbaBytes: number;
      kind: 'bankReflection' | 'solidFallback';
    }>[];
  }>;
  getRiverMaterialDiagnostics(): Readonly<{
    ownedMaskGraphics: number;
    ownedDisplayGraphics: number;
    ownedTextures: number;
    ownedSources: number;
    ownedStyleListeners: number;
    rgbaBytes: number;
    rivers: readonly Readonly<{
      id: string;
      widthClass: 1 | 2 | 3;
      points: readonly Readonly<{ x: number; y: number }>[];
      segments: readonly Readonly<{
        a: Readonly<{ x: number; y: number }>;
        b: Readonly<{ x: number; y: number }>;
        width: number;
      }>[];
      displaySegments: readonly RiverDisplaySegment[];
      curvedCorners: number;
      clipKind: 'originalCapsuleUnion' | 'certifiedDisplayCorridor' | 'none';
      corridorRadius: number;
      decisions: ReturnType<typeof buildNaturalDisplayRiver>['decisions'];
      width: number;
      height: number;
      rgbaBytes: number;
      kind: 'bankReflection' | 'solidFallback';
      bounds: Readonly<{ x: number; y: number; width: number; height: number }> | null;
    }>[];
  }>;
  getRiverBoundsTrace(
    getterOutputs?: readonly Readonly<{ id: string; bounds: RiverSurfaceBounds | null }>[],
  ): readonly Readonly<
    Partial<
      ReturnType<NonNullable<ReturnType<typeof createRiverSurfaceMaterial>>['getBoundsTrace']>
    > & {
      id: string;
      widthClass: 1 | 2 | 3;
      entryBounds: RiverBoundsTuple | null;
      getterBounds: RiverBoundsTuple | null;
      entryFrozen: boolean;
      getterFrozen: boolean;
      materialEqualsEntry: boolean;
      sharedEntryBoundsWith: readonly string[];
      terrainAtRetention: ReturnType<typeof inspectRiverBounds> | null;
      terrainBeforePaint: ReturnType<typeof inspectRiverBounds> | null;
      terrainAfterPaint: ReturnType<typeof inspectRiverBounds> | null;
      terrainAtNextLoop: ReturnType<typeof inspectRiverBounds> | null;
      terrainBeforeNextFactory: ReturnType<typeof inspectRiverBounds> | null;
      checkpointIdentities: readonly boolean[];
      terrainNextFactoryStages: readonly Readonly<{
        stage: RiverMaterialFactoryStage;
        bounds: ReturnType<typeof inspectRiverBounds>;
        sameReference: boolean;
      }>[];
      terrainAfterNextMaterial: ReturnType<typeof inspectRiverBounds> | null;
      nextMaterialId: string | null;
      retentionEqualsMaterial: boolean;
      afterNextEqualsRetention: boolean;
    }
  >[];
  getRiverPureBoundsProbe(
    firstId: string,
    secondId: string,
  ): ReturnType<typeof probeRiverSurfaceBoundsPair>;
  getRiverRuntimeIdentityProbe(
    firstId: string,
    secondId: string,
    order: RiverRuntimeProbeOrder,
    canonicalRivers: RuntimeProbeRivers,
    directProbe: typeof probeRiverSurfaceBoundsPair,
    inspectionTiming?: RiverRuntimeInspectionTiming,
  ): ReturnType<typeof probeRiverRuntimeIdentity>;
  setStage(stage: LodStage): void;
  destroy(): void;
}

function flat(points: ReadonlyArray<{ x: number; y: number }>): number[] {
  const out: number[] = [];
  for (const p of points) out.push(p.x, p.y);
  return out;
}

/** 依 `widthClass` 選出對應 river `Graphics`（3/2/1）。 */
function riverGraphicsFor(
  widthClass: 1 | 2 | 3,
  g3: Graphics,
  g2: Graphics,
  g1: Graphics,
): Graphics {
  if (widthClass === 3) return g3;
  if (widthClass === 2) return g2;
  return g1;
}

/**
 * 建 `waterFeatures`：湖（多邊形 fill＋stroke，恆顯）＋三個 widthClass `Graphics`
 * （far 僅顯 3／mid 顯 3,2／near 全顯）。init 一次建立幾何，LOD 只切 `visible`
 * （河湖形狀整局不變，04 §3.10.1／M6-V5 §3.3）。
 */
export function createWaterFeatures(
  rivers: Rivers,
  lakes: Lakes,
  bridgeFootprints: readonly RiverKeepout[] | null = [],
  displayConstraints: RiverDisplayConstraints | null = null,
): WaterFeatures {
  const container = new Container();
  const lakeGfx = new Graphics();
  const riverGfx3 = new Graphics();
  const riverGfx2 = new Graphics();
  const riverGfx1 = new Graphics();
  container.addChild(lakeGfx);
  container.addChild(riverGfx3);
  container.addChild(riverGfx2);
  container.addChild(riverGfx1);

  const lakeGeometry = Object.freeze(
    lakes.map((lake) => {
      const xs = lake.polygon.map((point) => point.x),
        ys = lake.polygon.map((point) => point.y);
      const x = Math.min(...xs),
        y = Math.min(...ys);
      return Object.freeze({
        id: lake.id,
        points: buildDisplayLake(lake.polygon, rivers),
        originalBounds: Object.freeze({
          x,
          y,
          width: Math.max(...xs) - x,
          height: Math.max(...ys) - y,
        }),
      });
    }),
  );
  const materials: NonNullable<ReturnType<typeof createLakeSurfaceMaterial>>[] = [];
  const materialInfo: {
    id: string;
    width: number;
    height: number;
    rgbaBytes: number;
    kind: 'bankReflection' | 'solidFallback';
  }[] = [];
  for (const lake of lakeGeometry) {
    const pts = flat(lake.points);
    const material =
      materials.length < LAKE_SURFACE.material.maxLakes
        ? createLakeSurfaceMaterial(lake.points)
        : null;
    if (material) materials.push(material);
    materialInfo.push({
      id: lake.id,
      width: material?.width ?? 0,
      height: material?.height ?? 0,
      rgbaBytes: material?.rgbaBytes ?? 0,
      kind: material ? 'bankReflection' : 'solidFallback',
    });
    lakeGfx
      .poly(pts)
      .fill(
        material
          ? { texture: material.texture, textureSpace: 'local' }
          : { color: LAKE_SURFACE.material.interiorColor },
      );
    lakeGfx.poly(pts).stroke({ ...LAKE_SURFACE.outline });
    // Pixi alignment=1 keeps both quiet shore tones inside the display lake.
    // Canonical geography stays unchanged; no offset shadow expands the display boundary.
    lakeGfx.poly(pts).stroke({
      ...LAKE_SURFACE.innerDark,
      alignment: 1,
      join: 'round',
    });
    lakeGfx.poly(pts).stroke({
      ...LAKE_SURFACE.innerLight,
      alignment: 1,
      join: 'round',
    });
  }

  const sortedRivers = [...rivers].sort((a, b) => a.id.localeCompare(b.id));
  const riverMaterials: NonNullable<ReturnType<typeof createRiverSurfaceMaterial>>[] = [];
  const riverBoundsMaterials = new Map<
    string,
    NonNullable<ReturnType<typeof createRiverSurfaceMaterial>>
  >();
  const riverBoundsCheckpoints = new Map<
    string,
    {
      reference: RiverSurfaceBounds;
      retained: ReturnType<typeof inspectRiverBounds>;
      beforePaint: ReturnType<typeof inspectRiverBounds> | null;
      afterPaint: ReturnType<typeof inspectRiverBounds> | null;
      nextLoop: ReturnType<typeof inspectRiverBounds> | null;
      beforeNextFactory: ReturnType<typeof inspectRiverBounds> | null;
      identities: boolean[];
      factoryStages: {
        stage: RiverMaterialFactoryStage;
        bounds: ReturnType<typeof inspectRiverBounds>;
        sameReference: boolean;
      }[];
      afterNext: ReturnType<typeof inspectRiverBounds> | null;
      nextId: string | null;
      afterNextSameReference: boolean;
    }
  >();
  let previousMaterialId: string | null = null;
  let ownedRiverClips = 0;
  const riverInfo: ReturnType<WaterFeatures['getRiverMaterialDiagnostics']>['rivers'][number][] =
    [];
  for (const river of sortedRivers) {
    if (previousMaterialId !== null) {
      const previous = riverBoundsMaterials.get(previousMaterialId)!;
      const checkpoint = riverBoundsCheckpoints.get(previousMaterialId)!;
      checkpoint.nextLoop = inspectRiverBounds(previous.bounds);
      checkpoint.identities.push(previous.bounds === checkpoint.reference);
    }
    const gfx = riverGraphicsFor(river.widthClass, riverGfx3, riverGfx2, riverGfx1);
    const baseWidth = RIVER_WIDTH[river.widthClass];
    // Regional opt-in only; the existing solver independently certifies each
    // interior leg and retains full protected first/last/contact capsules.
    const naturalEnabled = river.id === 'rv.kiso' || river.id === 'rv.shinano';
    const naturalConstraints =
      naturalEnabled && displayConstraints
        ? {
            boundaryPolygons: displayConstraints.boundaryPolygons,
            obstacles: [
              ...displayConstraints.obstacles,
              ...rivers
                .filter((other) => other.id !== river.id)
                .flatMap((other) =>
                  buildDisplayRiver(
                    other.points,
                    RIVER_WIDTH[other.widthClass],
                    null,
                  ).rawSegments.map((s) => ({ a: s.a, b: s.b, radius: s.width / 2 })),
                ),
            ],
          }
        : null;
    const natural =
      naturalEnabled && displayConstraints
        ? buildNaturalDisplayRiver(
            river.points,
            baseWidth,
            bridgeFootprints,
            naturalConstraints,
            [...lakes.map((l) => l.polygon), ...lakeGeometry.map((l) => l.points)],
            { composePinnedJunctions: river.id === 'rv.shinano' },
          )
        : null;
    const geometry = natural?.corridorRadius
      ? natural
      : buildDisplayRiver(river.points, baseWidth, bridgeFootprints);
    const corridorRadius = natural?.corridorRadius ?? 0;
    if (previousMaterialId !== null) {
      const previous = riverBoundsMaterials.get(previousMaterialId)!;
      const checkpoint = riverBoundsCheckpoints.get(previousMaterialId)!;
      checkpoint.beforeNextFactory = inspectRiverBounds(previous.bounds);
      checkpoint.identities.push(previous.bounds === checkpoint.reference);
    }
    const observedPreviousMaterialId = previousMaterialId;
    const material =
      riverMaterials.length < RIVER_SURFACE_LIMITS.maxRivers
        ? createRiverSurfaceMaterial(
            river.points,
            baseWidth,
            undefined,
            corridorRadius ? geometry.displaySegments : undefined,
            observedPreviousMaterialId !== null
              ? (stage) => {
                  const previous = riverBoundsMaterials.get(observedPreviousMaterialId)!;
                  const checkpoint = riverBoundsCheckpoints.get(observedPreviousMaterialId)!;
                  if (checkpoint.factoryStages.length >= 9) return;
                  checkpoint.factoryStages.push(
                    Object.freeze({
                      stage,
                      bounds: inspectRiverBounds(previous.bounds),
                      sameReference: previous.bounds === checkpoint.reference,
                    }),
                  );
                }
              : undefined,
          )
        : null;
    if (material) {
      // Observe each previous original object once after the next material has
      // been constructed; no copies replace public bounds or mapping inputs.
      if (previousMaterialId !== null) {
        const previous = riverBoundsMaterials.get(previousMaterialId)!;
        const checkpoint = riverBoundsCheckpoints.get(previousMaterialId)!;
        checkpoint.afterNext = inspectRiverBounds(previous.bounds);
        checkpoint.nextId = river.id;
        checkpoint.afterNextSameReference = previous.bounds === checkpoint.reference;
      }
      riverBoundsCheckpoints.set(river.id, {
        reference: material.bounds,
        retained: inspectRiverBounds(material.bounds),
        beforePaint: null,
        afterPaint: null,
        nextLoop: null,
        beforeNextFactory: null,
        identities: [],
        factoryStages: [],
        afterNext: null,
        nextId: null,
        afterNextSameReference: false,
      });
      riverMaterials.push(material);
      riverBoundsMaterials.set(river.id, material);
      previousMaterialId = river.id;
    }
    if (material) {
      const checkpoint = riverBoundsCheckpoints.get(river.id)!;
      checkpoint.beforePaint = inspectRiverBounds(material.bounds);
      checkpoint.identities.push(material.bounds === checkpoint.reference);
    }
    const clipped = geometry.curvedCorners > 0 && ownedRiverClips < RIVER_SURFACE_LIMITS.maxRivers;
    let paint = gfx;
    if (clipped) {
      const group = new Container();
      group.label = `river-display:${river.id}`;
      group.eventMode = 'none';
      paint = new Graphics();
      paint.label = `river-paint:${river.id}`;
      paint.eventMode = 'none';
      const clip = new Graphics();
      clip.label = `river-original-capsule-mask:${river.id}`;
      clip.eventMode = 'none';
      for (const segment of geometry.rawSegments)
        clip
          .moveTo(segment.a.x, segment.a.y)
          .lineTo(segment.b.x, segment.b.y)
          .stroke({
            width: segment.width + corridorRadius * 2,
            color: 0xffffff,
            cap: 'round',
            join: 'round',
          });
      group.addChild(paint);
      group.addChild(clip);
      group.mask = clip;
      gfx.addChild(group);
      ownedRiverClips++;
    }
    const displaySegments = clipped ? geometry.displaySegments : geometry.rawSegments;
    const paths: { points: { x: number; y: number }[]; width: number; sourceSegment: number }[] =
      [];
    for (const segment of displaySegments) {
      const previous = paths.at(-1);
      if (corridorRadius && previous?.sourceSegment === segment.sourceSegment)
        previous.points.push(segment.b);
      else
        paths.push({
          points: [segment.a, segment.b],
          width: segment.width,
          sourceSegment: segment.sourceSegment,
        });
    }
    for (const path of paths) {
      paint.moveTo(path.points[0]!.x, path.points[0]!.y);
      for (const p of path.points.slice(1)) paint.lineTo(p.x, p.y);
      paint.stroke({
        width: path.width,
        ...(material
          ? {
              color: 0xffffff,
              texture: material.texture,
              textureSpace: 'global' as const,
              matrix: material.matrix,
            }
          : { color: MAP_PALETTE_NUM.waterRiver }),
        cap: 'round',
        join: 'round',
      });
    }
    if (material) {
      const checkpoint = riverBoundsCheckpoints.get(river.id)!;
      checkpoint.afterPaint = inspectRiverBounds(material.bounds);
      checkpoint.identities.push(material.bounds === checkpoint.reference);
    }
    riverInfo.push({
      id: river.id,
      widthClass: river.widthClass,
      points: river.points.map((point) => ({ ...point })),
      segments: geometry.rawSegments,
      displaySegments,
      curvedCorners: clipped ? geometry.curvedCorners : 0,
      clipKind: clipped
        ? corridorRadius
          ? 'certifiedDisplayCorridor'
          : 'originalCapsuleUnion'
        : 'none',
      corridorRadius: clipped ? corridorRadius : 0,
      decisions: natural?.decisions ?? Object.freeze([]),
      width: material?.width ?? 0,
      height: material?.height ?? 0,
      rgbaBytes: material?.rgbaBytes ?? 0,
      kind: material ? 'bankReflection' : 'solidFallback',
      bounds: material?.bounds ?? null,
    });
  }

  function setStage(stage: LodStage): void {
    riverGfx3.visible = true;
    riverGfx2.visible = stage !== 'far';
    riverGfx1.visible = stage === 'near';
    lakeGfx.visible = true;
  }

  let destroyed = false;
  function destroy(): void {
    if (destroyed) return;
    destroyed = true;
    container.destroy({ children: true, context: true, texture: false, textureSource: false });
    for (const material of materials) material.destroy();
    for (const material of riverMaterials) material.destroy();
  }

  const getRiverPureBoundsProbe: WaterFeatures['getRiverPureBoundsProbe'] = (firstId, secondId) => {
    if (destroyed) return null;
    const first = sortedRivers.find((river) => river.id === firstId);
    const second = sortedRivers.find((river) => river.id === secondId);
    return first && second
      ? probeRiverSurfaceBoundsPair(
          first.points,
          RIVER_WIDTH[first.widthClass],
          second.points,
          RIVER_WIDTH[second.widthClass],
        )
      : null;
  };
  return {
    container,
    setStage,
    destroy,
    getLakeGeometry: () => lakeGeometry,
    getRiverPureBoundsProbe,
    getRiverRuntimeIdentityProbe: (
      firstId,
      secondId,
      order,
      canonicalRivers,
      directProbe,
      inspectionTiming,
    ) =>
      destroyed
        ? null
        : probeRiverRuntimeIdentity(
            sortedRivers,
            canonicalRivers,
            directProbe,
            getRiverPureBoundsProbe,
            firstId,
            secondId,
            order,
            inspectionTiming,
          ),
    getRiverBoundsTrace: (getterOutputs) =>
      Object.freeze(
        riverInfo.map((entry) => {
          const material = riverBoundsMaterials.get(entry.id);
          const checkpoint = riverBoundsCheckpoints.get(entry.id);
          // The caller supplies the original result from its single getter call;
          // never repeat the getter here or normalize a mismatching output.
          const output = getterOutputs?.find((row) => row.id === entry.id)?.bounds ?? null;
          return Object.freeze({
            ...material?.getBoundsTrace(material.bounds),
            id: entry.id,
            widthClass: entry.widthClass,
            entryBounds: entry.bounds ? riverBoundsTuple(entry.bounds) : null,
            getterBounds: output ? riverBoundsTuple(output) : null,
            entryFrozen: entry.bounds !== null && Object.isFrozen(entry.bounds),
            getterFrozen: output !== null && Object.isFrozen(output),
            materialEqualsEntry: material !== undefined && material.bounds === entry.bounds,
            terrainAtRetention: checkpoint?.retained ?? null,
            terrainBeforePaint: checkpoint?.beforePaint ?? null,
            terrainAfterPaint: checkpoint?.afterPaint ?? null,
            terrainAtNextLoop: checkpoint?.nextLoop ?? null,
            terrainBeforeNextFactory: checkpoint?.beforeNextFactory ?? null,
            checkpointIdentities: Object.freeze([...(checkpoint?.identities ?? [])]),
            terrainNextFactoryStages: Object.freeze([...(checkpoint?.factoryStages ?? [])]),
            terrainAfterNextMaterial: checkpoint?.afterNext ?? null,
            nextMaterialId: checkpoint?.nextId ?? null,
            retentionEqualsMaterial:
              material !== undefined && checkpoint?.reference === material.bounds,
            afterNextEqualsRetention: checkpoint?.afterNextSameReference ?? false,
            sharedEntryBoundsWith: Object.freeze(
              riverInfo
                .filter(
                  (other) =>
                    other.id !== entry.id && entry.bounds !== null && other.bounds === entry.bounds,
                )
                .map((other) => other.id),
            ),
          });
        }),
      ),
    getRiverMaterialDiagnostics: () =>
      Object.freeze({
        ownedMaskGraphics: destroyed ? 0 : ownedRiverClips,
        ownedDisplayGraphics: destroyed ? 0 : ownedRiverClips,
        ownedTextures: destroyed ? 0 : riverMaterials.length,
        ownedSources: destroyed ? 0 : riverMaterials.length,
        ownedStyleListeners: destroyed ? 0 : riverMaterials.length,
        rgbaBytes: destroyed
          ? 0
          : riverMaterials.reduce((bytes, material) => bytes + material.rgbaBytes, 0),
        rivers: Object.freeze(
          riverInfo.map((entry) =>
            Object.freeze({
              ...entry,
              points: Object.freeze(entry.points.map((point) => Object.freeze({ ...point }))),
              segments: Object.freeze(
                entry.segments.map((segment) =>
                  Object.freeze({
                    ...segment,
                    a: Object.freeze({ ...segment.a }),
                    b: Object.freeze({ ...segment.b }),
                  }),
                ),
              ),
              bounds: entry.bounds ? Object.freeze({ ...entry.bounds }) : null,
            }),
          ),
        ),
      }),
    getMaterialDiagnostics: () =>
      Object.freeze({
        ownedTextures: destroyed ? 0 : materials.length,
        ownedSources: destroyed ? 0 : materials.length,
        ownedStyleListeners: destroyed ? 0 : materials.length,
        rgbaBytes: destroyed
          ? 0
          : materials.reduce((bytes, material) => bytes + material.rgbaBytes, 0),
        lakes: Object.freeze(materialInfo.map((entry) => Object.freeze({ ...entry }))),
      }),
  };
}
