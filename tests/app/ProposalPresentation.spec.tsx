import { readFileSync } from 'node:fs';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import {
  getQueuedPlayerCommands,
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
} from '@app/bridge';
import { resetGameStoreForTests, store } from '@app/store';
import { validateState } from '@core/state/invariants';
import { generateProposalCandidates } from '@core/systems/ai/proposalGen';
import { submitProposal } from '@core/systems/proposals';
import { buildTinyState, CASTLE_A2, CASTLE_B1, OFF_ALPHA_TAISHO } from '../fixtures/tiny';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { ProposalInbox } from '../../src/ui/screens/ProposalInbox';
import { UI_THEME } from '../../src/ui/styles/tokens';

afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests();
  uiStore.getState().actions.reset();
});
function mountGenerated() {
  const game = buildTinyState(),
    officer = game.officers[OFF_ALPHA_TAISHO]!;
  officer.ldr = 100;
  officer.val = 10;
  officer.int = 10;
  officer.pol = 10;
  officer.traits = [];
  game.castles[CASTLE_A2]!.soldiers = 3000;
  game.castles[CASTLE_A2]!.food = 20000;
  game.castles[CASTLE_B1]!.soldiers = 100;
  const candidate = generateProposalCandidates(game).find((p) => p.officerId === officer.id);
  if (!candidate || candidate.command.type !== 'march')
    throw new Error('Expected actual generated legal march');
  const event = submitProposal(game, candidate);
  if (!event || event.type !== 'proposal.submitted')
    throw new Error('Expected actual submitted proposal');
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  store.getState().actions.requestPause('user');
  uiStore.getState().actions.enqueueModal({ id: 'proposalInbox', params: {}, pausesTime: true });
  render(<ProposalInbox />);
  return { game, id: event.proposalId };
}
it('uses an actual local opaque intrinsic register with readable floors and distinct rejection/adoption roles', () => {
  const source = readFileSync('src/ui/screens/ProposalInbox.tsx', 'utf8');
  const stylesheet = source.match(/import styles from '\.\/([^']+)'/);
  if (!stylesheet) throw new Error('Expected actual producer stylesheet import');
  const css = readFileSync(`src/ui/screens/${stylesheet[1]}`, 'utf8');
  expect(css).toContain('grid-auto-rows: max-content');
  expect(css).toContain('font-size: max(12px, var(--font-size-sm))');
  expect(css).toContain('.actions > :first-child button');
  expect(css).toContain('.actions > :last-child button');
  expect(css).toContain('min-width: 32px');
  expect(css).not.toContain(':global');
  expect(css).not.toContain('display: none');
  expect(css).not.toContain('text-overflow: ellipsis');
});
it('retains narrative details and native decision order, queuing and executing only the original reject command', async () => {
  const { game, id } = mountGenerated(),
    before = structuredClone(game);
  expect(screen.getByTestId('proposal-command-details').textContent).toContain(
    game.castles[CASTLE_A2]!.name,
  );
  expect(screen.getByTestId('proposal-command-details').textContent).toContain(
    game.castles[CASTLE_B1]!.name,
  );
  expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
    '拒絕',
    '採納',
    '全部駁回',
  ]);
  expect(screen.getByRole('button', { name: '全部駁回' }).className).toContain('rejectAll');
  fireEvent.click(screen.getByRole('button', { name: '拒絕' }));
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([
    { type: 'resolveProposal', clanId: game.meta.playerClanId, proposalId: id, accept: false },
  ]);
  await act(async () => {
    runOneDay();
    await Promise.resolve();
  });
  expect(game.proposals[id]!.status).toBe('rejected');
  expect(validateState(game)).toEqual([]);
});
it('retains the real adoption callback without making presentation tests claim native earned acceptance', async () => {
  const { game, id } = mountGenerated(),
    before = structuredClone(game);
  fireEvent.click(screen.getByRole('button', { name: '採納' }));
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([
    { type: 'resolveProposal', clanId: game.meta.playerClanId, proposalId: id, accept: true },
  ]);
  await act(async () => {
    runOneDay();
    await Promise.resolve();
  });
  expect(game.proposals[id]!.status).toBe('accepted');
  expect(validateState(game)).toEqual([]);
});
it('keeps enabled and disabled decision text above contrast floor using actual paper/command tokens', () => {
  const lum = (hex: string) =>
    [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
      .reduce((s, x, i) => s + x * [0.2126, 0.7152, 0.0722][i]!, 0);
  for (const [fg, bg] of [
    [UI_THEME['--text-primary'], UI_THEME['--surface-panel']],
    [UI_THEME['--text-inverse'], UI_THEME['--surface-command']],
    [UI_THEME['--text-secondary'], UI_THEME['--surface-raised']],
  ]) {
    const a = lum(fg!),
      b = lum(bg!);
    expect((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)).toBeGreaterThanOrEqual(4.5);
  }
});
