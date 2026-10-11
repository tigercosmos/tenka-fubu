import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClanId, ReportId } from '@core/state/ids';
import type { MonthSummaryView } from '../reports/monthSummary';
import { MonthSummaryModal } from './MonthSummaryModal';

function fixture(): MonthSummaryView {
  return {
    key: 'opening:30',
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
    domestic: [{ id: 'rep.000001' as ReportId, day: 30, text: '市場完工' }],
    world: [{ id: 'rep.000002' as ReportId, day: 30, text: '他家落城' }],
    reportsMayBeIncomplete: true,
  };
}
afterEach(cleanup);

describe('MonthSummaryModal', () => {
  it('exposes the reward notification entry without directly acknowledging the summary', () => {
    const onRewards = vi.fn();
    const onContinue = vi.fn();
    render(<MonthSummaryModal view={fixture()} onContinue={onContinue} onRewards={onRewards} />);
    fireEvent.click(screen.getByRole('button', { name: '褒賞家臣' }));
    expect(onRewards).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
  it('renders actual settlement without double-counting corps money or inventing a historical food delta', () => {
    const view = fixture();
    const original = structuredClone(view);
    render(<MonthSummaryModal view={view} onContinue={vi.fn()} />);
    const settlement = screen.getByTestId('month-summary-settlement');
    expect(settlement.textContent).toContain('250／400貫');
    expect(settlement.textContent).toContain('120貫');
    expect(settlement.textContent).toContain('1,120貫');
    expect(settlement.textContent).toContain('200貫');
    expect(screen.getByText('實付支出合計').nextElementSibling?.textContent).toBe('400貫');
    expect(screen.getByText('12,345石')).toBeTruthy();
    expect(screen.getByText('345石')).toBeTruthy();
    expect(screen.getByText(/並非歷史兵糧增減/)).toBeTruthy();
    expect(screen.getByText('市場完工')).toBeTruthy();
    expect(screen.getByText('他家落城')).toBeTruthy();
    expect(screen.getByRole('note').textContent).toContain('可能不完整');
    expect(screen.getByRole('dialog').getAttribute('aria-labelledby')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '1560年2月　月初摘要' })).toBeTruthy();
    expect(view).toEqual(original);
  });

  it('keeps mandatory focus contained and invokes only explicit continuation', async () => {
    const onContinue = vi.fn();
    render(<MonthSummaryModal view={fixture()} onContinue={onContinue} />);
    const button = screen.getByTestId('month-summary-continue');
    const dialog = screen.getByRole('dialog');
    const content = screen.getByRole('region', { name: '月初摘要內容' });
    await waitFor(() => expect(document.activeElement).toBe(button));
    fireEvent.keyDown(button, { key: 'Escape' });
    fireEvent.mouseDown(dialog.parentElement!);
    expect(onContinue).not.toHaveBeenCalled();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    fireEvent.keyDown(button, { key: 'Tab' });
    expect(document.activeElement).toBe(content);
    fireEvent.keyDown(content, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(button);
    fireEvent.click(button);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('does not manufacture settlement data when loading without a transient snapshot', () => {
    render(
      <MonthSummaryModal
        view={{
          ...fixture(),
          settlement: null,
          domestic: [],
          world: [],
          reportsMayBeIncomplete: false,
        }}
        onContinue={vi.fn()}
      />,
    );
    expect(screen.getByTestId('month-summary-unavailable')).toBeTruthy();
    expect(screen.queryByTestId('month-summary-settlement')).toBeNull();
    expect(screen.queryByRole('note')).toBeNull();
    expect(screen.getAllByText('目前沒有符合此分類的保留報告。')).toHaveLength(2);
  });

  it('retains all 13+ reports in a keyboard-focusable scroll region, and refreshes controlled views', () => {
    const view: MonthSummaryView = {
      ...fixture(),
      domestic: Array.from({ length: 15 }, (_, index) => ({
        id: `rep.${String(index + 1).padStart(6, '0')}` as ReportId,
        day: 30 + index,
        text: `報告${index}`,
      })),
    };
    const rendered = render(<MonthSummaryModal view={view} onContinue={vi.fn()} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(16);
    expect(screen.getByTestId('month-summary').tabIndex).toBe(0);
    rendered.rerender(
      <MonthSummaryModal
        view={{ ...view, key: 'opening:60', month: 3, foodStock: 100 }}
        onContinue={vi.fn()}
      />,
    );
    expect(screen.getByRole('heading', { name: '1560年3月　月初摘要' })).toBeTruthy();
    expect(screen.getByText('100石')).toBeTruthy();
  });
});
