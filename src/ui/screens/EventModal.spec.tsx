import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClanId, EventId } from '@core/state/ids';
import { UI } from '../uiConstants';
import { EventModal, type EventModalProps, type EventModalVM } from './EventModal';
import { MotionContext } from '../motion/MotionContext';

const vm: EventModalVM = {
  eventId: 'evt.ui-test' as EventId,
  title: '歷史的岔路',
  body: '迎擊之時\n請做出抉擇。',
  monClanId: 'clan.oda' as ClanId,
  requiresChoice: true,
  choices: [
    { label: '迎擊！', enabled: true, hint: '' },
    { label: '籠城', enabled: false, hint: '兵力不足' },
  ],
};
function props(patch: Partial<EventModalProps> = {}): EventModalProps {
  return { vm, onChoice: vi.fn(), onContinue: vi.fn(), animateText: false, ...patch };
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('controlled EventModal', () => {
  it('OS reduction reveals text, cancels typewriter and does not replay it when preference changes back', () => {
    vi.useFakeTimers();
    const p = props({ animateText: true });
    const view = render(
      <MotionContext.Provider value={false}>
        <EventModal {...p} />
      </MotionContext.Provider>,
    );
    act(() => {
      vi.advanceTimersByTime(UI.uiEventTextSpeedMsPerChar);
    });
    view.rerender(
      <MotionContext.Provider value>
        <EventModal {...p} />
      </MotionContext.Provider>,
    );
    expect(screen.getByTestId('event-modal').textContent).toContain(vm.body);
    view.rerender(
      <MotionContext.Provider value={false}>
        <EventModal {...p} />
      </MotionContext.Provider>,
    );
    expect(screen.getByTestId('event-modal').textContent).toContain(vm.body);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(p.onChoice).not.toHaveBeenCalled();
    expect(p.onContinue).not.toHaveBeenCalled();
  });
  it('mandatory choices cannot be dismissed by Escape, backdrop or a header close control', async () => {
    const p = props();
    render(<EventModal {...p} />);
    const dialog = screen.getByRole('dialog');
    expect(screen.getByText('歷史的岔路——請做出抉擇')).toBeTruthy();
    expect(screen.queryByRole('button', { name: vm.title })).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: '迎擊！' })),
    );
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    fireEvent.mouseDown(dialog.parentElement!);
    expect(p.onContinue).not.toHaveBeenCalled();
    expect(p.onChoice).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBe(dialog);
  });

  it('disabled choices remain natively disabled with keyboard-accessible localized reason tooltips', () => {
    const p = props();
    render(<EventModal {...p} />);
    const locked = screen.getByRole('button', { name: '籠城' });
    expect(locked).toHaveProperty('disabled', true);
    const trigger = locked.parentElement!;
    expect(trigger.tabIndex).toBe(0);
    fireEvent.focus(trigger);
    expect(screen.getByRole('tooltip').textContent).toBe('條件不足：兵力不足');
    fireEvent.click(locked);
    expect(p.onChoice).not.toHaveBeenCalled();
  });

  it('clicking a valid choice submits its canonical index once and locks while awaiting completion', async () => {
    let finish: () => void = () => {};
    const onChoice = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    render(<EventModal {...props({ onChoice })} />);
    const button = screen.getByRole('button', { name: '迎擊！' });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onChoice).toHaveBeenCalledOnce();
    expect(onChoice).toHaveBeenCalledWith(0);
    expect(button).toHaveProperty('disabled', true);
    expect(screen.getByTestId('event-modal').getAttribute('aria-busy')).toBe('true');
    await act(async () => {
      finish();
      await Promise.resolve();
    });
    expect(button).toHaveProperty('disabled', false);
  });

  it('controlled errors and busy state remain visible without mutating the supplied VM', () => {
    const before = structuredClone(vm);
    render(<EventModal {...props({ busy: true, error: '目標無效或已不存在' })} />);
    expect(screen.getByRole('alert').textContent).toBe('目標無效或已不存在');
    expect(screen.getByRole('button', { name: '迎擊！' })).toHaveProperty('disabled', true);
    expect(vm).toEqual(before);
  });

  it('informational scenes continue without issuing a choice and can close via Escape', () => {
    // AI-resolved scenes must not offer player orders even if their definition still lists choices.
    const p = props({ vm: { ...vm, requiresChoice: false } });
    render(<EventModal {...p} />);
    expect(screen.queryByText('歷史的岔路——請做出抉擇')).toBeNull();
    expect(screen.queryByRole('button', { name: '迎擊！' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '繼續' }));
    expect(p.onContinue).toHaveBeenCalledOnce();
    expect(p.onChoice).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(p.onContinue).toHaveBeenCalledTimes(2);
  });

  it('typewriter text reveals by the UI clock, skips permanently on click, and resets for a new event', () => {
    vi.useFakeTimers();
    const p = props({ animateText: true });
    const { rerender } = render(<EventModal {...p} />);
    expect(screen.getByTestId('event-text').textContent).toBe('');
    act(() => {
      vi.advanceTimersByTime(UI.uiEventTextSpeedMsPerChar);
    });
    expect(screen.getByTestId('event-text').textContent).toBe('迎');
    fireEvent.click(screen.getByTestId('event-modal'));
    expect(screen.getByTestId('event-text').textContent).toBe(vm.body);
    act(() => {
      vi.advanceTimersByTime(UI.uiEventTextSpeedMsPerChar * 3);
    });
    expect(screen.getByTestId('event-text').textContent).toBe(vm.body);
    rerender(<EventModal {...p} vm={{ ...vm, eventId: 'evt.next' as EventId, body: '😀抉擇' }} />);
    expect(screen.getByTestId('event-text').textContent).toBe('');
    act(() => {
      vi.advanceTimersByTime(UI.uiEventTextSpeedMsPerChar);
    });
    expect(screen.getByTestId('event-text').textContent).toBe('😀');
  });

  it('animation preference displays complete text immediately and existing artwork is decorative', () => {
    const renderMon = vi.fn(() => <svg data-testid="existing-mon-artwork" />);
    render(<EventModal {...props({ renderMon })} />);
    expect(screen.getByTestId('event-text').textContent).toBe(vm.body);
    expect(renderMon).toHaveBeenCalledWith(vm.monClanId);
    expect(
      screen.getByTestId('existing-mon-artwork').parentElement?.getAttribute('aria-hidden'),
    ).toBe('true');
  });

  it('a late rejected choice cannot place an error on a replacement event', async () => {
    let reject: (reason: Error) => void = () => {};
    const onChoice = vi.fn(
      () =>
        new Promise<void>((_resolve, rejectPromise) => {
          reject = rejectPromise;
        }),
    );
    const p = props({ onChoice });
    const { rerender } = render(<EventModal {...p} />);
    fireEvent.click(screen.getByRole('button', { name: '迎擊！' }));
    rerender(<EventModal {...p} vm={{ ...vm, eventId: 'evt.next' as EventId }} />);
    await act(async () => {
      reject(new Error('late rejection'));
      await Promise.resolve();
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
