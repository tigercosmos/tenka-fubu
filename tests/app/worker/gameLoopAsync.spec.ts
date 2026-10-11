import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as bridge from '../../../src/app/bridge';
import { createGameLoopController } from '../../../src/app/gameLoop';
import { resetGameStoreForTests, store } from '../../../src/app/store';
import type { GameEvent } from '../../../src/core/state/events';
import { makeLoopTestState } from '../../helpers/loopState';
import { createManualScheduler } from '../../helpers/manualFrameScheduler';

describe('Worker game-loop scheduling and session ownership', () => {
  let pending = false;
  let resolve: ((events: GameEvent[]) => void) | null = null;
  let loop: ReturnType<typeof createGameLoopController>;
  let scheduler: ReturnType<typeof createManualScheduler>;
  beforeEach(() => {
    resetGameStoreForTests(makeLoopTestState({ day: 0 }));
    pending = false;
    resolve = null;
    scheduler = createManualScheduler();
    loop = createGameLoopController(scheduler.scheduler);
    vi.spyOn(bridge, 'hasAsyncDayExecutor').mockReturnValue(true);
    vi.spyOn(bridge, 'isDayPending').mockImplementation(() => pending);
    vi.spyOn(bridge, 'runOneDayAsync').mockImplementation(() => {
      pending = true;
      return new Promise<GameEvent[]>((done) => {
        resolve = (events) => {
          pending = false;
          done(events);
        };
      });
    });
    vi.spyOn(bridge, 'cancelPendingDay').mockImplementation(() => {
      resolve?.([]);
      resolve = null;
    });
    vi.spyOn(bridge, 'runOneDay');
  });
  afterEach(() => {
    loop.stop();
    vi.restoreAllMocks();
  });

  it('keeps frames responsive and submits one day while the Worker is still computing', async () => {
    loop.setSpeed('x5');
    loop.start();
    scheduler.fire(0);
    scheduler.fire(120);
    for (let now = 240; now <= 1200; now += 120) scheduler.fire(now);
    expect(bridge.runOneDayAsync).toHaveBeenCalledTimes(1);
    expect(bridge.runOneDay).not.toHaveBeenCalled();
    expect(loop.isRunning()).toBe(true);
    resolve!([]);
    await Promise.resolve();
    scheduler.fire(1320);
    expect(bridge.runOneDayAsync).toHaveBeenCalledTimes(2);
  });

  it('pause cancels the pending transaction and cannot schedule a replacement while paused', async () => {
    loop.setSpeed('x5');
    loop.start();
    scheduler.fire(0);
    scheduler.fire(120);
    loop.requestPause('user');
    await Promise.resolve();
    for (let now = 240; now <= 1200; now += 120) scheduler.fire(now);
    expect(bridge.cancelPendingDay).toHaveBeenCalledWith('game loop paused: user');
    expect(bridge.runOneDayAsync).toHaveBeenCalledTimes(1);
    expect(store.getState().game!.time.day).toBe(0);
  });

  it('debug advance awaits each completed day and abandons the old session before another submission', async () => {
    loop.stepDays(3);
    expect(bridge.runOneDayAsync).toHaveBeenCalledTimes(1);
    const original = store.getState().game!;
    original.meta.stateVersion++;
    original.time.day++;
    resolve!([]);
    await Promise.resolve();
    expect(bridge.runOneDayAsync).toHaveBeenCalledTimes(2);
    const replacement = makeLoopTestState({ day: 10 });
    resetGameStoreForTests(replacement);
    resolve!([]);
    await Promise.resolve();
    expect(bridge.runOneDayAsync).toHaveBeenCalledTimes(2);
    expect(store.getState().game).toBe(replacement);
    expect(replacement.time.day).toBe(10);
    expect(bridge.runOneDay).not.toHaveBeenCalled();
  });
});
