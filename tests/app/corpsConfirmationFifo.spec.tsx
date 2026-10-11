import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
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
import { t } from '../../src/i18n/zh-TW';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { buildTinyState, CASTLE_A1, CASTLE_A2, CLAN_ALPHA, OFF_ALPHA_LORD } from '../fixtures/tiny';

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
function setup(running = false) {
  const game = buildTinyState();
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  store.getState().actions.requestPause('user');
  expect(
    dispatchCommand({
      type: 'createCorps',
      clanId: CLAN_ALPHA,
      corpsLeaderId: OFF_ALPHA_LORD,
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
  if (running) store.getState().actions.setSpeed('x2');
  uiStore.getState().actions.openPanel('corps');
  const view = render(<CorpsScreen />);
  fireEvent.click(
    within(screen.getByRole('navigation', { name: t('ui.corps.title') })).getAllByRole(
      'button',
    )[1]!,
  );
  const invoke = handler(screen.getByRole('button', { name: t('ui.corps.dissolve') }));
  fireEvent.click(screen.getByRole('button', { name: t('ui.corps.dissolve') }));
  const dialog = screen.getByRole('dialog');
  const confirm = handler(within(dialog).getByRole('button', { name: t('ui.common.confirm') }));
  const cancel = handler(within(dialog).getByRole('button', { name: t('ui.common.cancel') }));
  return { game, corps, view, invoke, confirm, cancel };
}

function requiredArrival() {
  return { id: 'monthSummary' as const, params: { summaryKey: 'required-next' }, pausesTime: true };
}

it('owns a nonpausing confirmation FIFO slot and keeps the next required arrival waiting', () => {
  const { game } = setup();
  const before = structuredClone(game);
  const owned = uiStore.getState().modal;
  expect(owned).toMatchObject({ id: 'confirm', params: { owner: 'corps' }, pausesTime: false });
  const arrival = requiredArrival();
  act(() => uiStore.getState().actions.enqueueModal(arrival));
  expect(uiStore.getState().modal).toBe(owned);
  expect(uiStore.getState().modalQueue).toEqual([arrival]);
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  expect(game).toEqual(before);
  expect(store.getState().session.speed).toBe('paused');
  expect(store.getState().session.lastPauseReason).toBe('user');
});

it.each(['cancel', 'confirm'] as const)(
  'advances exactly the owned modal on %s without closing the next arrival',
  (action) => {
    const { game, confirm, cancel } = setup();
    const arrival = requiredArrival();
    act(() => uiStore.getState().actions.enqueueModal(arrival));
    const before = structuredClone(game);
    act(() => {
      (action === 'confirm' ? confirm : cancel)();
      (action === 'confirm' ? confirm : cancel)();
    });
    expect(uiStore.getState().modal).toBe(arrival);
    expect(uiStore.getState().modalQueue).toEqual([]);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toHaveLength(action === 'confirm' ? 1 : 0);
    expect(store.getState().session.speed).toBe('paused');
    expect(store.getState().session.lastPauseReason).toBe('user');
  },
);

it('irrevocably revokes externally removed then restored exact consent', () => {
  const { game, confirm } = setup();
  const original = uiStore.getState().modal!;
  act(() => {
    uiStore.getState().actions.closeModal();
    uiStore.getState().actions.enqueueModal(original);
  });
  expect(uiStore.getState().modal).toBe(original);
  const before = structuredClone(game);
  act(() => confirm());
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(uiStore.getState().modal).toBe(original);
});

it.each(['unmount', 'replacement', 'command'] as const)(
  'removes only owned consent during %s cleanup',
  (change) => {
    const { game, corps, view, confirm } = setup();
    const arrival = requiredArrival();
    act(() => uiStore.getState().actions.enqueueModal(arrival));
    let current = game;
    act(() => {
      if (change === 'unmount') view.unmount();
      if (change === 'replacement') {
        current = structuredClone(game);
        setGame(current);
        initializeBridgeSession(current);
      }
      if (change === 'command') {
        expect(
          dispatchCommand({
            type: 'setCorpsDirective',
            clanId: CLAN_ALPHA,
            corpsId: corps.id,
            directive: 'develop',
            targetNodeId: null,
          }),
        ).toEqual({ ok: true });
        runOneDay();
        expect(validateState(game)).toEqual([]);
      }
    });
    const before = structuredClone(current);
    expect(uiStore.getState().modal).toBe(arrival);
    expect(uiStore.getState().modalQueue).toEqual([]);
    act(() => confirm());
    expect(uiStore.getState().modal).toBe(arrival);
    expect(getQueuedPlayerCommands(current)).toEqual([]);
    expect(current).toEqual(before);
    expect(store.getState().session.speed).toBe('paused');
  },
);

it('does not pause a running session for a nonpausing confirmation', () => {
  const { game, cancel } = setup(true);
  expect(uiStore.getState().modal?.pausesTime).toBe(false);
  expect(store.getState().session.speed).toBe('x2');
  const before = structuredClone(game);
  act(() => cancel());
  expect(uiStore.getState().modal).toBeNull();
  expect(store.getState().session.speed).toBe('x2');
  expect(game).toEqual(before);
});

it('preserves a required arrival pause when it advances from running confirmation', () => {
  const { cancel } = setup(true);
  const arrival = requiredArrival();
  act(() => uiStore.getState().actions.enqueueModal(arrival));
  expect(store.getState().session.speed).toBe('x2');
  act(() => cancel());
  expect(uiStore.getState().modal).toBe(arrival);
  expect(store.getState().session.speed).toBe('paused');
  expect(store.getState().session.lastPauseReason).toBe('modalOpen');
});

it('keeps ordinary ticks and actual queued settlement truthful', () => {
  const { game, corps, confirm } = setup();
  const dialog = screen.getByRole('dialog');
  const original = uiStore.getState().modal;
  act(() => bumpTickSeq());
  expect(screen.getByRole('dialog')).toBe(dialog);
  expect(uiStore.getState().modal).toBe(original);
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
  expect(validateState(game)).toEqual([]);
  expect(store.getState().session.speed).toBe('paused');
  expect(store.getState().session.lastPauseReason).toBe('user');
});
