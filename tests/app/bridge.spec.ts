// src/app/bridge.ts 單元測試（M1-15／01-A6 驗收：dispatch 合法 Command 後佇列長度 +1；
// runOneDay 後 tickSeq +1、佇列清空）。
// 規格：plan/01-architecture.md §3.4.3（Command 佇列 API）／§3.4.4（publishTick）／§5.2。

import { beforeEach, describe, expect, it } from 'vitest';
import {
  dispatchCommand,
  captureSaveSnapshot,
  getBridgeProgressMark,
  initializeBridgeSession,
  exportCommandLog,
  onAutoPauseReasons,
  resetBridgeForTests,
  runOneDay,
} from '../../src/app/bridge';
import { resetGameStoreForTests, store } from '../../src/app/store';
import { CoreError } from '../../src/core/errors';
import type { Command, CmdMarch } from '../../src/core/commands/types';
import { makeLoopTestState, TEST_CLAN } from '../helpers/loopState';
import {
  buildTinyState,
  CLAN_ALPHA,
  CLAN_BETA,
  CASTLE_A1,
  CASTLE_A2,
  OFF_ALPHA_LORD,
  OFF_ALPHA_BUSHO,
} from '../fixtures/tiny';

function grantGold(gold: number): Command {
  return { type: 'debugGrant', clanId: TEST_CLAN, gold, food: null, castleId: null };
}

beforeEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(null);
});

describe('dispatchCommand — game 未 boot', () => {
  it('回傳 notBooted 拒絕、不影響任何佇列狀態', () => {
    const result = dispatchCommand(grantGold(100));
    expect(result).toEqual({ ok: false, reason: 'cmd.reject.notBooted' });
  });
});

describe('dispatchCommand — 已 boot', () => {
  beforeEach(() => {
    resetGameStoreForTests(makeLoopTestState({ debugMode: true }));
  });

  it('合法 Command：回傳 ok:true，pendingCommandCount +1', () => {
    expect(store.getState().session.pendingCommandCount).toBe(0);
    const result = dispatchCommand(grantGold(500));
    expect(result).toEqual({ ok: true });
    expect(store.getState().session.pendingCommandCount).toBe(1);
  });

  it('連續兩筆合法 Command：pendingCommandCount 累加至 2', () => {
    dispatchCommand(grantGold(1));
    dispatchCommand(grantGold(2));
    expect(store.getState().session.pendingCommandCount).toBe(2);
  });

  it.each([NaN, Infinity, -Infinity])(
    'rejects malformed debug grant %s before normalization, without changing the queue',
    (gold) => {
      dispatchCommand(grantGold(7));
      expect(() => dispatchCommand(grantGold(gold))).toThrow(CoreError);
      expect(() => dispatchCommand(grantGold(gold))).toThrow('invalid command shape');
      expect(captureSaveSnapshot(123).pendingCommands).toEqual([grantGold(7)]);
      expect(store.getState().session.pendingCommandCount).toBe(1);
    },
  );

  it('rejects nonplayer debug intents even when the other clan exists', () => {
    const game = buildTinyState();
    game.meta.debugMode = true;
    resetGameStoreForTests(game);
    expect(
      dispatchCommand({
        type: 'debugGrant',
        clanId: CLAN_BETA,
        gold: 1,
        food: null,
        castleId: null,
      }),
    ).toEqual({ ok: false, reason: 'cmd.reject.notOwner' });
    expect(captureSaveSnapshot(123).pendingCommands).toEqual([]);
    expect(store.getState().session.pendingCommandCount).toBe(0);
  });

  it('captures accepted command values instead of retaining caller references', () => {
    const command = grantGold(7);
    expect(dispatchCommand(command).ok).toBe(true);
    if (command.type !== 'debugGrant') throw new Error('wrong command fixture');
    command.gold = 999;
    expect(captureSaveSnapshot(123).pendingCommands).toEqual([grantGold(7)]);
    runOneDay();
    expect(store.getState().game!.clans[TEST_CLAN]!.gold).toBe(7);
  });

  it('copies march deputy arrays as well as scalar fields', () => {
    const game = buildTinyState();
    resetGameStoreForTests(game);
    const command: CmdMarch = {
      type: 'march',
      clanId: CLAN_ALPHA,
      originCastleId: CASTLE_A1,
      leaderId: OFF_ALPHA_LORD,
      deputyIds: [OFF_ALPHA_BUSHO],
      soldiers: 500,
      food: 100,
      targetNodeId: CASTLE_A2,
    };
    expect(dispatchCommand(command)).toEqual({ ok: true });
    command.deputyIds.length = 0;
    command.soldiers = 1;
    expect(captureSaveSnapshot(123).pendingCommands).toEqual([
      {
        ...command,
        deputyIds: [OFF_ALPHA_BUSHO],
        soldiers: 500,
      },
    ]);
  });

  it('非法 Command（debugMode=false）：回傳 ok:false 且不入列（pendingCommandCount 不變）', () => {
    resetGameStoreForTests(makeLoopTestState({ debugMode: false }));
    const result = dispatchCommand(grantGold(1));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('cmd.reject.debugOnly');
    }
    expect(store.getState().session.pendingCommandCount).toBe(0);
  });

  it('換成進度存檔時清掉舊 pending，並從 lastAppliedCmdSeq 後續接', () => {
    dispatchCommand(grantGold(1)); // 舊局 pending，不應流入讀檔後的局。

    const loaded = makeLoopTestState({
      debugMode: true,
      gold: 100,
      lastAppliedCmdSeq: 41,
    });
    loaded.meta.stateVersion = 41;
    resetGameStoreForTests(loaded);

    expect(dispatchCommand(grantGold(500))).toEqual({ ok: true });
    runOneDay();

    expect(loaded.clans[TEST_CLAN]?.gold).toBe(600);
    expect(loaded.meta.lastAppliedCmdSeq).toBe(42);
    expect(exportCommandLog()).toMatchObject({
      finalDay: 1,
      truncated: true,
      incompleteReasons: ['loadedGame'],
    });
  });
});

describe('runOneDay — game 未 boot', () => {
  it('拋出 CoreError（DATA_INTEGRITY）', () => {
    expect(() => runOneDay()).toThrow(CoreError);
  });
});

describe('M8 待結算指令存檔續接', () => {
  it('explicitly loaded day-zero saves retain incomplete provenance with restored pending commands', () => {
    const game = makeLoopTestState({ debugMode: true, gold: 123 });
    resetGameStoreForTests(game);
    initializeBridgeSession(game, [grantGold(7)], { loaded: true });
    expect(exportCommandLog()).toMatchObject({
      finalDay: 0,
      truncated: true,
      incompleteReasons: ['loadedGame'],
    });
    expect(captureSaveSnapshot(100).pendingCommands).toEqual([grantGold(7)]);
    runOneDay();
    expect(game.clans[TEST_CLAN]!.gold).toBe(130);
    expect(exportCommandLog()).toMatchObject({
      finalDay: 1,
      truncated: true,
      incompleteReasons: ['loadedGame'],
    });
  });

  it.each([undefined, false])(
    'fresh day-zero session keeps complete provenance (loaded=%s)',
    (loaded) => {
      const game = makeLoopTestState({ debugMode: true });
      resetGameStoreForTests(game);
      initializeBridgeSession(game, [], loaded === undefined ? {} : { loaded });
      expect(exportCommandLog()).toMatchObject({
        finalDay: 0,
        truncated: false,
      });
      expect(exportCommandLog().incompleteReasons).toBeUndefined();
      dispatchCommand(grantGold(7));
      runOneDay();
      expect(exportCommandLog()).toMatchObject({
        finalDay: 1,
        truncated: false,
      });
      expect(exportCommandLog().incompleteReasons).toBeUndefined();
    },
  );
  it('returns detached progress marks for pending and consumed commands, and null without a game', () => {
    expect(getBridgeProgressMark()).toBeNull();
    const game = makeLoopTestState({ debugMode: true });
    resetGameStoreForTests(game);
    expect(getBridgeProgressMark()).toEqual({
      tick: 0,
      lastAppliedCmdSeq: 0,
      pendingCommands: [],
      tickSeq: 0,
      pendingBattleOrders: [],
    });
    dispatchCommand(grantGold(7));
    const progress = getBridgeProgressMark()!;
    expect(progress).toEqual({
      tick: 0,
      lastAppliedCmdSeq: 0,
      pendingCommands: [grantGold(7)],
      tickSeq: 0,
      pendingBattleOrders: [],
    });
    progress.pendingCommands.length = 0;
    expect(getBridgeProgressMark()!.pendingCommands).toEqual([grantGold(7)]);
    runOneDay();
    expect(getBridgeProgressMark()).toEqual({
      tick: 1,
      lastAppliedCmdSeq: 1,
      pendingCommands: [],
      tickSeq: 1,
      pendingBattleOrders: [],
    });
  });
  it('暫停時快照保留順序，無 drain／seq 副作用且與活佇列解耦', () => {
    const game = makeLoopTestState({ debugMode: true, gold: 100 });
    resetGameStoreForTests(game);
    dispatchCommand(grantGold(3));
    dispatchCommand(grantGold(4));
    const save = captureSaveSnapshot(123);
    expect(save.pendingCommands).toEqual([grantGold(3), grantGold(4)]);
    expect(store.getState().session.pendingCommandCount).toBe(2);
    expect(game.meta.lastAppliedCmdSeq).toBe(0);
    save.pendingCommands[0] = grantGold(999);
    expect(captureSaveSnapshot(124).pendingCommands[0]).toEqual(grantGold(3));
    runOneDay();
    expect(game.clans[TEST_CLAN]?.gold).toBe(107);
    expect(game.meta.lastAppliedCmdSeq).toBe(2);
  });

  it('顯式恢復後首次 dispatch/tick 不丟失 pending，依 lastAppliedCmdSeq 續接且不重複套用', () => {
    const game = makeLoopTestState({ debugMode: true, gold: 100, lastAppliedCmdSeq: 41 });
    game.meta.stateVersion = 41;
    resetGameStoreForTests(game);
    const commands = [grantGold(3), grantGold(4)];
    initializeBridgeSession(game, commands);
    commands[0] = grantGold(999);
    dispatchCommand(grantGold(5));
    expect(store.getState().session.pendingCommandCount).toBe(3);
    runOneDay();
    expect(game.clans[TEST_CLAN]?.gold).toBe(112);
    expect(game.meta.lastAppliedCmdSeq).toBe(44);
    runOneDay();
    expect(game.clans[TEST_CLAN]?.gold).toBe(112);
    expect(exportCommandLog().truncated).toBe(true);
  });

  it('初始化拒絕錯誤 session／畸形指令，不覆蓋既有待結算佇列', () => {
    const game = makeLoopTestState({ debugMode: true, gold: 100 });
    resetGameStoreForTests(game);
    dispatchCommand(grantGold(7));
    expect(() => initializeBridgeSession(makeLoopTestState())).toThrow(CoreError);
    expect(() =>
      initializeBridgeSession(game, [{ ...grantGold(1), authority: {} } as unknown as Command]),
    ).toThrow(CoreError);
    expect(captureSaveSnapshot(123).pendingCommands).toEqual([grantGold(7)]);
  });
});

describe('runOneDay — 已 boot（01 §3.4.4／§5.2 流程）', () => {
  beforeEach(() => {
    resetGameStoreForTests(makeLoopTestState({ debugMode: true, gold: 100 }));
  });

  it('drain 佇列並套用（gold 增加）、tickSeq +1、佇列清空（pendingCommandCount 歸 0）', () => {
    dispatchCommand(grantGold(500));
    expect(store.getState().session.pendingCommandCount).toBe(1);

    const events = runOneDay();

    expect(store.getState().tickSeq).toBe(1);
    expect(store.getState().session.pendingCommandCount).toBe(0);
    expect(store.getState().game?.clans[TEST_CLAN]?.gold).toBe(600);
    expect(events.some((e) => e.type === 'command.rejected')).toBe(false);
  });

  it('在完整 tick 成功後匯出 success-only command log', () => {
    dispatchCommand(grantGold(500));
    runOneDay();

    const log = exportCommandLog();
    expect(log).toMatchObject({ formatVersion: 1, finalDay: 1, truncated: false });
    expect(log.entries).toHaveLength(1);
    expect(log.entries[0]).toMatchObject({ day: 1, seq: 0, command: grantGold(500) });
  });

  it('空佇列亦可推進（tickSeq +1、無事件）', () => {
    const events = runOneDay();
    expect(store.getState().tickSeq).toBe(1);
    expect(events).toEqual([]);
    expect(exportCommandLog()).toMatchObject({ finalDay: 1, truncated: false, entries: [] });
  });

  it('連續呼叫兩次 tickSeq 累加至 2', () => {
    runOneDay();
    runOneDay();
    expect(store.getState().tickSeq).toBe(2);
  });

  it('onAutoPauseReasons 註冊的回呼於每次 runOneDay 後被呼叫（縱使骨架期恆空陣列）', () => {
    const seen: unknown[] = [];
    onAutoPauseReasons((reasons) => seen.push(reasons));
    runOneDay();
    expect(seen).toEqual([[]]);
    onAutoPauseReasons(null);
  });
});
