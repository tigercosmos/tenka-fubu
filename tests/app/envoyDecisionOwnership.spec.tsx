import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import {
  getQueuedPlayerCommands,
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
} from '@app/bridge';
import { resetGameStoreForTests, setGame, store } from '@app/store';
import { BAL } from '@core/balance';
import { CommandQueue } from '@core/commands/queue';
import { validateCommand } from '@core/index';
import { decodeSave, encodeSave } from '@core/save/serialize';
import { validateState } from '@core/state/invariants';
import { advanceDay } from '@core/systems';
import { adjustSentiment, adjustTrust, getDiplomacyRow } from '@core/systems/diplomacyCommon';
import { t } from '@i18n/zh-TW';
import { EnvoyModal } from '../../src/ui/screens/EnvoyModal';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { buildTinyState, CLAN_ALPHA, CLAN_BETA } from '../fixtures/tiny';

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
  if (!key) throw new Error('Expected real React native button');
  const props = (button as unknown as Record<string, { onClick: () => void }>)[key];
  if (!props) throw new Error('Expected actual native click callback');
  return props.onClick;
}

function delivered(kind: 'proposeAlliance' | 'offerVassal') {
  const game = buildTinyState();
  // Controlled valid admission facts, not a simulated history of earned credit or decline.
  adjustTrust(game, CLAN_BETA, CLAN_ALPHA, BAL.trustMax);
  adjustSentiment(game, CLAN_ALPHA, CLAN_BETA, 100);
  adjustSentiment(game, CLAN_BETA, CLAN_ALPHA, 100);
  if (kind === 'offerVassal') {
    game.clans[CLAN_BETA]!.prestige = 0;
    game.clans[CLAN_ALPHA]!.prestige = BAL.vassalPrestigeGap;
    for (const district of Object.values(game.districts))
      if (district.ownerClanId === CLAN_BETA) district.kokudaka = 1;
    for (const castle of Object.values(game.castles))
      if (castle.ownerClanId === CLAN_BETA) castle.soldiers = 0;
  }
  expect(validateState(game)).toEqual([]);
  const command = {
    type: 'proposePact' as const,
    clanId: CLAN_BETA,
    targetClanId: CLAN_ALPHA,
    kind,
    reinforceAgainstClanId: null,
  };
  const authority = { kind: 'clan' as const, clanId: CLAN_BETA };
  expect(validateCommand(game, command, authority)).toEqual({ ok: true });
  const queue = new CommandQueue(game.meta.lastAppliedCmdSeq + 1);
  queue.enqueue(command, game.time.day, authority);
  const result = advanceDay(game, queue.drain());
  expect(result.appliedCommands).toHaveLength(1);
  expect(result.events.some((event) => event.type === 'command.rejected')).toBe(false);
  expect(result.events.some((event) => event.type === 'diplo.envoyArrived')).toBe(true);
  expect(game.diplomacy.pendingProposals).toHaveLength(1);
  const proposal = game.diplomacy.pendingProposals[0]!;
  expect(proposal.kind).toBe(kind);
  expect(validateState(game)).toEqual([]);
  return { game, proposal };
}

function mount(original: ReturnType<typeof delivered>, strict = false) {
  resetGameStoreForTests(original.game);
  initializeBridgeSession(original.game);
  store.getState().actions.setScreen('main');
  store.getState().actions.requestPause('user');
  uiStore.getState().actions.enqueueModal({
    id: 'envoy',
    params: { proposalId: original.proposal.id },
    pausesTime: true,
  });
  const content = <EnvoyModal proposalId={original.proposal.id} />;
  render(strict ? <StrictMode>{content}</StrictMode> : content);
  expect(screen.getByTestId('envoy-modal').closest('[data-ui-dialog]')).not.toBeNull();
}

function loadOther(other: ReturnType<typeof delivered>) {
  const decoded = decodeSave(encodeSave(other.game, 123));
  if (!decoded.ok) throw new Error('Expected valid native incoming-offer save');
  const game = decoded.saveFile.state;
  act(() => {
    setGame(game);
    initializeBridgeSession(game);
  });
  return game;
}

it.each([true, false])(
  'rejects retained accept=%s after native same-ID reload with unseen vassal terms',
  (accept) => {
    const original = delivered('proposeAlliance');
    const other = delivered('offerVassal');
    expect(other.proposal.id).toBe(original.proposal.id);
    mount(original);
    const oldClick = retainedClick(
      screen.getByRole('button', {
        name: t(accept ? 'ui.common.accept' : 'ui.common.reject'),
      }),
    );
    const game = loadOther(other);
    expect(screen.getByText(t('cmd.diplomacy.offerVassal'))).toBeTruthy();
    const before = structuredClone(game);
    const modal = uiStore.getState().modal;
    act(() => oldClick());
    expect(game).toEqual(before);
    expect(game.rng).toEqual(before.rng);
    expect(validateState(game)).toEqual([]);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    expect(uiStore.getState().queuedDecisionIds).toEqual([]);
    expect(uiStore.getState().modal).toBe(modal);
  },
);

it('freshly displayed replacement terms still accept once and establish the correct vassal direction on a normal day', () => {
  const original = delivered('proposeAlliance');
  const other = delivered('offerVassal');
  mount(original);
  const game = loadOther(other);
  expect(
    screen.getByText(t('ui.envoy.offerVassal', { clan: game.clans[CLAN_BETA]!.name })),
  ).toBeTruthy();
  const before = structuredClone(game);
  fireEvent.click(screen.getByRole('button', { name: t('ui.common.accept') }));
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([
    { type: 'respondPact', clanId: CLAN_ALPHA, proposalId: other.proposal.id, accept: true },
  ]);
  act(() => {
    runOneDay();
  });
  expect(game.diplomacy.pendingProposals).toEqual([]);
  expect(getDiplomacyRow(game, CLAN_ALPHA, CLAN_BETA).pacts).toContainEqual(
    expect.objectContaining({ kind: 'vassal', vassalClanId: CLAN_BETA }),
  );
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(validateState(game)).toEqual([]);
});

it('preserves accepted queue admission but does not mark or close a replacement FIFO owner during publication', () => {
  const original = delivered('proposeAlliance');
  mount(original);
  const modal = uiStore.getState().modal!;
  const before = structuredClone(original.game);
  let replaced = false;
  const unsubscribe = store.subscribe((next, previous) => {
    if (!replaced && next.session.pendingCommandCount > previous.session.pendingCommandCount) {
      replaced = true;
      uiStore.getState().actions.closeOwnedModal(modal, { resume: false });
      uiStore.getState().actions.enqueueModal({ id: 'systemMenu', params: {}, pausesTime: false });
    }
  });
  try {
    fireEvent.click(screen.getByRole('button', { name: t('ui.common.accept') }));
    expect(replaced).toBe(true);
    expect(getQueuedPlayerCommands(original.game)).toEqual([
      { type: 'respondPact', clanId: CLAN_ALPHA, proposalId: original.proposal.id, accept: true },
    ]);
    expect(original.game).toEqual(before);
    expect(validateState(original.game)).toEqual([]);
    expect({
      modal: uiStore.getState().modal?.id,
      decisions: uiStore.getState().queuedDecisionIds,
    }).toEqual({ modal: 'systemMenu', decisions: [] });
  } finally {
    unsubscribe();
  }
});

it('does not revive an exact removed/restored FIFO descriptor and permits a fresh envoy owner', () => {
  const original = delivered('proposeAlliance');
  mount(original);
  const oldClick = retainedClick(screen.getByRole('button', { name: t('ui.common.accept') }));
  const modal = uiStore.getState().modal!;
  act(() => {
    uiStore.getState().actions.closeOwnedModal(modal, { resume: false });
    uiStore.getState().actions.enqueueModal(modal);
  });
  const before = structuredClone(original.game);
  act(() => oldClick());
  expect(getQueuedPlayerCommands(original.game)).toEqual([]);
  expect(uiStore.getState().queuedDecisionIds).toEqual([]);
  expect(original.game).toEqual(before);
  act(() => {
    uiStore.getState().actions.closeOwnedModal(modal, { resume: false });
    uiStore.getState().actions.enqueueModal({
      id: 'envoy',
      params: { proposalId: original.proposal.id },
      pausesTime: true,
    });
  });
  fireEvent.click(screen.getByRole('button', { name: t('ui.common.accept') }));
  expect(getQueuedPlayerCommands(original.game)).toHaveLength(1);
  act(() => {
    runOneDay();
  });
  expect(
    getDiplomacyRow(original.game, CLAN_ALPHA, CLAN_BETA).pacts.some(
      (pact) => pact.kind === 'alliance',
    ),
  ).toBe(true);
  expect(validateState(original.game)).toEqual([]);
});

it('keeps fresh actual envoy acceptance usable exactly once under StrictMode', () => {
  const original = delivered('proposeAlliance');
  mount(original, true);
  const before = structuredClone(original.game);
  fireEvent.click(screen.getByRole('button', { name: t('ui.common.accept') }));
  expect(original.game).toEqual(before);
  expect(getQueuedPlayerCommands(original.game)).toEqual([
    { type: 'respondPact', clanId: CLAN_ALPHA, proposalId: original.proposal.id, accept: true },
  ]);
  act(() => {
    runOneDay();
  });
  expect(
    getDiplomacyRow(original.game, CLAN_ALPHA, CLAN_BETA).pacts.some(
      (pact) => pact.kind === 'alliance',
    ),
  ).toBe(true);
  expect(getQueuedPlayerCommands(original.game)).toEqual([]);
  expect(validateState(original.game)).toEqual([]);
});
