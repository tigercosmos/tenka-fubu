// MainScreen 元件測試（M1-20；18-roadmap.md M1-20 驗收：「HUD 日期隨 tick 前進」；M2-19 起額外
// 掛載 MapCanvasHost，故整包 mock pixi.js，見 tests/helpers/pixiMock.ts 檔頭）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const hoisted = vi.hoisted(() => ({ apps: [] as { destroyed: boolean }[] }));
vi.mock('pixi.js', async () => {
  const { createPixiMockClasses } = await import('../../../tests/helpers/pixiMock');
  return createPixiMockClasses(hoisted.apps);
});

import { MainScreen } from './MainScreen';
import { resetGameStoreForTests, store } from '../../app/store';
import { resetBridgeForTests, runOneDay } from '../../app/bridge';
import { makeLoopTestState } from '../../../tests/helpers/loopState';
import { uiStore } from '../hooks/uiStore';
import { t } from '@i18n/zh-TW';
import { UI } from '../uiConstants';

beforeEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(makeLoopTestState({ day: 0, gold: 1000 }));
  uiStore.getState().actions.reset();
  // M6-V9 起 MainScreen 掛載 MiniMap（兩層 canvas）；jsdom 無 canvas 2D 實作（17 §3.2），
  // mock 掉避免 not-implemented 噪音——MiniMap 對 null ctx 已有防禦（比照 MiniMap.spec.tsx）。
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('MainScreen（11 §3.3 縮減版 HUD）', () => {
  it('畫面根節點 data-testid="screen-strategy"（17 §6.2 testid 契約：非 "screen-main"）', () => {
    render(<MainScreen />);
    expect(screen.getByTestId('screen-strategy')).toBeTruthy();
  });

  it('data-testid="hud-date" 顯示 formatDate 格式（00 §9：1560年1月1日）', () => {
    render(<MainScreen />);
    expect(screen.getByTestId('hud-date').textContent).toBe('1560年1月1日');
  });

  it('推進一日（runOneDay）後 HUD 日期隨之更新（M1-20 驗收核心）', () => {
    render(<MainScreen />);
    expect(screen.getByTestId('hud-date').textContent).toBe('1560年1月1日');
    act(() => {
      runOneDay();
    });
    expect(screen.getByTestId('hud-date').textContent).toBe('1560年1月2日');
  });

  it('ResourceBar 顯示目前玩家勢力 gold（千分位；M6-V9 §4.2 接線）', () => {
    render(<MainScreen />);
    const goldLabel = screen.getByText(t('ui.hud.gold'));
    expect(goldLabel.parentElement?.textContent).toContain('1,000');
  });

  it('四檔速度按鈕存在（speed-pause／speed-1／speed-2／speed-5）；點擊後 aria-pressed 切換', () => {
    render(<MainScreen />);
    const pauseBtn = screen.getByTestId('speed-pause');
    const x1Btn = screen.getByTestId('speed-1');
    expect(screen.getByTestId('speed-2')).toBeTruthy();
    expect(screen.getByTestId('speed-5')).toBeTruthy();
    expect(pauseBtn.getAttribute('aria-pressed')).toBe('true'); // 初始 session.speed='paused'

    fireEvent.click(x1Btn);
    expect(store.getState().session.speed).toBe('x1');
    expect(x1Btn.getAttribute('aria-pressed')).toBe('true');
    expect(pauseBtn.getAttribute('aria-pressed')).toBe('false');
  });

  it('點擊 speed-pause 呼叫 gameLoop.requestPause（session.lastPauseReason=user）', () => {
    render(<MainScreen />);
    fireEvent.click(screen.getByTestId('speed-1'));
    fireEvent.click(screen.getByTestId('speed-pause'));
    expect(store.getState().session.speed).toBe('paused');
    expect(store.getState().session.lastPauseReason).toBe('user');
  });

  it('M3 左側快捷列可開啟武將與政策面板', () => {
    render(<MainScreen />);
    fireEvent.click(screen.getByTestId('rail-officers'));
    expect(uiStore.getState().panelStack.at(-1)?.id).toBe('officers');
    fireEvent.click(screen.getByTestId('rail-policy'));
    expect(uiStore.getState().panelStack.at(-1)?.id).toBe('policy');
    expect(screen.getByTestId('policy-panel')).toBeTruthy();
  });

  it('軍事快捷列以玩家居城建立出陣草稿並開啟編成 modal', () => {
    const game = store.getState().game!;
    game.castles[game.clans[game.meta.playerClanId]!.homeCastleId]!.soldiers = 3_000;
    render(<MainScreen />);

    fireEvent.click(screen.getByTestId('rail-military'));

    expect(uiStore.getState().marchDraft).toMatchObject({
      originCastleId: game.clans[game.meta.playerClanId]!.homeCastleId,
      phase: 'compose',
    });
    expect(uiStore.getState().modal?.id).toBe('march');
    expect(screen.getByTestId('march-modal')).toBeTruthy();
  });

  it('軍團委任城不可由軍事快捷列出陣', () => {
    const game = store.getState().game!;
    const home = game.castles[game.clans[game.meta.playerClanId]!.homeCastleId]!;
    home.directControl = false;
    render(<MainScreen />);
    expect(screen.getByTestId('rail-military').hasAttribute('disabled')).toBe(true);
  });

  // ── M6-V9 HUD 組裝（§4）新元件接線 ──

  it('MiniMap 掛載於 HUD（minimap/minimap-base/minimap-frame testid 契約）', () => {
    render(<MainScreen />);
    expect(screen.getByTestId('minimap')).toBeTruthy();
    expect(screen.getByTestId('minimap-base')).toBeTruthy();
    expect(screen.getByTestId('minimap-frame')).toBeTruthy();
  });

  it('☰ 系統選單為 disabled 占位（M8 前不接功能，§4.7）', () => {
    render(<MainScreen />);
    const menuBtn = screen.getByRole('button', { name: t('ui.system.menu') });
    expect(menuBtn.hasAttribute('disabled')).toBe(true);
  });

  it('選取城池 → 底部 ContextPanel 顯示快覽（不自動開完整城面板，§4.6 點擊語意）', () => {
    const game = store.getState().game!;
    const homeId = game.clans[game.meta.playerClanId]!.homeCastleId;
    render(<MainScreen />);
    act(() => {
      uiStore.getState().actions.setSelection({ kind: 'castle', id: homeId });
    });
    // 快覽條動作鈕在場（城面板／出陣／輸送鎖定占位）……
    expect(screen.getByRole('button', { name: t('ui.context.castle.panel') })).toBeTruthy();
    // ……但完整 CastlePanel 不因選取而自動開啟（panelStack 空、無 castle-panel）。
    expect(uiStore.getState().panelStack).toHaveLength(0);
    expect(screen.queryByTestId('castle-panel')).toBeNull();

    // 快覽鈕才是完整面板入口。
    fireEvent.click(screen.getByRole('button', { name: t('ui.context.castle.panel') }));
    expect(uiStore.getState().panelStack.at(-1)?.id).toBe('castle');
    expect(screen.getByTestId('castle-panel')).toBeTruthy();
  });

  it('視窗跨越 1440 斷點 resize 時 MiniMap 尺寸即時更新（M6-V9 review 補跑：暫停中無 tick 亦然）', () => {
    const setWidth = (px: number): void => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: px });
    };
    const original = window.innerWidth;
    try {
      setWidth(1600);
      render(<MainScreen />);
      expect(screen.getByTestId('minimap').style.width).toBe(`${UI.minimapSizePx}px`);

      // 不推進任何 tick（模擬暫停），僅發 resize——尺寸須立即切到 <1440 檔。
      setWidth(1200);
      act(() => {
        window.dispatchEvent(new Event('resize'));
      });
      expect(screen.getByTestId('minimap').style.width).toBe('176px');
    } finally {
      setWidth(original);
    }
  });
});
