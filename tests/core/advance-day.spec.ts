// advanceDay 13 步骨架測試（M1-7 驗收：18-roadmap §3.4「空劇本 3600 tick 無例外；步序鎖定」；
// 03-T4「13 步固定呼叫序、TickResult、stateVersion 遞增、deferredEvents 併入」）。
// 規格：plan/03-game-loop.md §3.2（13 步）／§3.2.4（虛擬碼）／§4.1（TickResult）／§5.2（Step 2 deferredEvents 併入）／
//       §3.9.1（月結自動存檔 hook）；plan/00-foundations.md §5.4（13 步順序 canonical）。

import { describe, expect, it } from 'vitest';
import { STEP_ORDER, STEP_SEQUENCE, advanceDay } from '../../src/core/systems/index';
import type { StepName } from '../../src/core/systems/index';
import type { Command, CommandEnvelope } from '../../src/core/commands/types';
import type { EvtCommandRejected, GameEvent } from '../../src/core/state/events';
import { DAYS_PER_MONTH, DAYS_PER_YEAR, EPOCH_YEAR } from '../../src/core/systems/time';
import { makeLoopTestState, TEST_CLAN } from '../helpers/loopState';

/** 13 步 canonical 順序（00 §5.4／03 §3.2.3；Step 7/8＝military.movement／military.combat）。 */
const CANONICAL_STEPS: readonly StepName[] = [
  'applyCommands',
  'time',
  'events',
  'diplomacy',
  'development',
  'economy',
  'militaryMovement',
  'militaryCombat',
  'officers',
  'proposals',
  'ai',
  'victory',
  'reports',
];

function grantGold(gold: number): Command {
  return { type: 'debugGrant', clanId: TEST_CLAN, gold, food: null, castleId: null };
}
function env(seq: number, command: Command, issuedDay = 0): CommandEnvelope {
  return { seq, issuedDay, command };
}

describe('13 步固定順序鎖定（常數陣列；00 §5.4）', () => {
  it('STEP_SEQUENCE 恰為 canonical 13 步、順序一致', () => {
    expect(STEP_SEQUENCE).toEqual(CANONICAL_STEPS);
    expect(STEP_ORDER).toHaveLength(13);
  });

  it('STEP_ORDER 每項 name 與 STEP_SEQUENCE 對齊（run 為函式；不可能漂移）', () => {
    expect(STEP_ORDER.map((s) => s.name)).toEqual([...STEP_SEQUENCE]);
    for (const step of STEP_ORDER) {
      expect(typeof step.run).toBe('function');
    }
  });
});

describe('advanceDay 基本推進（Step 1／Step 2 實作步驟）', () => {
  it('Step 2：日期 +1（day 0 → day 1，dayOfMonth 2）', () => {
    const state = makeLoopTestState({ day: 0 });
    const result = advanceDay(state, []);
    expect(state.time.day).toBe(1);
    expect(state.time.dayOfMonth).toBe(2);
    expect(result.state).toBe(state); // 就地修改、回傳同一參考
  });

  it('Step 1：套用佇列中的 debugGrant（gold 增加、lastAppliedCmdSeq 前進、無 rejected）', () => {
    const state = makeLoopTestState({ gold: 100 });
    const result = advanceDay(state, [env(1, grantGold(500))]);
    expect(state.clans[TEST_CLAN]?.gold).toBe(600);
    expect(state.meta.lastAppliedCmdSeq).toBe(1);
    expect(result.events.some((e) => e.type === 'command.rejected')).toBe(false);
  });

  it('Step 1 以舊日期驗證、Step 2 之後才推進（command.rejected.day＝舊 absoluteDay）', () => {
    const state = makeLoopTestState({ day: 5, debugMode: false });
    const result = advanceDay(state, [env(1, grantGold(1))]);
    const rejected = result.events.find(
      (e): e is EvtCommandRejected => e.type === 'command.rejected',
    );
    expect(rejected?.day).toBe(5); // Step 1 舊日期
    expect(state.time.day).toBe(6); // Step 2 已推進
  });

  it('stateVersion 每 tick +1', () => {
    const state = makeLoopTestState();
    expect(state.meta.stateVersion).toBe(0);
    advanceDay(state, []);
    advanceDay(state, []);
    expect(state.meta.stateVersion).toBe(2);
  });
});

describe('TickResult 形狀與月結 hook（§4.1／§3.9.1）', () => {
  it('perf.stepMs 長度＝13、全 0；totalMs 0（core 無 Date.now）', () => {
    const result = advanceDay(makeLoopTestState(), []);
    expect(result.perf.stepMs).toHaveLength(13);
    expect(result.perf.stepMs.every((ms) => ms === 0)).toBe(true);
    expect(result.perf.totalMs).toBe(0);
  });

  it('autosaveDue：推進後為每月 1 日則 monthly，否則 null', () => {
    // 1560/1/30（day 29）→ 1560/2/1（dayOfMonth 1）
    const monthEnd = makeLoopTestState({ day: DAYS_PER_MONTH - 1 });
    expect(advanceDay(monthEnd, []).autosaveDue).toBe('monthly');
    // 平日
    const normal = makeLoopTestState({ day: 5 });
    expect(advanceDay(normal, []).autosaveDue).toBeNull();
  });

  it('月初 tick 之 autoPauseReasons 含 monthStart（M1-8 reports 系統已接線）', () => {
    const monthEnd = makeLoopTestState({ day: DAYS_PER_MONTH - 1 });
    expect(advanceDay(monthEnd, []).autoPauseReasons).toEqual(['monthStart']);
  });

  it('平日 tick 之 autoPauseReasons 恆空', () => {
    const normal = makeLoopTestState({ day: 5 });
    expect(advanceDay(normal, []).autoPauseReasons).toEqual([]);
  });
});

describe('事件流（Step 2 時間事件、deferredEvents 併入、Step 1 拒絕事件）', () => {
  it('月初推進發 time.monthStart 並出現在 result.events', () => {
    const state = makeLoopTestState({ day: DAYS_PER_MONTH - 1 }); // → 2/1
    const result = advanceDay(state, []);
    expect(result.events.some((e) => e.type === 'time.monthStart')).toBe(true);
  });

  it('平日空佇列 tick 不產生任何事件', () => {
    const state = makeLoopTestState({ day: 5 });
    expect(advanceDay(state, []).events).toEqual([]);
  });

  it('Step 2 併入 meta.deferredEvents 至事件流後清空（§5.2）', () => {
    const state = makeLoopTestState({ day: 5 });
    const deferred: GameEvent = {
      type: 'clan.destroyed',
      day: 0,
      clanIds: [TEST_CLAN],
      clanId: TEST_CLAN,
      byClanId: null,
    };
    state.meta.deferredEvents = [deferred];
    const result = advanceDay(state, []);
    expect(result.events).toContainEqual(deferred);
    expect(state.meta.deferredEvents).toEqual([]);
  });

  it('command.rejected 經 advanceDay 流至 result.events', () => {
    const state = makeLoopTestState({ debugMode: false });
    const result = advanceDay(state, [env(1, grantGold(1))]);
    expect(result.events.some((e) => e.type === 'command.rejected')).toBe(true);
  });
});

describe('territoryChangedToday 髒標記（§3.2.4：Step 13 後重置）', () => {
  it('advanceDay 結尾重置為 false', () => {
    const state = makeLoopTestState();
    state.meta.territoryChangedToday = true;
    advanceDay(state, []);
    expect(state.meta.territoryChangedToday).toBe(false);
  });
});

describe('空劇本連跑 3600 tick 無例外（10 年；M1-7 驗收）', () => {
  it('連跑 3600 tick、日期/年份/stateVersion 連續正確', () => {
    const state = makeLoopTestState({ day: 0 });
    expect(() => {
      for (let i = 0; i < DAYS_PER_YEAR * 10; i += 1) {
        advanceDay(state, []);
      }
    }).not.toThrow();
    expect(state.time.day).toBe(DAYS_PER_YEAR * 10); // 3600
    expect(state.time.year).toBe(EPOCH_YEAR + 10); // 1570
    expect(state.time.month).toBe(1);
    expect(state.time.dayOfMonth).toBe(1);
    expect(state.meta.stateVersion).toBe(DAYS_PER_YEAR * 10);
  });
});
