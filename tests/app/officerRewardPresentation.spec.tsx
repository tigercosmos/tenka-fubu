import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OfficerActions } from '../../src/ui/screens/OfficerActions';
import { bumpTickSeq, resetGameStoreForTests, setGame } from '../../src/app/store';
import { getQueuedPlayerCommands, resetBridgeForTests, runOneDay } from '../../src/app/bridge';
import { rewardOfficerCost, rewardOfficerLoyaltyGain } from '../../src/core/systems/officers';
import { validateCommand } from '../../src/core/index';
import { validateState } from '../../src/core/state/invariants';
import { t } from '../../src/i18n/zh-TW';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { buildTinyState, CLAN_ALPHA, OFF_ALPHA_BUSHO, OFF_ALPHA_TAISHO } from '../fixtures/tiny';

beforeEach(() => {
  resetBridgeForTests();
  uiStore.getState().actions.reset();
});
afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests();
});

function fixture(count = 0, loyalty = 60) {
  const game = buildTinyState();
  const officer = game.officers[OFF_ALPHA_BUSHO]!;
  officer.rewardGiftsThisYear = count;
  officer.loyalty = loyalty;
  expect(validateState(game)).toEqual([]);
  resetGameStoreForTests(game);
  return { game, officer };
}

function tierLabel(tier: 'small' | 'medium' | 'large', loyalty: number) {
  return t('ui.officer.rewardOffer', {
    tier: t(`term.reward.${tier}`),
    gold: rewardOfficerCost(tier),
    loyalty,
  });
}

describe('canonical officer reward presentation', () => {
  it.each([0, 2])(
    'shows actual annual count %s and diminishing tier gains without writes',
    (count) => {
      const { game, officer } = fixture(count);
      const before = structuredClone(game);
      render(<OfficerActions officerId={officer.id} />);
      expect(screen.getByText(t('ui.officer.rewardGiftsThisYear', { count }))).toBeTruthy();
      for (const tier of ['small', 'medium', 'large'] as const) {
        expect(
          screen.getByRole('button', {
            name: tierLabel(tier, rewardOfficerLoyaltyGain(officer, tier)),
          }),
        ).toBeTruthy();
      }
      expect(game).toEqual(before);
      expect(getQueuedPlayerCommands(game)).toEqual([]);
    },
  );

  it.each([99, 100])('previews the real capped change at loyalty %s for every tier', (loyalty) => {
    const { game, officer } = fixture(2, loyalty);
    const before = structuredClone(game);
    render(<OfficerActions officerId={officer.id} />);
    for (const tier of ['small', 'medium', 'large'] as const) {
      expect(
        screen
          .getByRole('button', { name: tierLabel(tier, 100 - loyalty) })
          .hasAttribute('disabled'),
      ).toBe(false);
    }
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
  });

  it('refreshes same-object facts on tick and same-ID replacement without mutating either game', () => {
    const { game, officer } = fixture();
    const { rerender } = render(<OfficerActions officerId={officer.id} />);
    act(() => {
      officer.rewardGiftsThisYear = 2;
      officer.loyalty = 99;
      bumpTickSeq();
    });
    expect(screen.getByText(t('ui.officer.rewardGiftsThisYear', { count: 2 }))).toBeTruthy();
    expect(screen.getByRole('button', { name: tierLabel('large', 1) })).toBeTruthy();
    const original = structuredClone(game);
    const replacement = buildTinyState();
    replacement.officers[OFF_ALPHA_TAISHO]!.rewardGiftsThisYear = 3;
    replacement.officers[OFF_ALPHA_TAISHO]!.loyalty = 100;
    const before = structuredClone(replacement);
    act(() => setGame(replacement));
    expect(screen.getByText(t('ui.officer.rewardGiftsThisYear', { count: 0 }))).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: tierLabel(
          'large',
          rewardOfficerLoyaltyGain(replacement.officers[officer.id]!, 'large'),
        ),
      }),
    ).toBeTruthy();
    expect(game).toEqual(original);
    expect(replacement).toEqual(before);
    expect(getQueuedPlayerCommands(replacement)).toEqual([]);
    rerender(<OfficerActions officerId={OFF_ALPHA_TAISHO} />);
    expect(screen.getByText(t('ui.officer.rewardGiftsThisYear', { count: 3 }))).toBeTruthy();
    expect(screen.getByRole('button', { name: tierLabel('large', 0) })).toBeTruthy();
    expect(replacement).toEqual(before);
  });

  it('queues one real legal reward, then reflects the actual day settlement count and clamped gain', () => {
    const { game, officer } = fixture(0, 99);
    const command = {
      type: 'rewardOfficer' as const,
      clanId: CLAN_ALPHA,
      officerId: officer.id,
      tier: 'small' as const,
    };
    expect(validateCommand(game, command)).toEqual({ ok: true });
    const before = structuredClone(game);
    render(<OfficerActions officerId={officer.id} />);
    fireEvent.click(screen.getByRole('button', { name: tierLabel('small', 1) }));
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([command]);
    act(() => {
      runOneDay();
    });
    expect(officer.rewardGiftsThisYear).toBe(1);
    expect(officer.loyalty).toBe(100);
    expect(game.time.day).toBe(before.time.day + 1);
    expect(validateState(game)).toEqual([]);
    expect(screen.getByText(t('ui.officer.rewardGiftsThisYear', { count: 1 }))).toBeTruthy();
    for (const tier of ['small', 'medium', 'large'] as const) {
      expect(screen.getByRole('button', { name: tierLabel(tier, 0) })).toBeTruthy();
    }
    expect(getQueuedPlayerCommands(game)).toEqual([]);
  });
});
