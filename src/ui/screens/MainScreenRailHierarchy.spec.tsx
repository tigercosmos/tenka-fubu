import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
// Component renderer fixtures use the actual committed WASM with an independent owner.
vi.mock('@ui/map/wasmGeographicScorer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ui/map/wasmGeographicScorer')>();
  const { realRenderWasmExports } = await import('../../../tests/helpers/realRenderWasm');
  return {
    ...actual,
    createWasmGeographicScorer: (exports?: Record<string, unknown>) =>
      actual.createWasmGeographicScorer(exports ?? realRenderWasmExports()),
  };
});

vi.mock('pixi.js', async () => {
  const { createPixiMockClasses } = await import('../../../tests/helpers/pixiMock');
  return createPixiMockClasses([]);
});
import { MainScreen } from './MainScreen';
import { uiStore } from '../hooks/uiStore';
import { resetBridgeForTests } from '@app/bridge';
import { resetGameStoreForTests, store } from '@app/store';
import { buildTinyState } from '../../../tests/fixtures/tiny';
import { validateState } from '@core/state/invariants';
import { ConfirmDialog } from '../components';

beforeEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(buildTinyState());
  store.getState().actions.setScreen('main');
  uiStore.getState().actions.reset();
  uiStore.getState().actions.setScreen('main');
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('strategy command rail presentation (DOM/source contracts, not native geometry)', () => {
  it.each(['title', 'viewport', 'fatal', 'modal', 'native'] as const)(
    'keeps the visible realm entry blocked by the current %s owner',
    (blocker) => {
      render(<MainScreen />);
      if (blocker === 'native')
        render(
          <ConfirmDialog
            open
            title="Other owner"
            message="Other owner"
            onConfirm={() => {}}
            onCancel={() => {}}
          />,
        );
      else
        act(() => {
          if (blocker === 'title') store.getState().actions.setScreen('title');
          if (blocker === 'viewport') store.getState().actions.setViewportBlocked(true);
          if (blocker === 'fatal')
            store
              .getState()
              .actions.setFatalError({ code: 'diagnostic', message: 'blocked', stack: '' });
          if (blocker === 'modal')
            uiStore
              .getState()
              .actions.enqueueModal({ id: 'systemMenu', params: {}, pausesTime: false });
        });
      const originalModal = uiStore.getState().modal;
      const originalQueue = uiStore.getState().modalQueue;
      const game = store.getState().game!;
      const before = structuredClone(game);
      fireEvent.click(screen.getByTestId('rail-realm'));
      expect(uiStore.getState().modal).toBe(originalModal);
      expect(uiStore.getState().modalQueue).toBe(originalQueue);
      expect(screen.queryByRole('dialog', { name: '地圖一覽' })).toBeNull();
      expect(game).toEqual(before);
      expect(store.getState().session.pendingCommandCount).toBe(0);
      expect(validateState(game)).toEqual([]);
    },
  );

  it('renders an explicit two-line realm label without changing its accessible name or navigation', () => {
    const game = store.getState().game!;
    const before = structuredClone(game);
    render(<MainScreen />);
    const button = screen.getByTestId('rail-realm');
    expect(button.getAttribute('aria-label')).toBe('地圖一覽');
    const label = button.querySelector('[data-testid="rail-realm-label"]');
    expect(label?.getAttribute('aria-hidden')).toBe('true');
    expect(Array.from(label?.children ?? []).map((line) => line.textContent)).toEqual([
      '地圖',
      '一覽',
    ]);
    fireEvent.click(button);
    expect(screen.getByRole('dialog', { name: '地圖一覽' })).toBeTruthy();
    expect(game).toEqual(before);
    expect(store.getState().session.pendingCommandCount).toBe(0);
    expect(validateState(game)).toEqual([]);
  });

  it('separates three command groups without adding focus stops or reordering existing buttons', () => {
    render(<MainScreen />);
    const rail = screen.getByRole('navigation', { name: '內政' });
    expect(
      within(rail)
        .getAllByRole('button')
        .map((button) => button.dataset.testid),
    ).toEqual([
      'rail-realm',
      'rail-home',
      'rail-military',
      'rail-domestic',
      'rail-officers',
      'rail-diplomacy',
      'rail-plot',
      'rail-policy',
      'rail-corps',
      'rail-taimei',
    ]);
    const separators = rail.querySelectorAll('[data-rail-group]');
    expect(
      Array.from(separators).map((separator) => separator.getAttribute('data-rail-group')),
    ).toEqual(['management', 'relations', 'strategy']);
    for (const separator of separators) {
      expect(separator.getAttribute('aria-hidden')).toBe('true');
      expect(separator.hasAttribute('tabindex')).toBe(false);
    }
    expect(
      Array.from(separators).map(
        (separator) => (separator.nextElementSibling as HTMLElement)?.dataset.testid,
      ),
    ).toEqual(['rail-military', 'rail-diplomacy', 'rail-policy']);
  });

  it('keeps the rail width, overflow and physical font/hit floors across supported scales', () => {
    const css = readFileSync('src/ui/screens/MainScreen.module.css', 'utf8');
    expect(css).toMatch(/\.rail\s*\{[^}]*width:\s*4rem;/);
    expect(css).toMatch(/\.rail\s*\{[^}]*overflow-y:\s*auto;/);
    expect(css).toMatch(/\.rail > button\s*\{[^}]*min-width:\s*32px;[^}]*min-height:\s*32px;/);
    expect(css).toMatch(/\.realmLabel\s*\{[^}]*font-size:\s*max\(12px, var\(--font-size-xs\)\);/);
    expect(css).toMatch(/\.rail > button\.realmEntry::after\s*\{[^}]*content:\s*none;/);
    for (const scale of [0.8, 1, 1.5]) {
      const font = Math.max(12, 12 * scale);
      const buttonInnerWidth = 56 * scale - 2;
      expect(2 * font).toBeLessThanOrEqual(buttonInnerWidth);
      expect(Math.max(32, 32 * scale)).toBeGreaterThanOrEqual(32);
    }
  });

  it('names the three visual command sections without replacing button labels or adding focus stops', () => {
    const game = store.getState().game!;
    const before = structuredClone(game);
    render(<MainScreen />);
    const rail = screen.getByRole('navigation', { name: '內政' });
    const groups = Array.from(rail.querySelectorAll('[data-rail-group]'));
    expect(groups.map((group) => group.textContent)).toEqual(['軍政', '交涉', '國策']);
    for (const group of groups) {
      expect(group.getAttribute('aria-hidden')).toBe('true');
      expect(group.querySelector('button, a, input, [tabindex]')).toBeNull();
    }
    for (const [id, label] of [
      ['rail-military', '軍事'],
      ['rail-domestic', '內政'],
      ['rail-officers', '武將'],
      ['rail-diplomacy', '外交'],
      ['rail-plot', '調略'],
      ['rail-policy', '政策'],
      ['rail-corps', '軍團'],
      ['rail-taimei', '大命'],
    ] as const)
      expect(screen.getByTestId(id).getAttribute('aria-label')).toBe(label);
    expect(game).toEqual(before);
    expect(store.getState().session.pendingCommandCount).toBe(0);
  });

  it('bounds section captions while leaving the entire rail scrollable at large UI scale', () => {
    const css = readFileSync('src/ui/screens/MainScreen.module.css', 'utf8');
    expect(css).toMatch(/\.railSeparator\s*\{[^}]*display:\s*flex;/);
    expect(css).toMatch(/\.railSeparator\s*\{[^}]*min-height:\s*max\(16px, 1rem\);/);
    expect(css).toMatch(
      /\.railGroupLabel\s*\{[^}]*font-size:\s*max\(12px, var\(--font-size-xs\)\);/,
    );
    expect(css).toMatch(/\.railGroupLabel\s*\{[^}]*white-space:\s*nowrap;/);
    for (const scale of [0.8, 1, 1.5]) {
      // Source budget only; root's native run must verify actual glyph and scroll geometry.
      const innerWidth = 4 * 16 * scale - 2 * 0.25 * 16 * scale - 2;
      const captionWidth = 2 * Math.max(12, 12 * scale);
      expect(captionWidth + 8).toBeLessThanOrEqual(innerWidth);
    }
  });
});
