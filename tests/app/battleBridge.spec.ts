import { beforeEach, describe, expect, it } from 'vitest';
import type { BattleState, BattleUnit, GameState } from '../../src/core/state/gameState';
import type { ArmyId, BattleId, ClanId, MapNodeId, OfficerId } from '../../src/core/state/ids';
import { makeLoopTestState, TEST_CLAN } from '../helpers/loopState';
import { resetGameStoreForTests, store } from '../../src/app/store';
import {
  acknowledgeBattleResult,
  dispatchBattleOrder,
  getPendingBattleOrdersForTests,
  resetBattleBridgeForTests,
} from '../../src/app/battleBridge';

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
    jins: [],
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
