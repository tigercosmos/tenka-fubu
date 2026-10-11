import type { ArmyId } from '../state/ids';
import type { GameEvent } from '../state/events';
import type { GameState } from '../state/gameState';

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
