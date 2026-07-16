// M6-V2：MapRenderer 執行期單例登記——供 `window.__TENKA_DEBUG__`（src/app/debug.ts）的地圖鏡頭
// preset／idle 等待呼叫取得目前掛載中的渲染器實例。純 UI 邊界模組（無 core import；不得被
// `src/core/**` 參照）。
// 規格：plan/17-testing.md §3.9.3（三段鏡頭截圖 harness）；本檔為 orchestrator 交辦之
// 「debug bridge 小模組」（見 M6-V2 任務說明第 4 點）。
//
// 同時最多一個 `MapCanvasHost` 掛載（MainScreen 單一地圖，01 §3.6.1），故單一模組層級變數已足夠；
// `unregister` 以身分比對（`===`）而非單純清空，避免 StrictMode 雙掛載時「新渲染器已 register，
// 舊渲染器的 cleanup 才執行」的時序把新渲染器的登記覆蓋清空。

import type { MapRenderer } from './MapRenderer';

let active: MapRenderer | null = null;

/** `MapCanvasHost` 於 `renderer.init` 成功完成（且未在等待期間被卸載）後呼叫。 */
export function registerDebugMapRenderer(renderer: MapRenderer): void {
  active = renderer;
}

/** `MapCanvasHost` 於 unmount 時呼叫；僅在目前登記者正是自己時才清空。 */
export function unregisterDebugMapRenderer(renderer: MapRenderer): void {
  if (active === renderer) active = null;
}

/** 供 `TenkaDebugApi`（src/app/debug.ts）讀取；尚未掛載任何含地圖畫面時為 `null`。 */
export function getDebugMapRenderer(): MapRenderer | null {
  return active;
}

/** 測試專用：重置模組層級狀態，避免跨測試檔洩漏。 */
export function resetDebugMapRendererForTests(): void {
  active = null;
}
