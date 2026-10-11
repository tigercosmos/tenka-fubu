import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { ReportsPanel } from './ReportsPanel';
import styles from './ReportsPanel.module.css';
import { resetGameStoreForTests } from '@app/store';
import { calendarToDay } from '@core/index';
import type { ReportId } from '@core/state/ids';
import { useUIStore } from '../hooks/uiStore';
import { t } from '@i18n/zh-TW';
import { buildTinyState, CLAN_ALPHA, CASTLE_A1 } from '../../../tests/fixtures/tiny';

afterEach(() => {
  cleanup();
  resetGameStoreForTests(null);
  useUIStore.getState().actions.reset();
});
function mount(count = 51) {
  const game = buildTinyState();
  game.reports = Array.from({ length: count }, (_, i) => ({
    id: `rep.${i + 1}` as ReportId,
    day: calendarToDay(1560, 4, 1) + i,
    read: false,
    event: {
      type: 'economy.income' as const,
      day: calendarToDay(1560, 4, 1) + i,
      clanId: CLAN_ALPHA,
      clanIds: [CLAN_ALPHA],
      gold: i + 1,
      foodByCastle: {},
    },
  }));
  resetGameStoreForTests(game);
  const onGoto = vi.fn();
  render(<ReportsPanel onGoto={onGoto} />);
  return { game, onGoto };
}
describe('Reports war-room presentation', () => {
  it('binds opaque command-frame, independent filter and roster owners to actual producer', () => {
    mount();
    const panel = screen.getByTestId('reports-panel');
    expect(panel.querySelector(`.${styles.frame}`)).not.toBeNull();
    expect(
      panel.querySelector(`.${styles.filters} fieldset`)?.querySelectorAll('input'),
    ).toHaveLength(6);
    expect(panel.querySelector(`.${styles.rows} ol`)?.children).toHaveLength(50);
    expect(panel.querySelector(`.${styles.pagination}`)?.closest(`.${styles.rows}`)).toBeNull();
  });
  it('retains full newest-first report text and 50-row pages while filtering resets the page', () => {
    const { game, onGoto } = mount(),
      before = structuredClone(game);
    const rows = () => [...screen.getByRole('list').querySelectorAll('li')];
    expect(rows()).toHaveLength(50);
    expect(rows()[0]?.textContent).toContain('收入51貫');
    fireEvent.click(screen.getByRole('button', { name: t('ui.reports.next') }));
    expect(rows()).toHaveLength(1);
    expect(rows()[0]?.textContent).toContain('收入1貫');
    fireEvent.click(screen.getByRole('checkbox', { name: t('ui.reports.category.domestic') }));
    expect(rows()).toHaveLength(0);
    expect(screen.getByRole('button', { name: t('ui.reports.previous') })).toHaveProperty(
      'disabled',
      true,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: t('ui.reports.category.domestic') }));
    expect(rows()).toHaveLength(50);
    fireEvent.change(screen.getByRole('combobox', { name: t('ui.reports.startMonth') }), {
      target: { value: '1560/5' },
    });
    fireEvent.change(screen.getByRole('combobox', { name: t('ui.reports.endMonth') }), {
      target: { value: '1560/4' },
    });
    expect(screen.getByRole('alert').textContent).toBe(t('ui.reports.invalidRange'));
    expect(game).toEqual(before);
    expect(onGoto).not.toHaveBeenCalled();
  });
  it('keeps unavailable navigation reasons and explicit available navigation without reading reports', () => {
    const game = buildTinyState();
    game.reports = [
      {
        id: 'rep.1' as ReportId,
        day: game.time.day,
        read: false,
        event: {
          type: 'economy.foodShortage',
          day: game.time.day,
          clanIds: [CLAN_ALPHA],
          clanId: CLAN_ALPHA,
          castleId: CASTLE_A1,
        },
      },
    ];
    const before = structuredClone(game);
    resetGameStoreForTests(game);
    const goto = vi.fn();
    render(<ReportsPanel onGoto={goto} />);
    const button = within(screen.getByRole('list')).getByRole('button', {
      name: t('ui.reports.goto'),
    });
    fireEvent.click(button);
    expect(goto).toHaveBeenCalledOnce();
    expect(goto).toHaveBeenCalledWith({
      nodeId: CASTLE_A1,
      x: game.castles[CASTLE_A1]!.pos.x,
      y: game.castles[CASTLE_A1]!.pos.y,
    });
    expect(game).toEqual(before);
  });
  it('uses screen-local 12px fonts, 32px controls, full wrapping and minimap-safe fixed pagination', () => {
    const css = readFileSync('src/ui/screens/ReportsPanel.module.css', 'utf8');
    expect(css).toMatch(/\.frame\s*\{[^}]*background:\s*var\(--surface-panel\)/);
    expect(css).toContain('font-size: max(12px, var(--font-size-sm))');
    expect(css).toContain('min-height: max(32px, 2rem)');
    expect(css).toContain('min(192px, 14rem)');
    expect(css).toMatch(/\.filters\s*\{[^}]*overflow-y:\s*auto/);
    expect(css).toMatch(/\.rows\s*\{[^}]*overflow-y:\s*auto/);
    expect(css).toMatch(/\.pagination\s*\{[^}]*flex-shrink:\s*0/);
    expect(css).toContain('opacity: 1');
    expect(css).toContain('white-space: normal');
    expect(css).toMatch(/justify-content:\s*flex-start/);
  });
});
