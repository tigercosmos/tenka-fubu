import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { StrictMode } from 'react';
import {
  getQueuedPlayerCommands,
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
} from '@app/bridge';
import { resetGameStoreForTests, setGame, store } from '@app/store';
import { validateCommand } from '@core/index';
import { decodeSave, encodeSave } from '@core/save/serialize';
import { validateState } from '@core/state/invariants';
import { generateProposalCandidates } from '@core/systems/ai/proposalGen';
import { submitProposal } from '@core/systems/proposals';
import { formatNumber, t } from '@i18n/zh-TW';
import { ProposalInbox } from '../../src/ui/screens/ProposalInbox';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { buildTinyState, CASTLE_A2, CASTLE_B1, OFF_ALPHA_TAISHO } from '../fixtures/tiny';

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

function retainedClick(button: HTMLElement): () => void {
  const key = Object.keys(button).find((name) => name.startsWith('__reactProps$'));
  if (!key) throw new Error('Expected actual React native button');
  const props = (button as unknown as Record<string, { onClick: () => void }>)[key];
  if (!props) throw new Error('Expected real click callback');
  return props.onClick;
}

function generated(soldiers: number) {
  // Controlled valid initial resources/stats, then actual generation and submission.
  const game = buildTinyState();
  const officer = game.officers[OFF_ALPHA_TAISHO]!;
  officer.ldr = 100;
  officer.val = 10;
  officer.int = 10;
  officer.pol = 10;
  officer.traits = [];
  game.castles[CASTLE_A2]!.soldiers = soldiers;
  game.castles[CASTLE_A2]!.food = 20000;
  game.castles[CASTLE_B1]!.soldiers = 100;
  expect(validateState(game)).toEqual([]);
  const candidate = generateProposalCandidates(game).find((x) => x.officerId === officer.id);
  if (!candidate || candidate.command.type !== 'march')
    throw new Error('Expected actual generated legal march');
  expect(validateCommand(game, candidate.command)).toEqual({ ok: true });
  const event = submitProposal(game, candidate);
  if (!event || event.type !== 'proposal.submitted') throw new Error('Expected submission');
  expect(validateState(game)).toEqual([]);
  return { game, id: event.proposalId, command: candidate.command };
}

function mount(game: ReturnType<typeof buildTinyState>, strict = false) {
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  store.getState().actions.requestPause('user');
  uiStore.getState().actions.enqueueModal({ id: 'proposalInbox', params: {}, pausesTime: true });
  render(
    strict ? (
      <StrictMode>
        <ProposalInbox />
      </StrictMode>
    ) : (
      <ProposalInbox />
    ),
  );
  expect(screen.getByTestId('proposal-inbox').closest('[data-ui-dialog]')).not.toBeNull();
}

it.each(['adopt', 'reject', 'rejectAll'] as const)(
  'rejects the retained actual %s callback after same-ID native load with a different generated payload',
  (action) => {
    const original = generated(3000);
    const other = generated(1700);
    expect(other.id).toBe(original.id);
    expect(other.command.soldiers).not.toBe(original.command.soldiers);
    mount(original.game);
    const label = t(
      action === 'adopt'
        ? 'ui.proposal.adopt'
        : action === 'reject'
          ? 'ui.common.reject'
          : 'ui.proposal.rejectAll',
    );
    const oldClick = retainedClick(screen.getByRole('button', { name: label }));
    const loaded = decodeSave(encodeSave(other.game, 123));
    if (!loaded.ok) throw new Error('Expected valid native replacement save');
    const replacement = loaded.saveFile.state;
    expect(replacement.meta.scenarioId).toBe(original.game.meta.scenarioId);
    expect(Object.keys(replacement.proposals)).toEqual(Object.keys(original.game.proposals));
    act(() => {
      setGame(replacement);
      initializeBridgeSession(replacement);
    });
    const before = structuredClone(replacement);
    const modal = uiStore.getState().modal;
    act(() => oldClick());
    expect(replacement).toEqual(before);
    expect(replacement.rng).toEqual(before.rng);
    expect(validateState(replacement)).toEqual([]);
    expect(getQueuedPlayerCommands(replacement)).toEqual([]);
    expect(uiStore.getState().queuedDecisionIds).toEqual([]);
    expect(uiStore.getState().modal).toBe(modal);
  },
);

it('still displays and adopts the freshly loaded generated command exactly once through a normal day', () => {
  const original = generated(3000);
  const other = generated(1700);
  mount(original.game);
  const loaded = decodeSave(encodeSave(other.game, 123));
  if (!loaded.ok) throw new Error('Expected native replacement');
  const game = loaded.saveFile.state;
  act(() => {
    setGame(game);
    initializeBridgeSession(game);
  });
  expect(screen.getByTestId('proposal-command-details').textContent).toContain(
    t('ui.proposal.intent.march', {
      from: game.castles[CASTLE_A2]!.name,
      to: game.castles[CASTLE_B1]!.name,
      soldiers: formatNumber(other.command.soldiers),
      food: formatNumber(other.command.food),
    }),
  );
  const before = structuredClone(game);
  fireEvent.click(screen.getByRole('button', { name: t('ui.proposal.adopt') }));
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([
    { type: 'resolveProposal', clanId: game.meta.playerClanId, proposalId: other.id, accept: true },
  ]);
  act(() => {
    runOneDay();
  });
  expect(game.proposals[other.id]!.status).toBe('accepted');
  expect(Object.values(game.armies).some((army) => army.leaderId === other.command.leaderId)).toBe(
    true,
  );
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(validateState(game)).toEqual([]);
});

it('keeps an accepted queue entry but cannot publish over a new FIFO owner during dispatch', () => {
  const { game, id } = generated(3000);
  mount(game);
  const originalModal = uiStore.getState().modal!;
  const before = structuredClone(game);
  let replaced = false;
  const unsubscribe = store.subscribe((next, previous) => {
    if (!replaced && next.session.pendingCommandCount > previous.session.pendingCommandCount) {
      replaced = true;
      uiStore.getState().actions.closeOwnedModal(originalModal, { resume: false });
      uiStore.getState().actions.enqueueModal({
        id: 'systemMenu',
        params: {},
        pausesTime: false,
      });
    }
  });
  try {
    fireEvent.click(screen.getByRole('button', { name: t('ui.proposal.adopt') }));
    expect(replaced).toBe(true);
    expect(getQueuedPlayerCommands(game)).toEqual([
      { type: 'resolveProposal', clanId: game.meta.playerClanId, proposalId: id, accept: true },
    ]);
    expect(game).toEqual(before);
    expect(game.rng).toEqual(before.rng);
    expect(validateState(game)).toEqual([]);
    expect(uiStore.getState().modal?.id).toBe('systemMenu');
    expect(uiStore.getState().queuedDecisionIds).toEqual([]);
  } finally {
    unsubscribe();
  }
});

it('does not revive a removed and restored exact FIFO owner, while a fresh owner remains usable', () => {
  const { game, id } = generated(3000);
  mount(game);
  const oldClick = retainedClick(screen.getByRole('button', { name: t('ui.proposal.adopt') }));
  const originalModal = uiStore.getState().modal!;
  act(() => {
    uiStore.getState().actions.closeOwnedModal(originalModal, { resume: false });
    uiStore.getState().actions.enqueueModal(originalModal);
  });
  const before = structuredClone(game);
  act(() => oldClick());
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(uiStore.getState().queuedDecisionIds).toEqual([]);
  expect(game).toEqual(before);
  act(() => {
    uiStore.getState().actions.closeOwnedModal(originalModal, { resume: false });
    uiStore.getState().actions.enqueueModal({ id: 'proposalInbox', params: {}, pausesTime: true });
  });
  fireEvent.click(screen.getByRole('button', { name: t('ui.proposal.adopt') }));
  expect(getQueuedPlayerCommands(game)).toEqual([
    { type: 'resolveProposal', clanId: game.meta.playerClanId, proposalId: id, accept: true },
  ]);
  expect(game).toEqual(before);
  act(() => {
    runOneDay();
  });
  expect(game.proposals[id]!.status).toBe('accepted');
  expect(validateState(game)).toEqual([]);
});

it('keeps a fresh generated proposal decision usable exactly once under actual StrictMode mounting', () => {
  const { game, id } = generated(3000);
  mount(game, true);
  const before = structuredClone(game);
  fireEvent.click(screen.getByRole('button', { name: t('ui.proposal.adopt') }));
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([
    { type: 'resolveProposal', clanId: game.meta.playerClanId, proposalId: id, accept: true },
  ]);
  act(() => {
    runOneDay();
  });
  expect(game.proposals[id]!.status).toBe('accepted');
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(validateState(game)).toEqual([]);
});

it('rejects retained bulk consent after an unpublished same-ID raw proposal replacement', () => {
  const original = generated(3000);
  const other = generated(1700);
  mount(original.game);
  const oldBulk = retainedClick(screen.getByRole('button', { name: t('ui.proposal.rejectAll') }));
  const decoded = decodeSave(encodeSave(other.game, 123));
  if (!decoded.ok) throw new Error('Expected valid generated replacement save');
  const replacement = decoded.saveFile.state.proposals[other.id]!;
  expect(replacement.id).toBe(original.id);
  expect(replacement.command).not.toEqual(original.command);
  // Defensive valid-state identity replacement; not a gameplay command-injection journey.
  // No publication: the retained callback must remain bound to the facts actually rendered.
  original.game.proposals[original.id] = replacement;
  expect(validateState(original.game)).toEqual([]);
  const before = structuredClone(original.game);
  const modal = uiStore.getState().modal;
  act(() => oldBulk());
  expect(original.game).toEqual(before);
  expect(original.game.rng).toEqual(before.rng);
  expect(validateState(original.game)).toEqual([]);
  expect(getQueuedPlayerCommands(original.game)).toEqual([]);
  expect(uiStore.getState().queuedDecisionIds).toEqual([]);
  expect(uiStore.getState().modal).toBe(modal);
});
