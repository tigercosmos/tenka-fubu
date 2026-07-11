// 曆法系統測試（M1-5 驗收：18-roadmap.md §3.4「跨年／季界／absoluteDay 測試」）。
// 規格：plan/03-game-loop.md T1／§3.2.2／§3.2.4／§5.2；plan/00-foundations.md §5.1；
//       plan/02-data-model.md §4.2／§5.6（曆法換算 canonical 公式）。
//
// 期望值一律由本模組匯出之曆法常數（DAYS_PER_MONTH／DAYS_PER_YEAR／EPOCH_YEAR）推導，不寫魔法數字
// （這些是 00 §5.1／02 §5.6 canonical 的曆法結構常數，非 15-balance.md 之可調 BAL 數值）。

import { describe, it, expect } from 'vitest';
import type { GameState, TimeState } from '../../src/core/state/gameState';
import type { GameEvent } from '../../src/core/state/events';
import {
  DAYS_PER_MONTH,
  MONTHS_PER_YEAR,
  DAYS_PER_YEAR,
  EPOCH_YEAR,
  seasonOf,
  dayToCalendar,
  calendarToDay,
  isMonthStart,
  isSeasonStartMonth,
  advanceOneDay,
  timeSystem,
} from '../../src/core/systems/time';

/** 建立僅含 `time` 欄位的最小 GameState fixture（其餘欄位 timeSystem 不讀寫，cast 略過）。 */
function makeState(time: TimeState): GameState {
  return { time } as unknown as GameState;
}

function makeTime(day: number): TimeState {
  const cal = dayToCalendar(day);
  return { day, year: cal.year, month: cal.month, dayOfMonth: cal.dayOfMonth };
}

describe('曆法常數（00 §5.1 canonical）', () => {
  it('1 月 = 30 日、1 年 = 12 月 = 360 日', () => {
    expect(DAYS_PER_MONTH).toBe(30);
    expect(MONTHS_PER_YEAR).toBe(12);
    expect(DAYS_PER_YEAR).toBe(360);
  });
});

describe('seasonOf（00 §5.1：春3-5／夏6-8／秋9-11／冬12-2）', () => {
  const table: Array<[number, string]> = [
    [1, 'winter'],
    [2, 'winter'],
    [3, 'spring'],
    [4, 'spring'],
    [5, 'spring'],
    [6, 'summer'],
    [7, 'summer'],
    [8, 'summer'],
    [9, 'autumn'],
    [10, 'autumn'],
    [11, 'autumn'],
    [12, 'winter'],
  ];

  it.each(table)('month=%i → %s', (month, season) => {
    expect(seasonOf(month)).toBe(season);
  });
});

describe('isMonthStart／isSeasonStartMonth', () => {
  it('dayOfMonth=1 為月初，其餘不是', () => {
    expect(isMonthStart(1)).toBe(true);
    expect(isMonthStart(2)).toBe(false);
    expect(isMonthStart(DAYS_PER_MONTH)).toBe(false);
  });

  it('僅 3／6／9／12 月為季初月', () => {
    for (let m = 1; m <= MONTHS_PER_YEAR; m += 1) {
      expect(isSeasonStartMonth(m)).toBe([3, 6, 9, 12].includes(m));
    }
  });
});

describe('dayToCalendar／calendarToDay（02 §5.6 canonical 公式；absoluteDay 換算）', () => {
  it('absoluteDay=0 為劇本起始年 1 月 1 日', () => {
    expect(dayToCalendar(0)).toEqual({ year: EPOCH_YEAR, month: 1, dayOfMonth: 1 });
  });

  it('月末 → 次月 1 日（day 29 → 30；day 30 → 2 月 1 日）', () => {
    expect(dayToCalendar(DAYS_PER_MONTH - 1)).toEqual({
      year: EPOCH_YEAR,
      month: 1,
      dayOfMonth: DAYS_PER_MONTH,
    });
    expect(dayToCalendar(DAYS_PER_MONTH)).toEqual({ year: EPOCH_YEAR, month: 2, dayOfMonth: 1 });
  });

  it('年末 → 次年 1 月 1 日（day 359 → 1560/12/30；day 360 → 1561/1/1；360 日=1 年）', () => {
    expect(dayToCalendar(DAYS_PER_YEAR - 1)).toEqual({
      year: EPOCH_YEAR,
      month: 12,
      dayOfMonth: DAYS_PER_MONTH,
    });
    expect(dayToCalendar(DAYS_PER_YEAR)).toEqual({
      year: EPOCH_YEAR + 1,
      month: 1,
      dayOfMonth: 1,
    });
  });

  it('calendarToDay 為 dayToCalendar 之逆函式（day → calendar → day 往返，涵蓋 5 年）', () => {
    for (let day = 0; day < DAYS_PER_YEAR * 5; day += 1) {
      const cal = dayToCalendar(day);
      expect(calendarToDay(cal.year, cal.month, cal.dayOfMonth)).toBe(day);
    }
  });

  it('dayToCalendar 為 calendarToDay 之逆函式（calendar → day → calendar 往返，逐月抽樣）', () => {
    for (let yearOffset = 0; yearOffset < 3; yearOffset += 1) {
      for (let month = 1; month <= MONTHS_PER_YEAR; month += 1) {
        for (const dayOfMonth of [1, 15, DAYS_PER_MONTH]) {
          const year = EPOCH_YEAR + yearOffset;
          const day = calendarToDay(year, month, dayOfMonth);
          expect(dayToCalendar(day)).toEqual({ year, month, dayOfMonth });
        }
      }
    }
  });
});

describe('advanceOneDay（就地推進；INV-24：與 day 換算一致）', () => {
  it('逐日推進 2 個年度，每步快取皆與 dayToCalendar(day) 一致', () => {
    const time = makeTime(0);
    for (let i = 0; i < DAYS_PER_YEAR * 2; i += 1) {
      advanceOneDay(time);
      const expected = dayToCalendar(time.day);
      expect({ year: time.year, month: time.month, dayOfMonth: time.dayOfMonth }).toEqual(expected);
    }
    expect(time.day).toBe(DAYS_PER_YEAR * 2);
    expect(time.year).toBe(EPOCH_YEAR + 2);
    expect(time.month).toBe(1);
    expect(time.dayOfMonth).toBe(1);
  });

  it('跨年界：1560/12/30 推進一日 → 1561/1/1', () => {
    const time = makeTime(calendarToDay(EPOCH_YEAR, 12, DAYS_PER_MONTH));
    advanceOneDay(time);
    expect(time).toMatchObject({ year: EPOCH_YEAR + 1, month: 1, dayOfMonth: 1 });
  });
});

describe('timeSystem（advanceDay Step 2：03 §3.2.4／§5.2）', () => {
  function run(day: number): { state: GameState; events: GameEvent[] } {
    const state = makeState(makeTime(day));
    const events: GameEvent[] = [];
    timeSystem(state, (e) => events.push(e));
    return { state, events };
  }

  it('平日推進：日期 +1，不發任何事件', () => {
    // 1560/1/5（day=4）→ 1560/1/6，非月初
    const { state, events } = run(calendarToDay(EPOCH_YEAR, 1, 5));
    expect(state.time).toMatchObject({ year: EPOCH_YEAR, month: 1, dayOfMonth: 6 });
    expect(events).toEqual([]);
  });

  it('月初（非季初月）：只發 time.monthStart', () => {
    // 1560/1/30 → 1560/2/1（2 月非季初月）
    const { state, events } = run(calendarToDay(EPOCH_YEAR, 1, DAYS_PER_MONTH));
    expect(state.time).toMatchObject({ year: EPOCH_YEAR, month: 2, dayOfMonth: 1 });
    expect(events).toEqual([
      { type: 'time.monthStart', day: state.time.day, clanIds: [], year: EPOCH_YEAR, month: 2 },
    ]);
  });

  it('季初（春）：2/30 → 3/1，發 monthStart 與 seasonStart(spring)', () => {
    const { state, events } = run(calendarToDay(EPOCH_YEAR, 2, DAYS_PER_MONTH));
    expect(state.time).toMatchObject({ year: EPOCH_YEAR, month: 3, dayOfMonth: 1 });
    expect(events).toEqual([
      { type: 'time.monthStart', day: state.time.day, clanIds: [], year: EPOCH_YEAR, month: 3 },
      {
        type: 'time.seasonStart',
        day: state.time.day,
        clanIds: [],
        year: EPOCH_YEAR,
        season: 'spring',
      },
    ]);
  });

  it('季初（夏/秋/冬）三季界皆正確發出對應 season', () => {
    const cases: Array<[number, number, string]> = [
      [5, 6, 'summer'],
      [8, 9, 'autumn'],
      [11, 12, 'winter'],
    ];
    for (const [fromMonth, toMonth, season] of cases) {
      const { state, events } = run(calendarToDay(EPOCH_YEAR, fromMonth, DAYS_PER_MONTH));
      expect(state.time.month).toBe(toMonth);
      expect(events).toEqual([
        {
          type: 'time.monthStart',
          day: state.time.day,
          clanIds: [],
          year: EPOCH_YEAR,
          month: toMonth,
        },
        { type: 'time.seasonStart', day: state.time.day, clanIds: [], year: EPOCH_YEAR, season },
      ]);
    }
  });

  it('跨年：12/30 → 次年 1/1，只發 monthStart（1 月非季初月，季節延續冬）', () => {
    const { state, events } = run(calendarToDay(EPOCH_YEAR, 12, DAYS_PER_MONTH));
    expect(state.time).toMatchObject({ year: EPOCH_YEAR + 1, month: 1, dayOfMonth: 1 });
    expect(events).toEqual([
      {
        type: 'time.monthStart',
        day: state.time.day,
        clanIds: [],
        year: EPOCH_YEAR + 1,
        month: 1,
      },
    ]);
    expect(seasonOf(state.time.month)).toBe('winter'); // 延續冬季，非新季界
  });
});
