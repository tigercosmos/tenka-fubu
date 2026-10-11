import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { flushSync } from 'react-dom';
import { CaptiveModal } from '../../src/ui/screens/CaptiveModal';
import {
  getQueuedPlayerCommands,
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
} from '../../src/app/bridge';
import { bumpTickSeq, resetGameStoreForTests, store } from '../../src/app/store';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { validateState } from '../../src/core/state/invariants';
import { validateCommand } from '../../src/core/index';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { t } from '../../src/i18n/zh-TW';
import { buildTinyState, CASTLE_A1, OFF_ALPHA_BUSHO, OFF_BETA_BUSHO } from '../fixtures/tiny';

beforeEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
});
afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
});

function setup() {
  // A valid controlled captive fixture; no claim about the preceding capture campaign.
  const game = buildTinyState();
  const subject = game.officers[OFF_BETA_BUSHO]!;
  subject.status = 'captive';
  subject.capturedByClanId = game.meta.playerClanId;
  subject.locationCastleId = CASTLE_A1;
  expect(validateState(game)).toEqual([]);
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  uiStore.getState().actions.enqueueModal({
    id: 'captive',
    params: { officerId: subject.id },
    pausesTime: true,
  });
  const modal = uiStore.getState().modal!;
  render(<CaptiveModal officerId={subject.id} />);
  fireEvent.change(screen.getByRole('combobox', { name: t('ui.recruit.executor') }), {
    target: { value: OFF_ALPHA_BUSHO },
  });
  const command = {
    type: 'handleCaptive' as const,
    clanId: game.meta.playerClanId,
    officerId: subject.id,
    action: 'recruit' as const,
    executorId: OFF_ALPHA_BUSHO,
  };
  expect(validateCommand(game, command).ok).toBe(true);
  const native = screen.getByTestId('captive-modal').closest('[data-ui-dialog]');
  expect(native).toBeTruthy();
  return { game, subject, modal, native, command };
}

it('preserves the accepted queue but cannot publish old recruitment completion over a replaced executor preview', () => {
  const { game, modal, native, command } = setup();
  const originalExecutor = game.officers[OFF_ALPHA_BUSHO]!;
  const decoded = decodeSave(encodeSave(game, 123));
  if (!decoded.ok) throw new Error('Expected valid native captive snapshot');
  const replacement = decoded.saveFile.state.officers[OFF_ALPHA_BUSHO]!;
  expect(replacement).toEqual(originalExecutor);
  expect(replacement).not.toBe(originalExecutor);
  let replaced = false;
  const unsubscribe = store.subscribe((next, previous) => {
    if (!replaced && next.session.pendingCommandCount > previous.session.pendingCommandCount) {
      replaced = true;
      game.officers[OFF_ALPHA_BUSHO] = replacement;
      flushSync(() => bumpTickSeq());
    }
  });
  const before = structuredClone(game);
  try {
    fireEvent.click(screen.getByRole('button', { name: t('cmd.captive.recruit') }));
    expect(replaced).toBe(true);
    expect(game.officers[OFF_ALPHA_BUSHO]).toBe(replacement);
    expect(game).toEqual(before);
    expect(game.rng).toEqual(before.rng);
    expect(validateState(game)).toEqual([]);
    expect(getQueuedPlayerCommands(game)).toEqual([command]);
    expect(store.getState().session.pendingCommandCount).toBe(1);
    expect(screen.getByTestId('captive-modal').closest('[data-ui-dialog]')).toBe(native);
    expect({
      decisions: uiStore.getState().queuedDecisionIds,
      modal: uiStore.getState().modal,
    }).toEqual({ decisions: [], modal });
    expect(uiStore.getState().modal).toBe(modal);
  } finally {
    unsubscribe();
  }
});

it('still marks and closes the unchanged current recruitment preview exactly once, with normal-day settlement', () => {
  const { game, subject, command } = setup();
  const before = structuredClone(game);
  fireEvent.click(screen.getByRole('button', { name: t('cmd.captive.recruit') }));
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([command]);
  expect(uiStore.getState().queuedDecisionIds).toEqual([subject.id]);
  expect(uiStore.getState().modal).toBeNull();
  act(() => {
    runOneDay();
  });
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(game.time.day).toBe(before.time.day + 1);
  expect(validateState(game)).toEqual([]);
});
