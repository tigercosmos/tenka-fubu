import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { bumpTickSeq, resetGameStoreForTests, store } from '@app/store';
import { getQueuedPlayerCommands, initializeBridgeSession, resetBridgeForTests } from '@app/bridge';
import { applyMarch } from '@core/commands/march';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_LORD,
} from '../../../../tests/fixtures/tiny';
import { uiStore } from '../../hooks/uiStore';
import { CastlePanel } from './CastlePanel';
import { Dialog } from '../../components/Dialog/Dialog';

function fixture() {
  const game = buildTinyState();
  applyMarch(
    game,
    {
      type: 'march',
      clanId: CLAN_ALPHA,
      originCastleId: CASTLE_A1,
      leaderId: OFF_ALPHA_LORD,
      deputyIds: [],
      soldiers: 100,
      food: 200,
      targetNodeId: CASTLE_B1,
    },
    () => {},
  );
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  return { game, army: Object.values(game.armies)[0]! };
}
beforeEach(() => {
  resetBridgeForTests();
  uiStore.getState().actions.reset();
});

describe('Castle native army selection', () => {
  it('recovers the tab without taking focus from a direct native dialog or its async focus gap', () => {
    const { game, army } = fixture();
    game.castles[CASTLE_A1]!.ownerClanId = CLAN_BETA;
    const view = (child: boolean) => (
      <>
        <CastlePanel castleId={CASTLE_A1} initialTab="military" onSelectArmy={vi.fn()} />
        <Dialog open title="Native owner" onClose={() => {}}>
          {child && <button type="button">Owned control</button>}
        </Dialog>
      </>
    );
    const mounted = render(view(true));
    expect(uiStore.getState().modal).toBeNull();
    const control = screen.getByRole('button', { name: 'Owned control' });
    control.focus();
    mounted.rerender(view(false));
    expect(document.activeElement).toBe(document.body);
    act(() => {
      delete game.armies[army.id];
      bumpTickSeq();
    });
    const overview = screen.getByRole('tab', { name: '概要' });
    expect(overview.getAttribute('aria-selected')).toBe('true');
    expect(overview.tabIndex).toBe(0);
    expect(document.activeElement).not.toBe(overview);
    expect(screen.getByRole('dialog', { name: 'Native owner' })).toBeTruthy();
  });
  it.each(['disappearance', 'capture'] as const)(
    'restores an enabled overview tab after %s invalidates military',
    async (kind) => {
      const { game, army } = fixture();
      if (kind === 'disappearance') game.castles[CASTLE_A1]!.ownerClanId = CLAN_BETA;
      render(<CastlePanel castleId={CASTLE_A1} initialTab="military" onSelectArmy={vi.fn()} />);
      const military = screen.getByRole('tab', { name: '軍事' });
      military.focus();
      act(() => {
        delete game.armies[army.id];
        game.castles[CASTLE_A1]!.ownerClanId = CLAN_BETA;
        bumpTickSeq();
      });
      const overview = screen.getByRole<HTMLButtonElement>('tab', { name: '概要' });
      expect(overview.getAttribute('aria-selected')).toBe('true');
      expect(overview.tabIndex).toBe(0);
      expect(document.activeElement).toBe(overview);
      expect((military as HTMLButtonElement).disabled).toBe(true);
      await userEvent.setup().keyboard('{ArrowRight}');
      expect(document.activeElement).toBe(overview);
    },
  );
  it('keeps surviving owned armies reachable from a captured source without exposing enemy military details', async () => {
    const { game, army } = fixture();
    game.castles[CASTLE_A1]!.ownerClanId = CLAN_BETA;
    const select = vi.fn();
    const before = structuredClone(game);
    render(<CastlePanel castleId={CASTLE_A1} onSelectArmy={select} />);
    const tab = screen.getByRole<HTMLButtonElement>('tab', { name: '軍事' });
    expect(tab.disabled).toBe(false);
    fireEvent.click(tab);
    expect(screen.queryByRole('button', { name: '出陣' })).toBeNull();
    expect(screen.queryByRole('progressbar')).toBeNull();
    const button = screen.getByTestId<HTMLButtonElement>(`castle-army-${army.id}`);
    expect(button.type).toBe('button');
    expect(button.style.minHeight).toBe('32px');
    button.focus();
    await userEvent.setup().keyboard(' ');
    expect(select).toHaveBeenCalledWith(army.id, army);
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
  });

  it.each(['removed', 'foreign', 'source', 'replacement', 'modal', 'viewport'] as const)(
    'rejects a stale %s row at click time',
    (kind) => {
      const { game, army } = fixture();
      const select = vi.fn();
      render(<CastlePanel castleId={CASTLE_A1} initialTab="military" onSelectArmy={select} />);
      const button = screen.getByTestId(`castle-army-${army.id}`);
      if (kind === 'removed') delete game.armies[army.id];
      if (kind === 'foreign') army.clanId = CLAN_BETA;
      if (kind === 'source') army.originCastleId = CASTLE_A2;
      if (kind === 'replacement') game.armies[army.id] = structuredClone(army);
      if (kind === 'modal')
        act(() =>
          uiStore
            .getState()
            .actions.enqueueModal({ id: 'systemMenu', params: {}, pausesTime: true }),
        );
      if (kind === 'viewport') act(() => store.getState().actions.setViewportBlocked(true));
      fireEvent.click(button);
      expect(select).not.toHaveBeenCalled();
    },
  );

  it('does not expose foreign or other-source armies and disables rows without a consumer', () => {
    const { game, army } = fixture();
    const foreign = { ...army, id: 'army.foreign' as typeof army.id, clanId: CLAN_BETA };
    const other = { ...army, id: 'army.other' as typeof army.id, originCastleId: CASTLE_A2 };
    game.armies[foreign.id] = foreign;
    game.armies[other.id] = other;
    render(<CastlePanel castleId={CASTLE_A1} initialTab="military" />);
    expect(screen.getByTestId<HTMLButtonElement>(`castle-army-${army.id}`).disabled).toBe(true);
    expect(screen.queryByTestId(`castle-army-${foreign.id}`)).toBeNull();
    expect(screen.queryByTestId(`castle-army-${other.id}`)).toBeNull();
  });
});
