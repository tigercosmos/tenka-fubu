import type { RoadPoint } from './roadGeometry';

export type PointProjection = (source: RoadPoint) => RoadPoint;
export interface ProjectedStation {
  readonly ordinal: number;
  readonly source: Readonly<RoadPoint>;
  readonly scene: Readonly<RoadPoint>;
}
export interface ProjectedPolyline {
  readonly stations: readonly ProjectedStation[];
  readonly points: readonly RoadPoint[];
}
export interface RoadProjectionRecord {
  readonly roadId: string;
  readonly stations: readonly ProjectedStation[];
}
export const PROJECTED_POLYLINE_LIMITS = Object.freeze({
  step: 8,
  stations: 16384,
  layerStations: 16384,
});
const cache = new WeakMap<readonly RoadPoint[], WeakMap<PointProjection, ProjectedPolyline>>();
const valid = (point: RoadPoint) =>
  Number.isFinite(point.x) &&
  Number.isFinite(point.y) &&
  Math.abs(point.x) <= 1e6 &&
  Math.abs(point.y) <= 1e6;

/** Preflight before allocation/projection, including zero-length authored legs. */
export function projectedStationCount(source: readonly RoadPoint[]): number {
  if (source.length > PROJECTED_POLYLINE_LIMITS.stations || !source.every(valid)) {
    throw new RangeError('invalid projection source polyline');
  }
  let count = source.length ? 1 : 0;
  for (let i = 1; i < source.length; i++) {
    const a = source[i - 1]!,
      b = source[i]!;
    count += Math.max(
      1,
      Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / PROJECTED_POLYLINE_LIMITS.step),
    );
    if (count > PROJECTED_POLYLINE_LIMITS.stations)
      throw new RangeError('projected polyline station budget');
  }
  return count;
}

export function assertProjectedStationBudget(sources: Iterable<readonly RoadPoint[]>): void {
  let total = 0;
  for (const source of sources) {
    total += projectedStationCount(source);
    if (total > PROJECTED_POLYLINE_LIMITS.layerStations)
      throw new RangeError('road layer projected station budget');
  }
}

/** Densify the existing canonical display path, then project each station once.
 * Cache is weak in both the immutable source polyline and projection lease.
 * This never generates a new curve from projected endpoints.
 */
export function projectPolyline(
  source: readonly RoadPoint[],
  project: PointProjection,
): ProjectedPolyline {
  const immutable = Object.isFrozen(source) && source.every((point) => Object.isFrozen(point));
  const cached = immutable ? cache.get(source)?.get(project) : undefined;
  if (cached) return cached;
  projectedStationCount(source);
  const stations: ProjectedStation[] = [];
  const append = (point: RoadPoint) => {
    const canonical = Object.freeze({ ...point });
    const scene = project(canonical);
    if (!valid(scene)) throw new RangeError('invalid projected polyline point');
    stations.push(
      Object.freeze({
        ordinal: stations.length,
        source: canonical,
        scene: Object.freeze({ ...scene }),
      }),
    );
  };
  if (source[0]) append(source[0]);
  for (let i = 1; i < source.length; i++) {
    const a = source[i - 1]!,
      b = source[i]!;
    const divisions = Math.max(
      1,
      Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / PROJECTED_POLYLINE_LIMITS.step),
    );
    for (let j = 1; j <= divisions; j++)
      append(
        j === divisions
          ? b
          : { x: a.x + ((b.x - a.x) * j) / divisions, y: a.y + ((b.y - a.y) * j) / divisions },
      );
  }
  const result = Object.freeze({
    stations: Object.freeze(stations),
    points: Object.freeze(stations.map((station) => station.scene)),
  });
  if (immutable) {
    let projections = cache.get(source);
    if (!projections) {
      projections = new WeakMap();
      cache.set(source, projections);
    }
    projections.set(project, result);
  }
  return result;
}

export function flatProjectionRecord(
  roadId: string,
  points: readonly RoadPoint[],
): RoadProjectionRecord {
  return Object.freeze({
    roadId,
    stations: Object.freeze(
      points.map((point, ordinal) => {
        const source = Object.freeze({ ...point });
        return Object.freeze({ ordinal, source, scene: source });
      }),
    ),
  });
}
