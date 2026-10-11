import type { MapGraph } from '@core/state/mapGraph';
import { pointInPolygon, signedArea } from '@data/map/outlineGeometry';
import type { OutlineGeometry } from './displayCoast';
import { edgeVisualPolyline, type RoadPoint } from './roads/roadGeometry';
import { BRIDGE_DISPLAY_SCALE, ROAD_MATERIAL } from './roads/roadMaterial';
import {
  BRIDGE,
  ROAD_CASING_WIDTH,
  ROAD_GROUND_STYLE,
  ROAD_INNER_WIDTH,
  ROAD_DEPTH_STYLE,
  ROAD_STAGE_WIDTH_MULT,
  RIVER_WIDTH,
  RIVER_TAPER_HEAD,
  SEA_ROUTE_WIDTH,
  SEA_WAVE,
  WORLD_SIZE,
} from './mapViewConfig';

/** Display approximation only. The removed/added region stays inside a guarded corner triangle. */
export const CONSTRAINED_COAST = {
  maxRun: 24,
  adjacentFraction: 0.4,
  steps: 8,
  minRun: 0.25,
  inputPoints: 1024,
  outputPoints: 4096,
  footprints: 20_000,
  indexEntries: 200_000,
  visits: 2_000_000,
  maxDisplacement: 12,
} as const;
export interface CoastCapsule {
  readonly id: string;
  readonly a: RoadPoint;
  readonly b: RoadPoint;
  readonly radius: number;
}
export interface ConstrainedRiver {
  readonly id?: string;
  readonly points: readonly RoadPoint[];
  readonly widthClass?: 1 | 2 | 3;
}
type Triangle = readonly [RoadPoint, RoadPoint, RoadPoint];
interface AcceptedTriangle extends CoastCapsule {
  readonly triangle: Triangle;
  readonly order: number;
}
export interface ConstrainedCoastWork {
  readonly acceptedTriangleComparisons: number;
  readonly acceptedIndexEntries: number;
}
const buildWork = new WeakMap<OutlineGeometry, ConstrainedCoastWork>();
/** Build-only CPU work observation; never persisted or consulted for geometry decisions. */
export function getConstrainedCoastWork(geometry: OutlineGeometry): ConstrainedCoastWork | null {
  return buildWork.get(geometry) ?? null;
}
const cross = (a: RoadPoint, b: RoadPoint, p: RoadPoint) =>
  (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
const finite = (p: RoadPoint) =>
  Number.isFinite(p.x) &&
  Number.isFinite(p.y) &&
  p.x >= 0 &&
  p.y >= 0 &&
  p.x <= WORLD_SIZE &&
  p.y <= WORLD_SIZE;
const freeze = (polygons: OutlineGeometry['polygons']): OutlineGeometry =>
  Object.freeze({
    polygons: Object.freeze(
      polygons.map((p) => Object.freeze({ id: p.id, points: Object.freeze([...p.points]) })),
    ),
  });
function segmentDistance(p: RoadPoint, a: RoadPoint, b: RoadPoint) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
  );
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function onSegment(p: RoadPoint, a: RoadPoint, b: RoadPoint) {
  return (
    cross(a, b, p) === 0 &&
    p.x >= Math.min(a.x, b.x) &&
    p.x <= Math.max(a.x, b.x) &&
    p.y >= Math.min(a.y, b.y) &&
    p.y <= Math.max(a.y, b.y)
  );
}
function segmentIntersects(a: RoadPoint, b: RoadPoint, c: RoadPoint, d: RoadPoint) {
  const x = cross(a, b, c),
    y = cross(a, b, d),
    u = cross(c, d, a),
    v = cross(c, d, b);
  return (
    (((x > 0 && y < 0) || (x < 0 && y > 0)) && ((u > 0 && v < 0) || (u < 0 && v > 0))) ||
    onSegment(c, a, b) ||
    onSegment(d, a, b) ||
    onSegment(a, c, d) ||
    onSegment(b, c, d)
  );
}
function inTriangle(p: RoadPoint, t: Triangle) {
  const signs = [cross(t[0], t[1], p), cross(t[1], t[2], p), cross(t[2], t[0], p)];
  return signs.every((v) => v >= 0) || signs.every((v) => v <= 0);
}
/** Continuous capsule/triangle test, including containment and boundary contact; no sampling oracle. */
export function coastTriangleTouchesCapsule(t: Triangle, c: CoastCapsule): boolean {
  if (inTriangle(c.a, t) || inTriangle(c.b, t)) return true;
  for (let i = 0; i < 3; i++) {
    const a = t[i]!,
      b = t[(i + 1) % 3]!;
    if (
      segmentIntersects(a, b, c.a, c.b) ||
      Math.min(
        segmentDistance(a, c.a, c.b),
        segmentDistance(b, c.a, c.b),
        segmentDistance(c.a, a, b),
        segmentDistance(c.b, a, b),
      ) <= c.radius
    )
      return true;
  }
  return false;
}

function bridgePaintRadius(): number {
  const scale = Math.max(BRIDGE_DISPLAY_SCALE.mid, BRIDGE_DISPLAY_SCALE.near);
  return (
    scale *
    (Math.hypot(BRIDGE.deckLength / 2 + BRIDGE.abutment, BRIDGE.deckWidth / 2) +
      Math.max(
        ROAD_DEPTH_STYLE.bridgeLift + ROAD_DEPTH_STYLE.bridgeRailHeight + 0.5,
        Math.SQRT2 * ROAD_DEPTH_STYLE.shadowOffset,
      ))
  );
}

export function collectRiverBridgeFootprints(graph: MapGraph): readonly CoastCapsule[] | null {
  if (graph.edges.size > CONSTRAINED_COAST.footprints) return null;
  const radius = bridgePaintRadius();
  if (!Number.isFinite(radius) || radius < 0 || radius > 96) return null;
  const result: CoastCapsule[] = [];
  for (const edge of graph.edges.values()) {
    const bridges = edge.bridges;
    if (bridges === undefined) continue;
    if (
      !Array.isArray(bridges) ||
      bridges.length % 2 !== 0 ||
      bridges.length / 2 > CONSTRAINED_COAST.footprints - result.length
    )
      return null;
    for (let i = 0; i < bridges.length; i += 2) {
      const x: unknown = bridges[i],
        y: unknown = bridges[i + 1];
      if (typeof x !== 'number' || typeof y !== 'number') return null;
      const point = { x, y };
      if (!finite(point)) return null;
      const center = Object.freeze(point);
      result.push(Object.freeze({ id: `bridge:${edge.id}`, a: center, b: center, radius }));
    }
  }
  return Object.freeze(result);
}

/** Actual maximum paint envelopes, not a generic coastal exclusion margin. */
export function collectCoastFootprints(
  graph: MapGraph,
  rivers: readonly ConstrainedRiver[] = [],
): readonly CoastCapsule[] | null {
  const result: CoastCapsule[] = [];
  const add = (id: string, a: RoadPoint, b: RoadPoint, radius: number) => {
    if (
      !finite(a) ||
      !finite(b) ||
      !Number.isFinite(radius) ||
      radius < 0 ||
      radius > 96 ||
      result.length >= CONSTRAINED_COAST.footprints
    )
      return false;
    result.push(
      Object.freeze({ id, a: Object.freeze({ ...a }), b: Object.freeze({ ...b }), radius }),
    );
    return true;
  };
  for (const node of graph.nodes.values())
    if (!add(`node:${node.id}`, node.pos, node.pos, 0)) return null;
  for (const edge of graph.edges.values()) {
    const points = edgeVisualPolyline(edge, graph);
    if (!points) return null;
    const grade = edge.grade,
      factor = ROAD_MATERIAL.landWidthFactor;
    const landRadius = Math.max(
      (ROAD_CASING_WIDTH[grade] * ROAD_STAGE_WIDTH_MULT.far * factor) / 2,
      ((ROAD_CASING_WIDTH[grade] + ROAD_GROUND_STYLE.vergeExtraWidth) *
        ROAD_STAGE_WIDTH_MULT.mid *
        factor) /
        2,
      ROAD_INNER_WIDTH[grade] * ROAD_STAGE_WIDTH_MULT.mid * ROAD_GROUND_STYLE.grainHalfWidthFactor +
        (ROAD_GROUND_STYLE.grainStrokeWidth * ROAD_STAGE_WIDTH_MULT.mid * factor) / 2,
    );
    const seaRadius = (SEA_ROUTE_WIDTH.outer * ROAD_STAGE_WIDTH_MULT.far) / 2;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!,
        b = points[i]!;
      if (!add(`road:${edge.id}`, a, b, edge.type === 'land' ? landRadius : seaRadius)) return null;
      if (edge.type === 'land') {
        // Near-only shifted shadow/highlight; mid uses ground verge, far has no shifted strokes.
        const offset = ROAD_DEPTH_STYLE.shadowOffset * ROAD_STAGE_WIDTH_MULT.near;
        if (
          !add(
            `shadow:${edge.id}`,
            { x: a.x + offset, y: a.y + offset },
            { x: b.x + offset, y: b.y + offset },
            (ROAD_CASING_WIDTH[grade] * factor) / 2,
          )
        )
          return null;
        if (
          grade > 1 &&
          !add(
            `highlight:${edge.id}`,
            { x: a.x - 0.25, y: a.y - 0.25 },
            { x: b.x - 0.25, y: b.y - 0.25 },
            (0.45 * factor) / 2,
          )
        )
          return null;
      }
    }
    if (edge.type === 'sea') {
      // Match drawSeaRoute's cumulative fixed spacing at every LOD. Protect even suppressed
      // wave centers, retaining their sea/land classification, without inventing waves
      // between actual centers. Each disk encloses the complete arc and its stroke.
      for (const stage of ['far', 'mid', 'near'] as const) {
        const m = ROAD_STAGE_WIDTH_MULT[stage],
          spacing = SEA_WAVE.spacing * m;
        let nextAt = spacing,
          dist = 0;
        for (let i = 0; i < points.length - 1; i++) {
          const a = points[i]!,
            b = points[i + 1]!,
            len = Math.hypot(b.x - a.x, b.y - a.y);
          if (len === 0) continue;
          const ux = (b.x - a.x) / len,
            uy = (b.y - a.y) / len;
          while (nextAt <= dist + len) {
            const local = nextAt - dist,
              p = { x: a.x + ux * local, y: a.y + uy * local };
            if (!add(`wave:${edge.id}:${stage}`, p, p, SEA_WAVE.radius * m + m / 2)) return null;
            nextAt += spacing;
          }
          dist += len;
        }
      }
    }
    // All deck/abut corners, lifted rails, stroke half-width, and translated ground shadow.
    const bridgeRadius = bridgePaintRadius();
    for (let i = 0; i + 1 < (edge.bridges?.length ?? 0); i += 2) {
      const p = { x: edge.bridges![i]!, y: edge.bridges![i + 1]! };
      if (!add(`bridge:${edge.id}`, p, p, bridgeRadius)) return null;
    }
  }
  for (const river of rivers) {
    const n = river.points.length - 1,
      width = RIVER_WIDTH[river.widthClass ?? 3];
    for (let i = 0; i < n; i++) {
      const taper = n > 1 ? RIVER_TAPER_HEAD + ((1 - RIVER_TAPER_HEAD) * i) / (n - 1) : 1;
      if (
        !add(`river:${river.id ?? ''}`, river.points[i]!, river.points[i + 1]!, (width * taper) / 2)
      )
        return null;
    }
  }
  return Object.freeze(result);
}

interface Shore extends CoastCapsule {
  readonly polygon: number;
  readonly index: number;
  readonly count: number;
}
function shores(geometry: OutlineGeometry): Shore[] {
  return geometry.polygons.flatMap((p, polygon) =>
    Array.from({ length: p.points.length / 2 }, (_, index) => ({
      id: `coast:${polygon}:${index}`,
      polygon,
      index,
      count: p.points.length / 2,
      radius: 0,
      a: { x: p.points[index * 2]!, y: p.points[index * 2 + 1]! },
      b: {
        x: p.points[((index + 1) % (p.points.length / 2)) * 2]!,
        y: p.points[((index + 1) % (p.points.length / 2)) * 2 + 1]!,
      },
    })),
  );
}
function normalize(input: OutlineGeometry): OutlineGeometry | null {
  const ids = new Set<string>();
  let count = 0;
  if (input.polygons.length > 16) return null;
  const result: { id: string; points: number[] }[] = [];
  for (const poly of input.polygons) {
    if (ids.has(poly.id) || poly.points.length % 2) return null;
    ids.add(poly.id);
    count += poly.points.length / 2;
    if (count > CONSTRAINED_COAST.inputPoints) return null;
    const points: number[] = [];
    for (let i = 0; i < poly.points.length; i += 2) {
      const x = poly.points[i]!,
        y = poly.points[i + 1]!;
      if (!finite({ x, y })) return null;
      if (x !== points.at(-2) || y !== points.at(-1)) points.push(x, y);
    }
    if (points[0] === points.at(-2) && points[1] === points.at(-1)) points.splice(-2);
    if (points.length < 6 || signedArea(points) === 0) return null;
    result.push({ id: poly.id, points });
  }
  return freeze(result);
}
/** Spatially bounded segment index; over-budget inputs fail closed. */
function index<T extends CoastCapsule>(items: readonly T[]) {
  const buckets = new Map<string, T[]>();
  let entries = 0;
  for (const c of items)
    for (
      let y = Math.floor((Math.min(c.a.y, c.b.y) - c.radius) / 32);
      y <= Math.floor((Math.max(c.a.y, c.b.y) + c.radius) / 32);
      y++
    )
      for (
        let x = Math.floor((Math.min(c.a.x, c.b.x) - c.radius) / 32);
        x <= Math.floor((Math.max(c.a.x, c.b.x) + c.radius) / 32);
        x++
      ) {
        if (++entries > CONSTRAINED_COAST.indexEntries) return null;
        const key = `${x},${y}`,
          list = buckets.get(key) ?? [];
        list.push(c);
        buckets.set(key, list);
      }
  return buckets;
}
function nearby<T>(buckets: Map<string, T[]>, points: readonly RoadPoint[]) {
  const result = new Set<T>();
  for (
    let y = Math.floor(Math.min(...points.map((p) => p.y)) / 32);
    y <= Math.floor(Math.max(...points.map((p) => p.y)) / 32);
    y++
  )
    for (
      let x = Math.floor(Math.min(...points.map((p) => p.x)) / 32);
      x <= Math.floor(Math.max(...points.map((p) => p.x)) / 32);
      x++
    )
      for (const item of buckets.get(`${x},${y}`) ?? []) result.add(item);
  return result;
}
function topology(geometry: OutlineGeometry) {
  const edges = shores(geometry),
    buckets = index(edges);
  if (!buckets) return false;
  let visits = 0;
  for (const edge of edges)
    for (const other of nearby(buckets, [edge.a, edge.b])) {
      if (++visits > CONSTRAINED_COAST.visits) return false;
      if (
        edge === other ||
        (edge.polygon === other.polygon &&
          (Math.abs(edge.index - other.index) === 1 ||
            Math.abs(edge.index - other.index) === edge.count - 1))
      )
        continue;
      if (segmentIntersects(edge.a, edge.b, other.a, other.b)) return false;
    }
  for (let i = 0; i < geometry.polygons.length; i++)
    for (let j = i + 1; j < geometry.polygons.length; j++) {
      const a = geometry.polygons[i]!.points,
        b = geometry.polygons[j]!.points;
      if (pointInPolygon(a[0]!, a[1]!, b) || pointInPolygon(b[0]!, b[1]!, a)) return false;
    }
  return true;
}

export function roundConstrainedCoast(
  input: OutlineGeometry,
  footprints: readonly CoastCapsule[],
): OutlineGeometry {
  const raw = normalize(input);
  if (!raw || !topology(raw)) return freeze([]);
  if (
    footprints.length > CONSTRAINED_COAST.footprints ||
    footprints.some(
      (c) =>
        !finite(c.a) || !finite(c.b) || !Number.isFinite(c.radius) || c.radius < 0 || c.radius > 96,
    )
  )
    return raw;
  const shore = shores(raw),
    shoreIndex = index(shore),
    footprintIndex = index(footprints);
  if (!shoreIndex || !footprintIndex) return raw;
  const acceptedIndex = new Map<string, AcceptedTriangle[]>(),
    polygons: { id: string; points: number[] }[] = [];
  let acceptedCount = 0,
    acceptedIndexEntries = 0,
    acceptedTriangleComparisons = 0;
  // Reserve every original vertex first. Budget exhaustion is local: a later
  // corner stays raw, rather than discarding already safe curves on other islands.
  let reservedPoints = raw.polygons.reduce((n, p) => n + p.points.length / 2, 0);
  let visits = 0,
    total = 0;
  for (const [polygon, poly] of raw.polygons.entries()) {
    const vertices = Array.from({ length: poly.points.length / 2 }, (_, i) => ({
      x: poly.points[i * 2]!,
      y: poly.points[i * 2 + 1]!,
    }));
    const result: RoadPoint[] = [];
    for (let i = 0; i < vertices.length; i++) {
      const p = vertices[i]!,
        a = vertices[(i + vertices.length - 1) % vertices.length]!,
        b = vertices[(i + 1) % vertices.length]!;
      const before = Math.hypot(a.x - p.x, a.y - p.y),
        after = Math.hypot(b.x - p.x, b.y - p.y);
      let run = Math.min(
        CONSTRAINED_COAST.maxRun,
        // A quadratic replaces two equal-run legs. Its deviation from the original
        // V is at most run/2 (compare each half with its original linear leg).
        2 * CONSTRAINED_COAST.maxDisplacement,
        before * CONSTRAINED_COAST.adjacentFraction,
        after * CONSTRAINED_COAST.adjacentFraction,
      );
      let chosen: Triangle | null = null;
      while (run >= CONSTRAINED_COAST.minRun) {
        const t: Triangle = [
          { x: p.x + ((a.x - p.x) * run) / before, y: p.y + ((a.y - p.y) * run) / before },
          p,
          { x: p.x + ((b.x - p.x) * run) / after, y: p.y + ((b.y - p.y) * run) / after },
        ];
        let safe = Math.abs(cross(t[0], p, t[2])) > 1e-9;
        for (const c of nearby(footprintIndex, t)) {
          if (++visits > CONSTRAINED_COAST.visits) return raw;
          if (coastTriangleTouchesCapsule(t, c)) {
            safe = false;
            break;
          }
        }
        if (safe)
          for (const c of nearby(shoreIndex, t)) {
            if (++visits > CONSTRAINED_COAST.visits) return raw;
            if (
              c.polygon === polygon &&
              (c.index === i || c.index === (i + vertices.length - 1) % vertices.length)
            )
              continue;
            if (coastTriangleTouchesCapsule(t, c)) {
              safe = false;
              break;
            }
          }
        if (safe)
          for (const entry of [...nearby(acceptedIndex, t)].sort((a, b) => a.order - b.order)) {
            const other = entry.triangle;
            acceptedTriangleComparisons++;
            if (++visits > CONSTRAINED_COAST.visits) return raw;
            if (
              other.some((q) => inTriangle(q, t)) ||
              t.some((q) => inTriangle(q, other)) ||
              other.some((q, k) =>
                t.some((v, j) => segmentIntersects(q, other[(k + 1) % 3]!, v, t[(j + 1) % 3]!)),
              )
            ) {
              safe = false;
              break;
            }
          }
        if (safe) {
          chosen = t;
          break;
        }
        run /= 2;
      }
      if (!chosen || reservedPoints + CONSTRAINED_COAST.steps > CONSTRAINED_COAST.outputPoints) {
        result.push(p);
        continue;
      }
      reservedPoints += CONSTRAINED_COAST.steps;
      const [start, , end] = chosen;
      result.push(start);
      for (let k = 1; k <= CONSTRAINED_COAST.steps; k++) {
        const t = k / CONSTRAINED_COAST.steps,
          u = 1 - t;
        result.push(
          k === CONSTRAINED_COAST.steps
            ? end
            : {
                x: u * u * start.x + 2 * u * t * p.x + t * t * end.x,
                y: u * u * start.y + 2 * u * t * p.y + t * t * end.y,
              },
        );
      }
      const entry: AcceptedTriangle = {
        id: `accepted:${acceptedCount}`,
        order: acceptedCount++,
        triangle: chosen,
        a: { x: Math.min(...chosen.map((p) => p.x)), y: Math.min(...chosen.map((p) => p.y)) },
        b: { x: Math.max(...chosen.map((p) => p.x)), y: Math.max(...chosen.map((p) => p.y)) },
        radius: 0,
      };
      for (let y = Math.floor(entry.a.y / 32); y <= Math.floor(entry.b.y / 32); y++)
        for (let x = Math.floor(entry.a.x / 32); x <= Math.floor(entry.b.x / 32); x++) {
          if (++acceptedIndexEntries > CONSTRAINED_COAST.indexEntries) return raw;
          const key = `${x},${y}`,
            list = acceptedIndex.get(key) ?? [];
          list.push(entry);
          acceptedIndex.set(key, list);
        }
    }
    total += result.length;
    if (total > CONSTRAINED_COAST.outputPoints) return raw;
    const points = result.flatMap((p) => [p.x, p.y]),
      oldArea = signedArea(poly.points),
      area = signedArea(points);
    for (const axis of ['x', 'y'] as const) {
      const old = vertices.map((p) => p[axis]),
        next = result.map((p) => p[axis]);
      if (
        Math.min(...next) < Math.min(...old) - 1e-9 ||
        Math.max(...next) > Math.max(...old) + 1e-9 ||
        Math.min(...next) - Math.min(...old) > CONSTRAINED_COAST.maxDisplacement ||
        Math.max(...old) - Math.max(...next) > CONSTRAINED_COAST.maxDisplacement
      )
        return raw;
    }
    // Local triangle guards preserve topology; this global area guard additionally bounds visual drift.
    if (
      Math.sign(area) !== Math.sign(oldArea) ||
      Math.abs(area - oldArea) > Math.abs(oldArea) * 0.02
    )
      return raw;
    polygons.push({ id: poly.id, points });
  }
  const candidate = freeze(polygons);
  const output = topology(candidate) ? candidate : raw;
  buildWork.set(output, Object.freeze({ acceptedTriangleComparisons, acceptedIndexEntries }));
  return output;
}

const EMPTY_RIVERS: readonly ConstrainedRiver[] = Object.freeze([]);
const cache = new WeakMap<
  OutlineGeometry,
  WeakMap<MapGraph, WeakMap<readonly ConstrainedRiver[], OutlineGeometry>>
>();
export function buildConstrainedCoast(
  outline: OutlineGeometry,
  graph: MapGraph,
  rivers: readonly ConstrainedRiver[] = EMPTY_RIVERS,
): OutlineGeometry {
  let graphs = cache.get(outline);
  if (!graphs) {
    graphs = new WeakMap();
    cache.set(outline, graphs);
  }
  let variants = graphs.get(graph);
  if (!variants) {
    variants = new WeakMap();
    graphs.set(graph, variants);
  }
  const previous = variants.get(rivers);
  if (previous) return previous;
  const footprints = collectCoastFootprints(graph, rivers);
  const result = roundConstrainedCoast(
    outline,
    footprints ?? [{ id: 'invalid', a: { x: NaN, y: NaN }, b: { x: NaN, y: NaN }, radius: 0 }],
  );
  variants.set(rivers, result);
  return result;
}
