// GameLoopController：rAF 累加器、速度、暫停、debug 時間跳轉。
// 規格：plan/01-architecture.md §3.5（遊戲迴圈與 React 整合）／§4.2（介面）／§5.1（累加器演算法）／
//       §5.4（debug 時間跳轉）；plan/03-game-loop.md §3.7.1（hasBlockingInteraction）／§7-T7。
// M1-16（01-A7／03-T7）實作。
//
// 非模擬層節奏常數（uiDayMsX1/2/5、uiFrameDtCapMs、uiMaxTicksPerFrame、uiJumpChunkDays）依
// plan/15-balance.md §4.3／§5.2 表 D 明文「以 BAL.* 書寫但實作不進 balance.ts，歸 src/app/ 迴圈驅動
// 設定」，故本檔以獨立常數表定義，不放 src/core/balance.ts（值出處仍為 15 §5.1）。

import { runOneDay } from './bridge';
import { store } from './store';
import type { GameSpeed, PauseReason } from './store';
import { installAutoPause } from './autoPause';

/** 15 §5.2 表 D／§4.3：速度節奏＋debug 跳轉節奏，非模擬常數、不進 BAL；值見 15 §5.1。 */
const UI_LOOP = {
  dayMsX1: 600,
  dayMsX2: 300,
  dayMsX5: 120,
  frameDtCapMs: 250,
  maxTicksPerFrame: 4,
  jumpChunkDays: 30,
} as const;

export interface GameLoopController {
  start(): void; // 掛上 rAF；重複呼叫為 no-op
  stop(): void; // 卸下 rAF（致命錯誤／回標題時）
  setSpeed(speed: GameSpeed): void; // 含 'paused'；同步更新 session.speed
  requestPause(reason: PauseReason): void; // 冪等；記錄 reason 並暫停
  resume(): void; // 回到 resumeSpeed
  stepDays(n: number): void; // debug 同步快進（§5.4）；n ≥ 1 整數
  isRunning(): boolean;
}

/**
 * 幀排程器（測試用注入點；非 01 §4.2 GameLoopController 介面之一部分，不影響公開行為）。
 * 產品預設綁定真實 `requestAnimationFrame`/`cancelAnimationFrame`（§3.5.1 逐字：
 * 「gameLoop.ts 持有唯一的 requestAnimationFrame 迴圈」）。
 *
 * 實測發現（M1-16 實作期間）：jsdom 的 `requestAnimationFrame` 底層排程雖受 `vi.useFakeTimers()`
 * 影響（callback 會被同步觸發），但傳入 callback 的 `now` 時間戳並非 fake clock 的虛擬時間、
 * 也非 `performance.now()`，而是 jsdom 內部另一個不受任何測試 API 控制的時鐘來源──導致
 * §5.1 累加器演算法仰賴的 `now - lastFrameTs` 差值在測試中無法被精確驅動。為使假時鐘測試能
 * 精確控制每幀的 `now` 值（驗收所需：×1 下 600ms 恰跑 1 tick、dt=5000ms 單幀最多 4 tick 等），
 * 將幀來源抽成可注入介面；測試以手動 fake scheduler 直接控制 `onFrame` 呼叫時機與 `now` 值，
 * 產品路徑完全不受影響（預設值＝真實全域函式）。
 */
export interface FrameScheduler {
  requestFrame(cb: (now: number) => void): number;
  cancelFrame(id: number): void;
}

const defaultScheduler: FrameScheduler = {
  requestFrame: (cb) => requestAnimationFrame(cb),
  cancelFrame: (id) => {
    cancelAnimationFrame(id);
  },
};

/**
 * 策略時間凍結判定（03 §3.7.1）。凍結來源兩種：
 * 1. 玩家參與的合戰（`state.battles` 中任一筆 `result === null`──即進行中──且
 *    attacker/defenderClanId 為玩家勢力；02/gameState.ts 之 BattleState 無獨立
 *    `playerInvolved`/`status` 欄位，以既有欄位等價推導，見 03 §8 對應決策記錄）。
 * 2. 待玩家選擇的歷史事件（`state.events.pendingChoiceEventId != null`）。
 * M1 期間 battles/events 恆為空（M4/M5、M8 起才會真正填入），本判定式恆為 false，僅先備妥介面。
 */
function hasBlockingInteraction(): boolean {
  const game = store.getState().game;
  if (game === null) return false;
  const playerClanId = game.meta.playerClanId;
  for (const battle of Object.values(game.battles)) {
    if (
      battle.result === null &&
      (battle.attackerClanId === playerClanId || battle.defenderClanId === playerClanId)
    ) {
      return true;
    }
  }
  return game.events.pendingChoiceEventId !== null;
}

function dayMsFor(speed: Exclude<GameSpeed, 'paused'>): number {
  switch (speed) {
    case 'x1':
      return UI_LOOP.dayMsX1;
    case 'x2':
      return UI_LOOP.dayMsX2;
    case 'x5':
      return UI_LOOP.dayMsX5;
  }
}

/** 建立一個獨立的 GameLoopController（測試用工廠；產品單例見下方 `gameLoop`）。
 * `scheduler` 僅供測試注入手動幀來源，見上方 `FrameScheduler` 說明；產品程式碼一律不傳。 */
export function createGameLoopController(
  scheduler: FrameScheduler = defaultScheduler,
): GameLoopController {
  let accumulatorMs = 0;
  let lastFrameTs: number | null = null;
  let rafId: number | null = null;
  let running = false;
  let uninstallAutoPause: (() => void) | null = null;

  function onFrame(now: number): void {
    rafId = scheduler.requestFrame(onFrame); // 先排下一幀（§5.1 步驟 1）
    if (lastFrameTs === null) {
      lastFrameTs = now;
      return;
    }
    const dt = Math.min(now - lastFrameTs, UI_LOOP.frameDtCapMs); // 夾限：切回分頁不暴衝
    lastFrameTs = now;

    const speed = store.getState().session.speed;
    if (speed === 'paused' || hasBlockingInteraction()) {
      // 策略時間凍結（03 §3.7.1／§7-T7：「hasBlockingInteraction 凍結」）與暫停同義：
      // 累加器歸零、不推進，直到解除凍結。
      accumulatorMs = 0;
      return;
    }
    const dayMs = dayMsFor(speed);
    accumulatorMs += dt;
    let ticks = 0;
    while (
      accumulatorMs >= dayMs &&
      ticks < UI_LOOP.maxTicksPerFrame &&
      store.getState().session.speed !== 'paused' && // tick 可能觸發自動暫停，逐次重查
      store.getState().session.fatalError === null && // runOneDay 內部致命錯誤攔截，01 §3.10.2／M1-18
      !hasBlockingInteraction()
    ) {
      runOneDay();
      accumulatorMs -= dayMs;
      ticks += 1;
    }
    if (store.getState().session.fatalError !== null) {
      // `runOneDay`（bridge.ts）捕獲 core 例外後只寫入 `session.fatalError`、不直接呼叫
      // `loop.stop()`（避免循環 import，見 bridge.ts 檔頭）；本迴圈為其代勞停止 rAF，行為與
      // `ErrorBoundary` 之 `onFatalError`（React 渲染例外路徑，見 App.tsx）等價收斂於同一狀態。
      controller.stop();
      return;
    }
    if (accumulatorMs > dayMs) {
      accumulatorMs = dayMs; // 丟棄積欠，避免死亡螺旋（§8-D10）
    }
  }

  function stepDaysChunk(): void {
    const jumping = store.getState().session.debug.jumping;
    if (jumping === null) return; // 已被中止（外部呼叫 setDebugJumping(null)）
    const remaining = jumping.totalDays - jumping.doneDays;
    const chunkSize = Math.min(UI_LOOP.jumpChunkDays, remaining);

    let executed = 0;
    let aborted = false;
    for (let i = 0; i < chunkSize; i += 1) {
      runOneDay(); // 跳轉期間忽略 autoPauseReasons、不逐 tick 重繪（§3.9.2）
      executed += 1;
      if (store.getState().session.fatalError !== null || hasBlockingInteraction()) {
        aborted = true;
        break;
      }
    }

    const current = store.getState().session.debug.jumping;
    if (current === null) return; // 執行期間被外部清除（理論上不可達，防禦性檢查）
    const doneDays = current.doneDays + executed;
    if (aborted || doneDays >= current.totalDays) {
      store.getState().actions.setDebugJumping(null); // 完成或中止；維持暫停
    } else {
      store.getState().actions.setDebugJumping({ totalDays: current.totalDays, doneDays });
      setTimeout(stepDaysChunk, 0); // 讓瀏覽器繪製進度條
    }
  }

  const controller: GameLoopController = {
    start() {
      if (running) return;
      running = true;
      lastFrameTs = null;
      rafId = scheduler.requestFrame(onFrame);
      // 自動暫停與迴圈同生命週期（見 createGameLoopController 檔頭）：僅在此安裝一次，
      // 避免僅 import 本模組（未實際 start）就產生 document 監聽器等副作用（測試污染風險）。
      uninstallAutoPause ??= installAutoPause(controller);
    },
    stop() {
      if (rafId !== null) {
        scheduler.cancelFrame(rafId);
        rafId = null;
      }
      running = false;
      accumulatorMs = 0;
      lastFrameTs = null;
      uninstallAutoPause?.();
      uninstallAutoPause = null;
    },
    setSpeed(speed) {
      if (speed === 'paused') {
        controller.requestPause('user');
        return;
      }
      store.getState().actions.setSpeed(speed); // 變速不清空累加器（§3.5.2）
    },
    requestPause(reason) {
      accumulatorMs = 0; // 暫停時累加器歸零（§5.1 步驟 4／§3.5.2）
      store.getState().actions.requestPause(reason);
    },
    resume() {
      store.getState().actions.resume();
    },
    stepDays(n) {
      const s = store.getState();
      if (!Number.isInteger(n) || n < 1) return;
      if (s.session.debug.jumping !== null) return; // 已在跳轉中
      if (s.session.fatalError !== null) return;
      controller.requestPause('user');
      s.actions.setDebugJumping({ totalDays: n, doneDays: 0 });
      stepDaysChunk();
    },
    isRunning() {
      return running;
    },
  };

  return controller;
}

/** 產品執行期單例（01 §3.5.1：「gameLoop.ts 持有唯一的 requestAnimationFrame 迴圈」）。
 * 測試請改用 `createGameLoopController()` 建立獨立實例，避免跨測試共用可變狀態。
 * 自動暫停（M1-17／01-A8）於 `start()` 時安裝、`stop()` 時解除（見上方 start/stop 實作），
 * 不在 import 時就掛上 `document` 監聽器——避免僅 import 本模組（如測試取用
 * `createGameLoopController`）就產生 DOM 副作用。 */
export const gameLoop = createGameLoopController();
