import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { flushSync } from 'react-dom';
import { TaimeiPanel } from '../../src/ui/screens/TaimeiPanel';
import { bumpTickSeq, resetGameStoreForTests, setGame, store } from '../../src/app/store';
import {
  getQueuedPlayerCommands,
  dispatchCommand,
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
} from '../../src/app/bridge';
import { TAIMEI_CATALOG } from '../../src/core/systems/events/taimeiCatalog';
import { validateState } from '../../src/core/state/invariants';
import { validateCommand } from '../../src/core/index';
import { CLAN_BETA } from '../fixtures/tiny';
import { t } from '../../src/i18n/zh-TW';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { ConfirmDialog } from '../../src/ui/components';
import { buildTinyState, CLAN_ALPHA } from '../fixtures/tiny';

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
function gameFixture() {
  const game = buildTinyState();
  game.clans[CLAN_ALPHA]!.prestige = 1000;
  expect(validateState(game)).toEqual([]);
  return game;
}
function handler(button: HTMLElement): () => void {
  const key = Object.keys(button).find((k) => k.startsWith('__reactProps$'));
  expect(key).toBeTruthy();
  const props = (button as unknown as Record<string, { onClick?: () => void }>)[key!];
  expect(props?.onClick).toBeTypeOf('function');
  return props!.onClick!;
}
function setup(confirming = true) {
  const game = gameFixture();
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  store.getState().actions.setSpeed('x2');
  store.getState().actions.requestPause('user');
  uiStore.getState().actions.openPanel('taimei');
  const view = render(<TaimeiPanel />);
  const detail = screen.getByRole('region', { name: t('ui.taimei.detail') });
  const invokeButton = within(detail).getByRole('button', { name: t('ui.taimei.invoke') });
  const invoke = handler(invokeButton);
  const close = handler(screen.getByRole('button', { name: t('ui.taimei.title') }));
  if (confirming) fireEvent.click(invokeButton);
  const dialog = confirming ? screen.getByRole('dialog') : null;
  const confirm = dialog
    ? handler(within(dialog).getByRole('button', { name: t('ui.common.confirm') }))
    : null;
  const cancel = dialog
    ? handler(within(dialog).getByRole('button', { name: t('ui.common.cancel') }))
    : null;
  return { game, view, invoke, close, confirm, cancel };
}
it.each(['replacement', 'unmount', 'cancel'] as const)(
  'rejects the actual retained native confirmation after %s',
  (blocker) => {
    const { game, view, confirm, cancel } = setup();
    let current = game;
    if (blocker === 'replacement') {
      current = gameFixture();
      act(() => {
        setGame(current);
        initializeBridgeSession(current);
      });
    }
    if (blocker === 'unmount') view.unmount();
    if (blocker === 'cancel') act(() => cancel!());
    const before = structuredClone(current);
    const oldBefore = structuredClone(game);
    const modal = uiStore.getState().modal;
    act(() => confirm!());
    expect(current).toEqual(before);
    expect(game).toEqual(oldBefore);
    expect(getQueuedPlayerCommands(current)).toEqual([]);
    expect(uiStore.getState().modal).toBe(modal);
  },
);

it.each(['confirm', 'cancel'] as const)(
  'rejects retained %s against a new same-owner FIFO descriptor',
  (action) => {
    const { game, confirm, cancel } = setup();
    const old = uiStore.getState().modal;
    act(() => {
      uiStore.getState().actions.closeModal();
      uiStore.getState().actions.enqueueModal({
        id: 'confirm',
        params: { owner: 'taimei', taimeiId: TAIMEI_CATALOG[1]!.id, clanId: CLAN_ALPHA },
        pausesTime: true,
      });
    });
    const current = uiStore.getState().modal;
    expect(current).not.toBe(old);
    const before = structuredClone(game);
    act(() => (action === 'confirm' ? confirm! : cancel!)());
    expect(uiStore.getState().modal).toBe(current);
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
  },
);

it('irrevocably revokes consent when the original modal is removed then restored', () => {
  const { game, confirm } = setup();
  const original = uiStore.getState().modal!;
  act(() => {
    uiStore.getState().actions.closeModal();
    expect(uiStore.getState().modal).toBeNull();
    uiStore.getState().actions.enqueueModal(original);
  });
  expect(uiStore.getState().modal).toBe(original);
  const before = structuredClone(game);
  act(() => confirm!());
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(uiStore.getState().modal).toBe(original);
});

it.each(['title', 'fatal', 'viewport', 'gameOver', 'modalParams', 'playerClan'] as const)(
  'rejects retained confirmation after fresh %s changes',
  (blocker) => {
    const { game, confirm } = setup();
    act(() => {
      if (blocker === 'title') store.getState().actions.setScreen('title');
      if (blocker === 'fatal')
        store.getState().actions.setFatalError({ code: 'test', message: 'Fatal', stack: '' });
      if (blocker === 'viewport') store.getState().actions.setViewportBlocked(true);
      if (blocker === 'gameOver') game.meta.gameOver = { kind: 'defeat', endingId: 'no-castle' };
      if (blocker === 'modalParams')
        uiStore.getState().modal!.params.taimeiId = TAIMEI_CATALOG[1]!.id;
      if (blocker === 'playerClan') game.meta.playerClanId = CLAN_BETA;
    });
    const before = structuredClone(game);
    const modal = uiStore.getState().modal;
    act(() => confirm!());
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    expect(uiStore.getState().modal).toBe(modal);
  },
);

it.each(['replacement', 'unmount', 'close', 'fifo', 'native', 'title'] as const)(
  'rejects retained invoke after %s without acquiring new consent',
  (blocker) => {
    const { game, view, invoke } = setup(false);
    let current = game;
    if (blocker === 'replacement') {
      current = gameFixture();
      act(() => {
        setGame(current);
        initializeBridgeSession(current);
      });
    }
    if (blocker === 'unmount') view.unmount();
    if (blocker === 'close') act(() => uiStore.getState().actions.closePanelById('taimei'));
    if (blocker === 'fifo')
      act(() =>
        uiStore.getState().actions.enqueueModal({ id: 'systemMenu', params: {}, pausesTime: true }),
      );
    if (blocker === 'native')
      render(
        <ConfirmDialog
          open
          title="Unrelated consent"
          message="Other owner"
          onConfirm={() => {}}
          onCancel={() => {}}
        />,
      );
    if (blocker === 'title') act(() => store.getState().actions.setScreen('title'));
    const before = structuredClone(current);
    const modal = uiStore.getState().modal;
    const panels = uiStore.getState().panelStack;
    act(() => invoke());
    expect(current).toEqual(before);
    expect(getQueuedPlayerCommands(current)).toEqual([]);
    expect(uiStore.getState().modal).toBe(modal);
    expect(uiStore.getState().panelStack).toBe(panels);
  },
);

it.each(['confirm', 'cancel'] as const)(
  'rejects actual retained %s below an unrelated native dialog',
  (action) => {
    const { game, confirm, cancel } = setup();
    render(
      <ConfirmDialog
        open
        title="Unrelated consent"
        message="Other owner"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getAllByRole('dialog')).toHaveLength(2);
    const before = structuredClone(game);
    const modal = uiStore.getState().modal;
    act(() => (action === 'confirm' ? confirm! : cancel!)());
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    expect(uiStore.getState().modal).toBe(modal);
    expect(screen.getByRole('dialog', { name: 'Unrelated consent' })).toBeTruthy();
  },
);

it('rejects an old panel close after actual same-game close and reopen', () => {
  const { game, close } = setup(false);
  const old = uiStore.getState().panelStack.at(-1);
  act(() => {
    uiStore.getState().actions.closePanelById('taimei');
    uiStore.getState().actions.openPanel('taimei');
  });
  const current = uiStore.getState().panelStack.at(-1);
  expect(current).not.toBe(old);
  const before = structuredClone(game);
  act(() => close());
  expect(uiStore.getState().panelStack.at(-1)).toBe(current);
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});

it('keeps ordinary-tick consent alive, confirms exactly once, and settles only at a real normal day', () => {
  const { game, confirm } = setup();
  const dialog = screen.getByRole('dialog');
  const modal = uiStore.getState().modal;
  act(() => bumpTickSeq());
  expect(screen.getByRole('dialog')).toBe(dialog);
  expect(uiStore.getState().modal).toBe(modal);
  const before = structuredClone(game);
  act(() => {
    confirm!();
    confirm!();
  });
  expect(game).toEqual(before);
  const def = TAIMEI_CATALOG[0]!;
  expect(getQueuedPlayerCommands(game)).toEqual([
    { type: 'invokeTaimei', clanId: CLAN_ALPHA, taimeiId: def.id },
  ]);
  act(() => {
    runOneDay();
  });
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(game.clans[CLAN_ALPHA]!.taimei.activeTaimeiId).toBe(def.id);
  expect(game.clans[CLAN_ALPHA]!.prestige).toBe(
    before.clans[CLAN_ALPHA]!.prestige - def.prestigeCost,
  );
  expect(validateState(game)).toEqual([]);
  expect(store.getState().session.speed).toBe('paused');
  expect(store.getState().session.lastPauseReason).toBe('user');
});

it('fresh pending invocation prevents a retained confirm from queuing a duplicate', () => {
  const { game, confirm } = setup();
  const command = {
    type: 'invokeTaimei' as const,
    clanId: CLAN_ALPHA,
    taimeiId: TAIMEI_CATALOG[0]!.id,
  };
  act(() => {
    expect(dispatchCommand(command)).toEqual({ ok: true });
  });
  const before = structuredClone(game);
  act(() => confirm!());
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([command]);
});

it('freshly invalid prestige at confirmation never queues or spends resources', () => {
  const { game, confirm } = setup();
  game.clans[CLAN_ALPHA]!.prestige = 0;
  const before = structuredClone(game);
  act(() => confirm!());
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  const verdict = validateCommand(game, {
    type: 'invokeTaimei',
    clanId: CLAN_ALPHA,
    taimeiId: TAIMEI_CATALOG[0]!.id,
  });
  expect(verdict.ok).toBe(false);
  if (!verdict.ok)
    expect(within(screen.getByRole('dialog')).getByRole('alert').textContent).toBe(
      t(verdict.reasonKey, verdict.params),
    );
});

it('does not close old consent when a real dispatch publication mounts a new native owner', () => {
  const { game, confirm } = setup();
  const modal = uiStore.getState().modal;
  const before = structuredClone(game);
  let mounted = false;
  const unsubscribe = store.subscribe((next, previous) => {
    if (!mounted && next.session.pendingCommandCount > previous.session.pendingCommandCount) {
      mounted = true;
      flushSync(() =>
        render(
          <ConfirmDialog
            open
            title="New native owner"
            message="New consent"
            onConfirm={() => {}}
            onCancel={() => {}}
          />,
        ),
      );
      expect(screen.getByRole('dialog', { name: 'New native owner' })).toBeTruthy();
    }
  });
  try {
    act(() => confirm!());
    expect(mounted).toBe(true);
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toHaveLength(1);
    expect(uiStore.getState().modal).toBe(modal);
    expect(screen.getAllByRole('dialog')).toHaveLength(2);
  } finally {
    unsubscribe();
  }
});
