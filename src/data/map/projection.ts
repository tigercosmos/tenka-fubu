// 經緯度 → 4096×4096 世界座標投影常數與函式。
// 規格：plan/00-foundations.md §8（canonical 投影公式，不得更改）、
// plan/04-map-and-movement.md §3.2（投影常數／`lonLatToWorld` 原樣收錄）、T1（本檔驗收）。
// M2-4 實作（18-roadmap.md §3.5）。

/** 世界座標（world unit，整數，0..4096；04 §3.2／02 `pos` 欄位型別）。 */
export interface WorldPos {
  readonly x: number;
  readonly y: number;
}

/** 00 §8 canonical 投影常數（04 §3.2 原樣收錄，不得更改）。 */
export const PROJECTION = {
  lonMin: 128.5,
  lonMax: 146.0, // 經度範圍（度）
  latMin: 30.5,
  latMax: 45.8, // 緯度範圍（度）
  worldSize: 4096, // 世界空間邊長（world unit）
} as const;

/**
 * 經緯度（度）→ 世界座標（world unit，取整數）。
 * canonical 線性投影公式（00 §8／04 §3.2），不得更改：
 *   x = (lon − lonMin) / (lonMax − lonMin) × worldSize
 *   y = (latMax − lat) / (latMax − latMin) × worldSize
 */
export function lonLatToWorld(lon: number, lat: number): WorldPos {
  const { lonMin, lonMax, latMin, latMax, worldSize } = PROJECTION;
  return {
    x: Math.round(((lon - lonMin) / (lonMax - lonMin)) * worldSize),
    y: Math.round(((latMax - lat) / (latMax - latMin)) * worldSize),
  };
}

/** 座標製作／除錯用錨點一筆（經緯度＋投影後之基準世界座標）。 */
export interface AnchorPoint {
  readonly name: string;
  readonly lon: number;
  readonly lat: number;
  readonly world: WorldPos;
}

/**
 * 04 §3.2 六點錨點表（供資料製作與除錯參考）。
 * 04-T1 驗收基準：對每一筆呼叫 `lonLatToWorld(lon, lat)`，與 `world` 誤差須 ≤ 1 world unit。
 */
export const ANCHOR_POINTS_6: readonly AnchorPoint[] = [
  { name: '清洲（尾張）', lon: 136.9, lat: 35.2, world: { x: 1966, y: 2838 } },
  { name: '京都', lon: 135.77, lat: 35.01, world: { x: 1701, y: 2889 } },
  { name: '江戶', lon: 139.7, lat: 35.68, world: { x: 2621, y: 2709 } },
  { name: '下關', lon: 130.94, lat: 33.95, world: { x: 571, y: 3172 } },
  { name: '鹿兒島', lon: 130.55, lat: 31.6, world: { x: 480, y: 3801 } },
  { name: '青森（津輕）', lon: 140.74, lat: 40.82, world: { x: 2866, y: 1333 } },
] as const;

/**
 * 14-scenario-data.md §3.4 座標製作規範之 20 錨點對照表（劇本資料製作／`tools/anchors.ts`
 * V13 驗證重用；容差為 `BAL.dataAnchorTolerance` = 16 world unit，15 §5.1／14 §3.4，
 * 與上方 `ANCHOR_POINTS_6` 的 04-T1「≤1 world unit」公式正確性驗收為不同用途、不同容差）。
 * 註：# 1／2／7／20 取自 04 §3.2 六點表原值（14 §3.4 表末註）。
 */
export const ANCHOR_POINTS_20: readonly AnchorPoint[] = [
  { name: '京都・二條御所', lon: 135.77, lat: 35.01, world: { x: 1701, y: 2889 } },
  { name: '清洲城', lon: 136.9, lat: 35.2, world: { x: 1966, y: 2838 } },
  { name: '那古野城', lon: 136.91, lat: 35.18, world: { x: 1968, y: 2843 } },
  { name: '岡崎城', lon: 137.17, lat: 34.95, world: { x: 2029, y: 2905 } },
  { name: '駿府館', lon: 138.38, lat: 34.98, world: { x: 2312, y: 2897 } },
  { name: '小田原城', lon: 139.15, lat: 35.26, world: { x: 2493, y: 2822 } },
  { name: '江戶城', lon: 139.7, lat: 35.68, world: { x: 2621, y: 2709 } },
  { name: '躑躅崎館', lon: 138.57, lat: 35.67, world: { x: 2357, y: 2712 } },
  { name: '春日山城', lon: 138.25, lat: 37.15, world: { x: 2282, y: 2316 } },
  { name: '稻葉山城', lon: 136.78, lat: 35.44, world: { x: 1938, y: 2774 } },
  { name: '觀音寺城', lon: 136.13, lat: 35.15, world: { x: 1786, y: 2851 } },
  { name: '石山御坊', lon: 135.51, lat: 34.68, world: { x: 1641, y: 2977 } },
  { name: '一乘谷城', lon: 136.24, lat: 36.02, world: { x: 1812, y: 2618 } },
  { name: '米澤城', lon: 140.12, lat: 37.92, world: { x: 2720, y: 2110 } },
  { name: '吉田郡山城', lon: 132.7, lat: 34.67, world: { x: 983, y: 2980 } },
  { name: '月山富田城', lon: 133.24, lat: 35.38, world: { x: 1109, y: 2790 } },
  { name: '湯築城', lon: 132.77, lat: 33.84, world: { x: 999, y: 3202 } },
  { name: '岡豐城', lon: 133.64, lat: 33.6, world: { x: 1203, y: 3266 } },
  { name: '府內館', lon: 131.61, lat: 33.24, world: { x: 728, y: 3362 } },
  { name: '內城（鹿兒島）', lon: 130.55, lat: 31.6, world: { x: 480, y: 3801 } },
] as const;
