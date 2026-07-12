import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKENS } from '@ui/styles/tokens';
import { UI } from '@ui/uiConstants';
import { ReportStack, type ToastItem } from './ReportStack';

function toast(id: string, severity: ToastItem['severity'] = 'info'): ToastItem {
  return { id, severity, title: `通知${id}`, date: 0 };
}

describe('ReportStack', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('shows only max items, evicts overflow non-sticky items, and retains sticky items for refill', () => {
    const onDismiss = vi.fn();
    const first = [toast('1'), toast('2'), toast('3'), toast('4'), toast('5'), toast('6')];
    first[5] = { ...toast('6'), sticky: true };
    const view = render(<ReportStack items={first} max={5} onDismiss={onDismiss} />);

    expect(screen.getAllByRole('status')).toHaveLength(5);
    expect(screen.queryByText('通知6')).toBeNull();
    expect(onDismiss).not.toHaveBeenCalled();

    view.rerender(<ReportStack items={first.slice(1)} max={5} onDismiss={onDismiss} />);
    expect(screen.getByText('通知6')).not.toBeNull();

    view.rerender(
      <ReportStack items={[...first.slice(1), toast('7')]} max={5} onDismiss={onDismiss} />,
    );
    expect(onDismiss).toHaveBeenCalledWith('7');
  });

  it('auto-dismisses info/success and warning after their severity duration plus exit animation', () => {
    const onDismiss = vi.fn();
    render(
      <ReportStack
        items={[toast('info'), toast('success', 'success'), toast('warning', 'warning')]}
        onDismiss={onDismiss}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(UI.toastDurationInfoMs);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(TOKENS.duration.normal);
    });
    expect(onDismiss).toHaveBeenCalledWith('info');
    expect(onDismiss).toHaveBeenCalledWith('success');
    expect(onDismiss).not.toHaveBeenCalledWith('warning');

    act(() => {
      vi.advanceTimersByTime(
        UI.toastDurationWarnMs - UI.toastDurationInfoMs - TOKENS.duration.normal,
      );
    });
    expect(onDismiss).not.toHaveBeenCalledWith('warning');
    act(() => {
      vi.advanceTimersByTime(TOKENS.duration.normal);
    });
    expect(onDismiss).toHaveBeenCalledWith('warning');
  });

  it('pauses and resumes the remaining countdown while hovered', () => {
    const onDismiss = vi.fn();
    render(<ReportStack items={[toast('hover')]} onDismiss={onDismiss} />);
    const item = screen.getByRole('status');

    act(() => {
      vi.advanceTimersByTime(3_000);
    });
    fireEvent.mouseEnter(item);
    act(() => {
      vi.advanceTimersByTime(UI.toastDurationInfoMs);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.mouseLeave(item);
    act(() => {
      vi.advanceTimersByTime(3_000 + TOKENS.duration.normal - 1);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledWith('hover');
  });

  it('keeps critical notifications until manually closed and does not dismiss on item activation', () => {
    const onDismiss = vi.fn();
    const onClick = vi.fn();
    render(
      <ReportStack items={[{ ...toast('critical', 'critical'), onClick }]} onDismiss={onDismiss} />,
    );

    const item = screen.getByRole('alert');
    fireEvent.click(item);
    expect(onClick).toHaveBeenCalledOnce();
    act(() => {
      vi.advanceTimersByTime(UI.toastDurationWarnMs * 2);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '關閉通知' }));
    expect(onClick).toHaveBeenCalledOnce();
    act(() => {
      vi.advanceTimersByTime(TOKENS.duration.normal);
    });
    expect(onDismiss).toHaveBeenCalledWith('critical');
  });
});
