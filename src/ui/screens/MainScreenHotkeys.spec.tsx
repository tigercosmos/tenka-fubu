import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
vi.mock('pixi.js', async () => {
  const { createPixiMockClasses } = await import('../../../tests/helpers/pixiMock');
  return createPixiMockClasses([]);
});
import { MainScreen } from './MainScreen';
import { MapRenderer } from '../map/MapRenderer';
import { uiStore } from '../hooks/uiStore';
import { resetBridgeForTests } from '@app/bridge';
import { resetGameStoreForTests, store } from '@app/store';
import { makeLoopTestState } from '../../../tests/helpers/loopState';
import { buildTinyState, CASTLE_A1, CASTLE_A2, CASTLE_B1 } from '../../../tests/fixtures/tiny';
import { validateState } from '@core/state/invariants';
import { ConfirmDialog } from '../components';
import { createMarchDraft } from './marchDraft';

beforeEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(makeLoopTestState({ day: 0, gold: 1000 }));
  store.getState().actions.setScreen('main');
  uiStore.getState().actions.reset();
  uiStore.getState().actions.setScreen('main');
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});
afterEach(() => vi.restoreAllMocks());
function startTargetList() {
  const game = buildTinyState();
  resetGameStoreForTests(game);
  store.getState().actions.setScreen('main');
  const draft = { ...createMarchDraft(game, CASTLE_A1)!, phase: 'pickTarget' as const };
  uiStore.getState().actions.setMarchDraft(draft);
  const parent = { id: 'march' as const, params: { castleId: CASTLE_A1 }, pausesTime: false };
  uiStore.getState().actions.enqueueModal(parent);
  render(<MainScreen />);
  fireEvent.click(screen.getByTestId('rail-realm'));
  const button = screen.getByRole('button', { name: `選取${game.castles[CASTLE_B1]!.name}` });
  const key = Object.keys(button).find((value) => value.startsWith('__reactProps$'))!;
  const retained = (button as unknown as Record<string, { onClick: () => void }>)[key]!.onClick;
  return { game, draft, parent, retained };
}
describe('MainScreen canonical keyboard wiring', () => {
  it.each(['draft', 'parent'] as const)(
    'march target consent cannot revive after %s departure and restoration',
    (boundary) => {
      const { game, draft, parent, retained } = startTargetList();
      const before = structuredClone(game);
      act(() => {
        if (boundary === 'draft') {
          uiStore.getState().actions.setMarchDraft({ ...draft });
          uiStore.getState().actions.setMarchDraft(draft);
        } else {
          uiStore.getState().actions.closeOwnedModal(parent, { resume: false });
          uiStore.getState().actions.enqueueModal(parent);
        }
      });
      act(retained);
      expect(uiStore.getState().marchDraft).toBe(draft);
      expect(uiStore.getState().modal).toBe(parent);
      expect(store.getState().session.pendingCommandCount).toBe(0);
      expect(game).toEqual(before);
      fireEvent.click(screen.getByTestId('rail-realm'));
      fireEvent.click(screen.getByRole('button', { name: `選取${game.castles[CASTLE_B1]!.name}` }));
      expect(uiStore.getState().marchDraft?.targetNodeId).toBe(CASTLE_B1);
    },
  );
  it('target-list Escape returns only to pick mode and unreachable origin does not confirm or enqueue', () => {
    const { game, draft, parent } = startTargetList();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(uiStore.getState().marchDraft).toBe(draft);
    expect(uiStore.getState().modal).toBe(parent);
    fireEvent.click(screen.getByTestId('rail-realm'));
    fireEvent.click(screen.getByRole('button', { name: `選取${game.castles[CASTLE_A1]!.name}` }));
    expect(uiStore.getState().marchDraft?.targetNodeId).toBeNull();
    expect(uiStore.getState().marchDraft?.errorKey).toBe('ui.map.path.unreachable');
    expect(uiStore.getState().marchDraft?.phase).toBe('pickTarget');
    expect(store.getState().session.pendingCommandCount).toBe(0);
    expect(validateState(game)).toEqual([]);
  });
  it('offers DOM march target preview under the original FIFO parent without confirming or dispatching', () => {
    const game = buildTinyState();
    resetGameStoreForTests(game);
    store.getState().actions.setScreen('main');
    const draft = createMarchDraft(game, CASTLE_A1)!;
    uiStore.getState().actions.setMarchDraft({ ...draft, phase: 'pickTarget' });
    const parent = { id: 'march' as const, params: { castleId: CASTLE_A1 }, pausesTime: false };
    uiStore.getState().actions.enqueueModal(parent);
    const before = structuredClone(game);
    render(<MainScreen />);
    fireEvent.click(screen.getByTestId('rail-realm'));
    const dialog = screen.getByRole('dialog', { name: '地圖一覽' });
    expect(within(dialog).queryByRole('option', { name: '部隊' })).toBeNull();
    fireEvent.click(
      within(dialog).getByRole('button', { name: `選取${game.castles[CASTLE_B1]!.name}` }),
    );
    expect(uiStore.getState().marchDraft?.targetNodeId).toBe(CASTLE_B1);
    expect(uiStore.getState().marchDraft?.previewPath).not.toBeNull();
    expect(uiStore.getState().marchDraft?.phase).toBe('pickTarget');
    expect(uiStore.getState().modal).toBe(parent);
    expect(uiStore.getState().modalQueue).toEqual([]);
    expect(store.getState().session.pendingCommandCount).toBe(0);
    expect(game).toEqual(before);
  });
  it('provides a visible keyboard-accessible realm entry that selects another castle without commands', async () => {
    const game = buildTinyState();
    resetGameStoreForTests(game);
    store.getState().actions.setScreen('main');
    const before = structuredClone(game);
    const pan = vi.spyOn(MapRenderer.prototype, 'panToWorld').mockImplementation(() => {});
    render(<MainScreen />);
    fireEvent.click(screen.getByRole('button', { name: '地圖一覽' }));
    const dialog = screen.getByRole('dialog', { name: '地圖一覽' });
    fireEvent.change(within(dialog).getByRole('searchbox'), {
      target: { value: game.castles[CASTLE_A2]!.name },
    });
    fireEvent.click(
      within(dialog).getByRole('button', { name: `選取${game.castles[CASTLE_A2]!.name}` }),
    );
    expect(uiStore.getState().selection).toEqual({ kind: 'castle', id: CASTLE_A2 });
    expect(uiStore.getState().modal).toBeNull();
    expect(uiStore.getState().panelStack).toEqual([]);
    await waitFor(() =>
      expect(pan).toHaveBeenCalledWith(
        game.castles[CASTLE_A2]!.pos.x,
        game.castles[CASTLE_A2]!.pos.y,
        null,
      ),
    );
    expect(game).toEqual(before);
    expect(store.getState().session.pendingCommandCount).toBe(0);
    expect(validateState(game)).toEqual([]);
  });
  it.each(['title', 'viewport', 'fatal', 'modal', 'native'] as const)(
    'visible domestic rail cannot open through the current %s foreground boundary',
    (blocker) => {
      const game = buildTinyState();
      resetGameStoreForTests(game);
      store.getState().actions.setScreen('main');
      render(<MainScreen />);
      act(() => uiStore.getState().actions.setSelection({ kind: 'castle', id: CASTLE_A2 }));
      if (blocker === 'native')
        render(
          <ConfirmDialog
            open
            title="Other owner"
            message="Other owner"
            onConfirm={() => {}}
            onCancel={() => {}}
          />,
        );
      else
        act(() => {
          if (blocker === 'title') store.getState().actions.setScreen('title');
          if (blocker === 'viewport') store.getState().actions.setViewportBlocked(true);
          if (blocker === 'fatal')
            store
              .getState()
              .actions.setFatalError({ code: 'diagnostic', message: 'blocked', stack: '' });
          if (blocker === 'modal')
            uiStore
              .getState()
              .actions.enqueueModal({ id: 'systemMenu', params: {}, pausesTime: false });
        });
      const before = structuredClone(game);
      const previousModal = uiStore.getState().modal;
      const previousPanels = uiStore.getState().panelStack;
      fireEvent.click(screen.getByTestId('rail-domestic'));
      expect(uiStore.getState().panelStack).toBe(previousPanels);
      expect(uiStore.getState().modal).toBe(previousModal);
      expect(store.getState().game).toEqual(before);
      expect(store.getState().session.pendingCommandCount).toBe(0);
      expect(validateState(game)).toEqual([]);
    },
  );
  it.each([CASTLE_A2, null, CASTLE_B1])(
    'visible domestic rail opens the owned selected castle or home directly in domestic: %s',
    (selectedCastle) => {
      const game = buildTinyState();
      resetGameStoreForTests(game);
      store.getState().actions.setScreen('main');
      const before = structuredClone(game);
      render(<MainScreen />);
      act(() =>
        uiStore
          .getState()
          .actions.setSelection(
            selectedCastle === null ? null : { kind: 'castle', id: selectedCastle },
          ),
      );
      fireEvent.click(screen.getByTestId('rail-domestic'));
      expect(uiStore.getState().panelStack.at(-1)).toMatchObject({
        id: 'castle',
        params: { castleId: selectedCastle === CASTLE_A2 ? CASTLE_A2 : CASTLE_A1, tab: 'domestic' },
      });
      expect(screen.getByRole('tab', { name: '內政' }).getAttribute('aria-selected')).toBe('true');
      expect(store.getState().game).toEqual(before);
      expect(store.getState().session.pendingCommandCount).toBe(0);
      expect(validateState(game)).toEqual([]);
    },
  );
  it.each(['title', 'battle', 'ending'] as const)(
    'a retained Main presentation cannot open a formation while the application screen is %s',
    (applicationScreen) => {
      const game = store.getState().game!;
      const before = structuredClone(game);
      render(<MainScreen />);
      act(() => store.getState().actions.setScreen(applicationScreen));
      fireEvent.keyDown(document.body, { key: 'F2' });
      expect(uiStore.getState().marchDraft).toBeNull();
      expect(uiStore.getState().modal).toBeNull();
      expect(store.getState().game).toEqual(before);
      expect(store.getState().session.pendingCommandCount).toBe(0);
    },
  );
  it('F1 opens domestic, F2 opens actual march, Home focuses owned home, M only hides presentation', async () => {
    const game = store.getState().game!;
    const before = structuredClone(game);
    const home = game.clans[game.meta.playerClanId]!.homeCastleId;
    const focus = vi.spyOn(MapRenderer.prototype, 'focusNode').mockImplementation(() => undefined);
    const pan = vi
      .spyOn(MapRenderer.prototype, 'panByKeyboard')
      .mockImplementation(() => undefined);
    const zoom = vi
      .spyOn(MapRenderer.prototype, 'zoomByKeyboard')
      .mockImplementation(() => undefined);
    render(<MainScreen />);
    fireEvent.keyDown(document.body, { key: 'F1' });
    expect(screen.getByRole('tab', { name: '內政' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    fireEvent.keyDown(document.body, { key: 'Home' });
    expect(uiStore.getState().selection).toEqual({ kind: 'castle', id: home });
    await waitFor(() => expect(focus).toHaveBeenCalledWith(home, null));
    fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
    fireEvent.keyUp(document.body, { key: 'ArrowLeft' });
    fireEvent.keyDown(document.body, { key: '+' });
    expect(pan).toHaveBeenCalledWith(-1, 0);
    expect(zoom).toHaveBeenCalledWith(1);
    expect(screen.getByTestId('minimap')).toBeTruthy();
    fireEvent.keyDown(document.body, { key: 'm' });
    expect(screen.queryByTestId('minimap')).toBeNull();
    fireEvent.keyDown(document.body, { key: 'm' });
    expect(screen.getByTestId('minimap')).toBeTruthy();
    fireEvent.keyDown(document.body, { key: 'F2' });
    expect(uiStore.getState().marchDraft?.originCastleId).toBe(home);
    expect(uiStore.getState().modal?.id).toBe('march');
    expect(store.getState().game).toEqual(before);
  });
  it('never focuses a home no longer owned by the player', () => {
    const game = store.getState().game!;
    const home = game.clans[game.meta.playerClanId]!.homeCastleId;
    game.castles[home]!.ownerClanId = 'clan.foreign' as typeof game.meta.playerClanId;
    const focus = vi.spyOn(MapRenderer.prototype, 'focusNode').mockImplementation(() => undefined);
    render(<MainScreen />);
    act(() => uiStore.getState().actions.setSelection(null));
    fireEvent.keyDown(document.body, { key: 'Home' });
    expect(focus).not.toHaveBeenCalled();
    expect(uiStore.getState().selection).toBeNull();
    fireEvent.keyDown(document.body, { key: 'F1' });
    fireEvent.keyDown(document.body, { key: 'F2' });
    expect(uiStore.getState().panelStack).toHaveLength(0);
    expect(uiStore.getState().marchDraft).toBeNull();
  });
});
