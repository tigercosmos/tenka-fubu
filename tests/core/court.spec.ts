import { describe, expect, it, vi } from 'vitest';
import { BAL } from '../../src/core/balance';
import type { GameEvent } from '../../src/core/state/events';
import type { CommandByType } from '../../src/core/commands/registry';
import { createRngStream } from '../../src/core/rng';
import { canonicalStringify } from '../../src/core/state/serialize';
import {
  CLAN_ALPHA,
  CLAN_BETA,
  CASTLE_A1,
  OFF_ALPHA_TAISHO,
  buildTinyState,
} from '../fixtures/tiny';
import {
  courtRankOrder,
  shogunateTitleOrder,
  courtUnlocks,
  extraPolicySlots,
  workCostMultiplier,
  courtAcceptanceBonus,
  courtFavorGainMonthly,
  courtMonthlyForClan,
  collapseShogunate,
} from '../../src/core/systems/court';
import {
  applyRequestCourtRank,
  validateRequestCourtRank,
  applyRequestMediation,
  validateRequestMediation,
  mediationFavorCost,
  validateRequestShogunateTitle,
  applyRequestShogunateTitle,
  validateNominateShogun,
  applyNominateShogun,
  shogunateTitleCost,
} from '../../src/core/commands/courtCommands';
import { ensureDiplomacyRow, getSentiment } from '../../src/core/systems/diplomacyCommon';

vi.mock('../../src/data/courtMetadata', () => ({
  getCourtMetadata: () => ({ capitalCastleId: 'castle.a1', shogunClanId: 'clan.beta' }),
}));

function command<T extends keyof CommandByType>(type: T): CommandByType[T] {
  return { type, clanId: CLAN_ALPHA, issuedDay: 0, sequence: 1 } as unknown as CommandByType[T];
}
function prepared() {
  const state = buildTinyState();
  state.clans[CLAN_ALPHA]!.gold = 100_000;
  state.clans[CLAN_ALPHA]!.prestige = BAL.prestigeMax;
  state.court.courtFavor[CLAN_ALPHA] = BAL.courtFavorMax;
  state.court.shogunateFavor[CLAN_ALPHA] = BAL.shogunateFavorMax;
  state.court.shogunateExists = true;
  return state;
}
const events = () => {
  const result: GameEvent[] = [];
  return { result, emit: (event: GameEvent) => result.push(event) };
};

describe('court ranks and persistent unlocks', () => {
  it('advances all eight canonical ranks without consuming favor and grants both policy slots', () => {
    const state = prepared(),
      { result, emit } = events();
    const clan = state.clans[CLAN_ALPHA]!;
    clan.prestige = 0;
    const gold = clan.gold;
    for (const def of BAL.courtRankTable) {
      const cmd = command('requestCourtRank');
      expect(validateRequestCourtRank(state, cmd)).toEqual({ ok: true });
      applyRequestCourtRank(state, cmd, emit);
      expect(clan.courtRank).toBe(def.id);
      expect(courtRankOrder(clan.courtRank)).toBe(def.rank);
    }
    expect(clan.gold).toBe(gold - BAL.courtRankTable.reduce((sum, def) => sum + def.goldCost, 0));
    expect(clan.prestige).toBe(
      Math.min(
        BAL.prestigeMax,
        BAL.courtRankTable.reduce((sum, def) => sum + def.prestigeBonus, 0),
      ),
    );
    expect(state.court.courtFavor[CLAN_ALPHA]).toBe(BAL.courtFavorMax);
    expect(extraPolicySlots(state, CLAN_ALPHA)).toBe(2);
    expect(courtUnlocks(clan.courtRank).filter((u) => u === 'policySlot')).toHaveLength(2);
    expect(result).toHaveLength(BAL.courtRankTable.length);
    expect(validateRequestCourtRank(state, command('requestCourtRank')).ok).toBe(false);
  });

  it('validates exact favor and gold boundaries without writing or drawing RNG', () => {
    const state = prepared(),
      cmd = command('requestCourtRank'),
      def = BAL.courtRankTable[0]!;
    state.court.courtFavor[CLAN_ALPHA] = def.favorRequired - 1;
    const before = canonicalStringify(state);
    expect(validateRequestCourtRank(state, cmd).ok).toBe(false);
    expect(canonicalStringify(state)).toBe(before);
    state.court.courtFavor[CLAN_ALPHA] = def.favorRequired;
    state.clans[CLAN_ALPHA]!.gold = def.goldCost - 1;
    expect(validateRequestCourtRank(state, cmd)).toMatchObject({
      ok: false,
      reasonKey: 'cmd.reject.insufficientGold',
    });
    state.clans[CLAN_ALPHA]!.gold = def.goldCost;
    expect(validateRequestCourtRank(state, cmd).ok).toBe(true);
  });

  it('keeps fractional favor, decays only without missions, freezes shogunate favor after collapse', () => {
    const state = prepared(),
      officer = state.officers[OFF_ALPHA_TAISHO]!;
    officer.pol = 91;
    officer.statGrowth.pol = 1;
    expect(courtFavorGainMonthly(officer, 'court')).toBe(
      BAL.courtFavorGainBase + 92 / BAL.courtFavorGainPolDivisor,
    );
    state.court.courtFavor[CLAN_ALPHA] = 10.5;
    state.court.shogunateFavor[CLAN_ALPHA] = 10.5;
    state.diplomacy.missions.push({
      fromClanId: CLAN_ALPHA,
      target: 'court',
      officerId: officer.id,
      startDay: state.time.day,
    });
    courtMonthlyForClan(state, CLAN_ALPHA, () => {});
    expect(state.court.courtFavor[CLAN_ALPHA]).toBe(10.5);
    expect(state.court.shogunateFavor[CLAN_ALPHA]).toBe(10.5 - BAL.shogunateFavorDecayMonthly);
    state.diplomacy.missions = [];
    state.court.shogunateExists = false;
    const frozen = state.court.shogunateFavor[CLAN_ALPHA];
    courtMonthlyForClan(state, CLAN_ALPHA, () => {});
    expect(state.court.courtFavor[CLAN_ALPHA]).toBe(10.5 - BAL.courtFavorDecayMonthly);
    expect(state.court.shogunateFavor[CLAN_ALPHA]).toBe(frozen);
  });
});

describe('court mediation', () => {
  function setup() {
    const state = prepared();
    state.clans[CLAN_ALPHA]!.courtRank = 'ju4ge';
    ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA).lastHostileDay = state.time.day;
    const cmd = { ...command('requestMediation'), targetClanId: CLAN_BETA };
    return { state, cmd };
  }
  it('requires rank, war, favor, gold, and clan-wide cooldown', () => {
    const { state, cmd } = setup();
    expect(validateRequestMediation(state, cmd).ok).toBe(true);
    state.clans[CLAN_ALPHA]!.courtRank = 'ju5jo';
    expect(validateRequestMediation(state, cmd).ok).toBe(false);
    state.clans[CLAN_ALPHA]!.courtRank = 'sho3';
    expect(mediationFavorCost(state, CLAN_ALPHA)).toBe(
      Math.round(BAL.courtMediationFavorCost * BAL.courtMediationFavorDiscount),
    );
    state.court.mediationCooldownUntil[CLAN_ALPHA] = state.time.day + 1;
    expect(validateRequestMediation(state, cmd).ok).toBe(false);
    state.court.mediationCooldownUntil[CLAN_ALPHA] = state.time.day;
    expect(validateRequestMediation(state, cmd).ok).toBe(true);
  });
  it.each([false, true])(
    'deterministically resolves mediation success=%s with exact costs and one RNG draw',
    (success) => {
      const { state, cmd } = setup();
      for (let seed = 0; ; seed += 1) {
        state.rng.misc = seed;
        const probe = { ...state.rng };
        if (!createRngStream(probe, 'misc').chance(BAL.courtMediationFailBase) === success) break;
      }
      const replay = structuredClone(state),
        gold = state.clans[CLAN_ALPHA]!.gold,
        favor = state.court.courtFavor[CLAN_ALPHA]!;
      const expectedRng = { ...state.rng };
      createRngStream(expectedRng, 'misc').next();
      const one = events(),
        two = events();
      applyRequestMediation(state, cmd, one.emit);
      applyRequestMediation(replay, cmd, two.emit);
      expect(canonicalStringify(state)).toBe(canonicalStringify(replay));
      expect(one.result).toEqual(two.result);
      expect(state.rng).toEqual(expectedRng);
      expect(state.clans[CLAN_ALPHA]!.gold).toBe(
        gold -
          BAL.courtMediationGoldCost +
          (success
            ? 0
            : Math.round(BAL.courtMediationGoldCost * BAL.courtMediationFailureRefundRate)),
      );
      expect(state.court.courtFavor[CLAN_ALPHA]).toBe(favor - BAL.courtMediationFavorCost);
      expect(state.court.mediationCooldownUntil[CLAN_ALPHA]).toBe(
        state.time.day + BAL.courtMediationCooldownMonths * 30,
      );
      expect(one.result.filter((event) => event.type === 'pact.signed')).toHaveLength(
        success ? 1 : 0,
      );
      expect(one.result.find((event) => event.type === 'court.mediationResult')).toMatchObject({
        success,
        ceasefireMonths: success ? BAL.courtMediationCeasefireMonths : 0,
      });
    },
  );
});

describe('shogunate titles, patronage, and collapse', () => {
  it('gates capital and patron requirements, grants sequential titles and cumulative bonuses', () => {
    const state = prepared(),
      cmd = command('requestShogunateTitle'),
      { emit } = events();
    const clan = state.clans[CLAN_ALPHA]!;
    for (const def of BAL.shogunateTitleTable) {
      if (def.requiresPatron) {
        expect(validateRequestShogunateTitle(state, cmd).ok).toBe(false);
        state.court.patronClanId = CLAN_ALPHA;
      }
      const cost = shogunateTitleCost(state, CLAN_ALPHA)!;
      expect(validateRequestShogunateTitle(state, cmd).ok).toBe(true);
      const gold = clan.gold;
      applyRequestShogunateTitle(state, cmd, emit);
      expect(clan.gold).toBe(gold - cost);
      expect(clan.shogunateTitle).toBe(def.id);
    }
    clan.courtRank = 'sho2';
    expect(extraPolicySlots(state, CLAN_ALPHA)).toBe(3);
    expect(workCostMultiplier(state, CLAN_ALPHA)).toBe(BAL.shogunateWorkCostMult);
    expect(courtAcceptanceBonus(state, CLAN_ALPHA, 'demandVassal')).toBe(
      BAL.courtVassalDemandBonus + BAL.shogunateVassalDemandBonus + BAL.shogunateAcceptanceAura,
    );
    expect(courtAcceptanceBonus(state, CLAN_ALPHA, 'proposeAlliance')).toBe(
      BAL.courtAllianceBonus + BAL.shogunateAcceptanceAura,
    );
    expect(validateRequestShogunateTitle(state, cmd).ok).toBe(false);
    clan.shogunateTitle = 'shogun';
    expect(shogunateTitleOrder('shogun')).toBeNull();
    expect(validateRequestShogunateTitle(state, cmd).ok).toBe(false);
  });
  it('nominates uniquely, changes only incoming sentiment, and loses patronage without stripping title', () => {
    const state = prepared(),
      cmd = command('nominateShogun'),
      { result, emit } = events();
    expect(validateNominateShogun(state, cmd).ok).toBe(true);
    applyNominateShogun(state, cmd, emit);
    expect(state.court.patronClanId).toBe(CLAN_ALPHA);
    expect(getSentiment(state, CLAN_BETA, CLAN_ALPHA)).toBe(BAL.shogunPatronSentimentGain);
    expect(getSentiment(state, CLAN_ALPHA, CLAN_BETA)).toBe(0);
    expect(validateNominateShogun(state, cmd).ok).toBe(false);
    state.clans[CLAN_ALPHA]!.prestige = 0;
    courtMonthlyForClan(state, CLAN_ALPHA, emit);
    expect(state.clans[CLAN_ALPHA]!.prestige).toBe(BAL.shogunPatronMonthlyPrestige);
    state.clans[CLAN_ALPHA]!.shogunateTitle = 'fukushogun';
    state.castles[CASTLE_A1]!.ownerClanId = CLAN_BETA;
    courtMonthlyForClan(state, CLAN_ALPHA, emit);
    expect(state.court.patronClanId).toBeNull();
    expect(state.clans[CLAN_ALPHA]!.shogunateTitle).toBe('fukushogun');
    expect(result.at(-1)).toMatchObject({ type: 'shogunate.patronLost', clanId: CLAN_ALPHA });
  });
  it('collapses once, refunds cumulative granted prestige, stops shogunate missions, leaves court intact', () => {
    const state = prepared(),
      { result, emit } = events();
    state.clans[CLAN_ALPHA]!.shogunateTitle = 'kanrei';
    state.clans[CLAN_ALPHA]!.courtRank = 'sho2';
    const prestige = state.clans[CLAN_ALPHA]!.prestige;
    const refund = BAL.shogunateTitleTable
      .filter((def) => def.order <= shogunateTitleOrder('kanrei')!)
      .reduce((sum, def) => sum + def.prestigeBonus, 0);
    state.diplomacy.missions.push({
      fromClanId: CLAN_ALPHA,
      target: 'shogunate',
      officerId: OFF_ALPHA_TAISHO,
      startDay: state.time.day,
    });
    collapseShogunate(state, emit);
    expect(state.court.shogunClanId).toBeNull();
    expect(state.clans[CLAN_ALPHA]!.prestige).toBe(Math.max(0, prestige - refund));
    expect(state.clans[CLAN_ALPHA]!.shogunateTitle).toBe('none');
    expect(state.clans[CLAN_ALPHA]!.courtRank).toBe('sho2');
    expect(extraPolicySlots(state, CLAN_ALPHA)).toBe(2);
    expect(workCostMultiplier(state, CLAN_ALPHA)).toBe(1);
    expect(state.diplomacy.missions).toHaveLength(0);
    expect(validateRequestShogunateTitle(state, command('requestShogunateTitle')).ok).toBe(false);
    expect(validateNominateShogun(state, command('nominateShogun')).ok).toBe(false);
    const before = canonicalStringify(state),
      count = result.length;
    collapseShogunate(state, emit);
    expect(canonicalStringify(state)).toBe(before);
    expect(result).toHaveLength(count);
  });
});
