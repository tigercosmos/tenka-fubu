// 武將前半系統：功績/能力成長、身分/俸祿、忠誠月結。
// 規格：plan/06-officers.md T3～T5（M3-2～M3-4）。

import { BAL } from '../balance';
import { RANK_VALUES, type Rank } from '../state/enums';
import type { ClanId, MapNodeId, OfficerId } from '../state/ids';
import type { GameEvent } from '../state/events';
import type { GameState, Officer } from '../state/gameState';
import type { OfficerStat } from '../state/officerTypes';
import { traitModifier } from '../traits';
import { nearestOwnedCastleByTravelTime } from './castleSelection';

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const sortedOfficers = (state: GameState): Officer[] =>
  Object.values(state.officers).sort((a, b) => a.id.localeCompare(b.id));

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
 */
export function applyUnpaidSalaryPenalty(
  state: GameState,
  unpaidPayeeIds: ReadonlySet<OfficerId>,
): void {
  for (const officerId of [...unpaidPayeeIds].sort()) {
    const officer = state.officers[officerId];
    if (officer && officer.status !== 'dead') {
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

function expectedRankIndex(officer: Officer): number {
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
    Math.floor((leader?.pol ?? 0) / BAL.loyaltyLeaderPolDivisor) +
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
export function officersSystem(state: GameState, unpaidPayeeIds: ReadonlySet<OfficerId>): void {
  if (state.time.dayOfMonth !== 1) return;
  recomputeLoyalty(state);
  updatePromotionStalls(state);
  applyUnpaidSalaryPenalty(state, unpaidPayeeIds);
}

/** Shared battle-death mutation used by field pursuit and siege resolution. */
export function dieOfficer(
  state: GameState,
  officerId: OfficerId,
  nodeId: MapNodeId,
  deferSuccession = false,
): GameEvent[] {
  const officer = state.officers[officerId];
  if (!officer || officer.status === 'dead') return [];
  const clanId = officer.clanId;
  const army = officer.armyId === null ? undefined : state.armies[officer.armyId];
  if (army) {
    if (army.leaderId === officer.id) {
      const successor = army.deputyIds.find(
        (id) => id !== officer.id && state.officers[id]?.status === 'serving',
      );
      if (successor) {
        army.leaderId = successor;
        army.deputyIds = army.deputyIds.filter((id) => id !== successor && id !== officer.id);
      } else {
        const refuge =
          nearestOwnedCastleByTravelTime(state, army.clanId, army.posNodeId)?.castle ??
          Object.values(state.castles)
            .filter((castle) => castle.ownerClanId === army.clanId)
            .sort((a, b) => a.id.localeCompare(b.id))[0];
        for (const memberId of army.deputyIds) {
          const member = state.officers[memberId];
          if (!member) continue;
          member.armyId = null;
          member.locationCastleId = refuge?.id ?? member.debutCastleId;
        }
        delete state.armies[army.id];
      }
    } else {
      army.deputyIds = army.deputyIds.filter((id) => id !== officer.id);
    }
  }
  for (const castle of Object.values(state.castles)) {
    if (castle.lordId === officer.id) castle.lordId = null;
  }
  for (const district of Object.values(state.districts)) {
    if (district.stewardId === officer.id) district.stewardId = null;
  }
  for (const corps of Object.values(state.corps)) {
    if (corps.corpsLeaderId !== officer.id) continue;
    for (const castle of Object.values(state.castles))
      if (castle.corpsId === corps.id) castle.corpsId = null;
    delete state.corps[corps.id];
  }
  officer.status = 'dead';
  officer.clanId = null;
  officer.locationCastleId = null;
  officer.armyId = null;
  officer.capturedByClanId = null;
  const events: GameEvent[] = [
    {
      type: 'officer.died',
      day: state.time.day,
      clanIds: clanId === null ? [] : [clanId],
      officerId: officer.id,
      clanId,
      cause: 'battle',
      nodeId,
    },
  ];
  const clan = clanId === null ? undefined : state.clans[clanId];
  if (!deferSuccession && clan?.alive && clan.leaderId === officer.id) {
    const succession = appointClanSuccessor(state, clan.id, officer.id);
    if (succession) {
      events.push(succession);
    } else if (clan.id === state.meta.playerClanId) {
      // The victory/event system owns the eventual defeat resolution (10 §3.8.2).
      state.events.flags['defeat.no-heir'] = 1;
    } else {
      clan.alive = false;
      clan.destroyedDay = state.time.day;
      for (const other of Object.values(state.armies)) {
        if (other.clanId === clan.id) delete state.armies[other.id];
      }
      for (const corps of Object.values(state.corps)) {
        if (corps.clanId !== clan.id) continue;
        for (const castle of Object.values(state.castles)) {
          if (castle.corpsId === corps.id) castle.corpsId = null;
        }
        delete state.corps[corps.id];
      }
      for (const member of Object.values(state.officers)) {
        if (member.status !== 'serving' || member.clanId !== clan.id) continue;
        member.status = 'ronin';
        member.clanId = null;
        member.armyId = null;
        member.locationCastleId ??= member.debutCastleId;
      }
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
