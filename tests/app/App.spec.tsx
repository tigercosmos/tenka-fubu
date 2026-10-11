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
import LZString from 'lz-string';

const hoisted = vi.hoisted(() => ({ apps: [] as { destroyed: boolean }[] }));
// Component renderer fixtures use the actual committed WASM with an independent owner.
vi.mock('@ui/map/wasmGeographicScorer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ui/map/wasmGeographicScorer')>();
  const { realRenderWasmExports } = await import('../helpers/realRenderWasm');
  return {
    ...actual,
    createWasmGeographicScorer: (exports?: Record<string, unknown>) =>
      actual.createWasmGeographicScorer(exports ?? realRenderWasmExports()),
  };
});

vi.mock('pixi.js', async () => {
  const { createPixiMockClasses } = await import('../helpers/pixiMock');
  return createPixiMockClasses(hoisted.apps);
});

import { App } from '../../src/app/App';
import { resetGameStoreForTests, store } from '../../src/app/store';
import { resetBridgeForTests } from '../../src/app/bridge';
import { settingsStore } from '../../src/app/settings/runtime';
import { SettingsSchema } from '../../src/app/settings';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { t } from '../../src/i18n/zh-TW';
import { indexedDbSaveStorage } from '../../src/app/persistence/storage';
import { encodeSave } from '../../src/core/save/serialize';

beforeEach(() => {
  settingsStore.setState({ settings: SettingsSchema.parse({}) });
  resetBridgeForTests();
  resetGameStoreForTests(null);
});

afterEach(() => {
  cleanup();
  settingsStore.setState({ settings: SettingsSchema.parse({}) });
  document.documentElement.style.removeProperty('--ui-scale');
  document.documentElement.style.removeProperty('font-size');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('App（新遊戲精靈全流程，M2-19）', () => {
  it('restores the main UI screen and F7 after a main-to-main quickload without a tick', async () => {
    const get = vi.spyOn(indexedDbSaveStorage, 'get').mockResolvedValue(undefined);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    render(<App />);
    fireEvent.click(screen.getByTestId('title-save-list'));
    await waitFor(() =>
      expect(screen.getByTestId('save-load-panel').getAttribute('aria-busy')).toBe('false'),
    );
    fireEvent.click(screen.getByRole('button', { name: t('ui.common.back') }));
    fireEvent.click(screen.getByTestId('title-newgame'));
    await waitFor(() =>
      expect(screen.getByTestId('scenario-pick-s1560')).toHaveProperty('disabled', false),
    );
    fireEvent.click(screen.getByTestId('scenario-pick-s1560'));
    fireEvent.click(screen.getByTestId('clan-pick-clan.oda'));
    fireEvent.click(screen.getByTestId('newgame-start'));
    await waitFor(() => expect(screen.getByTestId('screen-strategy')).toBeTruthy());
    const previous = store.getState().game!;
    const tickSeq = store.getState().tickSeq;
    const blob = LZString.compressToUTF16(encodeSave(previous, 123));
    get.mockImplementation((key) =>
      Promise.resolve(key === 'tf.save.quick:1.blob' ? blob : undefined),
    );
    fireEvent.keyDown(window, { key: 'F9' });
    await waitFor(() => expect(store.getState().game).not.toBe(previous));
    expect(store.getState().tickSeq).toBe(tickSeq);
    expect(store.getState().session.screen).toBe('main');
    expect(uiStore.getState().screen).toBe('main');
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.keyDown(document.body, { key: 'F7' });
    expect(screen.getByTestId('taimei-panel')).toBeTruthy();
    expect(store.getState().session.speed).toBe('paused');
  });
  it('quota quick-save failure exposes current-progress export without core mutations', async () => {
    vi.spyOn(indexedDbSaveStorage, 'get').mockResolvedValue(undefined);
    vi.spyOn(indexedDbSaveStorage, 'setMany').mockRejectedValue(
      new DOMException('quota', 'QuotaExceededError'),
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
    const revoke = vi.fn();
    const createUrl = vi.fn(() => 'blob:backup');
    vi.stubGlobal('URL', { createObjectURL: createUrl, revokeObjectURL: revoke });
    const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<App />);
    // Await real persistence initialization before exercising keyboard actions.
    fireEvent.click(screen.getByTestId('title-save-list'));
    await waitFor(() =>
      expect(screen.getByTestId('save-load-panel').getAttribute('aria-busy')).toBe('false'),
    );
    fireEvent.click(screen.getByRole('button', { name: t('ui.common.back') }));
    fireEvent.click(screen.getByTestId('title-newgame'));
    await waitFor(() =>
      expect(screen.getByTestId('scenario-pick-s1560')).toHaveProperty('disabled', false),
    );
    fireEvent.click(screen.getByTestId('scenario-pick-s1560'));
    fireEvent.click(screen.getByTestId('clan-pick-clan.oda'));
    fireEvent.click(screen.getByTestId('newgame-start'));
    await waitFor(() => expect(screen.getByTestId('screen-strategy')).toBeTruthy());
    const before = structuredClone(store.getState().game);
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(t('error.save.quotaExceeded')),
    );
    expect(screen.queryByText(t('ui.save.quickSaved'))).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: t('ui.save.exportCurrent') }));
    await waitFor(() => expect(download).toHaveBeenCalledOnce());
    expect(createUrl).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith('blob:backup');
    expect(document.querySelector('a[download]')).toBeNull();
    expect(store.getState().game).toEqual(before);
  });
  it('opens title settings and immediately applies DOM scale without changing active speed', () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('title-settings'));
    fireEvent.change(screen.getByRole('slider'), { target: { value: '1.25' } });
    expect(settingsStore.getState().settings.uiScale).toBe(1.25);
    expect(document.documentElement.style.getPropertyValue('--ui-scale')).toBe('1.25');
    expect(uiStore.getState().uiScale).toBe(1.25);
    fireEvent.click(screen.getByRole('radio', { name: '×5' }));
    expect(store.getState().session.resumeSpeed).toBe('x1');
    fireEvent.click(screen.getByRole('button', { name: t('ui.common.back') }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('標題→劇本→選織田→開始遊戲：進入 MainScreen（screen-strategy），HUD 顯示 1560年，GameState 已建立', async () => {
    settingsStore.setState({ settings: SettingsSchema.parse({ defaultSpeed: 'x5' }) });
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
    await waitFor(() => expect(screen.getByTestId('screen-strategy')).toBeTruthy());
    expect(store.getState().session.screen).toBe('main');
    expect(store.getState().session.speed).toBe('paused');
    expect(store.getState().session.resumeSpeed).toBe('x5');
    expect(uiStore.getState().screen).toBe('main');
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
