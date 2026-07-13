import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import type { TraitId } from '../../src/core/state/ids';
import {
  adjustLoyalty,
  applyUnpaidSalaryPenalty,
  effectiveStat,
  gainMerit,
  loyaltyTarget,
  paySalaries,
  promoteOfficer,
  recomputeLoyalty,
  troopCapForOfficer,
  validatePromotion,
} from '../../src/core/systems/officers';
import {
  buildTinyState,
  CLAN_ALPHA,
  OFF_ALPHA_BUSHO,
  OFF_ALPHA_LORD,
  OFF_ALPHA_TAISHO,
} from '../fixtures/tiny';

const traitId = (value: string): TraitId => value as TraitId;

describe('officer merit and growth', () => {
  it('converts experience, applies ambition, discards overflow at +5, and caps effective stats', () => {
    const officer = buildTinyState().officers[OFF_ALPHA_TAISHO]!;
    officer.traits = [traitId('trait.yashin')];
    officer.ldr = BAL.abilityMax - 1;

    expect(gainMerit(officer, BAL.statExpPerPoint, ['ldr'])).toBe(
      Math.round(BAL.statExpPerPoint * (1 + BAL.traitYashinMerit)),
    );
    expect(officer.statGrowth.ldr).toBe(1);
    expect(officer.statExp.ldr).toBe(
      Math.round(BAL.statExpPerPoint * (1 + BAL.traitYashinMerit)) - BAL.statExpPerPoint,
    );
    expect(effectiveStat(officer, 'ldr')).toBe(BAL.abilityMax);

    officer.statGrowth.ldr = BAL.statGrowthCap - 1;
    officer.statExp.ldr = BAL.statExpPerPoint - 1;
    gainMerit(officer, 1, ['ldr']);
    expect(officer.statGrowth.ldr).toBe(BAL.statGrowthCap);
    expect(officer.statExp.ldr).toBe(0);
  });
});

describe('rank and salary', () => {
  it('rejects skipped ranks and insufficient merit, then applies a one-rank promotion', () => {
    const state = buildTinyState();
    const officer = state.officers[OFF_ALPHA_TAISHO]!;
    officer.rank = 'kumigashira';
    officer.merit = BAL.rankMeritThresholds[1] - 1;

    expect(validatePromotion(state, officer.id, CLAN_ALPHA, 'busho')).toEqual({
      ok: false,
      reason: 'mustAdvanceOneRank',
    });
    expect(validatePromotion(state, officer.id, CLAN_ALPHA)).toEqual({
      ok: false,
      reason: 'insufficientMerit',
    });

    officer.merit += 1;
    const loyaltyBefore = officer.loyalty;
    expect(promoteOfficer(state, officer.id, CLAN_ALPHA)).toEqual({
      ok: true,
      nextRank: 'ashigaru-taisho',
    });
    expect(officer.rank).toBe('ashigaru-taisho');
    expect(officer.loyalty).toBe(Math.min(100, loyaltyBefore + BAL.loyaltyPromote));
    expect(troopCapForOfficer(officer)).toBe(BAL.rankTroopCap[1]);
  });

  it('does not pay fief holders and zeroes gold when the clan cannot cover salary', () => {
    const state = buildTinyState();
    const clan = state.clans[CLAN_ALPHA]!;
    const fiefHolder = state.officers[OFF_ALPHA_BUSHO]!;
    const payee = state.officers[OFF_ALPHA_TAISHO]!;
    const district = Object.values(state.districts).find(
      (candidate) => candidate.ownerClanId === CLAN_ALPHA,
    );
    expect(district).toBeDefined();
    district!.stewardId = fiefHolder.id;
    clan.gold = 0;
    const before = payee.loyalty;

    const settlement = paySalaries(state).find((entry) => entry.clanId === CLAN_ALPHA);
    expect(settlement?.paid).toBe(false);
    expect(settlement?.payeeIds).toContain(payee.id);
    expect(settlement?.payeeIds).not.toContain(fiefHolder.id);
    expect(settlement?.payeeIds).not.toContain(OFF_ALPHA_LORD);
    expect(clan.gold).toBe(0);
    // 金錢結算本身不再調整忠誠（欠俸懲罰移至 officers 步驟漂移之後，見下一測試）。
    expect(payee.loyalty).toBe(before);
  });

  it('欠俸懲罰於忠誠漂移之後套用、不被同月漂移抹平，且不觸及受封領主（F2）', () => {
    const state = buildTinyState();
    const fiefHolder = state.officers[OFF_ALPHA_BUSHO]!;
    const payee = state.officers[OFF_ALPHA_TAISHO]!;
    const district = Object.values(state.districts).find(
      (candidate) => candidate.ownerClanId === CLAN_ALPHA,
    );
    district!.stewardId = fiefHolder.id;
    // 支薪者忠誠正好落在目標值：若懲罰先於漂移施加，會被 +2 漂移完全抹平。
    const target = loyaltyTarget(state, payee);
    payee.loyalty = target;

    recomputeLoyalty(state); // 漂移：payee 已在目標值，維持不變
    const fiefLoyaltyAfterDrift = fiefHolder.loyalty; // 領主亦受漂移，但不受欠俸懲罰
    applyUnpaidSalaryPenalty(state, new Set([CLAN_ALPHA]));

    expect(payee.loyalty).toBe(target - BAL.unpaidSalaryLoyaltyPenalty);
    expect(fiefHolder.loyalty).toBe(fiefLoyaltyAfterDrift); // 受封領主非支薪對象
  });
});

describe('loyalty', () => {
  it('computes every target component including self traits and stackable same-castle auras', () => {
    const state = buildTinyState();
    const clan = state.clans[CLAN_ALPHA]!;
    const leader = state.officers[OFF_ALPHA_LORD]!;
    const officer = state.officers[OFF_ALPHA_TAISHO]!;
    const auraOfficer = state.officers[OFF_ALPHA_BUSHO]!;
    for (const district of Object.values(state.districts)) {
      if (district.stewardId === officer.id) district.stewardId = null;
    }
    leader.pol = 60;
    clan.prestige = 800;
    officer.rank = 'kumigashira';
    officer.ldr = 80;
    officer.val = officer.int = officer.pol = 1;
    officer.statGrowth = { ldr: 0, val: 0, int: 0, pol: 0 };
    officer.kinship = 'tozama';
    officer.traits = [traitId('trait.chushin')];
    auraOfficer.traits = [traitId('trait.jinbo')];
    auraOfficer.locationCastleId = officer.locationCastleId;

    const expected =
      BAL.loyaltyBase -
      BAL.loyaltyTreatmentClampAbs +
      Math.floor(leader.pol / BAL.loyaltyLeaderPolDivisor) +
      Math.floor(clan.prestige / BAL.loyaltyPrestigeDivisor) +
      BAL.traitChushin +
      BAL.traitJinbo;
    expect(loyaltyTarget(state, officer)).toBe(expected);
  });

  it('drifts by at most two points and clamps event adjustments', () => {
    const state = buildTinyState();
    const officer = state.officers[OFF_ALPHA_TAISHO]!;
    officer.loyalty = 0;
    recomputeLoyalty(state);
    expect(officer.loyalty).toBe(BAL.loyaltyDriftPerMonth);

    officer.loyalty = 100;
    recomputeLoyalty(state);
    expect(officer.loyalty).toBe(100 - BAL.loyaltyDriftPerMonth);
    expect(adjustLoyalty(officer, 999)).toBe(100);
    expect(adjustLoyalty(officer, -999)).toBe(0);
  });
});
