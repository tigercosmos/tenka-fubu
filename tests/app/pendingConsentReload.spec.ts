import { createElement } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeAll, expect, it } from 'vitest';
import {
  earnAzaiAllianceCheckpoint,
  ALLIANCE_COMMAND,
  AZAI,
  ASAKURA,
} from '../helpers/earnedAzaiAlliance';
import {
  initializeBridgeSession,
  getQueuedPlayerCommands,
  resetBridgeForTests,
  runOneDay,
} from '../../src/app/bridge';
import { resetGameStoreForTests, store } from '../../src/app/store';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { useM6Dialogs } from '../../src/ui/hooks/useM6Dialogs';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { stateHash } from '../../src/core/state/serialize';
import { validateCommand } from '../../src/core/commands/validate';
import { validateState } from '../../src/core/state/invariants';
import type { Command } from '../../src/core/commands/types';
import type { GameState } from '../../src/core/state/gameState';
import type { ProposalId } from '../../src/core/state/ids';

let checkpoint: Awaited<ReturnType<typeof earnAzaiAllianceCheckpoint>>;
beforeAll(async () => {
  checkpoint = await earnAzaiAllianceCheckpoint();
}, 15000);
afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
});
function mountArrivals() {
  useM6Dialogs();
  return null;
}
function load(game: GameState, commands: Command[]) {
  uiStore.getState().actions.reset();
  resetGameStoreForTests(game);
  initializeBridgeSession(game, commands, { loaded: true });
  store.getState().actions.setScreen('main');
}
function decisions(game: GameState): Command[] {
  return Object.values(game.proposals)
    .filter((p) => p.clanId === AZAI && p.status === 'pending')
    .map((p) => ({ type: 'resolveProposal', clanId: AZAI, proposalId: p.id, accept: false }));
}

it('restores four earned saved consents before actual arrival hooks, retaining the alliance and exact queue until one normal day', () => {
  const commands = [...decisions(checkpoint.state), ALLIANCE_COMMAND];
  expect(commands).toHaveLength(5);
  for (const command of commands)
    expect(validateCommand(checkpoint.state, command)).toEqual({ ok: true });
  const decoded = decodeSave(encodeSave(checkpoint.state, 0, commands));
  if (!decoded.ok) throw new Error(decoded.code);
  const game = decoded.saveFile.state;
  const before = structuredClone(game);
  const hash = stateHash(game);
  load(game, decoded.saveFile.pendingCommands);
  expect(getQueuedPlayerCommands(game)).toEqual(commands);
  expect(store.getState().session.pendingCommandCount).toBe(5);
  expect(uiStore.getState().queuedDecisionIds).toEqual(
    commands.slice(0, 4).map((c) => ('proposalId' in c ? c.proposalId : '')),
  );
  render(createElement(mountArrivals));
  expect(uiStore.getState().modal).toBeNull();
  expect(uiStore.getState().modalQueue).toEqual([]);
  expect(game).toEqual(before);
  expect(stateHash(game)).toBe(hash);
  cleanup();
  const events = runOneDay();
  expect(game.time.day).toBe(271);
  expect(events.filter((e) => e.type === 'command.rejected')).toEqual([]);
  expect(events.filter((e) => e.type === 'pact.signed')).toHaveLength(1);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(validateState(game)).toEqual([]);
});

it.each(['absent', 'settled', 'wrongSubjectOwner', 'expired'] as const)(
  'does not suppress %s proposals or remove their restored intents',
  (mode) => {
    const game = structuredClone(checkpoint.state);
    const command = decisions(game)[0]!;
    if (command.type !== 'resolveProposal') throw new Error('Expected real earned proposal');
    const proposal = game.proposals[command.proposalId]!;
    if (mode === 'absent') delete game.proposals[command.proposalId];
    if (mode === 'settled') proposal.status = 'rejected';
    if (mode === 'wrongSubjectOwner') proposal.clanId = ASAKURA;
    if (mode === 'expired') proposal.expiresDay = game.time.day;
    const before = structuredClone(game);
    load(game, [command]);
    expect(uiStore.getState().queuedDecisionIds).toEqual([]);
    expect(getQueuedPlayerCommands(game)).toEqual([command]);
    render(createElement(mountArrivals));
    expect(uiStore.getState().modal?.id).toBe('proposalInbox');
    expect(game).toEqual(before);
  },
);

it('restores only valid recipient consent for envoys, without creating or settling a proposal', () => {
  const game = structuredClone(checkpoint.state);
  const id = 'prop.saved-envoy' as ProposalId;
  game.diplomacy.pendingProposals.push({
    id,
    kind: 'proposeAlliance',
    fromClanId: ASAKURA,
    toClanId: AZAI,
    createdDay: 269,
    expiresDay: 300,
    marriageOfficerIds: null,
    reinforceAgainstClanId: null,
  });
  const command: Command = { type: 'respondPact', clanId: AZAI, proposalId: id, accept: false };
  expect(validateCommand(game, command)).toEqual({ ok: true });
  const before = structuredClone(game);
  load(game, [command]);
  expect(uiStore.getState().queuedDecisionIds).toEqual([id]);
  render(createElement(mountArrivals));
  expect(uiStore.getState().modal?.id).toBe('proposalInbox');
  expect(uiStore.getState().modalQueue.some((modal) => modal.id === 'envoy')).toBe(false);
  expect(game).toEqual(before);
  cleanup();
  for (const invalid of ['absent', 'wrongRecipient', 'expired'] as const) {
    const other = structuredClone(before);
    const envoy = other.diplomacy.pendingProposals.find((p) => p.id === id)!;
    if (invalid === 'absent')
      other.diplomacy.pendingProposals = other.diplomacy.pendingProposals.filter(
        (p) => p.id !== id,
      );
    if (invalid === 'wrongRecipient') envoy.toClanId = ASAKURA;
    if (invalid === 'expired') envoy.expiresDay = other.time.day - 1;
    load(other, [command]);
    expect(uiStore.getState().queuedDecisionIds).toEqual([]);
    expect(getQueuedPlayerCommands(other)).toEqual([command]);
  }
});

it('replaces old registry on explicit fresh initialization, including the same owner object', () => {
  const game = structuredClone(checkpoint.state);
  const commands = decisions(game);
  load(game, commands);
  expect(uiStore.getState().queuedDecisionIds).toHaveLength(4);
  initializeBridgeSession(game, []);
  expect(uiStore.getState().queuedDecisionIds).toEqual([]);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  uiStore.getState().actions.markDecisionQueued('old-session');
  const fresh = structuredClone(checkpoint.state);
  resetGameStoreForTests(fresh);
  initializeBridgeSession(fresh, []);
  expect(uiStore.getState().queuedDecisionIds).toEqual([]);
  render(createElement(mountArrivals));
  expect(uiStore.getState().modal?.id).toBe('proposalInbox');
});

it('rejects a wrong player pending command without hiding any decisions', () => {
  const game = structuredClone(checkpoint.state);
  load(game, []);
  const command = { ...decisions(game)[0]!, clanId: ASAKURA };
  expect(() => initializeBridgeSession(game, [command])).toThrow();
  expect(uiStore.getState().queuedDecisionIds).toEqual([]);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});

it('deduplicates only presentation IDs, never the restored commands or their order', () => {
  const game = structuredClone(checkpoint.state);
  const first = decisions(game)[0]!;
  const commands = [first, ALLIANCE_COMMAND, first];
  const before = structuredClone(game);
  load(game, commands);
  if (first.type !== 'resolveProposal') throw new Error('Expected earned proposal');
  expect(uiStore.getState().queuedDecisionIds).toEqual([first.proposalId]);
  expect(getQueuedPlayerCommands(game)).toEqual(commands);
  expect(store.getState().session.pendingCommandCount).toBe(3);
  expect(game).toEqual(before);
});

it('cannot publish old consent into a session synchronously replaced at pending-count publication', () => {
  const game = structuredClone(checkpoint.state);
  const replacement = structuredClone(checkpoint.state);
  load(game, []);
  const before = structuredClone(game);
  const unsubscribe = store.subscribe((state) => {
    if (state.game !== game || state.session.pendingCommandCount !== 4) return;
    resetGameStoreForTests(replacement);
    initializeBridgeSession(replacement, []);
  });
  try {
    initializeBridgeSession(game, decisions(game));
    expect(store.getState().game).toBe(replacement);
    expect(uiStore.getState().queuedDecisionIds).toEqual([]);
    expect(getQueuedPlayerCommands(replacement)).toEqual([]);
    expect(game).toEqual(before);
  } finally {
    unsubscribe();
  }
});
