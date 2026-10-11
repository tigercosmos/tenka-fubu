import { readFileSync } from 'node:fs';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { initializeBridgeSession, getQueuedPlayerCommands, resetBridgeForTests } from '@app/bridge';
import { resetGameStoreForTests } from '@app/store';
import { buildTinyState, CASTLE_A1 } from '../../../../tests/fixtures/tiny';
import { uiStore } from '../../hooks/uiStore';
import { CastlePanel } from './CastlePanel';
import { TOKENS } from '../../styles/tokens';
const castleCss = () => readFileSync('src/ui/screens/panels/CastlePanel.module.css', 'utf8');
const riceCss = () => readFileSync('src/ui/screens/panels/RiceTradePane.module.css', 'utf8');
beforeEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests();
  uiStore.getState().actions.reset();
});
afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests();
  uiStore.getState().actions.reset();
});
function mount() {
  const game = buildTinyState();
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  render(<CastlePanel castleId={CASTLE_A1} initialTab="domestic" />);
  return { game, pane: screen.getByRole('tabpanel', { name: '內政' }) };
}
it('binds the real domestic and conscription body plus shared castle tabs to physical twelve-pixel floors', () => {
  const { game, pane } = mount(),
    before = structuredClone(game);
  expect(pane.querySelector('[class*="domesticPage"]')).not.toBeNull();
  expect(screen.getByRole('tab', { name: '內政' }).closest('[class*="anchor"]')).not.toBeNull();
  for (const name of ['低', '中', '高'])
    expect(within(pane).getByRole('radio', { name })).toBeTruthy();
  expect(castleCss()).toMatch(
    /\.anchor\s+\[role=['"]tab['"]\]\s*\{[^}]*font-size:\s*max\(12px,\s*var\(--font-size-sm\)\)/,
  );
  expect(castleCss()).toMatch(
    /\.domesticPage\s*\{[^}]*font-size:\s*max\(12px,\s*var\(--font-size-sm\)\)/,
  );
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});
it('binds actual rice facts and disabled decisions to local legible opaque paper without enabling trade', () => {
  const { game, pane } = mount(),
    before = structuredClone(game);
  const buy = within(pane).getByRole('button', { name: '購入兵糧' }),
    sell = within(pane).getByRole('button', { name: '出售兵糧' });
  expect((buy as HTMLButtonElement).disabled).toBe(true);
  expect((sell as HTMLButtonElement).disabled).toBe(true);
  expect(buy.closest('[class*="root"]')).not.toBeNull();
  expect(riceCss()).toMatch(/\.root\s*\{[^}]*font-size:\s*max\(12px,\s*var\(--font-size-sm\)\)/);
  const disabled = /\.actions\s+button:disabled\s*\{([^}]*)\}/.exec(riceCss())?.[1] ?? '';
  for (const declaration of [
    'opacity: 1',
    'color: var(--text-secondary)',
    'background: var(--surface-panel)',
    'border-color: var(--stroke-subtle)',
  ])
    expect(disabled).toContain(declaration);
  expect(within(pane).getByText('需已落成且效果啟用的米問屋。')).toBeTruthy();
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});
it('keeps initial policy, rice amount, facility geometry and inherited larger type contracts', () => {
  const { game, pane } = mount(),
    before = structuredClone(game);
  expect(within(pane).getByRole<HTMLInputElement>('radio', { name: '中' }).checked).toBe(true);
  expect(within(pane).getByRole<HTMLInputElement>('spinbutton').value).toBe('1');
  expect(castleCss()).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
  expect(castleCss()).toContain('min-height: max(48px, 3rem)');
  expect(castleCss()).toContain('max-height: calc(100dvh - 4.5rem)');
  expect(riceCss()).toContain('min-height: max(32px, 2rem)');
  expect(TOKENS.font.sizeSm).toBe('14px');
  const sharedTabs = castleCss().indexOf(".anchor [role='tab']");
  const originalTransport = castleCss().indexOf(
    ".transportActive [role='tabpanel']:not([hidden]),",
  );
  expect(sharedTabs).toBeLessThan(originalTransport);
  expect(castleCss()).toContain(
    ".transportActive [role='tabpanel']:not([hidden]),\n.transportActive [role='tab'] {\n  font-size: max(12px, var(--font-size-md));\n}",
  );
  expect(Math.max(12, 14 * 0.8)).toBe(12);
  expect(Math.max(12, 14)).toBe(14);
  expect(Math.max(12, 14 * 1.5)).toBe(21);
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});
