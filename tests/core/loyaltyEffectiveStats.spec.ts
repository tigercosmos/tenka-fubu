import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { loyaltyTarget } from '../../src/core/systems/officers';
import { advanceDay } from '../../src/core/systems';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { validateState } from '../../src/core/state/invariants';
import { calendarToDay } from '../../src/core/systems/time';
import type { TraitId } from '../../src/core/state/ids';
import { buildTinyState, CLAN_ALPHA, OFF_ALPHA_LORD, OFF_ALPHA_TAISHO } from '../fixtures/tiny';

function boundary(base: number, growth: number) {
  const state = buildTinyState();
  const leader = state.officers[OFF_ALPHA_LORD]!;
  leader.pol = base;
  leader.statGrowth.pol = 0;
  const officer = state.officers[OFF_ALPHA_TAISHO]!;
  const ordinaryTarget = loyaltyTarget(state, officer);
  const expected =
    ordinaryTarget -
    Math.floor(base / BAL.loyaltyLeaderPolDivisor) +
    Math.floor(Math.min(BAL.abilityMax, base + growth) / BAL.loyaltyLeaderPolDivisor);
  leader.statGrowth.pol = growth;
  expect(validateState(state)).toEqual([]);
  return { state, leader, officer, ordinaryTarget, expected };
}

describe('ordinary effective ruler politics in loyalty targets', () => {
  it.each([
    [59, 1],
    [BAL.abilityMax - 1, 1],
    [BAL.abilityMax - 1, BAL.statGrowthCap],
    [BAL.abilityMax, BAL.statGrowthCap],
  ])('uses capped base %s plus growth %s without mutating state or RNG', (base, growth) => {
    const { state, officer, expected } = boundary(base, growth);
    const before = structuredClone(state);
    expect(loyaltyTarget(state, officer)).toBe(expected);
    expect(state).toEqual(before);
  });

  it('does not apply the tactical Gunshin multiplier', () => {
    const { state, leader, officer, expected } = boundary(59, 1);
    leader.traits = ['trait.gunshin' as TraitId];
    const before = structuredClone(state);
    expect(loyaltyTarget(state, officer)).toBe(expected);
    expect(state).toEqual(before);
  });

  it('applies the effective target in the real monthly tick and resumes identically from a save', () => {
    const { state, officer, ordinaryTarget, expected } = boundary(59, 1);
    // Valid pre-month boundary; no command or injected troop/ownership changes.
    state.time = {
      day: calendarToDay(1560, 4, 30),
      year: 1560,
      month: 4,
      dayOfMonth: 30,
    };
    state.clans[CLAN_ALPHA]!.gold = 10_000;
    officer.loyalty = ordinaryTarget;
    expect(expected - ordinaryTarget).toBe(1);
    expect(validateState(state)).toEqual([]);
    const decoded = decodeSave(encodeSave(state, 42));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.code);
    const loaded = decoded.saveFile.state;
    const ability = { pol: state.officers[OFF_ALPHA_LORD]!.pol, growth: 1 };
    expect(advanceDay(loaded, []).events).toEqual(advanceDay(state, []).events);
    expect(officer.loyalty).toBe(expected);
    expect(state.officers[OFF_ALPHA_LORD]!.pol).toBe(ability.pol);
    expect(state.officers[OFF_ALPHA_LORD]!.statGrowth.pol).toBe(ability.growth);
    expect(state.officers[OFF_ALPHA_LORD]!.loyalty).toBe(100);
    // Save codec omits only the transient AI intent history.
    state.ai.intentLog = [];
    loaded.ai.intentLog = [];
    expect(loaded).toEqual(state);
    expect(loaded.rng).toEqual(state.rng);
    expect(validateState(state)).toEqual([]);
  });
});
