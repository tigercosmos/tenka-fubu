import { useEffect } from 'react';
import type { ProposalId } from '@core/state/ids';
import { BAL } from '@core/balance';
import { getTrust, getSentiment, pactTrustCost } from '@core/index';
import { t } from '@i18n/zh-TW';
import { Dialog } from '../components';
import { CommandAction } from '../components/CommandAction';
import { useM6View } from '../hooks/useM6View';
import { useGameSelector } from '../hooks/useGameSelector';
import { uiStore, useUIStore } from '../hooks/uiStore';
import styles from './M6Panel.module.css';

export function EnvoyModal({ proposalId }: { proposalId: ProposalId }) {
  const model = useM6View();
  const proposal = model.envoys.find((item) => item.id === proposalId);
  const actions = useUIStore((state) => state.actions);
  const relations = useGameSelector((game) =>
    proposal === undefined
      ? [0, 0]
      : [
          getTrust(game, model.playerClanId, proposal.fromClanId),
          getSentiment(game, model.playerClanId, proposal.fromClanId),
        ],
  );
  useEffect(() => {
    if (proposal === undefined && uiStore.getState().modal?.params.proposalId === proposalId)
      actions.closeModal();
  }, [proposal, proposalId, actions]);
  if (proposal === undefined) return null;
  const from = model.clans.find((clan) => clan.id === proposal.fromClanId)?.name ?? '';
  const term =
    proposal.kind === 'proposeAlliance'
      ? BAL.allianceMonths
      : proposal.kind === 'proposeCeasefire'
        ? BAL.ceasefireMonths
        : null;
  return (
    <Dialog
      open
      title={t('ui.envoy.title', { clan: from })}
      onClose={() => {}}
      closeOnBackdrop={false}
      dismissible={false}
    >
      <article data-testid="envoy-modal">
        <h3>{t(`cmd.diplomacy.${proposal.kind}`)}</h3>
        <p>
          {proposal.kind === 'demandVassal'
            ? t('ui.envoy.demandVassal', { clan: from })
            : proposal.kind === 'offerVassal'
              ? t('ui.envoy.offerVassal', { clan: from })
              : t('ui.envoy.pactTerms')}
        </p>
        <p>
          {t(
            proposal.kind === 'demandVassal' || proposal.kind === 'offerVassal'
              ? 'ui.envoy.terms.vassal'
              : `ui.envoy.terms.${proposal.kind}`,
            { months: BAL.marriageNoBreakMonths, rate: BAL.vassalTributeRate * 100 },
          )}
        </p>
        {(proposal.kind === 'proposeMarriage' ||
          proposal.kind === 'demandVassal' ||
          proposal.kind === 'offerVassal') && <p>{t('ui.diplomacy.permanent')}</p>}
        {term !== null && <p>{t('ui.diplomacy.remaining', { months: term })}</p>}
        {proposal.marriageOfficerIds !== null && (
          <p>
            {t('ui.envoy.marriage', {
              names: proposal.marriageOfficerIds
                .map((id) => model.officers.find((officer) => officer.id === id)?.name ?? id)
                .join('、'),
            })}
          </p>
        )}
        {proposal.reinforceAgainstClanId !== null && (
          <p>
            {t('ui.envoy.reinforce', {
              clan:
                model.clans.find((clan) => clan.id === proposal.reinforceAgainstClanId)?.name ?? '',
            })}
          </p>
        )}
        <p>
          {t('ui.diplomacy.trust')} {Math.floor(relations[0]!)} · {t('ui.diplomacy.sentiment')}{' '}
          {Math.floor(relations[1]!)}
        </p>
        <p>{t('ui.envoy.expires', { days: Math.max(0, proposal.expiresDay - model.day) })}</p>
        <p>
          {t('ui.envoy.acceptEffects', {
            trust: pactTrustCost(proposal.kind),
            sentiment:
              proposal.kind === 'proposeAlliance'
                ? BAL.sentimentPactSignedAlliance
                : proposal.kind === 'proposeMarriage'
                  ? BAL.sentimentPactSignedMarriage
                  : proposal.kind === 'proposeCeasefire'
                    ? BAL.sentimentPactSignedCeasefire
                    : 0,
          })}
        </p>
        {proposal.kind === 'proposeMarriage' && (
          <p>{t('ui.envoy.marriageGold', { gold: BAL.goldCostMarriage })}</p>
        )}
        <p>{t('ui.envoy.rejectEffects', { months: BAL.dipRefusalCooldownMonths })}</p>
        <div className={styles.actions}>
          {[false, true].map((accept) => (
            <CommandAction
              key={String(accept)}
              command={{ type: 'respondPact', clanId: model.playerClanId, proposalId, accept }}
              label={t(accept ? 'ui.common.accept' : 'ui.common.reject')}
              onSubmitted={() => {
                actions.markDecisionQueued(proposalId);
                actions.closeModal();
              }}
            />
          ))}
        </div>
      </article>
    </Dialog>
  );
}
