// 手動幀排程器（測試用）：注入 GameLoopController 的 FrameScheduler，讓測試以任意 `now` 值精確
// 驅動 onFrame，取代真實 requestAnimationFrame。
//
// 緣由（見 src/app/gameLoop.ts FrameScheduler 說明）：實測 jsdom 的 requestAnimationFrame 在
// `vi.useFakeTimers()` 下雖會被同步觸發，但傳入 callback 的 `now` 時間戳不受 fake clock 或
// `performance.now()` 控制，無法用於驗證 §5.1 累加器演算法的精確毫秒邊界，故以本檔手動排程器
// 取代（每次呼叫 `fire(now)` 才觸發目前排定的 callback；`onFrame` 內部會先呼叫
// `scheduler.requestFrame` 排下一幀，因此 `fire` 後恆有新的 pending callback，符合 rAF 語意）。
import type { FrameScheduler } from '../../src/app/gameLoop';

export interface ManualScheduler {
  scheduler: FrameScheduler;
  /** 觸發目前排定的 callback（模擬瀏覽器呼叫下一個 rAF frame，帶入指定 now 時間戳）。 */
  fire(now: number): void;
  /** 目前排定中（尚未觸發）的幀數量；`start()` 後應為 1，`stop()` 後應為 0。 */
  pendingCount(): number;
}

export function createManualScheduler(): ManualScheduler {
  let nextId = 1;
  const pending = new Map<number, (now: number) => void>();

  const scheduler: FrameScheduler = {
    requestFrame(cb) {
      const id = nextId;
      nextId += 1;
      pending.set(id, cb);
      return id;
    },
    cancelFrame(id) {
      pending.delete(id);
    },
  };

  return {
    scheduler,
    fire(now) {
      const callbacks = [...pending.values()];
      pending.clear();
      for (const cb of callbacks) {
        cb(now);
      }
    },
    pendingCount() {
      return pending.size;
    },
  };
}
