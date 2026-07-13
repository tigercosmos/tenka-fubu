import { MAPVIEW } from './mapViewConfig';

export type LodMode = 'far' | 'near';

export interface WorldRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function lodModeForScale(scale: number): LodMode {
  return scale < MAPVIEW.lodFarScale ? 'far' : 'near';
}

export function shouldShowDetailLabels(scale: number): boolean {
  return scale >= MAPVIEW.labelScale;
}

function bucketKey(x: number, y: number): string {
  return `${Math.floor(x / MAPVIEW.cullBucket)},${Math.floor(y / MAPVIEW.cullBucket)}`;
}

/** Small deterministic spatial index used by node/army/label culling. */
export class SpatialCullIndex<T extends string> {
  private readonly buckets = new Map<string, Set<T>>();
  private readonly positions = new Map<T, { x: number; y: number }>();

  upsert(id: T, x: number, y: number): void {
    const prior = this.positions.get(id);
    if (prior !== undefined) this.buckets.get(bucketKey(prior.x, prior.y))?.delete(id);
    this.positions.set(id, { x, y });
    const key = bucketKey(x, y);
    const bucket = this.buckets.get(key) ?? new Set<T>();
    bucket.add(id);
    this.buckets.set(key, bucket);
  }

  remove(id: T): void {
    const prior = this.positions.get(id);
    if (prior !== undefined) this.buckets.get(bucketKey(prior.x, prior.y))?.delete(id);
    this.positions.delete(id);
  }

  query(view: WorldRect, margin: number = MAPVIEW.cullMargin): Set<T> {
    const left = Math.floor((view.left - margin) / MAPVIEW.cullBucket);
    const right = Math.floor((view.right + margin) / MAPVIEW.cullBucket);
    const top = Math.floor((view.top - margin) / MAPVIEW.cullBucket);
    const bottom = Math.floor((view.bottom + margin) / MAPVIEW.cullBucket);
    const result = new Set<T>();
    for (let by = top; by <= bottom; by += 1) {
      for (let bx = left; bx <= right; bx += 1) {
        for (const id of this.buckets.get(`${bx},${by}`) ?? []) result.add(id);
      }
    }
    return result;
  }
}
