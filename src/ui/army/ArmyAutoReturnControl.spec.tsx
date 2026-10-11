import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ArmyId } from '@core/state/ids';
import type { ArmyAutoReturnView } from './autoReturn';
import { ArmyAutoReturnControl } from './ArmyAutoReturnControl';

const view: ArmyAutoReturnView = {
  armyId: 'army.000001' as ArmyId,
  enabled: true,
  pendingEnabled: null,
  canToggle: true,
  validation: { ok: true },
};
afterEach(cleanup);

describe('ArmyAutoReturnControl', () => {
  it('requests disabling without optimistically changing authoritative checked state', () => {
    const onToggle = vi.fn();
    const before = structuredClone(view);
    render(<ArmyAutoReturnControl view={view} onToggle={onToggle} />);
    const toggle = screen.getByRole('switch', { name: '自動歸還' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(toggle.getAttribute('aria-describedby')).toBeTruthy();
    toggle.focus();
    expect(document.activeElement).toBe(toggle);
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledWith(false);
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(view).toEqual(before);
  });

  it('shows actual queued intent separately and disables repeated submissions until a tick refresh', () => {
    const onToggle = vi.fn();
    const rendered = render(
      <ArmyAutoReturnControl view={{ ...view, pendingEnabled: false }} onToggle={onToggle} />,
    );
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveProperty('disabled', true);
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText(/切換為「關」.*待下一日執行/)).toBeTruthy();
    fireEvent.click(toggle);
    expect(onToggle).not.toHaveBeenCalled();
    rendered.rerender(
      <ArmyAutoReturnControl view={{ ...view, enabled: false }} onToggle={onToggle} />,
    );
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(toggle).toHaveProperty('disabled', false);
    fireEvent.click(toggle);
    expect(onToggle).toHaveBeenCalledWith(true);
  });

  it('disables routed armies with the current canonical validator reason', () => {
    const onToggle = vi.fn();
    render(
      <ArmyAutoReturnControl
        view={{
          ...view,
          canToggle: false,
          validation: { ok: false, reasonKey: 'cmd.reject.officerBusy' },
        }}
        onToggle={onToggle}
      />,
    );
    const toggle = screen.getByRole('switch');
    expect(toggle).toHaveProperty('disabled', true);
    expect(toggle.getAttribute('title')).toBeTruthy();
    expect(document.getElementById(toggle.getAttribute('aria-describedby')!)?.textContent).toBe(
      toggle.getAttribute('title'),
    );
    fireEvent.click(toggle);
    expect(onToggle).not.toHaveBeenCalled();
  });
});
