import { useMemo } from 'react';
import { useStore } from 'zustand';
import type { GameStore } from '@app/store';
import { CoreError } from '@core/errors';
import type { GameState } from '@core/state/gameState';
import { useGameSelectorStore } from './useGameSelector';

/** Debug jumps publish map snapshots at progress boundaries; normal play publishes every tick. */
export function makeMapPublicationSelector<R>(
  selector: (game: GameState, tickSeq: number) => R,
): (state: GameStore) => R {
  let previousGame: GameState | null = null;
  let previousProgress: GameStore['session']['debug']['jumping'] = null;
  let previousValue: R;
  return (state) => {
    if (state.game === null)
      throw new CoreError('DATA_INTEGRITY', 'game 尚未初始化（map selector）');
    const progress = state.session.debug.jumping;
    if (progress !== null && state.game === previousGame && progress === previousProgress)
      return previousValue;
    previousValue = selector(state.game, state.tickSeq);
    previousGame = state.game;
    previousProgress = progress;
    return previousValue;
  };
}

export function useMapGameSelector<R>(selector: (game: GameState, tickSeq: number) => R): R {
  const select = useMemo(() => makeMapPublicationSelector(selector), [selector]);
  return useStore(useGameSelectorStore(), select);
}
