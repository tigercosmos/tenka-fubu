import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { flushSync } from 'react-dom';
import { CorpsScreen } from '../../src/ui/screens/CorpsScreen';
import { bumpTickSeq, resetGameStoreForTests, setGame, store } from '../../src/app/store';
import {
  dispatchCommand,
  getQueuedPlayerCommands,
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
} from '../../src/app/bridge';
import { validateState } from '../../src/core/state/invariants';
import { BAL } from '../../src/core/balance';
import { t } from '../../src/i18n/zh-TW';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { ConfirmDialog } from '../../src/ui/components';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CLAN_ALPHA,
  OFF_ALPHA_LORD,
  OFF_ALPHA_BUSHO,
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
  const key = Object.keys(button).find((k) => k.startsWith('__reactProps$'));
  expect(key).toBeTruthy();
  const props = (button as unknown as Record<string, { onClick?: () => void }>)[key!];
  expect(props?.onClick).toBeTypeOf('function');
  return props!.onClick!;
}
function setup(confirming = true, earnWallet = false, nonRulingCommander = false) {
  const game = buildTinyState();
  const commanderId = nonRulingCommander ? OFF_ALPHA_BUSHO : OFF_ALPHA_LORD;
  if (nonRulingCommander) game.officers[commanderId]!.rank = 'karo';
  expect(validateState(game)).toEqual([]);
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  store.getState().actions.requestPause('user');
  expect(
    dispatchCommand({
      type: 'createCorps',
      clanId: CLAN_ALPHA,
      corpsLeaderId: commanderId,
      castleIds: [CASTLE_A1, CASTLE_A2],
      directive: 'hold',
      targetNodeId: null,
    }),
  ).toEqual({ ok: true });
  act(() => {
    runOneDay();
  });
  expect(validateState(game)).toEqual([]);
  const corps = Object.values(game.corps)[0]!;
  expect(corps).toBeTruthy();
  if (earnWallet) {
    act(() => {
      for (let day = 0; day < 30; day++) runOneDay();
    });
    expect(corps.gold).toBeGreaterThan(0);
    expect(validateState(game)).toEqual([]);
    // Finish warmup notice ownership before opening this distinct local consent.
    uiStore.getState().actions.reset();
  }
  uiStore.getState().actions.openPanel('corps');
  const view = render(<CorpsScreen />);
  fireEvent.click(
    within(screen.getByRole('navigation', { name: t('ui.corps.title') })).getByRole('button', {
      name: /2/,
    }),
  );
  const dissolveButton = screen.getByRole('button', { name: t('ui.corps.dissolve') });
  const invoke = handler(dissolveButton);
  const close = handler(screen.getByRole('button', { name: t('ui.corps.title') }));
  if (confirming) fireEvent.click(dissolveButton);
  const dialog = confirming ? screen.getByRole('dialog') : null;
  const confirm = dialog
    ? handler(within(dialog).getByRole('button', { name: t('ui.common.confirm') }))
    : () => {};
  const cancel = dialog
    ? handler(within(dialog).getByRole('button', { name: t('ui.common.cancel') }))
    : () => {};
  return { game, corps, commanderId, view, invoke, close, confirm, cancel };
}

it('rejects retained actual dissolution consent after same-ID game replacement', () => {
  const { game, confirm } = setup();
  const replacement = structuredClone(game);
  act(() => {
    setGame(replacement);
    initializeBridgeSession(replacement);
  });
  const before = structuredClone(replacement);
  act(() => confirm());
  expect(replacement).toEqual(before);
  expect(getQueuedPlayerCommands(replacement)).toEqual([]);
  expect(validateState(replacement)).toEqual([]);
});

it.each([
  'unmount',
  'cancel',
  'selection',
  'subject',
  'panel',
  'fifo',
  'native',
  'title',
  'fatal',
  'viewport',
  'gameOver',
] as const)('rejects retained dissolution confirmation after %s', (blocker) => {
  const { game, corps, view, confirm, cancel } = setup();
  act(() => {
    if (blocker === 'unmount') view.unmount();
    if (blocker === 'cancel') cancel();
    if (blocker === 'selection') {
      cancel();
      fireEvent.click(screen.getByRole('button', { name: t('ui.corps.create') }));
    }
    if (blocker === 'subject') {
      game.corps[corps.id] = structuredClone(corps);
      bumpTickSeq();
    }
    if (blocker === 'panel') {
      uiStore.getState().actions.closePanelById('corps');
      uiStore.getState().actions.openPanel('corps');
    }
    if (blocker === 'fifo') {
      const owned = uiStore.getState().modal!;
      uiStore.getState().actions.enqueueModal({ id: 'systemMenu', params: {}, pausesTime: true });
      uiStore.getState().actions.closeOwnedModal(owned, { resume: false, expectedGame: game });
      expect(uiStore.getState().modal?.id).toBe('systemMenu');
    }
    if (blocker === 'native')
      render(
        <ConfirmDialog
          open
          title="Other owner"
          message="Unrelated consent"
          onConfirm={() => {}}
          onCancel={() => {}}
        />,
      );
    if (blocker === 'title') store.getState().actions.setScreen('title');
    if (blocker === 'fatal')
      store.getState().actions.setFatalError({ code: 'test', message: 'Fatal', stack: '' });
    if (blocker === 'viewport') store.getState().actions.setViewportBlocked(true);
    if (blocker === 'gameOver') game.meta.gameOver = { kind: 'defeat', endingId: 'no-castle' };
  });
  const before = structuredClone(game);
  const modal = uiStore.getState().modal;
  const panels = uiStore.getState().panelStack;
  act(() => confirm());
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(uiStore.getState().modal).toBe(modal);
  expect(uiStore.getState().panelStack).toBe(panels);
});

it.each(['unmount', 'panel', 'fifo', 'native', 'title'] as const)(
  'rejects retained dissolution invoke after %s',
  (blocker) => {
    const { game, view, invoke } = setup(false);
    act(() => {
      if (blocker === 'unmount') view.unmount();
      if (blocker === 'panel') uiStore.getState().actions.closePanelById('corps');
      if (blocker === 'fifo')
        uiStore.getState().actions.enqueueModal({ id: 'systemMenu', params: {}, pausesTime: true });
      if (blocker === 'native')
        render(
          <ConfirmDialog
            open
            title="Other owner"
            message="Unrelated consent"
            onConfirm={() => {}}
            onCancel={() => {}}
          />,
        );
      if (blocker === 'title') store.getState().actions.setScreen('title');
    });
    const before = structuredClone(game);
    const dialogs = screen.queryAllByRole('dialog');
    act(() => invoke());
    expect(screen.queryAllByRole('dialog')).toEqual(dialogs);
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
  },
);

it('cannot use canceled confirmation after a new consent opens', () => {
  const { game, confirm, cancel } = setup();
  act(() => cancel());
  fireEvent.click(screen.getByRole('button', { name: t('ui.corps.dissolve') }));
  const dialog = screen.getByRole('dialog');
  const before = structuredClone(game);
  act(() => confirm());
  expect(screen.getByRole('dialog')).toBe(dialog);
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});

it('rejects an old cancel against the new consent request', () => {
  const { game, cancel } = setup();
  act(() => cancel());
  fireEvent.click(screen.getByRole('button', { name: t('ui.corps.dissolve') }));
  const dialog = screen.getByRole('dialog');
  const before = structuredClone(game);
  act(() => cancel());
  expect(screen.getByRole('dialog')).toBe(dialog);
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});

it('does not cancel owned consent underneath another actual native dialog', () => {
  const { game, cancel } = setup();
  const owned = screen.getByRole('dialog');
  render(
    <ConfirmDialog
      open
      title="Other owner"
      message="Unrelated consent"
      onConfirm={() => {}}
      onCancel={() => {}}
    />,
  );
  const before = structuredClone(game);
  act(() => cancel());
  expect(screen.getAllByRole('dialog')).toContain(owned);
  expect(screen.getAllByRole('dialog')).toHaveLength(2);
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});

it('rejects fresh unnotified missing corps through central command eligibility', () => {
  const { game, corps, confirm } = setup();
  delete game.corps[corps.id];
  // Deliberately defensive invalid input: no valid-state claim for orphaned castle links.
  const before = structuredClone(game);
  act(() => confirm());
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});

it('does not close old consent when real dispatch publication mounts a new native owner', () => {
  const { game, confirm } = setup();
  const owned = screen.getByRole('dialog');
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
    act(() => confirm());
    expect(mounted).toBe(true);
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toHaveLength(1);
    expect(screen.getAllByRole('dialog')).toContain(owned);
    expect(screen.getAllByRole('dialog')).toHaveLength(2);
  } finally {
    unsubscribe();
  }
});

it('preserves new same-action consent opened synchronously during the old dispatch', () => {
  const { game, confirm, cancel, invoke } = setup();
  const oldDialog = screen.getByRole('dialog');
  let replacement: HTMLElement | null = null;
  const unsubscribe = store.subscribe((next, previous) => {
    if (
      replacement === null &&
      next.session.pendingCommandCount > previous.session.pendingCommandCount
    ) {
      flushSync(() => cancel());
      expect(screen.queryByRole('dialog')).toBeNull();
      flushSync(() => invoke());
      replacement = screen.getByRole('dialog');
      expect(replacement).not.toBe(oldDialog);
    }
  });
  const before = structuredClone(game);
  try {
    act(() => confirm());
    expect(replacement).not.toBeNull();
    expect(screen.getByRole('dialog')).toBe(replacement);
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toHaveLength(1);
  } finally {
    unsubscribe();
  }
});

it('preserves the new panel against a retained old close callback', () => {
  const { game, close } = setup(false);
  act(() => {
    uiStore.getState().actions.closePanelById('corps');
    uiStore.getState().actions.openPanel('corps');
  });
  const panel = uiStore.getState().panelStack.at(-1);
  const before = structuredClone(game);
  act(() => close());
  expect(uiStore.getState().panelStack.at(-1)).toBe(panel);
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});

it('keeps ordinary tick consent stable and refunds a real wallet only at the exact-once normal-day settlement', () => {
  const { game, corps, commanderId, confirm } = setup(true, true, true);
  const dialog = screen.getByRole('dialog');
  act(() => bumpTickSeq());
  expect(screen.getByRole('dialog')).toBe(dialog);
  expect(validateState(game)).toEqual([]);
  expect(corps.gold).toBeGreaterThan(0);
  const before = structuredClone(game);
  act(() => {
    confirm();
    confirm();
  });
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([
    { type: 'dissolveCorps', clanId: CLAN_ALPHA, corpsId: corps.id },
  ]);
  act(() => {
    runOneDay();
  });
  expect(game.corps[corps.id]).toBeUndefined();
  expect(game.clans[CLAN_ALPHA]!.gold).toBe(
    before.clans[CLAN_ALPHA]!.gold + before.corps[corps.id]!.gold,
  );
  for (const id of [CASTLE_A1, CASTLE_A2])
    expect(game.castles[id]).toMatchObject({ corpsId: null, directControl: true });
  expect(game.officers[commanderId]!.status).toBe('serving');
  expect(game.officers[commanderId]!.loyalty).toBe(
    before.officers[commanderId]!.loyalty - BAL.loyaltyDismiss,
  );
  expect(validateState(game)).toEqual([]);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(store.getState().session.speed).toBe('paused');
  expect(store.getState().session.lastPauseReason).toBe('user');
});
