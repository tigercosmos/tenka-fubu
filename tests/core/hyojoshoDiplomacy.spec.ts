import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { applyCommand } from '../../src/core/commands/apply';
import { applyCommands, CommandQueue } from '../../src/core/commands/queue';
import { validateCommand } from '../../src/core/commands/validate';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { validateState } from '../../src/core/state/invariants';
import { canonicalStringify } from '../../src/core/state/serialize';
import { diplomacySystem } from '../../src/core/systems/diplomacy';
import { facilitiesDaily } from '../../src/core/systems/facilities';
import { FACILITIES } from '../../src/core/facilities';
import { adjustTrust, getTrust } from '../../src/core/systems/diplomacyCommon';
import { dayToCalendar, DAYS_PER_MONTH } from '../../src/core/systems/time';
import type { FacilityTypeId, TraitId, TaimeiId } from '../../src/core/state/ids';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_BUSHO,
} from '../fixtures/tiny';

const facility = 'fac.hyojosho' as FacilityTypeId;
const targets = [CLAN_BETA, 'court', 'shogunate'] as const;
type Target = (typeof targets)[number];

function fixture(target: Target, count = 1) {
  const state = buildTinyState();
  // Synthetic initial geography has two main castles, permitting two legal completed facilities.
  state.castles[CASTLE_A2]!.tier = 'main';
  state.court.shogunateExists = true;
  const officer = state.officers[OFF_ALPHA_BUSHO]!;
  officer.pol = 73;
  officer.statGrowth.pol = 0;
  officer.traits = [];
  for (const id of [CASTLE_A1, CASTLE_A2].slice(0, count))
    state.castles[id]!.facilities.push(facility);
  const command = {
    type: 'startDiploWork' as const,
    clanId: CLAN_ALPHA,
    target,
    executorId: officer.id,
  };
  const before = canonicalStringify(state);
  expect(validateCommand(state, command)).toEqual({ ok: true });
  expect(canonicalStringify(state)).toBe(before);
  applyCommand(state, command, () => {});
  expect(validateState(state)).toEqual([]);
  return state;
}

function value(state: ReturnType<typeof fixture>, target: Target) {
  return target === 'court'
    ? (state.court.courtFavor[CLAN_ALPHA] ?? 0)
    : target === 'shogunate'
      ? (state.court.shogunateFavor[CLAN_ALPHA] ?? 0)
      : getTrust(state, CLAN_ALPHA, target);
}

function base(target: Target) {
  return target === 'court'
    ? BAL.courtFavorGainBase + 73 / BAL.courtFavorGainPolDivisor
    : target === 'shogunate'
      ? BAL.shogunateFavorGainBase + 73 / BAL.shogunateFavorGainPolDivisor
      : BAL.trustGainBase + 73 / BAL.trustGainPolDivisor;
}

describe('completed owned Hyojosho diplomatic work gains', () => {
  it.each(targets)(
    'boosts paid %s work once, even with two facilities; costs and RNG unchanged',
    (target) => {
      for (const count of [0, 1, 2]) {
        const state = fixture(target, count);
        const gold = state.clans[CLAN_ALPHA]!.gold;
        const rng = structuredClone(state.rng);
        diplomacySystem(state);
        expect(value(state, target)).toBeCloseTo(
          base(target) * (count ? BAL.facDiplomacyWorkGainMult : 1),
          12,
        );
        const cost =
          target === 'court'
            ? BAL.courtWorkMonthlyCost
            : target === 'shogunate'
              ? BAL.shogunateWorkMonthlyCost
              : BAL.diplomacyWorkMonthlyCost;
        expect(state.clans[CLAN_ALPHA]!.gold).toBe(gold - cost);
        expect(state.rng).toEqual(rng);
        expect(validateState(state)).toEqual([]);
      }
    },
  );

  it.each(targets)('ignores enemy and queued facilities for %s work', (target) => {
    const state = fixture(target, 0);
    state.castles[CASTLE_B1]!.facilities.push(facility);
    state.castles[CASTLE_A1]!.buildQueue.push({ facilityTypeId: facility, daysLeft: 1 });
    diplomacySystem(state);
    expect(value(state, target)).toBeCloseTo(base(target), 12);
    expect(validateState(state)).toEqual([]);
  });

  it('reads completion and demolition afresh without caching or modifying the facility', () => {
    const state = fixture(CLAN_BETA, 0);
    for (const active of [false, true, false]) {
      state.castles[CASTLE_A1]!.facilities = active ? [facility] : [];
      const before = value(state, CLAN_BETA);
      diplomacySystem(state);
      expect(value(state, CLAN_BETA) - before).toBeCloseTo(
        base(CLAN_BETA) * (active ? BAL.facDiplomacyWorkGainMult : 1),
        12,
      );
      expect(state.castles[CASTLE_A1]!.facilities).toEqual(active ? [facility] : []);
      state.time.day += DAYS_PER_MONTH;
      Object.assign(state.time, dayToCalendar(state.time.day));
      expect(validateState(state)).toEqual([]);
    }
  });

  it('composes the gain with executor, cumulative rank and legally invoked taimei bonuses, without rounding', () => {
    const state = fixture(CLAN_BETA);
    state.officers[OFF_ALPHA_BUSHO]!.traits = ['trait.gaiko' as TraitId];
    state.clans[CLAN_ALPHA]!.courtRank = 'ju5jo';
    const taimeiId = 'taimei.gaiko-kosei' as TaimeiId;
    state.clans[CLAN_ALPHA]!.prestige = BAL.taimeiUnlockPrestige['taimei.gaiko-kosei'];
    const command = { type: 'invokeTaimei' as const, clanId: CLAN_ALPHA, taimeiId };
    expect(validateCommand(state, command)).toEqual({ ok: true });
    applyCommand(state, command, () => {});
    diplomacySystem(state);
    expect(value(state, CLAN_BETA)).toBeCloseTo(
      base(CLAN_BETA) *
        (1 + BAL.traitGaiko) *
        BAL.courtTrustGainMult *
        BAL.taimeiGaikoTrustMult *
        BAL.facDiplomacyWorkGainMult,
      12,
    );
    expect(Number.isInteger(value(state, CLAN_BETA))).toBe(false);
    expect(validateState(state)).toEqual([]);
  });

  it('enables the gain only after a legal queued build completes, then disables it after legal demolition', () => {
    const state = fixture(CLAN_BETA, 0);
    const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
    const build = {
      type: 'buildFacility' as const,
      clanId: CLAN_ALPHA,
      castleId: CASTLE_A1,
      facilityTypeId: facility,
    };
    expect(validateCommand(state, build)).toEqual({ ok: true });
    queue.enqueue(build, state.time.day);
    expect(applyCommands(state, queue.drain(), () => {})).toHaveLength(1);
    diplomacySystem(state);
    expect(value(state, CLAN_BETA)).toBeCloseTo(base(CLAN_BETA), 12);
    for (let day = 0; day < FACILITIES[facility]!.buildDays; day++) {
      state.time.day++;
      Object.assign(state.time, dayToCalendar(state.time.day));
      facilitiesDaily(state);
      expect(validateState(state)).toEqual([]);
    }
    expect(state.castles[CASTLE_A1]!.facilities).toContain(facility);
    const before = value(state, CLAN_BETA);
    diplomacySystem(state);
    expect(value(state, CLAN_BETA) - before).toBeCloseTo(
      base(CLAN_BETA) * BAL.facDiplomacyWorkGainMult,
      12,
    );
    const demolish = {
      type: 'demolishFacility' as const,
      clanId: CLAN_ALPHA,
      castleId: CASTLE_A1,
      facilityTypeId: facility,
    };
    expect(validateCommand(state, demolish)).toEqual({ ok: true });
    queue.enqueue(demolish, state.time.day);
    expect(applyCommands(state, queue.drain(), () => {})).toHaveLength(1);
    state.time.day += DAYS_PER_MONTH;
    Object.assign(state.time, dayToCalendar(state.time.day));
    const after = value(state, CLAN_BETA);
    diplomacySystem(state);
    expect(value(state, CLAN_BETA) - after).toBeCloseTo(base(CLAN_BETA), 12);
    expect(validateState(state)).toEqual([]);
  });

  it('rechecks current ownership at each settlement, not the initial facility owner', () => {
    const state = fixture(CLAN_BETA, 0);
    state.castles[CASTLE_A2]!.facilities.push(facility);
    diplomacySystem(state);
    expect(value(state, CLAN_BETA)).toBeCloseTo(base(CLAN_BETA) * BAL.facDiplomacyWorkGainMult, 12);
    // Controlled valid ownership transition isolates the selector; not a conquest journey.
    state.castles[CASTLE_A2]!.ownerClanId = CLAN_BETA;
    state.castles[CASTLE_A2]!.lordId = null;
    for (const district of Object.values(state.districts)) {
      if (district.castleId === CASTLE_A2) {
        district.ownerClanId = CLAN_BETA;
        district.stewardId = null;
      }
    }
    expect(validateState(state)).toEqual([]);
    state.time.day += DAYS_PER_MONTH;
    Object.assign(state.time, dayToCalendar(state.time.day));
    const before = value(state, CLAN_BETA);
    diplomacySystem(state);
    expect(value(state, CLAN_BETA) - before).toBeCloseTo(base(CLAN_BETA), 12);
  });

  it.each(targets)('preserves %s caps and rejects unpaid work without a gain', (target) => {
    const state = fixture(target);
    if (target === 'court') state.court.courtFavor[CLAN_ALPHA] = BAL.courtFavorMax - 1;
    else if (target === 'shogunate')
      state.court.shogunateFavor[CLAN_ALPHA] = BAL.shogunateFavorMax - 1;
    else adjustTrust(state, CLAN_ALPHA, CLAN_BETA, BAL.trustMax - 1);
    diplomacySystem(state);
    expect(value(state, target)).toBe(
      target === 'court'
        ? BAL.courtFavorMax
        : target === 'shogunate'
          ? BAL.shogunateFavorMax
          : BAL.trustMax,
    );
    const poor = fixture(target);
    poor.clans[CLAN_ALPHA]!.gold = 0;
    expect(diplomacySystem(poor).some((event) => event.type === 'diplo.workStopped')).toBe(true);
    expect(value(poor, target)).toBe(0);
    expect(poor.diplomacy.missions).toEqual([]);
    expect(validateState(poor)).toEqual([]);
  });

  it.each(targets)('preserves fractional %s gain and native continuation', (target) => {
    const state = fixture(target);
    diplomacySystem(state);
    const decoded = decodeSave(encodeSave(state, 0));
    if (!decoded.ok) throw new Error(decoded.code);
    const restored = decoded.saveFile.state;
    for (let month = 0; month < 3; month++) {
      for (const current of [state, restored]) {
        current.time.day += DAYS_PER_MONTH;
        Object.assign(current.time, dayToCalendar(current.time.day));
      }
      expect(diplomacySystem(restored)).toEqual(diplomacySystem(state));
      expect(canonicalStringify(restored)).toBe(canonicalStringify(state));
      expect(validateState(state)).toEqual([]);
    }
    expect(value(state, target)).toBeCloseTo(4 * base(target) * BAL.facDiplomacyWorkGainMult, 12);
    expect(Number.isInteger(value(state, target))).toBe(false);
  });
});
