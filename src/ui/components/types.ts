// 跨元件共用型別（規格：plan/12-ui-components.md §4）。
//
// 12 §4：「元件 props 已於 §3.2 定義；本節為跨元件共用型別。全部放
// src/ui/components/types.ts，遊戲實體型別一律 import 自 02。」
//
// 本檔目前收錄 M2-16（sceneParts CastleNode/DistrictNode/SelectionRing，12-T10 部分）所需的
// 兩型別（`SceneFlags`／`ScenePart<P>`）與 M2-18（MiniMap，12-T9）之 `MiniMapModel`。
// `MiniMapModel` 由 core selector `selectMiniMapModel` 產生（其形狀因而定義於
// `src/core/state/selectors.ts`，core 不得 import UI 型別，見該檔裁決），本檔僅轉出，
// 供 UI 元件從單一位置 import。§4 另列的 `SortState`／`ReportSeverity` 待其消費元件
// （DataTable/ReportStack，12 §7 T5/T8，M3+）落地時一併補上，避免本檔存在未被任何模組
// 使用的推測性型別。

import type { Container } from 'pixi.js';

export type { MiniMapModel, MiniMapPoint } from '@core/state/selectors';

/** Pixi sceneParts 共用旗標（由 UI 層注入；12 §4）。 */
export interface SceneFlags {
  reduceMotion: boolean;
}

/**
 * sceneParts 工廠統一介面（12 §4／§3.3：「每個一檔，工廠函式回傳 Container 與
 * update(props) 方法」）。`update` 冪等：僅在 props 相對前次呼叫變更時才重繪。
 */
export interface ScenePart<P> {
  container: Container;
  update(props: P): void;
  destroy(): void;
}
