import { BAL } from '../balance';
import type { GameState } from '../state/gameState';
import { nextId } from '../state/serialize';
import { canPlot, isOfficerBusy } from '../systems/diplomacyCommon';
import { clearBetrayalMark, validBetrayalMark } from '../systems/plots';
import type { CommandByType, EmitFn } from './registry';
import { REJECT_REASONS, type RejectReasonKey } from './reasons';
import type { ValidationResult } from './types';

const reject = (reasonKey: RejectReasonKey = REJECT_REASONS.invalidTarget): ValidationResult => ({
  ok: false,
  reasonKey,
});

export function validateStartPlot(
  state: Readonly<GameState>,
  cmd: CommandByType['startPlot'],
): ValidationResult {
  const clan = state.clans[cmd.clanId],
    executor = state.officers[cmd.executorId],
    targetClan = state.clans[cmd.targetClanId];
  if (
    !clan?.alive ||
    !targetClan?.alive ||
    !canPlot(state, cmd.clanId, cmd.targetClanId) ||
    cmd.clanId === cmd.targetClanId
  )
    return reject();
  if (executor?.status !== 'serving' || !executor.hasComeOfAge) return reject();
  if (executor.clanId !== clan.id) return reject(REJECT_REASONS.notOwner);
  if (isOfficerBusy(state, executor.id))
    return { ok: false, reasonKey: REJECT_REASONS.officerBusy, params: { name: executor.name } };
  const plots = state.diplomacy.plots.filter((plot) => plot.ownerClanId === clan.id);
  if (plots.length >= BAL.plotMaxConcurrent) return reject(REJECT_REASONS.alreadyActive);
  if (
    plots.some(
      (plot) =>
        plot.kind === cmd.kind &&
        (cmd.targetCastleId !== null
          ? plot.targetCastleId === cmd.targetCastleId
          : plot.targetOfficerId === cmd.targetOfficerId),
    )
  )
    return reject(REJECT_REASONS.alreadyActive);
  const target = cmd.targetOfficerId === null ? undefined : state.officers[cmd.targetOfficerId];
  const castle = cmd.targetCastleId === null ? undefined : state.castles[cmd.targetCastleId];
  if (
    cmd.targetOfficerId !== null &&
    (target?.status !== 'serving' ||
      target.clanId !== targetClan.id ||
      !target.hasComeOfAge ||
      target.id === targetClan.leaderId)
  )
    return reject();
  if (cmd.targetCastleId !== null && castle?.ownerClanId !== targetClan.id) return reject();
  if (!Number.isInteger(cmd.investGold) || cmd.investGold < 0) return reject();
  if (cmd.kind === 'poach') {
    if (
      !target ||
      cmd.targetCastleId !== null ||
      target.kinship === 'kin' ||
      target.loyalty >= BAL.plotPoachLoyaltyThreshold ||
      target.traits.some((id) => id === 'trait.chushin') ||
      !(BAL.plotPoachInvestGoldOptions as readonly number[]).includes(cmd.investGold)
    )
      return reject();
  } else if (cmd.kind === 'rumor') {
    if ((cmd.targetOfficerId === null) === (cmd.targetCastleId === null) || cmd.investGold !== 0)
      return reject();
  } else if (cmd.kind === 'betrayal') {
    const lord = castle?.lordId == null ? undefined : state.officers[castle.lordId];
    if (
      cmd.targetOfficerId !== null ||
      !castle ||
      !lord ||
      !lord.hasComeOfAge ||
      lord.status !== 'serving' ||
      lord.clanId !== targetClan.id ||
      lord.id === targetClan.leaderId ||
      lord.loyalty >= BAL.plotBetrayalLoyaltyThreshold ||
      state.time.day < castle.betrayalImmunityUntilDay ||
      cmd.investGold < BAL.plotBetrayalMinInvestGold ||
      !(BAL.plotBetrayalInvestGoldOptions as readonly number[]).includes(cmd.investGold)
    )
      return reject();
  } else return reject();
  if (clan.gold < cmd.investGold) return reject(REJECT_REASONS.insufficientGold);
  return { ok: true };
}

export function applyStartPlot(
  state: GameState,
  cmd: CommandByType['startPlot'],
  _emit: EmitFn,
): void {
  void _emit;
  state.clans[cmd.clanId]!.gold -= cmd.investGold;
  state.diplomacy.plots.push({
    id: nextId(state, 'plot'),
    kind: cmd.kind,
    ownerClanId: cmd.clanId,
    officerId: cmd.executorId,
    targetClanId: cmd.targetClanId,
    targetOfficerId:
      cmd.kind === 'betrayal' ? state.castles[cmd.targetCastleId!]!.lordId : cmd.targetOfficerId,
    targetCastleId: cmd.targetCastleId,
    investGold: cmd.investGold,
    progress: 0,
    startedDay: state.time.day,
  });
}
export function validateCancelPlot(
  state: Readonly<GameState>,
  cmd: CommandByType['cancelPlot'],
): ValidationResult {
  const plot = state.diplomacy.plots.find((candidate) => candidate.id === cmd.plotId);
  if (!plot) return reject();
  return plot.ownerClanId === cmd.clanId ? { ok: true } : reject(REJECT_REASONS.notOwner);
}
export function applyCancelPlot(
  state: GameState,
  cmd: CommandByType['cancelPlot'],
  _emit: EmitFn,
): void {
  void _emit;
  state.diplomacy.plots = state.diplomacy.plots.filter((plot) => plot.id !== cmd.plotId);
}

export function validateUseBetrayal(
  state: Readonly<GameState>,
  cmd: CommandByType['useBetrayal'],
): ValidationResult {
  const siege = state.sieges[cmd.siegeId];
  if (!siege) return reject();
  if (siege.attackerClanId !== cmd.clanId) return reject(REJECT_REASONS.notOwner);
  const castle = state.castles[siege.castleId];
  if (
    siege.betrayalUsed ||
    !castle ||
    !canPlot(state, cmd.clanId, castle.ownerClanId) ||
    !validBetrayalMark(state, castle, cmd.clanId)
  )
    return reject();
  return { ok: true };
}
export function applyUseBetrayal(
  state: GameState,
  cmd: CommandByType['useBetrayal'],
  emit: EmitFn,
): void {
  const siege = state.sieges[cmd.siegeId]!,
    castle = state.castles[siege.castleId]!;
  const targetClanId = castle.ownerClanId;
  castle.morale = Math.min(castle.morale, BAL.plotBetrayalMoraleFloor);
  state.officers[castle.lordId!]!.loyalty = 0;
  siege.betrayalUsed = true;
  clearBetrayalMark(castle);
  emit({
    type: 'plot.betrayalActivated',
    day: state.time.day,
    clanIds: [cmd.clanId, targetClanId],
    actorClanId: cmd.clanId,
    targetClanId,
    castleId: castle.id,
  });
}
