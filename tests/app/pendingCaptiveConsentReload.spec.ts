import { createElement } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, expect, it } from 'vitest';
import {
  captureSaveSnapshot,
  dispatchCommand,
  getQueuedPlayerCommands,
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
} from '../../src/app/bridge';
import { resetGameStoreForTests, setGame, store } from '../../src/app/store';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { CaptiveModal } from '../../src/ui/screens/CaptiveModal';
import { RecruitPanel } from '../../src/ui/screens/RecruitPanel';
import {
  buildMiniState,
  CASTLE_A1,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_BETA_LORD,
} from '../fixtures/mini';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { validateCommand } from '../../src/core/commands/validate';
import { validateState } from '../../src/core/state/invariants';
import type { Command } from '../../src/core/commands/types';
import type { GameState } from '../../src/core/state/gameState';
import { t } from '../../src/i18n/zh-TW';
import route from '../replay/cases/m4-military-siege-fall.tfulog.json';

const release: Command = {
  type: 'handleCaptive',
  clanId: CLAN_ALPHA,
  officerId: OFF_BETA_LORD,
  action: 'release',
  executorId: null,
};
let earned: GameState;
function reset() {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
}
afterEach(reset);
beforeAll(() => {
  reset();
  const game = buildMiniState({ seed: 42 });
  setGame(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  // Existing six legal player orders; bridge retains all naturally generated AI.
  for (let tick = 1; tick <= 62; tick++) {
    for (const entry of route.entries.filter((entry) => entry.day === tick))
      expect(dispatchCommand(structuredClone(entry.command) as Command)).toEqual({ ok: true });
    const events = runOneDay();
    expect(events.filter((event) => event.type === 'command.rejected')).toEqual([]);
    expect(validateState(game)).toEqual([]);
    expect(store.getState().session.fatalError).toBeNull();
    if (tick === 62)
      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'officer.captured',
          officerId: OFF_BETA_LORD,
          byClanId: CLAN_ALPHA,
        }),
      );
  }
  expect(game.time.day).toBe(152);
  expect(game.officers[OFF_BETA_LORD]).toMatchObject({
    status: 'captive',
    capturedByClanId: CLAN_ALPHA,
  });
  earned = structuredClone(game);
  // Dismiss only pre-existing summary owners to reach the actual earned FIFO capture.
  while (uiStore.getState().modal?.id === 'monthSummary')
    uiStore
      .getState()
      .actions.closeOwnedModal(uiStore.getState().modal!, { resume: false, expectedGame: game });
  expect(uiStore.getState().modal).toMatchObject({
    id: 'captive',
    params: { officerId: OFF_BETA_LORD },
  });
});
function load(game: GameState, commands: Command[] = []) {
  reset();
  setGame(game);
  initializeBridgeSession(game, commands, { loaded: true });
  store.getState().actions.setScreen('main');
}
function captiveButton(game: GameState) {
  return screen.queryByRole('button', { name: new RegExp(game.officers[OFF_BETA_LORD]!.name) });
}

it('prevents a second actual UI release after earned capture consent survives a native pending save', () => {
  // beforeAll leaves the genuinely earned captive owner in front, without fake arrivals.
  const game = store.getState().game!;
  expect(game.time.day).toBe(152);
  render(createElement(CaptiveModal, { officerId: OFF_BETA_LORD }));
  const before = structuredClone(game);
  fireEvent.click(screen.getByRole('button', { name: t('cmd.captive.release') }));
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([release]);
  const snapshot = captureSaveSnapshot(0);
  const decoded = decodeSave(encodeSave(snapshot.state, 0, snapshot.pendingCommands));
  if (!decoded.ok) throw new Error(decoded.code);
  const restored = decoded.saveFile.state;
  const normalized = structuredClone(before);
  normalized.ai.intentLog = [];
  expect(restored).toEqual(normalized);
  load(restored, decoded.saveFile.pendingCommands);
  expect(uiStore.getState().modal).toBeNull();
  render(createElement(RecruitPanel));
  const duplicateEntry = captiveButton(restored);
  if (duplicateEntry !== null) {
    fireEvent.click(duplicateEntry);
    expect(uiStore.getState().modal).toMatchObject({
      id: 'captive',
      params: { officerId: OFF_BETA_LORD },
    });
    cleanup();
    render(createElement(CaptiveModal, { officerId: OFF_BETA_LORD }));
    fireEvent.click(screen.getByRole('button', { name: t('cmd.captive.release') }));
  }
  // Old source exposes the entry and queues two releases; no timing tolerance or fake core step.
  expect(getQueuedPlayerCommands(restored)).toEqual([release]);
  expect(duplicateEntry).toBeNull();
  expect(uiStore.getState().queuedDecisionIds).toEqual([OFF_BETA_LORD]);
  expect(restored).toEqual(normalized);
  cleanup();
  let events: ReturnType<typeof runOneDay> = [];
  act(() => {
    events = runOneDay();
  });
  expect(events.filter((event) => event.type === 'command.rejected')).toEqual([]);
  expect(
    events.filter(
      (event) => event.type === 'officer.released' && event.officerId === OFF_BETA_LORD,
    ),
  ).toHaveLength(1);
  expect(restored.time.day).toBe(153);
  expect(restored.officers[OFF_BETA_LORD]).toMatchObject({ status: 'serving', clanId: CLAN_BETA });
  expect(getQueuedPlayerCommands(restored)).toEqual([]);
  expect(validateState(restored)).toEqual([]);
});

it.each(['absent', 'settled', 'wrongCaptor', 'wrongHoldingOwner'] as const)(
  'retains %s saved intent without suppressing a stale or foreign captive',
  (mode) => {
    const game = structuredClone(earned);
    const officer = game.officers[OFF_BETA_LORD]!;
    if (mode === 'absent') delete game.officers[OFF_BETA_LORD];
    if (mode === 'settled') officer.status = 'serving';
    if (mode === 'wrongCaptor') officer.capturedByClanId = CLAN_BETA;
    if (mode === 'wrongHoldingOwner') officer.locationCastleId = CASTLE_B1;
    expect(validateCommand(game, release).ok).toBe(false);
    const before = structuredClone(game);
    load(game, [release]);
    expect(uiStore.getState().queuedDecisionIds).toEqual([]);
    expect(getQueuedPlayerCommands(game)).toEqual([release]);
    expect(store.getState().session.pendingCommandCount).toBe(1);
    expect(game).toEqual(before);
    expect(uiStore.getState().modal).toBeNull();
  },
);

it('keeps an undisposed earned captive reachable without synthesizing arrival, including same-session reinitialization', () => {
  const game = structuredClone(earned);
  load(game, [release]);
  expect(uiStore.getState().queuedDecisionIds).toEqual([OFF_BETA_LORD]);
  initializeBridgeSession(game, []);
  expect(uiStore.getState().queuedDecisionIds).toEqual([]);
  expect(uiStore.getState().modal).toBeNull();
  render(createElement(RecruitPanel));
  const entry = captiveButton(game);
  expect(entry).not.toBeNull();
  fireEvent.click(entry!);
  expect(uiStore.getState().modal?.id).toBe('captive');
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});

it('deduplicates presentation IDs only, preserving restored order, game and queue count', () => {
  const game = structuredClone(earned);
  const other: Command = {
    type: 'setConscriptPolicy',
    clanId: CLAN_ALPHA,
    castleId: CASTLE_A1,
    policy: 'mid',
  };
  const commands = [release, other, release];
  const before = structuredClone(game);
  load(game, commands);
  expect(uiStore.getState().queuedDecisionIds).toEqual([OFF_BETA_LORD]);
  expect(getQueuedPlayerCommands(game)).toEqual(commands);
  expect(store.getState().session.pendingCommandCount).toBe(3);
  expect(game).toEqual(before);
  expect(uiStore.getState().modal).toBeNull();
});

it.each(['execute', 'recruit'] as const)(
  'restores an eligible saved %s consent without applying the action or consuming RNG',
  (action) => {
    const game = structuredClone(earned);
    const command: Command = { ...release, action };
    expect(validateCommand(game, command)).toEqual({ ok: true });
    const before = structuredClone(game);
    load(game, [command]);
    expect(uiStore.getState().queuedDecisionIds).toEqual([OFF_BETA_LORD]);
    expect(getQueuedPlayerCommands(game)).toEqual([command]);
    render(createElement(RecruitPanel));
    expect(captiveButton(game)).toBeNull();
    expect(game).toEqual(before);
  },
);

it('does not accept wrong-player saved captive commands or inherit another session consent', () => {
  const game = structuredClone(earned);
  load(game, []);
  expect(() => initializeBridgeSession(game, [{ ...release, clanId: CLAN_BETA }])).toThrow();
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(uiStore.getState().queuedDecisionIds).toEqual([]);
  uiStore.getState().actions.markDecisionQueued('foreign-session');
  const fresh = structuredClone(earned);
  setGame(fresh);
  initializeBridgeSession(fresh, []);
  expect(uiStore.getState().queuedDecisionIds).toEqual([]);
  expect(fresh).toEqual(earned);
});
