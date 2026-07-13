// src/app/debug.ts 單元測試（M1-22／01-A11 驗收）。
// 規格：plan/01-architecture.md §3.11.1（URL 參數表）／§3.11.4（console API）／§4.5（DebugFlags）。

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installDebugApi, parseDebugFlags, type TenkaDebugApi } from '../../src/app/debug';
import { resetGameStoreForTests, setGame, store } from '../../src/app/store';
import { makeLoopTestState } from '../helpers/loopState';
import { buildNewGameState, loadScenario } from '../../src/app/boot';
import type { ClanId } from '../../src/core/state/ids';

describe('parseDebugFlags（01 §3.11.1／§4.5）', () => {
  it('空字串：全部回預設值', () => {
    expect(parseDebugFlags('')).toEqual({
      enabled: false,
      seed: null,
      scenario: 's1560',
      initialSpeed: 'paused',
      skipTitle: false,
      logTags: null,
    });
  });

  it('?debug=1 才視為啟用；其餘值（含 "true"／"0"）皆視為停用', () => {
    expect(parseDebugFlags('?debug=1').enabled).toBe(true);
    expect(parseDebugFlags('?debug=0').enabled).toBe(false);
    expect(parseDebugFlags('?debug=true').enabled).toBe(false);
    expect(parseDebugFlags('').enabled).toBe(false);
  });

  it('?seed=42 解析為數字；缺值／空字串／非數字回 null', () => {
    expect(parseDebugFlags('?seed=42').seed).toBe(42);
    expect(parseDebugFlags('?seed=0').seed).toBe(0);
    expect(parseDebugFlags('?seed=abc').seed).toBeNull();
    expect(parseDebugFlags('?seed=').seed).toBeNull();
    expect(parseDebugFlags('').seed).toBeNull();
  });

  it('?scenario= 覆蓋劇本 id；未給時預設 s1560', () => {
    expect(parseDebugFlags('?scenario=s9999').scenario).toBe('s9999');
    expect(parseDebugFlags('').scenario).toBe('s1560');
  });

  it('?speed= 僅接受合法 GameSpeed 值，否則回 paused', () => {
    expect(parseDebugFlags('?speed=x1').initialSpeed).toBe('x1');
    expect(parseDebugFlags('?speed=x2').initialSpeed).toBe('x2');
    expect(parseDebugFlags('?speed=x5').initialSpeed).toBe('x5');
    expect(parseDebugFlags('?speed=x9').initialSpeed).toBe('paused');
    expect(parseDebugFlags('').initialSpeed).toBe('paused');
  });

  it('?skipTitle=1 設定 skipTitle；其餘值視為 false', () => {
    expect(parseDebugFlags('?skipTitle=1').skipTitle).toBe(true);
    expect(parseDebugFlags('?skipTitle=0').skipTitle).toBe(false);
    expect(parseDebugFlags('').skipTitle).toBe(false);
  });

  it('?log=battle,ai 拆分為陣列（去除空白）；?log=all 為字面 "all"；未給為 null', () => {
    expect(parseDebugFlags('?log=battle,ai').logTags).toEqual(['battle', 'ai']);
    expect(parseDebugFlags('?log=battle, ai ').logTags).toEqual(['battle', 'ai']);
    expect(parseDebugFlags('?log=all').logTags).toBe('all');
    expect(parseDebugFlags('').logTags).toBeNull();
  });

  it('M1-22 驗收查詢字串 "?debug=1&seed=42" 同時正確解析兩者', () => {
    const flags = parseDebugFlags('?debug=1&seed=42');
    expect(flags.enabled).toBe(true);
    expect(flags.seed).toBe(42);
  });
});

describe('installDebugApi（01 §3.11.4 TenkaDebugApi）', () => {
  function getGlobalApi(): TenkaDebugApi | undefined {
    return (window as unknown as { __TENKA_DEBUG__?: TenkaDebugApi }).__TENKA_DEBUG__;
  }

  beforeEach(() => {
    resetGameStoreForTests(null);
    delete (window as unknown as { __TENKA_DEBUG__?: TenkaDebugApi }).__TENKA_DEBUG__;
  });

  afterEach(() => {
    delete (window as unknown as { __TENKA_DEBUG__?: TenkaDebugApi }).__TENKA_DEBUG__;
  });

  it('flags.enabled === false 時不安裝 window.__TENKA_DEBUG__（01 §3.11.1）', () => {
    installDebugApi(parseDebugFlags(''));
    expect(getGlobalApi()).toBeUndefined();
  });

  it('flags.enabled === true 時安裝 window.__TENKA_DEBUG__', () => {
    installDebugApi(parseDebugFlags('?debug=1&seed=42'));
    expect(getGlobalApi()).toBeDefined();
  });

  it('getSeed()：game 尚未 boot 時回傳 flags.seed（無則 0）；boot 後回傳 state.meta.seed', () => {
    installDebugApi(parseDebugFlags('?debug=1&seed=42'));
    const api = getGlobalApi();
    expect(api?.getSeed()).toBe(42);

    setGame(makeLoopTestState({ debugMode: true }));
    expect(store.getState().game?.meta.seed).toBe(42); // makeLoopTestState 預設 seed=42
    expect(api?.getSeed()).toBe(42);
  });

  it('getState()：game 尚未 boot 時擲例外；boot 後回傳目前 GameState', () => {
    installDebugApi(parseDebugFlags('?debug=1'));
    const api = getGlobalApi();
    expect(() => api?.getState()).toThrow();

    const game = makeLoopTestState({ debugMode: true });
    setGame(game);
    expect(api?.getState()).toBe(game);
  });

  it('dispatch()：轉發至 dispatchCommand（debugGrant 成功入列）', () => {
    setGame(makeLoopTestState({ debugMode: true, gold: 0 }));
    installDebugApi(parseDebugFlags('?debug=1'));
    const api = getGlobalApi();
    const game = store.getState().game;
    expect(game).not.toBeNull();
    const result = api?.dispatch({
      type: 'debugGrant',
      clanId: game!.meta.playerClanId,
      gold: 10_000,
      food: null,
      castleId: null,
    });
    expect(result).toEqual({ ok: true });
  });

  it('getPerf()：回傳 PerfSnapshot 形狀（M1-23 perfMonitor 資料來源）', () => {
    installDebugApi(parseDebugFlags('?debug=1'));
    const snapshot = getGlobalApi()?.getPerf();
    expect(typeof snapshot?.fps).toBe('number');
    expect(typeof snapshot?.lastTickMs).toBe('number');
    expect(typeof snapshot?.avgTickMs).toBe('number');
    expect(typeof snapshot?.maxTickMs).toBe('number');
  });

  it('exportCommandLog()：透過 debug API 匯出 canonical 檔頭', () => {
    setGame(makeLoopTestState({ debugMode: true }));
    installDebugApi(parseDebugFlags('?debug=1'));
    expect(getGlobalApi()?.exportCommandLog()).toMatchObject({
      formatVersion: 1,
      finalDay: 0,
      truncated: false,
    });
  });

  it('replayCommandLog()：以 production scenario loader 非同步重建並比對 hash', async () => {
    const bundle = await loadScenario('s1560');
    const game = buildNewGameState(bundle, {
      playerClanId: 'clan.oda' as ClanId,
      difficulty: 'normal',
      seed: 42,
    });
    setGame(game);
    installDebugApi(parseDebugFlags('?debug=1'));

    const api = getGlobalApi();
    const log = api?.exportCommandLog();
    expect(log).toBeDefined();
    await expect(api?.replayCommandLog(log!)).resolves.toMatchObject({
      match: true,
      balanceMismatch: false,
    });
  });

  it('setSpeed()：轉發至 gameLoop.setSpeed（session.speed 隨之更新）', () => {
    setGame(makeLoopTestState({ debugMode: true }));
    installDebugApi(parseDebugFlags('?debug=1'));
    getGlobalApi()?.setSpeed('x2');
    expect(store.getState().session.speed).toBe('x2');
  });
});
