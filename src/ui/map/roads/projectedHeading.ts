import type { RoadPoint } from './roadGeometry';
import {
  projectPolyline,
  PROJECTED_POLYLINE_LIMITS,
  type PointProjection,
  type ProjectedPolyline,
} from './projectPolyline';

interface SourceLengths {
  readonly cumulative: readonly number[];
  readonly total: number;
  readonly identityHeadings: readonly (RoadPoint | null)[];
}
const lengths = new WeakMap<ProjectedPolyline, SourceLengths>();

/** t is canonical source arclength progress in travel direction, NOT scene
 * arclength. Always pass the original immutable road path. reverse=true changes
 * traversal only AFTER those canonical stations have been sampled/projected.
 */
export function projectedPolylineHeading(
  points: readonly RoadPoint[],
  t: number,
  project: PointProjection,
  reverse = false,
): RoadPoint | null {
  if (points.length < 2 || !Number.isFinite(t)) return null;
  const path = projectPolyline(points, project);
  let metrics = lengths.get(path);
  if (metrics === undefined) {
    const cumulative = [0];
    for (let i = 1; i < path.stations.length; i++) {
      const a = path.stations[i - 1]!.source,
        b = path.stations[i]!.source;
      cumulative.push(cumulative[i - 1]! + Math.hypot(b.x - a.x, b.y - a.y));
    }
    // Subtracting interpolated stations can vary by ulps along a straight
    // protected leg. Use its original endpoint vector only after certifying
    // EVERY emitted station is exactly unchanged by this projection lease.
    // Curved/raised sections retain their actual sampled scene tangents.
    const identityHeadings: (RoadPoint | null)[] = Array.from(
      { length: path.stations.length },
      () => null,
    );
    let start = 0;
    for (let leg = 1; leg < points.length; leg++) {
      const a = points[leg - 1]!,
        b = points[leg]!;
      const dx = b.x - a.x,
        dy = b.y - a.y,
        magnitude = Math.hypot(dx, dy);
      const end = start + Math.max(1, Math.ceil(magnitude / PROJECTED_POLYLINE_LIMITS.step));
      let identity = magnitude > 0;
      for (let station = start; station <= end && identity; station++) {
        const s = path.stations[station]!;
        identity = s.source.x === s.scene.x && s.source.y === s.scene.y;
      }
      if (identity) {
        const heading = Object.freeze({ x: dx / magnitude, y: dy / magnitude });
        for (let station = start + 1; station <= end; station++)
          identityHeadings[station] = heading;
      }
      start = end;
    }
    metrics = {
      cumulative: Object.freeze(cumulative),
      total: cumulative.at(-1) ?? 0,
      identityHeadings: Object.freeze(identityHeadings),
    };
    lengths.set(path, metrics);
  }
  if (metrics.total === 0) return null;
  const fraction = Math.max(0, Math.min(1, t));
  const distance = (reverse ? 1 - fraction : fraction) * metrics.total;
  let low = 1,
    high = metrics.cumulative.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    const at = metrics.cumulative[middle]!;
    if (reverse ? at > distance : at >= distance) high = middle;
    else low = middle + 1;
  }
  let index = low;
  while (
    index < metrics.cumulative.length &&
    metrics.cumulative[index] === metrics.cumulative[index - 1]
  )
    index++;
  if (index === metrics.cumulative.length) {
    index = metrics.cumulative.length - 1;
    while (index > 0 && metrics.cumulative[index] === metrics.cumulative[index - 1]) index--;
  }
  if (index === 0) return null;
  const identityHeading = metrics.identityHeadings[index];
  if (identityHeading)
    return reverse ? { x: -identityHeading.x, y: -identityHeading.y } : identityHeading;
  const a = path.stations[index - 1]!.scene,
    b = path.stations[index]!.scene;
  const sign = reverse ? -1 : 1;
  const dx = (b.x - a.x) * sign,
    dy = (b.y - a.y) * sign;
  const magnitude = Math.hypot(dx, dy);
  return magnitude === 0 ? null : { x: dx / magnitude, y: dy / magnitude };
}
