// App.tsx 全流程整合測試（M2-19；18-roadmap.md M2-19 驗收：「選織田進入主畫面、HUD 顯示 1560年」；
// 比照 plan/17-testing.md §3.8 P2 之步驟（title-newgame → scenario-pick-s1560 → clan-pick-clan.oda
// → newgame-start），但在 jsdom 元件層級跑（不跑瀏覽器/Playwright，該部分留待 M2-20）。
//
// 全程使用真實資料管線（`src/app/boot.ts` 真實 `loadScenario`/`buildNewGameState`，非 mock）——
// s1560 東海＋近畿批次資料量小，解析近乎即時，驗證的是「真的能跑完整條路徑」而非樁測試。
// pixi.js 仍需整包 mock（見 tests/helpers/pixiMock.ts 檔頭）：選完大名後畫面轉場到 MainScreen，
// 該畫面自 M2-19 起掛載 MapCanvasHost。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const hoisted = vi.hoisted(() => ({ apps: [] as { destroyed: boolean }[] }));
vi.mock('pixi.js', async () => {
  const { createPixiMockClasses } = await import('../helpers/pixiMock');
  return createPixiMockClasses(hoisted.apps);
});

import { App } from '../../src/app/App';
import { resetGameStoreForTests, store } from '../../src/app/store';
import { resetBridgeForTests } from '../../src/app/bridge';

beforeEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(null);
});

afterEach(() => {
  cleanup();
});

describe('App（新遊戲精靈全流程，M2-19）', () => {
  it('標題→劇本→選織田→開始遊戲：進入 MainScreen（screen-strategy），HUD 顯示 1560年，GameState 已建立', async () => {
    render(<App />);

    // 標題畫面。
    expect(screen.getByTestId('screen-title')).toBeTruthy();
    expect(store.getState().session.screen).toBe('title');

    // 點「新遊戲」→ ScenarioSelectScreen（17 §3.8 P2 第一步）。
    fireEvent.click(screen.getByTestId('title-newgame'));
    expect(screen.getByTestId('screen-scenario-select')).toBeTruthy();

    // 劇本卡片載入完成（真實 s1560 資料）後點擊 → DaimyoSelectScreen。
    await waitFor(() => {
      expect(screen.getByTestId('scenario-pick-s1560')).toHaveProperty('disabled', false);
    });
    fireEvent.click(screen.getByTestId('scenario-pick-s1560'));
    expect(screen.getByTestId('screen-daimyo-select')).toBeTruthy();

    // 選織田 → 啟用「開始遊戲」→ 點擊建局。
    expect(screen.getByTestId('newgame-start')).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByTestId('clan-pick-clan.oda'));
    expect(screen.getByTestId('newgame-start')).toHaveProperty('disabled', false);

    fireEvent.click(screen.getByTestId('newgame-start'));

    // 驗收核心：store 進入 running（screen='main'，MainScreen 可見）＋ GameState 已建立。
    expect(screen.getByTestId('screen-strategy')).toBeTruthy();
    expect(store.getState().session.screen).toBe('main');
    const game = store.getState().game;
    expect(game).not.toBeNull();
    expect(game?.meta.playerClanId).toBe('clan.oda');
    expect(game?.meta.scenarioId).toBe('s1560');
    expect(screen.getByTestId('hud-date').textContent).toContain('1560年');
  });

  it('「返回」可從 ScenarioSelect 回標題、DaimyoSelect 回 ScenarioSelect', async () => {
    render(<App />);

    fireEvent.click(screen.getByTestId('title-newgame'));
    expect(screen.getByTestId('screen-scenario-select')).toBeTruthy();
    fireEvent.click(screen.getByTestId('scenario-back'));
    expect(screen.getByTestId('screen-title')).toBeTruthy();

    fireEvent.click(screen.getByTestId('title-newgame'));
    await waitFor(() => {
      expect(screen.getByTestId('scenario-pick-s1560')).toHaveProperty('disabled', false);
    });
    fireEvent.click(screen.getByTestId('scenario-pick-s1560'));
    expect(screen.getByTestId('screen-daimyo-select')).toBeTruthy();
    fireEvent.click(screen.getByTestId('daimyo-back'));
    expect(screen.getByTestId('screen-scenario-select')).toBeTruthy();
  });
});
