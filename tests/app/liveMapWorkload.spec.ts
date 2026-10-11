import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildFullState } from '../helpers/fullState';
import {
  prepareLiveMapWorkload,
  createLiveMapWorkload,
  liveArmyTargets,
} from '../../src/app/liveMapWorkload';
import {
  initializeBridgeSession,
  registerDebugLiveArmyDriver,
  resetBridgeForTests,
  runOneDay,
  exportCommandLog,
  resolvePendingEventChoice,
} from '../../src/app/bridge';
import { createRuntimeEventEngine } from '../../src/core/systems/events/runtime';
import { loadS1560EventCatalog } from '../../src/data/scenarios/s1560';
import { resetGameStoreForTests, store, setGame } from '../../src/app/store';
import { validateState } from '../../src/core/state/invariants';
import { armyPhysicalLeg } from '../../src/core/systems/armyReroute';

afterEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(null);
});
describe('authentic live national map workload', () => {
  it('prepares120 legal marches and preserves invariants through four real paid-leg days', async () => {
    const input = await buildFullState({ seed: 15600519 });
    const before = structuredClone(input);
    const prepared = prepareLiveMapWorkload(input, 120);
    expect(input).toEqual(before);
    expect(prepared.commands).toHaveLength(120);
    expect(prepared.slots).toHaveLength(120);
    expect(prepared.geographyRegions).toHaveLength(9);
    expect(prepared.game.rng).toEqual(input.rng);
    expect(validateState(prepared.game)).toEqual([]);
    resetGameStoreForTests(prepared.game);
    store.getState().actions.setScreen('main');
    store.getState().actions.setSpeed('x5');
    initializeBridgeSession(prepared.game);
    const workload = createLiveMapWorkload(prepared.slots);
    const dispose = registerDebugLiveArmyDriver(prepared.game, workload.driver);
    for (let day = 0; day < 4; day++) {
      runOneDay();
      expect(validateState(prepared.game)).toEqual([]);
      expect(workload.getSnapshot().failure).toBeNull();
      expect(workload.getSnapshot().minimumMarching).toBe(120);
      expect(
        prepared.slots.filter(
          (slot) => armyPhysicalLeg(prepared.game.armies[slot.armyId]!) !== null,
        ),
      ).toHaveLength(day % 2 === 0 ? 120 : 0);
    }
    dispose();
  });

  it('fails closed on unexpected captured endpoints or destinations without changing the canonical game', async () => {
    const prepared = prepareLiveMapWorkload(await buildFullState({ seed: 15600519 }));
    const before = structuredClone(prepared.game);
    const slot = prepared.slots[0]!;
    expect(slot.originalFirstNode).toBe(prepared.game.armies[slot.armyId]!.path[1]);
    expect(slot.originalFirstNode).not.toBe(slot.alternateFirstNode);
    expect(() =>
      liveArmyTargets(prepared.game, [{ ...slot, originalFirstNode: slot.castleId }]),
    ).toThrow('endpoint unavailable');
    expect(() =>
      liveArmyTargets(prepared.game, [{ ...slot, originalTarget: slot.alternateTarget }]),
    ).toThrow('target unavailable');
    expect(prepared.game).toEqual(before);
    resetGameStoreForTests(prepared.game);
    store.getState().actions.setScreen('main');
    store.getState().actions.setSpeed('x5');
    initializeBridgeSession(prepared.game);
    const workload = createLiveMapWorkload(prepared.slots);
    registerDebugLiveArmyDriver(prepared.game, workload.driver);
    runOneDay();
    const paid = structuredClone(prepared.game);
    expect(armyPhysicalLeg(prepared.game.armies[slot.armyId]!)).not.toBeNull();
    expect(() =>
      liveArmyTargets(prepared.game, [{ ...slot, originalFirstNode: slot.castleId }]),
    ).toThrow('endpoint unavailable');
    expect(prepared.game).toEqual(paid);
  });
  it('reverses the actual alternate physical leg after canonical source arrival spends residual movement', async () => {
    const prepared = prepareLiveMapWorkload(await buildFullState({ seed: 15600519 }));
    resetGameStoreForTests(prepared.game);
    store.getState().actions.setScreen('main');
    store.getState().actions.setSpeed('x5');
    initializeBridgeSession(prepared.game, [], {
      eventEngine: createRuntimeEventEngine(loadS1560EventCatalog()),
    });
    const workload = createLiveMapWorkload(prepared.slots);
    registerDebugLiveArmyDriver(prepared.game, workload.driver);
    const slot = prepared.slots.find((entry) => entry.armyId === 'army.000022')!;
    let residualObserved = false;
    for (let day = 0; day < 24; day++) {
      const army = prepared.game.armies[slot.armyId]!;
      const leg = armyPhysicalLeg(army);
      if (day === 16) {
        expect(army.posNodeId).toBe(slot.castleId);
        expect(army.targetNodeId).toBe(slot.alternateTarget);
        expect(leg).toMatchObject({ end: slot.alternateTarget, reversing: false, cost: 0.5 });
        expect(leg!.progress).toBeCloseTo(0.1, 12);
        residualObserved = true;
      }
      runOneDay();
      expect(workload.getSnapshot().failure).toBeNull();
      expect(workload.getSnapshot().minimumMarching).toBe(40);
      expect(validateState(prepared.game)).toEqual([]);
      expect(
        prepared.slots.every(
          (entry) => prepared.game.armies[entry.armyId]!.posNodeId === entry.castleId,
        ),
      ).toBe(true);
    }
    expect(residualObserved).toBe(true);
    expect(workload.getSnapshot().ticks).toBe(24);
    const commands = exportCommandLog().entries.filter(
      (entry) => entry.command.type === 'setArmyTarget' && entry.command.armyId === slot.armyId,
    );
    expect(
      commands.some(
        (entry) =>
          entry.command.type === 'setArmyTarget' &&
          entry.command.targetNodeId === slot.originalTarget &&
          entry.day === 17,
      ),
    ).toBe(true);
  });
  it('prepares real forty marches, then drives paid reversals and actual source arrivals without mutating queries', async () => {
    const input = await buildFullState({ seed: 15600519 });
    const before = structuredClone(input);
    const prepared = prepareLiveMapWorkload(input);
    expect(input).toEqual(before);
    expect(prepared.commands).toHaveLength(40);
    expect(prepared.geographyRegions).toHaveLength(9);
    expect(prepared.armyRegions).toHaveLength(7);
    expect(prepared.game.rng).toEqual(input.rng);
    expect(validateState(prepared.game)).toEqual([]);
    const workload = createLiveMapWorkload(prepared.slots);
    resetGameStoreForTests(prepared.game);
    store.getState().actions.setScreen('main');
    initializeBridgeSession(prepared.game);
    const dispose = registerDebugLiveArmyDriver(prepared.game, workload.driver);
    // Manual pause must not run the driver (ordinary explicit tick remains its own API).
    expect(workload.getSnapshot().ticks).toBe(0);
    store.getState().actions.setSpeed('x5');
    for (let day = 0; day < 4; day++) {
      const snapshot = structuredClone(prepared.game);
      expect(liveArmyTargets(prepared.game, prepared.slots)).toHaveLength(40);
      expect(prepared.game).toEqual(snapshot);
      runOneDay();
      expect(validateState(prepared.game)).toEqual([]);
      expect(workload.getSnapshot().failure).toBeNull();
      expect(workload.getSnapshot().minimumMarching).toBe(40);
      expect(
        prepared.slots.filter((s) => armyPhysicalLeg(prepared.game.armies[s.armyId]!) !== null),
      ).toHaveLength(day % 2 === 0 ? 40 : 0);
    }
    dispose();
    dispose();
    expect(workload.getSnapshot().disposed).toBe(true);
  });
  it('rejects nonfresh preparation without changing input', async () => {
    const game = await buildFullState({ seed: 15600519 });
    game.time.day = 1;
    const before = structuredClone(game);
    expect(() => prepareLiveMapWorkload(game)).toThrow('fresh');
    expect(game).toEqual(before);
  });
  it('validates the entire driver batch before enqueue and preserves ordinary ticking on failure', async () => {
    const prepared = prepareLiveMapWorkload(await buildFullState({ seed: 15600519 }));
    resetGameStoreForTests(prepared.game);
    store.getState().actions.setScreen('main');
    store.getState().actions.setSpeed('x5');
    initializeBridgeSession(prepared.game);
    const disposed = vi.fn();
    const commands = liveArmyTargets(prepared.game, prepared.slots);
    registerDebugLiveArmyDriver(prepared.game, {
      slots: prepared.slots,
      beforeDay: () => [commands[0]!, commands[0]!],
      afterDay: () => {},
      dispose: disposed,
    });
    runOneDay();
    expect(prepared.game.time.day).toBe(1);
    expect(
      exportCommandLog().entries.filter((e) => e.command.type === 'setArmyTarget'),
    ).toHaveLength(0);
    expect(disposed).toHaveBeenCalledOnce();
    expect(disposed.mock.calls[0]![0]).toContain('rejected');
  });
  it('does not invoke driver on manually paused ticks and cleans up on identity change without stale disposal', async () => {
    const prepared = prepareLiveMapWorkload(await buildFullState({ seed: 15600519 }));
    resetGameStoreForTests(prepared.game);
    store.getState().actions.setScreen('main');
    initializeBridgeSession(prepared.game);
    const beforeDay = vi.fn(() => []);
    const oldDispose = vi.fn();
    const releaseOld = registerDebugLiveArmyDriver(prepared.game, {
      slots: prepared.slots,
      beforeDay,
      afterDay: () => {},
      dispose: oldDispose,
    });
    runOneDay();
    expect(beforeDay).not.toHaveBeenCalled();
    const newDispose = vi.fn();
    registerDebugLiveArmyDriver(prepared.game, {
      slots: prepared.slots,
      beforeDay,
      afterDay: () => {},
      dispose: newDispose,
    });
    releaseOld();
    expect(newDispose).not.toHaveBeenCalled();
    setGame(null);
    expect(newDispose).toHaveBeenCalledWith('session-replaced');
    expect(oldDispose).toHaveBeenCalledOnce();
  });
  it('does not tick or enqueue into a same-object newly initialized session from a stale callback', async () => {
    const prepared = prepareLiveMapWorkload(await buildFullState({ seed: 15600519 }));
    resetGameStoreForTests(prepared.game);
    store.getState().actions.setScreen('main');
    store.getState().actions.setSpeed('x5');
    initializeBridgeSession(prepared.game);
    const disposed = vi.fn();
    registerDebugLiveArmyDriver(prepared.game, {
      slots: prepared.slots,
      beforeDay: (game) => {
        initializeBridgeSession(prepared.game);
        return liveArmyTargets(game, prepared.slots);
      },
      afterDay: () => {},
      dispose: disposed,
    });
    expect(runOneDay()).toEqual([]);
    expect(prepared.game.time.day).toBe(0);
    expect(exportCommandLog().entries).toEqual([]);
    expect(disposed).toHaveBeenCalledWith('session-initialized');
  });
  it('accepts forty actual driver orders alongside a paused native catalog choice resolution', async () => {
    const prepared = prepareLiveMapWorkload(await buildFullState({ seed: 15600519 }));
    // Synthetic calendar precondition only: the actual production catalog fires in Step3.
    Object.assign(prepared.game.time, { day: 119, year: 1560, month: 4, dayOfMonth: 30 });
    resetGameStoreForTests(prepared.game);
    store.getState().actions.setScreen('main');
    store.getState().actions.setSpeed('x5');
    initializeBridgeSession(prepared.game, [], {
      eventEngine: createRuntimeEventEngine(loadS1560EventCatalog()),
    });
    const workload = createLiveMapWorkload(prepared.slots);
    registerDebugLiveArmyDriver(prepared.game, workload.driver);
    runOneDay();
    expect(prepared.game.events.pendingChoiceEventId).toBe('evt.okehazama');
    store.getState().actions.requestPause('user');
    const result = await resolvePendingEventChoice({
      type: 'resolveEventChoice',
      clanId: prepared.game.meta.playerClanId,
      eventId: prepared.game.events.pendingChoiceEventId!,
      choiceIndex: 0,
    });
    expect(result.ok).toBe(true);
    expect(prepared.game.events.pendingChoiceEventId).toBeNull();
    expect(workload.getSnapshot().ticks).toBe(2);
    expect(workload.getSnapshot().failure).toBeNull();
    expect(workload.getSnapshot().minimumMarching).toBe(40);
    const commands = exportCommandLog().entries.filter((e) => e.day === 2);
    expect(commands.filter((e) => e.command.type === 'resolveEventChoice')).toHaveLength(1);
    expect(commands.filter((e) => e.command.type === 'setArmyTarget')).toHaveLength(40);
    expect(validateState(prepared.game)).toEqual([]);
  });
  it('does not deliver an old tick to a new same-identity driver installed by a tick subscriber', async () => {
    const prepared = prepareLiveMapWorkload(await buildFullState({ seed: 15600519 }));
    resetGameStoreForTests(prepared.game);
    store.getState().actions.setScreen('main');
    store.getState().actions.setSpeed('x5');
    initializeBridgeSession(prepared.game);
    const oldAfter = vi.fn(),
      newAfter = vi.fn();
    registerDebugLiveArmyDriver(prepared.game, {
      slots: prepared.slots,
      beforeDay: () => [],
      afterDay: oldAfter,
      dispose: () => {},
    });
    let replaced = false;
    const unsubscribe = store.subscribe((state) => {
      if (state.tickSeq !== 1 || replaced) return;
      replaced = true;
      initializeBridgeSession(prepared.game);
      registerDebugLiveArmyDriver(prepared.game, {
        slots: prepared.slots,
        beforeDay: () => [],
        afterDay: newAfter,
        dispose: () => {},
      });
    });
    runOneDay();
    unsubscribe();
    expect(oldAfter).not.toHaveBeenCalled();
    expect(newAfter).not.toHaveBeenCalled();
    runOneDay();
    expect(newAfter).toHaveBeenCalledOnce();
  });
  it('does not clear a newer driver when a replaced old afterDay callback throws', async () => {
    const prepared = prepareLiveMapWorkload(await buildFullState({ seed: 15600519 }));
    resetGameStoreForTests(prepared.game);
    store.getState().actions.setScreen('main');
    store.getState().actions.setSpeed('x5');
    initializeBridgeSession(prepared.game);
    const newDispose = vi.fn(),
      newAfter = vi.fn();
    registerDebugLiveArmyDriver(prepared.game, {
      slots: prepared.slots,
      beforeDay: () => [],
      dispose: () => {},
      afterDay: () => {
        registerDebugLiveArmyDriver(prepared.game, {
          slots: prepared.slots,
          beforeDay: () => [],
          afterDay: newAfter,
          dispose: newDispose,
        });
        throw new Error('Old observer failure');
      },
    });
    runOneDay();
    expect(newDispose).not.toHaveBeenCalled();
    runOneDay();
    expect(newAfter).toHaveBeenCalledOnce();
  });
});
