import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OfficerActions } from '../../src/ui/screens/OfficerActions';
import { resetGameStoreForTests, store, bumpTickSeq, setGame } from '../../src/app/store';
import { getQueuedPlayerCommands, resetBridgeForTests, runOneDay } from '../../src/app/bridge';
import { validateState } from '../../src/core/state/invariants';
import { validateCommand } from '../../src/core/index';
import { BAL } from '../../src/core/balance';
import type { OfficerId } from '../../src/core/state/ids';
import { t } from '../../src/i18n/zh-TW';
import { uiStore } from '../../src/ui/hooks/uiStore';
import type { CommandActionProps } from '../../src/ui/components/CommandAction';
import { buildTinyState, OFF_ALPHA_BUSHO, DIST_A1X, DIST_A1Y } from '../fixtures/tiny';

const OLD = 'off.fief-previous' as OfficerId;
const OTHER = 'off.fief-other' as OfficerId;
const captured = vi.hoisted(() => ({ latest: null as CommandActionProps | null }));
// Preserve real CommandAction rendering/validation; retain its port to exercise stale closures directly.
vi.mock('../../src/ui/components/CommandAction', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/ui/components/CommandAction')>();
  return {
    ...actual,
    CommandAction: (props: CommandActionProps) => {
      if (props.command.type === 'grantFief') captured.latest = props;
      return <actual.CommandAction {...props} />;
    },
  };
});
beforeEach(() => {
  captured.latest = null;
  resetBridgeForTests();
  uiStore.getState().actions.reset();
});
afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests();
});
function fixture(replace = true) {
  const game = buildTinyState();
  const officer = game.officers[OFF_ALPHA_BUSHO]!;
  officer.rank = 'busho';
  for (const id of [OLD, OTHER])
    game.officers[id] = { ...structuredClone(officer), id, name: id, loyalty: 80, spouseId: null };
  game.districts[DIST_A1X]!.stewardId = replace ? OLD : null;
  expect(validateState(game)).toEqual([]);
  resetGameStoreForTests(game);
  store.getState().actions.setScreen('main');
  return game;
}
function selectDistrict(id = DIST_A1X) {
  fireEvent.change(screen.getByRole('combobox', { name: t('ui.officer.appointDistrict') }), {
    target: { value: id },
  });
}
function assign() {
  fireEvent.click(screen.getByRole('button', { name: t('ui.officer.grantFief') }));
}

describe('OfficerActions fief replacement consent', () => {
  it('blocks a second assignment while the consented district assignment is queued', () => {
    const game = fixture();
    render(<OfficerActions officerId={OFF_ALPHA_BUSHO} />);
    selectDistrict();
    const before = structuredClone(game);
    assign();
    const stale = captured.latest!;
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: t('ui.common.confirm') }),
    );
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: t('ui.officer.grantFief') }).disabled,
    ).toBe(true);
    expect(screen.getByText(t('ui.reward.fiefPending'))).toBeTruthy();
    expect(stale.onCommand!(stale.command).ok).toBe(false);
    expect(getQueuedPlayerCommands(game)).toHaveLength(1);
    expect(game).toEqual(before);
  });
  it('warns about the actual former steward, cancels purely, then queues and settles the canonical replacement once', () => {
    const game = fixture();
    const command = {
      type: 'grantFief' as const,
      clanId: game.meta.playerClanId,
      districtId: DIST_A1X,
      officerId: OFF_ALPHA_BUSHO,
    };
    expect(validateCommand(game, command)).toEqual({ ok: true });
    render(<OfficerActions officerId={OFF_ALPHA_BUSHO} />);
    selectDistrict();
    const before = structuredClone(game);
    assign();
    expect(
      screen.getByText(t('cmd.fief.confirmDismiss', { name: game.officers[OLD]!.name })),
    ).toBeTruthy();
    const consent = screen.getByRole('dialog');
    act(() => bumpTickSeq());
    expect(screen.getByRole('dialog')).toBe(consent);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: t('ui.common.cancel') }),
    );
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    assign();
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: t('ui.common.confirm') }),
    );
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([command]);
    act(() => {
      runOneDay();
    });
    expect(game.districts[DIST_A1X]!.stewardId).toBe(OFF_ALPHA_BUSHO);
    expect(game.officers[OLD]!.loyalty).toBe(before.officers[OLD]!.loyalty - BAL.loyaltyReduceFief);
    expect(game.officers[OFF_ALPHA_BUSHO]!.loyalty).toBe(
      Math.min(100, before.officers[OFF_ALPHA_BUSHO]!.loyalty + BAL.loyaltyGrantFief),
    );
    expect(validateState(game)).toEqual([]);
  });

  it.each([null, OFF_ALPHA_BUSHO])(
    'does not require dismissal consent when steward is %s',
    (steward) => {
      const game = fixture(false);
      game.districts[DIST_A1X]!.stewardId = steward;
      expect(validateState(game)).toEqual([]);
      render(<OfficerActions officerId={OFF_ALPHA_BUSHO} />);
      selectDistrict();
      const before = structuredClone(game);
      assign();
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(getQueuedPlayerCommands(game)).toHaveLength(1);
      expect(game).toEqual(before);
    },
  );

  it.each(['district', 'steward', 'officer', 'game', 'unmount'] as const)(
    'invalidates pending consent after %s changes',
    (change) => {
      const game = fixture();
      const view = render(<OfficerActions officerId={OFF_ALPHA_BUSHO} />);
      selectDistrict();
      assign();
      expect(screen.getByRole('dialog')).toBeTruthy();
      const stale = captured.latest!;
      if (change === 'district') selectDistrict(DIST_A1Y);
      else if (change === 'steward')
        act(() => {
          game.districts[DIST_A1X]!.stewardId = OTHER;
          bumpTickSeq();
        });
      else if (change === 'officer') view.rerender(<OfficerActions officerId={OTHER} />);
      else if (change === 'game') act(() => setGame(buildTinyState()));
      else view.unmount();
      expect(screen.queryByRole('dialog')).toBeNull();
      const current = store.getState().game!;
      const before = structuredClone(current);
      expect(stale.onCommand!(stale.command).ok).toBe(false);
      expect(getQueuedPlayerCommands(current)).toEqual([]);
      expect(current).toEqual(before);
    },
  );

  it('rejects changed live steward facts before a UI tick and current viewport restrictions', () => {
    const game = fixture();
    render(<OfficerActions officerId={OFF_ALPHA_BUSHO} />);
    selectDistrict();
    assign();
    const stale = captured.latest!;
    game.districts[DIST_A1X]!.stewardId = OTHER;
    const before = structuredClone(game);
    expect(stale.onCommand!(stale.command).ok).toBe(false);
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    act(() => bumpTickSeq());
    assign();
    const current = captured.latest!;
    act(() => store.getState().actions.setViewportBlocked(true));
    expect(current.onCommand!(current.command).ok).toBe(false);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
  });
});
