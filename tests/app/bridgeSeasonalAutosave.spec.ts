import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  captureSaveSnapshot,
  dispatchCommand,
  registerSeasonalAutosave,
  resetBridgeForTests,
  runOneDay,
} from '../../src/app/bridge';
import { resetGameStoreForTests, store } from '../../src/app/store';
import { autosave } from '../../src/app/persistence';
import { makeLoopTestState, TEST_CLAN } from '../helpers/loopState';

vi.mock('../../src/app/persistence', () => ({ autosave: vi.fn(() => true) }));

beforeEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(null);
  vi.clearAllMocks();
});

describe('bridge quarterly autosave registration', () => {
  it.each(Array.from({ length: 12 }, (_, index) => index + 1))(
    'month %i signals only canonical Mar/Jun/Sep/Dec seasons and suppresses the legacy writer',
    (month) => {
      const handler = vi.fn();
      registerSeasonalAutosave(handler);
      const day = month === 1 ? 359 : (month - 1) * 30 - 1;
      resetGameStoreForTests(makeLoopTestState({ day }));
      runOneDay();
      expect(store.getState().game!.time).toMatchObject({ month, dayOfMonth: 1 });
      expect(handler).toHaveBeenCalledTimes([3, 6, 9, 12].includes(month) ? 1 : 0);
      expect(autosave).not.toHaveBeenCalled();
    },
  );

  it('does not signal a regular day or any debug jump', () => {
    const handler = vi.fn();
    registerSeasonalAutosave(handler);
    resetGameStoreForTests(makeLoopTestState({ day: 60 }));
    runOneDay();
    resetGameStoreForTests(makeLoopTestState({ day: 59 }));
    store.getState().actions.setDebugJumping({ totalDays: 1, doneDays: 0 });
    runOneDay();
    expect(handler).not.toHaveBeenCalled();
    expect(autosave).not.toHaveBeenCalled();
  });

  it('signals synchronously after command application and tick publication', () => {
    const game = makeLoopTestState({ day: 59, gold: 100 });
    resetGameStoreForTests(game);
    dispatchCommand({ type: 'debugGrant', clanId: TEST_CLAN, gold: 7, food: null, castleId: null });
    let captured: ReturnType<typeof captureSaveSnapshot> | null = null;
    registerSeasonalAutosave(() => {
      expect(store.getState().tickSeq).toBe(1);
      captured = captureSaveSnapshot(123);
    });
    runOneDay();
    expect(captured).toMatchObject({
      timestamp: 123,
      pendingCommands: [],
      state: { time: { day: 60 } },
    });
    expect(captured!.state.clans[TEST_CLAN]!.gold).toBe(107);
    expect(captured!.state.meta.lastAppliedCmdSeq).toBe(1);
  });

  it('older disposal cannot remove a newer registration, even for the same handler', () => {
    const handler = vi.fn();
    const older = registerSeasonalAutosave(handler);
    const current = registerSeasonalAutosave(handler);
    older();
    resetGameStoreForTests(makeLoopTestState({ day: 59 }));
    runOneDay();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(autosave).not.toHaveBeenCalled();
    current();
    current();
    resetGameStoreForTests(makeLoopTestState({ day: 119 }));
    runOneDay();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(autosave).toHaveBeenCalledTimes(1);
  });

  it('without a registration preserves the legacy monthly callback and debug suppression', () => {
    resetGameStoreForTests(makeLoopTestState({ day: 29 }));
    runOneDay();
    expect(autosave).toHaveBeenCalledTimes(1);
    store.getState().actions.setDebugJumping({ totalDays: 1, doneDays: 0 });
    resetGameStoreForTests(makeLoopTestState({ day: 59 }));
    store.getState().actions.setDebugJumping({ totalDays: 1, doneDays: 0 });
    runOneDay();
    expect(autosave).toHaveBeenCalledTimes(1);
  });
});
