// DebugPanel 元件測試（M1-22／01-A11／03-T11 縮減版）。
// 規格：18-roadmap.md M1-22 驗收：「?debug=1&seed=42 開局後面板可開；『+30日』快進正常；
// debug.addGold 使 HUD 金錢 +10,000貫」。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DebugPanel } from './DebugPanel';
import { resetGameStoreForTests, store } from '../../app/store';
import { getQueuedPlayerCommands, resetBridgeForTests, runOneDay } from '../../app/bridge';
import { BAL } from '../../core/balance';
import { stateHash } from '../../core/state/serialize';
import * as serialization from '../../core/state/serialize';
import { formatNumber } from '../../i18n/zh-TW';
import { makeLoopTestState } from '../../../tests/helpers/loopState';

beforeEach(() => {
  resetBridgeForTests();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('DebugPanel — session.debug.panelOpen 開關', () => {
  it('panelOpen=false 時不渲染任何內容（01 §3.11.1：面板不掛載）', () => {
    resetGameStoreForTests(makeLoopTestState({ debugMode: true }));
    const { container } = render(<DebugPanel />);
    expect(container.firstChild).toBeNull();
  });

  it('panelOpen=true 時渲染面板（data-testid="debug-panel"）', () => {
    resetGameStoreForTests(makeLoopTestState({ debugMode: true }));
    store.getState().actions.setDebugPanelOpen(true);
    render(<DebugPanel />);
    expect(screen.getByTestId('debug-panel')).toBeTruthy();
    expect(screen.getByText('除錯面板')).toBeTruthy();
  });
});

describe('DebugPanel — game 尚未 boot（新遊戲前）', () => {
  it('容忍 game === null：顯示「無資料」，作弊/狀態按鈕 disabled，不拋例外', () => {
    resetGameStoreForTests(null);
    store.getState().actions.setDebugPanelOpen(true);
    expect(() => render(<DebugPanel />)).not.toThrow();
    expect(screen.getByText('（無資料）')).toBeTruthy();
    expect(screen.getByTestId('debug-jump-1')).toHaveProperty('disabled', true);
    expect(screen.getByTestId('debug-jump-30')).toHaveProperty('disabled', true);
    expect(screen.getByTestId('debug-add-gold')).toHaveProperty('disabled', true);
  });
});

describe('DebugPanel — 時間跳轉（+1日／+30日，對應 debugSkipDays）', () => {
  beforeEach(() => {
    resetGameStoreForTests(makeLoopTestState({ day: 0, debugMode: true }));
    store.getState().actions.setDebugPanelOpen(true);
  });

  it('「跳轉1日」按鈕點擊後，state.time.day 前進 1 日（03-T11：跳轉與逐日播放語意相同）', () => {
    render(<DebugPanel />);
    expect(screen.getByText('跳轉1日')).toBeTruthy();
    fireEvent.click(screen.getByTestId('debug-jump-1'));
    expect(store.getState().game?.time.day).toBe(1);
  });

  it('「跳轉30日」按鈕點擊後，state.time.day 前進 30 日', () => {
    render(<DebugPanel />);
    fireEvent.click(screen.getByTestId('debug-jump-30'));
    expect(store.getState().game?.time.day).toBe(30);
  });
});

describe('DebugPanel — 資源作弊（debug.addGold）', () => {
  it('點擊「金錢 +10,000貫」入列 debugGrant；下一 tick 後 clan.gold += BAL.debugGrantGoldAmount', () => {
    resetGameStoreForTests(makeLoopTestState({ day: 0, debugMode: true, gold: 0 }));
    store.getState().actions.setDebugPanelOpen(true);
    render(<DebugPanel />);

    expect(screen.getByText(`金錢 +${formatNumber(BAL.debugGrantGoldAmount)}貫`)).toBeTruthy();
    fireEvent.click(screen.getByTestId('debug-add-gold'));
    // Command 僅入列，尚未套用（00 §5.2）：此刻金錢仍為 0。
    const playerClanId = store.getState().game!.meta.playerClanId;
    expect(store.getState().game!.clans[playerClanId]!.gold).toBe(0);

    // 用 +1 日跳轉觸發一次 tick，套用佇列中的 debugGrant。
    fireEvent.click(screen.getByTestId('debug-jump-1'));
    expect(store.getState().game!.clans[playerClanId]!.gold).toBe(BAL.debugGrantGoldAmount);
  });

  it('debugMode=false（未帶 ?debug=1）時 debugGrant 被拒，金錢不變', () => {
    resetGameStoreForTests(makeLoopTestState({ day: 0, debugMode: false, gold: 0 }));
    store.getState().actions.setDebugPanelOpen(true);
    render(<DebugPanel />);
    fireEvent.click(screen.getByTestId('debug-add-gold'));
    fireEvent.click(screen.getByTestId('debug-jump-1'));
    const playerClanId = store.getState().game!.meta.playerClanId;
    expect(store.getState().game!.clans[playerClanId]!.gold).toBe(0);
  });
});

describe('DebugPanel — 狀態區塊（種子與 stateHash，供 03-T11 人工核對）', () => {
  it('real queued commands remain intact while browsing, live tick refreshes values and replacement resets the tree', () => {
    const game = makeLoopTestState({ day: 0, debugMode: true });
    resetGameStoreForTests(game);
    store.getState().actions.setDebugPanelOpen(true);
    render(<DebugPanel />);
    fireEvent.click(screen.getByTestId('debug-add-gold'));
    const before = JSON.stringify(game);
    const pending = getQueuedPlayerCommands(game);
    expect(pending).toHaveLength(1);
    const node = (path: string[]) =>
      screen
        .getAllByTestId('state-viewer-node')
        .find((item) => item.dataset.path === JSON.stringify(path))!;
    const expand = (item: HTMLElement) => {
      const details = item.querySelector('details')!;
      details.open = true;
      fireEvent(details, new Event('toggle'));
    };
    expand(node([]));
    expand(node(['time']));
    expect(node(['time', 'day']).textContent).toContain('day 0');
    expect(JSON.stringify(game)).toBe(before);
    expect(getQueuedPlayerCommands(game)).toEqual(pending);
    act(() => {
      runOneDay();
    });
    expect(node(['time', 'day']).textContent).toContain('day 1');
    expect(getQueuedPlayerCommands(game)).toHaveLength(0);
    act(() => {
      resetGameStoreForTests(makeLoopTestState({ day: 7, debugMode: true }));
      store.getState().actions.setDebugPanelOpen(true);
    });
    expect(screen.getAllByTestId('state-viewer-node')).toHaveLength(1);
    expect(node([]).querySelector('details')!.open).toBe(false);
  });

  it('顯示種子與 stateHash；stateHash 與 core/state/serialize.ts 的 stateHash(state) 一致', () => {
    const game = makeLoopTestState({ day: 0, debugMode: true });
    resetGameStoreForTests(game);
    store.getState().actions.setDebugPanelOpen(true);
    render(<DebugPanel />);
    expect(screen.getByTestId('debug-seed').textContent).toContain(String(game.meta.seed));
    fireEvent.click(screen.getByTestId('debug-calculate-hash'));
    expect(screen.getByTestId('debug-state-hash').textContent).toBe(
      `狀態雜湊：${stateHash(store.getState().game!)}`,
    );
  });

  it('opening, browsing and publication never calculate the whole-state hash without its explicit button', () => {
    const game = makeLoopTestState({ debugMode: true });
    resetGameStoreForTests(game);
    store.getState().actions.setDebugPanelOpen(true);
    const hash = vi.spyOn(serialization, 'stateHash');
    render(<DebugPanel />);
    expect(hash).not.toHaveBeenCalled();
    expect(screen.getByTestId('debug-state-hash').textContent).toContain('尚未計算或已過期');
    fireEvent.click(screen.getByTestId('debug-calculate-hash'));
    expect(hash).toHaveBeenCalledTimes(1);
    act(() => store.setState({ tickSeq: store.getState().tickSeq + 1 }));
    expect(hash).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('debug-state-hash').textContent).toContain('尚未計算或已過期');
    act(() => store.getState().actions.setDebugPanelOpen(false));
    act(() => store.getState().actions.setDebugPanelOpen(true));
    expect(hash).toHaveBeenCalledTimes(1);
  });

  it('跳轉 360 日（12 次「+30日」）與逐日呼叫 runOneDay() 360 次的最終 stateHash 一致（03-T11 核心驗收）', () => {
    const gameA = makeLoopTestState({ day: 0, debugMode: true });
    resetGameStoreForTests(gameA);
    store.getState().actions.setDebugPanelOpen(true);
    render(<DebugPanel />);
    for (let i = 0; i < 12; i += 1) {
      fireEvent.click(screen.getByTestId('debug-jump-30')); // 30 日一批×12＝360 日（每批同步解算，見 gameLoop.ts stepDaysChunk）
    }
    expect(store.getState().game!.time.day).toBe(360);
    const hashViaJump = stateHash(store.getState().game!);

    act(() => {
      resetBridgeForTests();
      resetGameStoreForTests(makeLoopTestState({ day: 0, debugMode: true }));
      for (let i = 0; i < 360; i += 1) runOneDay();
    });
    expect(store.getState().game!.time.day).toBe(360);
    const hashViaPlain = stateHash(store.getState().game!);

    expect(hashViaJump).toBe(hashViaPlain);
  });
});
