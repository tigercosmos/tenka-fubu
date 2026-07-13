import { describe, expect, it } from 'vitest';
import {
  abortDebugBattle,
  DEBUG_BATTLE_LAYOUT_ID,
  startDebugBattle,
} from '../../src/core/debugBattle';
import { validateState } from '../../src/core/state/invariants';
import { buildTinyState } from '../fixtures/tiny';

describe('M5-8 debug-battle-01', () => {
  it('固定建立 seed 42、雙方各兩部隊的合法合戰，並可無獎懲中止', () => {
    const state = buildTinyState({ seed: 42 });
    state.meta.debugMode = true;

    const battleId = startDebugBattle(state, DEBUG_BATTLE_LAYOUT_ID);
    const battle = state.battles[battleId]!;

    expect(state.meta.seed).toBe(42);
    expect(battle.units).toHaveLength(4);
    expect(battle.units.filter((unit) => unit.side === 'attacker')).toHaveLength(2);
    expect(battle.units.filter((unit) => unit.side === 'defender')).toHaveLength(2);
    expect(validateState(state)).toEqual([]);

    abortDebugBattle(state, battleId);
    expect(state.battles[battleId]).toBeUndefined();
    expect(Object.values(state.armies).every((army) => army.battleId === null)).toBe(true);
    expect(validateState(state)).toEqual([]);
  });

  it('拒絕產品模式與未知佈局', () => {
    const production = buildTinyState({ seed: 42 });
    expect(() => startDebugBattle(production, DEBUG_BATTLE_LAYOUT_ID)).toThrow(
      '僅除錯模式可載入合戰佈局',
    );

    const debug = buildTinyState({ seed: 42 });
    debug.meta.debugMode = true;
    expect(() => startDebugBattle(debug, 'unknown-layout')).toThrow('未知的除錯合戰佈局');
  });
});
