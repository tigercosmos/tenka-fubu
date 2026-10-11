import { useId } from 'react';
import { t } from '@i18n/zh-TW';
import type { ValidationResult } from '@core/commands/types';
import type { ArmyOrdersView } from './orders';
import styles from './ArmyOrdersControl.module.css';

function reason(view: ArmyOrdersView, validation: ValidationResult): string | null {
  return validation.ok
    ? null
    : t(validation.reasonKey, {
        name: view.armyId,
        ...validation.params,
      });
}

export interface ArmyOrdersControlProps {
  view: ArmyOrdersView;
  onRetarget: () => void;
  onRecall: () => void;
  feedback?: string | null;
}

/** Current permission and queued intent are separate; neither button applies gameplay effects. */
export function ArmyOrdersControl({
  view,
  onRetarget,
  onRecall,
  feedback,
}: ArmyOrdersControlProps) {
  const id = useId();
  const pending = view.pendingRecall || view.pendingTargetNodeId !== null;
  const targetReason = pending ? t('ui.army.orderQueued') : reason(view, view.retargetValidation);
  const recallReason = pending
    ? t('ui.army.orderQueued')
    : view.status === 'returning'
      ? t('ui.army.orderReturning')
      : reason(view, view.recallValidation);
  return (
    <div className={styles.control} data-testid="army-orders-control">
      <button
        type="button"
        data-testid="army-retarget"
        disabled={pending || !view.canRetarget}
        title={targetReason ?? undefined}
        aria-describedby={targetReason ? `${id}-target` : undefined}
        onClick={onRetarget}
      >
        {t('ui.army.orderRetarget')}
      </button>
      <button
        type="button"
        data-testid="army-recall"
        disabled={pending || !view.canRecall}
        title={recallReason ?? undefined}
        aria-describedby={recallReason ? `${id}-recall` : undefined}
        onClick={onRecall}
      >
        {t('ui.army.orderRecall')}
      </button>
      {targetReason && (
        <span id={`${id}-target`} className={styles.hint}>
          {targetReason}
        </span>
      )}
      {recallReason && recallReason !== targetReason && (
        <span id={`${id}-recall`} className={styles.hint}>
          {recallReason}
        </span>
      )}
      {recallReason && recallReason === targetReason && (
        <span id={`${id}-recall`} className={styles.srOnly}>
          {recallReason}
        </span>
      )}
      {feedback && (
        <span role="status" className={styles.hint}>
          {feedback}
        </span>
      )}
    </div>
  );
}
