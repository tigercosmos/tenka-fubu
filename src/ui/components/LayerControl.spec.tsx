import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { LayerControl } from './LayerControl';
import { uiStore } from '../hooks/uiStore';
import { store } from '@app/store';
import { readFileSync } from 'node:fs';

beforeEach(() => uiStore.getState().actions.reset());

describe('LayerControl', () => {
  it('uses a compact closed entry but retains full controls and active legends', () => {
    render(<LayerControl />);
    const root = screen.getByTestId('layer-control');
    const details = root.querySelector('details')!;
    expect(root.getAttribute('data-compact')).toBe('true');
    expect(details.open).toBe(false);
    act(() => {
      details.open = true;
      fireEvent(details, new Event('toggle'));
    });
    expect(root.getAttribute('data-compact')).toBe('false');
    expect(screen.getAllByRole('radio')).toHaveLength(6);
    fireEvent.click(screen.getByRole('radio', { name: /補給/ }));
    act(() => {
      details.open = false;
      fireEvent(details, new Event('toggle'));
    });
    expect(root.getAttribute('data-compact')).toBe('false');
    expect(screen.getByTestId('analysis-legend').textContent).toContain('補給');
    act(() => uiStore.getState().actions.setAnalysisMode('none'));
    expect(root.getAttribute('data-compact')).toBe('true');
    expect(screen.queryByTestId('analysis-legend')).toBeNull();
  });
  it('keeps compact and full CSS footprints readable and bounded', () => {
    const css = readFileSync('src/ui/components/LayerControl.module.css', 'utf8');
    const compact = css.match(/\.root\[data-compact='true'\]\s*\{([^}]+)\}/)![1]!;
    expect(compact).toContain('width: fit-content');
    expect(compact).toContain('background: var(--surface-command)');
    expect(compact).toContain('color: var(--text-inverse)');
    expect(css).toContain('width: 15rem');
    expect(css).toContain('min-height: max(32px, 2rem)');
    expect(css).toContain('font-size: max(12px, var(--font-size-sm))');
    expect(css).toContain('font-size: max(12px, var(--font-size-xs))');
    expect(css).toContain('overflow-y: auto');
    expect(css).toContain('max-height: calc(100dvh - 4rem - 12px)');
  });
  it('selects exactly one theme and immediately synchronizes its legend without simulation writes', () => {
    const game = store.getState().game;
    render(<LayerControl />);
    fireEvent.click(screen.getByRole('radio', { name: /補給/ }));
    expect(screen.getByTestId('analysis-legend').textContent).toContain('補給');
    fireEvent.click(screen.getByRole('radio', { name: /城池防禦/ }));
    expect(screen.getByRole<HTMLInputElement>('radio', { name: /補給/ }).checked).toBe(false);
    expect(screen.getByTestId('analysis-legend').textContent).toContain('城池防禦');
    expect(store.getState().game).toBe(game);
    fireEvent.click(screen.getByRole('radio', { name: '一般地圖' }));
    expect(screen.queryByTestId('analysis-legend')).toBeNull();
  });

  it('changes opacity independently and clamps invalid values at the store boundary', () => {
    render(<LayerControl />);
    fireEvent.click(screen.getByRole('radio', { name: /補給/ }));
    fireEvent.change(screen.getByRole('slider'), { target: { value: '80' } });
    expect(uiStore.getState().analysisOpacity).toBe(0.8);
    expect(uiStore.getState().analysisMode).toBe('supply');
    act(() => uiStore.getState().actions.setAnalysisOpacity(2));
    expect(uiStore.getState().analysisOpacity).toBe(1);
    act(() => uiStore.getState().actions.setAnalysisOpacity(Number.NaN));
    expect(uiStore.getState().analysisOpacity).toBe(1);
  });
});
