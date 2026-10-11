import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadScenarioEventEngine } from '../../src/app/events/scenarioEventEngine';
import { buildNewGameState, loadScenario } from '../../src/app/boot';
import {
  dispatchCommand,
  exportCommandLog,
  getBridgeProgressMark,
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
} from '../../src/app/bridge';
import { resetGameStoreForTests, store } from '../../src/app/store';
import { useUIStore } from '../../src/ui/hooks/uiStore';
import { installDebugApi, parseDebugFlags, type TenkaDebugApi } from '../../src/app/debug';
import { advanceDay } from '../../src/core/systems';
import { CommandQueue, enqueuePendingAiOrders } from '../../src/core/commands/queue';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { canonicalStringify } from '../../src/core/state/serialize';
import { validateState } from '../../src/core/state/invariants';
import { isAtWar } from '../../src/core/systems/diplomacyCommon';
import type { CmdResolveEventChoice } from '../../src/core/commands/types';
import type { ClanId, EventId, OfficerId } from '../../src/core/state/ids';
import catalogJson from '../../src/data/scenarios/s1560/events.json';

beforeEach(() => {
  resetBridgeForTests();
  useUIStore.getState().actions.reset();
  resetGameStoreForTests(null);
});
afterEach(() => {
  resetBridgeForTests();
  useUIStore.getState().actions.reset();
  resetGameStoreForTests(null);
  delete (window as unknown as { __TENKA_DEBUG__?: TenkaDebugApi }).__TENKA_DEBUG__;
  delete (window as unknown as { __tenka?: { debug: TenkaDebugApi } }).__tenka;
});

async function actualPendingOkehazama() {
  const bundle = await loadScenario('s1560');
  const state = buildNewGameState(bundle, {
    playerClanId: 'clan.oda' as ClanId,
    difficulty: 'normal',
    seed: 42,
  });
  const engine = await loadScenarioEventEngine(state.meta.scenarioId);
  const queue = new CommandQueue();
  const earlierChoices: string[] = [];
  for (let tick = 0; tick < 120; tick++) {
    const id = state.events.pendingChoiceEventId;
    if (id !== null) {
      expect(id).not.toBe('evt.okehazama');
      const command: CmdResolveEventChoice = {
        type: 'resolveEventChoice',
        clanId: state.meta.playerClanId,
        eventId: id,
        choiceIndex: 0,
      };
      expect(engine.validateChoice(state, command)).toEqual({ ok: true });
      earlierChoices.push(id);
      queue.enqueue(command, state.time.day);
    }
    enqueuePendingAiOrders(state, queue);
    const result = advanceDay(state, queue.drain(), { eventEngine: engine });
    expect(result.events.filter((event) => event.type === 'command.rejected')).toEqual([]);
    expect(validateState(state)).toEqual([]);
    expect(state.meta.gameOver).toBeNull();
  }
  expect(state.time).toMatchObject({ year: 1560, month: 5, dayOfMonth: 1 });
  expect(state.events.pendingChoiceEventId).toBe('evt.okehazama');
  expect(state.events.pendingChoiceBinding?.clanId).toBe(state.meta.playerClanId);
  expect(state.officers['off.imagawa-yoshimoto' as OfficerId]!.status).not.toBe('dead');
  return { state, engine, earlierChoices };
}

describe('ordinary production scenario event catalog', () => {
  it('replays a real event-bearing 121-day log through the installed production debug replay loader', async () => {
    const bundle = await loadScenario('s1560');
    const state = buildNewGameState(bundle, {
      playerClanId: 'clan.oda' as ClanId,
      difficulty: 'normal',
      seed: 42,
    });
    resetGameStoreForTests(state);
    store.getState().actions.setScreen('main');
    initializeBridgeSession(state, [], { eventEngine: await loadScenarioEventEngine('s1560') });
    installDebugApi(parseDebugFlags('?debug=1&seed=42'));
    for (let tick = 0; tick < 121; tick++) {
      const id = state.events.pendingChoiceEventId;
      if (id !== null)
        expect(
          dispatchCommand({
            type: 'resolveEventChoice',
            clanId: state.meta.playerClanId,
            eventId: id,
            choiceIndex: 0,
          }).ok,
        ).toBe(true);
      const events = runOneDay();
      expect(events.filter((event) => event.type === 'command.rejected')).toEqual([]);
      expect(validateState(state)).toEqual([]);
    }
    expect(state.events.flags['okehazama-win']).toBe(1);
    expect(state.officers['off.imagawa-yoshimoto' as OfficerId]!.status).toBe('dead');
    const log = exportCommandLog();
    expect(log.finalDay).toBe(121);
    expect(log.truncated).toBe(false);
    expect(
      log.entries.some(
        (entry) =>
          entry.command.type === 'resolveEventChoice' && entry.command.eventId === 'evt.okehazama',
      ),
    ).toBe(true);
    const before = canonicalStringify(state);
    const api = (window as unknown as { __tenka?: { debug: TenkaDebugApi } }).__tenka?.debug;
    if (!api) throw new Error('Production debug API was not installed');
    await expect(api.replayCommandLog(log)).resolves.toMatchObject({
      match: true,
      balanceMismatch: false,
    });
    expect(canonicalStringify(state)).toBe(before);
  });

  it('loads all 21 exact authored definitions as immutable independent engines and rejects unknown scenarios', async () => {
    const first = await loadScenarioEventEngine('s1560');
    const second = await loadScenarioEventEngine('s1560');
    expect(catalogJson.events).toHaveLength(21);
    for (const definition of catalogJson.events) {
      const def = first.getDef(definition.id as EventId);
      expect(def).toEqual(definition);
      expect(Object.isFrozen(def)).toBe(true);
      expect(Object.isFrozen(def?.choices)).toBe(true);
      expect(second.getDef(definition.id as EventId)).not.toBe(def);
    }
    await expect(loadScenarioEventEngine('missing-scenario')).rejects.toThrow();
  });

  it('reaches a genuine pending historical choice on the real 120-day Oda trajectory', async () => {
    const { state, engine } = await actualPendingOkehazama();
    expect(state.events.fired['evt.okehazama' as EventId]).toBe(state.time.day);
    expect(isAtWar(state, 'clan.oda' as ClanId, 'clan.imagawa' as ClanId)).toBe(true);
    const before = canonicalStringify(state);
    const choice: CmdResolveEventChoice = {
      type: 'resolveEventChoice',
      clanId: state.meta.playerClanId,
      eventId: 'evt.okehazama' as EventId,
      choiceIndex: 0,
    };
    expect(engine.validateChoice(state, choice)).toEqual({ ok: true });
    expect(engine.validateChoice(state, { ...choice, choiceIndex: 2 }).ok).toBe(false);
    expect(engine.validateChoice(state, { ...choice, clanId: 'clan.imagawa' as ClanId }).ok).toBe(
      false,
    );
    expect(canonicalStringify(state)).toBe(before);
  });

  it('restores genuine pending identity plus queued choice with the production engine before executing exactly once', async () => {
    const { state } = await actualPendingOkehazama();
    const choice: CmdResolveEventChoice = {
      type: 'resolveEventChoice',
      clanId: state.meta.playerClanId,
      eventId: 'evt.okehazama' as EventId,
      choiceIndex: 0,
    };
    const decoded = decodeSave(encodeSave(state, 123, [choice]));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(`Actual pending save failed: ${decoded.code}`);
    const restored = decoded.saveFile.state;
    const reference = structuredClone(restored);
    const referenceQueue = new CommandQueue(reference.meta.lastAppliedCmdSeq + 1);
    referenceQueue.enqueue(choice, reference.time.day);
    enqueuePendingAiOrders(reference, referenceQueue);
    advanceDay(reference, referenceQueue.drain(), {
      eventEngine: await loadScenarioEventEngine('s1560'),
    });
    resetGameStoreForTests(restored);
    store.getState().actions.setScreen('main');
    initializeBridgeSession(restored, decoded.saveFile.pendingCommands, {
      loaded: true,
      eventEngine: await loadScenarioEventEngine('s1560'),
    });
    expect(restored.events.pendingChoiceBinding).toEqual(state.events.pendingChoiceBinding);
    expect(useUIStore.getState().modal?.id).toBe('event');
    expect(getBridgeProgressMark()?.pendingCommands).toEqual([choice]);
    const before = canonicalStringify(restored);
    expect(dispatchCommand({ ...choice, choiceIndex: 99 }).ok).toBe(false);
    expect(canonicalStringify(restored)).toBe(before);
    runOneDay();
    expect(canonicalStringify(restored)).toBe(canonicalStringify(reference));
    expect(restored.events.pendingChoiceEventId).toBeNull();
    expect(restored.events.pendingChoiceBinding).toBeNull();
    expect(restored.events.flags['okehazama-win']).toBe(1);
    expect(restored.officers['off.imagawa-yoshimoto' as OfficerId]!.status).toBe('dead');
    expect(validateState(restored)).toEqual([]);
    const choices = exportCommandLog()?.entries.filter(
      (entry) => entry.command.type === 'resolveEventChoice',
    );
    expect(choices).toHaveLength(1);
    runOneDay();
    expect(
      exportCommandLog()?.entries.filter((entry) => entry.command.type === 'resolveEventChoice'),
    ).toEqual(choices);
    expect(restored.events.fired['evt.okehazama' as EventId]).toBe(state.time.day);
    expect(validateState(restored)).toEqual([]);
  });
});
