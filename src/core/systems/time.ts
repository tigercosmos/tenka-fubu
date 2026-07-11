// 曆法推進：GameTime 進位、seasonOf、absoluteDay 換算。
// 規格：plan/03-game-loop.md T1（實作任務清單）／§3.2.4 Step 2／§5.2（timeSystem 虛擬碼）；
//       plan/00-foundations.md §5.1（曆法 canonical：1年=360日=12月×30日；季節分月）；
//       plan/02-data-model.md §4.2（TimeState 型別、單一真相 day）／§5.6（曆法換算公式，canonical）。
//
// 型別依 02 §4.2 TimeState：`day` 為絕對日（單一真相，0 = 1560年1月1日）；`year`/`month`/`dayOfMonth`
// 為 time 系統維護之快取（INV-24：與 day 換算須一致，02 §5.2/§7）。`season` 為衍生值（02 §4.2 註解／
// 00 §5.1），不存於 TimeState，一律以 seasonOf(month) 現算（02 §5.1 衍生值表 `season(month)`）。
//
// 本檔實作 advanceDay 之 Step 2（03 §3.2.4）：`timeSystem(state, emit)`。
// 附註（範圍界定，非 TBD；2026-07-11 M1-7 更新）：03 §5.2 timeSystem 虛擬碼另含「先併入合戰寫回
// 延遲事件 state.meta.deferredEvents」一段。M1-6／M1-7 已將 03 §4.5 LoopMeta 欄位（stateVersion／
// lastAppliedCmdSeq／debugMode／territoryChangedToday／deferredEvents）補入 MetaState（見
// src/core/state/gameState.ts §4.2、03 §8-D14）。惟該併入落實於 advanceDay 之 Step 2 包裝
// （src/core/systems/index.ts `stepTime`），非本 `timeSystem`：本函式維持僅司曆法遞增與月/季事件
// 發送（其單元測試 fixture 不含 meta，不讀 state.meta），時序等價（延遲事件在月/季事件之前併入）。
// 與 18-roadmap.md §3.4 M1-5 驗收標準（跨年／季界／absoluteDay 換算）一致。

import type { GameState, TimeState } from '../state/gameState';
import type { Season } from '../state/enums';
import type { GameEvent } from '../state/events';

/** 1 月 = 30 日（00 §5.1；02 §5.6 canonical）。 */
export const DAYS_PER_MONTH = 30;
/** 1 年 = 12 月（00 §5.1；02 §5.6 canonical）。 */
export const MONTHS_PER_YEAR = 12;
/** 1 年 = 360 日（00 §5.1；02 §5.6 canonical）。 */
export const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR;
/** `absoluteDay`（= TimeState.day）0 對應之西曆年（02 §4.2／§5.6：v1.0 唯一劇本 s1560 起始年）。 */
export const EPOCH_YEAR = 1560;

/** 曆法三欄（TimeState 扣除絕對日 `day` 之快取部分；02 §4.2）。 */
export interface Calendar {
  year: number; // 西曆年
  month: number; // 1..12
  dayOfMonth: number; // 1..30
}

/**
 * 月份 → 季節（00 §5.1／02 §4.2 註解，canonical）：春 3–5、夏 6–8、秋 9–11、冬 12–2。
 * = 02 §5.1 衍生值表 `season(month)` 之實作。
 */
export function seasonOf(month: number): Season {
  if (month >= 3 && month <= 5) return 'spring';
  if (month >= 6 && month <= 8) return 'summer';
  if (month >= 9 && month <= 11) return 'autumn';
  return 'winter'; // 12, 1, 2
}

/** 絕對日 → 曆法三欄（02 §5.6 canonical 公式逐字轉譯）。 */
export function dayToCalendar(day: number): Calendar {
  const year = EPOCH_YEAR + Math.floor(day / DAYS_PER_YEAR);
  const dayInYear = day % DAYS_PER_YEAR;
  const month = Math.floor(dayInYear / DAYS_PER_MONTH) + 1;
  const dayOfMonth = (day % DAYS_PER_MONTH) + 1;
  return { year, month, dayOfMonth };
}

/** 曆法三欄 → 絕對日（02 §5.6 canonical 公式；`dayToCalendar` 之逆函式）。 */
export function calendarToDay(year: number, month: number, dayOfMonth: number): number {
  return (year - EPOCH_YEAR) * DAYS_PER_YEAR + (month - 1) * DAYS_PER_MONTH + (dayOfMonth - 1);
}

/** 是否月初（每月 1 日；03 §3.2.2 觸發時機表）。 */
export function isMonthStart(dayOfMonth: number): boolean {
  return dayOfMonth === 1;
}

/** 是否季初月（3／6／9／12 月；00 §5.1；03 §3.2.2）。與 `isMonthStart` 併用判定季初日。 */
export function isSeasonStartMonth(month: number): boolean {
  return month === 3 || month === 6 || month === 9 || month === 12;
}

/**
 * 就地推進 `TimeState` 一日：`day += 1`，並依 02 §5.6 重算 `year`/`month`/`dayOfMonth` 快取
 * （維持 INV-24：與 `day` 換算一致）。就地修改（03 §3.1 全域 mutation 慣例）。
 */
export function advanceOneDay(time: TimeState): void {
  time.day += 1;
  const cal = dayToCalendar(time.day);
  time.year = cal.year;
  time.month = cal.month;
  time.dayOfMonth = cal.dayOfMonth;
}

/**
 * advanceDay Step 2（03 §3.2.4／§5.2）：日期 +1，發 `time.monthStart`（月初）／
 * `time.seasonStart`（季初：3/6/9/12 月 1 日）。年初（1/1）、秋收（9/1）不發 GameEvent——
 * 對應結算改由 Step 9（元服）／Step 6（秋收）依 `state.time` 日期直接閘控（03 §3.2.2／§5.2）。
 *
 * 注意：Step 2 之後所有步驟看到的是新日期；Step 1 的 Command 以舊日期驗證（03 §3.2.3）。
 * 合戰寫回延遲事件（`state.meta.deferredEvents`）之併入不在本函式範圍內，見檔頭附註。
 */
export function timeSystem(state: GameState, emit: (event: GameEvent) => void): void {
  advanceOneDay(state.time);
  const { day, year, month, dayOfMonth } = state.time;
  if (isMonthStart(dayOfMonth)) {
    emit({ type: 'time.monthStart', day, clanIds: [], year, month });
    if (isSeasonStartMonth(month)) {
      emit({ type: 'time.seasonStart', day, clanIds: [], year, season: seasonOf(month) });
    }
  }
}
