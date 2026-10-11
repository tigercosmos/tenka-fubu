import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { flushSync } from 'react-dom';
import { CaptiveModal } from '../../src/ui/screens/CaptiveModal';
import { ConfirmDialog } from '../../src/ui/components';
import {
  getQueuedPlayerCommands,
  initializeBridgeSession,
  resetBridgeForTests,
} from '../../src/app/bridge';
import { resetGameStoreForTests, store } from '../../src/app/store';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { validateState } from '../../src/core/state/invariants';
import { t } from '../../src/i18n/zh-TW';
import { buildTinyState, CASTLE_A1, OFF_BETA_BUSHO } from '../fixtures/tiny';

const captured = vi.hoisted(() => ({
  cancel: null as (() => void) | null,
  confirm: null as (() => void) | null,
}));
// Transparent observation of actual component callbacks; native Dialog still renders.
vi.mock('../../src/ui/components/ConfirmDialog/ConfirmDialog', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../src/ui/components/ConfirmDialog/ConfirmDialog')>();
  return {
    ...original,
    ConfirmDialog: (props: Parameters<typeof original.ConfirmDialog>[0]) => {
      if (props.open) {
        captured.cancel = props.onCancel;
        captured.confirm = props.onConfirm;
      }
      return <original.ConfirmDialog {...props} />;
    },
  };
});

afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
});

it('does not publish or dismiss the captive parent after real queued dispatch synchronously revokes execution consent', () => {
  resetBridgeForTests();
  uiStore.getState().actions.reset();
  const game = buildTinyState();
  const captive = game.officers[OFF_BETA_BUSHO]!;
  captive.status = 'captive';
  captive.capturedByClanId = game.meta.playerClanId;
  captive.locationCastleId = CASTLE_A1;
  expect(validateState(game)).toEqual([]);
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  uiStore.getState().actions.enqueueModal({
    id: 'captive',
    params: { officerId: OFF_BETA_BUSHO },
    pausesTime: true,
  });
  const parent = uiStore.getState().modal;
  render(<CaptiveModal officerId={OFF_BETA_BUSHO} />);
  fireEvent.click(screen.getByRole('button', { name: t('cmd.captive.execute') }));
  const originalConfirm = captured.confirm!;
  const originalCancel = captured.cancel!;
  expect(screen.getAllByRole('dialog')).toHaveLength(2);
  const before = structuredClone(game);
  let revoked = false;
  const unsubscribe = store.subscribe((current, previous) => {
    if (!revoked && current.session.pendingCommandCount > previous.session.pendingCommandCount) {
      revoked = true;
      // React batches DOM removal until the outer act finishes; revocation must
      // be authoritative immediately, not depend on native DOM disappearing.
      originalCancel();
    }
  });
  try {
    act(() => originalConfirm());
  } finally {
    unsubscribe();
  }
  expect(revoked).toBe(true);
  expect(getQueuedPlayerCommands(game)).toHaveLength(1);
  expect(game).toEqual(before);
  expect(validateState(game)).toEqual([]);
  expect(uiStore.getState().modal).toBe(parent);
  expect(uiStore.getState().queuedDecisionIds).toEqual([]);
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
});

it('drains same-task foreign native insertion and removal before a retained confirmation can enqueue', () => {
  resetBridgeForTests();
  uiStore.getState().actions.reset();
  const game = buildTinyState();
  const captive = game.officers[OFF_BETA_BUSHO]!;
  captive.status = 'captive';
  captive.capturedByClanId = game.meta.playerClanId;
  captive.locationCastleId = CASTLE_A1;
  expect(validateState(game)).toEqual([]);
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  uiStore.getState().actions.enqueueModal({
    id: 'captive',
    params: { officerId: OFF_BETA_BUSHO },
    pausesTime: true,
  });
  const parent = uiStore.getState().modal;
  render(<CaptiveModal officerId={OFF_BETA_BUSHO} />);
  fireEvent.click(screen.getByRole('button', { name: t('cmd.captive.execute') }));
  const originalConfirm = captured.confirm!;
  const before = structuredClone(game);
  // No await/microtask here: the native dialog genuinely mounts and unmounts,
  // then the callback runs before MutationObserver's asynchronous delivery.
  act(() => {
    const foreign = flushSync(() =>
      render(
        <ConfirmDialog
          open
          title="Transient foreign owner"
          message="Another subject"
          onCancel={() => {}}
          onConfirm={() => {}}
        />,
      ),
    );
    expect(screen.getByRole('dialog', { name: 'Transient foreign owner' })).toBeTruthy();
    flushSync(() => foreign.unmount());
    originalConfirm();
  });
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(uiStore.getState().queuedDecisionIds).toEqual([]);
  expect(uiStore.getState().modal).toBe(parent);
  expect(game).toEqual(before);
  expect(validateState(game)).toEqual([]);
});
