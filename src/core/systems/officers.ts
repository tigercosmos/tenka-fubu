// 武將前半系統：功績/能力成長、身分/俸祿、忠誠月結。
// 規格：plan/06-officers.md T3～T5（M3-2～M3-4）。

import { BAL } from '../balance';
import { RANK_VALUES, type Rank } from '../state/enums';
import type { CastleId, ClanId, MapNodeId, OfficerId } from '../state/ids';
import type { GameEvent } from '../state/events';
import type { GameState, Officer } from '../state/gameState';
import type { OfficerStat } from '../state/officerTypes';
import { traitModifier } from '../traits';
import { nearestOwnedCastleByTravelTime } from './castleSelection';
import { createRngStream } from '../rng';
import { dissolveCorps } from './corps';
import { clearExtinctClanWork, collapseExtinctClanCourt } from './clanExtinction';
import { detachArmyFromSiege } from './siegeMembership';
import { clearSpouseOnDeath } from './marriage';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const sortedOfficers = (state: GameState): Officer[] =>
  Object.values(state.officers).sort((a, b) => a.id.localeCompare(b.id));

type OfficerEmit = (event: GameEvent) => void;

/** Release offices and work when an officer dies or changes allegiance. */
export function releaseOfficerAssignments(state: GameState, officerId: OfficerId): GameEvent[] {
  const officer = state.officers[officerId];
  if (!officer) return [];
  const events: GameEvent[] = [];
  for (const castle of Object.values(state.castles)) {
    if (castle.lordId === officerId) {
      castle.lordId =
        sortedOfficers(state)
          .filter(
            (candidate) =>
              candidate.id !== officerId &&
              candidate.hasComeOfAge &&
              candidate.status === 'serving' &&
              candidate.clanId === castle.ownerClanId &&
              candidate.locationCastleId === castle.id &&
              candidate.armyId === null &&
              // Returning armies can relocate a lord without ending their existing office.
              // A replacement must not acquire a second castle (INV-04).
              !Object.values(state.castles).some(
                (other) => other.id !== castle.id && other.lordId === candidate.id,
              ) &&
              rankIndex(candidate.rank) >= rankIndex('samurai-taisho'),
          )
          .sort(successorOrder)[0]?.id ?? null;
    }
    if (castle.betrayalReadyTargetLordId === officerId) {
      castle.betrayalReadyClanId = null;
      castle.betrayalReadyUntilDay = 0;
      castle.betrayalReadyTargetClanId = null;
      castle.betrayalReadyTargetLordId = null;
    }
  }
  for (const district of Object.values(state.districts)) {
    if (district.stewardId === officerId) district.stewardId = null;
  }
  for (const corps of Object.values(state.corps)) {
    if (corps.corpsLeaderId !== officerId) continue;
    dissolveCorps(state, corps.id);
  }
  const army = officer.armyId === null ? undefined : state.armies[officer.armyId];
  if (army) {
    army.deputyIds = army.deputyIds.filter((id) => id !== officerId);
    if (army.leaderId === officerId) {
      const successorId = army.deputyIds.find((id) => {
        const deputy = state.officers[id];
        return deputy?.hasComeOfAge && deputy.status === 'serving' && deputy.clanId === army.clanId;
      });
      if (successorId) {
        army.leaderId = successorId;
        army.deputyIds = army.deputyIds.filter((id) => id !== successorId);
        for (const battle of Object.values(state.battles)) {
          for (const unit of battle.units)
            if (unit.armyId === army.id) unit.generalId = successorId;
        }
      } else {
        const refuge = nearestOwnedCastleByTravelTime(state, army.clanId, army.posNodeId)?.castle;
        for (const id of army.deputyIds) {
          const deputy = state.officers[id];
          if (!deputy) continue;
          deputy.armyId = null;
          deputy.locationCastleId = refuge?.id ?? deputy.debutCastleId;
        }
        events.push(...detachArmyFromSiege(state, army.id));
        delete state.armies[army.id];
        for (const combat of Object.values(state.fieldCombats)) {
          combat.sideA.armyIds = combat.sideA.armyIds.filter((id) => id !== army.id);
          combat.sideB.armyIds = combat.sideB.armyIds.filter((id) => id !== army.id);
          const activeBattle = Object.values(state.battles).some(
            (battle) => battle.result === null && battle.fieldCombatId === combat.id,
          );
          if (
            !activeBattle &&
            (combat.sideA.armyIds.length === 0 || combat.sideB.armyIds.length === 0)
          ) {
            for (const id of [...combat.sideA.armyIds, ...combat.sideB.armyIds]) {
              const survivor = state.armies[id];
              if (survivor) survivor.status = survivor.siegeId !== null ? 'sieging' : 'holding';
            }
            delete state.fieldCombats[combat.id];
          }
        }
        for (const battle of Object.values(state.battles))
          battle.units = battle.units.filter((unit) => unit.armyId !== army.id);
        for (const other of Object.values(state.armies)) {
          other.pursuitEligibleArmyIds = other.pursuitEligibleArmyIds.filter(
            (id) => id !== army.id,
          );
        }
      }
    }
  }
  officer.armyId = null;
  state.diplomacy.missions = state.diplomacy.missions.filter(
    (mission) => mission.officerId !== officerId,
  );
  state.diplomacy.plots = state.diplomacy.plots.filter(
    (plot) => plot.officerId !== officerId && plot.targetOfficerId !== officerId,
  );
  return events;
}

export interface OfficerTransfer {
  clanId: ClanId;
  castleId: CastleId;
  loyalty: number;
  rank: Rank;
  source?: 'ronin' | 'captive' | 'poach';
}

export function transferOfficer(
  state: GameState,
  officerId: OfficerId,
  target: OfficerTransfer,
  emit: OfficerEmit,
): void {
  const officer = state.officers[officerId];
  if (
    !officer ||
    !state.clans[target.clanId]?.alive ||
    state.castles[target.castleId]?.ownerClanId !== target.clanId
  ) {
    throw new Error('transferOfficer requires a live receiving clan and an owned castle');
  }
  releaseOfficerAssignments(state, officerId).forEach(emit);
  officer.clanId = target.clanId;
  officer.status = 'serving';
  officer.locationCastleId = target.castleId;
  officer.capturedByClanId = null;
  officer.captiveRetryOn = null;
  officer.recruitRetryOn = null;
  officer.kinship = 'tozama';
  officer.rank = target.rank;
  officer.loyalty = clamp(target.loyalty, 0, 100);
  officer.stalledPromotionMonths = 0;
  emit({
    type: 'officer.recruited',
    day: state.time.day,
    clanIds: [target.clanId],
    officerId,
    clanId: target.clanId,
    source: target.source ?? 'poach',
  });
}

export function poachAcceptanceFactor(state: Readonly<GameState>, officerId: OfficerId): number {
  const officer = state.officers[officerId];
  if (
    !officer ||
    !officer.hasComeOfAge ||
    officer.status !== 'serving' ||
    officer.kinship === 'kin' ||
    officer.traits.some((trait) => trait === 'trait.chushin') ||
    (officer.clanId !== null && state.clans[officer.clanId]?.leaderId === officerId)
  )
    return 0;
  return clamp((BAL.poachEligibleLoyalty - officer.loyalty) / BAL.poachEligibleLoyalty, 0, 1);
}

export function checkDefections(state: GameState, emit: OfficerEmit): void {
  const rng = createRngStream(state.rng, 'misc');
  for (const officer of sortedOfficers(state)) {
    if (
      !officer.hasComeOfAge ||
      officer.status !== 'serving' ||
      officer.clanId === null ||
      officer.armyId !== null ||
      officer.kinship === 'kin' ||
      officer.traits.some((trait) => trait === 'trait.chushin') ||
      state.clans[officer.clanId]?.leaderId === officer.id ||
      officer.loyalty >= BAL.defectionThreshold
    )
      continue;
    if (!rng.chance((BAL.defectionThreshold - officer.loyalty) * BAL.defectionChancePerPoint))
      continue;
    const fromClanId = officer.clanId;
    releaseOfficerAssignments(state, officer.id).forEach(emit);
    officer.status = 'ronin';
    officer.clanId = null;
    emit({
      type: 'officer.defected',
      day: state.time.day,
      clanIds: [fromClanId],
      officerId: officer.id,
      fromClanId,
      toClanId: null,
    });
  }
}

export function comingOfAge(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  for (const officer of sortedOfficers(state)) {
    if (officer.hasComeOfAge || officer.status === 'dead' || officer.debutYear > state.time.year)
      continue;
    officer.hasComeOfAge = true;
    if (officer.scheduledDeath.year < officer.debutYear) {
      events.push(...releaseOfficerAssignments(state, officer.id));
      officer.status = 'dead';
      clearSpouseOnDeath(state, officer.id);
      officer.clanId = null;
      officer.locationCastleId = null;
      officer.armyId = null;
      officer.capturedByClanId = null;
      continue;
    }
    const clan = officer.debutClanId === null ? undefined : state.clans[officer.debutClanId];
    officer.clanId = clan?.alive ? clan.id : null;
    officer.status = clan?.alive ? 'serving' : 'ronin';
    officer.locationCastleId = officer.debutCastleId;
    if (clan?.alive && state.castles[officer.debutCastleId]?.ownerClanId !== clan.id) {
      officer.locationCastleId =
        Object.values(state.castles)
          .filter((castle) => castle.ownerClanId === clan.id)
          .sort((a, b) => a.id.localeCompare(b.id))[0]?.id ?? officer.debutCastleId;
    }
    officer.rank = 'kumigashira';
    officer.merit = 0;
    officer.armyId = null;
    officer.capturedByClanId = null;
    officer.loyalty = loyaltyTarget(state, officer);
    events.push({
      type: 'officer.comingOfAge',
      day: state.time.day,
      clanIds: officer.clanId === null ? [] : [officer.clanId],
      officerId: officer.id,
      clanId: officer.clanId,
    });
  }
  return events;
}

export function officerAbilityScore(officer: Officer): number {
  return Math.max(...Object.values(effectiveStats(officer)));
}

export function recruitRoninSuccessRate(
  state: Readonly<GameState>,
  targetId: OfficerId,
  executorId: OfficerId,
  clanId: ClanId,
): number {
  const target = state.officers[targetId],
    executor = state.officers[executorId],
    clan = state.clans[clanId];
  if (!target || !executor || !clan) return 0;
  return clamp(
    BAL.recruitBaseRate +
      (effectiveStat(executor, 'pol') - 50) * BAL.recruitPolWeight +
      Math.min(clan.prestige, 1000) * BAL.recruitPrestigeWeight -
      Math.max(0, officerAbilityScore(target) - 60) * BAL.recruitAbilityPenalty +
      traitModifier(executor, 'officer.recruitSuccessAdd').add,
    0.05,
    0.95,
  );
}

export function captiveRecruitSuccessRate(
  state: Readonly<GameState>,
  targetId: OfficerId,
  executorId: OfficerId | null,
  clanId: ClanId,
): number {
  const target = state.officers[targetId],
    clan = state.clans[clanId];
  if (!clan) return 0;
  const executor = state.officers[executorId ?? clan.leaderId];
  if (!target || !executor || !clan) return 0;
  return clamp(
    BAL.captiveRecruitBaseRate +
      (effectiveStat(executor, 'pol') - 50) * BAL.captiveRecruitPolWeight +
      (100 - target.loyalty) * BAL.captiveRecruitLoyaltyWeight +
      Math.min(clan.prestige, 1000) * BAL.captiveRecruitPrestigeWeight -
      (target.kinship === 'kin' ? BAL.captiveKinPenalty : 0) +
      traitModifier(executor, 'officer.recruitSuccessAdd').add,
    0.02,
    0.9,
  );
}

export function rewardOfficerCost(tier: 'small' | 'medium' | 'large'): number {
  return {
    small: BAL.rewardGoldSmallCost,
    medium: BAL.rewardGoldMediumCost,
    large: BAL.rewardGoldLargeCost,
  }[tier];
}
export function rewardOfficerLoyaltyGain(
  officer: Officer,
  tier: 'small' | 'medium' | 'large',
): number {
  const base = {
    small: BAL.rewardGoldSmallLoyalty,
    medium: BAL.rewardGoldMediumLoyalty,
    large: BAL.rewardGoldLargeLoyalty,
  }[tier];
  return Math.max(1, Math.floor(base / 2 ** officer.rewardGiftsThisYear));
}

export function rankIndex(rank: Rank): number {
  return RANK_VALUES.indexOf(rank);
}

/** 基礎值＋微成長，最終不超過四維上限。 */
export function effectiveStat(officer: Officer, stat: OfficerStat): number {
  return Math.min(BAL.abilityMax, officer[stat] + officer.statGrowth[stat]);
}

export function effectiveStats(officer: Officer): Record<OfficerStat, number> {
  return {
    ldr: effectiveStat(officer, 'ldr'),
    val: effectiveStat(officer, 'val'),
    int: effectiveStat(officer, 'int'),
    pol: effectiveStat(officer, 'pol'),
  };
}

function successorOrder(a: Officer, b: Officer): number {
  const ability = (value: Officer) => Math.max(...Object.values(effectiveStats(value)));
  return (
    rankIndex(b.rank) - rankIndex(a.rank) ||
    ability(b) - ability(a) ||
    a.birthYear - b.birthYear ||
    a.id.localeCompare(b.id)
  );
}

/**
 * Appoint a deterministic successor and apply the household loyalty shock.
 * Captured leaders may opt into an adult non-kin emergency fallback; death succession may not.
 */
export function appointClanSuccessor(
  state: GameState,
  clanId: ClanId,
  formerLeaderId: OfficerId,
  allowEmergencyFallback = false,
): GameEvent | null {
  const clan = state.clans[clanId];
  if (!clan?.alive || clan.leaderId !== formerLeaderId) return null;
  const eligible = Object.values(state.officers)
    .filter(
      (candidate) =>
        candidate.status === 'serving' && candidate.clanId === clan.id && candidate.hasComeOfAge,
    )
    .sort(successorOrder);
  const heir =
    eligible.find((candidate) => candidate.kinship === 'kin') ??
    (allowEmergencyFallback ? eligible[0] : undefined);
  if (!heir) return null;

  clan.leaderId = heir.id;
  heir.loyalty = 100;
  for (const member of Object.values(state.officers)) {
    if (member.id === heir.id || member.status !== 'serving' || member.clanId !== clan.id) continue;
    const shock =
      member.kinship === 'tozama'
        ? -BAL.successionLoyaltyShockTozama
        : member.kinship === 'fudai'
          ? -BAL.successionLoyaltyShockFudai
          : 0;
    adjustLoyalty(member, shock);
  }
  return {
    type: 'clan.succession',
    day: state.time.day,
    clanIds: [clan.id],
    clanId: clan.id,
    deceasedId: formerLeaderId,
    heirId: heir.id,
  };
}

/** 功績與指定維度經驗一併入帳；達成長上限時捨棄剩餘經驗。 */
export function gainMerit(
  officer: Officer,
  baseAmount: number,
  expStats: readonly OfficerStat[],
): number {
  if (!Number.isFinite(baseAmount) || baseAmount < 0) {
    throw new RangeError('gainMerit: baseAmount must be a finite non-negative number');
  }
  const amount = Math.round(baseAmount * traitModifier(officer, 'officer.meritGainMult').mult);
  officer.merit += amount;

  for (const stat of expStats) {
    if (officer.statGrowth[stat] >= BAL.statGrowthCap) {
      officer.statExp[stat] = 0;
      continue;
    }
    officer.statExp[stat] += amount;
    while (
      officer.statExp[stat] >= BAL.statExpPerPoint &&
      officer.statGrowth[stat] < BAL.statGrowthCap
    ) {
      officer.statExp[stat] -= BAL.statExpPerPoint;
      officer.statGrowth[stat] += 1;
    }
    if (officer.statGrowth[stat] >= BAL.statGrowthCap) officer.statExp[stat] = 0;
  }
  return amount;
}

export type PromotionFailure =
  | 'officerNotFound'
  | 'notServing'
  | 'clanMismatch'
  | 'leader'
  | 'highestRank'
  | 'mustAdvanceOneRank'
  | 'insufficientMerit';

export type PromotionValidation =
  { ok: true; nextRank: Rank } | { ok: false; reason: PromotionFailure };

/** 升格只能前進一階，且累積功績須達該階門檻。 */
export function validatePromotion(
  state: Readonly<GameState>,
  officerId: OfficerId,
  clanId: ClanId,
  requestedRank?: Rank,
): PromotionValidation {
  const officer = state.officers[officerId];
  if (officer === undefined) return { ok: false, reason: 'officerNotFound' };
  if (officer.status !== 'serving') return { ok: false, reason: 'notServing' };
  if (officer.clanId !== clanId) return { ok: false, reason: 'clanMismatch' };
  if (state.clans[clanId]?.leaderId === officerId) return { ok: false, reason: 'leader' };
  const currentIndex = rankIndex(officer.rank);
  const nextRank = RANK_VALUES[currentIndex + 1];
  if (nextRank === undefined) return { ok: false, reason: 'highestRank' };
  if (requestedRank !== undefined && requestedRank !== nextRank) {
    return { ok: false, reason: 'mustAdvanceOneRank' };
  }
  const threshold = BAL.rankMeritThresholds[currentIndex + 1];
  if (threshold === undefined || officer.merit < threshold) {
    return { ok: false, reason: 'insufficientMerit' };
  }
  return { ok: true, nextRank };
}

/** 驗證並套用升格；成功時回傳新身分。 */
export function promoteOfficer(
  state: GameState,
  officerId: OfficerId,
  clanId: ClanId,
  requestedRank?: Rank,
): PromotionValidation {
  const validation = validatePromotion(state, officerId, clanId, requestedRank);
  if (!validation.ok) return validation;
  const officer = state.officers[officerId]!;
  officer.rank = validation.nextRank;
  officer.loyalty = clamp(officer.loyalty + BAL.loyaltyPromote, 0, 100);
  officer.stalledPromotionMonths = 0;
  return validation;
}

export function troopCapForOfficer(officer: Officer): number {
  return BAL.rankTroopCap[rankIndex(officer.rank)]!;
}

export interface SalarySettlement {
  clanId: ClanId;
  payeeIds: OfficerId[];
  total: number;
  paid: boolean;
}

/** 該勢力當月支薪對象（06 §5.2）：已元服、仕官、非當主、未持知行；決定論序（依 id）。 */
export function salaryPayees(state: Readonly<GameState>, clanId: ClanId): Officer[] {
  const clan = state.clans[clanId];
  if (!clan?.alive) return [];
  const fiefHolders = new Set<OfficerId>();
  for (const district of Object.values(state.districts)) {
    if (district.stewardId !== null) fiefHolders.add(district.stewardId);
  }
  return sortedOfficers(state).filter(
    (officer) =>
      officer.hasComeOfAge &&
      officer.status === 'serving' &&
      officer.clanId === clan.id &&
      officer.id !== clan.leaderId &&
      !fiefHolders.has(officer.id),
  );
}

/**
 * 月俸金錢結算（economy 步驟；05 §3.1.4／§5.2）。持有知行者與當主不支薪；不足時金錢歸零。
 * 欠俸事件由 economy 單一發出；欠俸忠誠懲罰改由 officers 步驟於「月結漂移之後」套用
 *（見 applyUnpaidSalaryPenalty），本函式不再直接調整忠誠——否則同 tick 的漂移會立即抹平懲罰，
 * 違反 06 §3.6.2「事件造成的忠誠增減不會立即被抹平」（M3 review F2）。
 */
export function paySalaryForClan(state: GameState, clanId: ClanId): SalarySettlement {
  const clan = state.clans[clanId];
  if (!clan?.alive) return { clanId, payeeIds: [], total: 0, paid: true };
  const payees = salaryPayees(state, clan.id);
  const total = payees.reduce((sum, officer) => sum + BAL.rankSalary[rankIndex(officer.rank)]!, 0);
  const paid = clan.gold >= total;
  if (paid) clan.gold -= total;
  else clan.gold = 0;
  return {
    clanId: clan.id,
    payeeIds: payees.map((officer) => officer.id),
    total,
    paid,
  };
}

/**
 * 欠俸忠誠懲罰（06 §3.6.3；於 officers 步驟月結漂移「之後」套用，確保懲罰不被同 tick 的漂移
 * 立即抹平，符 §3.6.2）。`unpaidPayeeIds` 來自本 tick economy 步驟發出的
 * `economy.upkeepUnpaid.payeeIds`（05 觸發、06 定值），固定為 Step 6 結算當下的實際支薪對象；
 * Step 9 直接消費該快照，不因其間的行軍、戰死或俘虜而改變受懲罰對象。
 * 唯一身分例外：Step 8 新任當主不扣忠誠（06 §3.4.3 當主忠誠恆為 100）。
 */
export function applyUnpaidSalaryPenalty(
  state: GameState,
  unpaidPayeeIds: ReadonlySet<OfficerId>,
): void {
  for (const officerId of [...unpaidPayeeIds].sort()) {
    const officer = state.officers[officerId];
    const isCurrentLeader =
      officer?.clanId != null && state.clans[officer.clanId]?.leaderId === officer.id;
    if (officer && officer.status !== 'dead' && !isCurrentLeader) {
      adjustLoyalty(officer, -BAL.unpaidSalaryLoyaltyPenalty);
    }
  }
}

export function paySalaries(state: GameState): SalarySettlement[] {
  return Object.values(state.clans)
    .sort((a, b) => a.id.localeCompare(b.id))
    .filter((clan) => clan.alive)
    .map((clan) => paySalaryForClan(state, clan.id));
}

export function expectedRankIndex(officer: Officer): number {
  const stats = effectiveStats(officer);
  const abilityScore = Math.max(stats.ldr, stats.val, stats.int, stats.pol);
  let expected = 0;
  for (const threshold of BAL.expectedRankAbilityThresholds) {
    if (abilityScore < threshold) break;
    expected += 1;
  }
  return expected;
}

function fiefCount(state: Readonly<GameState>, officerId: OfficerId): number {
  return Object.values(state.districts).filter((district) => district.stewardId === officerId)
    .length;
}

function promotionIsStalled(officer: Officer): boolean {
  const nextThreshold = BAL.rankMeritThresholds[rankIndex(officer.rank) + 1];
  return (
    nextThreshold !== undefined &&
    officer.merit >= nextThreshold &&
    officer.stalledPromotionMonths >= BAL.stalledPromotionGraceMonths
  );
}

/** 忠誠的結構性目標值（06 §3.6.1）。 */
export function loyaltyTarget(state: GameState, officer: Officer): number {
  const clan = officer.clanId === null ? undefined : state.clans[officer.clanId];
  if (officer.status !== 'serving' || clan === undefined) return clamp(officer.loyalty, 0, 100);
  if (clan.leaderId === officer.id) return 100;

  const leader = state.officers[clan.leaderId];
  const treatment = clamp(
    (rankIndex(officer.rank) - expectedRankIndex(officer)) * BAL.loyaltyRankGapWeight,
    -BAL.loyaltyTreatmentClampAbs,
    BAL.loyaltyTreatmentClampAbs,
  );
  const kinshipBonus =
    officer.kinship === 'kin'
      ? BAL.loyaltyKinBonus
      : officer.kinship === 'fudai'
        ? BAL.loyaltyFudaiBonus
        : 0;

  let aura = 0;
  if (officer.locationCastleId !== null) {
    for (const other of Object.values(state.officers)) {
      if (
        other.id !== officer.id &&
        other.hasComeOfAge &&
        other.status === 'serving' &&
        other.clanId === officer.clanId &&
        other.locationCastleId === officer.locationCastleId
      ) {
        aura += traitModifier(other, 'officer.loyaltyAuraAdd').add;
      }
    }
  }

  const heldFiefs = fiefCount(state, officer.id);
  const raw =
    BAL.loyaltyBase +
    treatment +
    (heldFiefs > 0 ? BAL.fiefLoyaltyBonus + BAL.fiefLoyaltyPerDistrict * heldFiefs : 0) +
    kinshipBonus +
    Math.floor((leader ? effectiveStat(leader, 'pol') : 0) / BAL.loyaltyLeaderPolDivisor) +
    Math.floor(clan.prestige / BAL.loyaltyPrestigeDivisor) +
    traitModifier(officer, 'officer.loyaltySelfAdd').add +
    aura -
    (promotionIsStalled(officer) ? BAL.loyaltyStalledPromotion : 0);
  return clamp(raw, 0, 100);
}

/** 供其他系統套用事件型忠誠增減。 */
export function adjustLoyalty(officer: Officer, delta: number): number {
  officer.loyalty = clamp(officer.loyalty + delta, 0, 100);
  return officer.loyalty;
}

/** 每月向當月目標漂移，單月幅度不超過 BAL.loyaltyDriftPerMonth。 */
export function recomputeLoyalty(state: GameState): void {
  for (const officer of sortedOfficers(state)) {
    if (!officer.hasComeOfAge || officer.status !== 'serving') continue;
    const clan = officer.clanId === null ? undefined : state.clans[officer.clanId];
    if (clan?.leaderId === officer.id) {
      officer.loyalty = 100;
      continue;
    }
    const delta = clamp(
      loyaltyTarget(state, officer) - officer.loyalty,
      -BAL.loyaltyDriftPerMonth,
      BAL.loyaltyDriftPerMonth,
    );
    adjustLoyalty(officer, delta);
  }
}

/** 累計「已達下一階門檻但未升格」月數。 */
export function updatePromotionStalls(state: GameState): void {
  for (const officer of sortedOfficers(state)) {
    if (!officer.hasComeOfAge || officer.status !== 'serving') continue;
    const nextThreshold = BAL.rankMeritThresholds[rankIndex(officer.rank) + 1];
    if (nextThreshold !== undefined && officer.merit >= nextThreshold) {
      officer.stalledPromotionMonths += 1;
    } else {
      officer.stalledPromotionMonths = 0;
    }
  }
}

/**
 * M3 的 officers tick（每月 1 日）：先重算忠誠目標值並漂移（06 §3.6.2），再套用本 tick 欠俸懲罰
 *（漂移「之後」，見 applyUnpaidSalaryPenalty）。薪俸金錢由 economy 步驟結算，以維持金錢的單一擁有者。
 */
export function officersSystem(
  state: GameState,
  unpaidPayeeIds: ReadonlySet<OfficerId>,
): GameEvent[] {
  if (state.time.dayOfMonth !== 1) return [];
  const events: GameEvent[] = [];
  recomputeLoyalty(state);
  updatePromotionStalls(state);
  applyUnpaidSalaryPenalty(state, unpaidPayeeIds);
  checkDefections(state, (event) => events.push(event));
  for (const officer of sortedOfficers(state)) {
    if (
      officer.hasComeOfAge &&
      officer.status !== 'dead' &&
      officer.scheduledDeath.year === state.time.year &&
      officer.scheduledDeath.month === state.time.month
    ) {
      events.push(...dieOfficer(state, officer.id, null, false, 'age'));
    }
  }
  if (state.time.month === 1) {
    for (const officer of sortedOfficers(state)) officer.rewardGiftsThisYear = 0;
    events.push(...comingOfAge(state));
  }
  return events;
}

/** Shared battle-death mutation used by field pursuit and siege resolution. */
export function dieOfficer(
  state: GameState,
  officerId: OfficerId,
  nodeId: MapNodeId | null,
  deferSuccession = false,
  cause: 'age' | 'battle' = 'battle',
): GameEvent[] {
  const officer = state.officers[officerId];
  if (!officer || officer.status === 'dead') return [];
  const clanId = officer.clanId;
  // Shared release must see the original commander/army so it can reconcile
  // siege, field-combat and tactical-unit references before mutating ownership.
  const events = releaseOfficerAssignments(state, officer.id);
  officer.status = 'dead';
  clearSpouseOnDeath(state, officer.id);
  officer.clanId = null;
  officer.locationCastleId = null;
  officer.armyId = null;
  officer.capturedByClanId = null;
  events.push({
    type: 'officer.died',
    day: state.time.day,
    clanIds: clanId === null ? [] : [clanId],
    officerId: officer.id,
    clanId,
    cause,
    nodeId,
  });
  const clan = clanId === null ? undefined : state.clans[clanId];
  if (!deferSuccession && clan?.alive && clan.leaderId === officer.id) {
    const succession = appointClanSuccessor(state, clan.id, officer.id);
    if (succession) {
      events.push(succession);
    } else if (clan.id === state.meta.playerClanId && !state.ai.allAi) {
      // The victory/event system owns the eventual defeat resolution (10 §3.8.2).
      state.events.flags['defeat.no-heir'] = 1;
    } else {
      clan.alive = false;
      clan.destroyedDay = state.time.day;
      clearExtinctClanWork(state, clan.id);
      for (const other of Object.values(state.armies)) {
        if (other.clanId === clan.id) {
          events.push(...detachArmyFromSiege(state, other.id));
          delete state.armies[other.id];
        }
      }
      for (const corps of Object.values(state.corps)) {
        if (corps.clanId !== clan.id) continue;
        dissolveCorps(state, corps.id);
      }
      for (const member of Object.values(state.officers)) {
        if (member.status !== 'serving' || member.clanId !== clan.id) continue;
        events.push(...releaseOfficerAssignments(state, member.id));
        member.status = 'ronin';
        member.clanId = null;
        member.armyId = null;
        member.locationCastleId ??= member.debutCastleId;
      }
      for (const castle of Object.values(state.castles)) {
        if (castle.ownerClanId !== clan.id) continue;
        castle.lordId = null;
        castle.directControl = true;
        castle.betrayalReadyClanId = null;
        castle.betrayalReadyUntilDay = 0;
        castle.betrayalReadyTargetClanId = null;
        castle.betrayalReadyTargetLordId = null;
      }
      events.push(...releaseOrphanedCaptives(state)); // 捕獲方滅亡 → 捕虜就地釋放（INV-18）
      collapseExtinctClanCourt(state, clan.id, (event) => events.push(event));
      events.push({
        type: 'clan.destroyed',
        day: state.time.day,
        clanIds: [clan.id],
        clanId: clan.id,
        byClanId: null,
      });
    }
  }
  return events;
}

/**
 * 釋放「孤兒捕虜」（INV-18 的落地修復；06-T7「城陷釋放」精神、10 §3.8.3-2）：
 * 捕獲方已滅亡、或關押城已不屬捕獲方（落城易主／勢力吸收）→ 就地釋放為浪人。
 * 冪等全域清掃（O(officers)、id 字典序決定論）；於任何城池易主／勢力滅亡的結算點呼叫。
 * MVP 先行：正式的捕虜生命週期（登用／處刑／贖回）屬 M6-10，屆時本函式僅剩防禦性角色。
 */
export function releaseOrphanedCaptives(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  for (const officer of Object.values(state.officers).sort((a, b) => a.id.localeCompare(b.id))) {
    if (officer.status !== 'captive') continue;
    const captorId = officer.capturedByClanId;
    const captor = captorId === null ? undefined : state.clans[captorId];
    const prison =
      officer.locationCastleId === null ? undefined : state.castles[officer.locationCastleId];
    const orphaned =
      captorId === null ||
      captor?.alive !== true ||
      prison === undefined ||
      prison.ownerClanId !== captorId;
    if (!orphaned) continue;
    const original = officer.clanId === null ? undefined : state.clans[officer.clanId];
    const refuge = original?.alive
      ? (nearestOwnedCastleByTravelTime(
          state,
          original.id,
          officer.locationCastleId ?? officer.debutCastleId,
        )?.castle ??
        Object.values(state.castles)
          .filter((castle) => castle.ownerClanId === original.id)
          .sort((a, b) => a.id.localeCompare(b.id))[0])
      : undefined;
    officer.status = refuge ? 'serving' : 'ronin';
    officer.clanId = refuge ? original!.id : null;
    if (refuge) officer.locationCastleId = refuge.id;
    officer.capturedByClanId = null;
    officer.captiveRetryOn = null;
    officer.armyId = null;
    officer.locationCastleId ??= officer.debutCastleId;
    if (captorId !== null) {
      events.push({
        type: 'officer.released',
        day: state.time.day,
        clanIds: [captorId],
        officerId: officer.id,
        byClanId: captorId,
      });
    }
  }
  return events;
}
