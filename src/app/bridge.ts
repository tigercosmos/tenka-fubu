// dispatchCommand / publishTick / runOneDay（core ↔ UI 橋接）。
// 規格：plan/01-architecture.md §3.4.3（Command 佇列 API）／§3.4.4（publishTick）／§5.2（runOneDay 流程）。
// M1-15（01-A6）實作。
//
// 佇列實作採 03-game-loop.md 的 `CommandQueue`（core/commands/queue.ts），而非 01 §3.4.3 示意的
// 裸 `Command[]`：`advanceDay` 簽章需要帶 `seq` 的 `CommandEnvelope[]`（03 §4.2），03 已提供完整的
// seq 指派／drain API 且明文「app 層每局持有一個實例」，直接複用不重複造輪（01 §8 D17）。
//
// `evaluateAutoPause` 未在本檔內直接呼叫（避免與 autoPause.ts↔gameLoop.ts 形成循環 import，
// 01 §8 D17）：本檔改為透過 `onAutoPauseReasons` 讓 autoPause.ts 於安裝時註冊回呼，
// `runOneDay` 每 tick 結束呼叫該回呼並傳入 `TickResult.autoPauseReasons`，行為與 01 §5.2
// 步驟 9 等價，只是改由 autoPause.ts 主動訂閱而非本檔主動 import。

import { advanceDay } from '@core/systems/index';
import type { AutoPauseReason, TickResult } from '@core/systems/index';
import { validateCommand } from '@core/commands/validate';
import { CommandQueue } from '@core/commands/queue';
import type { Command } from '@core/commands/types';
import type { GameEvent } from '@core/state/events';
import type { GameState } from '@core/state/gameState';
import { CommandLogRecorder, type CommandLogFile } from '@core/replay/commandLog';
import { CoreError } from '@core/errors';
import { store } from './store';
import { captureFatalError } from './errors';
import { perfMonitor } from './perfMonitor';

let commandQueue = new CommandQueue();
let commandLogGame: GameState | null = null;
const commandLogRecorder = new CommandLogRecorder();

function prepareCommandLog(game: GameState): void {
  if (commandLogGame === game) return;
  commandLogGame = game;
  // 讀檔／換局時必須同步清掉前一局 pending，並從存檔的已消耗 seq 後續接。
  commandQueue = new CommandQueue(game.meta.lastAppliedCmdSeq + 1);
  store.getState().actions.setPendingCommandCount(0);
  // 從進度中存檔開始無法由劇本初始狀態完整重放，明確標記為 truncated。
  commandLogRecorder.reset({
    ...(game.meta.stateVersion !== 0 ? { incompleteReason: 'loadedGame' as const } : {}),
  });
}

/** dispatchCommand 的同步預檢結果（01 §4.5）。
 * `reason` 直接沿用 core `ValidationResult.reasonKey` 原始值（已含 `cmd.reject.` 前綴，見
 * core/commands/reasons.ts）；UI 以 `t(reason)` 顯示，不再如 01 §4.5 註解所述自行組
 * `cmd.reject.${reason}`（該註解假設 reason 為短尾碼，與 03 已定案的全字串 reasonKey 慣例不符，
 * 依 00>02>15>系統文件優先序採已實作之 03 慣例；01 §8 D17）。`'cmd.reject.notBooted'` 為本檔新增
 * 之 app 層專屬原因（game 尚未 boot），沿用相同前綴慣例以利未來 13 統一登錄字串 key。 */
export type CommandDispatchResult =
  { ok: true } | { ok: false; reason: string; params?: Record<string, string | number> };

/** UI 對遊戲狀態的唯一寫入路徑（01 §3.4.3）。 */
export function dispatchCommand(cmd: Command): CommandDispatchResult {
  const game = store.getState().game;
  if (game === null) {
    return { ok: false, reason: 'cmd.reject.notBooted' };
  }
  prepareCommandLog(game);
  const verdict = validateCommand(game, cmd); // 同步預檢，立即回饋 UI（軟驗證；Step 1 仍會再硬驗證一次）
  if (!verdict.ok) {
    // exactOptionalPropertyTypes：verdict.params 為 undefined 時不得顯式帶入該 key。
    return verdict.params === undefined
      ? { ok: false, reason: verdict.reasonKey }
      : { ok: false, reason: verdict.reasonKey, params: verdict.params };
  }
  commandQueue.enqueue(cmd, game.time.day);
  store.getState().actions.setPendingCommandCount(commandQueue.size);
  return { ok: true };
}

type AutoPauseHandler = (reasons: readonly AutoPauseReason[]) => void;
let autoPauseHandler: AutoPauseHandler | null = null;

/** autoPause.ts 安裝掛鉤用（01 §8 D17）；傳 null 解除安裝。 */
export function onAutoPauseReasons(handler: AutoPauseHandler | null): void {
  autoPauseHandler = handler;
}

/**
 * 每 tick 橋接流程（01 §3.4.4／§5.2）：drain 佇列→advanceDay→publishTick→自動暫停判定。
 *
 * 致命錯誤攔截（01 §3.10.2／M1-18）：`advanceDay` 以 try/catch 包住——core 內例外一律代表
 * 缺陷（§3.10.1「例外只用於缺陷」，不論是否為型別化的 `CoreError`），捕獲後經
 * `captureFatalError` 正規化並寫入 `session.fatalError`，顯示與 `ErrorBoundary.tsx` 相同的
 * 致命錯誤畫面（後者走 React 渲染例外，本路徑走 store 狀態，兩者為 01 §3.10.2 描述的兩個獨立
 * 攔截點，見 `src/app/errors.ts` 檔頭）。本函式不直接呼叫 `loop.stop()`（避免與 gameLoop.ts
 * 形成循環 import，同本檔既有 `onAutoPauseReasons` 慣例）：`gameLoop.ts` 的 `onFrame` 於每次
 * `runOneDay()` 後檢查 `session.fatalError`，非 null 時代為停止迴圈。
 */
export function runOneDay(): GameEvent[] {
  const game = store.getState().game;
  if (game === null) {
    throw new CoreError('DATA_INTEGRITY', 'runOneDay: game 尚未初始化');
  }
  prepareCommandLog(game);
  const queue = commandQueue.drain();
  const t0 = performance.now(); // §3.9.4／M1-23：tick 耗時取樣（perfMonitor 環形緩衝）
  let result: TickResult;
  try {
    result = advanceDay(game, queue); // core：就地變異 game（§8-D1）
  } catch (err) {
    perfMonitor.recordTick(performance.now() - t0);
    store.getState().actions.setFatalError(captureFatalError(err));
    return [];
  }
  perfMonitor.recordTick(performance.now() - t0);
  commandLogRecorder.recordTick(result.appliedCommands, {
    ...(result.appliedCommands.length === queue.length
      ? {}
      : { incompleteReason: 'hardRejection' as const }),
  });
  // dev/debugFlags 條件式 invariant 檢查（01 §3.4.4 步驟 7）留待 M1-22（debugFlags 落地）再接線，
  // 避免在尚無 URL 旗標可用時對每個 tick 的最小測試 fixture 強加 25 條不變量。
  store.setState((s) => ({ tickSeq: s.tickSeq + 1 }));
  store.getState().actions.setPendingCommandCount(commandQueue.size);
  autoPauseHandler?.(result.autoPauseReasons);
  return result.events;
}

/** 匯出目前局的 success-only command log；檔案的 hash 對應匯出當下狀態。 */
export function exportCommandLog(): CommandLogFile {
  const game = store.getState().game;
  if (game === null) {
    throw new CoreError('DATA_INTEGRITY', 'exportCommandLog: game 尚未初始化');
  }
  prepareCommandLog(game);
  return commandLogRecorder.export(game);
}

/** 供測試重置模組私有佇列與回呼（非產品程式碼路徑）。 */
export function resetBridgeForTests(): void {
  commandQueue = new CommandQueue();
  commandLogGame = null;
  commandLogRecorder.reset();
  autoPauseHandler = null;
}

/** 供測試直接觸發已註冊的自動暫停回呼（非產品程式碼路徑）：M1 骨架期 `advanceDay` 的
 * `autoPauseReasons` 恆為空陣列（Step 13 尚未實作），無法透過真實 `runOneDay()` 產生非空案例；
 * 本函式讓 tests/app/autoPause.spec.ts 得以驗證 installAutoPause↔bridge 轉譯管線本身。 */
export function triggerAutoPauseHandlerForTests(reasons: readonly AutoPauseReason[]): void {
  autoPauseHandler?.(reasons);
}
