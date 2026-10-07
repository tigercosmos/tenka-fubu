import { useEffect, useState } from 'react';
import { dispatchCommand } from '@app/bridge';
import { BAL } from '@core/balance';
import { t } from '@i18n/zh-TW';
import { Dialog } from '../components';
import { CommandAction } from '../components/CommandAction';
import { useM6View } from '../hooks/useM6View';
import { uiStore, useUIStore } from '../hooks/uiStore';
import styles from './M6Panel.module.css';

export function ProposalInbox() {
  const model = useM6View();
  const actions = useUIStore((state) => state.actions);
  const [handled, setHandled] = useState<Set<string>>(() => new Set());
  const [feedback, setFeedback] = useState<string | null>(null);
  const pending = model.proposals.filter((proposal) => !handled.has(proposal.id));
  const current = pending[0];
  useEffect(() => {
    if (pending.length === 0 && uiStore.getState().modal?.id === 'proposalInbox')
      actions.closeModal();
  }, [pending.length, actions]);
  if (current === undefined) return null;
  const advance = () => {
    actions.markDecisionQueued(current.id);
    setHandled((previous) => new Set([...previous, current.id]));
  };
  const rejectAll = () => {
    const done: string[] = [];
    for (const proposal of pending) {
      const result = dispatchCommand({
        type: 'resolveProposal',
        clanId: model.playerClanId,
        proposalId: proposal.id,
        accept: false,
      });
      if (!result.ok) {
        setFeedback(t(result.reason, result.params));
        break;
      }
      done.push(proposal.id);
      actions.markDecisionQueued(proposal.id);
    }
    setHandled((previous) => new Set([...previous, ...done]));
  };
  const officer = model.officers.find((item) => item.id === current.officerId);
  return (
    <Dialog
      open
      title={t('ui.proposal.title', {
        year: model.year,
        month: model.month,
        count: pending.length,
      })}
      onClose={() => {}}
      closeOnBackdrop={false}
      dismissible={false}
      footer={
        <button type="button" onClick={rejectAll}>
          {t('ui.proposal.rejectAll')}
        </button>
      }
    >
      <article className={styles.card} data-testid="proposal-inbox">
        <h3>{t('ui.proposal.author', { name: officer?.name ?? current.officerId })}</h3>
        <p>{t(current.summaryKey, current.summaryParams)}</p>
        <p>
          {t('ui.proposal.cost', { gold: current.estimatedCostGold, merit: current.meritReward })}
        </p>
        <p>{t('ui.proposal.expires', { days: Math.max(0, current.expiresDay - model.day) })}</p>
        <p>
          {t('ui.proposal.decisionEffects', {
            adopt: BAL.proposalAdoptLoyalty,
            reject: BAL.proposalRejectLoyalty,
            expire: BAL.proposalExpireLoyalty,
          })}
        </p>
        <div className={styles.actions}>
          {[false, true].map((accept) => (
            <CommandAction
              key={String(accept)}
              command={{
                type: 'resolveProposal',
                clanId: model.playerClanId,
                proposalId: current.id,
                accept,
              }}
              label={t(accept ? 'ui.proposal.adopt' : 'ui.common.reject')}
              onSubmitted={advance}
            />
          ))}
        </div>
        <p aria-live="polite">{t('ui.proposal.remaining', { count: pending.length })}</p>
        {feedback !== null && <p role="alert">{feedback}</p>}
      </article>
    </Dialog>
  );
}
