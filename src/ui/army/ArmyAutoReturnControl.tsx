import { useId } from 'react';
import { t } from '@i18n/zh-TW';
import type { ArmyAutoReturnView } from './autoReturn';
import styles from './ArmyAutoReturnControl.module.css';

export interface ArmyAutoReturnControlProps {
  view: ArmyAutoReturnView;
  onToggle: (enabled: boolean) => void;
}

/** Actual enabled state stays unchanged until the queued command executes on a normal tick. */
export function ArmyAutoReturnControl({ view, onToggle }: ArmyAutoReturnControlProps) {
  const helpId = useId();
  const pending = view.pendingEnabled !== null;
  const disabled = pending || !view.canToggle;
  const reason = !view.validation.ok
    ? t(view.validation.reasonKey, { name: view.armyId, ...view.validation.params })
    : null;
  return (
    <div className={styles.control} data-testid="army-auto-return-control">
      <button
        type="button"
        role="switch"
        aria-label={t('ui.army.autoReturn')}
        aria-checked={view.enabled}
        aria-describedby={helpId}
        disabled={disabled}
        title={reason ?? undefined}
        data-testid="army-auto-return-toggle"
        onClick={() => {
          if (!disabled) onToggle(!view.enabled);
        }}
      >
        {t('ui.army.autoReturn')}：
        {t(view.enabled ? 'ui.army.autoReturnOn' : 'ui.army.autoReturnOff')}
      </button>
      <span id={helpId} className={styles.help}>
        {pending
          ? t('ui.army.autoReturnQueued', {
              state: t(view.pendingEnabled ? 'ui.army.autoReturnOn' : 'ui.army.autoReturnOff'),
            })
          : (reason ?? t('ui.army.autoReturnHelp'))}
      </span>
    </div>
  );
}
