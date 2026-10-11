import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BAL } from '../../src/core/balance';
import type { Command, CmdResolveEventChoice } from '../../src/core/commands/types';
import type { BattleId, EventId } from '../../src/core/state/ids';
import type { GameState } from '../../src/core/state/gameState';
import { createEventEngine } from '../../src/core/systems/events/engine';
import type { EventDef } from '../../src/core/systems/events/types';
import { applyScalarEffects, isScalarEffectOp } from '../../src/core/systems/events/scalarEffects';
import { resetGameStoreForTests, store } from '../../src/app/store';
import {
  dispatchCommand,
  getBridgeProgressMark,
  getSessionEventEngine,
  initializeBridgeSession,
  resetBridgeForTests,
  resolvePendingEventChoice,
  runOneDay,
} from '../../src/app/bridge';
import { buildTinyState, CLAN_ALPHA, CLAN_BETA } from '../fixtures/tiny';

const eventId = 'evt.session-choice' as EventId;
const choice: CmdResolveEventChoice = {
  type: 'resolveEventChoice',
  clanId: CLAN_ALPHA,
  eventId,
  choiceIndex: 0,
};
const definition: EventDef = {
  id: eventId,
  kind: 'historical',
  priority: 20,
  target: 'fixed',
  ownerCandidates: [CLAN_ALPHA],
  trigger: {
    from: { year: 1560, month: 1, day: 1 },
    to: { year: 1562, month: 12, day: 30 },
    check: 'monthStart',
    hooks: [],
    conditions: [],
    probability: 1,
    once: true,
    cooldownDays: 0,
    cooldownKey: null,
  },
  cutscene: { title: '抉擇', body: '抉擇', monClanId: null },
  effects: [],
  choices: [
    {
      label: '決定',
      conditions: [],
      effects: [{ op: 'addGold', clanId: CLAN_ALPHA, amount: 10 }],
      aiWeight: 1,
    },
  ],
};
function engine() {
  return createEventEngine([definition], (state, ops, binding, emit) => {
    for (const op of ops) {
      if (!isScalarEffectOp(op)) throw new Error('Unexpected fixture effect');
      applyScalarEffects(state, [op], binding, emit);
    }
  });
}
function fixture(pending: Command[] = []) {
  const game = buildTinyState();
  game.meta.debugMode = true;
  game.events.pendingChoiceEventId = eventId;
  const eventEngine = engine();
  resetGameStoreForTests(game);
  initializeBridgeSession(game, pending, { eventEngine });
  store.getState().actions.setSpeed('x2');
  store.getState().actions.requestPause('user');
  return { game, eventEngine };
}
function backlog(): Command[] {
  return Array.from({ length: BAL.maxCommandsPerTick }, (): Command => ({
    type: 'debugGrant',
    clanId: CLAN_ALPHA,
    gold: 1,
    food: null,
    castleId: null,
  }));
}
beforeEach(resetBridgeForTests);
afterEach(() => {
  resetBridgeForTests();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('accepted pending choice uses normal queued ticks even while manually paused', () => {
  it('aborts before submission if lazy queue initialization publishes a replacement session', async () => {
    fixture();
    const uninitialized = buildTinyState();
    uninitialized.events.pendingChoiceEventId = eventId;
    resetGameStoreForTests(uninitialized);
    const replacement = buildTinyState();
    replacement.events.pendingChoiceEventId = eventId;
    const before = structuredClone(replacement);
    let replaced = false;
    const unsubscribe = store.subscribe(() => {
      if (replaced) return;
      replaced = true;
      resetGameStoreForTests(replacement);
      initializeBridgeSession(replacement, [], { eventEngine: engine() });
    });
    try {
      expect(await resolvePendingEventChoice(choice)).toEqual({
        ok: false,
        reason: 'cmd.reject.invalidTarget',
      });
      expect(replaced).toBe(true);
      expect(store.getState().game).toEqual(before);
      expect(getBridgeProgressMark()?.pendingCommands).toEqual([]);
      expect(store.getState().session.pendingCommandCount).toBe(0);
    } finally {
      unsubscribe();
    }
  });
  it('does not enqueue or advance an ended game, including an ending reached between batches', async () => {
    vi.useFakeTimers();
    const first = fixture();
    first.game.meta.gameOver = { kind: 'victory', endingId: 'unification' };
    const before = structuredClone(first.game);
    expect(await resolvePendingEventChoice(choice)).toEqual({
      ok: false,
      reason: 'cmd.reject.gameOver',
    });
    expect(first.game).toEqual(before);
    expect(getBridgeProgressMark()?.pendingCommands).toEqual([]);
    const next = fixture(backlog());
    const resolving = resolvePendingEventChoice(choice);
    const day = next.game.time.day;
    next.game.meta.gameOver = { kind: 'defeat', endingId: 'no-castle' };
    await vi.runAllTimersAsync();
    expect(await resolving).toMatchObject({ ok: false });
    expect(next.game.time.day).toBe(day);
    expect(next.game.events.pendingChoiceEventId).toBe(eventId);
    expect(getBridgeProgressMark()?.pendingCommands).toEqual([choice]);
  });
  it('resolves through the production context/Step1 without changing manual pause or applying twice', async () => {
    const { game } = fixture();
    const beforeDay = game.time.day;
    const beforeGold = game.clans[CLAN_ALPHA]!.gold;
    const beforeRng = structuredClone(game.rng);
    expect(await resolvePendingEventChoice(choice)).toEqual({ ok: true });
    expect(game.time.day).toBe(beforeDay + 1);
    expect(game.clans[CLAN_ALPHA]!.gold).toBe(beforeGold + 10);
    expect(game.events.pendingChoiceEventId).toBeNull();
    expect(game.meta.lastAppliedCmdSeq).toBe(1);
    expect(game.rng).toEqual(beforeRng);
    expect(store.getState().session).toMatchObject({
      speed: 'paused',
      resumeSpeed: 'x2',
      lastPauseReason: 'user',
      pendingCommandCount: 0,
    });
    expect(await resolvePendingEventChoice(choice)).toEqual({
      ok: false,
      reason: 'cmd.reject.invalidTarget',
    });
    expect(game.time.day).toBe(beforeDay + 1);
    expect(game.clans[CLAN_ALPHA]!.gold).toBe(beforeGold + 10);
  });

  it('preserves FIFO/cap/seq and yields between tick batches; caller mutation cannot change captured choice', async () => {
    vi.useFakeTimers();
    const { game } = fixture(backlog());
    const day = game.time.day;
    const gold = game.clans[CLAN_ALPHA]!.gold;
    const mutable = { ...choice };
    const resolving = resolvePendingEventChoice(mutable);
    expect(game.meta.lastAppliedCmdSeq).toBe(BAL.maxCommandsPerTick);
    expect(game.time.day).toBe(day + 1);
    expect(game.clans[CLAN_ALPHA]!.gold).toBe(gold + BAL.maxCommandsPerTick);
    expect(getBridgeProgressMark()?.pendingCommands).toEqual([choice]);
    mutable.eventId = 'evt.mutated' as EventId;
    mutable.choiceIndex = 99;
    await vi.runAllTimersAsync();
    expect(await resolving).toEqual({ ok: true });
    expect(game.meta.lastAppliedCmdSeq).toBe(BAL.maxCommandsPerTick + 1);
    expect(game.time.day).toBe(day + 2);
    expect(game.clans[CLAN_ALPHA]!.gold).toBe(gold + BAL.maxCommandsPerTick + 10);
    expect(store.getState().session.speed).toBe('paused');
  });

  it('does not run an extra tick when another normal driver consumes the target during the yield', async () => {
    vi.useFakeTimers();
    const { game } = fixture(backlog());
    const day = game.time.day;
    const resolving = resolvePendingEventChoice(choice);
    runOneDay();
    expect(game.time.day).toBe(day + 2);
    await vi.runAllTimersAsync();
    expect(await resolving).toEqual({ ok: true });
    expect(game.time.day).toBe(day + 2);
  });

  it('invalid/stale/foreign decisions never enqueue or tick', async () => {
    const { game } = fixture();
    const before = structuredClone(game);
    expect(await resolvePendingEventChoice({ ...choice, choiceIndex: 1 })).toMatchObject({
      ok: false,
    });
    expect(
      await resolvePendingEventChoice({ ...choice, eventId: 'evt.stale' as EventId }),
    ).toMatchObject({ ok: false });
    expect(await resolvePendingEventChoice({ ...choice, clanId: CLAN_BETA })).toMatchObject({
      ok: false,
    });
    expect(game).toEqual(before);
    expect(getBridgeProgressMark()?.pendingCommands).toEqual([]);
  });

  it('rejects an active player battle or fatal session before queuing or ticking', async () => {
    const { game } = fixture();
    const day = game.time.day;
    const battleId = 'battle.fixture' as BattleId;
    game.battles[battleId] = {
      result: null,
      attackerClanId: CLAN_ALPHA,
      defenderClanId: CLAN_BETA,
    } as GameState['battles'][BattleId];
    expect(await resolvePendingEventChoice(choice)).toMatchObject({ ok: false });
    delete game.battles[battleId];
    store.getState().actions.setFatalError({ code: 'TEST', message: '停止', stack: '' });
    expect(await resolvePendingEventChoice(choice)).toMatchObject({ ok: false });
    expect(game.time.day).toBe(day);
    expect(getBridgeProgressMark()?.pendingCommands).toEqual([]);
  });

  it('replacement game or same-object queue reinitialization aborts continuation and detaches old engine', async () => {
    vi.useFakeTimers();
    const { game } = fixture(backlog());
    const resolving = resolvePendingEventChoice(choice);
    initializeBridgeSession(game);
    expect(getSessionEventEngine()).toBeNull();
    const before = structuredClone(game);
    await vi.runAllTimersAsync();
    expect(await resolving).toMatchObject({ ok: false });
    expect(game).toEqual(before);
    const old = fixture(backlog());
    const replaced = resolvePendingEventChoice(choice);
    const replacement = buildTinyState();
    resetGameStoreForTests(replacement);
    initializeBridgeSession(replacement);
    expect(getSessionEventEngine()).toBeNull();
    const snapshot = structuredClone(replacement);
    await vi.runAllTimersAsync();
    expect(await replaced).toMatchObject({ ok: false });
    expect(store.getState().game).toEqual(snapshot);
    expect(old.game.events.pendingChoiceEventId).toBe(eventId);
  });

  it('fatal or newly active battle during the yield aborts before another tick', async () => {
    vi.useFakeTimers();
    const { game } = fixture(backlog());
    const resolving = resolvePendingEventChoice(choice);
    const day = game.time.day;
    store.getState().actions.setFatalError({ code: 'TEST', message: '停止', stack: '' });
    await vi.runAllTimersAsync();
    expect(await resolving).toMatchObject({ ok: false });
    expect(game.time.day).toBe(day);
    const next = fixture(backlog());
    const blocked = resolvePendingEventChoice(choice);
    const nextDay = next.game.time.day;
    next.game.battles['battle.fixture' as BattleId] = {
      result: null,
      attackerClanId: CLAN_ALPHA,
      defenderClanId: CLAN_BETA,
    } as GameState['battles'][BattleId];
    await vi.runAllTimersAsync();
    expect(await blocked).toMatchObject({ ok: false });
    expect(next.game.time.day).toBe(nextDay);
  });

  it('normal hard rejection is reported as failure while the original event is still pending', async () => {
    const { game, eventEngine } = fixture();
    vi.spyOn(eventEngine, 'validateChoice')
      .mockReturnValueOnce({ ok: true })
      .mockReturnValue({ ok: false, reasonKey: 'cmd.reject.invalidTarget' });
    expect(await resolvePendingEventChoice(choice)).toEqual({
      ok: false,
      reason: 'cmd.reject.invalidTarget',
    });
    expect(game.meta.lastAppliedCmdSeq).toBe(1);
    expect(game.events.pendingChoiceEventId).toBe(eventId);
    expect(game.reports.some((report) => report.event.type === 'command.rejected')).toBe(true);
  });

  it('direct game replacement without initialization does not reuse the old session engine', async () => {
    fixture();
    const next = buildTinyState();
    next.events.pendingChoiceEventId = eventId;
    resetGameStoreForTests(next);
    expect(getSessionEventEngine()).toBeNull();
    expect(await resolvePendingEventChoice(choice)).toMatchObject({ ok: false });
    expect(getSessionEventEngine()).toBeNull();
    expect(next.meta.lastAppliedCmdSeq).toBe(0);
    expect(dispatchCommand(choice)).toMatchObject({ ok: false });
  });
});
