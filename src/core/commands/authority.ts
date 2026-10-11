import type { CastleId, ClanId, CorpsId, DistrictId, OfficerId } from '../state/ids';
import type { Castle, GameState } from '../state/gameState';
import type { Command, CommandEnvelope, ValidationResult } from './types';
import { REJECT_REASONS } from './reasons';

/** Trusted execution context, never a field a player can forge inside Command. */
export type ExecutionAuthority =
  | { kind: 'player' }
  | { kind: 'clan'; clanId: ClanId }
  | { kind: 'castle'; clanId: ClanId; castleId: CastleId }
  | { kind: 'steward'; clanId: ClanId; officerId: OfficerId; districtId: DistrictId }
  | { kind: 'corps'; clanId: ClanId; corpsId: CorpsId };

export const PLAYER_AUTHORITY: ExecutionAuthority = { kind: 'player' };

/** Legacy/manual envelopes imply player controls; trusted AI envelopes carry their context. */
export interface AuthorizedCommandEnvelope extends CommandEnvelope {
  authority: ExecutionAuthority;
}

export function envelopeAuthority(envelope: CommandEnvelope): ExecutionAuthority {
  return 'authority' in envelope
    ? (envelope as AuthorizedCommandEnvelope).authority
    : PLAYER_AUTHORITY;
}

export function canControlCastle(
  state: Readonly<GameState>,
  castle: Readonly<Castle>,
  authority: ExecutionAuthority = PLAYER_AUTHORITY,
): boolean {
  switch (authority.kind) {
    case 'player':
      return castle.directControl && castle.corpsId === null;
    case 'clan':
      return (
        (authority.clanId !== state.meta.playerClanId || state.ai.allAi) &&
        castle.ownerClanId === authority.clanId &&
        castle.corpsId === null
      );
    case 'castle':
      return (
        castle.id === authority.castleId &&
        castle.ownerClanId === authority.clanId &&
        !castle.directControl &&
        castle.corpsId === null
      );
    case 'corps': {
      const corps = state.corps[authority.corpsId];
      return (
        corps?.clanId === authority.clanId &&
        castle.ownerClanId === authority.clanId &&
        castle.corpsId === corps.id
      );
    }
    case 'steward':
      return false;
  }
}

const CASTLE_ACTIONS = new Set<Command['type']>([
  'buildFacility',
  'cancelBuild',
  'setConscriptPolicy',
  'transport',
  'setDevelopFocus',
]);
const CORPS_ACTIONS = new Set<Command['type']>([
  ...CASTLE_ACTIONS,
  'march',
  'setArmyTarget',
  'recallArmy',
  'returnArmyToCastle',
  'depositGarrison',
  'setAutoReturn',
  'setSiegeMode',
  'startKassen',
]);

/** Scope checks precede the ordinary resource/relationship validator; they grant no rule exemption. */
export function validateExecutionAuthority(
  state: Readonly<GameState>,
  command: Command,
  authority: ExecutionAuthority,
): ValidationResult {
  const denied: ValidationResult = { ok: false, reasonKey: REJECT_REASONS.delegatedToCorps };
  const ordinaryControl = new Set<Command['type']>([
    'buildFacility',
    'cancelBuild',
    'demolishFacility',
    'setConscriptPolicy',
    'tradeRice',
  ]);
  if (authority.kind === 'player') {
    if (command.type === 'invokeTaimei' && command.clanId !== state.meta.playerClanId)
      return { ok: false, reasonKey: REJECT_REASONS.notOwner };
    if ('armyId' in command && state.armies[command.armyId]?.corpsId != null) return denied;
    if (ordinaryControl.has(command.type) && 'castleId' in command && command.castleId !== null) {
      const castle = state.castles[command.castleId];
      if (castle && !canControlCastle(state, castle, authority)) return denied;
    }
    if (command.type === 'transport') {
      const castle = state.castles[command.fromCastleId];
      if (castle && !canControlCastle(state, castle, authority)) return denied;
    }
    if (command.type === 'setSiegeMode') {
      const siege = state.sieges[command.siegeId];
      if (siege && !siege.attackerArmyIds.some((id) => state.armies[id]?.corpsId === null))
        return denied;
    }
    if (command.type === 'startKassen') {
      const combat = state.fieldCombats[command.fieldCombatId];
      if (
        combat &&
        ![...combat.sideA.armyIds, ...combat.sideB.armyIds].some(
          (id) => state.armies[id]?.clanId === command.clanId && state.armies[id]?.corpsId === null,
        )
      )
        return denied;
    }
    return { ok: true };
  }
  if (authority.clanId !== command.clanId || !state.clans[authority.clanId]?.alive)
    return { ok: false, reasonKey: REJECT_REASONS.notOwner };
  if (authority.kind === 'clan') {
    if (
      ordinaryControl.has(command.type) &&
      'castleId' in command &&
      command.castleId !== null &&
      state.castles[command.castleId]?.corpsId != null
    )
      return denied;
    if (command.type === 'transport' && state.castles[command.fromCastleId]?.corpsId != null)
      return denied;
    if (command.type === 'setSiegeMode') {
      const siege = state.sieges[command.siegeId];
      if (
        siege &&
        !siege.attackerArmyIds.some(
          (id) =>
            state.armies[id]?.clanId === authority.clanId && state.armies[id]?.corpsId === null,
        )
      )
        return denied;
    }
    if (command.type === 'startKassen') {
      const combat = state.fieldCombats[command.fieldCombatId];
      if (
        combat &&
        ![...combat.sideA.armyIds, ...combat.sideB.armyIds].some(
          (id) =>
            state.armies[id]?.clanId === authority.clanId && state.armies[id]?.corpsId === null,
        )
      )
        return denied;
    }
    return (authority.clanId !== state.meta.playerClanId || state.ai.allAi) &&
      !command.type.startsWith('debug') &&
      !('armyId' in command && state.armies[command.armyId]?.corpsId != null)
      ? { ok: true }
      : denied;
  }
  if (authority.kind === 'steward') {
    const district = state.districts[authority.districtId];
    const officer = state.officers[authority.officerId];
    return command.type === 'setDevelopFocus' &&
      command.districtId === authority.districtId &&
      district?.ownerClanId === authority.clanId &&
      district.stewardId === authority.officerId &&
      officer?.clanId === authority.clanId &&
      officer.status === 'serving' &&
      officer.hasComeOfAge
      ? { ok: true }
      : denied;
  }
  if (!(authority.kind === 'castle' ? CASTLE_ACTIONS : CORPS_ACTIONS).has(command.type))
    return denied;
  const scopedCastle =
    'castleId' in command
      ? command.castleId === null
        ? undefined
        : state.castles[command.castleId]
      : command.type === 'march'
        ? state.castles[command.originCastleId]
        : command.type === 'setDevelopFocus'
          ? state.castles[state.districts[command.districtId]?.castleId as CastleId]
          : undefined;
  const consolidatingCapture =
    authority.kind === 'corps' &&
    command.type === 'depositGarrison' &&
    scopedCastle?.ownerClanId === authority.clanId &&
    state.ai.clans[authority.clanId]?.attackPlans.some(
      (plan) =>
        plan.ownerCorpsId === authority.corpsId &&
        plan.stage === 'consolidate' &&
        plan.targetCastleId === command.castleId &&
        plan.armyIds.includes(command.armyId),
    );
  if (scopedCastle && !canControlCastle(state, scopedCastle, authority) && !consolidatingCapture)
    return denied;
  if (command.type === 'transport') {
    const source = state.castles[command.fromCastleId];
    const destination = state.castles[command.toCastleId];
    if (!source || !destination) return denied;
    if (authority.kind === 'castle') {
      if (
        !canControlCastle(state, destination, authority) ||
        source.ownerClanId !== authority.clanId ||
        source.corpsId !== null
      )
        return denied;
    } else if (
      !canControlCastle(state, source, authority) ||
      !canControlCastle(state, destination, authority)
    )
      return denied;
  }
  if ('armyId' in command) {
    const army = state.armies[command.armyId];
    if (authority.kind !== 'corps' || army?.corpsId !== authority.corpsId) return denied;
  }
  if (authority.kind === 'corps') {
    if (command.type === 'setSiegeMode') {
      const siege = state.sieges[command.siegeId];
      if (!siege?.attackerArmyIds.some((id) => state.armies[id]?.corpsId === authority.corpsId))
        return denied;
    }
    if (command.type === 'startKassen') {
      const combat = state.fieldCombats[command.fieldCombatId];
      if (
        !combat ||
        ![...combat.sideA.armyIds, ...combat.sideB.armyIds].some(
          (id) => state.armies[id]?.corpsId === authority.corpsId,
        )
      )
        return denied;
    }
    const target =
      command.type === 'march' || command.type === 'setArmyTarget'
        ? command.targetNodeId
        : command.type === 'returnArmyToCastle'
          ? command.destinationCastleId
          : null;
    if (target !== null) {
      const nodes = new Set<string>();
      for (const castle of Object.values(state.castles)) {
        if (castle.corpsId !== authority.corpsId || castle.ownerClanId !== authority.clanId)
          continue;
        nodes.add(castle.id);
        for (const id of castle.districtIds) {
          if (state.districts[id]?.ownerClanId === authority.clanId) nodes.add(id);
        }
      }
      if (!nodes.has(target)) {
        const node = state.castles[target as CastleId] ?? state.districts[target as DistrictId];
        const targetNodes = new Set<string>([target]);
        if (node && 'districtIds' in node) {
          for (const id of node.districtIds) {
            if (state.districts[id]?.ownerClanId === node.ownerClanId) targetNodes.add(id);
          }
        }
        if (
          !node ||
          node.ownerClanId === authority.clanId ||
          !Object.values(state.roads).some(
            (road) =>
              (targetNodes.has(road.a) && nodes.has(road.b)) ||
              (targetNodes.has(road.b) && nodes.has(road.a)),
          )
        )
          return denied;
      }
    }
  }
  return { ok: true };
}
