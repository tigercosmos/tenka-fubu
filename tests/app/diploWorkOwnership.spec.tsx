import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { DiploWork } from '../../src/ui/screens/DiplomacyPanel';
import { CourtPage } from '../../src/ui/screens/CourtPage';
import {
  dispatchCommand,
  getQueuedPlayerCommands,
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
} from '../../src/app/bridge';
import { bumpTickSeq, resetGameStoreForTests, setGame, store } from '../../src/app/store';
import { validateState } from '../../src/core/state/invariants';
import type { Command } from '../../src/core/commands/types';
import { t } from '../../src/i18n/zh-TW';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { ConfirmDialog } from '../../src/ui/components';
import {
  buildTinyState,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_BUSHO,
  OFF_ALPHA_TAISHO,
} from '../fixtures/tiny';

beforeEach(() => {
  resetBridgeForTests();
  uiStore.getState().actions.reset();
});
afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests();
  uiStore.getState().actions.reset();
});

function handler(button: HTMLElement): () => void {
  const key = Object.keys(button).find((name) => name.startsWith('__reactProps$'));
  expect(key).toBeTruthy();
  const props = (button as unknown as Record<string, { onClick: () => void }>)[key!];
  return props!.onClick;
}
function prepared() {
  const game = buildTinyState();
  resetGameStoreForTests(game);
  store.getState().actions.setScreen('main');
  store.getState().actions.requestPause('user');
  initializeBridgeSession(game);
  expect(validateState(game)).toEqual([]);
  return game;
}
function tick(command: Command) {
  act(() => {
    expect(dispatchCommand(command)).toEqual({ ok: true });
    runOneDay();
  });
  expect(validateState(store.getState().game!)).toEqual([]);
}
const start = (
  executorId: typeof OFF_ALPHA_BUSHO,
): Extract<Command, { type: 'startDiploWork' }> => ({
  type: 'startDiploWork',
  clanId: CLAN_ALPHA,
  target: CLAN_BETA,
  executorId,
});
const stop: Command = { type: 'stopDiploWork', clanId: CLAN_ALPHA, target: CLAN_BETA };

it('rejects the prior executor mission callback while the fresh replacement mission can stop', () => {
  const game = prepared();
  tick(start(OFF_ALPHA_BUSHO));
  render(<DiploWork target={CLAN_BETA} />);
  const oldStop = handler(screen.getByRole('button', { name: t('ui.diplomacy.stopWork') }));
  // Both real day boundaries occur before React's next render: the target's
  // stop-command shape is unchanged, although its actual mission is replaced.
  act(() => {
    expect(dispatchCommand(stop)).toEqual({ ok: true });
    runOneDay();
    expect(validateState(game)).toEqual([]);
    expect(dispatchCommand(start(OFF_ALPHA_TAISHO))).toEqual({ ok: true });
    runOneDay();
    expect(validateState(game)).toEqual([]);
  });
  const before = structuredClone(game);
  act(oldStop);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(game).toEqual(before);
  fireEvent.click(screen.getByRole('button', { name: t('ui.diplomacy.stopWork') }));
  expect(getQueuedPlayerCommands(game)).toHaveLength(1);
  act(() => {
    runOneDay();
  });
  expect(game.diplomacy.missions).toEqual([]);
  expect(validateState(game)).toEqual([]);
});

it.each(['unmount', 'game', 'title', 'native', 'fifo'] as const)(
  'rejects retained standalone Court work action after %s',
  (change) => {
    const game = prepared();
    tick({ ...start(OFF_ALPHA_BUSHO), target: 'court' });
    const view = render(<DiploWork target="court" />);
    const oldStop = handler(screen.getByRole('button', { name: t('ui.diplomacy.stopWork') }));
    act(() => {
      if (change === 'unmount') view.unmount();
      if (change === 'game') {
        const next = structuredClone(game);
        setGame(next);
        initializeBridgeSession(next);
      }
      if (change === 'title') store.getState().actions.setScreen('title');
      if (change === 'fifo')
        uiStore
          .getState()
          .actions.enqueueModal({ id: 'monthSummary', params: {}, pausesTime: true });
    });
    if (change === 'native')
      render(
        <ConfirmDialog
          open
          title="Other owner"
          message="Unrelated"
          onConfirm={() => {}}
          onCancel={() => {}}
        />,
      );
    const before = structuredClone(store.getState().game);
    act(oldStop);
    expect(getQueuedPlayerCommands(store.getState().game!)).toEqual([]);
    expect(store.getState().game).toEqual(before);
  },
);

it('preserves equivalent progress refresh and consumes stop only once before settlement', () => {
  const game = prepared();
  tick(start(OFF_ALPHA_BUSHO));
  render(<DiploWork target={CLAN_BETA} />);
  const stopNow = handler(screen.getByRole('button', { name: t('ui.diplomacy.stopWork') }));
  act(() => {
    runOneDay();
  });
  const before = structuredClone(game);
  act(() => {
    stopNow();
    stopNow();
  });
  expect(getQueuedPlayerCommands(game)).toHaveLength(1);
  expect(game).toEqual(before);
  act(() => {
    runOneDay();
  });
  expect(game.diplomacy.missions).toEqual([]);
  expect(validateState(game)).toEqual([]);
  expect(store.getState().session.speed).toBe('paused');
});

it('revokes standalone foreground ownership irreversibly when a modal is removed and restored', () => {
  const game = prepared();
  tick(start(OFF_ALPHA_BUSHO));
  render(<DiploWork target={CLAN_BETA} />);
  const oldStop = handler(screen.getByRole('button', { name: t('ui.diplomacy.stopWork') }));
  act(() => {
    uiStore.getState().actions.enqueueModal({ id: 'monthSummary', params: {}, pausesTime: true });
    uiStore.getState().actions.closeModal();
  });
  const before = structuredClone(game);
  act(oldStop);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(game).toEqual(before);
  act(() => {
    bumpTickSeq();
  });
  fireEvent.click(screen.getByRole('button', { name: t('ui.diplomacy.stopWork') }));
  expect(getQueuedPlayerCommands(game)).toHaveLength(1);
});

it('rejects the old standalone Court target action after switching to shogunate', () => {
  const game = prepared();
  tick({ ...start(OFF_ALPHA_BUSHO), target: 'court' });
  const view = render(<CourtPage target="court" />);
  const oldStop = handler(screen.getByRole('button', { name: t('ui.diplomacy.stopWork') }));
  view.rerender(<CourtPage target="shogunate" />);
  const before = structuredClone(game);
  act(oldStop);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(game).toEqual(before);
});

it('queues a fresh selected executor once and starts only on the normal day boundary', () => {
  const game = prepared();
  render(<DiploWork target={CLAN_BETA} />);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: OFF_ALPHA_BUSHO } });
  const invoke = handler(screen.getByRole('button', { name: t('ui.diplomacy.startWork') }));
  const before = structuredClone(game);
  act(() => {
    invoke();
    invoke();
  });
  expect(getQueuedPlayerCommands(game)).toHaveLength(1);
  expect(game).toEqual(before);
  act(() => {
    runOneDay();
  });
  expect(game.diplomacy.missions).toHaveLength(1);
  expect(game.diplomacy.missions[0]!.officerId).toBe(OFF_ALPHA_BUSHO);
  expect(validateState(game)).toEqual([]);
});

it('allows a fresh retry after an admitted start is rejected by an earlier queued assignment', () => {
  const game = prepared();
  render(<DiploWork target={CLAN_BETA} />);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: OFF_ALPHA_BUSHO } });
  act(() => {
    expect(dispatchCommand({ ...start(OFF_ALPHA_BUSHO), target: 'court' })).toEqual({ ok: true });
  });
  const oldStart = handler(screen.getByRole('button', { name: t('ui.diplomacy.startWork') }));
  fireEvent.click(screen.getByRole('button', { name: t('ui.diplomacy.startWork') }));
  expect(getQueuedPlayerCommands(game)).toHaveLength(2);
  act(() => {
    expect(runOneDay().filter((event) => event.type === 'command.rejected')).toHaveLength(1);
  });
  expect(game.diplomacy.missions).toHaveLength(1);
  expect(game.diplomacy.missions[0]!.target).toBe('court');
  expect(validateState(game)).toEqual([]);
  tick({ ...stop, target: 'court' });
  expect(game.diplomacy.missions).toEqual([]);
  const before = structuredClone(game);
  act(oldStart);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(game).toEqual(before);
  fireEvent.click(screen.getByRole('button', { name: t('ui.diplomacy.startWork') }));
  expect(getQueuedPlayerCommands(game)).toEqual([start(OFF_ALPHA_BUSHO)]);
  expect(game).toEqual(before);
  act(() => {
    runOneDay();
  });
  expect(game.diplomacy.missions).toHaveLength(1);
  expect(game.diplomacy.missions[0]!.target).toBe(CLAN_BETA);
  expect(validateState(game)).toEqual([]);
});
