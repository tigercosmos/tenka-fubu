import type { CastleId } from '../state/ids';
import type { Clan, Corps, GameState } from '../state/gameState';

/** Castle-level costs and refunds use the live regional wallet; clan-level policy/payroll do not. */
export function treasuryForCastle(
  state: Readonly<GameState>,
  castleId: CastleId,
): Clan | Corps | undefined {
  const castle = state.castles[castleId];
  if (!castle) return undefined;
  if (castle.corpsId !== null) {
    const corps = state.corps[castle.corpsId];
    return corps?.clanId === castle.ownerClanId ? corps : undefined;
  }
  return state.clans[castle.ownerClanId];
}
