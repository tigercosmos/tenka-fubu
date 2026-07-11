// 勢力色 TerritoryGrid（柵格化 Voronoi）：建構、重繪（郡歸屬 dirty→次幀）、勢力界線烘焙。
//
// 規格：plan/04-map-and-movement.md §3.10.1（圖層 1「territory」內容）／§3.10.2（柵格化 Voronoi
// 選定方案，取代半徑漸層色塊，理由見 04 §8-D2）／§4.4（`TerritoryGrid` 型別）／§5.5
// （`buildTerritoryGrid`／`recolorTerritory` 演算法逐字對照）；18-roadmap.md M2-14（04-T9）。
// 色彩公式：plan/12-ui-components.md §5.1（`clanColorHsl`/`clanColorNum`，經 `src/ui/styles/tokens.ts`
// 既有函式取用，非重新實作）。
//
// 檔案落位裁定（規格矛盾記錄，回寫見 04 §8）：18-roadmap.md M2-14 一列 deliverable 欄位為
// `src/ui/map/territoryGrid.ts`；04 §4.4／§5.5 標題另寫 `src/ui/map/territory.ts`。依 18 §1.2
// 「各系統文件 §7 任務項若與本文件里程碑歸屬不一致，以本文件為準（歸屬）」與 §1.3「任務的技術
// 規格、公式、型別 → 各系統文件（範圍外，僅引用）」——檔案位置屬本文件（18）擁有之任務分解範疇，
// 型別/公式仍以 04 為準（本檔逐字對照）——故取 18 之檔名 `territoryGrid.ts`。
//
// 設計要點：
// - 建構／重繪為**純函式**（無 Pixi 相依），供 node 環境直接測試（17 §3.2，與 mapDraw.ts 同慣例）；
//   Pixi `Sprite`/`Texture` 之建立與 `texture.update()` 呼叫交由 MapRenderer 持有（本檔不 import pixi.js）。
// - 決定論：郡節點依 id 字典序取得穩定索引（districtIds［i］），與 codebase 慣例一致。
// - 效能：`buildTerritoryGrid` 以「掃描線求陸地區間」取代逐 cell ray casting（04 §5.5「先用 polygon
//   AABB 篩」之精神延伸：同一列的陸地判定攤成一次掃描線相交運算，避免 1024² × 多邊形點數的重覆
//   ray casting），最近郡搜尋以「桶＝固定大小陣列（非 Map，避免字串 hash 成本）＋環狀擴張」加速
//   （04 §5.5「128 world unit」桶）。M2-14 DoD：1024 網格建構 <200ms。
// - 顏色：`clanColorNum(colorIndex)`（12 §5.1／tokens.ts）取代 04 §4.6 舊稿之 `clanColors:
//   Record<clanId, hex>` 直接傳入——與 M2-13 既已確立之 `clanColorIndex` 慣例一致（見
//   mapViewTypes.ts `MapStaticData.clanColorIndex` 註解），故 `recolorTerritory` 第三參數命名
//   `clanColorIndex`（非 04 §5.5 逐字之 `clanColors`）。

import type { MapGraph } from '@core/state/mapGraph';
import type { JapanOutlineFile } from '@data/schemas/outline';
import { clanColorNum } from '@ui/styles/tokens';
import { MAPVIEW, WORLD_SIZE } from './mapViewConfig';

/** 04 §4.4：勢力色網格資料（載入時建立一次，`nearestDistrict`/`districtIds` 整局不變）。 */
export interface TerritoryGrid {
  /** 網格邊長（cell 數）＝ MAPVIEW.territoryGridSize（1024）。 */
  size: number;
  /** 每 cell 最近郡的索引（指向 districtIds）；0xFFFF = 海或超距。靜態。 */
  nearestDistrict: Uint16Array;
  /** 索引 → DistrictId 對照。 */
  districtIds: string[];
  /** 供重繪的 RGBA 畫布資料（size×size×4）。 */
  imageData: ImageData;
}

/** `nearestDistrict` 哨兵值：海或超出 `MAPVIEW.territoryMaxDist`（04 §4.4/§5.5）。 */
const SEA_OR_FAR = 0xffff;

/** 均勻分桶加速最近郡搜尋之桶邊長（world unit，04 §5.5「均勻網格（128 world unit）」）。 */
const BUCKET_SIZE = 128;
/** 桶格每邊桶數（4096 / 128 = 32）；以固定大小陣列索引取代 Map，避免字串 hash 成本。 */
const BUCKETS_PER_SIDE = Math.ceil(WORLD_SIZE / BUCKET_SIZE);
/** 最近郡搜尋之環狀擴張上限（04 §5.5「向外環狀擴張搜尋…找到後再檢查一圈」之保守上界，
 *  涵蓋 `territoryMaxDist` 所需之桶環數＋1 圈安全餘裕，見檔尾 `findNearestDistrict` 說明）。 */
const MAX_SEARCH_RING = Math.ceil(MAPVIEW.territoryMaxDist / BUCKET_SIZE) + 1;

/** pass1 clanIdx 哨兵：海／超距、無主（與任何合法 colorIndex 0..39 不相交）。 */
const CLAN_IDX_SEA = -1;
const CLAN_IDX_NEUTRAL = -2;

interface DistrictSeed {
  /** 對應 `districtIds` 的索引。 */
  index: number;
  x: number;
  y: number;
}

interface PolygonAabb {
  points: readonly number[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

function polygonAabb(points: readonly number[]): PolygonAabb {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i] ?? 0;
    const y = points[i + 1] ?? 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { points, minX, maxX, minY, maxY };
}

/** 水平線 y=py 與多邊形邊之交點 x 座標（升冪排序；標準 even-odd 掃描線規則）。 */
function scanlineIntersections(points: readonly number[], py: number): number[] {
  const xs: number[] = [];
  const n = points.length / 2;
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    const yi = points[i * 2 + 1] ?? 0;
    const yj = points[j * 2 + 1] ?? 0;
    if (yi > py !== yj > py) {
      const xi = points[i * 2] ?? 0;
      const xj = points[j * 2] ?? 0;
      xs.push(xi + ((py - yi) / (yj - yi)) * (xj - xi));
    }
  }
  xs.sort((a, b) => a - b);
  return xs;
}

/** 給定列（世界座標 y=py）之陸地 x 區間（跨全部 polygon 合併、排序、去重疊；04 §3.3 outline）。 */
function rowLandSpans(polygons: readonly PolygonAabb[], py: number): Array<[number, number]> {
  const raw: Array<[number, number]> = [];
  for (const poly of polygons) {
    if (py < poly.minY || py > poly.maxY) continue; // AABB 篩（04 §5.5「先用 polygon AABB 篩」）
    const xs = scanlineIntersections(poly.points, py);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = xs[k];
      const b = xs[k + 1];
      if (a !== undefined && b !== undefined) raw.push([a, b]);
    }
  }
  raw.sort((a, b) => a[0] - b[0]);
  const merged: Array<[number, number]> = [];
  for (const span of raw) {
    const last = merged[merged.length - 1];
    if (last !== undefined && span[0] <= last[1]) {
      if (span[1] > last[1]) last[1] = span[1];
    } else {
      merged.push([span[0], span[1]]);
    }
  }
  return merged;
}

function clampBucketCoord(v: number): number {
  return Math.max(0, Math.min(BUCKETS_PER_SIDE - 1, v));
}

interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * 郡 seed 整體外接框，外擴 `territoryMaxDist`（效能優化，非 04 §5.5 逐字內容，見檔頭效能設計
 * 要點）：cell 落於此框外時，距離任何郡必超過 `territoryMaxDist`，可跳過環狀搜尋直接判 SEA_OR_FAR。
 * 對「僅載入少數郡（如早期批次資料）但 outline 涵蓋全國」之情形有顯著加速——否則每個陸地 cell
 * 均須窮舉 `MAX_SEARCH_RING` 圈方能確認「附近無郡」，實測全國尺度下會超出 200ms 效能門檻。
 * 回傳 `null` 表示無任何郡節點（全網格皆為 SEA_OR_FAR）。
 */
function seedsBoundsExpanded(seeds: readonly DistrictSeed[]): Bounds | null {
  if (seeds.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const s of seeds) {
    if (s.x < minX) minX = s.x;
    if (s.x > maxX) maxX = s.x;
    if (s.y < minY) minY = s.y;
    if (s.y > maxY) maxY = s.y;
  }
  const m = MAPVIEW.territoryMaxDist;
  return { minX: minX - m, maxX: maxX + m, minY: minY - m, maxY: maxY + m };
}

/** 郡節點依 id 字典序分桶（04 §5.5「buckets ← 均勻網格內放全部郡節點」）。 */
function buildBuckets(seeds: readonly DistrictSeed[]): Array<DistrictSeed[] | undefined> {
  const buckets = new Array<DistrictSeed[] | undefined>(BUCKETS_PER_SIDE * BUCKETS_PER_SIDE);
  for (const seed of seeds) {
    const bx = clampBucketCoord(Math.floor(seed.x / BUCKET_SIZE));
    const by = clampBucketCoord(Math.floor(seed.y / BUCKET_SIZE));
    const idx = by * BUCKETS_PER_SIDE + bx;
    const bucket = buckets[idx];
    if (bucket === undefined) buckets[idx] = [seed];
    else bucket.push(seed);
  }
  return buckets;
}

/**
 * 由 (px,py) 所在桶向外環狀擴張搜尋最近郡 seed（04 §5.5）。窮舉搜尋至 `MAX_SEARCH_RING`
 * （已涵蓋 `territoryMaxDist` 所需桶環數＋1 圈餘裕，見常數註解），故不需「找到即停」的提前終止
 * 判斷——避免邊界情形下提前停止漏掉真正最近點（較 04 §5.5 pseudocode 之簡化提前終止更保守正確）。
 */
function findNearestDistrict(
  px: number,
  py: number,
  buckets: readonly (DistrictSeed[] | undefined)[],
): { seed: DistrictSeed; dist: number } | null {
  const bx0 = Math.floor(px / BUCKET_SIZE);
  const by0 = Math.floor(py / BUCKET_SIZE);
  let best: DistrictSeed | null = null;
  let bestDist = Infinity;
  for (let ring = 0; ring <= MAX_SEARCH_RING; ring += 1) {
    for (let dx = -ring; dx <= ring; dx += 1) {
      const bx = bx0 + dx;
      if (bx < 0 || bx >= BUCKETS_PER_SIDE) continue;
      for (let dy = -ring; dy <= ring; dy += 1) {
        // 只掃這一圈的外框（|dx|或|dy|＝ring）；內部格已被較小 ring 掃過，略過避免重複計算。
        if (Math.abs(dx) !== ring && Math.abs(dy) !== ring) continue;
        const by = by0 + dy;
        if (by < 0 || by >= BUCKETS_PER_SIDE) continue;
        const bucket = buckets[by * BUCKETS_PER_SIDE + bx];
        if (bucket === undefined) continue;
        for (const seed of bucket) {
          const d = Math.hypot(seed.x - px, seed.y - py);
          if (d < bestDist) {
            bestDist = d;
            best = seed;
          }
        }
      }
    }
  }
  return best === null ? null : { seed: best, dist: bestDist };
}

/** 供瀏覽器與測試環境共用：以結構相容物件替代（jsdom／node 未實作 `ImageData` 建構子）。 */
function makeImageData(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  if (typeof ImageData !== 'undefined') return new ImageData(data, width, height);
  return { data, width, height, colorSpace: 'srgb' };
}

/**
 * 載入時一次性建構 `TerritoryGrid`（04 §5.5 `buildTerritoryGrid`）：對每個 cell 求最近郡節點
 * （均勻網格桶加速），cell 中心不在任何陸地 polygon 內、或最近郡距離 > `territoryMaxDist` 者
 * 標記 `SEA_OR_FAR`。`imageData` 初始為全透明（首次 `recolorTerritory` 前的預設值）。
 */
export function buildTerritoryGrid(graph: MapGraph, outline: JapanOutlineFile): TerritoryGrid {
  const size = MAPVIEW.territoryGridSize;
  const cellW = WORLD_SIZE / size; // 04 §5.5：cellW ← 4096 / 1024

  const districtNodes = [...graph.nodes.values()]
    .filter((n) => n.kind === 'district')
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const districtIds = districtNodes.map((n) => n.id as string);
  const seeds: DistrictSeed[] = districtNodes.map((n, index) => ({
    index,
    x: n.pos.x,
    y: n.pos.y,
  }));
  const buckets = buildBuckets(seeds);
  const polygons = outline.polygons.map((p) => polygonAabb(p.points));
  const bounds = seedsBoundsExpanded(seeds);

  const nearestDistrict = new Uint16Array(size * size);
  for (let cy = 0; cy < size; cy += 1) {
    const py = (cy + 0.5) * cellW;
    const spans = rowLandSpans(polygons, py);
    const rowInBounds = bounds !== null && py >= bounds.minY && py <= bounds.maxY;
    let spanIdx = 0;
    for (let cx = 0; cx < size; cx += 1) {
      const px = (cx + 0.5) * cellW;
      while (spanIdx < spans.length) {
        const span = spans[spanIdx];
        if (span === undefined || px < span[1]) break;
        spanIdx += 1;
      }
      const span = spans[spanIdx];
      const isLand = span !== undefined && px >= span[0] && px < span[1];
      const i = cy * size + cx;
      if (!isLand || !rowInBounds || bounds === null || px < bounds.minX || px > bounds.maxX) {
        nearestDistrict[i] = SEA_OR_FAR;
        continue;
      }
      const found = findNearestDistrict(px, py, buckets);
      nearestDistrict[i] =
        found !== null && found.dist <= MAPVIEW.territoryMaxDist ? found.seed.index : SEA_OR_FAR;
    }
  }

  const imageData = makeImageData(size, size);
  return { size, nearestDistrict, districtIds, imageData };
}

/** 24bit hex（0xRRGGBB）拆解為 RGB 通道（供寫入 RGBA buffer）。 */
function splitRgb(color: number): { r: number; g: number; b: number } {
  return { r: (color >> 16) & 0xff, g: (color >> 8) & 0xff, b: color & 0xff };
}

/** 依 `clanColorIndex` 取 cell 之 pass1 勢力索引（owner 缺對照或索引非法時退回中性，與
 *  mapDraw.ts `ownerColor` 同慣例）。 */
function clanIdxOf(
  districtId: string | undefined,
  districtOwner: Readonly<Record<string, string | null>>,
  clanColorIndex: Readonly<Record<string, number>>,
): number {
  if (districtId === undefined) return CLAN_IDX_NEUTRAL;
  const owner = districtOwner[districtId] ?? null;
  if (owner === null) return CLAN_IDX_NEUTRAL;
  const idx = clanColorIndex[owner];
  if (idx === undefined || !Number.isInteger(idx) || idx < 0 || idx >= 40) return CLAN_IDX_NEUTRAL;
  return idx;
}

/**
 * 郡歸屬 dirty 時重繪（04 §5.5 `recolorTerritory`；呼叫端負責「每幀至多一次」之節流與
 * `texture.update()`，本函式僅同步計算＋寫入 `grid.imageData`）：
 * - pass1：每 cell 之勢力索引（海／超距＝`CLAN_IDX_SEA`；無主＝`CLAN_IDX_NEUTRAL`；否則 colorIndex）。
 * - pass2：base 色（clan 色／中性灰／透明海）寫入 RGBA；同一 pass 內對每 cell 檢查右鄰／下鄰，
 *   勢力索引不同則兩側各乘 `MAPVIEW.colors.borderDarken`（界線烘焙，兩次差異各自獨立疊乘）。
 */
export function recolorTerritory(
  grid: TerritoryGrid,
  districtOwner: Readonly<Record<string, string | null>>,
  clanColorIndex: Readonly<Record<string, number>>,
): void {
  const { size, nearestDistrict, districtIds, imageData } = grid;
  const n = size * size;
  const clanIdx = new Int8Array(n); // -1/-2 哨兵 + 0..39 合法值，Int8Array 足夠

  // pass1
  for (let i = 0; i < n; i += 1) {
    const di = nearestDistrict[i] ?? SEA_OR_FAR;
    clanIdx[i] =
      di === SEA_OR_FAR ? CLAN_IDX_SEA : clanIdxOf(districtIds[di], districtOwner, clanColorIndex);
  }

  const data = imageData.data;
  // pass2a：base 色。
  for (let i = 0; i < n; i += 1) {
    const idx = clanIdx[i] ?? CLAN_IDX_SEA;
    const o = i * 4;
    if (idx === CLAN_IDX_SEA) {
      data[o] = 0;
      data[o + 1] = 0;
      data[o + 2] = 0;
      data[o + 3] = 0; // 透明(海)
      continue;
    }
    const color = idx === CLAN_IDX_NEUTRAL ? MAPVIEW.colors.neutral : clanColorNum(idx);
    const { r, g, b } = splitRgb(color);
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = 255;
  }

  // pass2b：界線烘焙（右鄰／下鄰各自獨立判斷，符合則兩側各乘一次 borderDarken）。
  const darken = MAPVIEW.colors.borderDarken;
  const darkenPixel = (i: number): void => {
    const o = i * 4;
    data[o] = Math.round((data[o] ?? 0) * darken);
    data[o + 1] = Math.round((data[o + 1] ?? 0) * darken);
    data[o + 2] = Math.round((data[o + 2] ?? 0) * darken);
  };
  for (let cy = 0; cy < size; cy += 1) {
    for (let cx = 0; cx < size; cx += 1) {
      const i = cy * size + cx;
      if (cx + 1 < size) {
        const right = i + 1;
        if (clanIdx[right] !== clanIdx[i]) {
          darkenPixel(i);
          darkenPixel(right);
        }
      }
      if (cy + 1 < size) {
        const below = i + size;
        if (clanIdx[below] !== clanIdx[i]) {
          darkenPixel(i);
          darkenPixel(below);
        }
      }
    }
  }
}
