// tick 耗時取樣環形緩衝＋讀取 API（規格：plan/01-architecture.md §3.9.4／§4.6；M1-23／01-A12）。
//
// 呼叫端（`src/app/bridge.ts` 的 `runOneDay`，01 §3.4.4）以
// `perfMonitor.recordTick(performance.now() - t0)` 回報每 tick 耗時。
//
// 本任務（M1-23）範圍＝「tick 耗時取樣環形緩衝＋讀取 API」。01 §4.6 定案的完整 `PerfSnapshot`
// 另含三項本檔目前無法真實填入的欄位——`fps`（來源：rAF 迴圈，M1-16）、`systemBreakdownMs`
// （來源：各系統 `performance.mark`/`measure`，尚無指定實作里程碑；且 `core/systems/index.ts`
// 的 `TickResult.perf` 本身「core 無 Date.now，恆 0」，量測需全由 app 層做）、`entityCounts`
// （來源：`GameState`，需讀 store，M1-15 起）。這三項在對應資料來源就緒前，`getSnapshot()`
// 一律回傳其型別要求的明確預設值（`0`／`{}`／全 0），並非臆造數據；待各自的里程碑接上實際
// 寫入端後，本檔可視需要擴充 setter（如 `recordFrame`／`setEntityCounts`）。
//
// 環形緩衝容量：60（tick，01 §3.9.4「最近 60 tick」）。此為效能／呈現層常數、非模擬層數值
// （`plan/15-balance.md` §3.2 第 5 點／§5.2 表 D：效能相關常數「非模擬值不進 balance.ts」，
// 歸 UI/app/perf 設定），故以本檔本地 const 表達，不走 `BAL.*`。

/** 01 §4.6 逐字：效能快照。 */
export interface PerfSnapshot {
  /** 最近 120 幀平均 fps；來源（rAF 迴圈，M1-16）尚未接線時恆為 0。 */
  fps: number;
  /** 上一 tick 耗時（毫秒）；尚無任何 `recordTick` 呼叫時為 0。 */
  lastTickMs: number;
  /** 最近 60 tick 平均耗時（毫秒）。 */
  avgTickMs: number;
  /** 最近 60 tick 最大耗時（毫秒）。 */
  maxTickMs: number;
  /** 各系統上一 tick 分項耗時（dev 模式才有值）；來源尚未接線時為空物件。 */
  systemBreakdownMs: Record<string, number>;
  /** 目前實體數；來源（GameState，需 store，M1-15）尚未接線時恆為 0。 */
  entityCounts: { castles: number; districts: number; officers: number; armies: number };
}

/** 01 §3.9.4：tick 耗時環形緩衝容量（最近 60 tick）。 */
const TICK_HISTORY_CAPACITY = 60;

function emptyEntityCounts(): PerfSnapshot['entityCounts'] {
  return { castles: 0, districts: 0, officers: 0, armies: 0 };
}

class PerfMonitor {
  /** 環形緩衝本體；填滿前以 push 累積，填滿後原地覆寫最舊項（見 recordTick）。 */
  private readonly tickHistory: number[] = [];
  /** 填滿後下一個要覆寫的索引（尚未填滿時不使用，push 即可）。 */
  private writeIndex = 0;
  private lastTickMs = 0;

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

  /** 讀取目前效能快照（01 §4.6；未接線欄位之預設值見檔頭說明）。 */
  getSnapshot(): PerfSnapshot {
    const count = this.tickHistory.length;
    const avgTickMs = count === 0 ? 0 : this.tickHistory.reduce((a, b) => a + b, 0) / count;
    const maxTickMs = count === 0 ? 0 : Math.max(...this.tickHistory);
    return {
      fps: 0,
      lastTickMs: this.lastTickMs,
      avgTickMs,
      maxTickMs,
      systemBreakdownMs: {},
      entityCounts: emptyEntityCounts(),
    };
  }

  /** 測試／新局重置用：清空全部取樣。非產品程式碼路徑以外的一般執行期不需呼叫。 */
  reset(): void {
    this.tickHistory.length = 0;
    this.writeIndex = 0;
    this.lastTickMs = 0;
  }
}

/** 全域單例（`src/app/bridge.ts` 之 `runOneDay` 呼叫；01 §3.4.4 逐字：`perfMonitor.recordTick(...)`）。 */
export const perfMonitor = new PerfMonitor();
