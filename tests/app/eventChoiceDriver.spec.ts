import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as bridge from '../../src/app/bridge';
import * as validation from '../../src/core/commands/validate';
import { createGameLoopController } from '../../src/app/gameLoop';
import { resetGameStoreForTests, store } from '../../src/app/store';
import type { Command, CmdResolveEventChoice } from '../../src/core/commands/types';
import type { BattleId, ClanId, EventId } from '../../src/core/state/ids';
import type { GameState } from '../../src/core/state/gameState';
import { createManualScheduler } from '../helpers/manualFrameScheduler';
import { makeLoopTestState, TEST_CLAN } from '../helpers/loopState';

const eventId = 'evt.driver-choice' as EventId;
const choice: CmdResolveEventChoice = {
  type: 'resolveEventChoice',
  clanId: TEST_CLAN,
  eventId,
  choiceIndex: 0,
};
let loop: ReturnType<typeof createGameLoopController> | null = null;

beforeEach(() => {
  bridge.resetBridgeForTests();
  const game = makeLoopTestState();
  game.events.pendingChoiceEventId = eventId;
  resetGameStoreForTests(game);
  bridge.initializeBridgeSession(game);
  // Catalog is owned by the event engine; this fixture supplies an explicit two-choice validator.
  vi.spyOn(validation, 'validateCommand').mockImplementation((_game, command) =>
    command.type === 'resolveEventChoice' && command.choiceIndex < 2
      ? { ok: true }
      : { ok: false, reasonKey: 'cmd.reject.invalidTarget' },
  );
});
afterEach(() => {
  loop?.stop();
  loop = null;
  vi.restoreAllMocks();
  bridge.resetBridgeForTests();
});

function queue(command: Command): void {
  bridge.initializeBridgeSession(store.getState().game!, [command]);
}
function frames() {
  const manual = createManualScheduler();
  loop = createGameLoopController(manual.scheduler);
  loop.start();
  manual.fire(0);
  return manual;
}

describe('pending event choice driver thaw gate (10 §5.3/D7)', () => {
  it('recognizes valid matching player choice without consuming the queue, state or RNG', () => {
    queue(choice);
    const before = structuredClone(store.getState().game);
    const mark = bridge.getBridgeProgressMark();
    expect(bridge.hasQueuedEventChoiceResolution()).toBe(true);
    expect(bridge.hasQueuedEventChoiceResolution()).toBe(true);
    expect(bridge.getBridgeProgressMark()).toEqual(mark);
    expect(store.getState().session.pendingCommandCount).toBe(1);
    expect(store.getState().game).toEqual(before);
  });

  it.each([
    { ...choice, eventId: 'evt.other' as EventId },
    { ...choice, choiceIndex: 2 },
    { type: 'debugGrant' as const, clanId: TEST_CLAN, gold: 1, food: null, castleId: null },
  ])('does not thaw for stale/unrelated/out-of-range command %j', (command) => {
    queue(command);
    store.getState().actions.setSpeed('x5');
    const tick = vi.spyOn(bridge, 'runOneDay').mockReturnValue([]);
    const manual = frames();
    manual.fire(250);
    expect(bridge.hasQueuedEventChoiceResolution()).toBe(false);
    expect(tick).not.toHaveBeenCalled();
  });

  it('never thaws for a foreign command even if its event and validator match', () => {
    queue(choice);
    store.getState().game!.meta.playerClanId = 'clan.other' as ClanId;
    expect(bridge.hasQueuedEventChoiceResolution()).toBe(false);
    expect(validation.validateCommand).not.toHaveBeenCalled();
  });

  it.each([-1, 0.5, NaN, Infinity])(
    'malformed choice index %s cannot enter or thaw the queue',
    (choiceIndex) => {
      expect(() => bridge.dispatchCommand({ ...choice, choiceIndex })).toThrow();
      expect(bridge.hasQueuedEventChoiceResolution()).toBe(false);
      expect(bridge.getBridgeProgressMark()?.pendingCommands).toEqual([]);
    },
  );

  it('permits one normal Step 1 tick then freezes again if the decision was consumed but still pending', () => {
    queue(choice);
    store.getState().actions.setSpeed('x5');
    const tick = vi.spyOn(bridge, 'runOneDay').mockImplementation(() => {
      // Simulate Step 1 consuming a rejected decision, without depending on a catalog under construction.
      bridge.initializeBridgeSession(store.getState().game!);
      return [];
    });
    const manual = frames();
    manual.fire(250);
    manual.fire(500);
    expect(tick).toHaveBeenCalledOnce();
    expect(store.getState().game!.events.pendingChoiceEventId).toBe(eventId);
  });

  it('valid queued choice does not override manual pause or an active player battle', () => {
    queue(choice);
    const tick = vi.spyOn(bridge, 'runOneDay').mockReturnValue([]);
    const manual = frames();
    manual.fire(250);
    expect(tick).not.toHaveBeenCalled();
    const battleId = 'battle.driver' as BattleId;
    // The app thaw gate reads only these battle fields; no tactical engine is invoked in this fixture.
    store.getState().game!.battles[battleId] = {
      result: null,
      attackerClanId: TEST_CLAN,
      defenderClanId: 'clan.other' as ClanId,
    } as GameState['battles'][BattleId];
    store.getState().actions.setSpeed('x5');
    manual.fire(500);
    expect(tick).not.toHaveBeenCalled();
  });

  it('does not initialize or discard an old queue when the active game identity changes', () => {
    queue(choice);
    resetGameStoreForTests(makeLoopTestState());
    expect(bridge.hasQueuedEventChoiceResolution()).toBe(false);
    expect(validation.validateCommand).not.toHaveBeenCalled();
  });
});
