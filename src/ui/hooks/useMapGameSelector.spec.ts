import { describe, expect, it, vi } from 'vitest';
import { store, type GameStore } from '@app/store';
import type { GameState } from '@core/state/gameState';
import { buildTinyState } from '../../../tests/fixtures/tiny';
import { makeMapPublicationSelector } from './useMapGameSelector';

function snapshot(game = buildTinyState()): GameStore {
  const base = store.getState();
  return {
    ...base,
    game,
    session: { ...base.session, debug: { ...base.session.debug, jumping: null } },
  };
}
describe('map publication during debug jumps', () => {
  it('holds the published snapshot while progress is unchanged and flushes the final day', () => {
    const state = snapshot();
    const compute = vi.fn((game: GameState) => ({ day: game.time.day }));
    const select = makeMapPublicationSelector(compute);
    const first = select(state);
    state.session.debug.jumping = { totalDays: 60, doneDays: 0 };
    const initialJump = select(state);
    for (let i = 0; i < 60; i++) {
      state.game!.time.day++;
      state.tickSeq++;
      expect(select(state)).toBe(initialJump);
    }
    expect(compute).toHaveBeenCalledTimes(2);
    state.session.debug.jumping = null;
    expect(select(state).day).toBe(first.day + 60);
    expect(compute).toHaveBeenCalledTimes(3);
  });
  it('publishes progress chunks, new sessions and every ordinary tick', () => {
    const state = snapshot();
    const compute = vi.fn((game: GameState) => ({ day: game.time.day }));
    const select = makeMapPublicationSelector(compute);
    state.session.debug.jumping = { totalDays: 60, doneDays: 0 };
    const initial = select(state);
    state.game!.time.day += 30;
    state.tickSeq += 30;
    state.session.debug.jumping = { totalDays: 60, doneDays: 30 };
    expect(select(state).day).toBe(initial.day + 30);
    state.game = buildTinyState();
    expect(select(state).day).toBe(initial.day);
    state.session.debug.jumping = null;
    select(state);
    state.game.time.day++;
    state.tickSeq++;
    expect(select(state).day).toBe(initial.day + 1);
    expect(compute).toHaveBeenCalledTimes(5);
  });
});
