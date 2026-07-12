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

beforeEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(makeLoopTestState({ day: 0, gold: 1000 }));
});

afterEach(() => {
  cleanup();
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

  it('金錢佔位顯示目前玩家勢力 gold（千分位＋「貫」單位）', () => {
    render(<MainScreen />);
    expect(screen.getByText(/1,000貫/)).toBeTruthy();
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
});
