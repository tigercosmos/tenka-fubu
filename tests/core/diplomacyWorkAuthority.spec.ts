import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { applyCommand } from '../../src/core/commands/apply';
import type { CommandByType } from '../../src/core/commands/registry';
import { validateCommand } from '../../src/core/commands/validate';
import { validateState } from '../../src/core/state/invariants';
import { canonicalStringify } from '../../src/core/state/serialize';
import { diplomacySystem } from '../../src/core/systems/diplomacy';
import { getSentiment, getTrust } from '../../src/core/systems/diplomacyCommon';
import { DAYS_PER_MONTH, dayToCalendar } from '../../src/core/systems/time';
import { buildTinyState, CLAN_ALPHA, CLAN_BETA, OFF_ALPHA_BUSHO } from '../fixtures/tiny';

const work: CommandByType['startDiploWork'] = {
  type: 'startDiploWork',
  clanId: CLAN_ALPHA,
  target: CLAN_BETA,
  executorId: OFF_ALPHA_BUSHO,
};

function prepared(pol: number) {
  const state = buildTinyState();
  const officer = state.officers[OFF_ALPHA_BUSHO]!;
  officer.pol = pol;
  officer.statGrowth.pol = 0;
  officer.traits = [];
  expect(state.clans[CLAN_ALPHA]!.courtRank).toBe('none');
  expect(state.clans[CLAN_ALPHA]!.taimei.activeTaimeiId).toBeNull();
  expect(validateState(state)).toEqual([]);
  const before = canonicalStringify(state);
  expect(validateCommand(state, work)).toEqual({ ok: true });
  expect(canonicalStringify(state)).toBe(before);
  applyCommand(state, work, () => {});
  expect(state.diplomacy.missions).toHaveLength(1);
  expect(getTrust(state, CLAN_ALPHA, CLAN_BETA)).toBe(0);
  expect(validateState(state)).toEqual([]);
  return state;
}

describe('02 D16 /08 directional monthly diplomacy work', () => {
  it('earns literal 6 per month and 60 over ten months with effective pol100', () => {
    const state = prepared(100);
    const rng = structuredClone(state.rng);
    const gold = state.clans[CLAN_ALPHA]!.gold;
    for (let month = 1; month <= 10; month++) {
      expect(getSentiment(state, CLAN_BETA, CLAN_ALPHA)).toBe(0);
      const events = diplomacySystem(state);
      expect(events.some((event) => event.type === 'diplo.workStopped')).toBe(false);
      expect(getTrust(state, CLAN_ALPHA, CLAN_BETA)).toBe(month * 6);
      expect(getTrust(state, CLAN_BETA, CLAN_ALPHA)).toBe(0);
      expect(validateState(state)).toEqual([]);
      state.time.day += DAYS_PER_MONTH;
      Object.assign(state.time, dayToCalendar(state.time.day));
    }
    expect(getTrust(state, CLAN_ALPHA, CLAN_BETA)).toBe(60);
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(gold - 10 * BAL.diplomacyWorkMonthlyCost);
    expect(state.rng).toEqual(rng);
    expect(validateState(state)).toEqual([]);
  });

  it('preserves noninteger formula gains over three months rather than a flat3 monthly', () => {
    const state = prepared(73);
    const rng = structuredClone(state.rng);
    const monthlyGain = BAL.trustGainBase + 73 / BAL.trustGainPolDivisor;
    expect(monthlyGain).toBe(4.92);
    for (let month = 1; month <= 3; month++) {
      diplomacySystem(state);
      expect(getTrust(state, CLAN_ALPHA, CLAN_BETA)).toBeCloseTo(month * 4.92, 12);
      expect(getTrust(state, CLAN_BETA, CLAN_ALPHA)).toBe(0);
      expect(validateState(state)).toEqual([]);
      state.time.day += DAYS_PER_MONTH;
      Object.assign(state.time, dayToCalendar(state.time.day));
    }
    expect(getTrust(state, CLAN_ALPHA, CLAN_BETA)).toBeCloseTo(14.76, 12);
    expect(getTrust(state, CLAN_ALPHA, CLAN_BETA)).not.toBe(9);
    expect(Number.isInteger(getTrust(state, CLAN_ALPHA, CLAN_BETA))).toBe(false);
    expect(state.rng).toEqual(rng);
    expect(validateState(state)).toEqual([]);
  });
});
