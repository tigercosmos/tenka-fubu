import type { GameState } from '../state/gameState';
import {
  promoteOfficer,
  validatePromotion,
  recruitRoninSuccessRate,
  captiveRecruitSuccessRate,
  officerAbilityScore,
  expectedRankIndex,
  transferOfficer,
  releaseOfficerAssignments,
  loyaltyTarget,
  adjustLoyalty,
  rewardOfficerCost,
  rewardOfficerLoyaltyGain,
} from '../systems/officers';
import { BAL } from '../balance';
import { createRngStream } from '../rng';
import { RANK_VALUES } from '../state/enums';
import { nearestOwnedCastleByTravelTime } from '../systems/castleSelection';
import { isOfficerBusy } from '../systems/diplomacyCommon';
import { clearSpouseOnDeath } from '../systems/marriage';
import type { CommandByType, EmitFn } from './registry';
import { REJECT_REASONS } from './reasons';
import type { ValidationResult } from './types';

export function validatePromoteRank(
  state: Readonly<GameState>,
  cmd: CommandByType['promoteRank'],
): ValidationResult {
  const result = validatePromotion(state, cmd.officerId, cmd.clanId);
  if (result.ok) return { ok: true };
  return {
    ok: false,
    reasonKey:
      result.reason === 'insufficientMerit' || result.reason === 'highestRank'
        ? REJECT_REASONS.rankTooLow
        : REJECT_REASONS.invalidTarget,
    params: { name: state.officers[cmd.officerId]?.name ?? cmd.officerId },
  };
}

export function applyPromoteRank(
  state: GameState,
  cmd: CommandByType['promoteRank'],
  emit: EmitFn,
): void {
  const result = promoteOfficer(state, cmd.officerId, cmd.clanId);
  if (!result.ok) return;
  emit({
    type: 'officer.promoted',
    day: state.time.day,
    clanIds: [cmd.clanId],
    officerId: cmd.officerId,
    clanId: cmd.clanId,
    newRank: result.nextRank,
  });
}

export function validateRecruitRonin(
  state: Readonly<GameState>,
  cmd: CommandByType['recruitRonin'],
): ValidationResult {
  const target = state.officers[cmd.officerId],
    executor = state.officers[cmd.executorId],
    clan = state.clans[cmd.clanId];
  if (
    !target ||
    !target.hasComeOfAge ||
    target.status !== 'ronin' ||
    !clan?.alive ||
    target.locationCastleId === null
  )
    return { ok: false, reasonKey: REJECT_REASONS.invalidTarget };
  if (state.castles[target.locationCastleId]?.ownerClanId !== cmd.clanId)
    return { ok: false, reasonKey: REJECT_REASONS.notOwner };
  if (
    !executor ||
    !executor.hasComeOfAge ||
    executor.status !== 'serving' ||
    executor.clanId !== cmd.clanId ||
    executor.locationCastleId !== target.locationCastleId
  )
    return { ok: false, reasonKey: REJECT_REASONS.invalidTarget };
  if (isOfficerBusy(state, executor.id))
    return { ok: false, reasonKey: REJECT_REASONS.officerBusy, params: { name: executor.name } };
  const cooldown = state.events.cooldownUntil[`officer.recruit:${target.id}:${cmd.clanId}`] ?? 0;
  if (cooldown > state.time.day) return { ok: false, reasonKey: REJECT_REASONS.alreadyActive };
  if (
    clan.gold <
    BAL.recruitAttemptCost + officerAbilityScore(target) * BAL.recruitSigningBonusPerAbility
  )
    return { ok: false, reasonKey: REJECT_REASONS.insufficientGold };
  return { ok: true };
}

export function applyRecruitRonin(
  state: GameState,
  cmd: CommandByType['recruitRonin'],
  emit: EmitFn,
): void {
  const target = state.officers[cmd.officerId]!,
    clan = state.clans[cmd.clanId]!;
  const rate = recruitRoninSuccessRate(state, target.id, cmd.executorId, clan.id);
  clan.gold -= BAL.recruitAttemptCost;
  if (!createRngStream(state.rng, 'misc').chance(rate)) {
    target.recruitRetryOn = state.time.day + BAL.recruitRetryCooldownDays;
    state.events.cooldownUntil[`officer.recruit:${target.id}:${clan.id}`] = target.recruitRetryOn;
    emit({
      type: 'officer.recruitFailed',
      day: state.time.day,
      clanIds: [clan.id],
      officerId: target.id,
      executorId: cmd.executorId,
      clanId: clan.id,
    });
    return;
  }
  clan.gold -= officerAbilityScore(target) * BAL.recruitSigningBonusPerAbility;
  transferOfficer(
    state,
    target.id,
    {
      clanId: clan.id,
      castleId: target.locationCastleId!,
      loyalty: 0,
      rank: RANK_VALUES[Math.min(expectedRankIndex(target), 3)]!,
      source: 'ronin',
    },
    emit,
  );
  target.loyalty = loyaltyTarget(state, target);
}

export function validateRewardOfficer(
  state: Readonly<GameState>,
  cmd: CommandByType['rewardOfficer'],
): ValidationResult {
  const target = state.officers[cmd.officerId],
    clan = state.clans[cmd.clanId];
  if (
    !target ||
    !target.hasComeOfAge ||
    target.status !== 'serving' ||
    !clan?.alive ||
    !['small', 'medium', 'large'].includes(cmd.tier)
  )
    return { ok: false, reasonKey: REJECT_REASONS.invalidTarget };
  if (target.clanId !== clan.id || target.id === clan.leaderId)
    return { ok: false, reasonKey: REJECT_REASONS.notOwner };
  if (clan.gold < rewardOfficerCost(cmd.tier))
    return { ok: false, reasonKey: REJECT_REASONS.insufficientGold };
  return { ok: true };
}
export function applyRewardOfficer(
  state: GameState,
  cmd: CommandByType['rewardOfficer'],
  emit: EmitFn,
): void {
  void emit;
  const officer = state.officers[cmd.officerId]!;
  const clan = state.clans[cmd.clanId]!;
  const cost = rewardOfficerCost(cmd.tier);
  clan.gold -= cost;
  if (clan.rewardGoldSpentThisMonth !== null) clan.rewardGoldSpentThisMonth += cost;
  adjustLoyalty(officer, rewardOfficerLoyaltyGain(officer, cmd.tier));
  officer.rewardGiftsThisYear += 1;
}

export function validateHandleCaptive(
  state: Readonly<GameState>,
  cmd: CommandByType['handleCaptive'],
): ValidationResult {
  const target = state.officers[cmd.officerId],
    clan = state.clans[cmd.clanId];
  if (
    !target ||
    !target.hasComeOfAge ||
    target.status !== 'captive' ||
    !clan?.alive ||
    target.locationCastleId === null ||
    !['recruit', 'release', 'execute'].includes(cmd.action)
  )
    return { ok: false, reasonKey: REJECT_REASONS.invalidTarget };
  if (
    target.capturedByClanId !== clan.id ||
    state.castles[target.locationCastleId]?.ownerClanId !== clan.id
  )
    return { ok: false, reasonKey: REJECT_REASONS.notOwner };
  if (
    cmd.action !== 'release' &&
    target.clanId !== null &&
    state.clans[target.clanId]?.alive &&
    state.clans[target.clanId]?.leaderId === target.id
  )
    return { ok: false, reasonKey: REJECT_REASONS.invalidTarget }; // Captured ruling daimyo resolution belongs to 10.
  if (cmd.action === 'recruit') {
    if ((target.captiveRetryOn ?? 0) > state.time.day)
      return { ok: false, reasonKey: REJECT_REASONS.alreadyActive };
    const executor = state.officers[cmd.executorId ?? clan.leaderId];
    if (
      !executor ||
      !executor.hasComeOfAge ||
      executor.status !== 'serving' ||
      executor.clanId !== clan.id
    )
      return { ok: false, reasonKey: REJECT_REASONS.invalidTarget };
    if (
      cmd.executorId !== null &&
      (executor.locationCastleId !== target.locationCastleId || isOfficerBusy(state, executor.id))
    )
      return { ok: false, reasonKey: REJECT_REASONS.officerBusy };
    if (clan.gold < officerAbilityScore(target) * BAL.recruitSigningBonusPerAbility)
      return { ok: false, reasonKey: REJECT_REASONS.insufficientGold };
  }
  return { ok: true };
}

export function applyHandleCaptive(
  state: GameState,
  cmd: CommandByType['handleCaptive'],
  emit: EmitFn,
): void {
  const target = state.officers[cmd.officerId]!,
    clan = state.clans[cmd.clanId]!;
  const originalClanId = target.clanId;
  if (cmd.action === 'recruit') {
    if (
      !createRngStream(state.rng, 'misc').chance(
        captiveRecruitSuccessRate(state, target.id, cmd.executorId, clan.id),
      )
    ) {
      target.captiveRetryOn = state.time.day + BAL.captiveRetryCooldownDays;
      return;
    }
    clan.gold -= officerAbilityScore(target) * BAL.recruitSigningBonusPerAbility;
    transferOfficer(
      state,
      target.id,
      {
        clanId: clan.id,
        castleId: target.locationCastleId!,
        loyalty: BAL.captiveInitialLoyalty,
        rank: RANK_VALUES[Math.min(expectedRankIndex(target), 3)]!,
        source: 'captive',
      },
      emit,
    );
    return;
  }
  releaseOfficerAssignments(state, target.id).forEach(emit);
  target.capturedByClanId = null;
  target.captiveRetryOn = null;
  target.armyId = null;
  if (cmd.action === 'release') {
    clan.prestige = Math.min(BAL.prestigeMax, clan.prestige + BAL.releasePrestigeGain);
    const original = originalClanId === null ? undefined : state.clans[originalClanId];
    const refuge = original?.alive
      ? (nearestOwnedCastleByTravelTime(state, original.id, target.locationCastleId!)?.castle ??
        Object.values(state.castles)
          .filter((castle) => castle.ownerClanId === original.id)
          .sort((a, b) => a.id.localeCompare(b.id))[0])
      : undefined;
    target.status = refuge ? 'serving' : 'ronin';
    target.clanId = refuge ? originalClanId : null;
    if (refuge) target.locationCastleId = refuge.id;
  } else {
    target.status = 'dead';
    clearSpouseOnDeath(state, target.id);
    target.clanId = null;
    target.locationCastleId = null;
    clan.prestige = Math.max(0, clan.prestige - BAL.executePrestigeLoss);
    for (const officer of Object.values(state.officers))
      if (
        officer.hasComeOfAge &&
        officer.status === 'serving' &&
        officer.clanId === clan.id &&
        officer.kinship !== 'kin' &&
        officer.id !== clan.leaderId
      )
        adjustLoyalty(officer, -BAL.executeLoyaltyPenalty);
  }
  emit({
    type: cmd.action === 'release' ? 'officer.released' : 'officer.executed',
    day: state.time.day,
    clanIds: originalClanId === null ? [clan.id] : [clan.id, originalClanId],
    officerId: target.id,
    byClanId: clan.id,
  });
}
