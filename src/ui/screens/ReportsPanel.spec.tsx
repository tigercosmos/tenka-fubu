import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReportsPanel } from './ReportsPanel';
import { resetGameStoreForTests, store, bumpTickSeq, setGame } from '@app/store';
import { useUIStore } from '../hooks/uiStore';
import type { ReportId } from '@core/state/ids';
import { calendarToDay } from '@core/index';
import { t } from '@i18n/zh-TW';
import { buildTinyState, CLAN_ALPHA, CASTLE_A1 } from '../../../tests/fixtures/tiny';

beforeEach(() => useUIStore.getState().actions.reset());
afterEach(() => {
  cleanup();
  resetGameStoreForTests(null);
  useUIStore.getState().actions.reset();
});
function fixture(count = 1) {
  const game = buildTinyState();
  game.reports = Array.from({ length: count }, (_, i) => ({
    id: `rep.${String(i + 1).padStart(6, '0')}` as ReportId,
    day: calendarToDay(1560, 4, 1) + i,
    read: false,
    event: {
      type: 'economy.income',
      day: calendarToDay(1560, 4, 1) + i,
      clanId: CLAN_ALPHA,
      clanIds: [CLAN_ALPHA],
      gold: i + 1,
      foodByCastle: {},
    },
  }));
  return game;
}
function mount(game = fixture()) {
  resetGameStoreForTests(game);
  const onGoto = vi.fn();
  render(<ReportsPanel onGoto={onGoto} />);
  return { game, onGoto };
}
function rows() {
  return screen.getByRole('list').querySelectorAll('li');
}
function category(name: string) {
  return screen.getByRole('checkbox', { name });
}

describe('ReportsPanel complete retained-report center', () => {
  it('shows six native category filters and newest-first rows without changing core/read/RNG', () => {
    const game = fixture(3),
      before = structuredClone(game);
    const { onGoto } = mount(game);
    expect(screen.getAllByRole('option', { name: '1560年4月' })).toHaveLength(2);
    expect(screen.queryByRole('option', { name: '1,560年4月' })).toBeNull();
    for (const value of ['domestic', 'military', 'diplomacy', 'personnel', 'event', 'system']) {
      expect(category(t(`ui.reports.category.${value}`))).toHaveProperty('checked', true);
    }
    expect(rows()).toHaveLength(3);
    expect(rows()[0]!.textContent).toContain('收入3貫');
    fireEvent.click(category(t('ui.reports.category.domestic')));
    expect(rows()).toHaveLength(0);
    expect(screen.getByText(t('ui.reports.empty'))).toBeTruthy();
    expect(onGoto).not.toHaveBeenCalled();
    expect(game).toEqual(before);
  });

  it('important-only keeps warning/critical, and goto only runs on explicit available button', () => {
    const game = fixture();
    game.reports.unshift({
      id: 'rep.000002' as ReportId,
      day: game.time.day,
      read: false,
      event: {
        type: 'economy.foodShortage',
        day: game.time.day,
        clanIds: [CLAN_ALPHA],
        clanId: CLAN_ALPHA,
        castleId: CASTLE_A1,
      },
    });
    const { onGoto } = mount(game);
    const unavailable = within(rows()[1] as HTMLElement).getByRole('button', {
      name: t('ui.reports.goto'),
    });
    expect(unavailable).toHaveProperty('disabled', true);
    expect(unavailable.getAttribute('title')).toBe(t('ui.reports.gotoUnavailable'));
    fireEvent.click(unavailable);
    expect(onGoto).not.toHaveBeenCalled();
    fireEvent.click(category(t('ui.reports.importantOnly')));
    expect(rows()).toHaveLength(1);
    fireEvent.click(
      within(rows()[0] as HTMLElement).getByRole('button', { name: t('ui.reports.goto') }),
    );
    const castle = game.castles[CASTLE_A1]!;
    expect(onGoto).toHaveBeenCalledOnce();
    expect(onGoto).toHaveBeenCalledWith({
      nodeId: CASTLE_A1,
      x: castle.pos.x,
      y: castle.pos.y,
    });
    expect(game.reports.every((report) => !report.read)).toBe(true);
  });

  it('inclusive YYYY/MM bounds include first and last month, reversed bounds are explicit empty', () => {
    const game = fixture(3);
    for (const [i, month] of [3, 4, 5].entries()) {
      game.reports[i]!.day = calendarToDay(1560, month, i === 0 ? 30 : 1);
      game.reports[i]!.event.day = game.reports[i]!.day;
    }
    mount(game);
    const start = screen.getByRole('combobox', { name: t('ui.reports.startMonth') });
    const end = screen.getByRole('combobox', { name: t('ui.reports.endMonth') });
    fireEvent.change(start, { target: { value: '1560/3' } });
    fireEvent.change(end, { target: { value: '1560/4' } });
    expect(rows()).toHaveLength(2);
    fireEvent.change(start, { target: { value: '1560/5' } });
    expect(rows()).toHaveLength(0);
    expect(screen.getByRole('alert').textContent).toBe(t('ui.reports.invalidRange'));
  });

  it('preserves visible selected month bounds when retention removes those months', () => {
    const game = fixture(2);
    game.reports[0]!.day = calendarToDay(1560, 3, 1);
    game.reports[0]!.event.day = game.reports[0]!.day;
    game.reports[1]!.day = calendarToDay(1560, 5, 1);
    game.reports[1]!.event.day = game.reports[1]!.day;
    mount(game);
    const start = screen.getByRole<HTMLSelectElement>('combobox', {
      name: t('ui.reports.startMonth'),
    });
    const end = screen.getByRole<HTMLSelectElement>('combobox', {
      name: t('ui.reports.endMonth'),
    });
    fireEvent.change(start, { target: { value: '1560/3' } });
    fireEvent.change(end, { target: { value: '1560/3' } });
    expect(rows()).toHaveLength(1);
    act(() => {
      game.reports = game.reports.slice(1);
      bumpTickSeq();
    });
    expect(rows()).toHaveLength(0);
    for (const select of [start, end]) {
      expect(select.value).toBe('1560/3');
      expect(select.selectedOptions[0]?.textContent).toBe('1560年3月');
    }
    // User can extend the range without the earlier bound having silently changed.
    fireEvent.change(end, { target: { value: '1560/5' } });
    expect(start.value).toBe('1560/3');
    expect(rows()).toHaveLength(1);
  });

  it('pages at 50, resets on filter change and clamps after retained reports shrink', () => {
    const game = fixture(51);
    mount(game);
    expect(rows()).toHaveLength(50);
    const previous = screen.getByRole('button', { name: t('ui.reports.previous') });
    const next = screen.getByRole('button', { name: t('ui.reports.next') });
    expect(previous).toHaveProperty('disabled', true);
    fireEvent.click(next);
    expect(rows()).toHaveLength(1);
    expect(next).toHaveProperty('disabled', true);
    act(() => {
      game.reports = game.reports.slice(0, 2);
      bumpTickSeq();
    });
    expect(rows()).toHaveLength(2);
    expect(previous).toHaveProperty('disabled', true);
    expect(
      screen.getByText(t('ui.reports.pagination', { page: 1, pages: 1, total: 2 })),
    ).toBeTruthy();
    act(() => {
      game.reports = fixture(51).reports;
      bumpTickSeq();
    });
    expect(rows()).toHaveLength(50);
    expect(previous).toHaveProperty('disabled', true);
    fireEvent.click(category(t('ui.reports.category.domestic')));
    expect(rows()).toHaveLength(0);
  });

  it('updates cached text on game replacement without a tick and closes only its panel', () => {
    const game = fixture();
    useUIStore.getState().actions.openPanel('reports');
    mount(game);
    const replacement = fixture(2),
      tickSeq = store.getState().tickSeq;
    act(() => setGame(replacement));
    expect(store.getState().tickSeq).toBe(tickSeq);
    expect(rows()).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: t('ui.reports.title') }));
    expect(useUIStore.getState().panelStack).toEqual([]);
    expect(store.getState().game).toBe(replacement);
  });
});
