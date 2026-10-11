import type { GameState } from '../../state/gameState';
import type { CastleId } from '../../state/ids';
import type { AiSink } from './types';
import { runDomesticCouncil } from './council';

export function runCastleAdministration(state: GameState, castleId: CastleId, sink: AiSink): void {
  const castle = state.castles[castleId];
  if (!castle || castle.directControl || castle.corpsId !== null || castle.lordId === null) return;
  const lord = state.officers[castle.lordId];
  if (!lord?.hasComeOfAge || lord.status !== 'serving' || lord.clanId !== castle.ownerClanId)
    return;
  // One scope for all delegated castles is preferred by runDelegation, so donors and budgets are shared.
  runDomesticCouncil(
    state,
    { clanId: castle.ownerClanId, corpsId: null, castleIds: [castleId], targetNodeId: null },
    sink,
    {
      rewards: false,
      policies: false,
      authority: { kind: 'castle', clanId: castle.ownerClanId, castleId },
    },
  );
}
