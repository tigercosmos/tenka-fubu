// useHotkeys 單元測試（M1-16／01-A7 驗收：空白鍵暫停⇄繼續、1/2/3 變速；輸入框聚焦時停用）。
// 規格：plan/01-architecture.md §6.3（互動細節）。

import type { ReactElement } from 'react';
import { fireEvent, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHotkeys, type MainHotkeyHandlers } from './useHotkeys';
import { createGameLoopController } from '../../app/gameLoop';
import { resetGameStoreForTests, store } from '../../app/store';
import { makeLoopTestState } from '../../../tests/helpers/loopState';
import { createManualScheduler } from '../../../tests/helpers/manualFrameScheduler';
import { uiStore } from './uiStore';
const viewport = vi.hoisted(() => ({ blocked: false }));
vi.mock('@ui/viewport', () => ({ useViewportBlocked: () => viewport.blocked }));

function HotkeysHost({
  loop,
  onToggleDebugPanel,
  handlers,
}: {
  loop: ReturnType<typeof createGameLoopController>;
  onToggleDebugPanel?: () => void;
  handlers?: MainHotkeyHandlers;
}): ReactElement {
  useHotkeys(loop, onToggleDebugPanel, handlers);
  return (
    <div>
      <input data-testid="text-input" />
      <button data-testid="focus-button" type="button">
        Focus
      </button>
      <details>
        <summary data-testid="focus-summary">Layers</summary>
      </details>
      <a data-testid="focus-link" href="#layers">
        Layers
      </a>
    </div>
  );
}

let loop: ReturnType<typeof createGameLoopController>;

beforeEach(() => {
  viewport.blocked = false;
  uiStore.getState().actions.reset();
  uiStore.getState().actions.setScreen('main');
  resetGameStoreForTests(makeLoopTestState());
  store.getState().actions.setSpeed('x1');
  loop = createGameLoopController(createManualScheduler().scheduler);
});
afterEach(() => vi.restoreAllMocks());

describe('useHotkeys — 空白鍵／數字鍵（01 §6.3）', () => {
  it('blocked viewport cancels held camera frames and all global shortcuts without resuming on recovery', () => {
    const frames = new Map<number, FrameRequestCallback>();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(1, callback);
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
    const pan = vi.fn();
    const zoom = vi.fn();
    const view = render(<HotkeysHost loop={loop} handlers={{ pan, zoom }} />);
    fireEvent.keyDown(document.body, { key: 'w' });
    expect(frames.size).toBe(1);
    viewport.blocked = true;
    view.rerender(<HotkeysHost loop={loop} handlers={{ pan, zoom }} />);
    expect(frames.size).toBe(0);
    for (const key of ['w', '+', '1', '3', ' ', 'Escape', 'r', 'F5', 'Tab'])
      fireEvent.keyDown(document.body, { key });
    expect(pan).toHaveBeenCalledOnce();
    expect(zoom).not.toHaveBeenCalled();
    expect(uiStore.getState().modal).toBeNull();
    expect(uiStore.getState().panelStack).toHaveLength(0);
    expect(uiStore.getState().analysisMode).toBe('none');
    viewport.blocked = false;
    view.rerender(<HotkeysHost loop={loop} handlers={{ pan, zoom }} />);
    expect(frames.size).toBe(0);
    expect(pan).toHaveBeenCalledOnce();
  });
  it('allows background map controls with an open panel but preserves actual panel/control/modal focus locks', () => {
    const pan = vi.fn();
    const zoom = vi.fn();
    const view = render(<HotkeysHost loop={loop} handlers={{ pan, zoom }} />);
    uiStore.getState().actions.openPanel('reports');
    fireEvent.keyDown(document.body, { key: '1', altKey: true });
    expect(uiStore.getState().analysisMode).toBe('faction');
    fireEvent.keyDown(document.body, { key: '+' });
    fireEvent.keyDown(document.body, { key: 'w' });
    fireEvent.keyUp(document.body, { key: 'w' });
    expect(zoom).toHaveBeenCalledWith(1);
    expect(pan).toHaveBeenCalledWith(0, -1);
    const panel = render(<section tabIndex={0} data-testid="focused-panel" />);
    panel.getByTestId('focused-panel').focus();
    for (const key of ['Tab', '+', 'w']) fireEvent.keyDown(window, { key });
    fireEvent.keyDown(window, { key: '2', altKey: true });
    expect(uiStore.getState().analysisMode).toBe('faction');
    expect(zoom).toHaveBeenCalledOnce();
    expect(pan).toHaveBeenCalledOnce();
    view.getByTestId('focus-button').focus();
    fireEvent.keyDown(window, { key: '3', altKey: true });
    fireEvent.keyDown(window, { key: '+' });
    expect(uiStore.getState().analysisMode).toBe('faction');
    expect(zoom).toHaveBeenCalledOnce();
    (document.activeElement as HTMLElement).blur();
    uiStore.getState().actions.enqueueModal({ id: 'event', params: {}, pausesTime: true });
    fireEvent.keyDown(document.body, { key: '4', altKey: true });
    fireEvent.keyDown(document.body, { key: '+' });
    expect(uiStore.getState().analysisMode).toBe('faction');
    expect(zoom).toHaveBeenCalledOnce();
  });
  it('dispatches Home and M from a focused non-control panel region while native controls retain keys', () => {
    const focusHome = vi.fn();
    const toggleMiniMap = vi.fn();
    render(<HotkeysHost loop={loop} handlers={{ focusHome, toggleMiniMap }} />);
    uiStore.getState().actions.openPanel('officers');
    const panel = render(<section tabIndex={0} data-testid="focused-panel" />).getByTestId(
      'focused-panel',
    );
    panel.focus();
    fireEvent.keyDown(panel, { key: 'Home' });
    fireEvent.keyDown(panel, { key: 'm' });
    expect(focusHome).toHaveBeenCalledOnce();
    expect(toggleMiniMap).toHaveBeenCalledOnce();
    const button = document.querySelector<HTMLButtonElement>('[data-testid="focus-button"]')!;
    button.focus();
    for (const key of ['Home', 'm']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      button.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
    }
    expect(focusHome).toHaveBeenCalledOnce();
    expect(toggleMiniMap).toHaveBeenCalledOnce();
  });
  it('holds camera keys per frame and stops on keyup, focus, window blur, modal and unmount', () => {
    const frames = new Map<number, FrameRequestCallback>();
    let serial = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(++serial, callback);
      return serial;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
    const pan = vi.fn();
    const view = render(<HotkeysHost loop={loop} handlers={{ pan }} />);
    uiStore.getState().actions.openPanel('reports');
    const step = () => {
      const callbacks = [...frames.values()];
      frames.clear();
      for (const callback of callbacks) callback(16);
    };
    fireEvent.keyDown(document.body, { key: 'w' });
    step();
    expect(pan.mock.calls).toEqual([
      [0, -1],
      [0, -1],
    ]);
    fireEvent.keyUp(document.body, { key: 'w' });
    expect(frames.size).toBe(0);
    fireEvent.keyDown(document.body, { key: 'a' });
    view.getByTestId('focus-button').focus();
    expect(frames.size).toBe(0);
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(document.body, { key: 'd' });
    fireEvent.blur(window);
    expect(frames.size).toBe(0);
    fireEvent.keyDown(document.body, { key: 's' });
    uiStore.getState().actions.enqueueModal({ id: 'event', params: {}, pausesTime: true });
    const count = pan.mock.calls.length;
    step();
    expect(pan).toHaveBeenCalledTimes(count);
    expect(frames.size).toBe(0);
    uiStore.getState().actions.closeModal();
    fireEvent.keyDown(document.body, { key: 'w' });
    view.unmount();
    expect(frames.size).toBe(0);
  });
  it('dispatches real rail/camera callbacks, restores Esc priority and leaves core unchanged', () => {
    const handlers = {
      openDomestic: vi.fn(),
      openMarch: vi.fn(),
      focusHome: vi.fn(),
      toggleMiniMap: vi.fn(),
      pan: vi.fn(),
      zoom: vi.fn(),
    };
    const view = render(<HotkeysHost loop={loop} handlers={handlers} />);
    const game = structuredClone(store.getState().game);
    fireEvent.keyDown(document.body, { key: 'F1' });
    fireEvent.keyDown(document.body, { key: 'F2' });
    expect(handlers.openDomestic).toHaveBeenCalledOnce();
    expect(handlers.openMarch).toHaveBeenCalledOnce();
    for (const [key, panel] of [
      ['F3', 'diplomacy'],
      ['F4', 'officers'],
      ['F5', 'policy'],
      ['F6', 'corps'],
      ['F7', 'taimei'],
    ] as const) {
      fireEvent.keyDown(document.body, { key });
      expect(uiStore.getState().panelStack.at(-1)?.id).toBe(panel);
      const repeat = new KeyboardEvent('keydown', {
        key,
        repeat: true,
        bubbles: true,
        cancelable: true,
      });
      document.body.dispatchEvent(repeat);
      expect(repeat.defaultPrevented).toBe(true);
      expect(uiStore.getState().panelStack).toHaveLength(1);
      fireEvent.keyDown(document.body, { key: 'Escape' });
      expect(uiStore.getState().panelStack).toHaveLength(0);
    }
    for (const key of ['Home', 'm', '+', '-', 'ArrowRight'])
      fireEvent.keyDown(document.body, { key });
    fireEvent.keyUp(document.body, { key: 'ArrowRight' });
    expect(handlers.focusHome).toHaveBeenCalledOnce();
    expect(handlers.toggleMiniMap).toHaveBeenCalledOnce();
    expect(handlers.zoom.mock.calls).toEqual([[1], [-1]]);
    expect(handlers.pan).toHaveBeenCalledWith(1, 0);
    const input = view.getByTestId('text-input');
    input.focus();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(document.activeElement).toBe(document.body);
    expect(uiStore.getState().modal).toBeNull();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(uiStore.getState().modal?.id).toBe('systemMenu');
    uiStore.getState().actions.closeModal();
    uiStore.getState().actions.enqueueModal({ id: 'event', params: {}, pausesTime: true });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(uiStore.getState().modal?.id).toBe('event');
    expect(store.getState().game).toEqual(game);
  });
  it('opens reports with R on main without advancing ticks and respects input, repeat and dialog guards', () => {
    uiStore.getState().actions.setScreen('title');
    const view = render(<HotkeysHost loop={loop} />);
    const game = structuredClone(store.getState().game);
    fireEvent.keyDown(window, { key: 'r' });
    expect(uiStore.getState().panelStack).toHaveLength(0);
    uiStore.getState().actions.setScreen('main');
    fireEvent.keyDown(view.getByTestId('text-input'), { key: 'R' });
    fireEvent.keyDown(window, { key: 'R', repeat: true });
    expect(uiStore.getState().panelStack).toHaveLength(0);
    fireEvent.keyDown(window, { key: 'R' });
    expect(uiStore.getState().panelStack).toEqual([{ id: 'reports', params: {} }]);
    uiStore.getState().actions.closePanel();
    uiStore.getState().actions.enqueueModal({ id: 'event', params: {}, pausesTime: true });
    fireEvent.keyDown(window, { key: 'r' });
    expect(uiStore.getState().panelStack).toHaveLength(0);
    uiStore.getState().actions.closeModal();
    const dialog = render(<div data-ui-dialog="" role="dialog" />);
    fireEvent.keyDown(window, { key: 'r' });
    expect(uiStore.getState().panelStack).toHaveLength(0);
    dialog.unmount();
    expect(store.getState().game).toEqual(game);
  });
  it('opens the actual taimei panel with F7 only on main and respects focused input/modal guards', () => {
    uiStore.getState().actions.setScreen('title');
    const view = render(<HotkeysHost loop={loop} />);
    fireEvent.keyDown(window, { key: 'F7' });
    expect(uiStore.getState().panelStack).toHaveLength(0);
    uiStore.getState().actions.setScreen('main');
    fireEvent.keyDown(view.getByTestId('text-input'), { key: 'F7' });
    expect(uiStore.getState().panelStack).toHaveLength(0);
    fireEvent.keyDown(window, { key: 'F7' });
    expect(uiStore.getState().panelStack).toEqual([{ id: 'taimei', params: {} }]);
    uiStore.getState().actions.closePanel();
    uiStore.getState().actions.enqueueModal({ id: 'event', params: {}, pausesTime: true });
    fireEvent.keyDown(window, { key: 'F7' });
    expect(uiStore.getState().panelStack).toHaveLength(0);
  });
  it('blocks gameplay and map shortcuts while an app-owned dialog preserves native keys', () => {
    const onToggle = vi.fn();
    render(<HotkeysHost loop={loop} onToggleDebugPanel={onToggle} />);
    uiStore.getState().actions.setScreen('main');
    loop.requestPause('user');
    const dialog = render(
      <div data-ui-dialog="" role="dialog" tabIndex={-1}>
        <button type="button">Cancel</button>
      </div>,
    );
    expect(uiStore.getState().modal).toBeNull();
    const target = dialog.getByRole('dialog');
    for (const key of ['1', '2', '3', ' ', 'Spacebar', '`', 'Tab', 'Enter', 'Escape']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(store.getState().session.speed).toBe('paused');
      expect(uiStore.getState().analysisMode).toBe('none');
    }
    for (const key of ['1', '2', '3', '4', '5']) {
      const event = new KeyboardEvent('keydown', {
        key,
        altKey: true,
        bubbles: true,
        cancelable: true,
      });
      document.body.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(false);
      expect(uiStore.getState().analysisMode).toBe('none');
    }
    fireEvent.keyDown(document.body, { key: 'Tab' });
    expect(uiStore.getState().analysisMode).toBe('none');
    expect(onToggle).not.toHaveBeenCalled();
    dialog.unmount();
    fireEvent.keyDown(document.body, { key: '2' });
    expect(store.getState().session.speed).toBe('x2');
    fireEvent.keyDown(document.body, { key: '1', altKey: true });
    expect(uiStore.getState().analysisMode).toBe('faction');
  });
  it('cannot bypass forced or system dialog pauses with Space or speed shortcuts', () => {
    render(<HotkeysHost loop={loop} />);
    for (const id of ['proposalInbox', 'systemMenu'] as const) {
      uiStore.getState().actions.enqueueModal({ id, params: {}, pausesTime: true });
      for (const key of [' ', '1', '2', '3']) fireEvent.keyDown(document.body, { key });
      expect(store.getState().session.speed).toBe('paused');
      uiStore.getState().actions.closeModal();
      expect(store.getState().session.speed).toBe('x1');
    }
  });
  it('preserves native Space activation on focused summary, button and link controls', () => {
    const { getByTestId } = render(<HotkeysHost loop={loop} />);
    for (const testId of ['focus-summary', 'focus-button', 'focus-link']) {
      const target = getByTestId(testId);
      target.focus();
      const space = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
      target.dispatchEvent(space);
      expect(space.defaultPrevented).toBe(false);
      expect(store.getState().session.speed).toBe('x1');
    }
    fireEvent.keyDown(document.body, { key: ' ' });
    expect(store.getState().session.speed).toBe('paused');
  });
  it('map themes toggle on main only, preserve focus navigation and ignore input/modals', () => {
    uiStore.getState().actions.setScreen('title');
    const { getByTestId } = render(<HotkeysHost loop={loop} />);
    fireEvent.keyDown(document.body, { key: 'Tab' });
    expect(uiStore.getState().analysisMode).toBe('none');
    uiStore.getState().actions.setScreen('main');
    fireEvent.keyDown(document.body, { key: 'Tab' });
    expect(uiStore.getState().analysisMode).toBe('faction');
    const button = getByTestId('focus-button');
    button.focus();
    const nativeTab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    button.dispatchEvent(nativeTab);
    expect(nativeTab.defaultPrevented).toBe(false);
    expect(uiStore.getState().analysisMode).toBe('faction');
    fireEvent.keyDown(document.body, { key: '2', altKey: true });
    expect(uiStore.getState().analysisMode).toBe('supply');
    fireEvent.keyDown(getByTestId('text-input'), { key: '3', altKey: true });
    expect(uiStore.getState().analysisMode).toBe('supply');
    uiStore.getState().actions.enqueueModal({ id: 'confirm', params: {}, pausesTime: false });
    fireEvent.keyDown(document.body, { key: '4', altKey: true });
    expect(uiStore.getState().analysisMode).toBe('supply');
  });
  it("空白鍵：目前非暫停時呼叫 requestPause('user')", async () => {
    const user = userEvent.setup();
    render(<HotkeysHost loop={loop} />);
    await user.keyboard(' ');
    expect(store.getState().session.speed).toBe('paused');
    expect(store.getState().session.lastPauseReason).toBe('user');
  });

  it('空白鍵：目前暫停中時呼叫 resume()', async () => {
    loop.requestPause('user');
    const user = userEvent.setup();
    render(<HotkeysHost loop={loop} />);
    await user.keyboard(' ');
    expect(store.getState().session.speed).toBe('x1');
  });

  it('數字鍵 1／2／3 切換 x1／x2／x5', async () => {
    const user = userEvent.setup();
    render(<HotkeysHost loop={loop} />);
    await user.keyboard('2');
    expect(store.getState().session.speed).toBe('x2');
    await user.keyboard('3');
    expect(store.getState().session.speed).toBe('x5');
    await user.keyboard('1');
    expect(store.getState().session.speed).toBe('x1');
  });

  it('輸入框聚焦時快捷鍵停用（01 §6.3）', async () => {
    const user = userEvent.setup();
    const { getByTestId } = render(<HotkeysHost loop={loop} />);
    const input = getByTestId('text-input');
    input.focus();
    await user.keyboard(' ');
    expect(store.getState().session.speed).toBe('x1'); // 未被觸發暫停
  });

  it('反引號呼叫 onToggleDebugPanel（若有傳入）', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<HotkeysHost loop={loop} onToggleDebugPanel={onToggle} />);
    await user.keyboard('`');
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
