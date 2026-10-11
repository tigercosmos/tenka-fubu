import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BattleState, BattleUnit, GameState } from '../../src/core/state/gameState';
import type { ArmyId, BattleId, ClanId, MapNodeId, OfficerId } from '../../src/core/state/ids';
import { makeLoopTestState, TEST_CLAN } from '../helpers/loopState';
import { resetGameStoreForTests, store } from '../../src/app/store';
import {
  acknowledgeBattleResult,
  dispatchBattleOrder,
  getPendingBattleOrdersForTests,
  resetBattleBridgeForTests,
  runBattleTick,
  clearAllBattleOrders,
  snapshotPendingBattleOrders,
  getBattleUnitActivity,
} from '../../src/app/battleBridge';
import { getBridgeProgressMark, initializeBridgeSession } from '../../src/app/bridge';
import { createSessionProgressBinding } from '../../src/app/persistence/sessionProgress';
import { uiStore } from '../../src/ui/hooks/uiStore';

const BATTLE = 'battle.000001' as BattleId;

function battleUnit(): BattleUnit {
  return {
    id: 'bu.alpha',
    armyId: 'army.alpha' as ArmyId,
    side: 'attacker',
    generalId: 'officer.alpha' as OfficerId,
    troops: 1_000,
    battleInitialTroops: 1_000,
    morale: 70,
    jinId: 'jin.a',
    moveTargetJinId: null,
    moveProgress: 0,
    attackTargetUnitId: null,
    activeTactics: [],
    tacticCooldowns: {},
    delegated: false,
    routed: false,
    exited: false,
    strategyStatus: 'engaged',
  };
}

function makeGame(resolved = false): GameState {
  const game = makeLoopTestState();
  game.battles[BATTLE] = {
    id: BATTLE,
    fieldCombatId: 'fc.test',
    nodeId: 'castle.test' as MapNodeId,
    terrain: 'plain',
    attackerClanId: TEST_CLAN,
    defenderClanId: 'clan.enemy' as ClanId,
    jins: [
      {
        id: 'jin.a',
        col: 2,
        row: 1,
        owner: 'neutral',
        isHonjin: false,
        flagPower: 100,
        flagPowerMax: 100,
        defenseBonus: 0,
      },
    ],
    edges: [],
    units: [battleUnit()],
    tick: 1,
    saihai: { attacker: 4, defender: 4 },
    honjinFallenTick: null,
    result: resolved
      ? {
          winnerSide: 'attacker',
          endTick: 1,
          attackerLosses: 0,
          defenderLosses: 1_000,
          aweLevel: 'small',
        }
      : null,
  } satisfies BattleState;
  return game;
}

beforeEach(() => {
  resetBattleBridgeForTests();
  resetGameStoreForTests(makeGame());
});

describe('battleBridge', () => {
  it('reads detached activity without a live session, ticking, publishing, or consuming queued orders', () => {
    const game = store.getState().game!;
    const battle = game.battles[BATTLE]!;
    battle.units.push({ ...battleUnit(), id: 'bu.beta', side: 'defender' });
    dispatchBattleOrder(BATTLE, {
      kind: 'toggleDelegate',
      unitId: 'bu.alpha',
      enabled: true,
    });
    const before = structuredClone(game);
    const queued = snapshotPendingBattleOrders();
    const tickSeq = store.getState().tickSeq;
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const activity = getBattleUnitActivity(battle, 'bu.alpha')!;
    expect(activity.contactEnemyUnitIds).toEqual(['bu.beta']);
    expect(activity.moving).toBe(false);
    (activity.contactEnemyUnitIds as string[]).length = 0;
    expect(getBattleUnitActivity(battle, 'bu.alpha')!.contactEnemyUnitIds).toEqual(['bu.beta']);
    expect(getBattleUnitActivity(battle, 'missing')).toBeNull();
    expect(store.getState().tickSeq).toBe(tickSeq);
    expect(listener).not.toHaveBeenCalled();
    expect(snapshotPendingBattleOrders()).toEqual(queued);
    expect(game).toEqual(before);
    unsubscribe();
    resetGameStoreForTests(null);
    expect(getBattleUnitActivity(battle, 'bu.alpha')!.active).toBe(true);
    expect(game).toEqual(before);
  });

  it('real tactical ticks publish dirty progress without strategy version changes, including I/O races', () => {
    const game = store.getState().game!;
    game.battles[BATTLE]!.units.push({ ...battleUnit(), id: 'bu.beta', side: 'defender' });
    initializeBridgeSession(game);
    const target = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
    const binding = createSessionProgressBinding({
      getSession: () => store.getState().game,
      getMark: getBridgeProgressMark,
      subscribe: (listener) => store.subscribe(listener),
      now: () => 0,
      target,
    });
    const cleanup = binding.install();
    const version = game.meta.stateVersion;
    const saved = binding.captureSave()!;
    runBattleTick(BATTLE);
    expect(game.meta.stateVersion).toBe(version);
    expect(game.battles[BATTLE]!.tick).toBe(2);
    expect(binding.isDirty()).toBe(true);
    expect(target.addEventListener).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    binding.completeSave(saved);
    expect(binding.isDirty()).toBe(true);
    const fresh = binding.captureSave()!;
    binding.completeSave(fresh);
    expect(binding.isDirty()).toBe(false);
    store.getState().actions.setViewportBlocked(true);
    store.getState().actions.select({ kind: 'none', id: null });
    uiStore.getState().actions.applyPresentationSettings({
      uiScale: 0.8,
      mapLabelDensity: 'low',
      effectsEnabled: false,
      notificationFilter: 'major',
    });
    expect(binding.isDirty()).toBe(false);
    uiStore.getState().actions.reset();
    dispatchBattleOrder(BATTLE, { kind: 'move', unitId: 'bu.alpha', targetJinId: 'jin.b' });
    expect(binding.isDirty()).toBe(true);
    const detached = snapshotPendingBattleOrders();
    (detached[0]!.orders as import('../../src/app/battleBridge').BattleCommand[]).length = 0;
    expect(snapshotPendingBattleOrders()[0]!.orders).toHaveLength(1);
    cleanup();
  });

  it('clears all queues on lifecycle reset and never applies old-session orders to reused IDs', () => {
    dispatchBattleOrder(BATTLE, { kind: 'toggleDelegate', unitId: 'bu.alpha', enabled: true });
    clearAllBattleOrders();
    expect(snapshotPendingBattleOrders()).toEqual([]);
    dispatchBattleOrder(BATTLE, { kind: 'toggleDelegate', unitId: 'bu.alpha', enabled: true });
    const next = makeGame();
    next.battles[BATTLE]!.units.push({ ...battleUnit(), id: 'bu.beta', side: 'defender' });
    resetGameStoreForTests(next);
    expect(snapshotPendingBattleOrders()).toEqual([]);
    runBattleTick(BATTLE);
    expect(next.battles[BATTLE]!.units[0]!.delegated).toBe(false);
  });
  it('battle order 使用私人佇列，不改動策略 pendingCommandCount', () => {
    store.getState().actions.setPendingCommandCount(7);
    expect(
      dispatchBattleOrder(BATTLE, {
        kind: 'move',
        unitId: 'bu.alpha',
        targetJinId: 'jin.b',
      }),
    ).toEqual({ ok: true });

    expect(store.getState().session.pendingCommandCount).toBe(7);
    expect(getPendingBattleOrdersForTests(BATTLE)).toEqual([
      { kind: 'move', unitId: 'bu.alpha', targetJinId: 'jin.b' },
    ]);
  });

  it('未結束的合戰不可確認，並保留狀態與 pending orders', () => {
    dispatchBattleOrder(BATTLE, {
      kind: 'toggleDelegate',
      unitId: 'bu.alpha',
      enabled: true,
    });
    expect(acknowledgeBattleResult(BATTLE)).toEqual({
      ok: false,
      reason: 'battleUnresolved',
    });
    expect(store.getState().game?.battles[BATTLE]).toBeDefined();
    expect(getPendingBattleOrdersForTests(BATTLE)).toHaveLength(1);
  });

  it('確認結果會經 closeResolvedBattle 刪除合戰、清理其 orders 並 publish', () => {
    const game = makeGame(true);
    resetGameStoreForTests(game);
    const tickSeq = store.getState().tickSeq;

    expect(acknowledgeBattleResult(BATTLE)).toEqual({ ok: true });
    expect(game.battles[BATTLE]).toBeUndefined();
    expect(getPendingBattleOrdersForTests(BATTLE)).toEqual([]);
    expect(store.getState().tickSeq).toBe(tickSeq + 1);
  });

  it('未 boot 或不存在的合戰回傳明確拒絕原因', () => {
    resetGameStoreForTests(null);
    expect(acknowledgeBattleResult(BATTLE)).toEqual({ ok: false, reason: 'notBooted' });
    resetGameStoreForTests(makeGame(true));
    expect(acknowledgeBattleResult('battle.999999' as BattleId)).toEqual({
      ok: false,
      reason: 'battleMissing',
    });
  });
});
