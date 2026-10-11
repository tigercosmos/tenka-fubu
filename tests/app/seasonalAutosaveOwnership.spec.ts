import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureSaveSnapshot,
  dispatchCommand,
  getBridgeProgressMark,
  initializeBridgeSession,
  onAutoPauseReasons,
  registerSeasonalAutosave,
  resetBridgeForTests,
  runOneDay,
} from '../../src/app/bridge';
import { resetGameStoreForTests, setGame, store } from '../../src/app/store';
import { createGameLoopController } from '../../src/app/gameLoop';
import { monthSummaryStore } from '../../src/app/monthSummaryFlow';
import { createSaveSessionController } from '../../src/app/persistence/saveSession';
import { createSessionProgressBinding } from '../../src/app/persistence/sessionProgress';
import { createMemorySaveStorage } from '../../src/app/persistence/storage';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { validateState } from '../../src/core/state/invariants';
import { dayToCalendar } from '../../src/core/systems/time';
import { buildTinyState, CLAN_ALPHA, DIST_A1X } from '../fixtures/tiny';

const cleanup: (() => void)[] = [];
beforeEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(null);
});
afterEach(() => {
  for (const dispose of cleanup.splice(0).reverse()) dispose();
  resetBridgeForTests();
  resetGameStoreForTests(null);
});

function gameAt(day: number) {
  const game = buildTinyState();
  game.time = { day, ...dayToCalendar(day) };
  expect(validateState(game)).toEqual([]);
  return game;
}

function setup(day: number) {
  const game = gameAt(day);
  resetGameStoreForTests(game);
  store.getState().actions.setScreen('main');
  initializeBridgeSession(game);
  const memory = createMemorySaveStorage();
  const write = vi.spyOn(memory, 'setMany');
  const progress = createSessionProgressBinding({
    getSession: () => store.getState().game,
    getMark: getBridgeProgressMark,
    subscribe: (listener) => store.subscribe(listener),
    now: () => 0,
    target: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
  });
  cleanup.push(progress.install());
  const complete = vi.spyOn(progress, 'completeSave');
  const controller = createSaveSessionController({
    adapter: memory,
    progress,
    getSession: () => store.getState().game,
    captureSnapshot: captureSaveSnapshot,
    wallNow: () => 123,
    appVersion: 'test',
  });
  controller.resetSession();
  const saves: Promise<unknown>[] = [];
  const seasonal = vi.fn(() => saves.push(controller.saveSeasonSnapshot()));
  cleanup.push(registerSeasonalAutosave(seasonal));
  const autoPause = vi.fn();
  onAutoPauseReasons(autoPause);
  return { game, memory, write, progress, complete, controller, saves, seasonal, autoPause };
}

const command = {
  type: 'setDevelopFocus' as const,
  clanId: CLAN_ALPHA,
  districtId: DIST_A1X,
  focus: 'commerce' as const,
};

describe('seasonal autosave original tick ownership', () => {
  it('does not publish old tick counters after replacement at actual month-summary publication', async () => {
    const h = setup(59);
    const decoded = decodeSave(encodeSave(gameAt(90), 456));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.code);
    const replacement = decoded.saveFile.state;
    const replacementBefore = structuredClone(replacement);
    expect(dispatchCommand(command).ok).toBe(true);
    let replacementSession: ReturnType<typeof store.getState>['session'] | null = null;
    cleanup.push(
      monthSummaryStore.subscribe((current) => {
        if (replacementSession !== null || current.view?.day !== 60) return;
        setGame(replacement);
        initializeBridgeSession(replacement, [], { loaded: true });
        store.setState({ tickSeq: 0 });
        h.controller.resetSession();
        expect(dispatchCommand(command).ok).toBe(true);
        replacementSession = store.getState().session;
      }),
    );
    const events = runOneDay();
    await Promise.all(h.saves);
    expect(replacementSession).not.toBeNull();
    expect(h.game.time.day).toBe(60);
    expect(h.game.meta.lastAppliedCmdSeq).toBe(1);
    expect(events.some((event) => event.type === 'time.seasonStart')).toBe(true);
    expect(store.getState().game).toBe(replacement);
    expect(replacement).toEqual(replacementBefore);
    expect(validateState(h.game)).toEqual([]);
    expect(validateState(replacement)).toEqual([]);
    expect(getBridgeProgressMark()?.pendingCommands).toEqual([command]);
    expect({
      tickSeq: store.getState().tickSeq,
      sameSession: store.getState().session === replacementSession,
      pendingCount: store.getState().session.pendingCommandCount,
      seasonalCalls: h.seasonal.mock.calls.length,
      writes: h.write.mock.calls.length,
      completedMarks: h.complete.mock.calls.length,
      autoPauseCalls: h.autoPause.mock.calls.length,
    }).toEqual({
      tickSeq: 0,
      sameSession: true,
      pendingCount: 1,
      seasonalCalls: 0,
      writes: 0,
      completedMarks: 0,
      autoPauseCalls: 0,
    });
    expect(h.progress.isDirty()).toBe(true);
  });

  it('does not save or complete replacement progress after a native load at tick publication', async () => {
    const h = setup(59);
    const decoded = decodeSave(encodeSave(gameAt(90), 456));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.code);
    const replacement = decoded.saveFile.state;
    expect(validateState(replacement)).toEqual([]);
    const replacementBefore = structuredClone(replacement);
    expect(dispatchCommand(command).ok).toBe(true);
    let replaced = false;
    cleanup.push(
      store.subscribe((current, previous) => {
        if (replaced || current.tickSeq === previous.tickSeq) return;
        replaced = true;
        setGame(replacement);
        initializeBridgeSession(replacement, [], { loaded: true });
        h.controller.resetSession();
        expect(dispatchCommand(command).ok).toBe(true);
      }),
    );
    const events = runOneDay();
    await Promise.all(h.saves);
    expect(replaced).toBe(true);
    // The completed original tick/command is not rolled back by the ownership guard.
    expect(h.game.time.day).toBe(60);
    expect(h.game.districts[DIST_A1X]!.developFocus).toBe('commerce');
    expect(h.game.meta.lastAppliedCmdSeq).toBe(1);
    expect(events.some((event) => event.type === 'time.seasonStart')).toBe(true);
    expect(store.getState().game).toBe(replacement);
    expect(getBridgeProgressMark()?.pendingCommands).toEqual([command]);
    expect(replacement.time.day).toBe(90);
    expect(replacement).toEqual(replacementBefore);
    expect(validateState(h.game)).toEqual([]);
    expect(validateState(replacement)).toEqual([]);
    expect({
      seasonalCalls: h.seasonal.mock.calls.length,
      writes: h.write.mock.calls.length,
      storedKeys: await h.memory.keys(),
      completedMarks: h.complete.mock.calls.length,
      replacementDirty: h.progress.isDirty(),
      autoPauseCalls: h.autoPause.mock.calls.length,
    }).toEqual({
      seasonalCalls: 0,
      writes: 0,
      storedKeys: [],
      completedMarks: 0,
      replacementDirty: true,
      autoPauseCalls: 0,
    });
  });

  it('saves the same owned season snapshot and completes its actual progress mark', async () => {
    const h = setup(59);
    expect(dispatchCommand(command).ok).toBe(true);
    runOneDay();
    await Promise.all(h.saves);
    expect(h.seasonal).toHaveBeenCalledOnce();
    expect(h.write).toHaveBeenCalledOnce();
    expect(h.complete).toHaveBeenCalledOnce();
    expect(h.progress.isDirty()).toBe(false);
    expect(await h.controller.store.loadFromSlot('auto:1')).toMatchObject({
      ok: true,
      save: { state: { time: { day: 60 }, meta: { lastAppliedCmdSeq: 1 } }, pendingCommands: [] },
    });
    expect(validateState(h.game)).toEqual([]);
    expect(h.autoPause).toHaveBeenCalledOnce();
  });

  it('does not autosave an ordinary non-season day', async () => {
    const h = setup(60);
    runOneDay();
    await Promise.all(h.saves);
    expect(h.game.time.day).toBe(61);
    expect(h.seasonal).not.toHaveBeenCalled();
    expect(h.write).not.toHaveBeenCalled();
    expect(h.complete).not.toHaveBeenCalled();
    expect(h.progress.isDirty()).toBe(true);
    expect(validateState(h.game)).toEqual([]);
  });

  it('keeps a debug season tick suppressed when its real loop is stopped during publication', async () => {
    const h = setup(59);
    h.game.meta.debugMode = true;
    const loop = createGameLoopController();
    cleanup.push(() => loop.stop());
    cleanup.push(
      store.subscribe((current, previous) => {
        if (current.tickSeq !== previous.tickSeq) loop.stop();
      }),
    );
    loop.stepDays(2);
    await Promise.all(h.saves);
    expect(h.game.time.day).toBe(60);
    expect(store.getState().session.debug.jumping).toBeNull();
    expect(validateState(h.game)).toEqual([]);
    expect(h.seasonal).not.toHaveBeenCalled();
    expect(h.write).not.toHaveBeenCalled();
    expect(h.complete).not.toHaveBeenCalled();
    expect(h.progress.isDirty()).toBe(true);
  });
});
