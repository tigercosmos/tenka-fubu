import { beforeEach, expect, it, vi } from 'vitest';
import { advanceDay } from '../../../src/core/systems';
import type { DayExecutor, ExecutedDay } from '../../../src/app/dayExecutor';
import {
  configureDayExecutor,
  dispatchCommand,
  initializeBridgeSession,
  runOneDayAsync,
  runOneDay,
  captureSaveSnapshot,
  exportCommandLog,
  resetBridgeForTests,
  isDayPending,
  onAutoPauseReasons,
  waitSimulationIdle,
} from '../../../src/app/bridge';
import { resetGameStoreForTests, store } from '../../../src/app/store';
import { makeLoopTestState, TEST_CLAN } from '../../helpers/loopState';
import type { GameState } from '../../../src/core/state/gameState';
import type { CommandEnvelope } from '../../../src/core/commands/types';

let finish: (day: ExecutedDay) => void;
let snapshot: GameState;
let commands: readonly CommandEnvelope[];
let cancelled: number;
let resets: number;
let executor: DayExecutor;
beforeEach(() => {
  resetBridgeForTests();
  const game = makeLoopTestState({ debugMode: true });
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  cancelled = 0;
  resets = 0;
  executor = {
    epoch: 1,
    waitReady() {
      return Promise.resolve({ epoch: this.epoch, backend: 'rust-wasm', engineAbi: 1 } as const);
    },
    subscribeInitializationFailure() {
      return () => {};
    },
    execute(state, queue, _events, consumedAiOrders = 0) {
      snapshot = structuredClone(state);
      snapshot.ai.pendingOrders.splice(0, consumedAiOrders);
      commands = structuredClone(queue);
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
    cancelPending() {
      cancelled++;
    },
    resetSession() {
      resets++;
    },
  };
  configureDayExecutor(executor);
});
function grant(gold: number) {
  return { type: 'debugGrant' as const, clanId: TEST_CLAN, gold, food: null, castleId: null };
}
function complete() {
  const result = advanceDay(snapshot, commands);
  finish({ state: snapshot, result, fired: [], backend: 'rust-wasm', computeMs: 2 });
}
it('keeps committed state intact while computing, consumes only the reserved prefix and preserves identities', async () => {
  const game = store.getState().game!;
  const clan = game.clans[TEST_CLAN];
  dispatchCommand(grant(7));
  const pending = runOneDayAsync();
  await Promise.resolve();
  expect(game.meta.stateVersion).toBe(0);
  dispatchCommand(grant(11));
  complete();
  await pending;
  expect(game.clans[TEST_CLAN]).toBe(clan);
  expect(game.meta.stateVersion).toBe(1);
  expect(store.getState().session.pendingCommandCount).toBe(1);
  expect(exportCommandLog().entries).toHaveLength(1);
  runOneDay();
  expect(game.meta.lastAppliedCmdSeq).toBe(2);
});
it('save cancels speculative work and retains pending player intent; late replies cannot mutate the session', async () => {
  const game = store.getState().game!;
  dispatchCommand(grant(7));
  const pending = runOneDayAsync();
  await Promise.resolve();
  const save = captureSaveSnapshot(123);
  expect(cancelled).toBe(1);
  expect(isDayPending()).toBe(false);
  expect(save.pendingCommands).toEqual([grant(7)]);
  complete();
  await pending;
  expect(game.meta.stateVersion).toBe(0);
  runOneDay();
  expect(game.meta.lastAppliedCmdSeq).toBe(1);
});
it('discards an old day when a new session takes ownership', async () => {
  const old = store.getState().game!;
  const pending = runOneDayAsync();
  await Promise.resolve();
  const next = makeLoopTestState({ debugMode: true });
  resetGameStoreForTests(next);
  initializeBridgeSession(next);
  complete();
  await pending;
  expect(old.meta.stateVersion).toBe(0);
  expect(next.meta.stateVersion).toBe(0);
  expect(store.getState().session.fatalError).toBeNull();
});

it('cancelling reserved AI closes sequence gaps while retaining original AI and later player inputs', async () => {
  const game = store.getState().game!;
  game.ai.pendingOrders.push({ command: grant(3), authority: { kind: 'clan', clanId: TEST_CLAN } });
  const pending = runOneDayAsync();
  await Promise.resolve();
  dispatchCommand(grant(9));
  const save = captureSaveSnapshot(123);
  expect(game.ai.pendingOrders).toHaveLength(1);
  expect(save.pendingCommands).toEqual([grant(9)]);
  complete();
  await pending;
  runOneDay();
  expect(game.meta.lastAppliedCmdSeq).toBe(2);
  expect(game.ai.pendingOrders.every((order) => order.command.type !== 'debugGrant')).toBe(true);
});

it('reports publication errors after commit without restoring consumed commands', async () => {
  dispatchCommand(grant(7));
  onAutoPauseReasons(() => {
    throw new Error('publication failed');
  });
  const pending = runOneDayAsync();
  await Promise.resolve();
  complete();
  await pending;
  expect(store.getState().game!.meta.stateVersion).toBe(1);
  expect(store.getState().session.pendingCommandCount).toBe(0);
  expect(store.getState().session.fatalError).not.toBeNull();
  expect(cancelled).toBe(0);
});

it('starts a new Worker generation for an explicitly initialized idle session', () => {
  const game = store.getState().game!;
  initializeBridgeSession(game);
  expect(resets).toBe(1);
  const next = makeLoopTestState({ debugMode: true });
  resetGameStoreForTests(next);
  initializeBridgeSession(next);
  expect(resets).toBe(2);
});

function deferredReady(epoch: number) {
  let resolve!: (ready: Awaited<ReturnType<DayExecutor['waitReady']>>) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<Awaited<ReturnType<DayExecutor['waitReady']>>>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  void promise.catch(() => {});
  return { promise, reject, ready: () => resolve({ epoch, backend: 'rust-wasm', engineAbi: 1 }) };
}

it('joins actual readiness without advancing state, RNG, commands or a worker day', async () => {
  const ready = deferredReady(1);
  executor.waitReady = () => ready.promise;
  const state = structuredClone(store.getState().game);
  const log = exportCommandLog();
  let finished = false;
  const idle = waitSimulationIdle().then(() => {
    finished = true;
  });
  await Promise.resolve();
  expect(finished).toBe(false);
  ready.ready();
  await idle;
  expect(store.getState().game).toEqual(state);
  expect(exportCommandLog()).toEqual(log);
});

it('drains the posted day and then joins the current readiness', async () => {
  const ready = deferredReady(1);
  executor.waitReady = () => ready.promise;
  const pending = runOneDayAsync();
  let finished = false;
  const idle = waitSimulationIdle().then(() => {
    finished = true;
  });
  ready.ready();
  await Promise.resolve();
  expect(finished).toBe(false);
  complete();
  await pending;
  await idle;
  expect(store.getState().game!.meta.stateVersion).toBe(1);
});

it('rejoins a reset epoch instead of accepting a retired ready result', async () => {
  let epoch = 1;
  Object.defineProperty(executor, 'epoch', { get: () => epoch });
  const old = deferredReady(1);
  const next = deferredReady(2);
  executor.waitReady = () => (epoch === 1 ? old.promise : next.promise);
  let finished = false;
  const idle = waitSimulationIdle().then(() => {
    finished = true;
  });
  await Promise.resolve();
  epoch = 2;
  old.ready();
  await new Promise((resolve) => setTimeout(resolve, 5));
  expect(finished).toBe(false);
  next.ready();
  await idle;
});

it('rejects current readiness failure and invalid ABI rather than using synchronous fallback', async () => {
  executor.waitReady = () => Promise.reject(new Error('Rust fetch failed'));
  await expect(waitSimulationIdle()).rejects.toThrow('Rust fetch failed');
  executor.waitReady = () => Promise.resolve({ epoch: 1, backend: 'rust-wasm', engineAbi: 2 });
  await expect(waitSimulationIdle()).rejects.toThrow('invalid readiness');
  expect(store.getState().game!.meta.stateVersion).toBe(0);
});

it('bounds a missing ready message even without any posted tick and clears its deadline', async () => {
  vi.useFakeTimers();
  try {
    executor.waitReady = () => deferredReady(1).promise;
    const assertion = expect(waitSimulationIdle(20)).rejects.toThrow('timed out');
    void assertion.catch(() => {});
    await vi.advanceTimersByTimeAsync(20);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
    executor.waitReady = () => Promise.resolve({ epoch: 1, backend: 'rust-wasm', engineAbi: 1 });
    await waitSimulationIdle(20);
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});

it('reports cached current-epoch initialization failure on late configure', () => {
  executor.subscribeInitializationFailure = (listener) => {
    listener(new Error('cached Rust failure'), executor.epoch);
    return () => {};
  };
  configureDayExecutor(executor);
  expect(store.getState().session.fatalError?.message).toContain('cached Rust failure');
});

it('invalidates retired subscriptions before replacement cancellation and test reset', async () => {
  let listener!: (error: Error, epoch: number) => void;
  let unsubscribed = 0;
  executor.subscribeInitializationFailure = (callback) => {
    listener = callback;
    return () => {
      unsubscribed++;
    };
  };
  configureDayExecutor(executor);
  executor.cancelPending = () => listener(new Error('synchronous retired cancellation'), 1);
  const pending = runOneDayAsync();
  configureDayExecutor(null);
  expect(unsubscribed).toBe(1);
  expect(store.getState().session.fatalError).toBeNull();
  listener(new Error('late old failure'), 1);
  expect(store.getState().session.fatalError).toBeNull();
  complete();
  await pending;
  configureDayExecutor(executor);
  resetBridgeForTests();
  expect(unsubscribed).toBe(2);
  listener(new Error('after test reset'), 1);
  expect(store.getState().session.fatalError).toBeNull();
});

it('ignores an old epoch failure while accepting actual current initialization failure', () => {
  let listener!: (error: Error, epoch: number) => void;
  executor.subscribeInitializationFailure = (callback) => {
    listener = callback;
    return () => {};
  };
  configureDayExecutor(executor);
  listener(new Error('retired epoch'), 0);
  expect(store.getState().session.fatalError).toBeNull();
  listener(new Error('current initialization'), 1);
  expect(store.getState().session.fatalError?.message).toContain('current initialization');
});

it('rejoins a replacement when its retired initialization rejects without reporting fatal', async () => {
  const old = deferredReady(1);
  executor.waitReady = () => old.promise;
  const idle = waitSimulationIdle();
  await Promise.resolve();
  const next = deferredReady(2);
  configureDayExecutor({ ...executor, epoch: 2, waitReady: () => next.promise });
  old.reject(new Error('retired worker cancelled'));
  await new Promise((resolve) => setTimeout(resolve, 5));
  expect(store.getState().session.fatalError).toBeNull();
  next.ready();
  await idle;
  expect(store.getState().game!.meta.stateVersion).toBe(0);
});

it('bounds repeated epoch replacement using one deadline rather than restarting it', async () => {
  vi.useFakeTimers();
  try {
    let epoch = 1;
    let ready = deferredReady(epoch);
    Object.defineProperty(executor, 'epoch', { get: () => epoch });
    executor.waitReady = () => ready.promise;
    const assertion = expect(waitSimulationIdle(20)).rejects.toThrow('timed out');
    void assertion.catch(() => {});
    await vi.advanceTimersByTimeAsync(7);
    const retired = ready;
    epoch++;
    ready = deferredReady(epoch);
    retired.reject(new Error('reset'));
    await vi.advanceTimersByTimeAsync(7);
    const retiredAgain = ready;
    epoch++;
    ready = deferredReady(epoch);
    retiredAgain.reject(new Error('reset again'));
    await vi.advanceTimersByTimeAsync(6);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
