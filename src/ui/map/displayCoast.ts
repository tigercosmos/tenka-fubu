import type { MapGraph } from '@core/state/mapGraph';
import { pointInPolygon, signedArea } from '@data/map/outlineGeometry';
import {
  WORLD_SIZE,
  BRIDGE,
  ROAD_CASING_WIDTH,
  ROAD_GROUND_STYLE,
  ROAD_STAGE_WIDTH_MULT,
  SEA_ROUTE_WIDTH,
  SEA_WAVE,
} from './mapViewConfig';
import { edgeVisualPolyline, type RoadPoint } from './roads/roadGeometry';
import { buildConstrainedCoast } from './constrainedCoast';

/** Float display approximation only; never canonical outline metadata or Zod input. */
export interface OutlineGeometry {
  readonly polygons: readonly { readonly id: string; readonly points: readonly number[] }[];
}
export interface CoastRiver {
  readonly points: readonly RoadPoint[];
}
export interface CoastProtectedPoint extends RoadPoint {
  readonly radius?: number;
}
export const DISPLAY_COAST = {
  maxRun: 12,
  adjacentFraction: 0.25,
  pinRadius: 20,
  steps: 8,
  inputPointBudget: 1024,
  outputPointBudget: 4096,
  protectedPointBudget: 200_000,
} as const;
const EMPTY_RIVERS: readonly CoastRiver[] = Object.freeze([]);
const EMPTY: OutlineGeometry = Object.freeze({ polygons: Object.freeze([]) });
const finitePoint = (p: RoadPoint) =>
  Number.isFinite(p.x) &&
  Number.isFinite(p.y) &&
  p.x >= 0 &&
  p.y >= 0 &&
  p.x <= WORLD_SIZE &&
  p.y <= WORLD_SIZE;
function freezeGeometry(polygons: OutlineGeometry['polygons']): OutlineGeometry {
  return Object.freeze({
    polygons: Object.freeze(
      polygons.map((p) => Object.freeze({ id: p.id, points: Object.freeze([...p.points]) })),
    ),
  });
}
function normalize(raw: OutlineGeometry): OutlineGeometry | null {
  if (raw.polygons.length > 16) return null;
  let count = 0;
  const ids = new Set<string>(),
    polygons: { id: string; points: number[] }[] = [];
  for (const p of raw.polygons) {
    if (ids.has(p.id) || p.points.length % 2 !== 0) return null;
    ids.add(p.id);
    count += p.points.length / 2;
    if (count > DISPLAY_COAST.inputPointBudget) return null;
    const points: number[] = [];
    for (let i = 0; i < p.points.length; i += 2) {
      const x = p.points[i]!,
        y = p.points[i + 1]!;
      if (!finitePoint({ x, y })) return null;
      if (points.length < 2 || x !== points[points.length - 2] || y !== points[points.length - 1])
        points.push(x, y);
    }
    if (
      points.length >= 4 &&
      points[0] === points[points.length - 2] &&
      points[1] === points[points.length - 1]
    )
      points.splice(-2);
    if (points.length < 6 || signedArea(points) === 0) return null;
    polygons.push({ id: p.id, points });
  }
  return freezeGeometry(polygons);
}
interface Segment {
  a: RoadPoint;
  b: RoadPoint;
  polygon: number;
  index: number;
  count: number;
}
const cross = (a: RoadPoint, b: RoadPoint, c: RoadPoint) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
function intersects(a: Segment, b: Segment) {
  if (
    Math.max(a.a.x, a.b.x) < Math.min(b.a.x, b.b.x) ||
    Math.max(b.a.x, b.b.x) < Math.min(a.a.x, a.b.x) ||
    Math.max(a.a.y, a.b.y) < Math.min(b.a.y, b.b.y) ||
    Math.max(b.a.y, b.b.y) < Math.min(a.a.y, a.b.y)
  )
    return false;
  return (
    cross(a.a, a.b, b.a) * cross(a.a, a.b, b.b) <= 0 &&
    cross(b.a, b.b, a.a) * cross(b.a, b.b, a.b) <= 0
  );
}
/** Bounded spatial topology guard, including non-adjacent touches and cross-island overlap. */
function safeTopology(geometry: OutlineGeometry): boolean {
  const buckets = new Map<string, Segment[]>(),
    cell = 32;
  let insertions = 0,
    checks = 0;
  for (let polygon = 0; polygon < geometry.polygons.length; polygon++) {
    const flat = geometry.polygons[polygon]!.points,
      count = flat.length / 2;
    for (let index = 0; index < count; index++) {
      const next = (index + 1) % count;
      const segment: Segment = {
        a: { x: flat[index * 2]!, y: flat[index * 2 + 1]! },
        b: { x: flat[next * 2]!, y: flat[next * 2 + 1]! },
        polygon,
        index,
        count,
      };
      const seen = new Set<Segment>();
      for (
        let y = Math.floor(Math.min(segment.a.y, segment.b.y) / cell);
        y <= Math.floor(Math.max(segment.a.y, segment.b.y) / cell);
        y++
      )
        for (
          let x = Math.floor(Math.min(segment.a.x, segment.b.x) / cell);
          x <= Math.floor(Math.max(segment.a.x, segment.b.x) / cell);
          x++
        ) {
          if (++insertions > 200_000) return false;
          const key = `${x},${y}`,
            list = buckets.get(key) ?? [];
          for (const other of list) {
            if (seen.has(other)) continue;
            seen.add(other);
            if (
              other.polygon === polygon &&
              (Math.abs(other.index - index) === 1 || Math.abs(other.index - index) === count - 1)
            )
              continue;
            if (++checks > 500_000 || intersects(segment, other)) return false;
          }
          list.push(segment);
          buckets.set(key, list);
        }
    }
  }
  for (let i = 0; i < geometry.polygons.length; i++)
    for (let j = i + 1; j < geometry.polygons.length; j++) {
      const a = geometry.polygons[i]!.points,
        b = geometry.polygons[j]!.points;
      if (pointInPolygon(a[0]!, a[1]!, b) || pointInPolygon(b[0]!, b[1]!, a)) return false;
    }
  return true;
}

/** Real node/route/normalized-river anchors. Invalid or oversized protection fails closed. */
export function collectCoastProtectedPoints(
  graph: MapGraph,
  rivers: readonly CoastRiver[] = EMPTY_RIVERS,
): readonly CoastProtectedPoint[] | null {
  const result: CoastProtectedPoint[] = [];
  const add = (p: CoastProtectedPoint) => {
    if (!finitePoint(p) || result.length >= DISPLAY_COAST.protectedPointBudget) return false;
    result.push(Object.freeze({ ...p }));
    return true;
  };
  const line = (points: readonly RoadPoint[], radius = DISPLAY_COAST.pinRadius as number) => {
    for (const p of points) if (!finitePoint(p)) return false;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!,
        b = points[i]!,
        count = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
      for (let k = 0; k <= count; k++)
        if (
          !add({ x: a.x + ((b.x - a.x) * k) / count, y: a.y + ((b.y - a.y) * k) / count, radius })
        )
          return false;
    }
    return true;
  };
  for (const n of graph.nodes.values()) if (!add(n.pos)) return null;
  for (const edge of graph.edges.values()) {
    const points = edgeVisualPolyline(edge, graph);
    const paintRadius =
      edge.type === 'land'
        ? Math.max(
            (ROAD_CASING_WIDTH[edge.grade] * ROAD_STAGE_WIDTH_MULT.far) / 2,
            ((ROAD_CASING_WIDTH[edge.grade] + ROAD_GROUND_STYLE.vergeExtraWidth) *
              ROAD_STAGE_WIDTH_MULT.mid) /
              2,
          )
        : Math.max(
            (SEA_ROUTE_WIDTH.outer * ROAD_STAGE_WIDTH_MULT.far) / 2,
            SEA_WAVE.radius * ROAD_STAGE_WIDTH_MULT.far,
          );
    if (points && !line(points, DISPLAY_COAST.pinRadius + paintRadius)) return null;
    // Conservative circular envelope includes deck, abutments, raised artwork and ground shadow.
    const bridgeRadius =
      DISPLAY_COAST.pinRadius +
      Math.ceil(
        Math.hypot(BRIDGE.deckLength / 2 + BRIDGE.abutment, BRIDGE.deckWidth / 2) *
          Math.max(ROAD_STAGE_WIDTH_MULT.mid, ROAD_STAGE_WIDTH_MULT.near) +
          12,
      );
    for (let i = 0; i + 1 < (edge.bridges?.length ?? 0); i += 2)
      if (!add({ x: edge.bridges![i]!, y: edge.bridges![i + 1]!, radius: bridgeRadius }))
        return null;
  }
  for (const river of rivers) if (!line(river.points)) return null;
  return Object.freeze(result);
}

/** Same bounded corner policy as the approved prototype; unsafe geometry retains its safe raw outline. */
export function roundDisplayCoastGeometry(
  input: OutlineGeometry,
  protectedPoints: readonly CoastProtectedPoint[],
): OutlineGeometry {
  const raw = normalize(input);
  if (!raw || !safeTopology(raw)) return EMPTY;
  if (
    protectedPoints.length > DISPLAY_COAST.protectedPointBudget ||
    protectedPoints.some(
      (p) =>
        !finitePoint(p) ||
        (p.radius !== undefined && (!Number.isFinite(p.radius) || p.radius < 0 || p.radius > 96)),
    )
  )
    return raw;
  const buckets = new Map<string, CoastProtectedPoint[]>(),
    cell = 24;
  for (const p of protectedPoints) {
    const key = `${Math.floor(p.x / cell)},${Math.floor(p.y / cell)}`;
    const list = buckets.get(key) ?? [];
    list.push(p);
    buckets.set(key, list);
  }
  let total = 0,
    boundaryQueries = 0,
    pointVisits = 0;
  const polygons: { id: string; points: number[] }[] = [];
  for (const poly of raw.polygons) {
    const vertices = Array.from({ length: poly.points.length / 2 }, (_, i) => ({
      x: poly.points[i * 2]!,
      y: poly.points[i * 2 + 1]!,
    }));
    const boundaryPins = new Set<number>();
    for (let i = 0; i < vertices.length; i++) {
      const a = vertices[i]!,
        b = vertices[(i + 1) % vertices.length]!,
        dx = b.x - a.x,
        dy = b.y - a.y,
        den = dx * dx + dy * dy || 1;
      for (
        let y = Math.floor(Math.min(a.y, b.y) / cell);
        y <= Math.floor(Math.max(a.y, b.y) / cell);
        y++
      )
        for (
          let x = Math.floor(Math.min(a.x, b.x) / cell);
          x <= Math.floor(Math.max(a.x, b.x) / cell);
          x++
        ) {
          if (++boundaryQueries > 200_000) return raw;
          for (const p of buckets.get(`${x},${y}`) ?? []) {
            if (++pointVisits > 2_000_000) return raw;
            const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / den;
            if (t >= 0 && t <= 1 && (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2 < 1e-14) {
              boundaryPins.add(i);
              boundaryPins.add((i + 1) % vertices.length);
            }
          }
        }
    }
    const result: RoadPoint[] = [];
    for (let i = 0; i < vertices.length; i++) {
      const p = vertices[i]!,
        a = vertices[(i + vertices.length - 1) % vertices.length]!,
        b = vertices[(i + 1) % vertices.length]!;
      const before = Math.hypot(a.x - p.x, a.y - p.y),
        after = Math.hypot(b.x - p.x, b.y - p.y);
      const run = Math.min(
        DISPLAY_COAST.maxRun,
        before * DISPLAY_COAST.adjacentFraction,
        after * DISPLAY_COAST.adjacentFraction,
      );
      let pinned = boundaryPins.has(i);
      const cx = Math.floor(p.x / cell),
        cy = Math.floor(p.y / cell);
      for (let dy = -4; dy <= 4; dy++)
        for (let dx = -4; dx <= 4; dx++)
          for (const q of buckets.get(`${cx + dx},${cy + dy}`) ?? []) {
            if (++pointVisits > 2_000_000) return raw;
            if (Math.hypot(q.x - p.x, q.y - p.y) <= (q.radius ?? DISPLAY_COAST.pinRadius))
              pinned = true;
          }
      if (pinned || run < 0.25) {
        result.push({ ...p });
        continue;
      }
      const start = {
        x: p.x + ((a.x - p.x) * run) / before,
        y: p.y + ((a.y - p.y) * run) / before,
      };
      const end = { x: p.x + ((b.x - p.x) * run) / after, y: p.y + ((b.y - p.y) * run) / after };
      result.push(start);
      for (let step = 1; step <= DISPLAY_COAST.steps; step++) {
        const t = step / DISPLAY_COAST.steps,
          u = 1 - t;
        result.push(
          step === DISPLAY_COAST.steps
            ? end
            : {
                x: u * u * start.x + 2 * u * t * p.x + t * t * end.x,
                y: u * u * start.y + 2 * u * t * p.y + t * t * end.y,
              },
        );
      }
    }
    total += result.length;
    if (total > DISPLAY_COAST.outputPointBudget) return raw;
    polygons.push({ id: poly.id, points: result.flatMap((p) => [p.x, p.y]) });
  }
  if (total > DISPLAY_COAST.outputPointBudget) return raw;
  const candidate = { polygons };
  if (
    !safeTopology(candidate) ||
    polygons.some(
      (p, i) => Math.sign(signedArea(p.points)) !== Math.sign(signedArea(raw.polygons[i]!.points)),
    )
  )
    return raw;
  return freezeGeometry(polygons);
}
const cache = new WeakMap<
  OutlineGeometry,
  WeakMap<MapGraph, WeakMap<readonly CoastRiver[], OutlineGeometry>>
>();
/** Immutable identities are the cache contract; no per-day coastline work or canonical mutation. */
export function buildDisplayCoast(
  outline: OutlineGeometry,
  graph: MapGraph,
  rivers: readonly CoastRiver[] = EMPTY_RIVERS,
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
  const existing = variants.get(rivers);
  if (existing) return existing;
  const result = buildConstrainedCoast(outline, graph, rivers);
  variants.set(rivers, result);
  return result;
}
