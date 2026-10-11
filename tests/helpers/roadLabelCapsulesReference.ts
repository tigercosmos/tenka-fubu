// Frozen source at d9bd95a; update only with a separately reviewed contract change.
import type { PlateRect } from '../../src/ui/map/armyPlateLayout';

type Point = Readonly<{ x: number; y: number }>;
export interface RoadLabelSegment {
  readonly a: Point;
  readonly b: Point;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}
export interface RoadLabelCapsule {
  readonly a: Point;
  readonly b: Point;
  readonly radius: number;
}

export function prepareRoadLabelSegments(
  points: readonly Point[],
): readonly RoadLabelSegment[] | null {
  if (
    points.length < 2 ||
    points.length > 256 ||
    points.some(
      (p) =>
        !Number.isFinite(p.x) ||
        !Number.isFinite(p.y) ||
        Math.abs(p.x) > 1e6 ||
        Math.abs(p.y) > 1e6,
    )
  )
    return null;
  return Object.freeze(
    points.slice(1).map((p, i) => {
      const a = Object.freeze({ ...points[i]! }),
        b = Object.freeze({ ...p });
      return Object.freeze({
        a,
        b,
        minX: Math.min(a.x, b.x),
        minY: Math.min(a.y, b.y),
        maxX: Math.max(a.x, b.x),
        maxY: Math.max(a.y, b.y),
      });
    }),
  );
}

export function nearbyRoadLabelCapsules(
  segments: readonly RoadLabelSegment[] | null,
  rect: PlateRect,
  scale: number,
  radius: number,
): readonly RoadLabelCapsule[] | null {
  if (!segments || !Number.isFinite(scale) || scale <= 0 || !Number.isFinite(radius) || radius < 0)
    return null;
  const margin = 48 + radius;
  return segments
    .filter(
      (s) =>
        s.maxX * scale >= rect.x - margin &&
        s.minX * scale <= rect.x + rect.width + margin &&
        s.maxY * scale >= rect.y - margin &&
        s.minY * scale <= rect.y + rect.height + margin,
    )
    .map((s) => ({
      a: { x: s.a.x * scale, y: s.a.y * scale },
      b: { x: s.b.x * scale, y: s.b.y * scale },
      radius,
    }));
}

function pointRectDistance(p: Point, r: PlateRect): number {
  const dx = Math.max(r.x - p.x, p.x - r.x - r.width, 0),
    dy = Math.max(r.y - p.y, p.y - r.y - r.height, 0);
  return dx * dx + dy * dy;
}
function pointSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    length = dx * dx + dy * dy;
  const t =
    length === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length));
  return (p.x - a.x - t * dx) ** 2 + (p.y - a.y - t * dy) ** 2;
}
function segmentRectDistance(a: Point, b: Point, r: PlateRect): number {
  let lo = 0,
    hi = 1;
  for (const [start, delta, min, max] of [
    [a.x, b.x - a.x, r.x, r.x + r.width],
    [a.y, b.y - a.y, r.y, r.y + r.height],
  ]) {
    if (delta === 0) {
      if (start! < min! || start! > max!) {
        lo = 1;
        hi = 0;
        break;
      }
    } else {
      const t1 = (min! - start!) / delta!,
        t2 = (max! - start!) / delta!;
      lo = Math.max(lo, Math.min(t1, t2));
      hi = Math.min(hi, Math.max(t1, t2));
    }
  }
  if (lo <= hi) return 0;
  return Math.min(
    pointRectDistance(a, r),
    pointRectDistance(b, r),
    ...[r.x, r.x + r.width].flatMap((x) =>
      [r.y, r.y + r.height].map((y) => pointSegmentDistance({ x, y }, a, b)),
    ),
  );
}

export function referenceRoadLabelClearsCapsules(
  rect: PlateRect,
  capsules: readonly RoadLabelCapsule[] | null,
): boolean {
  if (
    !capsules ||
    capsules.length > 255 ||
    ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
  )
    return false;
  return capsules.every(
    (c) =>
      [c.a.x, c.a.y, c.b.x, c.b.y, c.radius].every(Number.isFinite) &&
      c.radius >= 0 &&
      segmentRectDistance(c.a, c.b, rect) >= c.radius * c.radius - 1e-8,
  );
}
