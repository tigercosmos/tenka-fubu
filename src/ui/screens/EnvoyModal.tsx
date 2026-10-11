import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { store } from '@app/store';
import { dispatchCommand, type CommandDispatchResult } from '@app/bridge';
import type { Command } from '@core/commands/types';
import type { ProposalId } from '@core/state/ids';
import { BAL } from '@core/balance';
import { getTrust, getSentiment, pactTrustCost } from '@core/index';
import { t } from '@i18n/zh-TW';
import { Dialog } from '../components';
import { CommandAction } from '../components/CommandAction';
import { useM6View } from '../hooks/useM6View';
import { useGameSelector } from '../hooks/useGameSelector';
import { uiStore, useUIStore } from '../hooks/uiStore';
import styles from './EnvoyModal.module.css';

export function EnvoyModal({ proposalId }: { proposalId: ProposalId }) {
  const model = useM6View();
  const game = useStore(store, (state) => state.game);
  const modal = useUIStore((state) => state.modal);
  const subject = game?.diplomacy.pendingProposals.find((item) => item.id === proposalId);
  const [revision, setRevision] = useState(0);
  const body = useRef<HTMLElement>(null);
  const initialFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    initialFocus.current = body.current?.closest<HTMLElement>('[data-ui-dialog]') ?? null;
  });
  const flushNative = useRef<() => void>(() => {});
  const owner = useMemo(
    () => ({
      game,
      modal,
      subject,
      proposalId,
      clanId: game?.meta.playerClanId,
      signature: JSON.stringify(subject),
      modalSignature: JSON.stringify(modal),
      revision,
      revoked: false,
      consumed: false,
    }),
    [game, modal, subject, proposalId, revision],
  );
  const activeOwner = useRef<typeof owner | null>(null);
  const [generation, setGeneration] = useState({ owner, value: 0 });
  if (generation.owner !== owner) setGeneration({ owner, value: generation.value + 1 });
  const subjectMatches = useCallback(
    () =>
      game !== null &&
      game.diplomacy.pendingProposals.find((item) => item.id === proposalId) === subject &&
      JSON.stringify(subject) === owner.signature,
    [game, proposalId, subject, owner.signature],
  );
  useLayoutEffect(() => {
    // Effect replay must mint a fresh lease, never make a retired lease valid again.
    if (owner.revoked) {
      setRevision((value) => value + 1);
      return;
    }
    activeOwner.current = owner;
    const revoke = () => {
      if (owner.revoked) return;
      owner.revoked = true;
      setRevision((value) => value + 1);
    };
    const check = () => {
      const current = store.getState();
      if (
        current.game !== game ||
        current.session.screen !== 'main' ||
        current.session.fatalError ||
        current.session.viewportBlocked ||
        game?.meta.gameOver !== null ||
        game?.meta.playerClanId !== owner.clanId ||
        uiStore.getState().modal !== modal ||
        JSON.stringify(modal) !== owner.modalSignature ||
        !subjectMatches()
      )
        revoke();
    };
    const unsubscribeGame = store.subscribe(check);
    const unsubscribeUI = uiStore.subscribe(check);
    const parent = body.current?.closest('[data-ui-dialog]');
    const inspect = (records: MutationRecord[]) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          const added = [
            ...(node.matches('[data-ui-dialog]') ? [node] : []),
            ...node.querySelectorAll('[data-ui-dialog]'),
          ];
          if (added.some((dialog) => dialog !== parent)) revoke();
        }
        for (const node of record.removedNodes)
          if (parent && (node === parent || (node instanceof Element && node.contains(parent))))
            revoke();
      }
    };
    const observer = new MutationObserver(inspect);
    observer.observe(document.body, { childList: true, subtree: true });
    flushNative.current = () => inspect(observer.takeRecords());
    return () => {
      unsubscribeGame();
      unsubscribeUI();
      observer.disconnect();
      owner.revoked = true;
      if (activeOwner.current === owner) {
        activeOwner.current = null;
        flushNative.current = () => {};
      }
    };
  }, [owner, game, modal, subjectMatches]);
  const owns = () => {
    flushNative.current();
    if (!owner.revoked && game !== null && !subjectMatches()) {
      owner.revoked = true;
      setRevision((value) => value + 1);
    }
    const current = store.getState();
    const native = body.current?.closest('[data-ui-dialog]');
    const dialogs = document.querySelectorAll('[data-ui-dialog]');
    return (
      !owner.revoked &&
      activeOwner.current === owner &&
      game !== null &&
      current.game === game &&
      current.session.screen === 'main' &&
      !current.session.fatalError &&
      !current.session.viewportBlocked &&
      game.meta.gameOver === null &&
      game.meta.playerClanId === owner.clanId &&
      uiStore.getState().modal === modal &&
      JSON.stringify(modal) === owner.modalSignature &&
      (modal === null || (modal.id === 'envoy' && modal.params.proposalId === proposalId)) &&
      native !== null &&
      native !== undefined &&
      dialogs.item(dialogs.length - 1) === native
    );
  };
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
    if (
      proposal === undefined &&
      modal?.id === 'envoy' &&
      modal.params.proposalId === proposalId &&
      owns()
    )
      actions.closeOwnedModal(modal, { expectedGame: game });
  });
  if (proposal === undefined)
    return modal?.id === 'envoy' && modal.params.proposalId === proposalId ? (
      <Dialog
        open
        title={t('ui.envoy.title', { clan: '' })}
        onClose={() => {}}
        closeOnBackdrop={false}
        dismissible={false}
        initialFocusRef={initialFocus}
      >
        <article ref={body} />
      </Dialog>
    ) : null;
  const submit = (command: Command): CommandDispatchResult => {
    if (
      !owns() ||
      subject === undefined ||
      subject.toClanId !== owner.clanId ||
      owner.consumed ||
      command.type !== 'respondPact' ||
      command.proposalId !== proposalId ||
      command.clanId !== owner.clanId
    )
      return { ok: false, reason: 'cmd.reject.invalidTarget' };
    const native = body.current?.closest('[data-ui-dialog]');
    owner.consumed = true;
    const result = dispatchCommand(command);
    const canPublish = () => owns() && body.current?.closest('[data-ui-dialog]') === native;
    if (!canPublish()) return result;
    if (!result.ok) {
      owner.consumed = false;
      return result;
    }
    actions.markDecisionQueued(proposalId);
    if (canPublish() && modal !== null) actions.closeOwnedModal(modal, { expectedGame: game });
    return result;
  };
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
      initialFocusRef={initialFocus}
    >
      <article ref={body} data-testid="envoy-modal" className={styles.frame}>
        <h3>{t(`cmd.diplomacy.${proposal.kind}`)}</h3>
        <p className={styles.introduction}>
          {proposal.kind === 'demandVassal'
            ? t('ui.envoy.demandVassal', { clan: from })
            : proposal.kind === 'offerVassal'
              ? t('ui.envoy.offerVassal', { clan: from })
              : t('ui.envoy.pactTerms')}
        </p>
        <p className={styles.terms}>
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
        <p className={styles.metric}>
          {t('ui.diplomacy.trust')} {Math.floor(relations[0]!)} · {t('ui.diplomacy.sentiment')}{' '}
          {Math.floor(relations[1]!)}
        </p>
        <p className={styles.metric}>
          {t('ui.envoy.expires', { days: Math.max(0, proposal.expiresDay - model.day) })}
        </p>
        <p className={styles.effects}>
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
        <p className={styles.effects}>
          {t('ui.envoy.rejectEffects', { months: BAL.dipRefusalCooldownMonths })}
        </p>
        <div className={styles.decisions}>
          {[false, true].map((accept) => (
            <CommandAction
              key={`${generation.value}:${accept}`}
              command={{ type: 'respondPact', clanId: model.playerClanId, proposalId, accept }}
              label={t(accept ? 'ui.common.accept' : 'ui.common.reject')}
              onCommand={submit}
            />
          ))}
        </div>
      </article>
    </Dialog>
  );
}
