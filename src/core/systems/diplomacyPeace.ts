import type { GameState } from '../state/gameState';
import type { GameEvent } from '../state/events';
import type { ClanId } from '../state/ids';
import { getStance } from './pathfinding';
import { setReturning } from './military';
import { detachArmyFromSiege } from './siege';

/** Stop existing hostile work before the movement/combat steps can inflict damage. */
export function reconcilePeace(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  const peaceful = (a: ClanId, b: ClanId) => {
    const stance = getStance(state, a, b);
    return stance === 'friendly' || stance === 'ceasefire' || stance === 'own';
  };
  for (const combat of Object.values(state.fieldCombats).sort((a, b) => a.id.localeCompare(b.id))) {
    if (!combat.sideA.clanIds.some((a) => combat.sideB.clanIds.some((b) => peaceful(a, b))))
      continue;
    if (combat.interrupted) continue; // Active tactical battles freeze strategic command processing.
    delete state.fieldCombats[combat.id];
    for (const id of [...combat.sideA.armyIds, ...combat.sideB.armyIds].sort()) {
      const army = state.armies[id];
      if (army) {
        events.push(...detachArmyFromSiege(state, army.id));
        army.mission = 'return';
        setReturning(state, army, false, events);
      }
    }
    for (const siege of Object.values(state.sieges))
      if (siege.castleId === combat.nodeId) siege.interrupted = false;
  }
  for (const siege of Object.values(state.sieges).sort((a, b) => a.id.localeCompare(b.id))) {
    const castle = state.castles[siege.castleId];
    if (!castle || !peaceful(siege.attackerClanId, castle.ownerClanId)) continue;
    for (const id of [...siege.attackerArmyIds].sort()) {
      const army = state.armies[id];
      if (army) {
        events.push(...detachArmyFromSiege(state, army.id));
        army.status = 'holding';
        army.mission = 'return';
        setReturning(state, army, false, events);
      }
    }
  }
  for (const district of Object.values(state.districts)) {
    if (district.subjugation && peaceful(district.subjugation.clanId, district.ownerClanId))
      district.subjugation = null;
  }
  for (const army of Object.values(state.armies).sort((a, b) => a.id.localeCompare(b.id))) {
    const district = state.districts[army.posNodeId as keyof typeof state.districts];
    // A second same-clan formation can finish this district earlier in the
    // previous movement step. That is completed work, not a diplomatic retreat:
    // military's subjugation/route/auto-return logic owns its continuation.
    if (
      army.status === 'subjugating' &&
      district &&
      district.ownerClanId !== army.clanId &&
      peaceful(army.clanId, district.ownerClanId)
    )
      setReturning(state, army, false, events);
  }
  return events;
}
