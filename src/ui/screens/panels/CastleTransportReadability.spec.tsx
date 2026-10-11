import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { resetGameStoreForTests, store } from '@app/store';
import { resetBridgeForTests } from '@app/bridge';
import { makeLoopTestState, TEST_CASTLE } from '../../../../tests/helpers/loopState';
import { uiStore } from '../../hooks/uiStore';
import { UI_THEME } from '../../styles/tokens';
import { CastlePanel } from './CastlePanel';
import styles from './CastlePanel.module.css';

beforeEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(makeLoopTestState({ food: 6500 }));
  store.getState().actions.setScreen('main');
  uiStore.getState().actions.reset();
});
afterEach(() => {
  cleanup();
  uiStore.getState().actions.reset();
});
it('floors only active transport content and local tab labels at twelve CSS pixels', () => {
  const css = readFileSync('src/ui/screens/panels/CastlePanel.module.css', 'utf8');
  expect(css).toMatch(
    /\.transportActive \[role='tabpanel'\]:not\(\[hidden\]\),\s*\.transportActive \[role='tab'\]\s*\{[^}]*font-size:\s*max\(12px, var\(--font-size-md\)\)/,
  );
});
it('gives only disabled transport primary actions opaque readable paint', () => {
  const css = readFileSync('src/ui/screens/panels/CastlePanel.module.css', 'utf8');
  expect(css).toMatch(
    /\.transportActive \[role='tabpanel'\]:not\(\[hidden\]\) \.primary:disabled\s*\{[^}]*opacity:\s*1;[^}]*color:\s*var\(--text-secondary\);[^}]*background:\s*var\(--surface-raised\);[^}]*border-color:\s*var\(--stroke-subtle\)/,
  );
  const luminance = (hex: string) =>
    [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
      .reduce((s, x, i) => s + x * [0.2126, 0.7152, 0.0722][i]!, 0);
  const a = luminance(UI_THEME['--text-secondary']),
    b = luminance(UI_THEME['--surface-raised']);
  expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(4.5);
});
it('binds presentation to actual selected transport tab and releases it on overview', () => {
  render(<CastlePanel castleId={TEST_CASTLE} />);
  const panel = screen.getByTestId('castle-panel');
  const transportClass = styles.transportActive;
  if (typeof transportClass !== 'string') throw new Error('Missing transport presentation class');
  expect(panel.classList.contains(transportClass)).toBe(false);
  fireEvent.click(screen.getByRole('tab', { name: '輸送' }));
  expect(panel.classList.contains(transportClass)).toBe(true);
  expect(screen.getByRole('tab', { name: '輸送' }).getAttribute('aria-selected')).toBe('true');
  fireEvent.click(screen.getByRole('tab', { name: '概要' }));
  expect(panel.classList.contains(transportClass)).toBe(false);
});
it('keeps zero cargo, invalid-destination rejection, empty orders and disabled callback guard', () => {
  const onCommand = vi.fn(),
    game = store.getState().game!,
    before = structuredClone(game);
  render(<CastlePanel castleId={TEST_CASTLE} initialTab="transport" onCommand={onCommand} />);
  const pane = screen.getByRole('tabpanel', { name: '輸送' });
  expect(within(pane).getAllByRole('slider')).toHaveLength(3);
  expect(within(pane).getAllByRole('spinbutton')).toHaveLength(3);
  for (const input of pane.querySelectorAll<HTMLInputElement>('input'))
    expect(input.value).toBe('0');
  expect(screen.getByTestId<HTMLSelectElement>('transport-destination').value).toBe('');
  expect(screen.getByTestId('transport-execute')).toHaveProperty('disabled', true);
  expect(screen.getByTestId('transport-execute').title).toBe('目標不屬於我方勢力');
  expect(pane.textContent).toContain('目前沒有從本城出發的輸送隊。');
  fireEvent.click(screen.getByTestId('transport-execute'));
  expect(onCommand).not.toHaveBeenCalled();
  expect(game).toEqual(before);
});
