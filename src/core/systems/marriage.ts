import type { GameState } from '../state/gameState';
import type { OfficerId } from '../state/ids';

/** Death ends personal spouse links, not the permanent inter-clan marriage pact (08 §3.4.1). */
export function clearSpouseOnDeath(state: GameState, officerId: OfficerId): void {
  const officer = state.officers[officerId];
  if (!officer) return;
  const spouse = officer.spouseId === null ? undefined : state.officers[officer.spouseId];
  officer.spouseId = null;
  // Defensive asymmetric input must not erase the partner's different marriage.
  if (spouse?.spouseId === officerId) spouse.spouseId = null;
}
