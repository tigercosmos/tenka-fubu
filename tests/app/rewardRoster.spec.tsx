import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RewardRoster } from '../../src/ui/screens/RewardRoster';
import { bumpTickSeq, resetGameStoreForTests, setGame, store } from '../../src/app/store';
import { getQueuedPlayerCommands, resetBridgeForTests, runOneDay } from '../../src/app/bridge';
import { validateState } from '../../src/core/state/invariants';
import { rewardOfficerCost } from '../../src/core/systems/officers';
import { validateCommand } from '../../src/core/index';
import { BAL } from '../../src/core/balance';
import { RANK_VALUES } from '../../src/core/state/enums';
import type { OfficerId } from '../../src/core/state/ids';
import { buildOfficerRows, sortOfficerRows } from '../../src/ui/screens/OfficerList';
import { UI } from '../../src/ui/uiConstants';
import { t, formatNumber } from '../../src/i18n/zh-TW';
import { uiStore } from '../../src/ui/hooks/uiStore';
import {
  buildTinyState,
  OFF_ALPHA_BUSHO,
  OFF_ALPHA_TAISHO,
  OFF_ALPHA_LORD,
  OFF_BETA_LORD,
} from '../fixtures/tiny';

beforeEach(() => {
  resetBridgeForTests();
  uiStore.getState().actions.reset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  resetBridgeForTests();
  resetGameStoreForTests();
});

function fixture() {
  const game = buildTinyState();
  game.officers[OFF_ALPHA_BUSHO]!.loyalty = 99;
  game.officers[OFF_ALPHA_BUSHO]!.rewardGiftsThisYear = 2;
  game.officers[OFF_ALPHA_BUSHO]!.merit = 0;
  game.officers[OFF_ALPHA_TAISHO]!.loyalty = 99;
  game.officers[OFF_ALPHA_TAISHO]!.merit = 1;
  expect(validateState(game)).toEqual([]);
  resetGameStoreForTests(game);
  store.getState().actions.setScreen('main');
  return game;
}
function row(name: string) {
  return screen.getByRole('row', { name: new RegExp(name) });
}

describe('canonical reward roster', () => {
  it('virtualizes 600 valid adult player officers at 40px and renders the correct late-row facts', async () => {
    const game = fixture();
    const initialCount = buildOfficerRows(game).length;
    const template = game.officers[OFF_ALPHA_BUSHO]!;
    for (let index = initialCount; index < 600; index += 1) {
      const id = `off.reward-${String(index).padStart(4, '0')}` as OfficerId;
      game.officers[id] = {
        ...structuredClone(template),
        id,
        name: id,
        loyalty: index % 100,
        rewardGiftsThisYear: index % 3,
        armyId: null,
        spouseId: null,
      };
    }
    expect(validateState(game)).toEqual([]);
    const ordered = sortOfficerRows(buildOfficerRows(game), { key: 'loyalty', dir: 'asc' });
    expect(ordered).toHaveLength(600);
    const late = ordered[580]!;
    const officer = game.officers[late.id]!;
    expect(officer.name).toBe(late.id);
    const before = structuredClone(game);
    // jsdom has no layout. This controlled200px viewport proves DOM windowing, not pixel geometry.
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (
      this: HTMLElement,
    ) {
      return this.className.includes('viewport') ? 200 : 0;
    });
    render(<RewardRoster onClose={vi.fn()} />);
    const table = screen.getByRole('table');
    const initialRows = table.querySelectorAll('tbody tr:not([aria-hidden])');
    expect(initialRows).toHaveLength(Math.ceil(200 / 40) + UI.tableOverscanRows + 1);
    expect(initialRows.length).toBeLessThan(20);
    expect((initialRows[0] as HTMLElement).style.height).toBe('40px');
    expect(within(table).queryByText(late.id)).toBeNull();
    const viewport = table.parentElement!;
    fireEvent.scroll(viewport, { target: { scrollTop: 580 * 40 } });
    await waitFor(() => expect(within(table).getByText(late.id)).toBeTruthy());
    const lateRow = row(late.id);
    expect(lateRow.querySelectorAll('td')[2]!.textContent).toBe(
      formatNumber(officer.rewardGiftsThisYear),
    );
    for (const tier of ['small', 'medium', 'large'] as const) {
      const raw = Math.max(
        1,
        Math.floor(
          {
            small: BAL.rewardGoldSmallLoyalty,
            medium: BAL.rewardGoldMediumLoyalty,
            large: BAL.rewardGoldLargeLoyalty,
          }[tier] /
            2 ** officer.rewardGiftsThisYear,
        ),
      );
      expect(
        within(lateRow).getByRole('button', {
          name: t('ui.officer.rewardOffer', {
            tier: t(`term.reward.${tier}`),
            gold: rewardOfficerCost(tier),
            loyalty: Math.min(raw, 100 - officer.loyalty),
          }),
        }),
      ).toBeTruthy();
    }
    expect(table.querySelectorAll('tbody tr:not([aria-hidden])')).toHaveLength(
      Math.ceil(200 / 40) + 2 * UI.tableOverscanRows + 1,
    );
    expect(game).toEqual(before);
    expect(game.rng).toEqual(before.rng);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    expect(validateState(game)).toEqual([]);
  });
  it('shows loyalty ascending, merit descending ties, actual annual counts/gains and known expenditure without writes', () => {
    const game = fixture();
    const before = structuredClone(game);
    render(<RewardRoster onClose={vi.fn()} />);
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.map((node) => node.textContent)).toEqual([
      expect.stringContaining(game.officers[OFF_ALPHA_TAISHO]!.name),
      expect.stringContaining(game.officers[OFF_ALPHA_BUSHO]!.name),
      expect.stringContaining(game.officers[OFF_ALPHA_LORD]!.name),
    ]);
    const busho = row(game.officers[OFF_ALPHA_BUSHO]!.name);
    expect(within(busho).getByText('2')).toBeTruthy();
    for (const tier of ['small', 'medium', 'large'] as const) {
      expect(
        within(busho).getByRole('button', {
          name: t('ui.officer.rewardOffer', {
            tier: t(`term.reward.${tier}`),
            gold: rewardOfficerCost(tier),
            loyalty: 1,
          }),
        }),
      ).toBeTruthy();
    }
    expect(screen.getByText(t('ui.reward.monthSpent', { gold: formatNumber(0) }))).toBeTruthy();
    expect(screen.queryByText(game.officers[OFF_BETA_LORD]!.name)).toBeNull();
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
  });

  it('uses stable ID ties, excludes nonserving and predebut officers, and displays unknown total honestly', () => {
    const game = fixture();
    game.clans[game.meta.playerClanId]!.rewardGoldSpentThisMonth = null;
    game.officers[OFF_ALPHA_BUSHO]!.hasComeOfAge = false;
    game.officers[OFF_ALPHA_BUSHO]!.status = 'ronin';
    game.officers[OFF_ALPHA_BUSHO]!.clanId = null;
    game.officers[OFF_ALPHA_TAISHO]!.loyalty = 100;
    game.officers[OFF_ALPHA_TAISHO]!.merit = 0;
    expect(validateState(game)).toEqual([]);
    render(<RewardRoster onClose={vi.fn()} />);
    expect(screen.getByText(t('ui.reward.monthSpentUnknown'))).toBeTruthy();
    expect(screen.queryByText(game.officers[OFF_ALPHA_BUSHO]!.name)).toBeNull();
    expect(
      within(row(game.officers[OFF_ALPHA_TAISHO]!.name)).getByRole('button', {
        name: t('ui.officer.rewardOffer', {
          tier: t('term.reward.small'),
          gold: rewardOfficerCost('small'),
          loyalty: 0,
        }),
      }),
    ).toBeTruthy();
    const names = within(screen.getByRole('table'))
      .getAllByRole('row')
      .slice(1)
      .map((node) => node.textContent);
    const expected = [OFF_ALPHA_LORD, OFF_ALPHA_TAISHO].sort();
    expect(names).toHaveLength(expected.length);
    expected.forEach((id, index) => expect(names[index]).toContain(game.officers[id]!.name));
  });

  it('queues exactly one legal reward without early settlement then refreshes actual count/expense', () => {
    const game = fixture();
    const before = structuredClone(game);
    render(<RewardRoster onClose={vi.fn()} />);
    const busho = row(game.officers[OFF_ALPHA_BUSHO]!.name);
    fireEvent.click(
      within(busho).getByRole('button', {
        name: t('ui.officer.rewardOffer', {
          tier: t('term.reward.small'),
          gold: rewardOfficerCost('small'),
          loyalty: 1,
        }),
      }),
    );
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toHaveLength(1);
    act(() => {
      runOneDay();
    });
    expect(game.officers[OFF_ALPHA_BUSHO]!.loyalty).toBe(100);
    expect(game.officers[OFF_ALPHA_BUSHO]!.rewardGiftsThisYear).toBe(3);
    expect(
      screen.getByText(
        t('ui.reward.monthSpent', { gold: formatNumber(rewardOfficerCost('small')) }),
      ),
    ).toBeTruthy();
    expect(validateState(game)).toEqual([]);
  });

  it('uses central promotion eligibility and keeps the fief subview inside one paused dialog', () => {
    const game = fixture();
    const close = vi.fn();
    render(<RewardRoster onClose={close} />);
    const busho = row(game.officers[OFF_ALPHA_BUSHO]!.name);
    expect(
      within(busho)
        .getByRole('button', { name: t('cmd.officer.promote') })
        .hasAttribute('disabled'),
    ).toBe(true);
    const before = structuredClone(game);
    const speed = store.getState().session.speed;
    fireEvent.click(within(busho).getByRole('button', { name: t('ui.reward.fief') }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByTestId('reward-fief-pane')).toBeTruthy();
    expect(close).not.toHaveBeenCalled();
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    expect(store.getState().session.speed).toBe(speed);
  });

  it('submits a genuinely eligible promotion through the unchanged command queue', () => {
    const game = fixture();
    const officer = game.officers[OFF_ALPHA_BUSHO]!;
    const previousRank = officer.rank;
    officer.merit = BAL.rankMeritThresholds[RANK_VALUES.indexOf(officer.rank) + 1]!;
    const command = {
      type: 'promoteRank' as const,
      clanId: game.meta.playerClanId,
      officerId: officer.id,
    };
    expect(validateState(game)).toEqual([]);
    expect(validateCommand(game, command)).toEqual({ ok: true });
    const before = structuredClone(game);
    render(<RewardRoster onClose={vi.fn()} />);
    const button = within(row(officer.name)).getByRole('button', {
      name: t('cmd.officer.promote'),
    });
    expect(button.hasAttribute('disabled')).toBe(false);
    fireEvent.click(button);
    expect(getQueuedPlayerCommands(game)).toEqual([command]);
    expect(game).toEqual(before);
    act(() => {
      runOneDay();
    });
    expect(officer.rank).toBe(RANK_VALUES[RANK_VALUES.indexOf(previousRank) + 1]);
    expect(validateState(game)).toEqual([]);
  });

  it('refreshes mutable facts and resets the fief subview on same-ID game replacement', () => {
    const game = fixture();
    render(<RewardRoster onClose={vi.fn()} />);
    act(() => {
      game.officers[OFF_ALPHA_BUSHO]!.loyalty = 1;
      bumpTickSeq();
    });
    expect(within(screen.getByRole('table')).getAllByRole('row')[1]!.textContent).toContain(
      game.officers[OFF_ALPHA_BUSHO]!.name,
    );
    fireEvent.click(
      within(row(game.officers[OFF_ALPHA_BUSHO]!.name)).getByRole('button', {
        name: t('ui.reward.fief'),
      }),
    );
    const replacement = buildTinyState();
    const before = structuredClone(replacement);
    act(() => setGame(replacement));
    expect(screen.queryByTestId('reward-fief-pane')).toBeNull();
    expect(screen.getByRole('table')).toBeTruthy();
    expect(replacement).toEqual(before);
    expect(getQueuedPlayerCommands(replacement)).toEqual([]);
  });
});
