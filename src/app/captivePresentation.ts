import type { GameEvent } from '../core/state/events';
import type { GameState } from '../core/state/gameState';
import { store } from './store';
import { uiStore, type ModalInstance } from '../ui/hooks/uiStore';

const owned = new Map<ModalInstance, GameState>();

/** Only newly emitted captures enter the FIFO; loading old captives never invents arrivals. */
export function publishCapturedOfficers(
  game: GameState,
  events: readonly GameEvent[],
  current: () => boolean,
): void {
  const available = () =>
    current() &&
    store.getState().session.screen === 'main' &&
    store.getState().session.fatalError === null &&
    game.meta.gameOver === null;
  for (const [modal] of owned) {
    const ui = uiStore.getState();
    if (ui.modal !== modal && !ui.modalQueue.includes(modal)) owned.delete(modal);
  }
  const seen = new Set<string>();
  for (const event of events) {
    if (!available()) return;
    if (event.type !== 'officer.captured' || event.byClanId !== game.meta.playerClanId) continue;
    if (seen.has(event.officerId)) continue;
    seen.add(event.officerId);
    const officer = game.officers[event.officerId];
    if (officer?.status !== 'captive' || officer.capturedByClanId !== game.meta.playerClanId)
      continue;
    const ui = uiStore.getState();
    if (
      ui.queuedDecisionIds.includes(officer.id) ||
      [ui.modal, ...ui.modalQueue].some(
        (modal) => modal?.id === 'captive' && modal.params.officerId === officer.id,
      )
    )
      continue;
    const modal: ModalInstance = {
      id: 'captive',
      params: { officerId: officer.id },
      pausesTime: true,
    };
    owned.set(modal, game);
    ui.actions.enqueueModal(modal);
    // Synchronous UI publication may replace the game/queue. Never leave an old arrival behind.
    if (!available()) {
      uiStore.getState().actions.closeOwnedModal(modal, { resume: false, expectedGame: game });
      owned.delete(modal);
      return;
    }
  }
}

/** Session teardown removes only descriptors created by this handoff, without resuming time. */
export function resetCapturedOfficerPresentations(): void {
  const previous = [...owned];
  owned.clear(); // Reentrant publication can create a new session's arrivals; never visit them.
  for (const [modal, game] of previous) {
    uiStore.getState().actions.closeOwnedModal(modal, { resume: false, expectedGame: game });
  }
}
