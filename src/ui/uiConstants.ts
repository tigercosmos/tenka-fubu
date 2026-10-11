// UI 呈現常數（`UI`）——非 BAL。
//
// 規格：plan/12-ui-components.md §3.1.8（原樣收錄）。純呈現值（不影響模擬結果、不進
// golden）集中於此，理由見 12 §8 決策 D1：BAL（`src/core/balance.ts`）管遊戲性數值，
// UI 呈現參數（Tooltip 延遲、Toast 時長、耐久環變色門檻等）另放本檔，避免污染平衡主表、
// 也避免 core 承載 UI 概念。呈現程式一律引用 `UI.*`，不得散落魔術數字。
//
// 首個消費者：M2-16（12-T10 部分）sceneParts CastleNode（`durabilityRingWarn`/
// `durabilityRingDanger`）。其餘欄位供後續里程碑（Tooltip/Toast/DataTable/MiniMap/
// ArmyChip 士氣點/設定 UI）消費時沿用本表，不重複定義。

export const UI = {
  kassenTickMs: 800,
  uiDprMax: 2,
  uiReportPageSize: 50,
  stateViewerPageSize: 50,
  uiMarchFoodStep: 100,
  uiMarchSoldierStep: 100,
  battleLogMaxRows: 50,
  battleLogNearBottomPx: 32,
  /** Tactical map logical px; fitted positions are shared by canvas and native hit targets. */
  battleMapGeometry: {
    marginX: 60,
    marginTop: 112,
    marginBottom: 52,
    rowPitch: 156,
    nodeRadius: 12,
    unitOffsetY: 62,
    stackStep: 64,
    placementGap: 4,
    stackRowOffset: 22,
    unitHalfWidth: 30,
    flagWidth: 18,
    flagHeight: 26,
    labelSize: 12,
    hitSize: 32,
    nodeHalfWidth: 36,
    nodeTop: 20,
    nodeBottom: 44,
    unitTop: 20,
    unitBottom: 36,
  },
  tooltipDelayMs: 400, // Tooltip 延遲顯示（ms）
  mapTooltipDelayMs: 250, // 04 §6.1 地圖懸停延遲（ms）
  mapTooltipOffsetPx: 16, // 04 §6.1 地圖游標右下偏移（px）
  tooltipFollowOffsetX: 14, // 跟隨游標的 x 位移（px）
  tooltipFollowOffsetY: 18, // 跟隨游標的 y 位移（px）
  toastDurationInfoMs: 6000, // info/success Toast 自動消失（ms）
  uiEventTextSpeedMsPerChar: 18, // 15 §5.2：事件敘事逐字顯示
  toastDurationWarnMs: 10000, // warning Toast 自動消失（ms）
  toastMaxVisible: 5, // Toast 同時顯示上限
  tableRowHeightPx: 40, // DataTable 預設列高（px，固定列高）
  tableOverscanRows: 8, // 虛擬捲動上下各多渲染列數
  virtualizeThreshold: 60, // 列數超過此值且有 height 才啟用虛擬捲動
  minimapSizePx: 224, // MiniMap 邊長（px）
  minimapRedrawMs: 1000, // MiniMap 底圖重繪節流（ms）
  moralePipHigh: 70, // 士氣點顯示分級（僅呈現用；崩潰規則參見 plan/07）
  moralePipLow: 40,
  durabilityRingWarn: 0.6, // 耐久環轉金色門檻（比例）
  durabilityRingDanger: 0.3, // 耐久環轉朱紅門檻（比例）
  uiScaleMin: 0.8, // 介面縮放（16 設定項 #11 `uiScale`）下限
  uiScaleMax: 1.5, // 介面縮放上限
  uiScaleStep: 0.05, // 介面縮放滑桿步進
  initialVisualAssetBytesMax: 8 * 1024 * 1024, // 首屏地圖＋HUD 壓縮後視覺資產預算（8 MiB，12 §3.7；決策 D24）
} as const;
