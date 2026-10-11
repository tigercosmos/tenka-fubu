// tick 耗時取樣環形緩衝＋讀取 API（規格：plan/01-architecture.md §3.9.4／§4.6；M1-23／01-A12）。
//
// 呼叫端（`src/app/bridge.ts` 的 `runOneDay`，01 §3.4.4）以
// `perfMonitor.recordTick(performance.now() - t0)` 回報每 tick 耗時。
//
// M7 由 app 注入 performance.now，再以 recordSystems 保存 TickResult.perf 的十三步耗時。
// 尚未量測時，systemBreakdownMs 為空物件。FPS 量測策略排程器，不代表 Pixi 實際渲染幀率。
//
// 環形緩衝容量：60（tick，01 §3.9.4「最近 60 tick」）。此為效能／呈現層常數、非模擬層數值
// （`plan/15-balance.md` §3.2 第 5 點／§5.2 表 D：效能相關常數「非模擬值不進 balance.ts」，
// 歸 UI/app/perf 設定），故以本檔本地 const 表達，不走 `BAL.*`。

import type { GameState } from '../core/state/gameState';

/** Diagnostic thresholds never control simulation scheduling or enter the balance hash. */
export const PERFCFG = { aiTickBudgetMs: 4 } as const;

/** 01 §4.6 逐字：效能快照。 */
export interface PerfSnapshot {
  /** 最近 120 個策略 rAF 間隔的 elapsed-weighted fps；尚無有效間隔時為 0。 */
  fps: number;
  /** 上一 tick 耗時（毫秒）；尚無任何 `recordTick` 呼叫時為 0。 */
  lastTickMs: number;
  /** 最近 60 tick 平均耗時（毫秒）。 */
  avgTickMs: number;
  /** 最近 60 tick 最大耗時（毫秒）。 */
  maxTickMs: number;
  /** 各系統上一 tick 分項耗時；尚未量測時為空物件。 */
  systemBreakdownMs: Record<string, number>;
  /** 呼叫端提供之目前 GameState 實體數；未提供時為 0。 */
  entityCounts: { castles: number; districts: number; officers: number; armies: number };
}

/** 01 §3.9.4：tick 耗時環形緩衝容量（最近 60 tick）。 */
const TICK_HISTORY_CAPACITY = 60;
const FRAME_HISTORY_CAPACITY = 120;

function emptyEntityCounts(): PerfSnapshot['entityCounts'] {
  return { castles: 0, districts: 0, officers: 0, armies: 0 };
}

class PerfMonitor {
  private readonly frameHistory: number[] = [];
  private frameWriteIndex = 0;
  private lastFrameTimestamp: number | null = null;
  /** 環形緩衝本體；填滿前以 push 累積，填滿後原地覆寫最舊項（見 recordTick）。 */
  private readonly tickHistory: number[] = [];
  /** 填滿後下一個要覆寫的索引（尚未填滿時不使用，push 即可）。 */
  private writeIndex = 0;
  private lastTickMs = 0;
  private systemBreakdownMs: Record<string, number> = {};

  recordFrame(timestamp: number): void {
    if (!Number.isFinite(timestamp) || timestamp < 0) return;
    if (this.lastFrameTimestamp === null) {
      this.lastFrameTimestamp = timestamp;
      return;
    }
    const delta = timestamp - this.lastFrameTimestamp;
    if (!Number.isFinite(delta) || delta <= 0) return;
    this.lastFrameTimestamp = timestamp;
    if (this.frameHistory.length < FRAME_HISTORY_CAPACITY) this.frameHistory.push(delta);
    else {
      this.frameHistory[this.frameWriteIndex] = delta;
      this.frameWriteIndex = (this.frameWriteIndex + 1) % FRAME_HISTORY_CAPACITY;
    }
  }

  resetFrames(): void {
    this.frameHistory.length = 0;
    this.frameWriteIndex = 0;
    this.lastFrameTimestamp = null;
  }

  hasTickSamples(): boolean {
    return this.tickHistory.length > 0;
  }

  recordSystems(samples: Record<string, number>): void {
    this.systemBreakdownMs = Object.fromEntries(
      Object.entries(samples).filter(([, value]) => Number.isFinite(value) && value >= 0),
    );
  }

  /** 回報一次 tick 耗時（毫秒）；寫入環形緩衝（恆定容量 60，01 §3.9.4）。 */
  recordTick(ms: number): void {
    const sample = Number.isFinite(ms) && ms >= 0 ? ms : 0;
    this.lastTickMs = sample;
    if (this.tickHistory.length < TICK_HISTORY_CAPACITY) {
      this.tickHistory.push(sample);
    } else {
      this.tickHistory[this.writeIndex] = sample;
      this.writeIndex = (this.writeIndex + 1) % TICK_HISTORY_CAPACITY;
    }
  }

  /** Read detached telemetry and counts from the supplied current game (01 §4.6). */
  getSnapshot(game?: Readonly<GameState> | null): PerfSnapshot {
    const count = this.tickHistory.length;
    const avgTickMs = count === 0 ? 0 : this.tickHistory.reduce((a, b) => a + b, 0) / count;
    const maxTickMs = count === 0 ? 0 : Math.max(...this.tickHistory);
    // Divide before summing to avoid overflow on finite extreme timestamps.
    const meanFrameMs = this.frameHistory.reduce(
      (sum, delta) => sum + delta / this.frameHistory.length,
      0,
    );
    return {
      fps: this.frameHistory.length === 0 ? 0 : Math.min(Number.MAX_VALUE, 1000 / meanFrameMs),
      lastTickMs: this.lastTickMs,
      avgTickMs,
      maxTickMs,
      systemBreakdownMs: { ...this.systemBreakdownMs },
      entityCounts: game
        ? {
            castles: Object.keys(game.castles).length,
            districts: Object.keys(game.districts).length,
            officers: Object.keys(game.officers).length,
            armies: Object.keys(game.armies).length,
          }
        : emptyEntityCounts(),
    };
  }

  /** Clear every sample when game identity changes or tests reset the store. */
  reset(): void {
    this.resetFrames();
    this.tickHistory.length = 0;
    this.writeIndex = 0;
    this.lastTickMs = 0;
    this.systemBreakdownMs = {};
  }
}

/** 全域單例（`src/app/bridge.ts` 之 `runOneDay` 呼叫；01 §3.4.4 逐字：`perfMonitor.recordTick(...)`）。 */
export const perfMonitor = new PerfMonitor();
