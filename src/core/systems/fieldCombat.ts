import { BAL } from '../balance';
import { traitModifier } from '../traits';
import { defaultDiplomacyRow, pairKey } from '../state/serialize';
import type { Army, FieldCombat, FieldCombatSide, GameState } from '../state/gameState';
import type { ArmyId, CastleId, ClanId, MapNodeId } from '../state/ids';
import type { GameEvent } from '../state/events';
import { applyAwe } from './awe';
import { createRngStream } from '../rng';
import { dieOfficer } from './officers';
import { nearestOwnedCastleByHops, nearestOwnedCastleByTravelTime } from './castleSelection';

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function computeArmyPower(state: Readonly<GameState>, army: Readonly<Army>): number {
  const leader = state.officers[army.leaderId];
  const ldr = leader ? leader.ldr + leader.statGrowth.ldr : 0;
  return (
    army.soldiers *
    (1 + ldr * BAL.ldrCombatFactor) *
    (BAL.moraleFactorBase + army.morale / BAL.moraleFactorDivisor)
  );
}

function markHostile(state: GameState, a: ClanId, b: ClanId): void {
  const key = pairKey(a, b);
  const row = state.diplomacy.rows[key] ?? defaultDiplomacyRow(a, b);
  row.lastHostileDay = state.time.day;
  state.diplomacy.rows[key] = row;
}

function side(armies: readonly Army[]): FieldCombatSide {
  return {
    clanIds: [...new Set(armies.map((army) => army.clanId))].sort(),
    armyIds: armies.map((army) => army.id).sort(),
    initialTroops: armies.reduce((sum, army) => sum + army.soldiers, 0),
    cumulativeLosses: 0,
  };
}

export function startFieldCombat(
  state: GameState,
  nodeId: MapNodeId,
  firstArmyIds: readonly ArmyId[],
  secondArmyIds: readonly ArmyId[],
): GameEvent[] {
  const first = firstArmyIds.map((id) => state.armies[id]).filter((army): army is Army => !!army);
  const second = secondArmyIds.map((id) => state.armies[id]).filter((army): army is Army => !!army);
  if (first.length === 0 || second.length === 0) return [];
  const existing = Object.values(state.fieldCombats).find((combat) => combat.nodeId === nodeId);
  if (existing) return [];
  const id = `fc.${nodeId.replace(/[^a-zA-Z0-9_-]/g, '-')}-${state.time.day}`;
  const combat: FieldCombat = {
    id,
    nodeId,
    startedDay: state.time.day,
    sideA: side(first),
    sideB: side(second),
    kassenUsed: false,
    interrupted: false,
  };
  state.fieldCombats[id] = combat;
  for (const army of [...first, ...second]) army.status = 'engaged';
  for (const a of combat.sideA.clanIds)
    for (const b of combat.sideB.clanIds) markHostile(state, a, b);
  const events: GameEvent[] = [
    {
      type: 'battle.started',
      day: state.time.day,
      clanIds: [...combat.sideA.clanIds, ...combat.sideB.clanIds],
      battleId: id,
      nodeId,
      attackerClanId: combat.sideB.clanIds[0]!,
      defenderClanId: combat.sideA.clanIds[0]!,
    },
  ];
  if (
    BAL.featureKassenEnabled &&
    (combat.sideA.clanIds.includes(state.meta.playerClanId) ||
      combat.sideB.clanIds.includes(state.meta.playerClanId))
  ) {
    if (combat.sideA.initialTroops + combat.sideB.initialTroops >= BAL.kassenMinTroops) {
      events.push({
        type: 'battle.kassenAvailable',
        day: state.time.day,
        clanIds: [...combat.sideA.clanIds, ...combat.sideB.clanIds],
        battleId: id,
      });
    }
  }
  return events;
}

function combatArmies(state: GameState, sideValue: FieldCombatSide): Army[] {
  return sideValue.armyIds
    .map((id) => state.armies[id])
    .filter((army): army is Army => !!army && army.soldiers > 0 && army.status === 'engaged');
}

function attackTraitMult(state: Readonly<GameState>, armies: readonly Army[]): number {
  let mult = 1;
  for (const army of armies) {
    for (const officerId of [army.leaderId, ...army.deputyIds]) {
      const officer = state.officers[officerId];
      if (officer) mult *= traitModifier(officer, 'battle.attackMult').mult;
    }
  }
  return Math.min(BAL.traitCombatMultCap, mult);
}

function nodeOwner(state: Readonly<GameState>, nodeId: MapNodeId): ClanId | null {
  return (
    state.castles[nodeId as CastleId]?.ownerClanId ??
    state.districts[nodeId as keyof typeof state.districts]?.ownerClanId ??
    null
  );
}

function distributeLoss(armies: readonly Army[], total: number): number {
  const starting = armies.reduce((sum, army) => sum + army.soldiers, 0);
  if (starting <= 0 || total <= 0) return 0;
  let applied = 0;
  for (let index = 0; index < armies.length; index += 1) {
    const army = armies[index]!;
    const share =
      index === armies.length - 1
        ? total - applied
        : Math.round((total * army.soldiers) / starting);
    const actual = Math.min(army.soldiers, Math.max(0, share));
    army.soldiers -= actual;
    applied += actual;
  }
  return applied;
}

function routeArmy(state: GameState, army: Army, events: GameEvent[]): void {
  if (army.status === 'subjugating') {
    const district = state.districts[army.posNodeId as keyof typeof state.districts];
    if (district?.subjugation?.clanId === army.clanId) district.subjugation.progress = 0;
  }
  army.status = 'routed';
  army.mission = 'return';
  army.siegeId = null;
  army.battleId = null;
  const choice = nearestOwnedCastleByHops(state, army.clanId, army.posNodeId);
  if (choice) {
    army.targetNodeId = choice.castle.id;
    army.path = choice.path.nodes;
    army.pathCursor = 0;
    army.edgeProgressDays = 0;
    army.edgeCostDays = 0;
  } else {
    for (const officerId of [army.leaderId, ...army.deputyIds]) {
      const officer = state.officers[officerId];
      if (!officer) continue;
      officer.armyId = null;
      officer.locationCastleId = officer.debutCastleId;
      if (state.clans[army.clanId]?.leaderId !== officer.id) {
        officer.status = 'ronin';
        officer.clanId = null;
      }
    }
    delete state.armies[army.id];
  }
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

function checkRouts(state: GameState, armies: readonly Army[], events: GameEvent[]): void {
  for (const army of armies) {
    if (army.soldiers <= 0) continue;
    const leader = state.officers[army.leaderId];
    const threshold =
      BAL.moraleBreakThreshold +
      (leader ? traitModifier(leader, 'battle.routThresholdAdd').add : 0);
    if (army.morale <= threshold || army.soldiers < army.initialTroops * BAL.routTroopRatio)
      routeArmy(state, army, events);
  }
}

function restoreWinner(
  state: Readonly<GameState>,
  combat: Readonly<FieldCombat>,
  armies: readonly Army[],
  defeatedArmyIds: readonly ArmyId[],
): void {
  for (const army of armies) {
    army.morale = clamp(army.morale + BAL.moraleVictoryGain, 0, 100);
    army.status =
      army.siegeId !== null
        ? 'sieging'
        : state.districts[combat.nodeId as keyof typeof state.districts]?.ownerClanId !==
            army.clanId
          ? 'subjugating'
          : army.pathCursor < army.path.length - 1 || army.mission === 'conquer'
            ? 'marching'
            : 'holding';
    army.pursuitEligibleArmyIds = [...defeatedArmyIds];
  }
}

function pursue(
  state: GameState,
  winners: readonly Army[],
  losers: readonly Army[],
  events: GameEvent[],
): void {
  const damage = Math.round(
    winners
      .filter((army) => army.morale >= BAL.pursuitMoraleMin)
      .reduce((sum, army) => sum + computeArmyPower(state, army), 0) * BAL.pursuitDamageRate,
  );
  const routed = losers.filter((army) => army.status === 'routed');
  const before = new Map(routed.map((army) => [army.id, army.soldiers]));
  distributeLoss(routed, damage);
  const rng = createRngStream(state.rng, 'misc');
  for (const army of routed) {
    if ((before.get(army.id) ?? army.soldiers) <= army.soldiers) continue;
    for (const officerId of [army.leaderId, ...army.deputyIds]) {
      if (rng.chance(BAL.battleDeathChanceRout))
        events.push(...dieOfficer(state, officerId, army.posNodeId));
    }
  }
}

export function pursueRoutedArmies(
  state: GameState,
  winners: readonly Army[],
  routed: readonly Army[],
): GameEvent[] {
  const events: GameEvent[] = [];
  pursue(
    state,
    winners,
    routed.filter((army) => army.status === 'routed'),
    events,
  );
  removeDestroyedArmies(state, routed);
  return events;
}

function removeDestroyedArmies(state: GameState, armies: readonly Army[]): void {
  for (const army of armies) {
    if (army.soldiers > 0 || !state.armies[army.id]) continue;
    const castle =
      nearestOwnedCastleByTravelTime(state, army.clanId, army.posNodeId)?.castle ??
      Object.values(state.castles)
        .filter((candidate) => candidate.ownerClanId === army.clanId)
        .sort((a, b) => a.id.localeCompare(b.id))[0];
    for (const officerId of [army.leaderId, ...army.deputyIds]) {
      const officer = state.officers[officerId];
      if (!officer) continue;
      officer.armyId = null;
      officer.locationCastleId = castle?.id ?? officer.debutCastleId;
      if (!castle && state.clans[army.clanId]?.leaderId !== officer.id) {
        officer.status = 'ronin';
        officer.clanId = null;
      }
    }
    delete state.armies[army.id];
  }
}

export function fieldCombatSystem(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  for (const id of Object.keys(state.fieldCombats).sort()) {
    const combat = state.fieldCombats[id];
    if (!combat || combat.interrupted) continue;
    const a = combatArmies(state, combat.sideA);
    const b = combatArmies(state, combat.sideB);
    const aStart = a.reduce((sum, army) => sum + army.soldiers, 0);
    const bStart = b.reduce((sum, army) => sum + army.soldiers, 0);
    const owner = nodeOwner(state, combat.nodeId);
    const lossA = Math.round(
      b.reduce((sum, army) => sum + computeArmyPower(state, army), 0) *
        BAL.fieldCombatDailyLossRate *
        (owner !== null && combat.sideA.clanIds.includes(owner) ? BAL.homeGroundLossMult : 1) *
        (b.length >= 2 && a.length === 1 ? BAL.pincerMult : 1) *
        attackTraitMult(state, b),
    );
    const lossB = Math.round(
      a.reduce((sum, army) => sum + computeArmyPower(state, army), 0) *
        BAL.fieldCombatDailyLossRate *
        (owner !== null && combat.sideB.clanIds.includes(owner) ? BAL.homeGroundLossMult : 1) *
        (a.length >= 2 && b.length === 1 ? BAL.pincerMult : 1) *
        attackTraitMult(state, a),
    );
    const appliedA = distributeLoss(a, lossA);
    const appliedB = distributeLoss(b, lossB);
    combat.sideA.cumulativeLosses += appliedA;
    combat.sideB.cumulativeLosses += appliedB;
    const ratioA = aStart > 0 ? appliedA / aStart : 1;
    const ratioB = bStart > 0 ? appliedB / bStart : 1;
    if (Math.abs(ratioA - ratioB) < 0.05) {
      for (const army of [...a, ...b]) army.morale = clamp(army.morale - 1, 0, 100);
    } else {
      const losing = ratioA > ratioB ? a : b;
      const winning = ratioA > ratioB ? b : a;
      for (const army of losing)
        army.morale = clamp(army.morale - BAL.fieldMoraleDailyLose, 0, 100);
      for (const army of winning)
        army.morale = clamp(army.morale + BAL.fieldMoraleDailyWin, 0, 100);
    }
    checkRouts(state, [...a, ...b], events);
    removeDestroyedArmies(state, [...a, ...b]);
    const remainingA = combatArmies(state, combat.sideA);
    const remainingB = combatArmies(state, combat.sideB);
    if (remainingA.length > 0 && remainingB.length > 0) continue;
    if (remainingA.length === 0 && remainingB.length === 0) {
      const siege = Object.values(state.sieges).find(
        (candidate) => candidate.castleId === combat.nodeId && candidate.interrupted,
      );
      if (siege) {
        for (const armyId of siege.attackerArmyIds) {
          const army = state.armies[armyId];
          if (army) army.siegeId = null;
        }
        delete state.sieges[siege.id];
        events.push({
          type: 'siege.ended',
          day: state.time.day,
          clanIds: [siege.attackerClanId],
          siegeId: siege.id,
          castleId: siege.castleId,
          fallen: false,
          newOwnerClanId: null,
        });
      }
      events.push({
        type: 'battle.ended',
        day: state.time.day,
        clanIds: [...combat.sideA.clanIds, ...combat.sideB.clanIds],
        battleId: combat.id,
        winnerClanId: null,
        aweLevel: 'none',
        attackerLosses: combat.sideB.cumulativeLosses,
        defenderLosses: combat.sideA.cumulativeLosses,
        nodeId: combat.nodeId,
        attackerClanId: combat.sideB.clanIds[0]!,
        defenderClanId: combat.sideA.clanIds[0]!,
      });
      delete state.fieldCombats[id];
      continue;
    }
    const winners = remainingA.length > 0 ? remainingA : remainingB;
    const losers = remainingA.length > 0 ? b : a;
    const winningSide = remainingA.length > 0 ? combat.sideA : combat.sideB;
    const losingSide = remainingA.length > 0 ? combat.sideB : combat.sideA;
    const contestedDistrict = state.districts[combat.nodeId as keyof typeof state.districts];
    if (
      contestedDistrict?.subjugation &&
      losingSide.clanIds.includes(contestedDistrict.subjugation.clanId)
    ) {
      contestedDistrict.subjugation.progress = 0;
    }
    restoreWinner(
      state,
      combat,
      winners,
      losers.filter((army) => state.armies[army.id]?.status === 'routed').map((army) => army.id),
    );
    pursue(state, winners, losers, events);
    removeDestroyedArmies(state, losers);
    const aweLevel =
      losingSide.cumulativeLosses > losingSide.initialTroops * BAL.fieldAweKillRatio
        ? 'small'
        : 'none';
    if (aweLevel === 'small')
      events.push(
        ...applyAwe(
          state,
          'small',
          combat.nodeId,
          winningSide.clanIds[0]!,
          losingSide.clanIds[0]!,
          combat.id,
        ),
      );
    const siege = Object.values(state.sieges).find(
      (candidate) => candidate.castleId === combat.nodeId && candidate.interrupted,
    );
    if (siege) {
      if (winningSide.clanIds.includes(siege.attackerClanId)) siege.interrupted = false;
      else {
        for (const armyId of siege.attackerArmyIds) {
          const army = state.armies[armyId];
          if (army) {
            army.siegeId = null;
            if (army.status === 'sieging') army.status = 'holding';
          }
        }
        delete state.sieges[siege.id];
        events.push({
          type: 'siege.ended',
          day: state.time.day,
          clanIds: [siege.attackerClanId, winningSide.clanIds[0]!],
          siegeId: siege.id,
          castleId: siege.castleId,
          fallen: false,
          newOwnerClanId: null,
        });
      }
    }
    events.push({
      type: 'battle.ended',
      day: state.time.day,
      clanIds: [...combat.sideA.clanIds, ...combat.sideB.clanIds],
      battleId: combat.id,
      winnerClanId: winningSide.clanIds[0]!,
      aweLevel,
      attackerLosses: combat.sideB.cumulativeLosses,
      defenderLosses: combat.sideA.cumulativeLosses,
      nodeId: combat.nodeId,
      attackerClanId: combat.sideB.clanIds[0]!,
      defenderClanId: combat.sideA.clanIds[0]!,
    });
    delete state.fieldCombats[id];
  }
  return events;
}
