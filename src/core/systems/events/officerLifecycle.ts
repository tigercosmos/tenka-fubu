import type { EmitFn } from '../../commands/registry';
import { BAL } from '../../balance';
import type { GameState, Officer } from '../../state/gameState';
import type { CastleId, ClanId, OfficerId } from '../../state/ids';
import { nearestOwnedCastleByTravelTime } from '../castleSelection';
import { detachArmyFromSiege } from '../siege';
import { releaseOfficerAssignments, transferOfficer } from '../officers';

function eligibleOfficer(state: GameState, id: OfficerId): Officer | undefined {
  const officer = state.officers[id];
  return officer &&
    officer.status !== 'dead' &&
    (officer.clanId === null || state.clans[officer.clanId]?.alive)
    ? officer
    : undefined;
}
function requireNonLeader(state: GameState, officer: Officer): void {
  if (officer.clanId !== null && state.clans[officer.clanId]?.leaderId === officer.id)
    throw new Error('Unsupported event officer departure: living clan leader');
}

/** Explicit destination only: plan10 does not select a receiving castle. */
export function applyOfficerTransferEvent(
  state: GameState,
  officerId: OfficerId,
  toClanId: ClanId,
  destinationCastleId: CastleId,
  emit: EmitFn,
): void {
  const officer = eligibleOfficer(state, officerId);
  if (!officer || !state.clans[toClanId]?.alive) return;
  if (officer.status !== 'serving' && officer.status !== 'ronin') return;
  requireNonLeader(state, officer);
  if (state.castles[destinationCastleId]?.ownerClanId !== toClanId)
    throw new Error('Event officer transfer requires an owned destination castle');
  const fromClanId = officer.clanId;
  const source = officer.status === 'ronin' ? 'ronin' : null;
  returnOfficerArmy(state, officer, emit);
  transferOfficer(
    state,
    officerId,
    {
      clanId: toClanId,
      castleId: destinationCastleId,
      loyalty: BAL.evtTransferLoyalty,
      rank: officer.rank,
      ...(source === null ? {} : { source }),
    },
    (event) => {
      if (source !== null || event.type !== 'officer.recruited') emit(event);
    },
  );
  if (fromClanId !== null && fromClanId !== toClanId)
    emit({
      type: 'officer.defected',
      day: state.time.day,
      clanIds: [fromClanId, toClanId],
      officerId,
      fromClanId,
      toClanId,
    });
}

/** Protected leaders and armies without a reachable refuge remain unchanged. */
export function applyMakeRoninEvent(state: GameState, officerId: OfficerId, emit: EmitFn): void {
  const officer = eligibleOfficer(state, officerId);
  if (!officer) return;
  // INV-08 and ordinary departure protection take precedence over forced departure.
  if (officer.clanId !== null && state.clans[officer.clanId]?.leaderId === officer.id) return;
  const army = officer.armyId === null ? undefined : state.armies[officer.armyId];
  if (army && !nearestOwnedCastleByTravelTime(state, army.clanId, army.posNodeId)) return;
  const fromClanId = officer.clanId;
  const location = returnOfficerArmy(state, officer, emit);
  releaseOfficerAssignments(state, officerId).forEach(emit);
  officer.status = 'ronin';
  officer.clanId = null;
  officer.locationCastleId = location;
  officer.capturedByClanId = null;
  officer.captiveRetryOn = null;
  officer.recruitRetryOn = null;
  if (fromClanId !== null)
    emit({
      type: 'officer.defected',
      day: state.time.day,
      clanIds: [fromClanId],
      officerId,
      fromClanId,
      toClanId: null,
    });
}

/** Event troop repatriation (plan10 §3.3), without stripping the other members' offices. */
export function returnOfficerArmy(
  state: GameState,
  officer: Officer,
  emit: EmitFn,
): CastleId | null {
  const army = officer.armyId === null ? undefined : state.armies[officer.armyId];
  if (!army) return officer.locationCastleId;
  const refuge = nearestOwnedCastleByTravelTime(state, army.clanId, army.posNodeId)?.castle;
  if (!refuge) throw new Error('Unsupported event officer departure: no reachable original castle');

  for (const event of detachArmyFromSiege(state, army.id)) emit(event);
  for (const combat of Object.values(state.fieldCombats)) {
    combat.sideA.armyIds = combat.sideA.armyIds.filter((id) => id !== army.id);
    combat.sideB.armyIds = combat.sideB.armyIds.filter((id) => id !== army.id);
    const activeBattle = Object.values(state.battles).some(
      (battle) => battle.result === null && battle.fieldCombatId === combat.id,
    );
    if (!activeBattle && (combat.sideA.armyIds.length === 0 || combat.sideB.armyIds.length === 0)) {
      for (const id of [...combat.sideA.armyIds, ...combat.sideB.armyIds]) {
        const survivor = state.armies[id];
        if (survivor) survivor.status = survivor.siegeId !== null ? 'sieging' : 'holding';
      }
      delete state.fieldCombats[combat.id];
    }
  }
  for (const battle of Object.values(state.battles))
    battle.units = battle.units.filter((unit) => unit.armyId !== army.id);
  for (const other of Object.values(state.armies))
    other.pursuitEligibleArmyIds = other.pursuitEligibleArmyIds.filter((id) => id !== army.id);

  // Same return resource semantics as military.returnIntoCastle: no invented attrition.
  refuge.soldiers += army.soldiers;
  refuge.food += army.food;
  for (const id of [army.leaderId, ...army.deputyIds]) {
    const member = state.officers[id];
    if (!member) continue;
    member.armyId = null;
    member.locationCastleId = refuge.id;
  }
  emit({
    type: 'army.returned',
    day: state.time.day,
    clanIds: [army.clanId],
    armyId: army.id,
    clanId: army.clanId,
    castleId: refuge.id,
    soldiersReturned: army.soldiers,
    leaderId: army.leaderId,
  });
  delete state.armies[army.id];
  return refuge.id;
}
