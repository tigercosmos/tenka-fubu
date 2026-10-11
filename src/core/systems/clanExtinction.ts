import type { GameState } from '../state/gameState';
import type { ClanId } from '../state/ids';
import type { EmitFn } from '../commands/registry';
import { collapseShogunate } from './court';

/** Extinguishing the current shogun house is equivalent to endShogunate (10 §3.8.3; 08 §5.4.3). */
export function collapseExtinctClanCourt(state: GameState, clanId: ClanId, emit: EmitFn): void {
  if (state.court.shogunClanId === clanId) collapseShogunate(state, emit);
}

/** Non-territorial extinction cleanup shared by existing destruction entrypoints (10 §3.8.3). */
export function clearExtinctClanWork(state: GameState, clanId: ClanId): void {
  state.diplomacy.missions = state.diplomacy.missions.filter(
    (mission) => mission.fromClanId !== clanId && mission.target !== clanId,
  );
  state.diplomacy.plots = state.diplomacy.plots.filter(
    (plot) => plot.ownerClanId !== clanId && plot.targetClanId !== clanId,
  );
  state.diplomacy.pendingProposals = state.diplomacy.pendingProposals.filter(
    (proposal) => proposal.fromClanId !== clanId && proposal.toClanId !== clanId,
  );
  for (const row of Object.values(state.diplomacy.rows))
    if (row.a === clanId || row.b === clanId) row.pacts = [];
  for (const proposal of Object.values(state.proposals))
    if (proposal.clanId === clanId && proposal.status === 'pending') proposal.status = 'expired';
  for (const transport of Object.values(state.transports))
    if (transport.clanId === clanId) delete state.transports[transport.id];
  const clan = state.clans[clanId];
  if (clan) {
    clan.taimei.activeTaimeiId = null;
    clan.taimei.activeUntilDay = 0;
  }
}
