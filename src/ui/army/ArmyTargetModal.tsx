import { useId, useRef, useState } from 'react';
import type { MapNodeId } from '@core/state/ids';
import { t } from '@i18n/zh-TW';
import { Dialog } from '@ui/components';
import type { ArmyOrderRequestResult, ArmyOrdersView, ArmyTargetPreview } from './orders';
import styles from './ArmyTargetModal.module.css';

const routeDaysFormat = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 });
function formatRouteDays(days: number): string {
  // A positive remaining leg must not appear as a zero-day route after rounding.
  return days > 0 && days < 0.005 ? '<0.01' : routeDaysFormat.format(days);
}

export interface ArmyTargetModalProps {
  session: object;
  view: ArmyOrdersView;
  previews: readonly ArmyTargetPreview[];
  onSubmit: (targetNodeId: MapNodeId) => ArmyOrderRequestResult;
  onClose: () => void;
}

/** Native target selection with authoritative physical-leg previews, never a fabricated march origin. */
export function ArmyTargetModal({
  session,
  view,
  previews,
  onSubmit,
  onClose,
}: ArmyTargetModalProps) {
  const id = useId();
  const cancel = useRef<HTMLButtonElement>(null);
  const [choice, setChoice] = useState<{
    session: object;
    armyId: string;
    target: MapNodeId | null;
  }>({ session, armyId: view.armyId, target: null });
  const [feedback, setFeedback] = useState<{
    session: object;
    armyId: string;
    text: string;
  } | null>(null);
  const selectedId =
    choice.session === session && choice.armyId === view.armyId ? choice.target : null;
  const selected = previews.find((preview) => preview.targetNodeId === selectedId);
  const pending = view.pendingRecall || view.pendingTargetNodeId !== null;
  const blocked = pending
    ? t('ui.army.orderQueued')
    : !view.retargetValidation.ok
      ? t(view.retargetValidation.reasonKey, {
          name: view.armyId,
          ...view.retargetValidation.params,
        })
      : previews.length === 0
        ? t('ui.army.orderNoTargets')
        : selectedId !== null && !selected
          ? t('ui.army.orderTargetUnavailable')
          : null;
  const currentFeedback =
    feedback?.session === session && feedback.armyId === view.armyId ? feedback.text : null;
  function submit() {
    if (!selected || blocked !== null || !view.canRetarget) return;
    const result = onSubmit(selected.targetNodeId);
    if (result.status === 'submitted') {
      onClose();
      return;
    }
    const text =
      result.status === 'rejected'
        ? t(result.reason, { name: view.armyId, ...result.params })
        : result.status === 'queued'
          ? t('ui.army.orderQueued')
          : result.status === 'unchanged'
            ? t('ui.army.orderUnchanged')
            : t('ui.army.orderStale');
    setFeedback({ session, armyId: view.armyId, text });
  }
  return (
    <Dialog
      open
      title={t('ui.army.orderRetarget')}
      onClose={onClose}
      closeOnBackdrop={false}
      initialFocusRef={cancel}
      footer={
        <>
          <button type="button" ref={cancel} onClick={onClose}>
            {t('ui.common.cancel')}
          </button>
          <button
            type="button"
            data-testid="army-target-submit"
            disabled={!selected || blocked !== null || !view.canRetarget}
            aria-describedby={blocked ? `${id}-reason` : undefined}
            onClick={submit}
          >
            {t('ui.army.orderSubmit')}
          </button>
        </>
      }
    >
      <div className={styles.body} data-testid="army-target-modal">
        <p>{t('ui.army.orderFrom', { node: view.fromName })}</p>
        <label className={styles.field}>
          {t('ui.march.target')}
          <select
            data-testid="army-target-select"
            value={selectedId ?? ''}
            disabled={pending || !view.canRetarget}
            onChange={(event) => {
              setChoice({
                session,
                armyId: view.armyId,
                target: event.currentTarget.value ? (event.currentTarget.value as MapNodeId) : null,
              });
              setFeedback(null);
            }}
          >
            <option value="">{t('ui.march.noTarget')}</option>
            {selectedId !== null && !selected && (
              <option value={selectedId} disabled>
                {t('ui.army.orderTargetUnavailable')}
              </option>
            )}
            {previews.map((preview) => (
              <option key={preview.targetNodeId} value={preview.targetNodeId}>
                {preview.name}
              </option>
            ))}
          </select>
        </label>
        {selected && (
          <section data-testid="army-target-preview" aria-label={t('ui.army.orderRoute')}>
            <h3>{t('ui.army.orderRoute')}</h3>
            <p className={styles.route}>{selected.nodeNames.join(' → ')}</p>
            {selected.physicalLeg && (
              <p>
                {t(
                  selected.physicalLeg.reversing
                    ? 'ui.army.orderReverseLeg'
                    : 'ui.army.orderForwardLeg',
                  {
                    from: selected.physicalLeg.fromName,
                    end: selected.physicalLeg.endName,
                  },
                )}
              </p>
            )}
            <p>
              {t('ui.army.orderPathDays', { days: formatRouteDays(selected.pathEstimateDays) })}
            </p>
          </section>
        )}
        <p className={styles.help}>{t('ui.army.orderNextTick')}</p>
        {blocked && (
          <p id={`${id}-reason`} role="status">
            {blocked}
          </p>
        )}
        {currentFeedback && <p role="alert">{currentFeedback}</p>}
      </div>
    </Dialog>
  );
}
