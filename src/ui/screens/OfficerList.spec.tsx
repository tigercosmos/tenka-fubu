import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { UI } from '../uiConstants';
import { t } from '@i18n/zh-TW';
import userEvent from '@testing-library/user-event';
import { bumpTickSeq, resetGameStoreForTests, setGame } from '@app/store';
import { getQueuedPlayerCommands, initializeBridgeSession, resetBridgeForTests } from '@app/bridge';
import type { OfficerId, TraitId } from '@core/state/ids';
import { buildTinyState, OFF_ALPHA_BUSHO, OFF_ALPHA_TAISHO } from '../../../tests/fixtures/tiny';
import { uiStore } from '../hooks/uiStore';
import { OfficerDetail } from './OfficerDetail';
import cssModule from './OfficerList.module.css';
// These literal classes are verified against the actual CSS source below.
const styles = cssModule as { loyaltyDanger: string; loyaltyWarning: string };
import {
  buildOfficerRows,
  filterOfficerRows,
  OfficerList,
  sortOfficerRows,
  type OfficerRow,
} from './OfficerList';

beforeEach(() => {
  resetBridgeForTests();
  uiStore.getState().actions.reset();
});

afterEach(() => {
  cleanup();
  uiStore.getState().actions.setUiScale(1);
  vi.restoreAllMocks();
  resetGameStoreForTests();
  resetBridgeForTests();
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
    traits: '',
    loyalty: 50,
    location: '清洲城',
    locationCastleId: null,
    role: 'none',
    roleLabel: '無役職',
    loyaltyRisk: false,
  };
}

describe('officer row projection and sorting', () => {
  it('keeps detached trait text single-line and preserves unknown legacy IDs without invented names', () => {
    const game = buildTinyState();
    const officer = game.officers[OFF_ALPHA_TAISHO]!;
    officer.traits = ['trait.heitan', 'trait.unknown-legacy'] as TraitId[];
    const before = structuredClone(game);
    const projected = buildOfficerRows(game).find((row) => row.id === officer.id)!;
    expect(projected.traits).toBe('兵站上手、trait.unknown-legacy');
    expect(game).toEqual(before);
    officer.traits.length = 0;
    expect(projected.traits).toBe('兵站上手、trait.unknown-legacy');
    const css = readFileSync('src/ui/screens/OfficerList.module.css', 'utf8');
    expect(css).toMatch(/\.traits\s*\{[^}]*white-space:\s*nowrap/);
    expect(css).toMatch(/\.traits\s*\{[^}]*text-overflow:\s*ellipsis/);
  });
  it('shows actual merit and detached trait names in stable authored order without gameplay writes', () => {
    const game = buildTinyState();
    const officer = game.officers[OFF_ALPHA_TAISHO]!;
    officer.merit = 1234;
    officer.traits = ['trait.heitan', 'trait.gunshin'] as TraitId[];
    game.officers[OFF_ALPHA_BUSHO]!.traits = [];
    resetGameStoreForTests(game);
    initializeBridgeSession(game);
    const before = structuredClone(game);
    render(<OfficerList onClose={vi.fn()} onOpenOfficer={vi.fn()} />);
    expect(screen.getByRole('columnheader', { name: t('ui.officer.merit') })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: t('ui.officer.traits') })).toBeTruthy();
    const row = screen.getByText(officer.name).closest('tr')!;
    expect(within(row).getByText('1,234')).toBeTruthy();
    expect(within(row).getByText('兵站上手、軍神')).toBeTruthy();
    expect(
      within(screen.getByText(game.officers[OFF_ALPHA_BUSHO]!.name).closest('tr')!).getByText(
        t('ui.common.noData'),
      ),
    ).toBeTruthy();
    // DataTable represents a non-sortable header with its existing disabled button.
    expect(
      screen.getByRole('button', { name: t('ui.officer.traits') }).hasAttribute('disabled'),
    ).toBe(true);
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
  });
  it('sorts displayed merit numerically and refreshes content after ticks and replacement', () => {
    const game = buildTinyState();
    const officer = game.officers[OFF_ALPHA_TAISHO]!;
    const other = game.officers[OFF_ALPHA_BUSHO]!;
    officer.merit = 9;
    other.merit = 100;
    resetGameStoreForTests(game);
    initializeBridgeSession(game);
    render(<OfficerList onClose={vi.fn()} onOpenOfficer={vi.fn()} />);
    const header = screen.getByRole('button', { name: t('ui.officer.merit') });
    fireEvent.click(header);
    fireEvent.click(header);
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(rows.findIndex((row) => row.textContent?.includes(other.name))).toBeLessThan(
      rows.findIndex((row) => row.textContent?.includes(officer.name)),
    );
    act(() => {
      officer.merit = 321;
      officer.traits = ['trait.chushin' as TraitId];
      bumpTickSeq();
    });
    expect(within(screen.getByText(officer.name).closest('tr')!).getByText('321')).toBeTruthy();
    expect(within(screen.getByText(officer.name).closest('tr')!).getByText('忠臣')).toBeTruthy();
    const replacement = buildTinyState();
    replacement.officers[officer.id]!.merit = 654;
    replacement.officers[officer.id]!.traits = [];
    const before = structuredClone(replacement);
    act(() => setGame(replacement));
    const row = screen.getByText(officer.name).closest('tr')!;
    expect(within(row).getByText('654')).toBeTruthy();
    expect(within(row).getByText(t('ui.common.noData'))).toBeTruthy();
    expect(replacement).toEqual(before);
    expect(getQueuedPlayerCommands(replacement)).toEqual([]);
  });
  it.each([29, 30, 49, 50])(
    'colors only the loyalty text at boundary %s without changing game or queue',
    (loyalty) => {
      const game = buildTinyState();
      const officer = game.officers[OFF_ALPHA_TAISHO]!;
      officer.loyalty = loyalty;
      resetGameStoreForTests(game);
      initializeBridgeSession(game);
      const before = structuredClone(game);
      const queued = getQueuedPlayerCommands(game);
      render(<OfficerList onClose={vi.fn()} onOpenOfficer={vi.fn()} />);
      const name = screen.getByText(officer.name);
      const tableRow = name.closest('tr')!;
      const text = within(tableRow).getByText(String(loyalty));
      expect(text.classList.contains(styles.loyaltyDanger)).toBe(loyalty < 30);
      expect(text.classList.contains(styles.loyaltyWarning)).toBe(loyalty >= 30 && loyalty < 50);
      expect(name.classList.contains(styles.loyaltyDanger)).toBe(false);
      expect(name.classList.contains(styles.loyaltyWarning)).toBe(false);
      expect(tableRow.querySelector('[data-loyalty-risk="true"]') !== null).toBe(loyalty < 30);
      expect(game).toEqual(before);
      expect(getQueuedPlayerCommands(game)).toEqual(queued);
    },
  );
  it('uses established readable red and yellow-gold tokens for loyalty text, retaining the row tint', () => {
    const css = readFileSync('src/ui/screens/OfficerList.module.css', 'utf8');
    expect(css).toMatch(/\.loyaltyDanger\s*\{[^}]*color:\s*var\(--status-danger\)/);
    expect(css).toMatch(/\.loyaltyWarning\s*\{[^}]*color:\s*var\(--status-warning\)/);
    expect(css).toContain("tr:has([data-loyalty-risk='true'])");
  });
  it('refreshes loyalty-only colors on tick revisions and same-ID game replacement', () => {
    const game = buildTinyState();
    const officer = game.officers[OFF_ALPHA_TAISHO]!;
    resetGameStoreForTests(game);
    initializeBridgeSession(game);
    render(<OfficerList onClose={vi.fn()} onOpenOfficer={vi.fn()} />);
    for (const loyalty of [30, 29, 30, 49, 50, 49]) {
      act(() => {
        officer.loyalty = loyalty;
        bumpTickSeq();
      });
      const before = structuredClone(game);
      const name = screen.getByText(officer.name);
      const row = name.closest('tr')!;
      const text = within(row).getByText(String(loyalty));
      expect(text.classList.contains(styles.loyaltyDanger)).toBe(loyalty < 30);
      expect(text.classList.contains(styles.loyaltyWarning)).toBe(loyalty >= 30 && loyalty < 50);
      for (const other of row.querySelectorAll('span')) {
        if (other === text) continue;
        expect(other.classList.contains(styles.loyaltyDanger)).toBe(false);
        expect(other.classList.contains(styles.loyaltyWarning)).toBe(false);
      }
      expect(game).toEqual(before);
      expect(getQueuedPlayerCommands(game)).toEqual([]);
    }
    const replacement = buildTinyState();
    replacement.officers[officer.id]!.loyalty = 50;
    const before = structuredClone(replacement);
    act(() => setGame(replacement));
    const name = screen.getByText(officer.name);
    const text = within(name.closest('tr')!).getByText('50');
    expect(text.classList.contains(styles.loyaltyWarning)).toBe(false);
    expect(text.classList.contains(styles.loyaltyDanger)).toBe(false);
    expect(replacement).toEqual(before);
    expect(getQueuedPlayerCommands(replacement)).toEqual([]);
  });
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
  it('allocates remaining flex height below nonshrinking header/filters instead of expanding the viewport', () => {
    const layoutCss = readFileSync('src/ui/screens/OfficerList.module.css', 'utf8');
    expect(layoutCss).toMatch(
      /\.panel > section\s*\{[^}]*display: flex;[^}]*flex-direction: column;[^}]*min-height: 0;/u,
    );
    expect(layoutCss).toMatch(/\.panel > section > header\s*\{[^}]*flex-shrink: 0;/u);
    expect(layoutCss).toMatch(/\.panel > section > div\s*\{[^}]*flex: 1;[^}]*min-height: 0;/u);
    expect(layoutCss).toMatch(/\.tableShell\s*\{[^}]*flex: 1;[^}]*min-height: 0;/u);
    expect(layoutCss).toMatch(/\.tableShell > div\s*\{[^}]*flex: 1 1 0;[^}]*min-height: 0;/u);
    expect(layoutCss).toMatch(/\.filters\s*\{[^}]*flex-shrink: 0;/u);
  });
  it.each([0.8, 1, 1.5])(
    'uses the measured constrained table viewport for650rowvirtualization atscale%s',
    (scale) => {
      const game = buildTinyState();
      const count = buildOfficerRows(game).length;
      const template = game.officers[OFF_ALPHA_BUSHO]!;
      for (let index = count; index < 650; index++) {
        const id = `off.viewport-${index}` as OfficerId;
        game.officers[id] = { ...template, id, name: `測試武將${index}` };
      }
      expect(buildOfficerRows(game)).toHaveLength(650);
      resetGameStoreForTests(game);
      uiStore.getState().actions.setUiScale(scale);
      vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (
        this: HTMLElement,
      ) {
        return this.className.includes('viewport') ? 200 : 0;
      });
      render(<OfficerList onClose={vi.fn()} onOpenOfficer={vi.fn()} />);
      const table = screen.getByRole('table');
      // jsdom has no flex layout. Simulate its measured200px remaining box to assert the real
      // DataTable observes that box, rather than using the preferred720px prop for virtual math.
      expect(table.querySelectorAll('tbody tr:not([aria-hidden])').length).toBe(
        Math.ceil(200 / (40 * scale)) + UI.tableOverscanRows + 1,
      );
      expect(table.querySelectorAll('tbody tr:not([aria-hidden])').length).toBeLessThan(20);
    },
  );
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
    expect(
      within(detail).getByText(new RegExp(officer.name), { selector: 'header span' }),
    ).toBeTruthy();
    expect(within(detail).getByRole('img', { name: `政務 ${officer.pol + 2}` })).toBeTruthy();
    expect(within(detail).getByText('人望')).toBeTruthy();
    expect(within(detail).getByText('功績')).toBeTruthy();
  });
});
