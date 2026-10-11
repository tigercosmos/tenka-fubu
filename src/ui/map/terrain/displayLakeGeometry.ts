import { RIVER_WIDTH } from '../mapViewConfig';
export interface LakePoint {
  readonly x: number;
  readonly y: number;
}
export const DISPLAY_LAKE = {
  maxTangent: 4,
  adjacentFraction: 0.2,
  steps: 6,
  cornerSteps: 4,
  maxPoints: 128,
  maxOutputPoints: 768,
  maxRiverSegments: 4096,
  areaFraction: 0.02,
  centroidDrift: 0.5,
} as const;
const cross = (a: LakePoint, b: LakePoint, c: LakePoint) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
function intersects(a: LakePoint, b: LakePoint, c: LakePoint, d: LakePoint) {
  if (
    Math.max(a.x, b.x) < Math.min(c.x, d.x) ||
    Math.max(c.x, d.x) < Math.min(a.x, b.x) ||
    Math.max(a.y, b.y) < Math.min(c.y, d.y) ||
    Math.max(c.y, d.y) < Math.min(a.y, b.y)
  )
    return false;
  return cross(a, b, c) * cross(a, b, d) <= 0 && cross(c, d, a) * cross(c, d, b) <= 0;
}
function simple(points: readonly LakePoint[]) {
  for (let i = 0; i < points.length; i++)
    for (let j = i + 1; j < points.length; j++) {
      if (j === i + 1 || (i === 0 && j === points.length - 1)) continue;
      if (
        intersects(
          points[i]!,
          points[(i + 1) % points.length]!,
          points[j]!,
          points[(j + 1) % points.length]!,
        )
      )
        return false;
    }
  return true;
}
function measure(points: readonly LakePoint[]) {
  let area = 0,
    x = 0,
    y = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!,
      b = points[(i + 1) % points.length]!,
      c = a.x * b.y - b.x * a.y;
    area += c;
    x += (a.x + b.x) * c;
    y += (a.y + b.y) * c;
  }
  return { area: area / 2, x: x / (3 * area), y: y / (3 * area) };
}
function distance(p: LakePoint, a: LakePoint, b: LakePoint) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
const freeze = (points: readonly LakePoint[]) =>
  Object.freeze(points.map((p) => Object.freeze({ x: p.x, y: p.y })));

/** Display interpolation only: canonical anchors, bounding box and river-connected edges remain fixed. */
export function buildDisplayLake(
  polygon: readonly LakePoint[],
  rivers: readonly {
    readonly points: readonly LakePoint[];
    readonly widthClass?: 1 | 2 | 3;
  }[] = [],
): readonly LakePoint[] {
  if (
    polygon.length > DISPLAY_LAKE.maxPoints ||
    polygon.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))
  )
    return freeze([]);
  const points = polygon.filter(
    (p, i) => i === 0 || p.x !== polygon[i - 1]!.x || p.y !== polygon[i - 1]!.y,
  );
  if (points.length > 1 && points[0]!.x === points.at(-1)!.x && points[0]!.y === points.at(-1)!.y)
    points.pop();
  const raw = freeze(points),
    original = measure(raw);
  if (raw.length <= 4 || !Number.isFinite(original.area) || original.area === 0 || !simple(raw))
    return raw;
  const segments: { a: LakePoint; b: LakePoint; clearance: number }[] = [];
  for (const river of rivers) {
    if (segments.length + Math.max(0, river.points.length - 1) > DISPLAY_LAKE.maxRiverSegments)
      return raw;
    const clearance = DISPLAY_LAKE.maxTangent + RIVER_WIDTH[river.widthClass ?? 3] / 2;
    for (let i = 1; i < river.points.length; i++) {
      const a = river.points[i - 1]!,
        b = river.points[i]!;
      if (![a.x, a.y, b.x, b.y, clearance].every(Number.isFinite)) return raw;
      segments.push({ a, b, clearance });
    }
  }
  const pinned = raw.map((a, i) => {
    const b = raw[(i + 1) % raw.length]!;
    return segments.some(
      (s) =>
        intersects(a, b, s.a, s.b) ||
        Math.min(
          distance(a, s.a, s.b),
          distance(b, s.a, s.b),
          distance(s.a, a, b),
          distance(s.b, a, b),
        ) <= s.clearance,
    );
  });
  const minX = Math.min(...raw.map((p) => p.x)),
    maxX = Math.max(...raw.map((p) => p.x));
  const minY = Math.min(...raw.map((p) => p.y)),
    maxY = Math.max(...raw.map((p) => p.y));
  for (const factor of [1, 0.5, 0.25, 0.125]) {
    const tangents = raw.map((p, i) => {
      if (pinned[i] || pinned[(i + raw.length - 1) % raw.length]) return { x: 0, y: 0 };
      const a = raw[(i + raw.length - 1) % raw.length]!,
        b = raw[(i + 1) % raw.length]!;
      let x = b.x - a.x,
        y = b.y - a.y;
      if (p.x === minX || p.x === maxX) x = 0;
      if (p.y === minY || p.y === maxY) y = 0;
      const length = Math.hypot(x, y);
      if (!length) return { x: 0, y: 0 };
      x /= length;
      y /= length;
      let run =
        Math.min(
          DISPLAY_LAKE.maxTangent,
          Math.hypot(p.x - a.x, p.y - a.y) * DISPLAY_LAKE.adjacentFraction,
          Math.hypot(b.x - p.x, b.y - p.y) * DISPLAY_LAKE.adjacentFraction,
        ) * factor;
      if (x !== 0) run = Math.min(run, (p.x - minX) / Math.abs(x), (maxX - p.x) / Math.abs(x));
      if (y !== 0) run = Math.min(run, (p.y - minY) / Math.abs(y), (maxY - p.y) / Math.abs(y));
      return { x: x * run, y: y * run };
    });
    const display: LakePoint[] = [];
    const append = (p: LakePoint) => {
      const previous = display.at(-1);
      if (!previous || previous.x !== p.x || previous.y !== p.y) display.push(p);
    };
    // Local spans spend their samples where the original direction actually changes,
    // rather than flattening a whole long bank with almost-zero endpoint derivatives.
    const half = (a: LakePoint, b: LakePoint, da: LakePoint, db: LakePoint, nearStart: boolean) => {
      for (let step = 1; step <= DISPLAY_LAKE.cornerSteps; step++) {
        if (step === DISPLAY_LAKE.cornerSteps) {
          append(b); // Exact canonical anchor / exact entry or exit, not polynomial roundoff.
          continue;
        }
        const t = (nearStart ? [0.05, 0.2, 0.5] : [0.5, 0.8, 0.95])[step - 1]!,
          u = 1 - t;
        append({
          x: Math.max(
            minX,
            Math.min(
              maxX,
              u * u * u * a.x +
                3 * u * u * t * (a.x + da.x / 3) +
                3 * u * t * t * (b.x - db.x / 3) +
                t * t * t * b.x,
            ),
          ),
          y: Math.max(
            minY,
            Math.min(
              maxY,
              u * u * u * a.y +
                3 * u * u * t * (a.y + da.y / 3) +
                3 * u * t * t * (b.y - db.y / 3) +
                t * t * t * b.y,
            ),
          ),
        });
      }
    };
    for (let i = 0; i < raw.length; i++) {
      const p = raw[i]!,
        a = raw[(i + raw.length - 1) % raw.length]!,
        b = raw[(i + 1) % raw.length]!,
        tangent = tangents[i]!;
      const run = Math.hypot(tangent.x, tangent.y);
      if (run === 0) {
        append(p);
        continue;
      }
      const incomingLength = Math.hypot(p.x - a.x, p.y - a.y);
      const outgoingLength = Math.hypot(b.x - p.x, b.y - p.y);
      const incoming = {
        x: ((p.x - a.x) * run) / incomingLength,
        y: ((p.y - a.y) * run) / incomingLength,
      };
      const outgoing = {
        x: ((b.x - p.x) * run) / outgoingLength,
        y: ((b.y - p.y) * run) / outgoingLength,
      };
      const entry = { x: p.x - incoming.x, y: p.y - incoming.y };
      const exit = { x: p.x + outgoing.x, y: p.y + outgoing.y };
      append(entry);
      const cornerDerivative = { x: tangent.x / 2, y: tangent.y / 2 };
      half(entry, p, incoming, cornerDerivative, false);
      half(p, exit, cornerDerivative, outgoing, true);
    }
    if (display.length > DISPLAY_LAKE.maxOutputPoints) return raw;
    const m = measure(display);
    if (
      Math.sign(m.area) === Math.sign(original.area) &&
      Math.abs(m.area - original.area) <= Math.abs(original.area) * DISPLAY_LAKE.areaFraction &&
      Math.hypot(m.x - original.x, m.y - original.y) <= DISPLAY_LAKE.centroidDrift &&
      simple(display)
    )
      return freeze(display);
  }
  return raw;
}
