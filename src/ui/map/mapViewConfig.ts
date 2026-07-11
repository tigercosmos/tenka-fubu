// 地圖渲染設定常數（`MAPVIEW`）——非 BAL。
//
// 規格：plan/04-map-and-movement.md §4.5（原樣收錄）、§8-D8（為何放 MAPVIEW 而非 BAL：
// 00 §11 的 BAL 管遊戲性數值；鏡頭縮放範圍、LOD 門檻、網格解析度、慣性阻尼等純呈現層
// 參數不影響模擬結果、不進 golden，屬渲染設定，集中於本檔）。渲染程式一律引用 `MAPVIEW.*`，
// 不得散落魔術數字（M2-13；04-T8）。
//
// 色彩：`MAPVIEW.colors` 為建議值，design token 覆蓋參見 plan/12（04 §4.5 註）。目前 tokens.ts
// 未定義地圖海／陸色，故本檔即為海陸與路徑/威風/界線色的真相來源；日後若 12 定義覆蓋 token，
// 於此改為引用（回寫 §8）。

export const MAPVIEW = {
  minScale: 0.15,
  maxScale: 4.0, // 鏡頭縮放範圍（螢幕 px / world unit）
  wheelZoomStep: 1.1, // 滾輪每格倍率
  inertiaDamping: 0.92, // 慣性每幀衰減
  inertiaMinSpeed: 0.02, // 慣性停止閾值（world unit/幀）
  focusDurationMs: 600,
  focusScale: 1.5, // focusOn 預設
  /**
   * 平移（拖曳／鍵盤）中心點夾限：世界範圍外擴（world unit，§3.11／§8-D13）。
   * §4.5 原文將此值寫死於敘述文字（未收錄進本常數表）；D13 補上以消除 `camera.ts`
   * 內的散落魔術數字。刻意不用於縮放錨點（`onWheel`）——夾限縮放後中心點會使游標下
   * 世界點漂移，牴觸 04-T10 驗收（縮放前後 `screenToWorld` 誤差 < 0.5）。
   */
  panBoundsPadding: 128,
  lodFarScale: 0.5,
  labelScale: 1.0, // LOD 門檻
  cullMargin: 256,
  cullBucket: 256, // 視錐剔除外擴與桶邊長（world unit）
  territoryGridSize: 1024, // 勢力色網格解析度
  territoryMaxDist: 260, // 郡域最大延伸距離（world unit）
  territoryAlpha: 0.45, // 郡域紋理透明度（一般/遠 LOD 0.65/勢力圖 0.85）
  colors: {
    // 建議值；design token 覆蓋參見 plan/12
    sea: 0x27303d,
    land: 0xcfc6ae,
    neutral: 0x8a8578,
    borderDarken: 0.55,
    pathOk: 0xffffff,
    pathBad: 0xcc3333,
    awe: 0xe8b93f,
  },
  hitRadius: { army: 16, castleMain: 20, castleBranch: 16, district: 12 }, // 命中半徑（world unit）
} as const;

/** 街道道級 → 線寬（world unit）：grade 1/2/3 = 1.5/2.5/3.5（04 §3.10.1 圖層 2「roads」）。 */
export const ROAD_GRADE_WIDTH: Readonly<Record<1 | 2 | 3, number>> = {
  1: 1.5,
  2: 2.5,
  3: 3.5,
};

/** 海路虛線 dash/gap（world unit）：12/8（04 §3.10.1 圖層 2「roads」）。 */
export const SEA_ROUTE_DASH = { dash: 12, gap: 8 } as const;

/**
 * 節點標記幾何（04 §3.10.1 圖層 3「nodeMarkers」）——本階段（M2-13）骨架的簡化占位值：
 * 城＝五角天守形、郡＝菱形點；owner 勢力色填色，描邊 ink。M2-16（sceneParts CastleNode/
 * DistrictNode/SelectionRing，12-T10）以正式繪製參數與本城/支城區分取代之。
 * 半徑為 world unit。
 */
export const NODE_MARKER = {
  castleRadius: 12, // 城天守外接圓半徑
  districtRadius: 7, // 郡菱形外接圓半徑
  strokeWidth: 1.5, // 描邊寬（world unit）
} as const;

/** 世界空間邊長（world unit）；投影常數的真相在 `@data/map/projection` PROJECTION.worldSize。 */
export const WORLD_SIZE = 4096;
