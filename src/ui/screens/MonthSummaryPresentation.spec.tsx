import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ClanId, ReportId } from '@core/state/ids';
import type { MonthSummaryView } from '../reports/monthSummary';
import { MonthSummaryModal } from './MonthSummaryModal';

afterEach(cleanup);
const view: MonthSummaryView = {
  key: 'presentation:30',
  day: 30,
  year: 1560,
  month: 2,
  settlement: {
    clanId: 'clan.oda' as ClanId,
    goldBefore: 1000,
    goldAfter: 1120,
    incomeGold: 500,
    retainedCorpsGold: 200,
    tributePaid: 100,
    tributeReceived: 20,
    salaryDue: 400,
    salaryPaid: 250,
    policyPaid: 50,
  },
  foodStock: 12345,
  foodForecast: 345,
  domestic: [{ id: 'rep.1' as ReportId, day: 30, text: '領內實際報告' }],
  world: [{ id: 'rep.2' as ReportId, day: 30, text: '天下實際報告' }],
  reportsMayBeIncomplete: true,
};
it('declares local register cards, intrinsic rows, and readable text/footer floors without hiding facts', () => {
  const css = readFileSync('src/ui/screens/MonthSummaryModal.module.css', 'utf8');
  expect(css).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
  expect(css).toContain('grid-auto-rows: max-content');
  expect(css).toContain('font-size: max(12px, var(--font-size-sm))');
  expect(css).toContain('.rewards');
  expect(css).toContain('min-width: 32px');
  expect(css).not.toContain(':global');
  expect(css).not.toContain('display: none');
  expect(css).not.toContain('text-overflow: ellipsis');
});
it('retains every original section, financial row, scope note and actual callback with only local footer role', () => {
  const onContinue = vi.fn(),
    onRewards = vi.fn(),
    original = structuredClone(view);
  render(<MonthSummaryModal view={view} onContinue={onContinue} onRewards={onRewards} />);
  const region = screen.getByTestId('month-summary');
  expect(
    Array.from(region.querySelectorAll('section')).map((e) => e.getAttribute('aria-label')),
  ).toEqual(['月初金錢結算', '兵糧現況與預估', '本月領內動靜', '本月天下動靜']);
  expect(region.querySelectorAll('dt')).toHaveLength(11);
  expect(region.querySelectorAll('dd')).toHaveLength(11);
  expect(Array.from(region.querySelectorAll('li')).map((e) => e.textContent)).toEqual([
    '1560年2月1日領內實際報告',
    '1560年2月1日天下實際報告',
  ]);
  expect(screen.getByRole('note').textContent).toContain('可能不完整');
  expect(screen.getByText(/並非歷史兵糧增減/)).toBeTruthy();
  const rewards = screen.getByRole('button', { name: '褒賞家臣' });
  expect(rewards.className).toContain('rewards');
  fireEvent.click(rewards);
  expect(onRewards).toHaveBeenCalledTimes(1);
  expect(onContinue).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTestId('month-summary-continue'));
  expect(onContinue).toHaveBeenCalledTimes(1);
  expect(view).toEqual(original);
});
