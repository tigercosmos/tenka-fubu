import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Children, isValidElement, type ReactNode } from 'react';
import * as components from '../../src/ui/components';
import { CastlePanel } from '../../src/ui/screens/panels/CastlePanel';
import { validateState } from '../../src/core/state/invariants';
import { bumpTickSeq, resetGameStoreForTests, setGame, store } from '../../src/app/store';
import {
  getQueuedPlayerCommands,
  initializeBridgeSession,
  resetBridgeForTests,
} from '../../src/app/bridge';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { t } from '../../src/i18n/zh-TW';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  OFF_ALPHA_BUSHO,
  OFF_BETA_BUSHO,
  OFF_BETA_TAISHO,
} from '../fixtures/tiny';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
});
function fixture() {
  const game = buildTinyState();
  const local = game.officers[OFF_ALPHA_BUSHO]!;
  local.status = 'ronin';
  local.clanId = null;
  local.locationCastleId = CASTLE_A1;
  const elsewhere = game.officers[OFF_BETA_BUSHO]!;
  elsewhere.status = 'ronin';
  elsewhere.clanId = null;
  elsewhere.locationCastleId = CASTLE_A2;
  const juvenile = game.officers[OFF_BETA_TAISHO]!;
  juvenile.status = 'ronin';
  juvenile.clanId = null;
  juvenile.locationCastleId = CASTLE_A1;
  juvenile.hasComeOfAge = false;
  expect(validateState(game)).toEqual([]);
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  uiStore.getState().actions.reset();
  return game;
}
it('opens the exact owned castle local adult ronin roster without state, RNG or command effects', () => {
  const game = fixture();
  const before = structuredClone(game);
  render(<CastlePanel castleId={CASTLE_A1} initialTab="domestic" />);
  expect(screen.getByText(t('ui.castle.roninCount', { count: 1 }))).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: t('ui.castle.openRonin') }));
  expect(uiStore.getState().panelStack).toContainEqual({
    id: 'ronin',
    params: { castleId: CASTLE_A1 },
  });
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});
it('reports known empty local content and hides the entry for foreign castles', () => {
  const game = fixture();
  game.officers[OFF_BETA_BUSHO]!.locationCastleId = CASTLE_A1;
  const view = render(<CastlePanel castleId={CASTLE_A2} initialTab="domestic" />);
  expect(screen.getByText(t('ui.castle.roninEmpty'))).toBeTruthy();
  view.rerender(<CastlePanel castleId={CASTLE_B1} initialTab="domestic" />);
  expect(screen.queryByRole('button', { name: t('ui.castle.openRonin') })).toBeNull();
});
it.each(['close', 'unmount', 'castle', 'load', 'modal', 'localDialog'] as const)(
  'rejects captured recruitment navigation after %s',
  (change) => {
    const original = components.Panel;
    const capturedEntry: { callback: (() => void) | null } = { callback: null };
    const visit = (children: ReactNode) => {
      Children.forEach(children, (child) => {
        if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(child)) return;
        if (child.type === 'button' && child.props.children === t('ui.castle.openRonin'))
          capturedEntry.callback = child.props.onClick ?? null;
        else visit(child.props.children);
      });
    };
    vi.spyOn(components, 'Panel').mockImplementation((props) => {
      visit(props.children);
      return original(props);
    });
    const game = fixture();
    const view = render(
      <CastlePanel castleId={CASTLE_A1} initialTab="domestic" onClose={() => {}} />,
    );
    const captured = capturedEntry.callback;
    expect(captured).not.toBeNull();
    if (change === 'close')
      fireEvent.click(screen.getByTestId('castle-panel').querySelector('header button')!);
    if (change === 'unmount') view.unmount();
    if (change === 'castle')
      view.rerender(<CastlePanel castleId={CASTLE_A2} initialTab="domestic" />);
    if (change === 'load') act(() => setGame(buildTinyState()));
    if (change === 'modal')
      act(() => {
        uiStore
          .getState()
          .actions.enqueueModal({ id: 'systemMenu', params: {}, pausesTime: false });
      });
    if (change === 'localDialog')
      render(
        <components.Dialog open title="Local consent" onClose={() => {}}>
          Consent
        </components.Dialog>,
      );
    const before = structuredClone(game);
    act(() => {
      captured!();
    });
    expect(uiStore.getState().panelStack.some((panel) => panel.id === 'ronin')).toBe(false);
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
  },
);
it.each(['title', 'fatal', 'viewport', 'gameOver', 'ownership'] as const)(
  'rejects fresh %s blockers',
  (blocker) => {
    const game = fixture();
    render(<CastlePanel castleId={CASTLE_A1} initialTab="domestic" />);
    const button = screen.getByRole('button', { name: t('ui.castle.openRonin') });
    act(() => {
      if (blocker === 'title') store.getState().actions.setScreen('title');
      if (blocker === 'fatal')
        store.setState({
          session: {
            ...store.getState().session,
            fatalError: { code: 'INVARIANT_FAILED', message: 'test', stack: '' },
          },
        });
      if (blocker === 'viewport') store.getState().actions.setViewportBlocked(true);
      if (blocker === 'gameOver') game.meta.gameOver = { kind: 'victory', endingId: 'unification' };
      if (blocker === 'ownership')
        game.castles[CASTLE_A1]!.ownerClanId = game.castles[CASTLE_B1]!.ownerClanId;
    });
    const before = structuredClone(game);
    fireEvent.click(button);
    expect(uiStore.getState().panelStack.some((panel) => panel.id === 'ronin')).toBe(false);
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
  },
);
it('refreshes local count on ticks and clears old entry through castle/session replacement', () => {
  const game = fixture();
  const view = render(<CastlePanel castleId={CASTLE_A1} initialTab="domestic" />);
  act(() => {
    game.officers[OFF_ALPHA_BUSHO]!.locationCastleId = CASTLE_A2;
    bumpTickSeq();
  });
  expect(screen.getByText(t('ui.castle.roninEmpty'))).toBeTruthy();
  view.rerender(<CastlePanel castleId={CASTLE_A2} initialTab="domestic" />);
  expect(screen.getByText(t('ui.castle.roninCount', { count: 2 }))).toBeTruthy();
  act(() => setGame(buildTinyState()));
  expect(screen.getByText(t('ui.castle.roninEmpty'))).toBeTruthy();
});
