import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { store, resetGameStoreForTests, setGame } from '@app/store';
import { perfMonitor } from '@app/perfMonitor';
import { makeLoopTestState } from '../../../tests/helpers/loopState';
import { DebugPanel } from './DebugPanel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
describe('performance debug presentation', () => {
  it('does not show a previous session measurement before the refresh timer after replacement', () => {
    vi.useFakeTimers();
    resetGameStoreForTests(makeLoopTestState());
    perfMonitor.recordTick(12);
    store.getState().actions.setDebugPanelOpen(true);
    render(<DebugPanel />);
    expect(screen.getByTestId('perf-lastTickMs').textContent).toBe('12.00 ms');
    act(() => {
      setGame(makeLoopTestState());
    });
    expect(screen.getByTestId('perf-lastTickMs').textContent).toBe('尚未量測');
    expect(screen.getByTestId('perf-fps').textContent).toBe('尚未量測');
  });
  it('reports unavailable measurements and refreshes detached live values only while open', () => {
    vi.useFakeTimers();
    const game = makeLoopTestState();
    resetGameStoreForTests(game);
    const before = structuredClone(game);
    let measured = false;
    vi.spyOn(perfMonitor, 'hasTickSamples').mockImplementation(() => measured);
    const reader = vi.spyOn(perfMonitor, 'getSnapshot').mockImplementation((currentGame) => ({
      fps: measured ? 60 : 0,
      lastTickMs: 0,
      avgTickMs: 0,
      maxTickMs: 0,
      systemBreakdownMs: measured ? { economy: 1.25, ai: 0 } : {},
      entityCounts: {
        castles: currentGame ? Object.keys(currentGame.castles).length : 0,
        districts: 0,
        officers: 0,
        armies: 0,
      },
    }));
    const view = render(<DebugPanel />);
    expect(vi.getTimerCount()).toBe(0);
    act(() => store.getState().actions.setDebugPanelOpen(true));
    expect(screen.getByTestId('perf-fps').textContent).toBe('尚未量測');
    expect(screen.getByTestId('perf-lastTickMs').textContent).toBe('尚未量測');
    expect(screen.getByTestId('perf-systems').textContent).toBe('尚未量測');
    expect(vi.getTimerCount()).toBe(1);
    measured = true;
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(reader.mock.calls.at(-1)?.[0]).toBe(game);
    expect(screen.getByTestId('perf-fps').textContent).toBe('60.0');
    expect(screen.getByTestId('perf-lastTickMs').textContent).toBe('0.00 ms');
    expect(screen.getByTestId('perf-systems').textContent).toContain('economy1.25 ms');
    expect(screen.getByTestId('perf-systems').textContent).toContain('ai0.00 ms');
    expect(game).toEqual(before);
    act(() => store.getState().actions.setDebugPanelOpen(false));
    expect(vi.getTimerCount()).toBe(0);
    const reads = reader.mock.calls.length;
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(reader.mock.calls.length).toBe(reads);
    act(() => store.getState().actions.setDebugPanelOpen(true));
    expect(vi.getTimerCount()).toBe(1);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('uses fresh entity counts for same-object changes and tolerates no game', () => {
    vi.useFakeTimers();
    const game = makeLoopTestState();
    resetGameStoreForTests(game);
    store.getState().actions.setDebugPanelOpen(true);
    render(<DebugPanel />);
    expect(screen.getByTestId('perf-count-castles').textContent).toBe(
      String(Object.keys(game.castles).length),
    );
    game.castles = {};
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(screen.getByTestId('perf-count-castles').textContent).toBe('0');
    act(() => {
      resetGameStoreForTests(null);
      store.getState().actions.setDebugPanelOpen(true);
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    for (const kind of ['castles', 'districts', 'officers', 'armies'])
      expect(screen.getByTestId(`perf-count-${kind}`).textContent).toBe('0');
  });
});
