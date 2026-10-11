import type { GameState } from '@core/state/gameState';
import { store } from '../store';
import { useUIStore } from '../../ui/hooks/uiStore';
import type { EventViewModelResult } from './eventViewModel';
import type { EventId } from '@core/state/ids';

export type QueuedEventPresentation =
  | { id: number; kind: 'resolved'; result: EventViewModelResult }
  | { id: number; kind: 'pending'; eventId: EventId };

let game: GameState | null = null;
let nextId = 1;
let snapshot: readonly QueuedEventPresentation[] = Object.freeze([]);
const listeners = new Set<() => void>();

function publish(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      /* A view failure must not interrupt the strategy tick. */
    }
  }
}
export function subscribeEventPresentations(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function getEventPresentationSnapshot(): readonly QueuedEventPresentation[] {
  return game === store.getState().game ? snapshot : EMPTY;
}
const EMPTY: readonly QueuedEventPresentation[] = Object.freeze([]);

/** Only transient view data is stored; IDs never repeat across session resets. */
export function enqueueEventPresentation(
  state: Readonly<GameState>,
  result: EventViewModelResult,
): void {
  if (state !== game || state !== store.getState().game || state.meta.gameOver !== null) return;
  append(Object.freeze({ id: nextId++, kind: 'resolved', result: structuredClone(result) }));
}

function append(entry: QueuedEventPresentation): void {
  snapshot = Object.freeze([...snapshot, entry]);
  // Existing modal pump owns synchronous pause and FIFO restoration, including other dialogs.
  useUIStore.getState().actions.enqueueModal({
    id: 'event',
    params: { presentationId: String(entry.id) },
    pausesTime: true,
  });
  publish();
}

/** Queue identity only; mandatory text/conditions always come from current core state. */
export function enqueuePendingEventPresentation(
  state: Readonly<GameState>,
  eventId: EventId,
): void {
  if (
    state !== game ||
    state !== store.getState().game ||
    state.meta.gameOver !== null ||
    state.events.pendingChoiceEventId !== eventId ||
    snapshot.some((entry) => entry.kind === 'pending' && entry.eventId === eventId)
  )
    return;
  append(Object.freeze({ id: nextId++, kind: 'pending', eventId }));
}

/** Bridge initialization/tick boundary only, never called from a React render. */
export function synchronizePendingEventPresentations(state: Readonly<GameState>): void {
  if (state !== game || state !== store.getState().game) return;
  if (state.meta.gameOver !== null) {
    resetEventPresentations(game);
    return;
  }
  const stale = new Set(
    snapshot
      .filter(
        (entry) => entry.kind === 'pending' && entry.eventId !== state.events.pendingChoiceEventId,
      )
      .map((entry) => String(entry.id)),
  );
  if (stale.size > 0) {
    snapshot = Object.freeze(snapshot.filter((entry) => !stale.has(String(entry.id))));
    const ui = useUIStore.getState();
    useUIStore.setState({
      modalQueue: ui.modalQueue.filter(
        (modal) => modal.id !== 'event' || !stale.has(modal.params.presentationId ?? ''),
      ),
    });
    if (ui.modal?.id === 'event' && stale.has(ui.modal.params.presentationId ?? ''))
      ui.actions.closeModal();
    publish();
  }
  if (
    state === game &&
    state === store.getState().game &&
    state.events.pendingChoiceEventId !== null
  )
    enqueuePendingEventPresentation(state, state.events.pendingChoiceEventId);
}

export function acknowledgeEventPresentation(id: number): void {
  if (
    game !== store.getState().game ||
    !snapshot.some((entry) => entry.id === id && entry.kind === 'resolved')
  )
    return;
  const ui = useUIStore.getState();
  if (ui.modal?.id !== 'event' || ui.modal.params.presentationId !== String(id)) return;
  snapshot = Object.freeze(snapshot.filter((entry) => entry.id !== id));
  ui.actions.closeModal();
  publish();
}

/** Removes only this queue's modal descriptors; game replacement/ending cannot resume time. */
export function resetEventPresentations(nextGame: GameState | null): void {
  const owned = new Set(snapshot.map((entry) => String(entry.id)));
  const owns = (modal: { id: string; params: Record<string, string> }) =>
    modal.id === 'event' && owned.has(modal.params.presentationId ?? '');
  const ui = useUIStore.getState();
  const activeOwned = ui.modal !== null && owns(ui.modal);
  const mayRestore = game === store.getState().game && game?.meta.gameOver === null;
  useUIStore.setState({
    modalQueue: ui.modalQueue.filter((modal) => !owns(modal)),
    ...(!mayRestore && activeOwned ? { restoreSpeedOnQueueDrain: false } : {}),
  });
  if (activeOwned) {
    if (game?.meta.gameOver !== null) useUIStore.setState({ modal: null });
    else useUIStore.getState().actions.closeModal();
  }
  game = nextGame;
  snapshot = EMPTY;
  publish();
}

export function peekEventPresentation(): QueuedEventPresentation | undefined {
  return getEventPresentationSnapshot()[0];
}
