import { BAL } from './balance';
import type { Army, GameState } from './state/gameState';
import { traitModifier } from './traits';

/** Actual daily field consumption: primary commander's multiplier precedes rounding. */
export function armyDailyFoodUse(state: Readonly<GameState>, army: Readonly<Army>): number {
  const leader = state.officers[army.leaderId];
  const multiplier = leader ? traitModifier(leader, 'army.foodUseMult').mult : 1;
  return Math.ceil(army.soldiers * BAL.fieldFoodPerSoldierDaily * multiplier);
}

/** Remaining days at current troop count; does not predict future refill or losses. */
export function armyFoodDays(state: Readonly<GameState>, army: Readonly<Army>): number {
  return army.food / Math.max(1, armyDailyFoodUse(state, army));
}
