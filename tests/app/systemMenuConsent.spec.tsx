import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync } from 'react-dom';
import { ConfirmDialog } from '../../src/ui/components';
import { SystemMenuHost } from '../../src/ui/screens/SystemMenuHost';
import { resetGameStoreForTests, setGame, store } from '../../src/app/store';
import { initializeBridgeSession, resetBridgeForTests } from '../../src/app/bridge';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { validateState } from '../../src/core/state/invariants';
import { t } from '../../src/i18n/zh-TW';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { buildTinyState } from '../fixtures/tiny';

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
  const key = Object.keys(button).find((k) => k.startsWith('__reactProps$'));
  expect(key).toBeTruthy();
  const props = (button as unknown as Record<string, { onClick?: () => void }>)[key!];
  expect(props?.onClick).toBeTypeOf('function');
  return props!.onClick!;
}
function setup() {
  const game = buildTinyState();
  expect(validateState(game)).toEqual([]);
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  store.getState().actions.requestPause('user');
  const modal = { id: 'systemMenu' as const, params: {}, pausesTime: false };
  uiStore.getState().actions.enqueueModal(modal);
  const onReturnToTitle = vi.fn();
  const onOpenSaveLoad = vi.fn();
  const view = render(
    <SystemMenuHost onReturnToTitle={onReturnToTitle} onOpenSaveLoad={onOpenSaveLoad} />,
  );
  const resume = handler(screen.getByRole('button', { name: t('ui.system.resume') }));
  return { game, modal, onReturnToTitle, onOpenSaveLoad, view, resume };
}
function titleConsent() {
  fireEvent.click(screen.getByRole('button', { name: t('ui.system.toTitle') }));
  const dialogs = screen.getAllByRole('dialog');
  const dialog = dialogs[dialogs.length - 1]!;
  return {
    dialog,
    confirm: handler(within(dialog).getByRole('button', { name: t('ui.common.confirm') })),
    cancel: handler(within(dialog).getByRole('button', { name: t('ui.common.cancel') })),
  };
}

it('rejects retained title confirmation after same-ID native save reload', () => {
  const { game, onReturnToTitle } = setup();
  fireEvent.click(screen.getByRole('button', { name: t('ui.system.toTitle') }));
  const dialogs = screen.getAllByRole('dialog');
  const confirm = handler(
    within(dialogs[dialogs.length - 1]!).getByRole('button', {
      name: t('ui.common.confirm'),
    }),
  );
  const decoded = decodeSave(encodeSave(game, 42));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error(decoded.code);
  const restored = decoded.saveFile.state;
  act(() => {
    setGame(restored);
    initializeBridgeSession(restored, decoded.saveFile.pendingCommands, { loaded: true });
  });
  const before = structuredClone(restored);
  act(() => confirm());
  expect(onReturnToTitle).not.toHaveBeenCalled();
  expect(restored).toEqual(before);
});

it.each(['unmount', 'cancel', 'replace', 'remove-restore', 'native', 'title'] as const)(
  'rejects retained title confirmation after %s',
  (change) => {
    const { game, modal, view, onReturnToTitle } = setup();
    const { confirm, cancel } = titleConsent();
    act(() => {
      if (change === 'unmount') view.unmount();
      if (change === 'cancel') cancel();
      if (change === 'replace' || change === 'remove-restore') {
        uiStore.getState().actions.closeModal();
        uiStore
          .getState()
          .actions.enqueueModal(change === 'remove-restore' ? modal : { ...modal, params: {} });
      }
      if (change === 'native')
        render(
          <ConfirmDialog
            open
            title="Other"
            message="Other"
            onCancel={() => {}}
            onConfirm={() => {}}
          />,
        );
      if (change === 'title') store.getState().actions.setScreen('title');
    });
    const before = structuredClone(game);
    const current = uiStore.getState().modal;
    act(() => confirm());
    expect(onReturnToTitle).not.toHaveBeenCalled();
    expect(game).toEqual(before);
    expect(uiStore.getState().modal).toBe(current);
  },
);

it('renders title consent as the single native dialog without adding a FIFO child', async () => {
  const { game, modal } = setup();
  const before = structuredClone(game);
  const { cancel } = titleConsent();
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(uiStore.getState().modal).toBe(modal);
  expect(uiStore.getState().modalQueue).toEqual([]);
  await waitFor(() =>
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: t('ui.common.cancel') }),
    ),
  );
  act(() => cancel());
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(screen.getByRole('button', { name: t('ui.system.resume') }).isConnected).toBe(true);
  expect(game).toEqual(before);
});

it('consumes a title request once and does not revive its callback after cancel/reopen', () => {
  const { onReturnToTitle } = setup();
  const old = titleConsent();
  act(() => old.cancel());
  const fresh = titleConsent();
  act(() => old.confirm());
  expect(onReturnToTitle).not.toHaveBeenCalled();
  act(() => {
    fresh.confirm();
    fresh.confirm();
  });
  expect(onReturnToTitle).toHaveBeenCalledTimes(1);
});

it('keeps a queued required arrival behind the parent and Resume advances exactly once', () => {
  const { game, modal, resume } = setup();
  const required = { id: 'monthSummary' as const, params: {}, pausesTime: true };
  act(() => uiStore.getState().actions.enqueueModal(required));
  expect(uiStore.getState().modal).toBe(modal);
  expect(uiStore.getState().modalQueue).toEqual([required]);
  const before = structuredClone(game);
  act(() => {
    resume();
    resume();
  });
  expect(uiStore.getState().modal).toBe(required);
  expect(uiStore.getState().modalQueue).toEqual([]);
  expect(store.getState().session.lastPauseReason).toBe('user');
  expect(game).toEqual(before);
});

it('retained save/settings actions cannot act after parent replacement', () => {
  const { onOpenSaveLoad } = setup();
  const save = handler(screen.getByRole('button', { name: t('ui.system.save') }));
  const settings = handler(screen.getByRole('button', { name: t('ui.system.settings') }));
  const replacement = { id: 'systemMenu' as const, params: {}, pausesTime: false };
  act(() => {
    uiStore.getState().actions.closeModal();
    uiStore.getState().actions.enqueueModal(replacement);
  });
  act(() => {
    save();
    settings();
  });
  expect(onOpenSaveLoad).not.toHaveBeenCalled();
  expect(screen.queryByTestId('settings-panel')).toBeNull();
  expect(uiStore.getState().modal).toBe(replacement);
});

it('old settings Back does not discard a newly opened title subview', () => {
  setup();
  fireEvent.click(screen.getByRole('button', { name: t('ui.system.settings') }));
  const back = handler(screen.getByRole('button', { name: t('ui.common.back') }));
  act(() => back());
  const { dialog } = titleConsent();
  act(() => back());
  expect(dialog.isConnected).toBe(true);
  expect(screen.getByRole('button', { name: t('ui.common.confirm') }).isConnected).toBe(true);
});

it('does not close a replacement owner published synchronously by the title port', () => {
  const { view } = setup();
  const replacement = { id: 'systemMenu' as const, params: {}, pausesTime: false };
  const port = vi.fn(() =>
    flushSync(() => {
      uiStore.getState().actions.closeModal();
      uiStore.getState().actions.enqueueModal(replacement);
    }),
  );
  view.rerender(<SystemMenuHost onReturnToTitle={port} />);
  const { confirm } = titleConsent();
  act(() => confirm());
  expect(port).toHaveBeenCalledTimes(1);
  expect(uiStore.getState().modal).toBe(replacement);
  expect(screen.getByRole('button', { name: t('ui.system.resume') }).isConnected).toBe(true);
});

it.each(['fatal', 'viewport', 'gameOver'] as const)(
  'keeps owned return-to-title recovery available during %s',
  (condition) => {
    const { game, onReturnToTitle } = setup();
    const { confirm } = titleConsent();
    act(() => {
      if (condition === 'fatal')
        store.getState().actions.setFatalError({ code: 'TEST', message: 'test', stack: '' });
      if (condition === 'viewport') store.getState().actions.setViewportBlocked(true);
      if (condition === 'gameOver') game.meta.gameOver = { kind: 'defeat', endingId: 'no-castle' };
    });
    act(() => confirm());
    expect(onReturnToTitle).toHaveBeenCalledTimes(1);
  },
);

it.each(['save', 'load'] as const)(
  'keeps the menu usable after a %s port that leaves the subview unchanged',
  (mode) => {
    const { onOpenSaveLoad, game } = setup();
    const before = structuredClone(game);
    fireEvent.click(
      screen.getByRole('button', {
        name: t(mode === 'save' ? 'ui.system.save' : 'ui.system.load'),
      }),
    );
    expect(onOpenSaveLoad).toHaveBeenCalledWith(mode);
    fireEvent.click(screen.getByRole('button', { name: t('ui.system.settings') }));
    expect(screen.getByTestId('settings-panel').isConnected).toBe(true);
    expect(game).toEqual(before);
  },
);

it('does not let retained menu actions operate below an unrelated native dialog', () => {
  const { onReturnToTitle, onOpenSaveLoad, resume, modal } = setup();
  const title = handler(screen.getByRole('button', { name: t('ui.system.toTitle') }));
  const save = handler(screen.getByRole('button', { name: t('ui.system.save') }));
  const settings = handler(screen.getByRole('button', { name: t('ui.system.settings') }));
  render(
    <ConfirmDialog open title="Other" message="Other" onCancel={() => {}} onConfirm={() => {}} />,
  );
  act(() => {
    title();
    save();
    settings();
    resume();
  });
  expect(onReturnToTitle).not.toHaveBeenCalled();
  expect(onOpenSaveLoad).not.toHaveBeenCalled();
  expect(uiStore.getState().modal).toBe(modal);
  expect(screen.queryByTestId('settings-panel')).toBeNull();
  expect(screen.queryByRole('button', { name: t('ui.common.confirm') })).not.toBeNull();
  expect(screen.getAllByRole('dialog')).toHaveLength(2);
});

it('cannot revive a retained Resume after the exact parent is removed and restored', () => {
  const { modal, resume } = setup();
  act(() => {
    uiStore.getState().actions.closeModal();
    uiStore.getState().actions.enqueueModal(modal);
  });
  const afterRevocation = uiStore.getState().modal;
  act(() => resume());
  expect(uiStore.getState().modal).toBe(afterRevocation);
});

it('does not call retained external system-panel Back after parent replacement', () => {
  const { view } = setup();
  const onBack = vi.fn();
  view.rerender(
    <SystemMenuHost systemPanel={{ title: 'Saved games', content: <p>Slots</p>, onBack }} />,
  );
  const dialog = screen.getByRole('dialog');
  const close = handler(within(dialog).getByRole('button', { name: 'Saved games' }));
  const replacement = { id: 'systemMenu' as const, params: {}, pausesTime: false };
  act(() => {
    uiStore.getState().actions.closeModal();
    uiStore.getState().actions.enqueueModal(replacement);
  });
  act(() => close());
  expect(onBack).not.toHaveBeenCalled();
  expect(uiStore.getState().modal).toBe(replacement);
});

it('rejects retained Back after an external system panel is replaced under the same title', () => {
  const { view, modal, game } = setup();
  const oldBack = vi.fn();
  const newBack = vi.fn();
  view.rerender(
    <SystemMenuHost
      systemPanel={{ title: 'Saved games', content: <p>Old slots</p>, onBack: oldBack }}
    />,
  );
  const close = handler(
    within(screen.getByRole('dialog')).getByRole('button', { name: 'Saved games' }),
  );
  view.rerender(
    <SystemMenuHost
      systemPanel={{ title: 'Saved games', content: <p>New slots</p>, onBack: newBack }}
    />,
  );
  const before = structuredClone(game);
  act(() => close());
  expect(oldBack).not.toHaveBeenCalled();
  expect(newBack).not.toHaveBeenCalled();
  expect(screen.getByText('New slots').isConnected).toBe(true);
  expect(uiStore.getState().modal).toBe(modal);
  expect(game).toEqual(before);
});

it('does not let retained Resume close a replacement menu owner', () => {
  const { resume } = setup();
  const replacement = { id: 'systemMenu' as const, params: {}, pausesTime: false };
  act(() => {
    uiStore.getState().actions.closeModal();
    uiStore.getState().actions.enqueueModal(replacement);
  });
  act(() => resume());
  expect(uiStore.getState().modal).toBe(replacement);
});
