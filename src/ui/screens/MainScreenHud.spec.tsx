import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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
import { initializeBridgeSession, resetBridgeForTests, getQueuedPlayerCommands } from '@app/bridge';
import { resetGameStoreForTests, store } from '@app/store';
import { uiStore } from '../hooks/uiStore';
import { buildTinyState, CASTLE_A1 } from '../../../tests/fixtures/tiny';
import { validateState } from '@core/state/invariants';

beforeEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests();
  uiStore.getState().actions.reset();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});
afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests();
  uiStore.getState().actions.reset();
  document.documentElement.style.fontSize = '';
  vi.restoreAllMocks();
});
it('reserves the actual minimap footprint for reports and releases it on the M shortcut', () => {
  const game = buildTinyState();
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  uiStore.getState().actions.setScreen('main');
  const before = structuredClone(game);
  render(<MainScreen autosaveSuspended />);
  const reports = screen.getByTestId('reports-open').closest('section')!;
  const initialInset = reports.style.bottom;
  expect(initialInset).toContain('calc(');
  expect(initialInset).toContain('var(--space-3)');
  act(() => uiStore.getState().actions.setSelection({ kind: 'castle', id: CASTLE_A1 }));
  const selectedInset = reports.style.bottom;
  expect(selectedInset).not.toBe(initialInset);
  fireEvent.keyDown(document.body, { key: 'm' });
  expect(screen.queryByTestId('minimap')).toBeNull();
  expect(reports.style.bottom).not.toContain('calc(');
  expect(reports.style.bottom).toMatch(/rem$/);
  act(() => uiStore.getState().actions.setSelection(null));
  expect(reports.style.bottom).toBe('var(--space-3)');
  fireEvent.keyDown(document.body, { key: 'm' });
  expect(reports.style.bottom).toBe(initialInset);
  expect(game).toEqual(before);
});
it.each([0.8, 1.5])(
  'DOM structure at scale %s keeps time/system ports outside resource scrolling without changing camera or core state (not native geometry)',
  (scale) => {
    const game = buildTinyState();
    resetGameStoreForTests(game);
    initializeBridgeSession(game);
    store.getState().actions.setScreen('main');
    store.getState().actions.setPendingCommandCount(Number.MAX_SAFE_INTEGER);
    document.documentElement.style.fontSize = `${16 * scale}px`;
    const before = structuredClone(game);
    render(<MainScreen autosaveSuspended />);
    const resources = screen.getByTestId('hud-resources'),
      commands = screen.getByTestId('hud-commands');
    expect(resources.parentElement).toBe(commands.parentElement);
    for (const id of ['speed-pause', 'speed-1', 'speed-2', 'speed-5']) {
      expect(within(commands).getByTestId(id).getAttribute('type')).toBe('button');
      expect(within(resources).queryByTestId(id)).toBeNull();
    }
    expect(within(commands).getByRole('button', { name: '系統選單' })).toBeTruthy();
    expect(within(commands).getByTestId('hud-autosave-suspended')).toBeTruthy();
    const pending = within(commands).getByRole('status');
    expect(pending.textContent).toBe('9,007,199,254,740,991項命令待下一日執行');
    expect(pending.getAttribute('aria-label')).toBe(pending.textContent);
    expect(pending.getAttribute('title')).toBe(pending.textContent);
    expect(resources.tabIndex).toBe(0);
    expect(resources.getAttribute('aria-label')).toBe('金錢、兵糧、兵力、威信');
    expect(resources.querySelector('time')).not.toBeNull();
    for (const label of ['金錢', '兵糧', '兵力', '威信'])
      expect(within(resources).getByText(label)).toBeTruthy();
    const canvas = screen.getByTestId('map-canvas-host');
    const initialCamera = uiStore.getState().mapCamera;
    resources.scrollLeft = 250;
    fireEvent.scroll(resources);
    resources.focus();
    // Explicit DOM propagation proof; the mocked canvas cannot prove renderer panning.
    const windowKey = vi.fn();
    window.addEventListener('keydown', windowKey);
    try {
      for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End'])
        fireEvent.keyDown(resources, { key });
      expect(windowKey).not.toHaveBeenCalled();
      fireEvent.keyDown(resources, { key: 'Tab' });
      expect(windowKey).toHaveBeenCalledTimes(1);
      fireEvent.keyDown(commands, { key: 'ArrowRight' });
      expect(windowKey).toHaveBeenCalledTimes(2);
    } finally {
      window.removeEventListener('keydown', windowKey);
    }
    expect(screen.getByTestId('map-canvas-host')).toBe(canvas);
    expect(uiStore.getState().mapCamera).toBe(initialCamera);
    fireEvent.click(within(commands).getByRole('button', { name: '系統選單' }));
    expect(uiStore.getState().modal?.id).toBe('systemMenu');
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    expect(validateState(game)).toEqual([]);
  },
);
