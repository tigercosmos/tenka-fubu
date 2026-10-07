import { useId, useMemo, useState, type ReactElement } from 'react';
import { dispatchCommand, type CommandDispatchResult } from '@app/bridge';
import { validateCommand } from '@core/index';
import type { Command } from '@core/commands/types';
import { t } from '@i18n/zh-TW';
import { makeCachedSelector, useCachedGameSelector } from '../hooks/useGameSelector';
import styles from './CommandAction.module.css';
import { ConfirmDialog } from './ConfirmDialog/ConfirmDialog';

export interface CommandActionProps {
  command: Command;
  label: string;
  confirmation?: string;
  danger?: boolean;
  onSubmitted?: () => void;
  onCommand?: (command: Command) => CommandDispatchResult;
}

/** Show the actual command validator's reason; never predict eligibility in the UI. */
export function CommandAction({
  command,
  label,
  confirmation,
  danger = false,
  onSubmitted,
  onCommand = dispatchCommand,
}: CommandActionProps): ReactElement {
  const reasonId = useId();
  const validate = useMemo(
    () =>
      makeCachedSelector((game, serialized: string) =>
        validateCommand(game, JSON.parse(serialized) as Command),
      ),
    [],
  );
  const verdict = useCachedGameSelector(validate, JSON.stringify(command));
  const [confirming, setConfirming] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const reason = verdict.ok ? null : t(verdict.reasonKey, verdict.params);
  const submit = () => {
    const result = onCommand(command);
    setConfirming(false);
    if (!result.ok) setFeedback(t(result.reason, result.params));
    else {
      setFeedback(null);
      onSubmitted?.();
    }
  };
  return (
    <div className={styles.action}>
      <button
        type="button"
        disabled={!verdict.ok}
        title={reason ?? undefined}
        aria-describedby={reason === null ? undefined : reasonId}
        onClick={() => (confirmation === undefined ? submit() : setConfirming(true))}
      >
        {label}
      </button>
      {reason !== null && <small id={reasonId}>{reason}</small>}
      {feedback !== null && <p role="alert">{feedback}</p>}
      {confirmation !== undefined && (
        <ConfirmDialog
          open={confirming}
          title={label}
          message={confirmation}
          danger={danger}
          onConfirm={submit}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
