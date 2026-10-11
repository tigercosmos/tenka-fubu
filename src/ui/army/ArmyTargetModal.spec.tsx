import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ArmyId, MapNodeId } from '@core/state/ids';
import type { ArmyOrdersView, ArmyTargetPreview } from './orders';
import { ArmyTargetModal } from './ArmyTargetModal';

const armyId = 'army.000001' as ArmyId,
  targetId = 'castle.b' as MapNodeId;
const view: ArmyOrdersView = {
  armyId,
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
const previews: readonly ArmyTargetPreview[] = [
  {
    targetNodeId: targetId,
    name: '乙城',
    nodeIds: [view.fromNodeId, targetId],
    nodeNames: ['甲城', '乙城'],
    pathEstimateDays: 2.5,
  },
];
afterEach(cleanup);
describe('ArmyTargetModal', () => {
  it.each([
    [0.923076923, '0.92'],
    [0.0001, '<0.01'],
  ])('shows a positive fractional route of %s days without truncating it to zero', (days, text) => {
    const onSubmit = vi.fn(() => ({ status: 'submitted' as const }));
    render(
      <ArmyTargetModal
        session={{}}
        view={view}
        previews={[{ ...previews[0]!, pathEstimateDays: days }]}
        onSubmit={onSubmit}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByTestId('army-target-select'), { target: { value: targetId } });
    expect(screen.getByTestId('army-target-preview').textContent).toContain(`基準路程${text}日`);
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it('previews native selected target without submission, then only explicit execute queues it', () => {
    const onSubmit = vi.fn(() => ({ status: 'submitted' as const })),
      onClose = vi.fn(),
      session = {};
    const before = structuredClone({ view, previews });
    render(
      <ArmyTargetModal
        session={session}
        view={view}
        previews={previews}
        onSubmit={onSubmit}
        onClose={onClose}
      />,
    );
    expect(screen.getByTestId('army-target-submit')).toHaveProperty('disabled', true);
    fireEvent.change(screen.getByRole('combobox', { name: '目標' }), {
      target: { value: targetId },
    });
    expect(screen.getByTestId('army-target-preview').textContent).toContain('甲城 → 乙城');
    expect(screen.getByTestId('army-target-preview').textContent).toContain('基準路程2.5日');
    expect(screen.getByTestId('army-target-preview').textContent).toContain('從目前實際位置起算');
    expect(onSubmit).not.toHaveBeenCalled();
    expect({ view, previews }).toEqual(before);
    fireEvent.click(screen.getByTestId('army-target-submit'));
    expect(onSubmit).toHaveBeenCalledWith(targetId);
    expect(onClose).toHaveBeenCalledOnce();
  });
  it.each([false, true])(
    'truthfully labels an entered physical leg (reversing=%s)',
    (reversing) => {
      const onSubmit = vi.fn(() => ({ status: 'submitted' as const }));
      render(
        <ArmyTargetModal
          session={{}}
          view={view}
          previews={[
            { ...previews[0]!, physicalLeg: { fromName: '甲城', endName: '丙郡', reversing } },
          ]}
          onSubmit={onSubmit}
          onClose={vi.fn()}
        />,
      );
      fireEvent.change(screen.getByTestId('army-target-select'), { target: { value: targetId } });
      const text = screen.getByTestId('army-target-preview').textContent;
      expect(text).toContain(
        reversing
          ? '沿目前的甲城—丙郡路段折返甲城，再依新路徑前進。'
          : '先完成目前的甲城—丙郡路段，再依新路徑前進。',
      );
      expect(text).toContain('速度與通行變更仍可影響抵達日');
      expect(onSubmit).not.toHaveBeenCalled();
    },
  );
  it('retains a now-invalid selection explicitly instead of silently choosing another route', () => {
    const onSubmit = vi.fn(() => ({ status: 'submitted' as const })),
      props = { session: {}, view, previews, onSubmit, onClose: vi.fn() };
    const rendered = render(<ArmyTargetModal {...props} />);
    fireEvent.change(screen.getByTestId('army-target-select'), { target: { value: targetId } });
    rendered.rerender(<ArmyTargetModal {...props} previews={[]} />);
    expect(screen.getByTestId('army-target-submit')).toHaveProperty('disabled', true);
    expect(screen.getByTestId('army-target-select')).toHaveProperty('value', targetId);
    expect(screen.queryByTestId('army-target-preview')).toBeNull();
    fireEvent.click(screen.getByTestId('army-target-submit'));
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it('synchronously discards target and feedback across session or army identity replacement', () => {
    const props = {
      session: {},
      view,
      previews,
      onSubmit: vi.fn(() => ({ status: 'rejected' as const, reason: 'cmd.reject.pathBlocked' })),
      onClose: vi.fn(),
    };
    const rendered = render(<ArmyTargetModal {...props} />);
    fireEvent.change(screen.getByTestId('army-target-select'), { target: { value: targetId } });
    fireEvent.click(screen.getByTestId('army-target-submit'));
    expect(screen.getByRole('alert')).toBeTruthy();
    rendered.rerender(<ArmyTargetModal {...props} session={{}} />);
    expect(screen.getByTestId('army-target-select')).toHaveProperty('value', '');
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.change(screen.getByTestId('army-target-select'), { target: { value: targetId } });
    rendered.rerender(
      <ArmyTargetModal {...props} view={{ ...view, armyId: 'army.000002' as ArmyId }} />,
    );
    expect(screen.getByTestId('army-target-select')).toHaveProperty('value', '');
  });
  it('keeps rejected/stale submission inside the dialog and disables queued state', () => {
    const props = {
      session: {},
      view,
      previews,
      onSubmit: vi.fn(() => ({ status: 'stale' as const })),
      onClose: vi.fn(),
    };
    const rendered = render(<ArmyTargetModal {...props} />);
    fireEvent.change(screen.getByTestId('army-target-select'), { target: { value: targetId } });
    fireEvent.click(screen.getByTestId('army-target-submit'));
    expect(props.onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('遊戲已變更');
    rendered.rerender(
      <ArmyTargetModal
        {...props}
        view={{ ...view, pendingTargetNodeId: targetId, canRetarget: false }}
      />,
    );
    expect(screen.getByTestId('army-target-select')).toHaveProperty('disabled', true);
    expect(screen.getByTestId('army-target-submit')).toHaveProperty('disabled', true);
  });
  it('cancel never submits and remains the preferred initial control', () => {
    const onSubmit = vi.fn(() => ({ status: 'submitted' as const })),
      onClose = vi.fn();
    render(
      <ArmyTargetModal
        session={{}}
        view={view}
        previews={previews}
        onSubmit={onSubmit}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
