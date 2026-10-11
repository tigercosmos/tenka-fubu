import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  initializeBridgeSession,
  dispatchCommand,
  getQueuedPlayerCommands,
  resetBridgeForTests,
  runOneDay,
} from '@app/bridge';
import { resetGameStoreForTests, setGame, store } from '@app/store';
import { encodeSave, decodeSave } from '@core/save/serialize';
import { selectMapStaticModel, selectMapViewModel } from '@core/state/selectors';
import { validateState } from '@core/state/invariants';
import { RealmNavigator } from './RealmNavigator';
import { ConfirmDialog } from '../components';
import { uiStore } from '../hooks/uiStore';
import { armyWorldPos } from '../map/dirty';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  OFF_ALPHA_LORD,
} from '../../../tests/fixtures/tiny';
import { buildFullState } from '../../../tests/helpers/fullState';

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
function start(game = buildTinyState()) {
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  const modal = { id: 'realmNavigator' as const, params: { token: 'initial' }, pausesTime: false };
  uiStore.getState().actions.enqueueModal(modal);
  return { game, modal };
}
function click(button: HTMLElement): () => void {
  const key = Object.keys(button).find((k) => k.startsWith('__reactProps$'))!;
  return (button as unknown as Record<string, { onClick: () => void }>)[key]!.onClick;
}
it.each(['title', 'viewport', 'fatal', 'subject'] as const)(
  'rejects a retained row after the %s boundary with no core mutation',
  (boundary) => {
    const { game, modal } = start();
    const focus = vi.fn();
    render(<RealmNavigator modal={modal} onFocus={focus} />);
    const retained = click(
      screen.getByRole('button', { name: `選取${game.castles[CASTLE_A2]!.name}` }),
    );
    act(() => {
      if (boundary === 'title') store.getState().actions.setScreen('title');
      if (boundary === 'viewport') store.getState().actions.setViewportBlocked(true);
      if (boundary === 'fatal')
        store
          .getState()
          .actions.setFatalError({ code: 'diagnostic', message: 'blocked', stack: '' });
      if (boundary === 'subject')
        game.castles[CASTLE_A2] = structuredClone(game.castles[CASTLE_A2]!);
    });
    const before = structuredClone(game),
      currentModal = uiStore.getState().modal;
    act(retained);
    expect(focus).not.toHaveBeenCalled();
    expect(uiStore.getState().selection).toBeNull();
    expect(uiStore.getState().modal).toBe(currentModal);
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
  },
);
it('irrevocably rejects a row after foreign native insertion and removal', () => {
  const { game, modal } = start();
  const focus = vi.fn();
  render(<RealmNavigator modal={modal} onFocus={focus} />);
  const retained = click(
    screen.getByRole('button', { name: `選取${game.castles[CASTLE_A2]!.name}` }),
  );
  const foreign = render(
    <ConfirmDialog
      open
      title="Foreign"
      message="Other owner"
      onConfirm={() => {}}
      onCancel={() => {}}
    />,
  );
  foreign.unmount();
  const before = structuredClone(game);
  act(retained);
  expect(focus).not.toHaveBeenCalled();
  expect(uiStore.getState().selection).toBeNull();
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(game).toEqual(before);
});
it('does not focus or close a successor owner published synchronously by actual app selection', () => {
  const { game, modal } = start();
  const focus = vi.fn();
  render(<RealmNavigator modal={modal} onFocus={focus} />);
  const successor = { id: 'systemMenu' as const, params: {}, pausesTime: false };
  const unsubscribe = store.subscribe((state, previous) => {
    if (state.session.selection !== previous.session.selection) {
      uiStore.getState().actions.closeOwnedModal(modal, { resume: false });
      uiStore.getState().actions.enqueueModal(successor);
    }
  });
  const before = structuredClone(game);
  fireEvent.click(screen.getByRole('button', { name: `選取${game.castles[CASTLE_A2]!.name}` }));
  unsubscribe();
  expect(focus).not.toHaveBeenCalled();
  expect(uiStore.getState().modal).toBe(successor);
  expect(uiStore.getState().selection).toBeNull();
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});
it('uses actual map subjects and public facts for all three filters, with pure foreign selection', () => {
  const { game, modal } = start();
  const before = structuredClone(game),
    focus = vi.fn();
  render(<RealmNavigator modal={modal} onFocus={focus} />);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'district' } });
  expect(screen.getAllByRole('listitem')).toHaveLength(selectMapViewModel(game).districts.length);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'castle' } });
  expect(screen.getAllByRole('listitem')).toHaveLength(selectMapViewModel(game).castles.length);
  fireEvent.change(screen.getByRole('searchbox'), {
    target: { value: game.castles[CASTLE_B1]!.name },
  });
  expect(screen.getAllByRole('listitem')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: `選取${game.castles[CASTLE_B1]!.name}` }));
  expect(uiStore.getState().selection).toEqual({ kind: 'castle', id: CASTLE_B1 });
  expect(uiStore.getState().panelStack).toEqual([]);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(game).toEqual(before);
  expect(validateState(game)).toEqual([]);
});
it('selects a real queued normal-day army at its current physical position, not its origin', () => {
  const { game, modal } = start();
  expect(
    dispatchCommand({
      type: 'march',
      clanId: CLAN_ALPHA,
      originCastleId: CASTLE_A1,
      leaderId: OFF_ALPHA_LORD,
      deputyIds: [],
      soldiers: 100,
      food: 200,
      targetNodeId: CASTLE_B1,
    }).ok,
  ).toBe(true);
  runOneDay();
  expect(validateState(game)).toEqual([]);
  const projected = selectMapViewModel(game).armies[0]!;
  const pos = armyWorldPos(projected, selectMapStaticModel(game).graph),
    before = structuredClone(game),
    focus = vi.fn();
  render(<RealmNavigator modal={modal} onFocus={focus} />);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'army' } });
  fireEvent.click(
    screen.getByRole('button', { name: `選取${game.officers[OFF_ALPHA_LORD]!.name}` }),
  );
  expect(uiStore.getState().selection).toEqual({ kind: 'army', id: projected.id });
  expect(focus).toHaveBeenCalledWith(pos, game);
  expect(pos).not.toEqual(game.castles[CASTLE_A1]!.pos);
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});
it('selects a district through native controls and cannot repeat a synchronously retained selection', () => {
  const { game, modal } = start();
  const district = selectMapViewModel(game).districts[0]!,
    focus = vi.fn();
  render(<RealmNavigator modal={modal} onFocus={focus} />);
  fireEvent.change(screen.getByRole('combobox'), { target: { value: 'district' } });
  const retained = click(
    screen.getByRole('button', { name: `選取${game.districts[district.id]!.name}` }),
  );
  let reentered = false;
  const unsubscribe = store.subscribe(() => {
    if (!reentered) {
      reentered = true;
      retained();
    }
  });
  const before = structuredClone(game);
  act(retained);
  unsubscribe();
  expect(focus).toHaveBeenCalledTimes(1);
  expect(focus).toHaveBeenCalledWith(
    selectMapStaticModel(game).graph.nodes.get(district.id)!.pos,
    game,
  );
  expect(uiStore.getState().selection).toEqual({ kind: 'district', id: district.id });
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});
it('rejects a retained row across actual same-ID native game replacement', () => {
  const { game, modal } = start();
  const focus = vi.fn();
  render(<RealmNavigator modal={modal} onFocus={focus} />);
  const stale = click(screen.getByRole('button', { name: `選取${game.castles[CASTLE_A2]!.name}` }));
  const result = decodeSave(encodeSave(game, 123));
  if (!result.ok) throw new Error('Expected genuine native replacement');
  const replacement = result.saveFile.state;
  act(() => {
    setGame(replacement);
    initializeBridgeSession(replacement);
  });
  const before = structuredClone(replacement),
    currentModal = uiStore.getState().modal;
  act(stale);
  expect(uiStore.getState().modal).toBe(currentModal);
  expect(uiStore.getState().selection).toBeNull();
  expect(focus).not.toHaveBeenCalled();
  expect(replacement).toEqual(before);
  expect(getQueuedPlayerCommands(replacement)).toEqual([]);
});
it('cannot revive old callbacks after FIFO removal and restoration, and preserves queued arrivals', () => {
  const { game, modal } = start();
  const focus = vi.fn();
  render(<RealmNavigator modal={modal} onFocus={focus} />);
  const stale = click(screen.getByRole('button', { name: `選取${game.castles[CASTLE_A2]!.name}` }));
  const arrival = { id: 'systemMenu' as const, params: {}, pausesTime: true };
  act(() => {
    uiStore.getState().actions.enqueueModal(arrival);
    uiStore.getState().actions.closeOwnedModal(modal, { resume: false });
    uiStore.getState().actions.enqueueModal(modal);
  });
  const before = structuredClone(game),
    queue = [...uiStore.getState().modalQueue];
  act(stale);
  expect(uiStore.getState().modal).toBe(arrival);
  expect(uiStore.getState().modalQueue).toEqual(queue);
  expect(focus).not.toHaveBeenCalled();
  expect(game).toEqual(before);
});
it('keeps StrictMode controls live and restores opener focus after explicit keyboard close', async () => {
  const { modal } = start();
  const opener = document.createElement('button');
  opener.textContent = 'Opener';
  document.body.append(opener);
  opener.focus();
  const view = render(
    <StrictMode>
      <RealmNavigator modal={modal} onFocus={() => {}} />
    </StrictMode>,
  );
  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('searchbox')));
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: '不存在' } });
  expect(screen.getByRole('status').textContent).toContain('沒有符合');
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(uiStore.getState().modal).toBeNull();
  view.unmount();
  expect(document.activeElement).toBe(opener);
  opener.remove();
});
it('paginates all current national map subjects into at most twenty keyboard controls', async () => {
  const game = await buildFullState({ seed: 15600519 });
  const { modal } = start(game);
  const before = structuredClone(game);
  render(<RealmNavigator modal={modal} onFocus={() => {}} />);
  expect(screen.getAllByRole('listitem')).toHaveLength(20);
  fireEvent.click(screen.getByRole('button', { name: '下一頁' }));
  expect(screen.getAllByRole('listitem')).toHaveLength(20);
  expect(screen.getByText(/第2頁/)).toBeTruthy();
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});
