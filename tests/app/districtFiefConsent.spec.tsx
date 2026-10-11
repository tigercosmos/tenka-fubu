import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DistrictPanel } from '../../src/ui/screens/panels/DistrictPanel';
import {
  dispatchCommand,
  getQueuedPlayerCommands,
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
} from '../../src/app/bridge';
import { resetGameStoreForTests, store, setGame } from '../../src/app/store';
import { validateState } from '../../src/core/state/invariants';
import { BAL } from '../../src/core/balance';
import { t } from '../../src/i18n/zh-TW';
import * as components from '../../src/ui/components';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  DIST_A1X,
  DIST_A1Y,
  OFF_ALPHA_BUSHO,
  OFF_ALPHA_TAISHO,
} from '../fixtures/tiny';

beforeEach(() => resetBridgeForTests());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  resetBridgeForTests();
  resetGameStoreForTests(null);
});
function fixture(assigned = true) {
  const game = buildTinyState();
  game.castles[CASTLE_A2]!.lordId = null;
  game.officers[OFF_ALPHA_TAISHO]!.locationCastleId = CASTLE_A1;
  game.districts[DIST_A1X]!.stewardId = null;
  game.districts[DIST_A1Y]!.stewardId = null;
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  if (assigned) {
    expect(
      dispatchCommand({
        type: 'grantFief',
        clanId: game.meta.playerClanId,
        districtId: DIST_A1X,
        officerId: OFF_ALPHA_TAISHO,
      }),
    ).toMatchObject({ ok: true });
    runOneDay();
  }
  expect(validateState(game)).toEqual([]);
  return game;
}
describe('DistrictPanel actual fief dismissal consent', () => {
  function observeConfirmation() {
    const original = components.ConfirmDialog;
    let latest: Parameters<typeof original>[0] | null = null;
    // Observe real dialog callbacks while rendering the unchanged shared implementation.
    vi.spyOn(components, 'ConfirmDialog').mockImplementation((props) => {
      latest = props;
      return original(props);
    });
    return () => latest!.onConfirm;
  }
  it.each(['steward', 'selection', 'district', 'unmount', 'close', 'load'] as const)(
    'rejects captured old consent after %s changes',
    (change) => {
      const getConfirm = observeConfirmation();
      const game = fixture();
      const onClose = vi.fn();
      const { rerender, unmount } = render(
        <DistrictPanel districtId={DIST_A1X} onClose={onClose} />,
      );
      const select = screen.getByRole('combobox');
      fireEvent.change(select, { target: { value: '' } });
      const oldConfirm = getConfirm();
      let current = game;
      if (change === 'steward')
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
      else if (change === 'selection')
        fireEvent.change(select, { target: { value: OFF_ALPHA_BUSHO } });
      else if (change === 'district')
        rerender(<DistrictPanel districtId={DIST_A1Y} onClose={onClose} />);
      else if (change === 'unmount') unmount();
      else if (change === 'close')
        fireEvent.click(screen.getByTestId('district-panel').querySelector('button')!);
      else {
        current = buildTinyState();
        act(() => {
          setGame(current);
          initializeBridgeSession(current);
        });
      }
      const before = structuredClone(current);
      act(() => oldConfirm());
      expect(getQueuedPlayerCommands(current)).toEqual([]);
      expect(current).toEqual(before);
      if (change === 'selection') {
        act(() => getConfirm()());
        expect(getQueuedPlayerCommands(game)[0]).toMatchObject({ officerId: OFF_ALPHA_BUSHO });
      }
    },
  );
  it.each(['title', 'fatal', 'viewport', 'gameOver'] as const)(
    'blocks consent submission during %s state',
    (blocker) => {
      const game = fixture();
      render(<DistrictPanel districtId={DIST_A1X} />);
      fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });
      act(() => {
        if (blocker === 'title') store.getState().actions.setScreen('title');
        else if (blocker === 'fatal')
          store
            .getState()
            .actions.setFatalError({ code: 'DATA_INTEGRITY', message: 'test', stack: 'test' });
        else if (blocker === 'viewport') store.getState().actions.setViewportBlocked(true);
        else game.meta.gameOver = { kind: 'defeat', endingId: 'no-castle' };
      });
      const before = structuredClone(game);
      fireEvent.click(screen.getByRole('button', { name: t('ui.common.confirm') }));
      expect(getQueuedPlayerCommands(game)).toEqual([]);
      expect(game).toEqual(before);
    },
  );
  it('consumes confirmation before a real command port can reenter it, queuing exactly once', () => {
    const getConfirm = observeConfirmation();
    const game = fixture();
    let count = 0;
    render(
      <DistrictPanel
        districtId={DIST_A1X}
        onCommand={(command) => {
          count++;
          const result = dispatchCommand(command);
          getConfirm()();
          return result;
        }}
      />,
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });
    const confirm = getConfirm();
    const before = structuredClone(game);
    act(() => {
      confirm();
      confirm();
    });
    expect(count).toBe(1);
    expect(getQueuedPlayerCommands(game)).toHaveLength(1);
    expect(game).toEqual(before);
  });
  it.each([null, OFF_ALPHA_BUSHO])(
    'requires cancel-first consent before dismissing/replacing with %s',
    (target) => {
      const game = fixture();
      const before = structuredClone(game);
      render(<DistrictPanel districtId={DIST_A1X} />);
      const select = screen.getByRole('combobox', { name: t('ui.district.steward') });
      fireEvent.change(select, { target: { value: target ?? '' } });
      expect(getQueuedPlayerCommands(game)).toEqual([]);
      expect(
        screen.getByText(
          t('cmd.fief.confirmDismiss', { name: game.officers[OFF_ALPHA_TAISHO]!.name }),
        ),
      ).toBeTruthy();
      expect((select as HTMLSelectElement).value).toBe(OFF_ALPHA_TAISHO);
      fireEvent.click(screen.getByRole('button', { name: t('ui.common.cancel') }));
      expect(game).toEqual(before);
      expect(getQueuedPlayerCommands(game)).toEqual([]);
      fireEvent.change(select, { target: { value: target ?? '' } });
      fireEvent.click(screen.getByRole('button', { name: t('ui.common.confirm') }));
      expect(getQueuedPlayerCommands(game)).toEqual([
        {
          type: 'grantFief',
          clanId: game.meta.playerClanId,
          districtId: DIST_A1X,
          officerId: target,
        },
      ]);
      expect(game).toEqual(before);
      const loyalty = game.officers[OFF_ALPHA_TAISHO]!.loyalty;
      act(() => {
        runOneDay();
      });
      expect(game.districts[DIST_A1X]!.stewardId).toBe(target);
      expect(game.officers[OFF_ALPHA_TAISHO]!.loyalty).toBe(
        Math.max(0, loyalty - BAL.loyaltyReduceFief),
      );
      expect(validateState(game)).toEqual([]);
    },
  );
  it('displays full ordinary candidate context and no-owner assignment queues without confirmation', () => {
    const game = fixture(false);
    game.officers[OFF_ALPHA_BUSHO]!.pol = BAL.abilityMax - 1;
    game.officers[OFF_ALPHA_BUSHO]!.statGrowth.pol = BAL.statGrowthCap;
    const before = structuredClone(game);
    render(<DistrictPanel districtId={DIST_A1X} />);
    const candidate = screen.getByRole('option', {
      name: new RegExp(game.officers[OFF_ALPHA_BUSHO]!.name),
    });
    expect(candidate.textContent).toContain(String(BAL.abilityMax));
    expect(candidate.textContent).toContain(
      t('ui.reward.fiefCount', { count: 0, cap: BAL.fiefMaxByRank[3] }),
    );
    fireEvent.change(screen.getByRole('combobox'), { target: { value: OFF_ALPHA_BUSHO } });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(getQueuedPlayerCommands(game)).toHaveLength(1);
    expect(game).toEqual(before);
  });
  it('discards old consent on a real session replacement and district switch', () => {
    const game = fixture();
    const { rerender } = render(<DistrictPanel districtId={DIST_A1X} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } });
    expect(screen.getByRole('dialog')).toBeTruthy();
    const replacement = buildTinyState();
    act(() => {
      setGame(replacement);
      initializeBridgeSession(replacement);
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(getQueuedPlayerCommands(replacement)).toEqual([]);
    rerender(<DistrictPanel districtId={DIST_A1Y} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(game.districts[DIST_A1X]!.stewardId).toBe(OFF_ALPHA_TAISHO);
  });
});
