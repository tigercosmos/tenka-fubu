import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dispatchCommand,
  exportCommandLog,
  initializeBridgeSession,
  onAutoPauseReasons,
  registerDebugLiveArmyDriver,
  resetBridgeForTests,
  runOneDay,
} from '../../src/app/bridge';
import { resetGameStoreForTests, setGame, store } from '../../src/app/store';
import { buildTinyState, CLAN_ALPHA, OFF_ALPHA_BUSHO } from '../fixtures/tiny';
import { checkDevInvariantsAfterTick } from '../../src/app/devInvariants';
import * as invariants from '../../src/core/state/invariants';
import * as systems from '../../src/core/systems/index';
import { CoreError } from '../../src/core/errors';
import { perfMonitor } from '../../src/app/perfMonitor';
import { createRuntimeEventEngine } from '../../src/core/systems/events/runtime';
import type { EventDef } from '../../src/core/systems/events/types';
import type { EventId } from '../../src/core/state/ids';
import { calendarToDay, dayToCalendar } from '../../src/core/systems/time';
import {
  getEventPresentationSnapshot,
  subscribeEventPresentations,
} from '../../src/app/events/eventPresentationQueue';
import { useUIStore } from '../../src/ui/hooks/uiStore';
import { settingsStore } from '../../src/app/settings/runtime';
import { buildFullState } from '../helpers/fullState';
import { prepareLiveMapWorkload } from '../../src/app/liveMapWorkload';

function definition(): EventDef {
  return {
    id: 'evt.devcheck' as EventId,
    kind: 'historical',
    priority: 20,
    target: 'fixed',
    ownerCandidates: [CLAN_ALPHA],
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
    cutscene: { title: 'Diagnostic fixture', body: 'Pending choice', monClanId: CLAN_ALPHA },
    effects: [],
    choices: [{ label: 'Accept', conditions: [], aiWeight: 1, effects: [] }],
  };
}
function eventSession(version: number) {
  const game = buildTinyState();
  const day = calendarToDay(1560, 4, 30);
  game.time = { day, ...dayToCalendar(day) };
  game.meta.stateVersion = version;
  const engine = createRuntimeEventEngine([definition()]);
  resetGameStoreForTests(game);
  initializeBridgeSession(game, [], { eventEngine: engine });
  return { game, engine };
}

beforeEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(null);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  useUIStore.getState().actions.reset();
  settingsStore.getState().resetSettings();
});
afterEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(null);
  vi.restoreAllMocks();
  useUIStore.getState().actions.reset();
  settingsStore.getState().resetSettings();
});

describe('DEV completed-tick invariants', () => {
  it('fails before publishing the thirtieth completed tick, without rolling back core progress', () => {
    const game = buildTinyState();
    game.meta.stateVersion = 29;
    game.officers[OFF_ALPHA_BUSHO]!.loyalty = 101;
    resetGameStoreForTests(game);
    initializeBridgeSession(game);
    const day = game.time.day;
    expect(runOneDay()).toEqual([]);
    expect(store.getState().session.fatalError).toMatchObject({ code: 'INVARIANT_VIOLATION' });
    expect(store.getState().tickSeq).toBe(0);
    expect(game.time.day).toBe(day + 1);
    expect(game.meta.stateVersion).toBe(30);
  });
  it.each([29, 30, 60, 0])('uses completed version%s without state or RNG changes', (version) => {
    const game = buildTinyState();
    game.meta.stateVersion = version;
    const before = structuredClone(game),
      validate = vi.spyOn(invariants, 'validateState');
    checkDevInvariantsAfterTick(game, version - 1, true);
    expect(validate).toHaveBeenCalledTimes(version === 30 || version === 60 ? 1 : 0);
    expect(game).toEqual(before);
  });
  it('does not check unchanged ticks or production debug sessions', () => {
    const game = buildTinyState();
    game.meta.stateVersion = 30;
    game.meta.debugMode = true;
    const validate = vi.spyOn(invariants, 'validateState');
    checkDevInvariantsAfterTick(game, 30, true);
    checkDevInvariantsAfterTick(game, 29, false);
    expect(validate).not.toHaveBeenCalled();
  });
  it('preserves every violation detail in the typed error', () => {
    const game = buildTinyState();
    game.meta.stateVersion = 30;
    game.officers[OFF_ALPHA_BUSHO]!.loyalty = 101;
    const violations = invariants.validateState(game);
    try {
      checkDevInvariantsAfterTick(game, 29, true);
      throw new Error('Expected diagnostic');
    } catch (error) {
      expect(error).toBeInstanceOf(CoreError);
      expect(error).toMatchObject({ code: 'INVARIANT_VIOLATION', details: violations });
      for (const violation of violations)
        expect((error as CoreError).message).toContain(violation.message);
    }
  });
  it('uses persisted cadence across replacement sessions', () => {
    const validate = vi.spyOn(invariants, 'validateState');
    for (let session = 0; session < 2; session++) {
      const game = buildTinyState();
      game.meta.stateVersion = 29;
      resetGameStoreForTests(game);
      initializeBridgeSession(game);
      runOneDay();
    }
    expect(validate).toHaveBeenCalledTimes(2);
  });
  it('matches the same healthy real core tick including all state and RNG', () => {
    const game = buildTinyState();
    game.meta.stateVersion = 29;
    const control = structuredClone(game);
    resetGameStoreForTests(game);
    initializeBridgeSession(game);
    const expected = systems.advanceDay(control, []);
    expect(runOneDay()).toEqual(expected.events);
    expect(game).toEqual(control);
    expect(game.rng).toEqual(control.rng);
    expect(store.getState().session.fatalError).toBeNull();
    expect(store.getState().tickSeq).toBe(1);
  });
  it('does not validate or publish when advanceDay fails', () => {
    const game = buildTinyState();
    game.meta.stateVersion = 29;
    resetGameStoreForTests(game);
    initializeBridgeSession(game);
    vi.spyOn(systems, 'advanceDay').mockImplementation(() => {
      throw new CoreError('DATA_INTEGRITY', 'tick failure');
    });
    const validate = vi.spyOn(invariants, 'validateState');
    expect(runOneDay()).toEqual([]);
    expect(validate).not.toHaveBeenCalled();
    expect(game.meta.stateVersion).toBe(29);
    expect(store.getState().tickSeq).toBe(0);
    expect(store.getState().session.fatalError?.code).toBe('DATA_INTEGRITY');
  });
  it.each([28, 29])(
    'publishes pending choice after diagnostic only on due version%s',
    (version) => {
      const { game, engine } = eventSession(version),
        order: string[] = [];
      const unsubscribe = subscribeEventPresentations(() => {
        if (getEventPresentationSnapshot().length) order.push('publish');
      });
      engine.subscribeFired(() => order.push('core'));
      const actual = invariants.validateState;
      vi.spyOn(invariants, 'validateState').mockImplementation((state) => {
        order.push('validate');
        return actual(state);
      });
      runOneDay();
      unsubscribe();
      expect(order).toEqual(version === 29 ? ['core', 'validate', 'publish'] : ['publish', 'core']);
      expect(getEventPresentationSnapshot()[0]).toMatchObject({
        kind: 'pending',
        eventId: definition().id,
      });
      expect(game.events.pendingChoiceEventId).toBe(definition().id);
    },
  );
  it('records commands/perf before failure but discards event, summary, tick and observer publication', () => {
    const { game } = eventSession(29);
    game.meta.debugMode = true;
    expect(
      dispatchCommand({
        type: 'debugGrant',
        clanId: CLAN_ALPHA,
        gold: 7,
        food: null,
        castleId: null,
      }),
    ).toEqual({ ok: true });
    const tick = vi.spyOn(perfMonitor, 'recordTick'),
      systemsPerf = vi.spyOn(perfMonitor, 'recordSystems');
    const autoPause = vi.fn();
    onAutoPauseReasons(autoPause);
    vi.spyOn(invariants, 'validateState').mockImplementation(() => {
      expect(tick).toHaveBeenCalledTimes(1);
      expect(systemsPerf).toHaveBeenCalledTimes(1);
      expect(exportCommandLog().entries).toHaveLength(1);
      return [{ inv: 'INV-16', message: 'diagnostic fixture failure', refs: [OFF_ALPHA_BUSHO] }];
    });
    expect(runOneDay()).toEqual([]);
    expect(getEventPresentationSnapshot()).toEqual([]);
    expect(useUIStore.getState().modal).toBeNull();
    expect(store.getState().tickSeq).toBe(0);
    expect(autoPause).not.toHaveBeenCalled();
    expect(game.events.pendingChoiceEventId).toBe(definition().id);
    expect(game.meta.stateVersion).toBe(30);
    expect(store.getState().session.fatalError?.code).toBe('INVARIANT_VIOLATION');
  });
  it('discards old notices/diagnostics when a core subscriber replaces the session', () => {
    const { game, engine } = eventSession(29),
      replacement = buildTinyState();
    const validate = vi.spyOn(invariants, 'validateState');
    const tickPerf = vi.spyOn(perfMonitor, 'recordTick');
    const replaced = vi.fn();
    engine.subscribeFired(() => {
      setGame(replacement);
      initializeBridgeSession(replacement);
      replaced();
    });
    expect(runOneDay()).toEqual([]);
    expect(validate).not.toHaveBeenCalled();
    expect(replaced).toHaveBeenCalledTimes(1);
    expect(getEventPresentationSnapshot()).toEqual([]);
    expect(store.getState().game).toBe(replacement);
    expect(store.getState().session.fatalError).toBeNull();
    expect(exportCommandLog().entries).toEqual([]);
    expect(tickPerf).not.toHaveBeenCalled();
    expect(game.meta.stateVersion).toBe(30);
    expect(replacement.meta.stateVersion).toBe(0);
  });
  it('does not fatal a new session installed by live-driver disposal', async () => {
    const prepared = prepareLiveMapWorkload(await buildFullState({ seed: 15600519 }));
    const game = prepared.game,
      replacement = buildTinyState();
    game.meta.stateVersion = 29;
    resetGameStoreForTests(game);
    initializeBridgeSession(game);
    store.getState().actions.setScreen('main');
    const afterDay = vi.fn(),
      disposed = vi.fn(() => {
        setGame(replacement);
        initializeBridgeSession(replacement);
      });
    registerDebugLiveArmyDriver(game, {
      slots: prepared.slots,
      beforeDay: () => [],
      afterDay,
      dispose: disposed,
    });
    vi.spyOn(invariants, 'validateState').mockReturnValue([
      { inv: 'INV-16', message: 'controlled diagnostic failure', refs: [OFF_ALPHA_BUSHO] },
    ]);
    expect(runOneDay()).toEqual([]);
    expect(disposed).toHaveBeenCalledWith('tick-failed');
    expect(disposed).toHaveBeenCalledTimes(1);
    expect(afterDay).not.toHaveBeenCalled();
    expect(store.getState().game).toBe(replacement);
    expect(store.getState().session.fatalError).toBeNull();
    expect(exportCommandLog().entries).toEqual([]);
    expect(game.meta.stateVersion).toBe(30);
  });
});
