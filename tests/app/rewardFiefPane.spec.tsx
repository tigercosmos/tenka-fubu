import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RewardFiefPane } from '../../src/ui/screens/RewardFiefPane';
import { bumpTickSeq, resetGameStoreForTests, setGame, store } from '../../src/app/store';
import {
  getQueuedPlayerCommands,
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
  dispatchCommand,
} from '../../src/app/bridge';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { validateState } from '../../src/core/state/invariants';
import { BAL } from '../../src/core/balance';
import { RANK_VALUES } from '../../src/core/state/enums';
import { rankLabel } from '../../src/ui/screens/OfficerList';
import { t } from '../../src/i18n/zh-TW';
import {
  buildTinyState,
  DIST_A1X,
  DIST_A1Y,
  DIST_A2X,
  OFF_ALPHA_BUSHO,
  OFF_ALPHA_LORD,
  OFF_ALPHA_TAISHO,
  CASTLE_A1,
  CASTLE_A2,
} from '../fixtures/tiny';

beforeEach(() => {
  resetBridgeForTests();
  uiStore.getState().actions.reset();
});
afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests(null);
});
function fixture() {
  const game = buildTinyState();
  game.districts[DIST_A1X]!.stewardId = null;
  game.districts[DIST_A1Y]!.stewardId = null;
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  return game;
}
describe('RewardFiefPane real grant-fief interaction', () => {
  it('shows detached rank, capped ordinary politics, loyalty and current fief count/cap', () => {
    const game = fixture();
    const officer = game.officers[OFF_ALPHA_BUSHO]!;
    officer.pol = BAL.abilityMax - 1;
    officer.statGrowth.pol = BAL.statGrowthCap;
    expect(validateState(game)).toEqual([]);
    const before = structuredClone(game);
    render(<RewardFiefPane officerId={officer.id} onBack={vi.fn()} />);
    const context = screen.getByTestId('reward-fief-context');
    expect(context.textContent).toContain(rankLabel(officer.rank));
    expect(context.textContent).toContain(String(BAL.abilityMax));
    expect(context.textContent).toContain(String(officer.loyalty));
    expect(context.textContent).toContain(
      t('ui.reward.fiefCount', {
        count: 0,
        cap: BAL.fiefMaxByRank[RANK_VALUES.indexOf(officer.rank)]!,
      }),
    );
    expect(game).toEqual(before);
  });
  it('requires actual prior-steward dismissal confirmation and cancel is pure before explicit queued replacement', () => {
    const game = fixture();
    const previous = game.officers[OFF_ALPHA_TAISHO]!;
    game.castles[CASTLE_A2]!.lordId = null;
    previous.locationCastleId = CASTLE_A1;
    expect(validateState(game)).toEqual([]);
    expect(
      dispatchCommand({
        type: 'grantFief',
        clanId: game.meta.playerClanId,
        districtId: DIST_A1X,
        officerId: previous.id,
      }),
    ).toMatchObject({ ok: true });
    act(() => {
      runOneDay();
    });
    expect(game.districts[DIST_A1X]!.stewardId).toBe(previous.id);
    const before = structuredClone(game);
    render(<RewardFiefPane officerId={OFF_ALPHA_BUSHO} onBack={vi.fn()} />);
    expect(screen.getByRole('option', { name: new RegExp(previous.name) })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t('ui.reward.fiefAssign') }));
    expect(screen.getByText(t('cmd.fief.confirmDismiss', { name: previous.name }))).toBeTruthy();
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: t('ui.common.cancel') }));
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: t('ui.reward.fiefAssign') }));
    fireEvent.click(screen.getByRole('button', { name: t('ui.common.confirm') }));
    expect(getQueuedPlayerCommands(game)).toHaveLength(1);
    expect(game).toEqual(before);
    const loyalty = previous.loyalty;
    act(() => {
      runOneDay();
    });
    expect(game.districts[DIST_A1X]!.stewardId).toBe(OFF_ALPHA_BUSHO);
    expect(previous.loyalty).toBe(Math.max(0, loyalty - BAL.loyaltyReduceFief));
    expect(validateState(game)).toEqual([]);
  });
  it('rechecks parent dialog authority at submission without gameplay writes', () => {
    const game = fixture();
    const before = structuredClone(game);
    let authorized = true;
    render(
      <RewardFiefPane officerId={OFF_ALPHA_BUSHO} onBack={vi.fn()} canSubmit={() => authorized} />,
    );
    authorized = false;
    fireEvent.click(screen.getByRole('button', { name: t('ui.reward.fiefAssign') }));
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    expect(game).toEqual(before);
  });
  it('invalidates submission synchronously when navigating back even before parent unmount', () => {
    const game = fixture();
    const before = structuredClone(game);
    const onBack = vi.fn();
    render(<RewardFiefPane officerId={OFF_ALPHA_BUSHO} onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: t('ui.common.back') }));
    fireEvent.click(screen.getByRole('button', { name: t('ui.reward.fiefAssign') }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    expect(game).toEqual(before);
  });
  it('queues exactly once without optimistic assignment, then normal tick assigns the selected officer', () => {
    const game = fixture();
    expect(validateState(game)).toEqual([]);
    render(<RewardFiefPane officerId={OFF_ALPHA_BUSHO} onBack={vi.fn()} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: DIST_A1X } });
    const before = structuredClone(game);
    fireEvent.click(screen.getByRole('button', { name: t('ui.reward.fiefAssign') }));
    expect(getQueuedPlayerCommands(game)).toEqual([
      {
        type: 'grantFief',
        clanId: game.meta.playerClanId,
        districtId: DIST_A1X,
        officerId: OFF_ALPHA_BUSHO,
      },
    ]);
    expect(game).toEqual(before);
    expect(
      screen.getByRole('button', { name: t('ui.reward.fiefAssign') }).hasAttribute('disabled'),
    ).toBe(true);
    expect(screen.getByText(t('ui.reward.fiefPending'))).toBeTruthy();
    act(() => {
      runOneDay();
    });
    expect(game.districts[DIST_A1X]!.stewardId).toBe(OFF_ALPHA_BUSHO);
    expect(validateState(game)).toEqual([]);
    expect(screen.getByTestId('reward-fief-current').textContent).toContain(
      game.districts[DIST_A1X]!.name,
    );
    // Already assigned to this officer: no dismissal of someone else, hence no confirmation.
    const after = structuredClone(game);
    fireEvent.click(screen.getByRole('button', { name: t('ui.reward.fiefAssign') }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(getQueuedPlayerCommands(game)).toHaveLength(1);
    expect(game).toEqual(after);
  });
  it.each(['steward', 'game', 'officer'] as const)(
    'discards open dismissal consent when its %s identity changes',
    (change) => {
      const game = fixture();
      const previous = game.officers[OFF_ALPHA_TAISHO]!;
      game.castles[CASTLE_A2]!.lordId = null;
      previous.locationCastleId = CASTLE_A1;
      expect(
        dispatchCommand({
          type: 'grantFief',
          clanId: game.meta.playerClanId,
          districtId: DIST_A1X,
          officerId: previous.id,
        }),
      ).toMatchObject({ ok: true });
      act(() => {
        runOneDay();
      });
      const { rerender } = render(<RewardFiefPane officerId={OFF_ALPHA_BUSHO} onBack={vi.fn()} />);
      fireEvent.click(screen.getByRole('button', { name: t('ui.reward.fiefAssign') }));
      expect(screen.getByRole('dialog')).toBeTruthy();
      let current = game;
      if (change === 'steward') {
        act(() => {
          expect(
            dispatchCommand({
              type: 'grantFief',
              clanId: game.meta.playerClanId,
              districtId: DIST_A1X,
              officerId: null,
            }),
          ).toMatchObject({ ok: true });
          runOneDay();
        });
      } else if (change === 'game') {
        current = buildTinyState();
        act(() => {
          setGame(current);
          initializeBridgeSession(current);
        });
      } else rerender(<RewardFiefPane officerId={previous.id} onBack={vi.fn()} />);
      const before = structuredClone(current);
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(getQueuedPlayerCommands(current)).toEqual([]);
      expect(current).toEqual(before);
      expect(validateState(current)).toEqual([]);
    },
  );
  it('uses actual location and ruling-lord validation rather than inventing eligibility', () => {
    const game = fixture();
    const { rerender } = render(<RewardFiefPane officerId={OFF_ALPHA_BUSHO} onBack={vi.fn()} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: DIST_A2X } });
    expect(
      screen.getByRole('button', { name: t('ui.reward.fiefAssign') }).hasAttribute('disabled'),
    ).toBe(true);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    rerender(<RewardFiefPane officerId={OFF_ALPHA_LORD} onBack={vi.fn()} />);
    expect(
      screen.getByRole('button', { name: t('ui.reward.fiefAssign') }).hasAttribute('disabled'),
    ).toBe(true);
  });
  it('refreshes detached fiefs/ownership on ticks and replacement, and back only navigates', () => {
    const game = fixture();
    const onBack = vi.fn();
    render(<RewardFiefPane officerId={OFF_ALPHA_BUSHO} onBack={onBack} />);
    act(() => {
      game.districts[DIST_A1Y]!.stewardId = OFF_ALPHA_BUSHO;
      bumpTickSeq();
    });
    expect(screen.getByTestId('reward-fief-current').textContent).toContain(
      game.districts[DIST_A1Y]!.name,
    );
    const replacement = buildTinyState();
    replacement.officers[OFF_ALPHA_BUSHO]!.name = '替換家臣';
    const before = structuredClone(replacement);
    act(() => setGame(replacement));
    expect(screen.getByText('替換家臣')).toBeTruthy();
    const uiBefore = uiStore.getState();
    fireEvent.click(screen.getByRole('button', { name: t('ui.common.back') }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(uiStore.getState()).toBe(uiBefore);
    expect(replacement).toEqual(before);
    expect(getQueuedPlayerCommands(replacement)).toEqual([]);
  });
});
