// 月結整合測試（M1 時序契約＋M3 內政月結）。
// 規格：plan/03-game-loop.md §3.6（月結流程完整順序；stub 期僅 Step 2 time 有實作，
//       Step 3–12 空殼佔位恆回傳 []，見 src/core/systems/index.ts 檔頭）／§3.2.4（13 步固定順序）；
//       plan/18-roadmap.md M1-25（驗收：兩個月事件序列 golden 紀錄比對——time.monthStart/seasonStart 順序）。
//
// 用真實劇本（tiny，M1-13／M1-14）而非最小 loop 測試 state（advance-day.spec.ts 已覆蓋該面向），
// 連續推進兩個月（60 tick），驗證 stub 系統下事件流恰為兩筆 time.monthStart（各月 1 日）＋
// 一筆 time.seasonStart（月份為季初月時，同日排在 monthStart 之後），無任何其他事件混入
// （Step 3–12 全空殼，Step 1 佇列恆空、不產生 command.rejected）。

import { describe, expect, it } from 'vitest';
import { advanceDay } from '../../src/core/systems/index';
import { DAYS_PER_MONTH } from '../../src/core/systems/time';
import type { GameEvent } from '../../src/core/state/events';
import type { AutoPauseReason } from '../../src/core/systems/index';
import { buildTinyState, TINY_START_DAY } from '../fixtures/tiny';

describe('月結整合（M3 內政接線，03 §3.6／18-roadmap M3）', () => {
  it('golden：時間事件順序不受內政月結影響，且每月產生經濟事件', () => {
    const state = buildTinyState();
    expect(state.time.day).toBe(TINY_START_DAY); // 1560/4/1（月中途起算，非月初）

    const events: GameEvent[] = [];
    const autoPauseByDay: { day: number; reasons: readonly AutoPauseReason[] }[] = [];

    for (let i = 0; i < DAYS_PER_MONTH * 2; i += 1) {
      const result = advanceDay(state, []);
      events.push(...result.events);
      autoPauseByDay.push({ day: state.time.day, reasons: result.autoPauseReasons });
    }

    // 60 tick 後：1560/4/1 → 1560/6/1（跨兩個月界，第二個月界同時為季初：夏 6–8 月）。
    expect(state.time.day).toBe(TINY_START_DAY + DAYS_PER_MONTH * 2);
    expect(state.time.year).toBe(1560);
    expect(state.time.month).toBe(6);
    expect(state.time.dayOfMonth).toBe(1);

    const may1 = TINY_START_DAY + DAYS_PER_MONTH; // 1560/5/1
    const jun1 = TINY_START_DAY + DAYS_PER_MONTH * 2; // 1560/6/1

    // golden：逐日 Step 2 emit 順序（同日內 monthStart 先於 seasonStart，見 time.ts timeSystem）。
    const timeEvents = events.filter((event) => event.type.startsWith('time.'));
    expect(timeEvents).toEqual([
      { type: 'time.monthStart', day: may1, clanIds: [], year: 1560, month: 5 },
      { type: 'time.monthStart', day: jun1, clanIds: [], year: 1560, month: 6 },
      { type: 'time.seasonStart', day: jun1, clanIds: [], year: 1560, season: 'summer' },
    ]);

    expect(events.filter((event) => event.type === 'economy.income')).toHaveLength(4);
    expect(events.some((event) => event.type === 'conscript.completed')).toBe(true);

    // 月結 hook：僅兩個月初 tick 觸發 autoPauseReasons=['monthStart']，其餘 58 個 tick 恆空。
    const withReasons = autoPauseByDay.filter((d) => d.reasons.length > 0);
    expect(withReasons).toEqual([
      { day: may1, reasons: ['monthStart'] },
      { day: jun1, reasons: ['monthStart'] },
    ]);
  });

  it('autosaveDue：僅兩個月初 tick 為 monthly，其餘 58 個 tick 為 null（03 §3.9.1）', () => {
    const state = buildTinyState();
    const autosaveDueDays: number[] = [];

    for (let i = 0; i < DAYS_PER_MONTH * 2; i += 1) {
      const result = advanceDay(state, []);
      if (result.autosaveDue === 'monthly') autosaveDueDays.push(state.time.day);
    }

    expect(autosaveDueDays).toEqual([
      TINY_START_DAY + DAYS_PER_MONTH,
      TINY_START_DAY + DAYS_PER_MONTH * 2,
    ]);
  });

  it('連跑兩次（同一 tiny 劇本、同一 seed）重放 bit-exact：逐 tick 事件序列完全相同', () => {
    const runOnce = (): GameEvent[] => {
      const state = buildTinyState();
      const events: GameEvent[] = [];
      for (let i = 0; i < DAYS_PER_MONTH * 2; i += 1) {
        events.push(...advanceDay(state, []).events);
      }
      return events;
    };

    expect(runOnce()).toEqual(runOnce());
  });
});
