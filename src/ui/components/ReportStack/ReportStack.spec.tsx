import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOKENS } from '@ui/styles/tokens';
import { UI } from '@ui/uiConstants';
import { ReportStack, type ToastItem } from './ReportStack';
import { MotionContext } from '../../motion/MotionContext';
import { readFileSync } from 'node:fs';

const reportCss = readFileSync('src/ui/components/ReportStack/ReportStack.module.css', 'utf8');

function toast(id: string, severity: ToastItem['severity'] = 'info'): ToastItem {
  return { id, severity, title: `通知${id}`, date: 0 };
}

describe('ReportStack', () => {
  it.each([
    ['domestic', 'M12 21V7'],
    ['military', 'M5 19l10-10'],
    ['diplomacy', 'M3 10l5-5'],
    ['personnel', 'M3 20c0-5'],
    ['event', 'M7 4h12'],
    ['system', 'M12 2v3'],
  ] as const)(
    'uses the %s report-family symbol independently of severity and title',
    (category, path) => {
      render(
        <ReportStack items={[{ ...toast('family', 'critical'), category }]} onDismiss={vi.fn()} />,
      );
      const notification = screen.getByRole('alert');
      const seal = notification.querySelector(`[data-category="${category}"]`);
      expect(seal).not.toBeNull();
      expect(seal!.getAttribute('data-severity')).toBe('critical');
      expect(seal!.getAttribute('aria-hidden')).toBe('true');
      expect(
        Array.from(seal!.querySelectorAll('path')).some((node) =>
          node.getAttribute('d')?.startsWith(path),
        ),
      ).toBe(true);
      expect(notification.textContent).toContain('通知family');
      expect(notification.querySelectorAll('button')).toHaveLength(1);
    },
  );
  it.each(['info', 'success', 'warning', 'critical'] as const)(
    'adds a decorative repository SVG severity seal for %s without another control',
    (severity) => {
      render(<ReportStack items={[toast('seal', severity)]} onDismiss={vi.fn()} />);
      const notification = screen.getByRole(severity === 'critical' ? 'alert' : 'status');
      const seal = notification.querySelector(`[data-severity="${severity}"]`);
      expect(seal).not.toBeNull();
      expect(seal!.getAttribute('aria-hidden')).toBe('true');
      expect(seal!.querySelector('svg')?.getAttribute('viewBox')).toBe('0 0 24 24');
      expect(seal!.getAttribute('tabindex')).toBeNull();
      expect(notification.querySelectorAll('button')).toHaveLength(1);
      expect(notification.textContent).toContain('通知seal');
      expect(notification.querySelector('time')).not.toBeNull();
    },
  );

  it('keeps the severity seal compact and metadata flexible instead of restoring a 40px card floor', () => {
    const start = reportCss.indexOf('\n.severitySeal {');
    expect(start).toBeGreaterThanOrEqual(0);
    const seal = reportCss.slice(start, reportCss.indexOf('}', start));
    expect(seal).toContain('width: max(20px, 1.25rem);');
    expect(seal).toContain('height: max(20px, 1.25rem);');
    expect(seal).toContain('flex-shrink: 0;');
    const metadataStart = reportCss.indexOf('\n.metadata {');
    expect(reportCss.slice(metadataStart, reportCss.indexOf('}', metadataStart))).toContain(
      'flex: 1;',
    );
  });
  it('groups full title and date beside the close control without moving optional body into metadata', () => {
    const title = '收到武將完整具申標題，不省略重要內容。';
    const body = '完整內文仍可換行閱讀，不因緊湊通知而截斷。';
    render(<ReportStack items={[{ ...toast('compact'), title, body }]} onDismiss={vi.fn()} />);
    const notification = screen.getByRole('status');
    const titleNode = screen.getByText(title);
    const metadata = titleNode.parentElement!;
    expect(metadata.querySelector('time')).not.toBeNull();
    expect(metadata.contains(screen.getByRole('button', { name: '關閉通知' }))).toBe(false);
    expect(metadata.contains(screen.getByText(body))).toBe(false);
    expect(metadata.parentElement?.contains(screen.getByRole('button', { name: '關閉通知' }))).toBe(
      true,
    );
    expect(notification.textContent).toContain(title);
    expect(notification.textContent).toContain(body);
  });

  it('uses compact metadata spacing with physical readability and close-target floors, not fixed clipping', () => {
    const rule = (selector: string) => {
      const start = reportCss.indexOf(`\n${selector} {`);
      expect(start).toBeGreaterThanOrEqual(0);
      return reportCss.slice(start, reportCss.indexOf('}', start) + 1);
    };
    expect(rule('.toast')).toContain('padding: 0.25rem 0.5rem;');
    expect(rule('.metadata')).toContain('min-width: 0;');
    expect(rule('.metadata')).toContain('gap: 2px;');
    expect(rule('.heading strong')).toContain('overflow-wrap: anywhere;');
    expect(rule('.heading strong')).toContain('line-height: 1.25;');
    expect(rule('.toast p')).toContain('font-size: max(12px, var(--font-size-sm));');
    expect(rule('.toast time')).toContain('margin: 0;');
    expect(rule('.toast time')).not.toContain('border-top:');
    expect(rule('.dismissControl')).toContain('min-width: 32px;');
    expect(rule('.dismissControl')).toContain('flex-shrink: 0;');
    expect(rule('.toast')).not.toMatch(/(?:max-)?height:/);
    expect(reportCss).not.toContain('text-overflow: ellipsis');
  });
  it.each(['warning', 'critical'] as const)(
    'finishes an accepted manual exit once when its same-ID severity changes to %s',
    (severity) => {
      const firstDismiss = vi.fn();
      const latestDismiss = vi.fn();
      const view = render(<ReportStack items={[toast('changing')]} onDismiss={firstDismiss} />);
      fireEvent.click(screen.getByRole('button', { name: '關閉通知' }));
      act(() => {
        vi.advanceTimersByTime(TOKENS.duration.normal / 2);
      });
      view.rerender(
        <ReportStack items={[toast('changing', severity)]} onDismiss={latestDismiss} />,
      );
      act(() => {
        vi.advanceTimersByTime(TOKENS.duration.normal / 2 - 1);
      });
      expect(firstDismiss).not.toHaveBeenCalled();
      expect(latestDismiss).not.toHaveBeenCalled();
      act(() => {
        vi.advanceTimersByTime(1);
      });
      expect(latestDismiss).toHaveBeenCalledOnce();
      expect(latestDismiss).toHaveBeenCalledWith('changing');
      act(() => {
        vi.advanceTimersByTime(UI.toastDurationWarnMs * 2);
      });
      expect(latestDismiss).toHaveBeenCalledOnce();
    },
  );
  it('cancels an accepted exit when its original keyed notification is removed', () => {
    const dismiss = vi.fn();
    const view = render(<ReportStack items={[toast('old')]} onDismiss={dismiss} />);
    fireEvent.click(screen.getByRole('button', { name: '關閉通知' }));
    view.rerender(<ReportStack items={[toast('replacement', 'critical')]} onDismiss={dismiss} />);
    act(() => {
      vi.advanceTimersByTime(UI.toastDurationWarnMs * 2);
    });
    expect(dismiss).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('通知replacement');
  });
  it('pauses the remaining countdown for keyboard focus and does not resume between descendants', () => {
    const onDismiss = vi.fn();
    render(<ReportStack items={[{ ...toast('focus'), onClick: vi.fn() }]} onDismiss={onDismiss} />);
    const notification = screen.getByRole('status');
    const close = screen.getByRole('button', { name: '關閉通知' });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.focus(notification);
    act(() => {
      vi.advanceTimersByTime(UI.toastDurationInfoMs);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.blur(notification, { relatedTarget: close });
    fireEvent.focus(close, { relatedTarget: notification });
    act(() => {
      vi.advanceTimersByTime(UI.toastDurationInfoMs);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.blur(close, { relatedTarget: document.body });
    act(() => {
      vi.advanceTimersByTime(UI.toastDurationInfoMs - 1001);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1 + TOKENS.duration.normal);
    });
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledWith('focus');
  });

  it.each(['focus-first', 'hover-first'])(
    'requires both focus and hover to leave (%s)',
    (order) => {
      const onDismiss = vi.fn();
      render(<ReportStack items={[toast('combined')]} onDismiss={onDismiss} />);
      const notification = screen.getByRole('status');
      const close = screen.getByRole('button', { name: '關閉通知' });
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      fireEvent.focus(close);
      fireEvent.mouseEnter(notification);
      if (order === 'focus-first') fireEvent.blur(close, { relatedTarget: document.body });
      else fireEvent.mouseLeave(notification);
      act(() => {
        vi.advanceTimersByTime(UI.toastDurationInfoMs);
      });
      expect(onDismiss).not.toHaveBeenCalled();
      if (order === 'focus-first') fireEvent.mouseLeave(notification);
      else fireEvent.blur(close, { relatedTarget: document.body });
      act(() => {
        vi.advanceTimersByTime(UI.toastDurationInfoMs - 1000 + TOKENS.duration.normal);
      });
      expect(onDismiss).toHaveBeenCalledOnce();
      expect(onDismiss).toHaveBeenCalledWith('combined');
    },
  );

  it('reserves the minimap bottom inset and keeps archive/collapse controls outside the scroll region', () => {
    const open = vi.fn();
    render(
      <ReportStack
        items={[{ ...toast('persistent', 'critical'), sticky: true }]}
        onDismiss={vi.fn()}
        onOpenReports={open}
        bottomInset="20rem"
      />,
    );
    const section = screen.getByRole('alert').closest('section')!;
    expect(section.style.bottom).toBe('20rem');
    const list = screen.getByTestId('report-toast-list');
    expect(list.contains(screen.getByRole('alert'))).toBe(true);
    expect(list.contains(screen.getByTestId('reports-open'))).toBe(false);
    fireEvent.click(screen.getByTestId('reports-open'));
    expect(open).toHaveBeenCalledOnce();
  });
  it('OS changes retain the semantic info timeout while removing the exit animation delay', () => {
    const onDismiss = vi.fn(),
      items = [toast('info')];
    const view = render(
      <MotionContext.Provider value={false}>
        <ReportStack items={items} onDismiss={onDismiss} />
      </MotionContext.Provider>,
    );
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    view.rerender(
      <MotionContext.Provider value>
        <ReportStack items={items} onDismiss={onDismiss} />
      </MotionContext.Provider>,
    );
    act(() => {
      vi.advanceTimersByTime(UI.toastDurationInfoMs - 2001);
    });
    expect(onDismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledWith('info');
  });
  it('reduced motion dismisses immediately and completes an already-running exit exactly once', () => {
    const onDismiss = vi.fn();
    const items = [toast('critical', 'critical')];
    const view = render(
      <MotionContext.Provider value={false}>
        <ReportStack items={items} onDismiss={onDismiss} />
      </MotionContext.Provider>,
    );
    fireEvent.click(screen.getByRole('button', { name: '關閉通知' }));
    expect(onDismiss).not.toHaveBeenCalled();
    view.rerender(
      <MotionContext.Provider value>
        <ReportStack items={items} onDismiss={onDismiss} />
      </MotionContext.Provider>,
    );
    expect(onDismiss).toHaveBeenCalledOnce();
    expect(onDismiss).toHaveBeenCalledWith('critical');
    act(() => {
      vi.advanceTimersByTime(TOKENS.duration.normal);
    });
    expect(onDismiss).toHaveBeenCalledOnce();
  });
  it('conceals but retains sticky notifications while a full-screen report view is open', () => {
    const onDismiss = vi.fn();
    const items = [{ ...toast('critical', 'critical'), sticky: true }];
    const view = render(<ReportStack items={items} onDismiss={onDismiss} hidden />);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('通知critical').closest('section')).toHaveProperty('hidden', true);
    view.rerender(<ReportStack items={items} onDismiss={onDismiss} />);
    expect(screen.getByRole('alert').textContent).toContain('通知critical');
    expect(onDismiss).not.toHaveBeenCalled();
  });
  it('keeps the report-center entry available with an empty or collapsed notification stack', () => {
    const onOpenReports = vi.fn();
    const onDismiss = vi.fn();
    const view = render(
      <ReportStack items={[]} onDismiss={onDismiss} onOpenReports={onOpenReports} />,
    );
    fireEvent.click(screen.getByTestId('reports-open'));
    expect(onOpenReports).toHaveBeenCalledTimes(1);
    view.rerender(
      <ReportStack items={[toast('1')]} onDismiss={onDismiss} onOpenReports={onOpenReports} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '通報 1 則' }));
    expect(screen.queryByText('通知1')).toBeNull();
    fireEvent.click(screen.getByTestId('reports-open'));
    expect(onOpenReports).toHaveBeenCalledTimes(2);
    expect(onDismiss).not.toHaveBeenCalled();
  });
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('renders no header/collapse button when there are no notifications（M6-V9 review 補跑：空態淨空）', () => {
    const onDismiss = vi.fn();
    const view = render(<ReportStack items={[]} onDismiss={onDismiss} />);
    expect(screen.queryByRole('button')).toBeNull();

    view.rerender(<ReportStack items={[toast('1')]} onDismiss={onDismiss} />);
    expect(screen.getByRole('button', { name: '通報 1 則' })).not.toBeNull();

    view.rerender(<ReportStack items={[]} onDismiss={onDismiss} />);
    expect(screen.queryByRole('button', { name: '通報 0 則' })).toBeNull();
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
