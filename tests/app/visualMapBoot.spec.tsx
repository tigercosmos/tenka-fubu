// `?debug=visual-map` 啟動路徑測試（M6-V2；規格：plan/18-roadmap.md M6-V2 列；
// plan/17-testing.md §3.9.3）。分兩層：
// - `bootVisualMapGame()` 純函式層（不涉 React/Pixi）：驗證固定 fixture 載入＋一次性場景 UI 態
//   （選取行軍中我方部隊＋路徑預覽）。
// - `App` 整合層（比照 tests/app/App.spec.tsx 之 pixi mock 慣例）：驗證 URL 參數優先於一般新遊戲
//   精靈、直達 MainScreen、HUD 顯示 fixture 開局日期、速度維持 paused、debug API 已安裝。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const hoisted = vi.hoisted(() => ({ apps: [] as { destroyed: boolean }[] }));
vi.mock('pixi.js', async () => {
  const { createPixiMockClasses } = await import('../helpers/pixiMock');
  return createPixiMockClasses(hoisted.apps);
});

import { App } from '../../src/app/App';
import { resetGameStoreForTests, store } from '../../src/app/store';
import { resetBridgeForTests } from '../../src/app/bridge';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { bootVisualMapGame } from '../../src/app/visualMapBoot';
import { DEBUG_VISUAL_MAP_ID } from '../../src/core/debugVisual';
import type { TenkaDebugApi } from '../../src/app/debug';

beforeEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
  window.history.pushState({}, '', '/');
});

afterEach(() => {
  cleanup();
  window.history.pushState({}, '', '/');
});

describe('bootVisualMapGame()（純函式；M6-V2）', () => {
  it('回傳固定 debugVisual fixture（debugMode=true）並選取一支行軍中我方部隊、佈置路徑預覽', () => {
    const game = bootVisualMapGame();
    expect(game.meta.scenarioId).toBe(DEBUG_VISUAL_MAP_ID);
    expect(game.meta.debugMode).toBe(true);

    const selection = uiStore.getState().selection;
    expect(selection?.kind).toBe('army');
    const selectedArmy = selection === null ? undefined : game.armies[selection.id as never];
    expect(selectedArmy?.clanId).toBe(game.meta.playerClanId);
    expect(selectedArmy?.status).toBe('marching'); // 唯一符合「本方行軍中」的部隊（丹羽長秀）

    const draft = uiStore.getState().marchDraft;
    expect(draft?.phase).toBe('compose'); // 非 'pickTarget'：不觸發 orderMarch 互動模式
    expect(draft?.previewPath?.result.found).toBe(true);
    expect(draft?.previewPath?.originNodeId).toBe(selectedArmy?.path[0]);
    expect(draft?.previewPath?.targetNodeId).toBe(selectedArmy?.targetNodeId);
  });

  it('未 enqueueModal：modal 仍為 null（路徑預覽不應彈出行軍 modal）', () => {
    bootVisualMapGame();
    expect(uiStore.getState().modal).toBeNull();
  });

  it('決定論：連續兩次呼叫（不讀 Math.random／Date.now）產出完全相同的 game 資料', () => {
    const a = bootVisualMapGame();
    const b = bootVisualMapGame();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('App：?debug=visual-map（M6-V2）', () => {
  it('略過標題與新遊戲精靈，直接進入 MainScreen；HUD 顯示 1561年；速度維持 paused', async () => {
    window.history.pushState({}, '', '/?debug=visual-map');
    render(<App />);

    expect(await screen.findByTestId('screen-strategy')).toBeTruthy();
    expect(store.getState().session.screen).toBe('main');
    expect(store.getState().session.speed).toBe('paused');
    const game = store.getState().game;
    expect(game?.meta.scenarioId).toBe(DEBUG_VISUAL_MAP_ID);
    expect(screen.getByTestId('hud-date').textContent).toContain('1561年');
  });

  it('window.__TENKA_DEBUG__ 已安裝（?debug=visual-map 隱含 enabled=true）', () => {
    window.history.pushState({}, '', '/?debug=visual-map');
    render(<App />);
    const api = (window as unknown as { __TENKA_DEBUG__?: TenkaDebugApi }).__TENKA_DEBUG__;
    expect(api).toBeDefined();
    expect(typeof api?.setMapCameraPreset).toBe('function');
    expect(typeof api?.waitMapIdle).toBe('function');
  });

  it('?debug=visual-map 優先於 ?skipTitle=1（不落回 tiny fixture 新遊戲）', async () => {
    window.history.pushState({}, '', '/?debug=visual-map&skipTitle=1');
    render(<App />);
    expect(await screen.findByTestId('screen-strategy')).toBeTruthy();
    expect(store.getState().game?.meta.scenarioId).toBe(DEBUG_VISUAL_MAP_ID);
  });
});
