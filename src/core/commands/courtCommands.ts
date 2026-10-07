import { BAL } from '../balance';
import { createRngStream } from '../rng';
import type { GameState } from '../state/gameState';
import type { CommandByType, EmitFn } from './registry';
import { REJECT_REASONS, type RejectReasonKey } from './reasons';
import type { ValidationResult } from './types';
import { DAYS_PER_MONTH } from '../systems/time';
import { adjustSentiment, ensureDiplomacyRow, isAtWar } from '../systems/diplomacyCommon';
import {
  controlsCourtCapital,
  courtRankOrder,
  courtUnlocks,
  shogunateTitleOrder,
} from '../systems/court';

const reject = (reasonKey: RejectReasonKey = REJECT_REASONS.invalidTarget): ValidationResult => ({
  ok: false,
  reasonKey,
});
const nextRank = (
  state: Readonly<GameState>,
  clanId: CommandByType['requestCourtRank']['clanId'],
) =>
  BAL.courtRankTable.find(
    (def) => def.rank === courtRankOrder(state.clans[clanId]?.courtRank ?? 'none') + 1,
  );
const nextTitle = (
  state: Readonly<GameState>,
  clanId: CommandByType['requestShogunateTitle']['clanId'],
) => {
  const order = shogunateTitleOrder(state.clans[clanId]?.shogunateTitle ?? 'none');
  return order === null
    ? undefined
    : BAL.shogunateTitleTable.find((def) => def.order === order + 1);
};

export function validateRequestCourtRank(
  state: Readonly<GameState>,
  cmd: CommandByType['requestCourtRank'],
): ValidationResult {
  const clan = state.clans[cmd.clanId],
    def = nextRank(state, cmd.clanId);
  if (
    !clan?.alive ||
    def === undefined ||
    (state.court.courtFavor[cmd.clanId] ?? 0) < def.favorRequired
  )
    return reject();
  if (clan.gold < def.goldCost) return reject(REJECT_REASONS.insufficientGold);
  return { ok: true };
}
export function applyRequestCourtRank(
  state: GameState,
  cmd: CommandByType['requestCourtRank'],
  emit: EmitFn,
): void {
  const clan = state.clans[cmd.clanId]!,
    def = nextRank(state, cmd.clanId)!;
  clan.gold -= def.goldCost;
  clan.courtRank = def.id;
  clan.prestige = Math.min(BAL.prestigeMax, clan.prestige + def.prestigeBonus);
  emit({
    type: 'court.rankGranted',
    day: state.time.day,
    clanIds: [clan.id],
    clanId: clan.id,
    newCourtRank: def.id,
  });
}

export function mediationFavorCost(
  state: Readonly<GameState>,
  clanId: CommandByType['requestMediation']['clanId'],
): number {
  return Math.round(
    BAL.courtMediationFavorCost *
      (courtUnlocks(state.clans[clanId]?.courtRank ?? 'none').includes('mediationDiscount')
        ? BAL.courtMediationFavorDiscount
        : 1),
  );
}
export function validateRequestMediation(
  state: Readonly<GameState>,
  cmd: CommandByType['requestMediation'],
): ValidationResult {
  const clan = state.clans[cmd.clanId];
  if (
    !clan?.alive ||
    !state.clans[cmd.targetClanId]?.alive ||
    cmd.targetClanId === cmd.clanId ||
    !courtUnlocks(clan.courtRank).includes('mediation') ||
    !isAtWar(state, cmd.clanId, cmd.targetClanId) ||
    state.time.day < (state.court.mediationCooldownUntil[cmd.clanId] ?? 0) ||
    (state.court.courtFavor[cmd.clanId] ?? 0) < mediationFavorCost(state, cmd.clanId)
  )
    return reject();
  if (clan.gold < BAL.courtMediationGoldCost) return reject(REJECT_REASONS.insufficientGold);
  return { ok: true };
}
export function applyRequestMediation(
  state: GameState,
  cmd: CommandByType['requestMediation'],
  emit: EmitFn,
): void {
  const clan = state.clans[cmd.clanId]!,
    target = state.clans[cmd.targetClanId]!;
  state.court.courtFavor[clan.id] =
    (state.court.courtFavor[clan.id] ?? 0) - mediationFavorCost(state, clan.id);
  clan.gold -= BAL.courtMediationGoldCost;
  const failP = Math.min(
    BAL.courtMediationFailMax,
    Math.max(
      0,
      BAL.courtMediationFailBase +
        Math.max(0, courtRankOrder(target.courtRank) - courtRankOrder(clan.courtRank)) *
          BAL.courtMediationFailPerRank,
    ),
  );
  const success = !createRngStream(state.rng, 'misc').chance(failP);
  state.court.mediationCooldownUntil[clan.id] =
    state.time.day + BAL.courtMediationCooldownMonths * DAYS_PER_MONTH;
  if (!success)
    clan.gold += Math.round(BAL.courtMediationGoldCost * BAL.courtMediationFailureRefundRate);
  else {
    const row = ensureDiplomacyRow(state, clan.id, target.id);
    row.pacts = row.pacts.filter((pact) => pact.kind !== 'ceasefire');
    row.pacts.push({
      kind: 'ceasefire',
      startDay: state.time.day,
      endDay: state.time.day + BAL.courtMediationCeasefireMonths * DAYS_PER_MONTH,
      vassalClanId: null,
    });
    emit({
      type: 'pact.signed',
      day: state.time.day,
      clanIds: [row.a, row.b],
      aClanId: row.a,
      bClanId: row.b,
      kind: 'ceasefire',
      endDay: state.time.day + BAL.courtMediationCeasefireMonths * DAYS_PER_MONTH,
    });
  }
  emit({
    type: 'court.mediationResult',
    day: state.time.day,
    clanIds: [clan.id, target.id],
    clanId: clan.id,
    targetClanId: target.id,
    success,
    ceasefireMonths: success ? BAL.courtMediationCeasefireMonths : 0,
  });
}

export function shogunateTitleCost(
  state: Readonly<GameState>,
  clanId: CommandByType['requestShogunateTitle']['clanId'],
): number | null {
  const def = nextTitle(state, clanId);
  return def === undefined
    ? null
    : Math.round(
        def.goldCost * (state.court.patronClanId === clanId ? BAL.shogunPatronTitleCostMult : 1),
      );
}
export function validateRequestShogunateTitle(
  state: Readonly<GameState>,
  cmd: CommandByType['requestShogunateTitle'],
): ValidationResult {
  const clan = state.clans[cmd.clanId],
    def = nextTitle(state, cmd.clanId);
  if (
    !clan?.alive ||
    !state.court.shogunateExists ||
    def === undefined ||
    clan.prestige < def.prestigeRequired ||
    (state.court.shogunateFavor[clan.id] ?? 0) < def.favorRequired ||
    (def.requiresPatron && state.court.patronClanId !== clan.id) ||
    (def.requiresCapitalOrPatron &&
      state.court.patronClanId !== clan.id &&
      !controlsCourtCapital(state, clan.id))
  )
    return reject();
  if (clan.gold < shogunateTitleCost(state, clan.id)!)
    return reject(REJECT_REASONS.insufficientGold);
  return { ok: true };
}
export function applyRequestShogunateTitle(
  state: GameState,
  cmd: CommandByType['requestShogunateTitle'],
  emit: EmitFn,
): void {
  const clan = state.clans[cmd.clanId]!,
    def = nextTitle(state, cmd.clanId)!;
  clan.gold -= shogunateTitleCost(state, clan.id)!;
  clan.shogunateTitle = def.id;
  clan.prestige = Math.min(BAL.prestigeMax, clan.prestige + def.prestigeBonus);
  emit({
    type: 'shogunate.titleGranted',
    day: state.time.day,
    clanIds: [clan.id],
    clanId: clan.id,
    title: def.id,
  });
}

export function validateNominateShogun(
  state: Readonly<GameState>,
  cmd: CommandByType['nominateShogun'],
): ValidationResult {
  if (
    !state.clans[cmd.clanId]?.alive ||
    !state.court.shogunateExists ||
    state.court.patronClanId !== null ||
    !controlsCourtCapital(state, cmd.clanId) ||
    (state.court.shogunateFavor[cmd.clanId] ?? 0) < BAL.shogunNominateFavorMin
  )
    return reject();
  return { ok: true };
}
export function applyNominateShogun(
  state: GameState,
  cmd: CommandByType['nominateShogun'],
  emit: EmitFn,
): void {
  state.court.patronClanId = cmd.clanId;
  const clan = state.clans[cmd.clanId]!;
  clan.prestige = Math.min(BAL.prestigeMax, clan.prestige + BAL.shogunNominatePrestigeGain);
  for (const other of Object.values(state.clans)
    .filter((c) => c.alive && c.id !== clan.id)
    .sort((a, b) => a.id.localeCompare(b.id)))
    adjustSentiment(state, other.id, clan.id, BAL.shogunPatronSentimentGain);
  emit({ type: 'shogunate.nominated', day: state.time.day, clanIds: [clan.id], clanId: clan.id });
}
