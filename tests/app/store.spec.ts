// src/app/store.ts 單元測試（M1-15／01-A6）。
// 規格：plan/01-architecture.md §3.4.1（Store 形狀與所有權）／§3.5.3（暫停/變速語意）。

import { beforeEach, describe, expect, it } from 'vitest';
import { initialSession, resetGameStoreForTests, store, type Selection } from '../../src/app/store';
import { makeLoopTestState } from '../helpers/loopState';

beforeEach(() => {
  resetGameStoreForTests(null);
});

describe('初始狀態', () => {
  it('game 為 null、tickSeq 為 0、session 為 initialSession', () => {
    expect(store.getState().game).toBeNull();
    expect(store.getState().tickSeq).toBe(0);
    expect(store.getState().session).toEqual(initialSession);
  });
});

describe('session actions — 純 UI 操作（不觸碰 game/tickSeq）', () => {
  it('setScreen 只變更 screen 欄位', () => {
    store.getState().actions.setScreen('main');
    expect(store.getState().session.screen).toBe('main');
  });

  it('select／closeModal／openModal 各自只變更對應欄位', () => {
    const sel: Selection = { kind: 'castle', id: 'castle.kiyosu' };
    store.getState().actions.select(sel);
    expect(store.getState().session.selection).toEqual(sel);

    store.getState().actions.openModal({ id: 'confirm', params: {}, pausesTime: false });
    expect(store.getState().session.openModal).toEqual({
      id: 'confirm',
      params: {},
      pausesTime: false,
    });

    store.getState().actions.closeModal();
    expect(store.getState().session.openModal).toBeNull();
  });

  it('setPendingCommandCount／setDebugJumping 各自更新對應欄位', () => {
    store.getState().actions.setPendingCommandCount(3);
    expect(store.getState().session.pendingCommandCount).toBe(3);

    store.getState().actions.setDebugJumping({ totalDays: 30, doneDays: 10 });
    expect(store.getState().session.debug.jumping).toEqual({ totalDays: 30, doneDays: 10 });
    store.getState().actions.setDebugJumping(null);
    expect(store.getState().session.debug.jumping).toBeNull();
  });
});

describe('setSpeed — 純速度切換（§3.5.3：不含暫停原因記錄）', () => {
  it('切到 x1/x2/x5 時同步更新 resumeSpeed', () => {
    store.getState().actions.setSpeed('x2');
    expect(store.getState().session.speed).toBe('x2');
    expect(store.getState().session.resumeSpeed).toBe('x2');
  });
});

describe('requestPause／resume（§3.5.3）', () => {
  it('requestPause 記錄原因並把目前檔位存入 resumeSpeed', () => {
    store.getState().actions.setSpeed('x5');
    store.getState().actions.requestPause('user');
    expect(store.getState().session.speed).toBe('paused');
    expect(store.getState().session.lastPauseReason).toBe('user');
    expect(store.getState().session.resumeSpeed).toBe('x5'); // 暫停前檔位
  });

  it('已暫停時再次 requestPause 不覆寫 resumeSpeed（保留原本暫停前檔位）', () => {
    store.getState().actions.setSpeed('x2');
    store.getState().actions.requestPause('user');
    store.getState().actions.requestPause('windowHidden'); // 第二次暫停（原因可能不同）
    expect(store.getState().session.resumeSpeed).toBe('x2'); // 未被 'paused' 污染
    expect(store.getState().session.lastPauseReason).toBe('windowHidden');
  });

  it('resume 回到 resumeSpeed 並清除 lastPauseReason', () => {
    store.getState().actions.setSpeed('x1');
    store.getState().actions.requestPause('user');
    store.getState().actions.resume();
    expect(store.getState().session.speed).toBe('x1');
    expect(store.getState().session.lastPauseReason).toBeNull();
  });
});

describe('resetGameStoreForTests', () => {
  it('可安裝任意 GameState 並於下次重置回 null', () => {
    const game = makeLoopTestState();
    resetGameStoreForTests(game);
    expect(store.getState().game).toBe(game);
    expect(store.getState().tickSeq).toBe(0);

    resetGameStoreForTests();
    expect(store.getState().game).toBeNull();
  });
});
