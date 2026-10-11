import type { Corps, GameState } from '../state/gameState';
import { BAL } from '../balance';
import { CORPS_DIRECTIVE_VALUES, RANK_VALUES } from '../state/enums';
import { nextId } from '../state/serialize';
import { isOfficerBusy } from '../systems/diplomacyCommon';
import { adjustLoyalty } from '../systems/officers';
import { dissolveCorps, removeCastleFromCorps } from '../systems/corps';
import type { CommandByType, EmitFn } from './registry';
import type { ValidationResult } from './types';
import { REJECT_REASONS } from './reasons';

/** Only explicit removal of the role is a dismissal (06 §3.6.3). */
function dismissCorpsLeader(state: GameState, corps: Readonly<Corps>): void {
  const officer = state.officers[corps.corpsLeaderId];
  if (
    officer?.status === 'serving' &&
    officer.clanId === corps.clanId &&
    state.clans[corps.clanId]?.leaderId !== officer.id
  )
    // The ruling leader remains at 100 by higher-priority 02 INV-08.
    adjustLoyalty(officer, -BAL.loyaltyDismiss);
}

function validDirective(
  state: Readonly<GameState>,
  cmd: CommandByType['createCorps'] | CommandByType['setCorpsDirective'],
): boolean {
  if (!CORPS_DIRECTIVE_VALUES.includes(cmd.directive)) return false;
  if (cmd.directive !== 'advance') return cmd.targetNodeId === null;
  if (cmd.targetNodeId === null) return false;
  const node =
    state.castles[cmd.targetNodeId as keyof typeof state.castles] ??
    state.districts[cmd.targetNodeId as keyof typeof state.districts];
  return node !== undefined && node.ownerClanId !== cmd.clanId;
}

export function validateCreateCorps(
  state: Readonly<GameState>,
  cmd: CommandByType['createCorps'],
): ValidationResult {
  const clan = state.clans[cmd.clanId],
    leader = state.officers[cmd.corpsLeaderId];
  if (!clan?.alive || !leader || !leader.hasComeOfAge || leader.status !== 'serving')
    return { ok: false, reasonKey: REJECT_REASONS.invalidTarget };
  if (leader.clanId !== cmd.clanId) return { ok: false, reasonKey: REJECT_REASONS.notOwner };
  // 06 §3.4.3: the current ruler has shukuro privileges without rewriting retained rank.
  if (leader.id !== clan.leaderId && RANK_VALUES.indexOf(leader.rank) < RANK_VALUES.indexOf('karo'))
    return { ok: false, reasonKey: REJECT_REASONS.rankTooLow, params: { name: leader.name } };
  if (
    isOfficerBusy(state, leader.id) ||
    Object.values(state.corps).some((c) => c.corpsLeaderId === leader.id)
  )
    return { ok: false, reasonKey: REJECT_REASONS.officerBusy, params: { name: leader.name } };
  if (
    !validDirective(state, cmd) ||
    cmd.castleIds.length === 0 ||
    new Set(cmd.castleIds).size !== cmd.castleIds.length
  )
    return { ok: false, reasonKey: REJECT_REASONS.invalidTarget };
  for (const id of cmd.castleIds) {
    const castle = state.castles[id];
    if (!castle) return { ok: false, reasonKey: REJECT_REASONS.invalidTarget };
    if (castle.ownerClanId !== cmd.clanId) return { ok: false, reasonKey: REJECT_REASONS.notOwner };
    if (castle.corpsId !== null) return { ok: false, reasonKey: REJECT_REASONS.delegatedToCorps };
    if (!castle.directControl) return { ok: false, reasonKey: REJECT_REASONS.invalidTarget };
  }
  return { ok: true };
}

export function applyCreateCorps(
  state: GameState,
  cmd: CommandByType['createCorps'],
  emit: EmitFn,
): void {
  void emit;
  const id = nextId(state, 'corps');
  state.corps[id] = {
    id,
    clanId: cmd.clanId,
    corpsLeaderId: cmd.corpsLeaderId,
    directive: cmd.directive,
    targetNodeId: cmd.targetNodeId,
    gold: 0,
    createdDay: state.time.day,
  };
  for (const castleId of cmd.castleIds) {
    const castle = state.castles[castleId]!;
    castle.corpsId = id;
    castle.directControl = false;
  }
}

export function validateSetCorpsDirective(
  state: Readonly<GameState>,
  cmd: CommandByType['setCorpsDirective'],
): ValidationResult {
  const corps = state.corps[cmd.corpsId];
  if (!corps || !state.clans[cmd.clanId]?.alive || !validDirective(state, cmd))
    return { ok: false, reasonKey: REJECT_REASONS.invalidTarget };
  return corps.clanId === cmd.clanId
    ? { ok: true }
    : { ok: false, reasonKey: REJECT_REASONS.notOwner };
}

export function applySetCorpsDirective(
  state: GameState,
  cmd: CommandByType['setCorpsDirective'],
  emit: EmitFn,
): void {
  void emit;
  const corps = state.corps[cmd.corpsId]!;
  corps.directive = cmd.directive;
  corps.targetNodeId = cmd.targetNodeId;
}

export function validateAssignCastleToCorps(
  state: Readonly<GameState>,
  cmd: CommandByType['assignCastleToCorps'],
): ValidationResult {
  const castle = state.castles[cmd.castleId];
  if (!castle || !state.clans[cmd.clanId]?.alive)
    return { ok: false, reasonKey: REJECT_REASONS.invalidTarget };
  if (castle.ownerClanId !== cmd.clanId) return { ok: false, reasonKey: REJECT_REASONS.notOwner };
  if (cmd.corpsId === null)
    return castle.corpsId !== null
      ? { ok: true }
      : { ok: false, reasonKey: REJECT_REASONS.invalidTarget };
  const corps = state.corps[cmd.corpsId];
  if (!corps) return { ok: false, reasonKey: REJECT_REASONS.invalidTarget };
  if (corps.clanId !== cmd.clanId) return { ok: false, reasonKey: REJECT_REASONS.notOwner };
  if (castle.corpsId !== null) return { ok: false, reasonKey: REJECT_REASONS.delegatedToCorps };
  return castle.directControl
    ? { ok: true }
    : { ok: false, reasonKey: REJECT_REASONS.invalidTarget };
}

export function applyAssignCastleToCorps(
  state: GameState,
  cmd: CommandByType['assignCastleToCorps'],
  emit: EmitFn,
): void {
  void emit;
  if (cmd.corpsId === null) {
    const corpsId = state.castles[cmd.castleId]!.corpsId;
    const corps = corpsId === null ? undefined : state.corps[corpsId];
    // Explicit reclaim refunds the entire wallet even when other castles remain
    // (07 §3.12). Zero it before empty-corps dissolution to prevent a second refund.
    // Involuntary cleanup continues to use the unmodified system helper.
    if (corps) {
      state.clans[corps.clanId]!.gold += corps.gold;
      corps.gold = 0;
    }
    removeCastleFromCorps(state, cmd.castleId);
    if (corps && state.corps[corps.id] === undefined) dismissCorpsLeader(state, corps);
  } else {
    const castle = state.castles[cmd.castleId]!;
    castle.corpsId = cmd.corpsId;
    castle.directControl = false;
  }
}

export function validateDissolveCorps(
  state: Readonly<GameState>,
  cmd: CommandByType['dissolveCorps'],
): ValidationResult {
  const corps = state.corps[cmd.corpsId];
  if (!corps || !state.clans[cmd.clanId]?.alive)
    return { ok: false, reasonKey: REJECT_REASONS.invalidTarget };
  return corps.clanId === cmd.clanId
    ? { ok: true }
    : { ok: false, reasonKey: REJECT_REASONS.notOwner };
}

export function applyDissolveCorps(
  state: GameState,
  cmd: CommandByType['dissolveCorps'],
  emit: EmitFn,
): void {
  void emit;
  const corps = state.corps[cmd.corpsId]!;
  dissolveCorps(state, cmd.corpsId);
  dismissCorpsLeader(state, corps);
}
