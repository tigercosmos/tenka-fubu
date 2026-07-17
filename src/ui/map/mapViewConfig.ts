// 地圖渲染設定常數（`MAPVIEW`）——非 BAL。
//
// 規格：plan/04-map-and-movement.md §4.5（原樣收錄）、§8-D8（為何放 MAPVIEW 而非 BAL：
// 00 §11 的 BAL 管遊戲性數值；鏡頭縮放範圍、LOD 門檻、網格解析度、慣性阻尼等純呈現層
// 參數不影響模擬結果、不進 golden，屬渲染設定，集中於本檔）。渲染程式一律引用 `MAPVIEW.*`，
// 不得散落魔術數字（M2-13；04-T8）。
//
// 色彩：`MAPVIEW.colors` 之 sea/land/neutral 已遷移為引用 `src/ui/styles/tokens.ts` 的
// `MAP_PALETTE_NUM`（M6-V5，VD7；地圖色票具名常數化，真相在 tokens.ts）；`borderDarken`/
// `pathOk`/`pathBad`/`awe` 非地圖色票範疇，維持原值。

import { MAP_PALETTE_NUM } from '@ui/styles/tokens';

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
  /**
   * 拖曳／點選判別門檻（螢幕 px）：按下後指標位移超過此值即視為「拖曳平移」，
   * 結束時吞掉 Pixi 補發的 pointertap，避免誤觸節點點選（§3.11／§3.12.2 之接線細節，
   * M2-15 鏡頭整合進 MapRenderer 時補入；純輸入互動常數，不影響模擬結果、不進 golden）。
   */
  dragTapThresholdPx: 4,
  lodFarScale: 0.5,
  lodNearScale: 1.0, // 新增（M6-V5，VD3）：mid/near 段界，語意獨立於 labelScale（雖同值）
  labelScale: 1.0, // LOD 門檻
  lodHysteresis: 0.1, // 新增（M6-V5，VD3）：三段 LOD 滾輪連續縮放的 10% 死區
  cullMargin: 256,
  cullBucket: 256, // 視錐剔除外擴與桶邊長（world unit）
  territoryGridSize: 1024, // 勢力色網格解析度
  territoryMaxDist: 260, // 郡域最大延伸距離（world unit）
  territoryAlpha: 0.45, // 郡域紋理透明度（一般/遠 LOD 0.65/勢力圖 0.85）
  territoryAlphaFar: 0.65, // 新增（M6-V5，VD3）：far LOD 郡域紋理透明度
  territoryAlphaFaction: 0.85, // 新增（M6-V5，VD3）：勢力分析圖模式郡域紋理透明度
  colors: {
    // sea/land/neutral 遷移自 MAP_PALETTE_NUM（M6-V5，VD7）；其餘為既有建議值
    sea: MAP_PALETTE_NUM.seaDeep,
    land: MAP_PALETTE_NUM.landBase,
    neutral: MAP_PALETTE_NUM.neutral,
    borderDarken: 0.55,
    pathOk: 0xffffff,
    pathBad: 0xcc3333,
    awe: 0xe8b93f,
  },
  hitRadius: { army: 16, castleMain: 20, castleBranch: 16, district: 12 }, // 命中半徑（world unit）
  /** 命中測試 CSS-px 半徑下限（world 有效半徑＝hitMinCssRadius/scale；達 ~32 CSS px 命中區，04 §3.12.1 DoD）。僅套用於城/郡節點。 */
  hitMinCssRadius: 16,
  /** 補給 badge 門檻（對 MapArmyView.foodDays；顯示鏡射 BAL.autoReturnFoodDays=7，不 import BAL，M6-V8 V8D5）。 */
  armySupplyLowDays: 7, // foodDays 3..<7：低（米袋缺口）
  armySupplyCriticalDays: 3, // foodDays <3：危急（空袋＋驚嘆三角）
  /** 兵力量感三級旗幅門檻（人數；M6-V8 V8D2）。 */
  armySoldierTierMid: 1000, // <1000：small；1000..<3000：mid
  armySoldierTierLarge: 3000, // >=3000：large
  /** far LOD 軍隊 chip container 反向放大（M6-V8 V8D13；transform，非重繪；比照主城 far ×1.4）。 */
  armyFarChipScale: 2.4,
  /** 道路名標籤沿道路法線之偏移（world unit，偏上避開 casing；V6D5）。 */
  roadLabelOffset: 10,
  /**
   * M6-V2 固定截圖三段鏡頭 preset（17 §3.9.3；由 `TenkaDebugApi.setMapCameraPreset` 消費，
   * 見 src/app/debug.ts）：`visualOverviewScale`(0.25) 落在 `lodFarScale`(0.5) 之下＝far LOD
   * （地形輪廓／主幹道層級）；`visualOperationalScale`(0.5) 恰為 `lodFarScale` 邊界本身
   * （`lodModeForScale` 於 `scale>=lodFarScale` 即回傳 'near'，故已屬 near LOD，可見次要道路／
   * 支城）；`visualCloseScale`(1.25) 高於 `labelScale`(1.0)＝觸發詳細標籤／士氣／補給等 close-only
   * 資訊（見 `shouldShowDetailLabels`，lod.ts）。三值僅供除錯 API 使用、不影響一般互動流程
   * （滾輪／focusOn 仍用 `wheelZoomStep`/`focusScale`），故獨立命名而非覆用既有欄位。
   */
  visualOverviewScale: 0.25,
  visualOperationalScale: 0.5,
  visualCloseScale: 1.25,
} as const;

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

/** 河川 widthClass → 線寬（world unit）；上游細下游寬另由 taper 逐段內插達成（terrainDraw，M6-V5）。 */
export const RIVER_WIDTH: Readonly<Record<1 | 2 | 3, number>> = { 1: 2, 2: 4, 3: 7 };

/** 河川沿線起端相對寬度比例（0..1）；末端＝1（下游最寬）（M6-V5）。 */
export const RIVER_TAPER_HEAD = 0.4;

/** relief／forest 烘焙紋理邊長（world unit 覆蓋範圍）；Sprite setSize 用（M6-V5）。 */
export const TERRAIN_SPRITE_WORLD = WORLD_SIZE;

/** forest Sprite 各 LOD 段 alpha（far 低 alpha 亦顯，回應「米黃平面」抱怨；M6-V5，VD3／§10-(7)）。 */
export const FOREST_ALPHA: Readonly<Record<'far' | 'mid' | 'near', number>> = {
  far: 0.35,
  mid: 0.85,
  near: 0.9,
};

// ---------------------------------------------------------------------------
// M6-V6：道路／橋樑渲染常數（Slice B）。線寬為 near（scale 1.25）基準，
// `RoadsLayer.setStage` 依 `ROAD_STAGE_WIDTH_MULT` 乘 stage 倍率後重描，
// 使螢幕外觀於 far/mid/near 三段近似恆定（V6D3）。顏色一律取 MAP_PALETTE_NUM
// （V6 不新增顏色 token）。舊 `ROAD_GRADE_WIDTH`／`SEA_ROUTE_DASH` 已隨 `drawRoads`
// 於 Slice F 汰除（V6D10）——道路線寬/線型改由下列 V6 常數 + `setStage` 倍率描繪。
// ---------------------------------------------------------------------------

/** 道級 casing（外框）線寬（world unit，near 基準）：grade 1/2/3（V6D3）。 */
export const ROAD_CASING_WIDTH: Readonly<Record<1 | 2 | 3, number>> = { 1: 1.5, 2: 2.5, 3: 4 };

/** 道級內線線寬（world unit，near 基準）：grade 1/2/3（V6D3）。 */
export const ROAD_INNER_WIDTH: Readonly<Record<1 | 2 | 3, number>> = { 1: 1.0, 2: 1.2, 3: 2.0 };

/** grade1 小路內線節線 dash/gap（world unit，near 基準）（V6D3）。 */
export const ROAD_PATH_DASH = { dash: 5, gap: 4 } as const;

/** 海路內線長節線 dash/gap（world unit，near 基準）（V6D3）。 */
export const SEA_ROUTE_KNOT = { dash: 14, gap: 10 } as const;

/** 海路外 halo／內線線寬（world unit，near 基準）；皆 waterRiver 家族（V6D3）。 */
export const SEA_ROUTE_WIDTH = { outer: 3, inner: 1.5 } as const;

/** 海路外 halo 之 alpha（低 alpha 水暈，內線／波節全 alpha）。 */
export const SEA_ROUTE_OUTER_ALPHA = 0.5;

/** 海路週期波節：每 spacing 世界單位一枚半圓弧、半徑 radius（僅落海之段繪製；near 基準）。 */
export const SEA_WAVE = { spacing: 40, radius: 3 } as const;

/** 橋樑幾何（world unit，near 基準）。 */
export const BRIDGE = { deckLength: 16, deckWidth: 9, abutment: 3 } as const;

/**
 * per-stage 線寬倍率（螢幕近似恆定＝1.25/stageScale；V6D3-B）。`RoadsLayer.setStage`
 * 乘於所有線寬／節線／波節／橋樑幾何，避免固定世界線寬在 far(0.25) 呈次像素。
 * 以 inline 字面聯集 `'far'|'mid'|'near'` 為鍵，刻意不 import `LodStage`
 * （避免 `mapViewConfig` ↔ `lod` 循環依賴，`lod.ts` 已 import `MAPVIEW`）。
 */
export const ROAD_STAGE_WIDTH_MULT: Readonly<Record<'far' | 'mid' | 'near', number>> = {
  far: 5,
  mid: 2.5,
  near: 1,
};
