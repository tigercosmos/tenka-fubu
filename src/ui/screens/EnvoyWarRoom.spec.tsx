import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { initializeBridgeSession, resetBridgeForTests, getQueuedPlayerCommands } from '@app/bridge';
import { resetGameStoreForTests, store } from '@app/store';
import { CommandQueue } from '@core/commands/queue';
import { advanceDay } from '@core/systems';
import { defaultDiplomacyRow, pairKey } from '@core/state/serialize';
import { buildTinyState, CLAN_ALPHA, CLAN_BETA } from '../../../tests/fixtures/tiny';
import { EnvoyModal } from './EnvoyModal';
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
function mount(expired = false) {
  const game = buildTinyState();
  // Explicit controlled unit admission facts; native evidence earns the real AI arrival.
  const row = defaultDiplomacyRow(CLAN_BETA, CLAN_ALPHA);
  if (row.a === CLAN_BETA) row.trustAtoB = 100;
  else row.trustBtoA = 100;
  game.diplomacy.rows[pairKey(CLAN_BETA, CLAN_ALPHA)] = row;
  const queue = new CommandQueue(game.meta.lastAppliedCmdSeq + 1);
  queue.enqueue(
    {
      type: 'proposePact',
      clanId: CLAN_BETA,
      targetClanId: CLAN_ALPHA,
      kind: 'proposeAlliance',
      reinforceAgainstClanId: null,
    },
    game.time.day,
    { kind: 'clan', clanId: CLAN_BETA },
  );
  advanceDay(game, queue.drain());
  const proposal = game.diplomacy.pendingProposals[0]!;
  expect(proposal).toBeDefined();
  if (expired) proposal.expiresDay = game.time.day - 1;
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  store.getState().actions.requestPause('user');
  uiStore
    .getState()
    .actions.enqueueModal({ id: 'envoy', params: { proposalId: proposal.id }, pausesTime: true });
  render(<EnvoyModal proposalId={proposal.id} />);
  return game;
}

it('binds the actual incoming offer and decision controls to local physical font and material hierarchy', () => {
  mount();
  const article = screen.getByTestId('envoy-modal');
  expect(article.className).toContain('frame');
  expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['拒絕', '接受']);
  expect(screen.getAllByRole('button')[0]!.closest('[class*="decisions"]')).not.toBeNull();
  const css = readFileSync('src/ui/screens/EnvoyModal.module.css', 'utf8');
  expect(css).toMatch(/\.frame\s*\{[^}]*font-size: max\(12px, var\(--font-size-sm\)\)/);
  expect(css).toMatch(/\.decisions button\s*\{[^}]*min-height: max\(32px, 2rem\)/);
  expect(css).toMatch(
    /\.decisions > :first-child button\s*\{[^}]*background: var\(--surface-panel\)/,
  );
  expect(css).toMatch(
    /\.decisions > :last-child button\s*\{[^}]*background: var\(--surface-command\)/,
  );
});

it('retains complete terms, expiry, decision effects and mandatory Escape without sending a command', () => {
  const game = mount(),
    before = structuredClone(game);
  const article = screen.getByTestId('envoy-modal');
  expect(article.textContent).toContain('60');
  expect(article.textContent).toContain('信用');
  expect(article.textContent).toContain('冷卻');
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(screen.getByTestId('envoy-modal')).toBe(article);
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});

it('keeps intrinsic full-wrap facts and opaque readable disabled explanations without shared styles', () => {
  const css = readFileSync('src/ui/screens/EnvoyModal.module.css', 'utf8');
  expect(css).toMatch(/\.frame p\s*\{[^}]*overflow-wrap: anywhere/);
  expect(css).toMatch(/\.decisions button:disabled\s*\{[^}]*opacity: 1/);
  expect(css).toMatch(/\.decisions small[^}]*font-size: max\(12px, var\(--font-size-xs\)\)/);
  expect(css).not.toMatch(/text-overflow|line-clamp|min-height: [4-9]\drem/);
});

it('keeps the actual expired-offer validator reasons and both disabled decisions visible without dispatch', () => {
  const game = mount(true),
    before = structuredClone(game);
  for (const button of screen.getAllByRole('button')) {
    expect(button).toHaveProperty('disabled', true);
    expect(button.getAttribute('title')).toBeTruthy();
    expect(button.parentElement?.querySelector('small')?.textContent).toBe(
      button.getAttribute('title'),
    );
    fireEvent.click(button);
  }
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});

it('resolves all local semantic CSS variables against the real injected theme', () => {
  injectCssVariables();
  const css = readFileSync('src/ui/screens/EnvoyModal.module.css', 'utf8');
  for (const variable of css.matchAll(/var\((--[\w-]+)\)/g))
    expect(
      document.documentElement.style.getPropertyValue(variable[1]!).trim(),
      variable[1],
    ).not.toBe('');
});

it('initially focuses the mandatory dialog root without activating either decision and keeps its Tab trap', async () => {
  const game = mount(),
    before = structuredClone(game);
  const dialog = screen.getByRole('dialog');
  await waitFor(() => expect(document.activeElement).toBe(dialog));
  fireEvent.keyDown(dialog, { key: 'Enter' });
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(game).toEqual(before);
  const buttons = screen.getAllByRole('button');
  fireEvent.keyDown(dialog, { key: 'Tab' });
  expect(document.activeElement).toBe(buttons[0]);
  fireEvent.keyDown(buttons[0]!, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(buttons[1]);
  fireEvent.keyDown(buttons[1]!, { key: 'Tab' });
  expect(document.activeElement).toBe(buttons[0]);
  fireEvent.keyDown(dialog, { key: 'Escape' });
  expect(screen.getByRole('dialog')).toBe(dialog);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});

it('keeps Reject neutral on hover rather than promoting it to the Accept command material', () => {
  const css = readFileSync('src/ui/screens/EnvoyModal.module.css', 'utf8');
  expect(css).toMatch(
    /\.decisions > :first-child button:hover:not\(:disabled\)\s*\{[^}]*background: var\(--surface-raised\)[^}]*color: var\(--text-primary\)/,
  );
});
