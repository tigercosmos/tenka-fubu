// advanceDay：每日 tick 的 13 步固定流程骨架（M1-7）。
// 規格：plan/03-game-loop.md §3.2（13 步流程）／§3.2.4（完整虛擬碼）／§4.1（TickResult／AutoPauseReason）；
//       plan/00-foundations.md §5.4（13 步順序 canonical，不得增刪重排）；plan/03 §3.6（月結流程）／§3.9.1（自動存檔 hook）。
//
// 本檔為骨架：13 步順序以常數陣列 STEP_ORDER 鎖定（00 §5.4）；Step 1（applyCommands，M1-6）、
// Step 2（time，M1-5）、Step 13（reports，M1-8，見 systems/reports.ts）為實作步驟，Step 3–12
// 為空殼佔位（回傳 []），待各系統里程碑替換（見各步註解）。
// 「任何系統不得跳過」（§3.2.4）：即使當日無事，每步仍被呼叫，由各系統內部依時機表閘控早退——
// 確保重放時呼叫序完全一致（決定論）。

import type { GameState } from '../state/gameState';
import type { GameEvent } from '../state/events';
import type { CommandEnvelope } from '../commands/types';
import type { EmitFn } from '../commands/registry';
import { applyCommands } from '../commands/queue';
import { timeSystem } from './time';
import { reportsSystem } from './reports';
import { developmentSystem } from './development';
import { economySystem } from './economy';
import { officersSystem } from './officers';

// ═══════════════════════════════════════════════════════════════════
// 迴圈機制型別（03 §4.1 canonical）
// ═══════════════════════════════════════════════════════════════════

/** 自動暫停原因（00 §5.2／03 §3.4.2；玩家勢力相關事件觸發，各項可於設定關閉）。 */
export type AutoPauseReason =
  | 'siegeOnPlayer'
  | 'battleAvailable'
  | 'proposalArrived'
  | 'envoyArrived'
  | 'historicalEvent'
  | 'monthStart';

/** advanceDay 回傳值（03 §4.1）。 */
export interface TickResult {
  state: GameState; // 與傳入同一參考（就地修改，§3.1）
  events: GameEvent[]; // 本 tick 全部事件（依發出順序）；不持久化（§3.4.1）
  autoPauseReasons: AutoPauseReason[]; // 去重後的自動暫停原因（Step 13 reports 產生；可空）
  autosaveDue: 'monthly' | null; // 驅動器據此呼叫 onAutosave（§3.9.1）
  perf: { totalMs: number; stepMs: number[] }; // 各步耗時取樣（core 無 Date.now，恆 0；正式版可全 0，§4.1）
}

/**
 * tick 內傳遞給各步的上下文（本檔內部型別）。
 * - `queue`：本 tick 前 app 層 drain 出的指令陣列（Step 1 輸入，§3.3.1）。
 * - `events`：本 tick 事件累加器（advanceDay 於每步後併入該步回傳值；Step 13 reports 讀此全集）。
 * - `autoPauseReasons`：Step 13 reports 寫入（M1-8 已實作，見 systems/reports.ts）。
 */
export interface TickContext {
  queue: readonly CommandEnvelope[];
  events: GameEvent[];
  autoPauseReasons: AutoPauseReason[];
}

/** 單一步驟函式簽名（(state, ctx) → 該步發出的事件；就地修改 state）。 */
export type StepFn = (state: GameState, ctx: TickContext) => GameEvent[];

/** 13 步的固定名稱（00 §5.4／03 §3.2.3；Step 7/8 對應 military.movement／military.combat）。 */
export type StepName =
  | 'applyCommands'
  | 'time'
  | 'events'
  | 'diplomacy'
  | 'development'
  | 'economy'
  | 'militaryMovement'
  | 'militaryCombat'
  | 'officers'
  | 'proposals'
  | 'ai'
  | 'victory'
  | 'reports';

interface StepDef {
  name: StepName;
  run: StepFn;
}

// ═══════════════════════════════════════════════════════════════════
// Step 實作／佔位（03 §3.2.3）
// ═══════════════════════════════════════════════════════════════════

/** Step 1 applyCommands（M1-6）：就地結算本 tick 指令佇列（舊日期驗證，§3.2.3）。 */
function stepApplyCommands(state: GameState, ctx: TickContext): GameEvent[] {
  const events: GameEvent[] = [];
  const emit: EmitFn = (e) => {
    events.push(e);
  };
  applyCommands(state, ctx.queue, emit);
  return events;
}

/**
 * Step 2 time（M1-5）：日期 +1、發 time.monthStart／time.seasonStart。
 * 先併入合戰寫回的延遲事件（state.meta.deferredEvents）再清空（§5.2；骨架期恆空、M1-26 起填入）——
 * 此併入原列於 §5.2 timeSystem 虛擬碼開頭，因 timeSystem（M1-5）僅司曆法、不讀 meta（其 fixture
 * 不含 meta），故落實於本 Step 2 包裝（時序等價：延遲事件在月/季事件之前併入）。
 */
function stepTime(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  const emit: EmitFn = (e) => {
    events.push(e);
  };
  for (const deferred of state.meta.deferredEvents) {
    emit(deferred);
  }
  state.meta.deferredEvents = [];
  timeSystem(state, emit);
  return events;
}

// Step 3–12：空殼佔位（回傳 []）。各步的讀寫區塊、發出事件與內部演算法見 §3.2.3「詳見」欄；
// 由對應系統里程碑替換為實作。骨架期不讀寫 state（無副作用），確保空劇本連跑無例外。
function stepEvents(): GameEvent[] {
  return []; // 歷史/汎用事件引擎（10；M8）
}
function stepDiplomacy(): GameEvent[] {
  return []; // 外交工作進度、協定到期、調略（08；M6）
}
function stepDevelopment(state: GameState): GameEvent[] {
  return developmentSystem(state);
}
function stepEconomy(state: GameState): GameEvent[] {
  return economySystem(state);
}
function stepMilitaryMovement(): GameEvent[] {
  return []; // 行軍、制壓翻轉（04；M4）
}
function stepMilitaryCombat(): GameEvent[] {
  return []; // 野戰/攻城自動解算 tick（07；M4/M5）
}
function stepOfficers(state: GameState): GameEvent[] {
  officersSystem(state);
  return [];
}
function stepProposals(): GameEvent[] {
  return []; // 具申生成與逾期作廢（06/09；M6-13）
}
function stepAi(): GameEvent[] {
  return []; // AI 評定入列/消化（09；排程器骨架見 systems/ai/scheduler.ts M1-24，於後續里程碑接入本步）
}
function stepVictory(): GameEvent[] {
  return []; // 勝敗檢查（territoryChangedToday 髒標記閘控）（10；M8）
}
function stepReports(state: GameState, ctx: TickContext): GameEvent[] {
  // Step 13 reports（M1-8；src/core/systems/reports.ts）：消費 ctx.events（本 tick 全集）→
  // 追加 Report、修剪、計算 autoPauseReasons 併入 ctx（本步為事件終端消費者、不發事件，§3.2.3）。
  const reasons = reportsSystem(state, ctx.events);
  ctx.autoPauseReasons.push(...reasons);
  return [];
}

// ═══════════════════════════════════════════════════════════════════
// 13 步固定順序（常數陣列鎖定；00 §5.4／03 §3.2.4，不得增刪重排）
// ═══════════════════════════════════════════════════════════════════

/** 13 步固定順序（canonical）。advanceDay 唯一的步驟迭代來源；替換實作時僅換 `run`、不動順序。 */
export const STEP_ORDER: readonly StepDef[] = [
  { name: 'applyCommands', run: stepApplyCommands },
  { name: 'time', run: stepTime },
  { name: 'events', run: stepEvents },
  { name: 'diplomacy', run: stepDiplomacy },
  { name: 'development', run: stepDevelopment },
  { name: 'economy', run: stepEconomy },
  { name: 'militaryMovement', run: stepMilitaryMovement },
  { name: 'militaryCombat', run: stepMilitaryCombat },
  { name: 'officers', run: stepOfficers },
  { name: 'proposals', run: stepProposals },
  { name: 'ai', run: stepAi },
  { name: 'victory', run: stepVictory },
  { name: 'reports', run: stepReports },
];

/** 13 步名稱序（由 STEP_ORDER 導出，供測試斷言步序；與 STEP_ORDER 不可能漂移）。 */
export const STEP_SEQUENCE: readonly StepName[] = STEP_ORDER.map((s) => s.name);

// ═══════════════════════════════════════════════════════════════════
// advanceDay（03 §3.2.4）
// ═══════════════════════════════════════════════════════════════════

/**
 * 每日 tick：依 STEP_ORDER 固定順序執行 13 步，就地修改並回傳同一 `state` 參考。
 * 結尾（§3.2.4）：重置 territoryChangedToday 髒標記、stateVersion += 1。
 * 月結 hook（§3.9.1）：Step 2 推進後若為每月 1 日（dayOfMonth===1），autosaveDue='monthly'
 *（BAL.autosaveEveryMonths=1，每月月初存檔；驅動器讀旗標後呼叫 onAutosave，debug 跳轉期抑制）。
 */
export function advanceDay(state: GameState, queue: readonly CommandEnvelope[]): TickResult {
  const events: GameEvent[] = [];
  const ctx: TickContext = { queue, events, autoPauseReasons: [] };

  for (const step of STEP_ORDER) {
    const stepEvents = step.run(state, ctx);
    for (const e of stepEvents) {
      events.push(e);
    }
  }

  const autosaveDue: 'monthly' | null = state.time.dayOfMonth === 1 ? 'monthly' : null;

  state.meta.territoryChangedToday = false; // §3.2.4：重置每日髒標記（Step 12 消費後）
  state.meta.stateVersion += 1; // §3.1／§3.2.4：UI 訂閱重繪依據

  return {
    state,
    events,
    autoPauseReasons: ctx.autoPauseReasons,
    autosaveDue,
    perf: { totalMs: 0, stepMs: STEP_ORDER.map(() => 0) },
  };
}
