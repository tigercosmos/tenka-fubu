import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { perfMonitor } from '../../src/app/perfMonitor';
import { createGameLoopController } from '../../src/app/gameLoop';
import { resetGameStoreForTests, store } from '../../src/app/store';
import { canonicalStringify } from '../../src/core/state/serialize';
import type { CastleId } from '../../src/core/state/ids';
import { makeLoopTestState } from '../helpers/loopState';
import { createManualScheduler } from '../helpers/manualFrameScheduler';

const manual = createManualScheduler();
const loop = createGameLoopController(manual.scheduler);

beforeEach(() => {
  resetGameStoreForTests(makeLoopTestState({ day: 0 }));
  perfMonitor.reset();
});
afterEach(() => loop.stop());

describe('app-only performance telemetry plumbing', () => {
  it('derives fresh detached counts without caching or changing game state/RNG', () => {
    const game = store.getState().game!;
    const original = canonicalStringify(game);
    const snapshot = perfMonitor.getSnapshot(game);
    expect(snapshot.entityCounts).toEqual({
      castles: Object.keys(game.castles).length,
      districts: Object.keys(game.districts).length,
      officers: Object.keys(game.officers).length,
      armies: Object.keys(game.armies).length,
    });
    snapshot.entityCounts.castles = 999;
    expect(canonicalStringify(game)).toBe(original);
    const castleId = Object.keys(game.castles)[0]! as CastleId;
    delete game.castles[castleId];
    expect(perfMonitor.getSnapshot(game).entityCounts.castles).toBe(
      Object.keys(game.castles).length,
    );
    expect(perfMonitor.getSnapshot(null).entityCounts.castles).toBe(0);
  });

  it('samples actual unclamped frames while paused and viewport blocked without strategy mutations', () => {
    const game = store.getState().game!;
    const before = canonicalStringify(game);
    loop.start();
    manual.fire(0);
    manual.fire(1000);
    expect(perfMonitor.getSnapshot().fps).toBe(1);
    store.getState().actions.setViewportBlocked(true);
    manual.fire(2000);
    expect(perfMonitor.getSnapshot().fps).toBe(1);
    expect(canonicalStringify(game)).toBe(before);
    expect(store.getState().tickSeq).toBe(0);
  });

  it('stop/start forgets the inactive gap but preserves tick and system history', () => {
    perfMonitor.recordTick(4);
    perfMonitor.recordSystems({ ai: 2 });
    loop.start();
    manual.fire(0);
    manual.fire(20);
    loop.start(); // idempotent start does not erase active samples
    expect(perfMonitor.getSnapshot().fps).toBe(50);
    loop.stop();
    expect(manual.pendingCount()).toBe(0);
    expect(perfMonitor.getSnapshot()).toMatchObject({
      fps: 0,
      lastTickMs: 4,
      avgTickMs: 4,
      maxTickMs: 4,
      systemBreakdownMs: { ai: 2 },
    });
    loop.start();
    manual.fire(100000);
    expect(perfMonitor.getSnapshot().fps).toBe(0);
    manual.fire(100020);
    expect(perfMonitor.getSnapshot().fps).toBe(50);
  });
});
