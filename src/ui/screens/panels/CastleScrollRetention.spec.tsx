import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bumpTickSeq, resetGameStoreForTests } from '@app/store';
import type { CastleId } from '@core/state/ids';
import { makeLoopTestState, TEST_CASTLE } from '../../../../tests/helpers/loopState';
import { CastlePanel } from './CastlePanel';
import { TabView } from '../../components/TabView/TabView';

beforeEach(() => resetGameStoreForTests(makeLoopTestState()));
afterEach(() => vi.restoreAllMocks());

function scroller() {
  const element = screen.getByTestId('castle-panel').querySelector<HTMLElement>(':scope > section');
  if (!element) throw new Error('Castle panel scroll owner missing');
  return element;
}

// jsdom has no layout. This models browser clamping when a shorter active pane
// reduces the shared section's scroll range; it is not native-browser evidence.
function modelScrollRange(element: HTMLElement) {
  let position = 0;
  const limits: Record<string, number> = { 概要: 500, 內政: 50, 軍事: 300, 輸送: 200 };
  const limit = () => limits[screen.getByRole('tab', { selected: true }).textContent ?? ''] ?? 0;
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => Math.min(position, limit()),
    set: (value: number) => {
      position = Math.max(0, Math.min(value, limit()));
    },
  });
}

describe('CastlePanel tab scroll ownership', () => {
  it('restores each tab offset after a simulated shorter-pane clamp', () => {
    render(<CastlePanel castleId={TEST_CASTLE} />);
    const section = scroller();
    modelScrollRange(section);
    section.scrollTop = 230;
    fireEvent.click(screen.getByRole('tab', { name: '內政' }));
    section.scrollTop = 40;
    fireEvent.click(screen.getByRole('tab', { name: '軍事' }));
    section.scrollTop = 180;
    fireEvent.click(screen.getByRole('tab', { name: '輸送' }));
    section.scrollTop = 90;
    for (const [name, offset] of [
      ['概要', 230],
      ['內政', 40],
      ['軍事', 180],
      ['輸送', 90],
    ] as const) {
      fireEvent.click(screen.getByRole('tab', { name }));
      expect(section.scrollTop).toBe(offset);
    }
  });

  it('clears offsets on same-ID game replacement and castle replacement', () => {
    const state = makeLoopTestState();
    const other = 'castle.scroll-other' as CastleId;
    state.castles[other] = { ...state.castles[TEST_CASTLE]!, id: other, name: '另一城' };
    resetGameStoreForTests(state);
    const view = render(<CastlePanel castleId={TEST_CASTLE} />);
    const section = scroller();
    section.scrollTop = 230;
    fireEvent.click(screen.getByRole('tab', { name: '內政' }));
    section.scrollTop = 40;
    act(() => resetGameStoreForTests(structuredClone(state)));
    expect(section.scrollTop).toBe(0);
    fireEvent.click(screen.getByRole('tab', { name: '內政' }));
    expect(section.scrollTop).toBe(0);
    section.scrollTop = 55;
    view.rerender(<CastlePanel castleId={other} />);
    expect(section.scrollTop).toBe(0);
    fireEvent.click(screen.getByRole('tab', { name: '內政' }));
    expect(section.scrollTop).toBe(0);
  });

  it('does not reset a live offset on same-game tick publication or active-tab selection', () => {
    const state = makeLoopTestState();
    resetGameStoreForTests(state);
    const before = structuredClone(state);
    render(<CastlePanel castleId={TEST_CASTLE} />);
    const section = scroller();
    section.scrollTop = 230;
    act(() => bumpTickSeq());
    expect(section.scrollTop).toBe(230);
    fireEvent.click(screen.getByRole('tab', { name: '概要' }));
    expect(section.scrollTop).toBe(230);
    const overview = screen.getByRole('tab', { name: '概要' });
    overview.focus();
    fireEvent.keyDown(overview, { key: 'ArrowRight' });
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: '內政' }));
    expect(section.scrollTop).toBe(0);
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(overview);
    expect(section.scrollTop).toBe(230);
    expect(state).toEqual(before);
  });

  it('opts out of native keyboard focus scrolling while restoring deep pane offsets', () => {
    const state = makeLoopTestState();
    resetGameStoreForTests(state);
    const before = structuredClone(state);
    render(<CastlePanel castleId={TEST_CASTLE} />);
    const section = scroller();
    modelScrollRange(section);
    expect(screen.getByRole('tablist').className).toMatch(/sticky/);
    const nativeFocus: (this: HTMLButtonElement, options?: FocusOptions) => void = Reflect.get(
      HTMLButtonElement.prototype,
      'focus',
    );
    // jsdom does not auto-scroll focused controls. Model that behavior only for
    // tabs, while retaining real focus ownership; this is not browser evidence.
    const focus = vi.spyOn(HTMLButtonElement.prototype, 'focus').mockImplementation(function (
      this: HTMLButtonElement,
      options?: FocusOptions,
    ) {
      nativeFocus.call(this, options);
      if (this.getAttribute('role') === 'tab' && !options?.preventScroll) section.scrollTop = 0;
    });
    const overview = screen.getByRole('tab', { name: '概要' });
    overview.focus({ preventScroll: true });
    section.scrollTop = 230;
    fireEvent.keyDown(overview, { key: 'ArrowRight' });
    section.scrollTop = 40;
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    section.scrollTop = 180;
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    section.scrollTop = 90;
    for (const [key, name, offset] of [
      ['Home', '概要', 230],
      ['ArrowLeft', '輸送', 90],
      ['ArrowLeft', '軍事', 180],
      ['ArrowLeft', '內政', 40],
      ['Home', '概要', 230],
    ] as const) {
      fireEvent.keyDown(document.activeElement!, { key });
      expect(document.activeElement).toBe(screen.getByRole('tab', { name }));
      expect(section.scrollTop).toBe(offset);
      expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
    }
    act(() => bumpTickSeq());
    expect(section.scrollTop).toBe(230);
    expect(state).toEqual(before);
  });
});

it.each([false, true])(
  'keeps sticky=%s focus opt-in and skips disabled keyboard tabs',
  (sticky) => {
    const onChange = vi.fn();
    render(
      <TabView
        tabs={[
          { id: 'first', label: '甲' },
          { id: 'disabled', label: '乙', disabled: true },
          { id: 'last', label: '丙' },
        ]}
        activeId="first"
        onChange={onChange}
        sticky={sticky}
      >
        <TabView.Pane id="first">甲</TabView.Pane>
        <TabView.Pane id="last">丙</TabView.Pane>
      </TabView>,
    );
    const focus = vi.spyOn(HTMLButtonElement.prototype, 'focus');
    screen.getByRole('tab', { name: '甲' }).focus();
    for (const [key, name, id] of [
      ['ArrowRight', '丙', 'last'],
      ['ArrowRight', '甲', 'first'],
      ['End', '丙', 'last'],
      ['Home', '甲', 'first'],
    ] as const) {
      fireEvent.keyDown(document.activeElement!, { key });
      expect(document.activeElement).toBe(screen.getByRole('tab', { name }));
      expect(onChange).toHaveBeenLastCalledWith(id);
      if (sticky) expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
      else expect(focus).toHaveBeenLastCalledWith();
    }
  },
);
