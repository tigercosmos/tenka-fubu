import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { resetGameStoreForTests, store } from '@app/store';
import { resetBridgeForTests } from '@app/bridge';
import { makeLoopTestState, TEST_CASTLE } from '../../../../tests/helpers/loopState';
import { uiStore } from '../../hooks/uiStore';
import { TOKENS } from '../../styles/tokens';
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
it('floors the local castle tab labels without changing normal and large sizes', () => {
  const css = readFileSync('src/ui/screens/panels/CastlePanel.module.css', 'utf8');
  expect(css).toMatch(
    /\.anchor \[role='tab'\]\s*\{[^}]*font-size:\s*max\(12px, var\(--font-size-sm\)\)/,
  );
  const originalSmallSize = parseFloat(TOKENS.font.sizeSm);
  expect(originalSmallSize).toBe(14);
  expect([0.8, 1, 1.5].map((scale) => Math.max(12, originalSmallSize * scale))).toEqual([
    12, 14, 21,
  ]);
  expect(css.indexOf(".anchor [role='tab']")).toBeLessThan(
    css.indexOf(".transportActive [role='tabpanel']:not([hidden]),"),
  );
});
it('floors only the visible military pane while retaining the original heading size', () => {
  const css = readFileSync('src/ui/screens/panels/CastlePanel.module.css', 'utf8');
  expect(css).toMatch(
    /\.militaryActive \[role='tabpanel'\]:not\(\[hidden\]\)\s*\{[^}]*font-size:\s*max\(12px, var\(--font-size-sm\)\)/,
  );
  expect(css).toMatch(/\.page h3\s*\{[^}]*font-size:\s*var\(--font-size-md\)/);
});
it('binds the font-only presentation to the actual military selection and releases it', () => {
  render(<CastlePanel castleId={TEST_CASTLE} />);
  const panel = screen.getByTestId('castle-panel');
  const militaryClass = styles.militaryActive;
  if (typeof militaryClass !== 'string') throw new Error('Missing military presentation class');
  expect(panel.classList.contains(militaryClass)).toBe(false);
  fireEvent.click(screen.getByRole('tab', { name: '軍事' }));
  expect(panel.classList.contains(militaryClass)).toBe(true);
  expect(screen.getByRole('tab', { name: '軍事' }).getAttribute('aria-selected')).toBe('true');
  fireEvent.click(screen.getByRole('tab', { name: '輸送' }));
  expect(panel.classList.contains(militaryClass)).toBe(false);
  expect(panel.classList.contains(styles.transportActive!)).toBe(true);
});
it('preserves military facts, untouched officer selection, empty transit and callbacks', () => {
  const onCommand = vi.fn(),
    onOpenMarch = vi.fn(),
    onSelectArmy = vi.fn();
  const before = structuredClone(store.getState().game);
  render(
    <CastlePanel
      castleId={TEST_CASTLE}
      initialTab="military"
      onCommand={onCommand}
      onOpenMarch={onOpenMarch}
      onSelectArmy={onSelectArmy}
    />,
  );
  const pane = screen.getByRole('tabpanel', { name: '軍事' });
  expect(within(pane).getAllByRole('progressbar')).toHaveLength(2);
  expect(pane.textContent).toContain('當主 統50 武50');
  expect(pane.textContent).toContain('在途我方部隊（0）');
  expect(within(pane).getByRole<HTMLInputElement>('checkbox').checked).toBe(false);
  expect(store.getState().game).toEqual(before);
  expect(onCommand).not.toHaveBeenCalled();
  expect(onOpenMarch).not.toHaveBeenCalled();
  expect(onSelectArmy).not.toHaveBeenCalled();
});
