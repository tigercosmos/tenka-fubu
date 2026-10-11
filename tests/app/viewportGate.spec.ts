import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureSaveSnapshot,
  dispatchCommand,
  initializeBridgeSession,
  resetBridgeForTests,
  resolvePendingEventChoice,
  runOneDay,
} from '../../src/app/bridge';
import { createGameLoopController } from '../../src/app/gameLoop';
import { resetGameStoreForTests, setGame, store } from '../../src/app/store';
import { createRuntimeEventEngine } from '../../src/core/systems/events/runtime';
import type { EventDef } from '../../src/core/systems/events/types';
import type { EventId } from '../../src/core/state/ids';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { buildTinyState } from '../fixtures/tiny';
import { createManualScheduler } from '../helpers/manualFrameScheduler';
import { makeLoopTestState, TEST_CLAN } from '../helpers/loopState';

beforeEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(makeLoopTestState({ debugMode: true, day: 0 }));
  uiStore.getState().actions.reset();
});
afterEach(() => {
  uiStore.getState().actions.reset();
  resetBridgeForTests();
  resetGameStoreForTests();
  vi.useRealTimers();
});
const grant = (gold: number) => ({
  type: 'debugGrant' as const,
  clanId: TEST_CLAN,
  gold,
  food: null,
  castleId: null,
});

describe('nonpersisted minimum viewport strategy gate', () => {
  it('pauses running time preserving resumeSpeed and never resumes automatically', () => {
    const actions = store.getState().actions;
    actions.setSpeed('x5');
    actions.setViewportBlocked(true);
    expect(store.getState().session).toMatchObject({
      viewportBlocked: true,
      speed: 'paused',
      resumeSpeed: 'x5',
      lastPauseReason: 'viewportTooSmall',
    });
    actions.setSpeed('x1');
    actions.resume();
    expect(store.getState().session).toMatchObject({
      speed: 'paused',
      resumeSpeed: 'x5',
      lastPauseReason: 'viewportTooSmall',
    });
    actions.setViewportBlocked(false);
    expect(store.getState().session).toMatchObject({
      viewportBlocked: false,
      speed: 'paused',
      resumeSpeed: 'x5',
    });
    actions.resume();
    expect(store.getState().session.speed).toBe('x5');
  });
  it.each(['user', 'modalOpen'] as const)(
    'preserves already paused %s ownership on entry',
    (reason) => {
      const actions = store.getState().actions;
      actions.setSpeed('x2');
      actions.requestPause(reason);
      actions.setViewportBlocked(true);
      expect(store.getState().session).toMatchObject({
        speed: 'paused',
        resumeSpeed: 'x2',
        lastPauseReason: reason,
      });
      actions.setViewportBlocked(false);
      expect(store.getState().session).toMatchObject({ speed: 'paused', lastPauseReason: reason });
    },
  );
  it('explicit runOneDay and blocked frames do not mutate core/RNG or drain accepted commands', () => {
    dispatchCommand(grant(123));
    const original = JSON.stringify(store.getState().game);
    const pending = captureSaveSnapshot(1).pendingCommands;
    store.getState().actions.setViewportBlocked(true);
    expect(runOneDay()).toEqual([]);
    // Even an invalid external session replacement cannot bypass the frame guard.
    store.setState((s) => ({ session: { ...s.session, speed: 'x5' } }));
    const scheduler = createManualScheduler(),
      loop = createGameLoopController(scheduler.scheduler);
    loop.start();
    scheduler.fire(0);
    scheduler.fire(250);
    scheduler.fire(500);
    loop.stop();
    expect(JSON.stringify(store.getState().game)).toBe(original);
    expect(store.getState().tickSeq).toBe(0);
    expect(captureSaveSnapshot(1).pendingCommands).toEqual(pending);
    expect(store.getState().session.pendingCommandCount).toBe(1);
  });
  it('prevents the real modal FIFO from restoring time while blocked or on later recovery', () => {
    const actions = store.getState().actions;
    actions.setSpeed('x2');
    uiStore.getState().actions.enqueueModal({ id: 'systemMenu', params: {}, pausesTime: true });
    expect(store.getState().session.lastPauseReason).toBe('modalOpen');
    actions.setViewportBlocked(true);
    uiStore.getState().actions.closeModal();
    expect(uiStore.getState().modal).toBeNull();
    expect(store.getState().session).toMatchObject({
      speed: 'paused',
      resumeSpeed: 'x2',
      lastPauseReason: 'modalOpen',
    });
    actions.setViewportBlocked(false);
    expect(store.getState().session.speed).toBe('paused');
    actions.resume();
    expect(store.getState().session.speed).toBe('x2');
  });
  it('rechecks the gate between ticks in a multi-tick frame', () => {
    let blocked = false;
    const unsubscribe = store.subscribe((s) => {
      if (s.tickSeq === 1 && !blocked) {
        blocked = true;
        s.actions.setViewportBlocked(true);
      }
    });
    const scheduler = createManualScheduler(),
      loop = createGameLoopController(scheduler.scheduler);
    store.getState().actions.setSpeed('x5');
    loop.start();
    scheduler.fire(0);
    scheduler.fire(250);
    expect(store.getState().tickSeq).toBe(1);
    expect(store.getState().game?.time.day).toBe(1);
    unsubscribe();
    loop.stop();
  });
  it('cancels queued debug chunks without consuming later commands or resuming on recovery', () => {
    vi.useFakeTimers();
    const loop = createGameLoopController(createManualScheduler().scheduler);
    loop.stepDays(60);
    expect(store.getState().tickSeq).toBe(30);
    dispatchCommand(grant(91));
    const snapshot = JSON.stringify(store.getState().game);
    store.getState().actions.setViewportBlocked(true);
    loop.stepDays(5);
    store.getState().actions.setViewportBlocked(false);
    vi.runAllTimers();
    expect(JSON.stringify(store.getState().game)).toBe(snapshot);
    expect(store.getState().session.debug.jumping).toBeNull();
    expect(captureSaveSnapshot(1).pendingCommands).toEqual([grant(91)]);
    expect(store.getState().session.speed).toBe('paused');
    loop.stop();
  });
  it('preserves the gate when a new or loaded game and its queue are installed', () => {
    store.getState().actions.setViewportBlocked(true);
    const game = makeLoopTestState({ debugMode: true });
    setGame(game);
    initializeBridgeSession(game, [grant(7)], { loaded: true });
    expect(store.getState().session.viewportBlocked).toBe(true);
    expect(runOneDay()).toEqual([]);
    expect(captureSaveSnapshot(1).pendingCommands).toEqual([grant(7)]);
  });
  it('cannot resolve a real mandatory choice while blocked, but permits explicit resolution after recovery', async () => {
    const game = buildTinyState();
    resetGameStoreForTests(game);
    const def: EventDef = {
      id: 'evt.viewport-choice' as EventId,
      kind: 'generic',
      priority: 1,
      target: 'player',
      ownerCandidates: ['$clan'],
      trigger: {
        from: null,
        to: null,
        check: 'monthStart',
        hooks: [],
        conditions: [],
        probability: 1,
        once: true,
        cooldownDays: 0,
        cooldownKey: null,
      },
      cutscene: { title: 'Choice', body: 'Choice', monClanId: '$clan' },
      effects: [],
      choices: [
        {
          label: 'Accept',
          conditions: [],
          aiWeight: 1,
          effects: [{ op: 'addGold', clanId: '$clan', amount: 7 }],
        },
      ],
    };
    const engine = createRuntimeEventEngine([def]);
    initializeBridgeSession(game, [], { eventEngine: engine });
    engine.run(game, () => {});
    expect(game.events.pendingChoiceEventId).toBe(def.id);
    store.getState().actions.setViewportBlocked(true);
    const original = JSON.stringify(game),
      gold = game.clans[game.meta.playerClanId]!.gold;
    const command = {
      type: 'resolveEventChoice' as const,
      clanId: game.meta.playerClanId,
      eventId: def.id,
      choiceIndex: 0,
    };
    expect((await resolvePendingEventChoice(command)).ok).toBe(false);
    expect(JSON.stringify(game)).toBe(original);
    expect(captureSaveSnapshot(1).pendingCommands).toEqual([]);
    store.getState().actions.setViewportBlocked(false);
    expect((await resolvePendingEventChoice(command)).ok).toBe(true);
    expect(game.events.pendingChoiceEventId).toBeNull();
    expect(game.clans[game.meta.playerClanId]!.gold).toBe(gold + 7);
  });
});
