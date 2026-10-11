import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { resetGameStoreForTests, store } from '@app/store';
import { getQueuedPlayerCommands, resetBridgeForTests } from '@app/bridge';
import { makeLoopTestState } from '../../../tests/helpers/loopState';
import { uiStore } from '../hooks/uiStore';
import { UI_THEME } from '../styles/tokens';
import { RewardRoster } from './RewardRoster';
beforeEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(makeLoopTestState());
  store.getState().actions.setScreen('main');
  uiStore.getState().actions.reset();
});
afterEach(() => {
  cleanup();
  resetBridgeForTests();
  uiStore.getState().actions.reset();
});
it('gives real roster and fief text a physical floor without changing table geometry', () => {
  const roster = readFileSync('src/ui/screens/RewardRoster.module.css', 'utf8'),
    pane = readFileSync('src/ui/screens/RewardFiefPane.module.css', 'utf8');
  expect(roster).toMatch(/\.roster\s*\{[^}]*font-size:\s*max\(12px, var\(--font-size-sm\)\)/);
  expect(roster).toMatch(
    /\.roster button\s*\{[^}]*font-size:\s*max\(12px, var\(--font-size-sm\)\)/,
  );
  expect(pane).toMatch(/\.pane\s*\{[^}]*font-size:\s*max\(12px, var\(--font-size-sm\)\)/);
  expect(pane).toMatch(/\.context dt\s*\{[^}]*font-size:\s*max\(12px, var\(--font-size-xs\)\)/);
  expect(pane).toMatch(/\.pane select\s*\{[^}]*min-height:\s*max\(32px, 2rem\)/);
});
it('uses local header padding clearance and retains original hidden rejection descriptions', () => {
  const css = readFileSync('src/ui/screens/RewardRoster.module.css', 'utf8');
  expect(css).toMatch(/\.roster th\s*\{[^}]*padding-inline:\s*0/);
  expect(css).toMatch(/\.roster th button\s*\{[^}]*padding-inline:\s*0/);
  expect(css).toMatch(
    /\.actionCell small,\s*\.actionCell p\s*\{[^}]*width:\s*1px;[^}]*height:\s*1px;[^}]*overflow:\s*hidden;[^}]*clip-path:\s*inset\(50%\)/,
  );
  const source = readFileSync('src/ui/screens/RewardRoster.tsx', 'utf8');
  expect(source).toContain('rowHeight={40}');
  expect(source).toContain('height={400}');
  for (const width of [140, 64, 100, 240, 80]) expect(source).toContain(`width: ${width}`);
});
it('clears only the seventh promotion column while preserving actual eight-header order', () => {
  render(<RewardRoster onClose={vi.fn()} />);
  const headers = screen.getAllByRole('columnheader').map((header) => header.textContent);
  expect(headers).toEqual([
    '姓名',
    '忠誠',
    '年內賞賜次數',
    '小額',
    '中額',
    '大額',
    '身分推舉',
    '加封',
  ]);
  expect(headers[6]).toBe('身分推舉');
  const css = readFileSync('src/ui/screens/RewardRoster.module.css', 'utf8');
  expect(css).toMatch(/\.roster tbody td:nth-child\(7\)\s*\{[^}]*padding-inline:\s*0/);
  expect(css).toMatch(/\.roster tbody td:nth-child\(7\) button\s*\{[^}]*padding-inline:\s*0/);
});
it('keeps disabled header and command captions opaque and readable without enabling them', () => {
  for (const [file, selector] of [
    ['RewardRoster', 'roster'],
    ['RewardFiefPane', 'pane'],
  ]) {
    const css = readFileSync(`src/ui/screens/${file}.module.css`, 'utf8');
    expect(css).toMatch(
      new RegExp(
        `\\.${selector} button:disabled\\s*\\{[^}]*opacity:\\s*1;[^}]*color:\\s*var\\(--text-secondary\\);[^}]*background:\\s*var\\(--surface-raised\\);[^}]*border-color:\\s*var\\(--stroke-subtle\\)`,
      ),
    );
  }
  const luminance = (hex: string) =>
      [1, 3, 5]
        .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
        .reduce((s, x, i) => s + x * [0.2126, 0.7152, 0.0722][i]!, 0),
    a = luminance(UI_THEME['--text-secondary']),
    b = luminance(UI_THEME['--surface-raised']);
  expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(4.5);
  render(<RewardRoster onClose={vi.fn()} />);
  expect(
    screen.getByRole('columnheader', { name: '年內賞賜次數' }).querySelector('button'),
  ).toHaveProperty('disabled', true);
});
it('retains full names, same-dialog fief Back and close without queued commands', () => {
  const close = vi.fn(),
    game = store.getState().game!,
    before = structuredClone(game);
  render(<RewardRoster onClose={close} />);
  const first = screen.getByRole('table').querySelector('tbody tr')!;
  expect(first.querySelector('td')!.textContent).toBeTruthy();
  fireEvent.click(within(first as HTMLElement).getByRole('button', { name: '加封' }));
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(screen.getByTestId('reward-fief-pane')).toBeTruthy();
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: '返回' }));
  expect(screen.queryByTestId('reward-fief-pane')).toBeNull();
  expect(screen.getByRole('table')).toBeTruthy();
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: '褒賞家臣' }));
  expect(close).toHaveBeenCalledTimes(1);
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});
