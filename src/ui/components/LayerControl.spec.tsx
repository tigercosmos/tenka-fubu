import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { LayerControl } from './LayerControl';
import { uiStore } from '../hooks/uiStore';
import { store } from '@app/store';

beforeEach(() => uiStore.getState().actions.reset());

describe('LayerControl', () => {
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
