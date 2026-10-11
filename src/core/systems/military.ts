import { BAL } from '../balance';
import { getEffectiveOfficerStat } from '../battleStats';
import { armyDailyFoodUse, armyFoodDays } from '../armyFood';
import { hasPolicy } from '../domestic';
import { traitModifier } from '../traits';
import { buildMapGraph } from '../state/mapGraph';
import type { Army, GameState, RoadEdge } from '../state/gameState';
import type { ArmyId, CastleId, ClanId, DistrictId, MapNodeId } from '../state/ids';
import type { GameEvent } from '../state/events';
import { computePath, getStance } from './pathfinding';
import {
  pursueRoutedArmies,
  recordFieldCombatParticipation,
  startFieldCombat,
} from './fieldCombat';
import { beginSiege, detachArmyFromSiege } from './siege';
import { releaseOfficerAssignments, releaseOrphanedCaptives } from './officers';
import { clearExtinctClanWork, collapseExtinctClanCourt } from './clanExtinction';
import { defaultDiplomacyRow, pairKey } from '../state/serialize';
import { nearestOwnedCastleByHops, nearestOwnedCastleByTravelTime } from './castleSelection';
import { taimeiEffects } from './events/taimei';
import { applyArmyReroute, armyPhysicalLeg, planArmyReroute, planArmyReturn } from './armyReroute';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function nodeOwner(state: Readonly<GameState>, nodeId: MapNodeId): ClanId | null {
  return (
    state.castles[nodeId as CastleId]?.ownerClanId ??
    state.districts[nodeId as DistrictId]?.ownerClanId ??
    null
  );
}

function edgeBetween(state: Readonly<GameState>, a: MapNodeId, b: MapNodeId): RoadEdge | undefined {
  return Object.values(state.roads).find(
    (edge) => (edge.a === a && edge.b === b) || (edge.a === b && edge.b === a),
  );
}

function baseEdgeCost(edge: RoadEdge): number {
  return edge.type === 'sea' ? edge.baseDays : edge.baseDays / BAL.roadGradeSpeedMult[edge.grade];
}

function isConquerable(state: Readonly<GameState>, clanId: ClanId, ownerId: ClanId): boolean {
  const stance = getStance(state, clanId, ownerId);
  return stance === 'war' || stance === 'neutral';
}

function isHostile(state: Readonly<GameState>, clanId: ClanId, otherId: ClanId): boolean {
  return getStance(state, clanId, otherId) === 'war';
}

function canEnterNode(
  state: Readonly<GameState>,
  clanId: ClanId,
  nodeId: MapNodeId,
  asTarget: boolean,
  viaSea = false,
): boolean {
  const owner = nodeOwner(state, nodeId);
  if (owner === null) return false;
  const stance = getStance(state, clanId, owner);
  if (stance === 'ceasefire') return false;
  if (viaSea) return true;
  if (state.districts[nodeId as DistrictId]) return true;
  return stance === 'own' || stance === 'friendly' || asTarget;
}

function markHostile(state: GameState, a: ClanId, b: ClanId): void {
  const key = pairKey(a, b);
  const row = state.diplomacy.rows[key] ?? defaultDiplomacyRow(a, b);
  row.lastHostileDay = state.time.day;
  state.diplomacy.rows[key] = row;
}

function nearestOwnedCastle(state: GameState, army: Army) {
  return planArmyReturn(state, army);
}

function disbandArmy(state: GameState, army: Army, events: GameEvent[]): void {
  const ownedCastles = Object.values(state.castles)
    .filter((castle) => castle.ownerClanId === army.clanId)
    .sort((a, b) => a.id.localeCompare(b.id));
  const refuge =
    nearestOwnedCastleByTravelTime(state, army.clanId, army.posNodeId)?.castle ?? ownedCastles[0];
  for (const officerId of [army.leaderId, ...army.deputyIds]) {
    const officer = state.officers[officerId];
    if (!officer) continue;
    officer.armyId = null;
    officer.locationCastleId = refuge?.id ?? officer.debutCastleId;
  }
  events.push(...detachArmyFromSiege(state, army.id));
  delete state.armies[army.id];
  if (ownedCastles.length > 0) return;
  const clan = state.clans[army.clanId];
  if (clan?.alive) {
    clan.alive = false;
    clan.destroyedDay = state.time.day;
    clearExtinctClanWork(state, clan.id);
    for (const other of Object.values(state.armies)) {
      if (other.clanId === army.clanId) {
        events.push(...detachArmyFromSiege(state, other.id));
        delete state.armies[other.id];
      }
    }
    for (const officer of Object.values(state.officers)) {
      if (officer.status !== 'serving' || officer.clanId !== army.clanId) continue;
      events.push(...releaseOfficerAssignments(state, officer.id));
      officer.status = 'ronin';
      officer.clanId = null;
      officer.armyId = null;
      officer.locationCastleId ??= officer.debutCastleId;
    }
    events.push(...releaseOrphanedCaptives(state)); // 捕獲方滅亡 → 捕虜就地釋放（INV-18）
    collapseExtinctClanCourt(state, clan.id, (event) => events.push(event));
    events.push({
      type: 'clan.destroyed',
      day: state.time.day,
      clanIds: [army.clanId],
      clanId: army.clanId,
      byClanId: null,
    });
  }
}

export function setReturning(
  state: GameState,
  army: Army,
  routed: boolean,
  events: GameEvent[],
): void {
  const target = routed
    ? nearestOwnedCastleByHops(state, army.clanId, army.posNodeId)
    : nearestOwnedCastle(state, army);
  if (!target) {
    if (Object.values(state.castles).some((castle) => castle.ownerClanId === army.clanId)) {
      army.status = 'holding';
      events.push({
        type: 'army.blocked',
        day: state.time.day,
        clanIds: [army.clanId],
        armyId: army.id,
        clanId: army.clanId,
        nodeId: army.posNodeId,
        leaderId: army.leaderId,
      });
    } else {
      disbandArmy(state, army, events);
    }
    return;
  }
  events.push(...detachArmyFromSiege(state, army.id));
  army.mission = 'return';
  army.status = routed ? 'routed' : 'returning';
  army.targetNodeId = target.castle.id;
  const route =
    armyPhysicalLeg(army) !== null
      ? planArmyReroute(state, army, target.castle.id)
      : {
          nodes: target.path.nodes,
          progress: 0,
          cost: 0,
          reversingEnd: null,
          totalDays: target.path.totalDays,
        };
  if (route === null) {
    army.status = 'holding';
    return;
  }
  applyArmyReroute(army, route);
  if (routed)
    events.push({
      type: 'army.routed',
      day: state.time.day,
      clanIds: [army.clanId],
      armyId: army.id,
      clanId: army.clanId,
      nodeId: army.posNodeId,
      leaderId: army.leaderId,
    });
}

function returnIntoCastle(
  state: GameState,
  army: Army,
  castleId: CastleId,
  events: GameEvent[],
): void {
  const castle = state.castles[castleId];
  if (!castle || castle.ownerClanId !== army.clanId) {
    setReturning(state, army, army.status === 'routed', events);
    return;
  }
  castle.soldiers += army.soldiers;
  castle.food += army.food;
  for (const officerId of [army.leaderId, ...army.deputyIds]) {
    const officer = state.officers[officerId];
    if (!officer) continue;
    officer.armyId = null;
    officer.locationCastleId = castle.id;
  }
  events.push({
    type: 'army.returned',
    day: state.time.day,
    clanIds: [army.clanId],
    armyId: army.id,
    clanId: army.clanId,
    castleId,
    soldiersReturned: army.soldiers,
    leaderId: army.leaderId,
  });
  delete state.armies[army.id];
}

function supply(state: GameState, army: Army, events: GameEvent[]): void {
  const leader = state.officers[army.leaderId];
  const moraleLossMult = leader ? traitModifier(leader, 'battle.moraleLossMult').mult : 1;
  const previous = army.food;
  army.food = Math.max(0, army.food - armyDailyFoodUse(state, army));
  const castle = state.castles[army.posNodeId as CastleId];
  if (castle && armyPhysicalLeg(army) === null && army.reversingEdgeEndNodeId == null) {
    const stance = getStance(state, army.clanId, castle.ownerClanId);
    if (stance === 'own' || stance === 'friendly') {
      const target = Math.ceil(army.soldiers * BAL.fieldFoodPerSoldierDaily * BAL.defaultCarryDays);
      const refill = Math.min(Math.max(0, target - army.food), castle.food);
      army.food += refill;
      castle.food -= refill;
    }
  }
  if (army.food === 0) {
    if (previous > 0)
      events.push({
        type: 'army.starving',
        day: state.time.day,
        clanIds: [army.clanId],
        armyId: army.id,
        clanId: army.clanId,
        leaderId: army.leaderId,
      });
    if (army.status === 'routed') return;
    army.morale = Math.round(Math.max(0, army.morale - BAL.noFoodMoraleDaily * moraleLossMult));
    army.soldiers = Math.max(0, army.soldiers - Math.ceil(army.soldiers * BAL.noFoodDesertionRate));
  }
  if (army.status === 'routed') return;
  const owner = nodeOwner(state, army.posNodeId);
  if (owner && isHostile(state, army.clanId, owner))
    army.morale = Math.round(Math.max(0, army.morale - BAL.moraleEnemyLandDaily * moraleLossMult));
  if (
    army.morale <= BAL.moraleBreakThreshold ||
    army.soldiers < army.initialTroops * BAL.routTroopRatio
  )
    setReturning(state, army, true, events);
}

function subjugate(state: GameState, army: Army, events: GameEvent[], skipProgress: boolean): void {
  const district = state.districts[army.posNodeId as DistrictId];
  if (!district || !isConquerable(state, army.clanId, district.ownerClanId)) {
    army.status = 'marching';
    return;
  }
  const leader = state.officers[army.leaderId];
  const base =
    BAL.subjugateDaysBase +
    Math.floor(district.kokudaka / BAL.subjugateKokuPerExtraDay) -
    ((leader ? getEffectiveOfficerStat(leader, 'ldr') : 0) >= BAL.subjugateLdrBonusThreshold
      ? 1
      : 0);
  const traitMult = leader ? traitModifier(leader, 'march.subjugateTimeMult').mult : 1;
  const daysRequired = clamp(
    Math.ceil(base * traitMult),
    BAL.subjugateDaysMin,
    BAL.subjugateDaysMax,
  );
  if (!district.subjugation || district.subjugation.clanId !== army.clanId)
    district.subjugation = { clanId: army.clanId, progress: 0, daysRequired };
  else district.subjugation.daysRequired = daysRequired;
  if (skipProgress) return;
  district.subjugation.progress += 100 / district.subjugation.daysRequired;
  if (district.subjugation.progress < 100) return;
  const fromClanId = district.ownerClanId;
  district.ownerClanId = army.clanId;
  district.stewardId = null;
  district.publicOrder = Math.max(0, district.publicOrder - BAL.subjugateSecurityHit);
  district.subjugation = null;
  state.meta.territoryChangedToday = true;
  army.status = army.pathCursor < army.path.length - 1 ? 'marching' : 'holding';
  events.push({
    type: 'district.subjugated',
    day: state.time.day,
    clanIds: [fromClanId, army.clanId],
    districtId: district.id,
    fromClanId,
    toClanId: army.clanId,
    armyId: army.id,
    leaderId: army.leaderId,
  });
}

function suppressUprising(state: GameState, army: Army, events: GameEvent[]): void {
  const district = state.districts[army.posNodeId as DistrictId];
  if (!district?.uprising || district.ownerClanId !== army.clanId) return;
  district.uprising = null;
  district.publicOrder = Math.max(district.publicOrder, BAL.securityAfterSuppress);
  events.push({
    type: 'uprising.ended',
    day: state.time.day,
    clanIds: [army.clanId],
    districtId: district.id,
    resolved: 'suppressed',
  });
}

function onArrive(state: GameState, army: Army, events: GameEvent[]): void {
  suppressUprising(state, army, events);
  const completedTarget =
    army.pathCursor >= army.path.length - 1 && army.targetNodeId === army.posNodeId;
  if (completedTarget) {
    events.push({
      type: 'army.arrived',
      day: state.time.day,
      clanIds: [army.clanId],
      armyId: army.id,
      clanId: army.clanId,
      nodeId: army.posNodeId,
      leaderId: army.leaderId,
    });
  }
  if (army.mission === 'return' && army.targetNodeId === army.posNodeId) {
    returnIntoCastle(state, army, army.posNodeId as CastleId, events);
    return;
  }
  const district = state.districts[army.posNodeId as DistrictId];
  if (
    district &&
    isConquerable(state, army.clanId, district.ownerClanId) &&
    army.status !== 'routed' &&
    army.status !== 'returning'
  ) {
    if (!isHostile(state, army.clanId, district.ownerClanId)) {
      markHostile(state, army.clanId, district.ownerClanId);
    }
    army.status = 'subjugating';
    return;
  }
  const castle = state.castles[army.posNodeId as CastleId];
  if (castle && army.pathCursor >= army.path.length - 1 && castle.ownerClanId === army.clanId) {
    const hostileSiege = Object.values(state.sieges).find(
      (siege) => siege.castleId === castle.id && siege.attackerClanId !== army.clanId,
    );
    if (hostileSiege) {
      army.status = 'holding';
      return;
    }
    returnIntoCastle(state, army, castle.id, events);
    return;
  }
  if (castle && army.mission === 'conquer' && castle.ownerClanId !== army.clanId) {
    events.push(...beginSiege(state, castle.id, army.id));
    return;
  }
  if (army.pathCursor >= army.path.length - 1) {
    army.status = 'holding';
    if (army.autoReturn && army.mission === 'march') setReturning(state, army, false, events);
  }
}

interface MovementTrace {
  armyId: ArmyId;
  from: MapNodeId;
  to: MapNodeId;
  startT: number;
  endT: number;
}

function movementSpeed(
  state: Readonly<GameState>,
  army: Readonly<Army>,
  edge: Readonly<RoadEdge>,
): number {
  const leader = state.officers[army.leaderId];
  let speed = leader
    ? traitModifier(leader, edge.type === 'sea' ? 'march.seaSpeedMult' : 'march.landSpeedMult').mult
    : 1;
  // Ordinary morale, retreat and taimei modifiers belong only to land edges (04 §5.3).
  // Preserve the separate, explicitly sea-specific primary-general trait hook.
  if (edge.type === 'land') {
    if (army.morale < BAL.marchLowMoraleThreshold) speed *= BAL.marchLowMoraleFactor;
    if (army.status === 'returning' || army.status === 'routed') speed *= BAL.retreatSpeedFactor;
    speed *= taimeiEffects(state, army.clanId).marchSpeedMult;
    if (hasPolicy(state, army.clanId, 'pol.tenmasei')) speed *= BAL.polTenmaseiMarchSpeedMult;
  }
  return clamp(speed, BAL.marchSpeedMin, BAL.marchSpeedMax);
}

function effectiveEdgeCost(
  state: Readonly<GameState>,
  army: Readonly<Army>,
  edge: Readonly<RoadEdge>,
  arrivedViaSea?: boolean,
): number {
  const previousNode = army.pathCursor > 0 ? army.path[army.pathCursor - 1] : undefined;
  const previousEdge =
    previousNode === undefined ? undefined : edgeBetween(state, previousNode, army.posNodeId);
  const previousWasSea = arrivedViaSea ?? previousEdge?.type === 'sea';
  const embark = edge.type === 'sea' && !previousWasSea ? BAL.seaEmbarkDays : 0;
  return baseEdgeCost(edge) + embark;
}

function moveArmy(
  state: GameState,
  army: Army,
  events: GameEvent[],
  arrivedToday: Set<ArmyId>,
  traces: MovementTrace[],
  onEnter?: (signal: import('./ai/types').AiSignal) => void,
): void {
  if (!['marching', 'returning', 'routed'].includes(army.status)) return;
  if (army.status === 'routed')
    army.soldiers = Math.max(0, army.soldiers - Math.ceil(army.soldiers * BAL.routDailyLossRate));
  if (army.soldiers <= 0) {
    disbandArmy(state, army, events);
    return;
  }
  let remainingReverseBudget: number | null = null;
  let reverseArrivedViaSea: boolean | undefined;
  const reverseEnd = army.reversingEdgeEndNodeId;
  if (reverseEnd != null) {
    const reverseEdge = edgeBetween(state, army.posNodeId, reverseEnd);
    if (!reverseEdge) {
      army.status = 'holding';
      return;
    }
    if (
      !canEnterNode(
        state,
        army.clanId,
        army.posNodeId,
        army.posNodeId === army.targetNodeId,
        reverseEdge.type === 'sea',
      ) ||
      (army.targetNodeId !== null && !canEnterNode(state, army.clanId, army.targetNodeId, true))
    ) {
      army.status = 'holding';
      events.push({
        type: 'army.blocked',
        day: state.time.day,
        clanIds: [army.clanId],
        armyId: army.id,
        clanId: army.clanId,
        nodeId: army.posNodeId,
        leaderId: army.leaderId,
      });
      return;
    }
    const speed = movementSpeed(state, army, reverseEdge);
    const before = army.edgeProgressDays;
    if (before > speed) {
      army.edgeProgressDays -= speed;
      traces.push({
        armyId: army.id,
        from: army.posNodeId,
        to: reverseEnd,
        startT: before / army.edgeCostDays,
        endT: army.edgeProgressDays / army.edgeCostDays,
      });
      return;
    }
    remainingReverseBudget = speed - before;
    traces.push({
      armyId: army.id,
      from: army.posNodeId,
      to: reverseEnd,
      startT: before / army.edgeCostDays,
      endT: 0,
    });
    reverseArrivedViaSea = reverseEdge.type === 'sea';
    army.edgeProgressDays = 0;
    army.edgeCostDays = 0;
    delete army.reversingEdgeEndNodeId;
    arrivedToday.add(army.id);
    // This is an actual arrival BACK at the last-arrived node, not at the unvisited endpoint.
    onArrive(state, army, events);
    if (!state.armies[army.id] || !['marching', 'returning', 'routed'].includes(army.status))
      return;
  }
  if (army.pathCursor >= army.path.length - 1) {
    onArrive(state, army, events);
    return;
  }
  let next = army.path[army.pathCursor + 1]!;
  let edge = edgeBetween(state, army.posNodeId, next);
  if (!edge) {
    army.status = 'holding';
    return;
  }
  const oldPreviousNode = army.pathCursor > 0 ? army.path[army.pathCursor - 1] : undefined;
  const arrivedViaSea =
    reverseArrivedViaSea ??
    (oldPreviousNode !== undefined &&
      edgeBetween(state, oldPreviousNode, army.posNodeId)?.type === 'sea');
  const nextLegal = canEnterNode(
    state,
    army.clanId,
    next,
    next === army.targetNodeId,
    edge.type === 'sea',
  );
  const targetLegal =
    army.targetNodeId === null || canEnterNode(state, army.clanId, army.targetNodeId, true);
  if (!nextLegal || !targetLegal) {
    army.status = 'holding';
    events.push({
      type: 'army.blocked',
      day: state.time.day,
      clanIds: [army.clanId],
      armyId: army.id,
      clanId: army.clanId,
      nodeId: army.posNodeId,
      leaderId: army.leaderId,
    });
    return;
  }
  const speed = remainingReverseBudget ?? movementSpeed(state, army, edge);
  if (army.edgeCostDays <= 0)
    army.edgeCostDays = effectiveEdgeCost(state, army, edge, arrivedViaSea);
  let startT = army.edgeProgressDays / army.edgeCostDays;
  army.edgeProgressDays += speed;
  while (army.edgeProgressDays >= army.edgeCostDays) {
    const from = army.posNodeId;
    army.edgeProgressDays -= army.edgeCostDays;
    army.pathCursor += 1;
    army.posNodeId = next;
    const ownerClanId =
      state.castles[next as CastleId]?.ownerClanId ??
      state.districts[next as DistrictId]?.ownerClanId;
    if (ownerClanId)
      onEnter?.({
        type: 'army.enteredTerritory',
        armyId: army.id,
        nodeId: next,
        clanId: army.clanId,
        ownerClanId,
      });
    traces.push({ armyId: army.id, from, to: next, startT, endT: 1 });
    arrivedToday.add(army.id);
    onArrive(state, army, events);
    if (!state.armies[army.id] || !['marching', 'returning', 'routed'].includes(army.status)) {
      if (state.armies[army.id]) army.edgeProgressDays = 0;
      return;
    }
    if (army.pathCursor >= army.path.length - 1) {
      army.edgeProgressDays = 0;
      return;
    }
    next = army.path[army.pathCursor + 1]!;
    edge = edgeBetween(state, army.posNodeId, next);
    if (!edge) {
      army.status = 'holding';
      army.edgeProgressDays = 0;
      return;
    }
    army.edgeCostDays = effectiveEdgeCost(state, army, edge);
    startT = 0;
  }
}

function relocateForEncounter(state: GameState, army: Army, nodeId: MapNodeId): void {
  const targetNodeId = army.targetNodeId;
  const path =
    targetNodeId === null || targetNodeId === nodeId
      ? { found: true as const, nodes: [nodeId] }
      : computePath(state, buildMapGraph(state.castles, state.districts, state.roads), {
          clanId: army.clanId,
          from: nodeId,
          to: targetNodeId,
          speedFactor: 1,
        });
  army.posNodeId = nodeId;
  army.path = path.found ? path.nodes : [nodeId];
  army.pathCursor = 0;
  army.edgeProgressDays = 0;
  army.edgeCostDays = 0;
  delete army.reversingEdgeEndNodeId;
}

function detectEncounters(
  state: GameState,
  traces: readonly MovementTrace[],
  initialLegs: ReadonlyMap<
    ArmyId,
    { from: MapNodeId; end: MapNodeId | undefined; progress: number; cost: number }
  >,
  arrivedToday: ReadonlySet<ArmyId>,
): GameEvent[] {
  const events: GameEvent[] = [];
  for (const siege of Object.values(state.sieges).sort((a, b) => a.id.localeCompare(b.id))) {
    if (siege.interrupted) continue;
    const attackers = siege.attackerArmyIds
      .map((armyId) => state.armies[armyId])
      .filter((army): army is Army => army?.status === 'sieging');
    const castleOwnerId = state.castles[siege.castleId]!.ownerClanId;
    const relief = Object.values(state.armies)
      .filter(
        (army) =>
          army.posNodeId === siege.castleId &&
          armyPhysicalLeg(army) === null &&
          !siege.attackerArmyIds.includes(army.id),
      )
      .filter((army) => army.status !== 'routed' && army.status !== 'engaged')
      .filter((army) => {
        const stanceToOwner = getStance(state, army.clanId, castleOwnerId);
        const stanceToAttacker = getStance(state, army.clanId, siege.attackerClanId);
        return (
          (stanceToOwner === 'own' || stanceToOwner === 'friendly') &&
          (stanceToAttacker === 'neutral' || stanceToAttacker === 'war')
        );
      })
      .sort((a, b) => a.id.localeCompare(b.id));
    if (attackers.length === 0 || relief.length === 0) continue;
    for (const army of relief) {
      if (!isHostile(state, siege.attackerClanId, army.clanId)) {
        markHostile(state, siege.attackerClanId, army.clanId);
      }
    }
    const attackersResident = attackers.some((army) => !arrivedToday.has(army.id));
    const reliefResident = relief.some((army) => !arrivedToday.has(army.id));
    const attackersMainId = attackers.map((army) => army.id).sort()[0]!;
    const reliefMainId = relief.map((army) => army.id).sort()[0]!;
    const first =
      attackersResident && !reliefResident
        ? attackers
        : reliefResident && !attackersResident
          ? relief
          : attackersMainId < reliefMainId
            ? attackers
            : relief;
    const challenger = first === attackers ? relief : attackers;
    const combatEvents = startFieldCombat(
      state,
      siege.castleId,
      first.map((army) => army.id),
      challenger.map((army) => army.id),
    );
    if (combatEvents.length === 0) continue;
    siege.interrupted = true;
    events.push({
      type: 'siege.relief',
      day: state.time.day,
      clanIds: [siege.attackerClanId, state.castles[siege.castleId]!.ownerClanId],
      siegeId: siege.id,
      castleId: siege.castleId,
    });
    events.push(...combatEvents);
  }
  for (const combat of Object.values(state.fieldCombats).sort((a, b) => a.id.localeCompare(b.id))) {
    const candidates = Object.values(state.armies)
      .filter(
        (army) =>
          army.posNodeId === combat.nodeId &&
          armyPhysicalLeg(army) === null &&
          army.status !== 'engaged' &&
          army.status !== 'routed',
      )
      .sort((a, b) => a.id.localeCompare(b.id));
    for (const army of candidates) {
      const joins = (sideClanIds: readonly ClanId[], enemyClanIds: readonly ClanId[]) =>
        sideClanIds.some(
          (clanId) =>
            clanId === army.clanId || getStance(state, army.clanId, clanId) === 'friendly',
        ) && enemyClanIds.every((clanId) => isHostile(state, army.clanId, clanId));
      const joinsA = joins(combat.sideA.clanIds, combat.sideB.clanIds);
      const joinsB = joins(combat.sideB.clanIds, combat.sideA.clanIds);
      if (joinsA === joinsB) continue;
      const side = joinsA ? combat.sideA : combat.sideB;
      recordFieldCombatParticipation(side, army);
      side.armyIds.push(army.id);
      side.armyIds.sort();
      if (!side.clanIds.includes(army.clanId)) side.clanIds.push(army.clanId);
      side.initialTroops += army.soldiers;
      army.status = 'engaged';
    }
  }
  const byNode = new Map<MapNodeId, Army[]>();
  for (const army of Object.values(state.armies)) {
    if (army.status === 'routed' || army.status === 'engaged') continue;
    if (armyPhysicalLeg(army) !== null) continue;
    const bucket = byNode.get(army.posNodeId) ?? [];
    bucket.push(army);
    byNode.set(army.posNodeId, bucket);
  }
  for (const [nodeId, armies] of [...byNode].sort(([a], [b]) => a.localeCompare(b))) {
    const groups = [...new Set(armies.map((army) => army.clanId))]
      .map((clanId) => {
        const clanArmies = armies
          .filter((army) => army.clanId === clanId)
          .sort((a, b) => a.id.localeCompare(b.id));
        return {
          clanId,
          armies: clanArmies,
          soldiers: clanArmies.reduce((sum, army) => sum + army.soldiers, 0),
        };
      })
      .sort((a, b) => b.soldiers - a.soldiers || a.clanId.localeCompare(b.clanId));
    let engaged = false;
    for (let i = 0; i < groups.length && !engaged; i += 1)
      for (let j = i + 1; j < groups.length; j += 1) {
        const a = groups[i]!;
        const b = groups[j]!;
        if (!isHostile(state, a.clanId, b.clanId)) continue;
        const aResident = a.armies.some((army) => !arrivedToday.has(army.id));
        const bResident = b.armies.some((army) => !arrivedToday.has(army.id));
        const first =
          aResident && !bResident
            ? a
            : bResident && !aResident
              ? b
              : a.armies[0]!.id < b.armies[0]!.id
                ? a
                : b;
        const challenger = first === a ? b : a;
        const firstArmies = [...first.armies];
        const challengerArmies = [...challenger.armies];
        for (const ally of groups) {
          if (ally === first || ally === challenger) continue;
          const joinsFirst =
            getStance(state, ally.clanId, first.clanId) === 'friendly' &&
            challengerArmies.every((army) => isHostile(state, ally.clanId, army.clanId));
          const joinsChallenger =
            getStance(state, ally.clanId, challenger.clanId) === 'friendly' &&
            firstArmies.every((army) => isHostile(state, ally.clanId, army.clanId));
          if (joinsFirst && !joinsChallenger) firstArmies.push(...ally.armies);
          else if (joinsChallenger && !joinsFirst) challengerArmies.push(...ally.armies);
        }
        events.push(
          ...startFieldCombat(
            state,
            nodeId,
            firstArmies.map((army) => army.id),
            challengerArmies.map((army) => army.id),
          ),
        );
        engaged = true;
        break;
      }
  }
  const edgeArmies = Object.values(state.armies)
    .filter(
      (army) =>
        army.status !== 'routed' &&
        army.status !== 'engaged' &&
        (army.pathCursor < army.path.length - 1 || army.reversingEdgeEndNodeId != null),
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  for (let i = 0; i < edgeArmies.length; i += 1)
    for (let j = i + 1; j < edgeArmies.length; j += 1) {
      const a = edgeArmies[i]!;
      const b = edgeArmies[j]!;
      if (!isHostile(state, a.clanId, b.clanId)) continue;
      const aNext = a.reversingEdgeEndNodeId ?? a.path[a.pathCursor + 1]!;
      const bNext = b.reversingEdgeEndNodeId ?? b.path[b.pathCursor + 1]!;
      const sameEdge =
        (a.posNodeId === b.posNodeId && aNext === bNext) ||
        (a.posNodeId === bNext && b.posNodeId === aNext);
      if (!sameEdge || a.edgeCostDays <= 0 || b.edgeCostDays <= 0) continue;
      const canonicalFrom = a.posNodeId < aNext ? a.posNodeId : aNext;
      const position = (army: Army, progress: number) =>
        army.posNodeId === canonicalFrom
          ? progress / army.edgeCostDays
          : 1 - progress / army.edgeCostDays;
      const direction = (army: Army) =>
        (army.posNodeId === canonicalFrom ? 1 : -1) *
        (army.reversingEdgeEndNodeId != null ? -1 : 1);
      const initialPosition = (army: Army) => {
        const initial = initialLegs.get(army.id);
        const endpoint = army.reversingEdgeEndNodeId ?? army.path[army.pathCursor + 1];
        if (
          !initial ||
          initial.cost <= 0 ||
          !(
            (initial.from === army.posNodeId && initial.end === endpoint) ||
            (initial.end === army.posNodeId && initial.from === endpoint)
          )
        )
          return position(army, 0);
        return initial.from === canonicalFrom
          ? initial.progress / initial.cost
          : 1 - initial.progress / initial.cost;
      };
      const aStart = initialPosition(a),
        bStart = initialPosition(b);
      const aEnd = position(a, a.edgeProgressDays),
        bEnd = position(b, b.edgeProgressDays);
      const opposite =
        direction(a) !== direction(b) &&
        ((aStart <= bStart && aEnd >= bEnd) || (bStart <= aStart && bEnd >= aEnd));
      const sameDirection = direction(a) === direction(b);
      const rear =
        sameDirection && (aStart - bStart) * direction(a) < 0
          ? a
          : sameDirection && (bStart - aStart) * direction(a) < 0
            ? b
            : null;
      const front = rear === a ? b : rear === b ? a : null;
      const caught =
        rear !== null &&
        front !== null &&
        (position(rear, rear.edgeProgressDays) - position(front, front.edgeProgressDays)) *
          direction(rear) >=
          0;
      if (!opposite && !caught) continue;
      const battleNode = a.posNodeId < b.posNodeId ? a.posNodeId : b.posNodeId;
      events.push(...detachArmyFromSiege(state, a.id), ...detachArmyFromSiege(state, b.id));
      relocateForEncounter(state, a, battleNode);
      relocateForEncounter(state, b, battleNode);
      const sideA = caught ? front : a.id < b.id ? a : b;
      const sideB = sideA === a ? b : a;
      events.push(...startFieldCombat(state, battleNode, [sideA.id], [sideB.id]));
    }
  const handled = new Set<ArmyId>();
  const sortedTraces = [...traces].sort(
    (a, b) => a.armyId.localeCompare(b.armyId) || a.from.localeCompare(b.from),
  );
  for (let i = 0; i < sortedTraces.length; i += 1)
    for (let j = i + 1; j < sortedTraces.length; j += 1) {
      const aTrace = sortedTraces[i]!;
      const bTrace = sortedTraces[j]!;
      if (handled.has(aTrace.armyId) || handled.has(bTrace.armyId)) continue;
      const sameTraceEdge =
        (aTrace.from === bTrace.to && aTrace.to === bTrace.from) ||
        (aTrace.from === bTrace.from && aTrace.to === bTrace.to);
      if (!sameTraceEdge) continue;
      const aStart = aTrace.startT,
        aEnd = aTrace.endT;
      const bStart = aTrace.from === bTrace.from ? bTrace.startT : 1 - bTrace.startT;
      const bEnd = aTrace.from === bTrace.from ? bTrace.endT : 1 - bTrace.endT;
      if (
        (aEnd - aStart) * (bEnd - bStart) >= 0 ||
        Math.max(Math.min(aStart, aEnd), Math.min(bStart, bEnd)) >
          Math.min(Math.max(aStart, aEnd), Math.max(bStart, bEnd))
      )
        continue;
      const a = state.armies[aTrace.armyId];
      const b = state.armies[bTrace.armyId];
      if (
        !a ||
        !b ||
        a.status === 'engaged' ||
        b.status === 'engaged' ||
        a.status === 'routed' ||
        b.status === 'routed'
      )
        continue;
      if (a.clanId === b.clanId || !isHostile(state, a.clanId, b.clanId)) continue;
      const battleNode = aTrace.from < aTrace.to ? aTrace.from : aTrace.to;
      events.push(...detachArmyFromSiege(state, a.id), ...detachArmyFromSiege(state, b.id));
      relocateForEncounter(state, a, battleNode);
      relocateForEncounter(state, b, battleNode);
      const combatEvents = startFieldCombat(state, battleNode, [a.id], [b.id]);
      if (combatEvents.length > 0) {
        handled.add(a.id);
        handled.add(b.id);
        events.push(...combatEvents);
      }
    }
  const routedByNode = new Map<MapNodeId, Army[]>();
  for (const army of Object.values(state.armies)) {
    if (army.status !== 'routed' || armyPhysicalLeg(army) !== null) continue;
    const bucket = routedByNode.get(army.posNodeId) ?? [];
    bucket.push(army);
    routedByNode.set(army.posNodeId, bucket);
  }
  for (const [nodeId, routed] of [...routedByNode].sort(([a], [b]) => a.localeCompare(b))) {
    const winners = Object.values(state.armies)
      .filter(
        (army) =>
          army.posNodeId === nodeId &&
          armyPhysicalLeg(army) === null &&
          army.status !== 'routed' &&
          army.status !== 'engaged' &&
          arrivedToday.has(army.id),
      )
      .filter((army) => routed.some((loser) => isHostile(state, army.clanId, loser.clanId)))
      .sort((a, b) => a.id.localeCompare(b.id));
    for (const loser of routed.sort((a, b) => a.id.localeCompare(b.id))) {
      const eligibleWinners = winners.filter((winner) =>
        winner.pursuitEligibleArmyIds.includes(loser.id),
      );
      if (eligibleWinners.length > 0) {
        events.push(...pursueRoutedArmies(state, eligibleWinners, [loser]));
      }
    }
  }
  return events;
}

function lowFoodAutoReturnAllowed(state: Readonly<GameState>, army: Readonly<Army>): boolean {
  if (army.status !== 'sieging' || army.siegeId === null) return true;
  const siege = state.sieges[army.siegeId];
  const castle = siege ? state.castles[siege.castleId] : undefined;
  if (!castle) return true;
  return (
    castle.morale > 100 * BAL.autoReturnSiegeMoraleMinRatio &&
    castle.durability > castle.maxDurability * BAL.autoReturnSiegeDurabilityMinRatio
  );
}

export function militaryMovementSystem(
  state: GameState,
  onEnter?: (signal: import('./ai/types').AiSignal) => void,
): GameEvent[] {
  const events: GameEvent[] = [];
  const arrivedToday = new Set<ArmyId>();
  const traces: MovementTrace[] = [];
  const initialLegs = new Map(
    Object.values(state.armies).map((army) => [
      army.id,
      {
        from: army.posNodeId,
        end: army.reversingEdgeEndNodeId ?? army.path[army.pathCursor + 1],
        progress: army.edgeProgressDays,
        cost: army.edgeCostDays,
      },
    ]),
  );
  const progressedSubjugations = new Set<DistrictId>();
  for (const id of Object.keys(state.armies).sort()) {
    const army = state.armies[id as ArmyId];
    if (!army) continue;
    supply(state, army, events);
    if (!state.armies[army.id]) continue;
    const missionComplete =
      army.status === 'holding' &&
      army.targetNodeId !== null &&
      army.posNodeId === army.targetNodeId &&
      armyPhysicalLeg(army) === null &&
      (state.castles[army.targetNodeId as CastleId]?.ownerClanId === army.clanId ||
        state.districts[army.targetNodeId as DistrictId]?.ownerClanId === army.clanId);
    const lowFood = armyFoodDays(state, army) <= BAL.autoReturnFoodDays;
    if (
      army.autoReturn &&
      army.status !== 'routed' &&
      army.status !== 'returning' &&
      (missionComplete || (lowFood && lowFoodAutoReturnAllowed(state, army)))
    )
      setReturning(state, army, false, events);
    if (army.status === 'subjugating') {
      const districtId = army.posNodeId as DistrictId;
      subjugate(state, army, events, progressedSubjugations.has(districtId));
      progressedSubjugations.add(districtId);
    } else {
      moveArmy(state, army, events, arrivedToday, traces, onEnter);
      if (state.armies[army.id]?.status === 'subjugating') subjugate(state, army, events, true);
    }
  }
  events.push(...detectEncounters(state, traces, initialLegs, arrivedToday));
  return events;
}
