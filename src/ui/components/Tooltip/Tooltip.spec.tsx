import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Tooltip } from './Tooltip';
import { claimTooltip, releaseTooltip } from './ownership';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('shared tooltip ownership', () => {
  it('retains delayed pointer entry and immediate keyboard focus', () => {
    vi.useFakeTimers();
    render(
      <Tooltip content="Details" delayMs={400}>
        <button>Trigger</button>
      </Tooltip>,
    );
    const trigger = screen.getByRole('button');
    fireEvent.pointerEnter(trigger);
    act(() => {
      vi.advanceTimersByTime(399);
    });
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole('tooltip').textContent).toBe('Details');
    fireEvent.pointerLeave(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focus(trigger);
    expect(screen.getByRole('tooltip').textContent).toBe('Details');
    fireEvent.blur(trigger);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('lets a map-style controller replace pending and visible DOM tooltips', () => {
    vi.useFakeTimers();
    const view = render(
      <Tooltip content="Details" delayMs={400}>
        <button>Trigger</button>
      </Tooltip>,
    );
    const trigger = screen.getByRole('button');
    fireEvent.pointerEnter(trigger);
    const first = vi.fn();
    act(() => claimTooltip(first));
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.focus(trigger);
    expect(first).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('tooltip').textContent).toBe('Details');
    const second = vi.fn();
    act(() => claimTooltip(second));
    expect(screen.queryByRole('tooltip')).toBeNull();
    view.unmount();
    const third = vi.fn();
    claimTooltip(third);
    expect(second).toHaveBeenCalledTimes(1);
    releaseTooltip(second);
    const fourth = vi.fn();
    claimTooltip(fourth);
    expect(third).toHaveBeenCalledTimes(1);
    releaseTooltip(fourth);
  });

  it('keeps the new DOM owner when the old trigger leaves or unmounts', () => {
    const first = render(
      <Tooltip content="First">
        <button>First trigger</button>
      </Tooltip>,
    );
    render(
      <Tooltip content="Second">
        <button>Second trigger</button>
      </Tooltip>,
    );
    fireEvent.focus(screen.getByRole('button', { name: 'First trigger' }));
    fireEvent.focus(screen.getByRole('button', { name: 'Second trigger' }));
    expect(screen.getAllByRole('tooltip')).toHaveLength(1);
    fireEvent.pointerLeave(screen.getByRole('button', { name: 'First trigger' }));
    first.unmount();
    expect(screen.getByRole('tooltip').textContent).toBe('Second');
    const hide = vi.fn();
    act(() => claimTooltip(hide));
    expect(screen.queryByRole('tooltip')).toBeNull();
    releaseTooltip(hide);
  });
});
