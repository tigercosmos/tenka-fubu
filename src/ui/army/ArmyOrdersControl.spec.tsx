import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ArmyId, MapNodeId } from '@core/state/ids';
import type { ArmyOrdersView } from './orders';
import { ArmyOrdersControl } from './ArmyOrdersControl';

const view: ArmyOrdersView = {
  armyId: 'army.000001' as ArmyId,
  status: 'holding',
  fromNodeId: 'castle.a' as MapNodeId,
  fromName: '甲城',
  targetNodeId: null,
  targetName: null,
  pendingTargetNodeId: null,
  pendingRecall: false,
  retargetValidation: { ok: true },
  canRetarget: true,
  recallValidation: { ok: true },
  canRecall: true,
  kassen: [],
};
afterEach(cleanup);
describe('ArmyOrdersControl', () => {
  it('exposes keyboard native target/recall actions without changing the view', () => {
    const onRetarget = vi.fn(),
      onRecall = vi.fn();
    const before = structuredClone(view);
    render(<ArmyOrdersControl view={view} onRetarget={onRetarget} onRecall={onRecall} />);
    const target = screen.getByRole('button', { name: '變更目標' });
    target.focus();
    expect(document.activeElement).toBe(target);
    fireEvent.click(target);
    fireEvent.click(screen.getByRole('button', { name: '撤返' }));
    expect(onRetarget).toHaveBeenCalledOnce();
    expect(onRecall).toHaveBeenCalledOnce();
    expect(view).toEqual(before);
  });
  it('shows queued intent independently and blocks duplicate movement orders', () => {
    const onRetarget = vi.fn(),
      onRecall = vi.fn();
    render(
      <ArmyOrdersControl
        view={{ ...view, pendingRecall: true, canRetarget: false, canRecall: false }}
        onRetarget={onRetarget}
        onRecall={onRecall}
      />,
    );
    for (const button of screen.getAllByRole('button')) {
      expect(button).toHaveProperty('disabled', true);
      expect(button.getAttribute('aria-describedby')).toBeTruthy();
      fireEvent.click(button);
    }
    expect(onRetarget).not.toHaveBeenCalled();
    expect(onRecall).not.toHaveBeenCalled();
    expect(screen.getAllByText(/軍令待下一日執行/).length).toBeGreaterThan(0);
  });
  it('explains current authority rejection and returning suppression', () => {
    const rendered = render(
      <ArmyOrdersControl
        view={{
          ...view,
          canRetarget: false,
          canRecall: false,
          retargetValidation: { ok: false, reasonKey: 'cmd.reject.delegatedToCorps' },
          recallValidation: { ok: false, reasonKey: 'cmd.reject.delegatedToCorps' },
        }}
        onRetarget={vi.fn()}
        onRecall={vi.fn()}
      />,
    );
    expect(screen.getByTestId('army-retarget').getAttribute('title')).toBeTruthy();
    rendered.rerender(
      <ArmyOrdersControl
        view={{ ...view, status: 'returning', canRecall: false }}
        onRetarget={vi.fn()}
        onRecall={vi.fn()}
      />,
    );
    expect(screen.getByTestId('army-recall').getAttribute('title')).toBe('部隊已在歸還中。');
  });
});
