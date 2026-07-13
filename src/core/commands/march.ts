import { BAL } from '../balance';
import { RANK_VALUES } from '../state/enums';
import { buildMapGraph } from '../state/mapGraph';
import { nextId } from '../state/serialize';
import { computePath, getStance } from '../systems/pathfinding';
import { detachArmyFromSiege } from '../systems/siege';
import { nearestOwnedCastleByTravelTime } from '../systems/castleSelection';
import type { GameState } from '../state/gameState';
import type { ClanId, MapNodeId } from '../state/ids';
import type { CommandByType, EmitFn } from './registry';
import { REJECT_REASONS } from './reasons';
import type { ValidationResult } from './types';

const ok: ValidationResult = { ok: true };
const reject = (reasonKey: string): ValidationResult => ({ ok: false, reasonKey });

/** Future policy seam; no currently shipped policy modifies an army's initial morale. */
export function policyMoraleBonus(_state: Readonly<GameState>, _clanId: ClanId): number {
  void _state;
  void _clanId;
  return 0;
}

function graphOf(state: Readonly<GameState>) {
  return buildMapGraph(state.castles, state.districts, state.roads);
}

function edgeCost(state: Readonly<GameState>, from: MapNodeId, to: MapNodeId): number {
  const edge = Object.values(state.roads).find(
    (candidate) =>
      (candidate.a === from && candidate.b === to) || (candidate.a === to && candidate.b === from),
  );
  if (!edge) return 0;
  return edge.type === 'sea' ? edge.baseDays : edge.baseDays / BAL.roadGradeSpeedMult[edge.grade];
}

function isHostileCastle(
  state: Readonly<GameState>,
  clanId: ClanId,
  targetNodeId: MapNodeId,
): boolean {
  const castle = state.castles[targetNodeId as keyof typeof state.castles];
  if (!castle) return false;
  const stance = getStance(state, clanId, castle.ownerClanId);
  return stance === 'war' || stance === 'neutral';
}

function availableOfficer(
  state: Readonly<GameState>,
  officerId: string,
  castleId: string,
  clanId: string,
) {
  const officer = state.officers[officerId as keyof typeof state.officers];
  return officer?.status === 'serving' &&
    officer.hasComeOfAge &&
    officer.clanId === clanId &&
    officer.locationCastleId === castleId &&
    officer.armyId === null
    ? officer
    : undefined;
}

export function validateMarch(
  state: Readonly<GameState>,
  cmd: CommandByType['march'],
): ValidationResult {
  const castle = state.castles[cmd.originCastleId];
  if (!castle || castle.ownerClanId !== cmd.clanId) return reject(REJECT_REASONS.notOwner);
  if (!castle.directControl || castle.corpsId !== null)
    return reject(REJECT_REASONS.delegatedToCorps);
  const leader = availableOfficer(state, cmd.leaderId, castle.id, cmd.clanId);
  if (!leader) return reject(REJECT_REASONS.officerBusy);
  if (
    cmd.deputyIds.length > BAL.maxDeputies ||
    new Set([cmd.leaderId, ...cmd.deputyIds]).size !== cmd.deputyIds.length + 1 ||
    cmd.deputyIds.some((id) => !availableOfficer(state, id, castle.id, cmd.clanId))
  ) {
    return reject(REJECT_REASONS.officerBusy);
  }
  const rankIndex =
    state.clans[cmd.clanId]?.leaderId === leader.id
      ? RANK_VALUES.length - 1
      : RANK_VALUES.indexOf(leader.rank);
  const cap = BAL.rankTroopCap[rankIndex] ?? 0;
  if (
    !Number.isInteger(cmd.soldiers) ||
    cmd.soldiers < BAL.minMarchTroops ||
    cmd.soldiers > castle.soldiers ||
    cmd.soldiers > cap
  ) {
    return reject(REJECT_REASONS.insufficientTroops);
  }
  const minFood = cmd.soldiers * BAL.fieldFoodPerSoldierDaily * BAL.minCarryDays;
  const maxFood = cmd.soldiers * BAL.fieldFoodPerSoldierDaily * BAL.maxCarryDays;
  if (
    !Number.isInteger(cmd.food) ||
    cmd.food < minFood ||
    cmd.food > maxFood ||
    cmd.food > castle.food
  )
    return reject(REJECT_REASONS.insufficientFood);
  const graph = graphOf(state);
  if (!graph.nodes.has(cmd.targetNodeId)) return reject(REJECT_REASONS.invalidTarget);
  const path = computePath(state, graph, {
    clanId: cmd.clanId,
    from: castle.id,
    to: cmd.targetNodeId,
    speedFactor: 1,
  });
  return path.found && path.nodes.length > 1 ? ok : reject(REJECT_REASONS.pathBlocked);
}

export function applyMarch(state: GameState, cmd: CommandByType['march'], emit: EmitFn): void {
  const castle = state.castles[cmd.originCastleId]!;
  const leader = state.officers[cmd.leaderId]!;
  const path = computePath(state, graphOf(state), {
    clanId: cmd.clanId,
    from: castle.id,
    to: cmd.targetNodeId,
    speedFactor: 1,
  });
  const id = nextId(state, 'army');
  state.armies[id] = {
    id,
    clanId: cmd.clanId,
    leaderId: cmd.leaderId,
    deputyIds: [...cmd.deputyIds],
    soldiers: cmd.soldiers,
    initialTroops: cmd.soldiers,
    food: cmd.food,
    morale: Math.max(
      0,
      Math.min(
        100,
        Math.round(
          BAL.moraleInitBase +
            (leader.ldr + leader.statGrowth.ldr) * BAL.moraleInitLdrFactor +
            policyMoraleBonus(state, cmd.clanId),
        ),
      ),
    ),
    status: 'marching',
    mission: isHostileCastle(state, cmd.clanId, cmd.targetNodeId) ? 'conquer' : 'march',
    originCastleId: castle.id,
    targetNodeId: cmd.targetNodeId,
    path: path.nodes,
    pathCursor: 0,
    posNodeId: castle.id,
    edgeProgressDays: 0,
    edgeCostDays: edgeCost(state, path.nodes[0]!, path.nodes[1]!),
    battleId: null,
    siegeId: null,
    autoReturn: true,
    corpsId: castle.corpsId,
    pursuitEligibleArmyIds: [],
  };
  castle.soldiers -= cmd.soldiers;
  castle.food -= cmd.food;
  for (const officerId of [cmd.leaderId, ...cmd.deputyIds]) {
    const officer = state.officers[officerId]!;
    officer.armyId = id;
    officer.locationCastleId = null;
  }
  emit({
    type: 'army.departed',
    day: state.time.day,
    clanIds: [cmd.clanId],
    armyId: id,
    clanId: cmd.clanId,
    originCastleId: castle.id,
    targetNodeId: cmd.targetNodeId,
    leaderId: cmd.leaderId,
  });
}

export function validateSetArmyTarget(
  state: Readonly<GameState>,
  cmd: CommandByType['setArmyTarget'],
): ValidationResult {
  const army = state.armies[cmd.armyId];
  if (!army || army.clanId !== cmd.clanId) return reject(REJECT_REASONS.notOwner);
  if (army.status === 'routed' || army.status === 'engaged')
    return reject(REJECT_REASONS.officerBusy);
  const path = computePath(state, graphOf(state), {
    clanId: cmd.clanId,
    from: army.posNodeId,
    to: cmd.targetNodeId,
    speedFactor: 1,
  });
  return path.found && path.nodes.length > 1 ? ok : reject(REJECT_REASONS.pathBlocked);
}

export function applySetArmyTarget(
  state: GameState,
  cmd: CommandByType['setArmyTarget'],
  emit: EmitFn,
): void {
  const army = state.armies[cmd.armyId]!;
  const path = computePath(state, graphOf(state), {
    clanId: cmd.clanId,
    from: army.posNodeId,
    to: cmd.targetNodeId,
    speedFactor: 1,
  });
  for (const event of detachArmyFromSiege(state, army.id)) emit(event);
  army.targetNodeId = cmd.targetNodeId;
  army.mission = isHostileCastle(state, cmd.clanId, cmd.targetNodeId) ? 'conquer' : 'march';
  army.path = path.nodes;
  army.pathCursor = 0;
  army.edgeProgressDays = 0;
  army.edgeCostDays = edgeCost(state, path.nodes[0]!, path.nodes[1]!);
  army.status = 'marching';
}

function returnDestination(
  state: Readonly<GameState>,
  army: Readonly<GameState['armies'][keyof GameState['armies']]>,
) {
  return nearestOwnedCastleByTravelTime(
    state,
    army.clanId,
    army.posNodeId,
    state.castles[army.originCastleId]?.ownerClanId === army.clanId
      ? army.originCastleId
      : undefined,
  );
}

export function validateRecallArmy(
  state: Readonly<GameState>,
  cmd: CommandByType['recallArmy'],
): ValidationResult {
  const army = state.armies[cmd.armyId];
  if (!army || army.clanId !== cmd.clanId) return reject(REJECT_REASONS.notOwner);
  if (army.status === 'routed' || army.status === 'engaged')
    return reject(REJECT_REASONS.officerBusy);
  return returnDestination(state, army) ? ok : reject(REJECT_REASONS.pathBlocked);
}

export function applyRecallArmy(
  state: GameState,
  cmd: CommandByType['recallArmy'],
  emit: EmitFn,
): void {
  const army = state.armies[cmd.armyId]!;
  const destination = returnDestination(state, army)!;
  for (const event of detachArmyFromSiege(state, army.id)) emit(event);
  if (army.posNodeId === destination.castle.id) {
    destination.castle.soldiers += army.soldiers;
    destination.castle.food += army.food;
    for (const officerId of [army.leaderId, ...army.deputyIds]) {
      const officer = state.officers[officerId]!;
      officer.armyId = null;
      officer.locationCastleId = destination.castle.id;
    }
    delete state.armies[army.id];
    emit({
      type: 'army.returned',
      day: state.time.day,
      clanIds: [army.clanId],
      armyId: army.id,
      clanId: army.clanId,
      castleId: destination.castle.id,
      soldiersReturned: army.soldiers,
      leaderId: army.leaderId,
    });
    return;
  }
  const path = destination.path;
  army.mission = 'return';
  army.status = 'returning';
  army.targetNodeId = destination.castle.id;
  army.path = path.nodes;
  army.pathCursor = 0;
  army.edgeProgressDays = 0;
  army.edgeCostDays = path.nodes.length > 1 ? edgeCost(state, path.nodes[0]!, path.nodes[1]!) : 0;
}

export function validateSetAutoReturn(
  state: Readonly<GameState>,
  cmd: CommandByType['setAutoReturn'],
): ValidationResult {
  const army = state.armies[cmd.armyId];
  if (!army || army.clanId !== cmd.clanId) return reject(REJECT_REASONS.notOwner);
  return army.status === 'routed' ? reject(REJECT_REASONS.officerBusy) : ok;
}
export function applySetAutoReturn(state: GameState, cmd: CommandByType['setAutoReturn']): void {
  state.armies[cmd.armyId]!.autoReturn = cmd.enabled;
}

export function validateSetSiegeMode(
  state: Readonly<GameState>,
  cmd: CommandByType['setSiegeMode'],
): ValidationResult {
  const siege = state.sieges[cmd.siegeId];
  if (!siege || siege.attackerClanId !== cmd.clanId) return reject(REJECT_REASONS.notOwner);
  if (cmd.mode === 'encircle') {
    const troops = siege.attackerArmyIds.reduce(
      (sum, armyId) => sum + (state.armies[armyId]?.soldiers ?? 0),
      0,
    );
    const garrison = state.castles[siege.castleId]?.soldiers;
    if (garrison === undefined || troops < garrison * BAL.encircleRatio) {
      return reject(REJECT_REASONS.insufficientTroops);
    }
  }
  return ok;
}
export function applySetSiegeMode(state: GameState, cmd: CommandByType['setSiegeMode']): void {
  state.sieges[cmd.siegeId]!.mode = cmd.mode;
}
