import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { resetGameStoreForTests } from '@app/store';
import type { OfficerId, TraitId } from '@core/state/ids';
import { buildTinyState, OFF_ALPHA_BUSHO, OFF_ALPHA_TAISHO } from '../../../tests/fixtures/tiny';
import { uiStore } from '../hooks/uiStore';
import { OfficerDetail } from './OfficerDetail';
import {
  buildOfficerRows,
  filterOfficerRows,
  OfficerList,
  sortOfficerRows,
  type OfficerRow,
} from './OfficerList';

beforeEach(() => {
  uiStore.getState().actions.reset();
});

afterEach(() => {
  cleanup();
  resetGameStoreForTests();
});

function row(id: string, rankIndex: number, merit: number, name = '同名'): OfficerRow {
  return {
    id: id as OfficerId,
    name,
    ldr: 50,
    val: 50,
    int: 50,
    pol: 50,
    rank: 'kumigashira',
    rankIndex,
    merit,
    loyalty: 50,
    location: '清洲城',
    locationCastleId: null,
    role: 'none',
    roleLabel: '無役職',
    loyaltyRisk: false,
  };
}

describe('officer row projection and sorting', () => {
  it('uses effective stats and only projects serving player officers', () => {
    const game = buildTinyState();
    const officer = game.officers[OFF_ALPHA_TAISHO]!;
    officer.statGrowth.ldr = 3;
    const rows = buildOfficerRows(game);
    expect(rows.find((candidate) => candidate.id === officer.id)?.ldr).toBe(officer.ldr + 3);
    expect(
      rows.every((candidate) => game.officers[candidate.id]?.clanId === game.meta.playerClanId),
    ).toBe(true);
  });

  it('sorts by primary, then merit descending, then officer id ascending', () => {
    const rows = [
      row('off.z', 2, 10),
      row('off.b', 2, 20),
      row('off.a', 2, 20),
      row('off.low', 1, 999),
    ];
    expect(sortOfficerRows(rows).map((candidate) => candidate.id)).toEqual([
      'off.a',
      'off.b',
      'off.z',
      'off.low',
    ]);
    expect(
      filterOfficerRows(rows, {
        search: '同',
        castleId: 'all',
        rank: 'all',
        role: 'none',
      }),
    ).toHaveLength(4);
  });

  it('sorts and filters 600 rows comfortably within the M3-21 budget', () => {
    const rows = Array.from({ length: 600 }, (_, index) =>
      row(`off.${String(index).padStart(4, '0')}`, index % 6, 600 - index, `武將${index}`),
    );
    const started = performance.now();
    const result = sortOfficerRows(
      filterOfficerRows(rows, {
        search: '武將',
        castleId: 'all',
        rank: 'all',
        role: 'all',
      }),
    );
    expect(result).toHaveLength(600);
    expect(performance.now() - started).toBeLessThan(50);
  });
});

describe('OfficerList', () => {
  it('filters by search, marks low loyalty, and opens the clicked officer detail', async () => {
    const game = buildTinyState();
    game.officers[OFF_ALPHA_TAISHO]!.loyalty = 29;
    resetGameStoreForTests(game);
    const user = userEvent.setup();
    const onOpenOfficer = vi.fn();
    render(<OfficerList onClose={vi.fn()} onOpenOfficer={onOpenOfficer} />);

    expect(screen.getByTestId('officer-list')).toBeTruthy();
    expect(document.querySelector('[data-loyalty-risk="true"]')).not.toBeNull();
    const targetName = game.officers[OFF_ALPHA_TAISHO]!.name;
    await user.clear(screen.getByRole('searchbox', { name: '搜尋武將' }));
    await user.type(screen.getByRole('searchbox', { name: '搜尋武將' }), targetName);
    const table = screen.getByRole('table');
    expect(within(table).getByText(targetName)).toBeTruthy();
    fireEvent.click(within(table).getByText(targetName));
    expect(onOpenOfficer).toHaveBeenCalledWith(OFF_ALPHA_TAISHO);
  });
});

describe('OfficerDetail', () => {
  it('shows effective stats, traits, merit, and fief/role information', () => {
    const game = buildTinyState();
    const officer = game.officers[OFF_ALPHA_BUSHO]!;
    officer.statGrowth.pol = 2;
    officer.traits = ['trait.jinbo' as TraitId];
    resetGameStoreForTests(game);
    render(<OfficerDetail officerId={officer.id} onClose={vi.fn()} />);

    const detail = screen.getByTestId('officer-detail');
    expect(within(detail).getByText(new RegExp(officer.name))).toBeTruthy();
    expect(within(detail).getByRole('img', { name: `政務 ${officer.pol + 2}` })).toBeTruthy();
    expect(within(detail).getByText('人望')).toBeTruthy();
    expect(within(detail).getByText('功績')).toBeTruthy();
  });
});
