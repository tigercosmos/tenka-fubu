import { beforeEach, expect, it } from 'vitest';
import { advanceDay } from '../../../src/core/systems';
import type { ExecutedDay } from '../../../src/app/dayExecutor';
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
beforeEach(() => {
  resetBridgeForTests();
  const game = makeLoopTestState({ debugMode: true });
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  cancelled = 0;
  resets = 0;
  configureDayExecutor({
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
  });
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
