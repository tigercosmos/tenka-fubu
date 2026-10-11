import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGameLoopController } from '../../src/app/gameLoop';
import { resetGameStoreForTests, store } from '../../src/app/store';
import { resetBridgeForTests } from '../../src/app/bridge';
import { canonicalStringify } from '../../src/core/state/serialize';
import { makeLoopTestState } from '../helpers/loopState';
import { createManualScheduler } from '../helpers/manualFrameScheduler';

let loop: ReturnType<typeof createGameLoopController>;
let unsubscribe: (() => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  resetGameStoreForTests(makeLoopTestState());
  resetBridgeForTests();
  loop = createGameLoopController(createManualScheduler().scheduler);
});

afterEach(() => {
  unsubscribe?.();
  unsubscribe = undefined;
  loop.stop();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('debug jump owns its original game and scheduled work', () => {
  it('does not advance a replacement game after a synchronous first-day publication', () => {
    const original = store.getState().game!;
    const replacement = makeLoopTestState({ day: 100 });
    const untouched = canonicalStringify(replacement);
    unsubscribe = store.subscribe((state) => {
      if (state.game === original && state.tickSeq === 1) {
        unsubscribe?.();
        resetGameStoreForTests(replacement);
      }
    });
    loop.stepDays(45);
    vi.runAllTimers();
    expect(original.time.day).toBe(1);
    expect(store.getState().game).toBe(replacement);
    expect(canonicalStringify(replacement)).toBe(untouched);
    expect(store.getState().tickSeq).toBe(0);
    expect(store.getState().session.debug.jumping).toBeNull();
  });

  it('stop cancels the queued remainder without advancing another day', () => {
    loop.stepDays(45);
    expect(store.getState().game!.time.day).toBe(30);
    const stopped = canonicalStringify(store.getState().game);
    loop.stop();
    vi.runAllTimers();
    expect(canonicalStringify(store.getState().game)).toBe(stopped);
    expect(store.getState().session.debug.jumping).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a retained old timer cannot consume or clear a fresh replacement jump', () => {
    const timers = vi.spyOn(globalThis, 'setTimeout');
    loop.stepDays(45);
    const oldChunk = timers.mock.calls.at(-1)?.[0];
    if (typeof oldChunk !== 'function') throw new Error('Missing scheduled original chunk');
    const original = store.getState().game!;
    resetGameStoreForTests(makeLoopTestState({ day: 100 }));
    loop.stepDays(45);
    const replacement = store.getState().game!;
    const progress = store.getState().session.debug.jumping;
    const untouched = canonicalStringify(replacement);
    oldChunk();
    expect(canonicalStringify(replacement)).toBe(untouched);
    expect(store.getState().session.debug.jumping).toBe(progress);
    vi.runAllTimers();
    expect(original.time.day).toBe(30);
    expect(replacement.time.day).toBe(145);
    expect(store.getState().session.debug.jumping).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    timers.mockRestore();
  });

  it('a synchronous stop after the first day also cancels the active chunk', () => {
    const original = store.getState().game!;
    unsubscribe = store.subscribe((state) => {
      if (state.tickSeq === 1) {
        unsubscribe?.();
        loop.stop();
      }
    });
    loop.stepDays(45);
    vi.runAllTimers();
    expect(original.time.day).toBe(1);
    expect(store.getState().session.debug.jumping).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});
