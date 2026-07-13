import { BAL } from '../balance';
import { defaultDiplomacyRow, nextId, pairKey } from '../state/serialize';
import type { Army, Castle, GameState, Siege } from '../state/gameState';
import type { ArmyId, CastleId, ClanId } from '../state/ids';
import type { GameEvent } from '../state/events';
import { computeArmyPower } from './fieldCombat';
import { createRngStream } from '../rng';
import { appointClanSuccessor, dieOfficer } from './officers';
import { nearestOwnedCastleByTravelTime } from './castleSelection';
import { garrisonFoodMonthly } from '../domestic';

/** Future facility seam; no currently shipped facility grants siege mitigation. */
export function facilitySiegeMitigation(
  _state: Readonly<GameState>,
  _castle: Readonly<Castle>,
): number {
  void _state;
  void _castle;
  return 0;
}

export function combinedSiegeMitigation(base: number, facility: number): number {
  return Math.min(0.7, Math.max(0, base + facility));
}

function markHostile(state: GameState, a: ClanId, b: ClanId): void {
  const key = pairKey(a, b);
  const row = state.diplomacy.rows[key] ?? defaultDiplomacyRow(a, b);
  row.lastHostileDay = state.time.day;
  state.diplomacy.rows[key] = row;
}

export function beginSiege(state: GameState, castleId: CastleId, armyId: ArmyId): GameEvent[] {
  const army = state.armies[armyId];
  const castle = state.castles[castleId];
  if (!army || !castle || castle.ownerClanId === army.clanId) return [];
  const existing = Object.values(state.sieges).find((siege) => siege.castleId === castleId);
  if (existing?.attackerClanId === army.clanId) {
    if (!existing.attackerArmyIds.includes(army.id)) existing.attackerArmyIds.push(army.id);
    army.status = 'sieging';
    army.siegeId = existing.id;
    return [];
  }
  if (existing) return [];
  const id = nextId(state, 'siege');
  state.sieges[id] = {
    id,
    castleId,
    attackerClanId: army.clanId,
    attackerArmyIds: [army.id],
    mode: 'assault',
    startDay: state.time.day,
    interrupted: false,
    betrayalUsed: false,
  };
  army.status = 'sieging';
  army.siegeId = id;
  markHostile(state, army.clanId, castle.ownerClanId);
  return [
    {
      type: 'siege.started',
      day: state.time.day,
      clanIds: [army.clanId, castle.ownerClanId],
      siegeId: id,
      castleId,
      attackerClanId: army.clanId,
    },
  ];
}

/** Remove one army from a siege while keeping the bidirectional membership invariant intact. */
export function detachArmyFromSiege(state: GameState, armyId: ArmyId): GameEvent[] {
  const army = state.armies[armyId];
  const siege =
    army?.siegeId === null || army?.siegeId === undefined
      ? Object.values(state.sieges).find((candidate) => candidate.attackerArmyIds.includes(armyId))
      : state.sieges[army.siegeId];
  if (!siege) {
    if (army) army.siegeId = null;
    return [];
  }
  siege.attackerArmyIds = siege.attackerArmyIds.filter((candidate) => candidate !== armyId);
  if (army) army.siegeId = null;
  if (siege.attackerArmyIds.length > 0) return [];
  delete state.sieges[siege.id];
  return [
    {
      type: 'siege.ended',
      day: state.time.day,
      clanIds: [siege.attackerClanId],
      siegeId: siege.id,
      castleId: siege.castleId,
      fallen: false,
      newOwnerClanId: null,
    },
  ];
}

function distributeLoss(armies: readonly Army[], total: number): void {
  const troops = armies.reduce((sum, army) => sum + army.soldiers, 0);
  if (troops <= 0) return;
  let applied = 0;
  for (let i = 0; i < armies.length; i += 1) {
    const army = armies[i]!;
    const loss =
      i === armies.length - 1 ? total - applied : Math.round((total * army.soldiers) / troops);
    const actual = Math.min(army.soldiers, Math.max(0, loss));
    army.soldiers -= actual;
    applied += actual;
  }
}

function castleLordLdr(state: Readonly<GameState>, castleId: CastleId): number {
  const lordId = state.castles[castleId]?.lordId;
  const lord = lordId ? state.officers[lordId] : undefined;
  return lord ? lord.ldr + lord.statGrowth.ldr : 0;
}

function endUnfallen(state: GameState, siege: Siege, events: GameEvent[]): void {
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
    clanIds: [siege.attackerClanId],
    siegeId: siege.id,
    castleId: siege.castleId,
    fallen: false,
    newOwnerClanId: null,
  });
}

function absorbDefeatedClan(
  state: GameState,
  defeatedClanId: ClanId,
  conquerorClanId: ClanId,
): void {
  const clan = state.clans[defeatedClanId];
  if (clan) {
    clan.alive = false;
    clan.destroyedDay = state.time.day;
  }
  const defeatedCorpsIds = new Set(
    Object.values(state.corps)
      .filter((corps) => corps.clanId === defeatedClanId)
      .map((corps) => corps.id),
  );
  for (const castle of Object.values(state.castles)) {
    if (castle.ownerClanId === defeatedClanId) {
      castle.ownerClanId = conquerorClanId;
      castle.tier = castle.id === state.clans[conquerorClanId]?.homeCastleId ? 'main' : 'branch';
      castle.directControl = true;
      castle.lordId = null;
      castle.corpsId = null;
    } else if (castle.corpsId !== null && defeatedCorpsIds.has(castle.corpsId)) {
      castle.corpsId = null;
    }
  }
  for (const district of Object.values(state.districts)) {
    if (district.ownerClanId !== defeatedClanId) continue;
    district.ownerClanId = conquerorClanId;
    district.stewardId = null;
    district.subjugation = null;
  }
  for (const corpsId of defeatedCorpsIds) delete state.corps[corpsId];
  for (const army of Object.values(state.armies)) {
    if (army.clanId === defeatedClanId) delete state.armies[army.id];
    else if (army.corpsId !== null && defeatedCorpsIds.has(army.corpsId)) army.corpsId = null;
  }
  for (const officer of Object.values(state.officers)) {
    if (officer.status !== 'serving' || officer.clanId !== defeatedClanId) continue;
    officer.status = 'ronin';
    officer.clanId = null;
    officer.armyId = null;
    officer.locationCastleId ??= officer.debutCastleId;
  }
}

function fallCastle(
  state: GameState,
  siege: Siege,
  attackers: readonly Army[],
  events: GameEvent[],
): void {
  const castle = state.castles[siege.castleId]!;
  const oldOwner = castle.ownerClanId;
  const defeatedCorpsId = castle.corpsId;
  castle.ownerClanId = siege.attackerClanId;
  castle.corpsId = null;
  castle.directControl = true;
  castle.durability = Math.ceil(
    Math.max(castle.durability, castle.maxDurability * BAL.postSiegeDurabilityRatio),
  );
  castle.morale = BAL.postSiegeCastleMorale;
  castle.soldiers = 0;
  castle.food = Math.floor(castle.food * BAL.postSiegeFoodKeepRatio);
  castle.lordId = null;
  for (const districtId of castle.districtIds) {
    const district = state.districts[districtId];
    if (!district) continue;
    district.ownerClanId = siege.attackerClanId;
    district.stewardId = null;
    district.subjugation = null;
    for (const army of Object.values(state.armies)) {
      if (army.posNodeId !== district.id || army.status !== 'subjugating') continue;
      army.status = army.pathCursor < army.path.length - 1 ? 'marching' : 'holding';
    }
  }
  if (
    defeatedCorpsId !== null &&
    !Object.values(state.castles).some((candidate) => candidate.corpsId === defeatedCorpsId)
  ) {
    const defeatedCorps = state.corps[defeatedCorpsId];
    const oldOwnerSurvives = Object.values(state.castles).some(
      (candidate) => candidate.ownerClanId === oldOwner,
    );
    if (defeatedCorps && oldOwnerSurvives) state.clans[oldOwner]!.gold += defeatedCorps.gold;
    delete state.corps[defeatedCorpsId];
    for (const army of Object.values(state.armies)) {
      if (army.corpsId === defeatedCorpsId) army.corpsId = null;
    }
  }
  const refuge = nearestOwnedCastleByTravelTime(state, oldOwner, castle.id)?.castle;
  const oldClan = state.clans[oldOwner];
  const formerLeaderId = oldClan?.leaderId;
  if (oldClan?.homeCastleId === castle.id) {
    if (refuge) {
      oldClan.homeCastleId = refuge.id;
      refuge.tier = 'main';
    } else {
      oldClan.alive = false;
      oldClan.destroyedDay = state.time.day;
    }
  }
  const rng = createRngStream(state.rng, 'misc');
  for (const officer of Object.values(state.officers).sort((a, b) => a.id.localeCompare(b.id))) {
    if (
      officer.locationCastleId !== castle.id ||
      officer.status !== 'serving' ||
      officer.clanId !== oldOwner
    )
      continue;
    if (rng.chance(BAL.siegeEscapeChance)) {
      if (refuge) officer.locationCastleId = refuge.id;
      else {
        officer.status = 'ronin';
        officer.clanId = null;
        officer.locationCastleId = officer.debutCastleId;
      }
    } else if (rng.chance(BAL.siegeDeathChanceEscapeFail)) {
      events.push(...dieOfficer(state, officer.id, castle.id, true));
    } else {
      officer.status = 'captive';
      officer.capturedByClanId = siege.attackerClanId;
      officer.locationCastleId = castle.id;
      events.push({
        type: 'officer.captured',
        day: state.time.day,
        clanIds: [oldOwner, siege.attackerClanId],
        officerId: officer.id,
        byClanId: siege.attackerClanId,
      });
    }
  }
  if (oldClan?.alive && formerLeaderId !== undefined) {
    const formerLeader = state.officers[formerLeaderId];
    if (formerLeader && formerLeader.status !== 'serving') {
      const succession = appointClanSuccessor(
        state,
        oldOwner,
        formerLeaderId,
        formerLeader.status === 'captive',
      );
      if (succession) events.push(succession);
      else {
        oldClan.alive = false;
        oldClan.destroyedDay = state.time.day;
        if (oldOwner === state.meta.playerClanId) state.events.flags['defeat.no-heir'] = 1;
      }
    }
  }
  if (!oldClan?.alive) {
    absorbDefeatedClan(state, oldOwner, siege.attackerClanId);
    events.push({
      type: 'clan.destroyed',
      day: state.time.day,
      clanIds: [oldOwner, siege.attackerClanId],
      clanId: oldOwner,
      byClanId: null,
    });
  }
  for (const army of attackers) {
    army.siegeId = null;
    army.status = 'holding';
    army.morale = Math.min(100, army.morale + BAL.moraleVictoryGain);
  }
  state.meta.territoryChangedToday = true;
  delete state.sieges[siege.id];
  events.push({
    type: 'siege.ended',
    day: state.time.day,
    clanIds: [oldOwner, siege.attackerClanId],
    siegeId: siege.id,
    castleId: castle.id,
    fallen: true,
    newOwnerClanId: siege.attackerClanId,
  });
}

export function siegeSystem(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  for (const id of Object.keys(state.sieges).sort()) {
    const siege = state.sieges[id as keyof typeof state.sieges];
    if (!siege || siege.interrupted) continue;
    const attackers = siege.attackerArmyIds
      .map((armyId) => state.armies[armyId])
      .filter((army): army is Army => !!army && army.soldiers > 0 && army.status === 'sieging');
    if (attackers.length === 0) {
      endUnfallen(state, siege, events);
      continue;
    }
    const castle = state.castles[siege.castleId];
    if (!castle) {
      endUnfallen(state, siege, events);
      continue;
    }
    const attackerTroops = attackers.reduce((sum, army) => sum + army.soldiers, 0);
    if (siege.mode === 'encircle' && attackerTroops < castle.soldiers * BAL.encircleRatio)
      siege.mode = 'assault';
    const baseMitigation =
      castle.tier === 'main' ? BAL.siegeMitigationMain : BAL.siegeMitigationBranch;
    const mitigation = combinedSiegeMitigation(
      baseMitigation,
      facilitySiegeMitigation(state, castle),
    );
    const attackPower = attackers.reduce((sum, army) => sum + computeArmyPower(state, army), 0);
    const defensePower =
      castle.soldiers *
      (1 + castleLordLdr(state, castle.id) * BAL.ldrCombatFactor) *
      (1 + mitigation);
    if (siege.mode === 'assault') {
      castle.durability = Math.max(
        0,
        castle.durability - attackPower * BAL.assaultDurabilityRate * (1 - mitigation),
      );
      castle.soldiers = Math.max(
        0,
        castle.soldiers - Math.round(attackPower * BAL.assaultDefenderLossRate),
      );
      castle.morale = Math.max(0, castle.morale - BAL.assaultCastleMoraleDaily);
      distributeLoss(attackers, Math.round(defensePower * BAL.assaultAttackerLossRate));
    } else {
      castle.morale = Math.max(0, castle.morale - BAL.encircleCastleMoraleDaily);
      castle.foodFrac += (garrisonFoodMonthly(state, castle) / 30) * (BAL.encircleFoodMult - 1);
      const extraFood = Math.floor(castle.foodFrac);
      castle.foodFrac -= extraFood;
      castle.food = Math.max(0, castle.food - extraFood);
      distributeLoss(attackers, Math.round(defensePower * BAL.encircleAttackerLossRate));
    }
    if (castle.food === 0) {
      castle.morale = Math.max(0, castle.morale - BAL.starvingCastleMoraleDaily);
      castle.soldiers = Math.max(
        0,
        castle.soldiers - Math.ceil(castle.soldiers * BAL.starvingCastleDesertionRate),
      );
    }
    if (castle.durability <= 0 || castle.morale <= 0 || castle.soldiers <= 0)
      fallCastle(state, siege, attackers, events);
  }
  return events;
}
