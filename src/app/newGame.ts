// M1 暫時性「新遊戲」啟動（11 §3.2/§3.3 縮減版；18-roadmap.md M1-20）。
//
// 非 M2-19 正式版（ScenarioSelectScreen→DaimyoSelectScreen→劇本 JSON zod 驗證→builder 資料側
// 補值，見 src/app/boot.ts 檔頭與 18-roadmap.md M2-19）：M1 尚無劇本 JSON／zod schema 資料側管線
// （14/M2 範圍），`src/app/boot.ts` 明文留待該里程碑。為讓 M1-20 的「標題→新遊戲→主畫面」流程與
// HUD／除錯面板（M1-22）能先行運作，本檔直接沿用 M1-13 官方 tiny 劇本 fixture
// （`tests/fixtures/tiny.ts`：2 勢力／3 城／6 郡／6 武將，`buildGameState` 建置後 `validateState`
// 零違規）建局。M2-19 落地真正的新遊戲精靈後，本檔可移除、`TitleScreen`／`App.tsx` 改接該流程。
//
// 種子：`?seed=` 有值即覆蓋 tiny fixture 預設種子（01 §3.11.1）；未給則隨機——**此隨機僅在 app 層
// 用於「挑一個種子」，種子本身之後仍交給 core 的決定性 mulberry32（`initRng`）**，不違反 00 §5.5
// （core 內部才是決定論唯一真相來源；ESLint 對 `Math.random` 的禁令只及於 `src/core/**`）。

import { buildTinyState } from '../../tests/fixtures/tiny';
import type { GameState } from '@core/state/gameState';
import type { DebugFlags } from './debug';

/** 建立 M1 示範新局：種子依 debugFlags 覆蓋（未給則隨機），並依 `?debug=1` 設定 `meta.debugMode`。 */
export function startNewDemoGame(flags: Pick<DebugFlags, 'seed' | 'enabled'>): GameState {
  const seed = flags.seed ?? Math.floor(Math.random() * 0x100000000);
  const state = buildTinyState({ seed });
  state.meta.debugMode = flags.enabled; // ?debug=1 → debugSkipDays/debugGrant 解閘（03 §3.9；01）
  return state;
}
