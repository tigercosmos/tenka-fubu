import { createStore } from 'zustand/vanilla';
import type { GameState } from '@core/state/gameState';
import { initialSession, type GameStore } from '../store';

/** Presentation sandbox only: no live-store identity, queue, simulation or executable actions. */
export function createIsolatedGameStore(game: GameState, tickSeq = 0) {
  const unavailable = () => {
    throw new Error('Presentation fixture cannot execute game actions');
  };
  return createStore<GameStore>()(() => ({
    game,
    tickSeq,
    session: structuredClone(initialSession),
    actions: {
      setScreen: unavailable,
      select: unavailable,
      openModal: unavailable,
      closeModal: unavailable,
      setSpeed: unavailable,
      setViewportBlocked: unavailable,
      requestPause: unavailable,
      resume: unavailable,
      setPendingCommandCount: unavailable,
      setFatalError: unavailable,
      setDebugJumping: unavailable,
      setDebugPanelOpen: unavailable,
    },
  }));
}
