// src/app/bridge.ts 單元測試（M1-15／01-A6 驗收：dispatch 合法 Command 後佇列長度 +1；
// runOneDay 後 tickSeq +1、佇列清空）。
// 規格：plan/01-architecture.md §3.4.3（Command 佇列 API）／§3.4.4（publishTick）／§5.2。

import { beforeEach, describe, expect, it } from 'vitest';
import {
  dispatchCommand,
  onAutoPauseReasons,
  resetBridgeForTests,
  runOneDay,
} from '../../src/app/bridge';
import { resetGameStoreForTests, store } from '../../src/app/store';
import { CoreError } from '../../src/core/errors';
import type { Command } from '../../src/core/commands/types';
import { makeLoopTestState, TEST_CLAN } from '../helpers/loopState';

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

  it('非法 Command（debugMode=false）：回傳 ok:false 且不入列（pendingCommandCount 不變）', () => {
    resetGameStoreForTests(makeLoopTestState({ debugMode: false }));
    const result = dispatchCommand(grantGold(1));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('cmd.reject.debugOnly');
    }
    expect(store.getState().session.pendingCommandCount).toBe(0);
  });
});

describe('runOneDay — game 未 boot', () => {
  it('拋出 CoreError（DATA_INTEGRITY）', () => {
    expect(() => runOneDay()).toThrow(CoreError);
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

  it('空佇列亦可推進（tickSeq +1、無事件）', () => {
    const events = runOneDay();
    expect(store.getState().tickSeq).toBe(1);
    expect(events).toEqual([]);
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
