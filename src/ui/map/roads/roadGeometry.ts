import type { MapGraph, MapRoadEdge } from '@core/state/mapGraph';
import type { MapNodeId } from '@core/state/ids';
import outline from '@data/map/japan-outline.json';
import terrain from '@data/map/terrain.json';
import { pointInPolygon } from '@data/map/outlineGeometry';
import { BRIDGE, ROAD_STAGE_WIDTH_MULT } from '../mapViewConfig';

export interface RoadPoint {
  x: number;
  y: number;
}

export interface RoadCurveOptions {
  bridgePins?: readonly RoadPoint[];
  isAllowed?: (point: RoadPoint, originalSegmentIndex: number) => boolean;
}

function segmentDistance(point: RoadPoint, a: RoadPoint, b: RoadPoint): number {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
  );
  return Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy);
}

/** Bounded display interpolation through raw anchors; unsafe segments remain authored straight lines. */
export function curveAuthoredPolyline(
  raw: readonly RoadPoint[],
  options: RoadCurveOptions = {},
): RoadPoint[] {
  if (raw.length < 3) return raw.map((p) => ({ ...p }));
  const vectors = raw.slice(1).map((b, i) => {
    const a = raw[i]!,
      dx = b.x - a.x,
      dy = b.y - a.y,
      len = Math.hypot(dx, dy);
    return { x: len ? dx / len : 0, y: len ? dy / len : 0, len };
  });
  // Bridges render only at mid/near. Preserve their largest deck/abutment corridor plus margin.
  const keepout = Math.ceil(
    (BRIDGE.deckLength / 2 + BRIDGE.abutment) *
      Math.max(ROAD_STAGE_WIDTH_MULT.mid, ROAD_STAGE_WIDTH_MULT.near) +
      8,
  );
  const protectedPins = (options.bridgePins ?? []).map((pin) => {
    let index = 0,
      best = Infinity;
    for (let i = 0; i < vectors.length; i++) {
      const distance = segmentDistance(pin, raw[i]!, raw[i + 1]!);
      if (distance < best) {
        best = distance;
        index = i;
      }
    }
    const a = raw[index]!,
      v = vectors[index]!;
    return {
      index,
      along: Math.max(0, Math.min(v.len, (pin.x - a.x) * v.x + (pin.y - a.y) * v.y)),
    };
  });
  const tangent = (i: number) => {
    const prev = vectors[Math.max(0, i - 1)]!,
      next = vectors[Math.min(vectors.length - 1, i)]!;
    const x = prev.x + next.x,
      y = prev.y + next.y,
      len = Math.hypot(x, y);
    let size = Math.min(24, prev.len * 0.3, next.len * 0.3);
    for (const pin of protectedPins) {
      if (pin.index === i - 1) size = Math.min(size, Math.max(0, prev.len - pin.along - keepout));
      if (pin.index === i) size = Math.min(size, Math.max(0, pin.along - keepout));
    }
    return len ? { x: (x / len) * size, y: (y / len) * size } : { x: 0, y: 0 };
  };
  const output: RoadPoint[] = [{ ...raw[0]! }];
  for (let i = 0; i < vectors.length; i++) {
    const a = raw[i]!,
      b = raw[i + 1]!,
      v = vectors[i]!;
    let accepted: RoadPoint[] | undefined;
    if (v.len > 0) {
      const ta = tangent(i),
        tb = tangent(i + 1);
      for (let attempt = 0; attempt < 6 && !accepted; attempt++) {
        const factor = 2 ** -attempt,
          candidate: RoadPoint[] = [{ ...a }];
        const appendCurve = (start: RoadPoint, end: RoadPoint, c1: RoadPoint, c2: RoadPoint) => {
          // Local spans only; long middle portions retain the original straight centerline.
          for (let step = 1; step <= 12; step++) {
            const t = step / 12,
              u = 1 - t;
            candidate.push(
              step === 12
                ? { ...end }
                : {
                    x:
                      u * u * u * start.x +
                      3 * u * u * t * c1.x +
                      3 * u * t * t * c2.x +
                      t * t * t * end.x,
                    y:
                      u * u * u * start.y +
                      3 * u * u * t * c1.y +
                      3 * u * t * t * c2.y +
                      t * t * t * end.y,
                  },
            );
          }
        };
        if (i > 0 && Math.hypot(ta.x, ta.y) > 0) {
          const run = Math.hypot(ta.x, ta.y) * factor;
          const end = { x: a.x + v.x * run, y: a.y + v.y * run };
          appendCurve(
            a,
            end,
            { x: a.x + (ta.x * factor) / 3, y: a.y + (ta.y * factor) / 3 },
            { x: end.x - (v.x * run) / 3, y: end.y - (v.y * run) / 3 },
          );
        }
        if (i < vectors.length - 1 && Math.hypot(tb.x, tb.y) > 0) {
          const run = Math.hypot(tb.x, tb.y) * factor;
          const start = { x: b.x - v.x * run, y: b.y - v.y * run };
          candidate.push(start);
          appendCurve(
            start,
            b,
            { x: start.x + (v.x * run) / 3, y: start.y + (v.y * run) / 3 },
            { x: b.x - (tb.x * factor) / 3, y: b.y - (tb.y * factor) / 3 },
          );
        } else candidate.push({ ...b });
        let safe = true;
        for (let j = 1; j < candidate.length && safe; j++) {
          const p = candidate[j - 1]!,
            q = candidate[j]!,
            count = Math.max(1, Math.ceil(Math.hypot(q.x - p.x, q.y - p.y)));
          for (let k = 0; k <= count; k++) {
            const point = {
              x: p.x + ((q.x - p.x) * k) / count,
              y: p.y + ((q.y - p.y) * k) / count,
            };
            if (
              segmentDistance(point, a, b) > 4 + 1e-9 ||
              options.isAllowed?.(point, i) === false
            ) {
              safe = false;
              break;
            }
          }
        }
        if (safe) accepted = candidate;
      }
    }
    output.push(...(accepted ? accepted.slice(1) : [{ ...b }]));
    if (output.length > 256) return raw.map((p) => ({ ...p }));
  }
  return output;
}

const visualCache = new WeakMap<MapGraph, WeakMap<MapRoadEdge, readonly RoadPoint[] | null>>();

/** Immutable display-only geometry, validated against authored land and mountain masses once per graph edge. */
export function edgeVisualPolyline(
  edge: MapRoadEdge,
  graph: MapGraph,
): readonly RoadPoint[] | null {
  let cache = visualCache.get(graph);
  if (!cache) {
    cache = new WeakMap();
    visualCache.set(graph, cache);
  }
  if (cache.has(edge)) return cache.get(edge)!;
  const raw = edgePolyline(edge, graph);
  if (!raw) {
    cache.set(edge, null);
    return null;
  }
  const bridgePins: RoadPoint[] = [];
  for (let i = 0; i + 1 < (edge.bridges?.length ?? 0); i += 2)
    bridgePins.push({ x: edge.bridges![i]!, y: edge.bridges![i + 1]! });
  const points =
    edge.type === 'land' && edge.waypoints?.length
      ? curveAuthoredPolyline(raw, {
          bridgePins,
          isAllowed: (p, index) => {
            const land = outline.polygons.some((poly) => pointInPolygon(p.x, p.y, poly.points));
            if (!land) return false;
            return terrain.mountains.every(
              (m) =>
                !pointInPolygon(p.x, p.y, m.mass) ||
                (index === 0 && pointInPolygon(raw[0]!.x, raw[0]!.y, m.mass)) ||
                (index === raw.length - 2 &&
                  pointInPolygon(raw[raw.length - 1]!.x, raw[raw.length - 1]!.y, m.mass)),
            );
          },
        })
      : raw;
  const frozen = Object.freeze(points.map((p) => Object.freeze({ ...p })));
  cache.set(edge, frozen);
  return frozen;
}

/** Authored display geometry, never simulation distance or travel time. */
export function edgePolyline(edge: MapRoadEdge, graph: MapGraph): RoadPoint[] | null {
  const a = graph.nodes.get(edge.a),
    b = graph.nodes.get(edge.b);
  if (!a || !b) return null;
  const points: RoadPoint[] = [{ x: a.pos.x, y: a.pos.y }];
  const waypoints = edge.waypoints;
  if (waypoints)
    for (let i = 0; i + 1 < waypoints.length; i += 2)
      points.push({ x: waypoints[i]!, y: waypoints[i + 1]! });
  points.push({ x: b.pos.x, y: b.pos.y });
  return points;
}

/** Preserve adjacency order; no whole-graph search or route-rule changes. */
export function edgeBetween(graph: MapGraph, from: string, to: string): MapRoadEdge | undefined {
  for (const id of graph.adjacency.get(from as MapNodeId) ?? []) {
    const edge = graph.edges.get(id);
    if (edge && ((edge.a === from && edge.b === to) || (edge.b === from && edge.a === to)))
      return edge;
  }
  return undefined;
}

function sample(
  points: readonly RoadPoint[],
  ratio: number,
): { point: RoadPoint; angle: number | null } | null {
  const first = points[0];
  if (!first) return null;
  let total = 0;
  const lengths: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!,
      b = points[i]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    lengths.push(length);
    total += length;
  }
  if (total === 0) return { point: { ...first }, angle: null };
  const target = Math.max(0, Math.min(1, ratio)) * total;
  let distance = 0;
  for (let i = 0; i < lengths.length; i++) {
    const length = lengths[i]!;
    if (length > 0 && distance + length >= target) {
      const a = points[i]!,
        b = points[i + 1]!,
        t = (target - distance) / length;
      return {
        point: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
        angle: Math.atan2(b.y - a.y, b.x - a.x),
      };
    }
    distance += length;
  }
  return { point: { ...points[points.length - 1]! }, angle: null };
}

export function pointAtPolyline(points: readonly RoadPoint[], ratio: number): RoadPoint | null {
  // Preserve exact authored anchors, independent of accumulated floating arc lengths.
  if (ratio <= 0) return points[0] ? { ...points[0] } : null;
  if (ratio >= 1) return points.length ? { ...points[points.length - 1]! } : null;
  return sample(points, ratio)?.point ?? null;
}

export function tangentAtPolyline(points: readonly RoadPoint[], ratio: number): number | null {
  return sample(points, ratio)?.angle ?? null;
}
