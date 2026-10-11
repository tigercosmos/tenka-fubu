import { readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { initializeBridgeSession, getQueuedPlayerCommands, resetBridgeForTests } from '@app/bridge';
import { resetGameStoreForTests } from '@app/store';
import type { TraitId } from '@core/state/ids';
import { buildTinyState, OFF_ALPHA_BUSHO } from '../../../tests/fixtures/tiny';
import { OfficerDetail } from './OfficerDetail';
import { uiStore } from '../hooks/uiStore';
import { injectCssVariables } from '../styles/tokens';

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
  const officer = game.officers[OFF_ALPHA_BUSHO]!;
  officer.traits = ['trait.naisei', 'trait.chushin'] as TraitId[];
  officer.statGrowth.ldr = 2;
  officer.statExp.ldr = 45;
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  const close = vi.fn();
  render(<OfficerDetail officerId={officer.id} onClose={close} />);
  return { game, officer, close };
}
it('binds actual officer decisions and portal trait explanations to local presentation without changing their owner', () => {
  const { game } = mount(),
    before = structuredClone(game);
  expect(
    screen.getByRole('button', { name: '任命城主' }).closest('[class*="assignments"]'),
  ).not.toBeNull();
  const chip = screen.getByText('內政名人');
  act(() => chip.focus());
  const tip = screen.getByRole('tooltip');
  expect(tip.firstElementChild?.className).toContain('traitTooltip');
  expect(tip.textContent).toContain('郡開發效率 ×1.2');
  expect(tip.closest('[data-testid="officer-detail"]')).toBeNull();
  act(() => chip.blur());
  expect(screen.queryByRole('tooltip')).toBeNull();
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});
it('retains exact effective stats, truthful growth aria, complete facts and disabled reasons without financial commands', () => {
  const { game, officer, close } = mount(),
    before = structuredClone(game);
  expect(screen.getByRole('img', { name: `統率 ${officer.ldr + 2}` })).toBeTruthy();
  const progress = screen.getByRole('progressbar', { name: '統率成長經驗' });
  expect(progress.getAttribute('aria-valuenow')).toBe('45');
  expect(progress.getAttribute('aria-valuemax')).toBe('100');
  for (const label of [
    '能力成長',
    '忠誠',
    '功績',
    '年齡',
    '身分',
    '役職',
    '特性',
    '知行',
    '經歷',
    '操作',
  ])
    expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  const appoint = screen.getByRole('button', { name: '任命城主' });
  expect(appoint).toHaveProperty('disabled', true);
  expect(appoint.getAttribute('title')).toBeTruthy();
  expect(appoint.parentElement?.querySelector('small')?.textContent).toBe(
    appoint.getAttribute('title'),
  );
  const root = screen.getByTestId('officer-detail');
  fireEvent.click(root.querySelector('header button')!);
  expect(close).toHaveBeenCalledOnce();
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});
it('keeps header separate from intrinsic dossier scrolling and floors every local nested information surface', () => {
  const css = readFileSync('src/ui/screens/OfficerDetail.module.css', 'utf8');
  expect(css).toMatch(/\.detail > section > div\s*\{[^}]*overflow: auto/);
  expect(css).toMatch(/\.growth\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  expect(css).toMatch(
    /\.stats > \[role='img'\]\s*\{[^}]*font-size: max\(12px, var\(--font-size-xs\)\)/,
  );
  expect(css).toMatch(/\.traitTooltip\s*\{[^}]*font-size: max\(12px, var\(--font-size-xs\)\)/);
  expect(css).toMatch(
    /\.assignments button:disabled\s*\{[^}]*opacity: 1[^}]*color: var\(--text-secondary\)/,
  );
  expect(css).not.toMatch(/ellipsis|line-clamp|white-space: nowrap/);
  expect(css).not.toMatch(/font-size: var\(--font-size-(?:xs|sm)\)/);
});
it('resolves every local CSS custom property against actual injected globals', () => {
  injectCssVariables();
  const css = readFileSync('src/ui/screens/OfficerDetail.module.css', 'utf8');
  for (const [, name] of css.matchAll(/var\((--[\w-]+)\)/g))
    expect(document.documentElement.style.getPropertyValue(name!).trim(), name).not.toBe('');
});
