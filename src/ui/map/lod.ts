import { MAPVIEW } from './mapViewConfig';

export type LodMode = 'far' | 'near';

/** 三段 LOD（M6-V5，VD3）：far/mid/near，用於地形/水系/領地顯示細分（既有 LodMode 二分維持相容）。 */
export type LodStage = 'far' | 'mid' | 'near';

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

/**
 * 純分類（無 hysteresis）：截圖 preset（`setCameraPose`）用，決定論——同一 scale 恆回傳同一段，
 * 不受先前段別影響（M6-V5，VD3）。
 */
export function lodStageForScale(scale: number): LodStage {
  if (scale < MAPVIEW.lodFarScale) return 'far'; // <0.5
  if (scale < MAPVIEW.lodNearScale) return 'mid'; // <1.0
  return 'near'; // >=1.0
}

/**
 * 帶 10% 死區（滾輪連續縮放防閃爍）：同段回傳同段；跨段須超過死區邊界才切換
 * （M6-V5，VD3）。截圖 preset 走 `lodStageForScale`（純分類），不吃死區。
 */
export function lodStageWithHysteresis(scale: number, prev: LodStage): LodStage {
  const f = MAPVIEW.lodFarScale;
  const n = MAPVIEW.lodNearScale;
  const h = MAPVIEW.lodHysteresis;
  const pure = lodStageForScale(scale);
  if (pure === prev) return prev;
  if (prev === 'far') return scale >= f * (1 + h) ? pure : 'far';
  if (prev === 'near') return scale <= n * (1 - h) ? pure : 'near';
  // prev === 'mid'
  if (pure === 'near') return scale >= n * (1 + h) ? 'near' : 'mid';
  /* pure === 'far' */ return scale <= f * (1 - h) ? 'far' : 'mid';
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
