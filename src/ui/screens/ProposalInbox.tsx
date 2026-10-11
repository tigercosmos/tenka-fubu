import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { store } from '@app/store';
import { dispatchCommand, type CommandDispatchResult } from '@app/bridge';
import type { GameState } from '@core/state/gameState';
import type { Command } from '@core/commands/types';
import { BAL } from '@core/balance';
import { t } from '@i18n/zh-TW';
import { Dialog } from '../components';
import { CommandAction } from '../components/CommandAction';
import { useM6View } from '../hooks/useM6View';
import { uiStore, useUIStore } from '../hooks/uiStore';
import styles from './ProposalInbox.module.css';
import { makeCachedSelector, useCachedGameSelector } from '../hooks/useGameSelector';
import { describeProposal } from './proposalDescription';

const identities = new WeakMap<object, number>();
let nextIdentity = 0;
function identity(value: object | null): number {
  if (value === null) return 0;
  let id = identities.get(value);
  if (id === undefined) identities.set(value, (id = ++nextIdentity));
  return id;
}

export function ProposalInbox() {
  const game = useStore(store, (state) => state.game);
  const modal = useUIStore((state) => state.modal);
  if (game === null) return null;
  return <OwnedInbox key={`${identity(game)}:${identity(modal)}`} game={game} modal={modal} />;
}

function OwnedInbox({
  game,
  modal,
}: {
  game: GameState;
  modal: ReturnType<typeof uiStore.getState>['modal'];
}) {
  const model = useM6View();
  const actions = useUIStore((state) => state.actions);
  const [handled, setHandled] = useState<Set<string>>(() => new Set());
  const [feedback, setFeedback] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const body = useRef<HTMLElement>(null);
  const flushNative = useRef<() => void>(() => {});
  const owner = useMemo(
    () => ({
      game,
      modal,
      modalSignature: JSON.stringify(modal),
      clanId: game.meta.playerClanId,
      subjects: Object.values(game.proposals)
        .filter((item) => item.status === 'pending')
        .map((proposal) => ({
          proposal,
          command: proposal.command,
          signature: JSON.stringify(proposal),
        })),
      revision,
      revoked: false,
    }),
    [game, modal, revision],
  );
  const activeOwner = useRef<typeof owner | null>(null);
  const consumed = useRef(new Set<string>());
  const bulkBusy = useRef(false);
  useLayoutEffect(() => {
    // StrictMode replays effects with the same memoized owner; never revive that lease.
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
    const checkSession = () => {
      const current = store.getState();
      if (
        current.game !== game ||
        current.session.screen !== 'main' ||
        current.session.fatalError ||
        current.session.viewportBlocked ||
        game.meta.gameOver !== null ||
        game.meta.playerClanId !== owner.clanId ||
        uiStore.getState().modal !== modal ||
        JSON.stringify(modal) !== owner.modalSignature ||
        owner.subjects.some(
          ({ proposal, command, signature }) =>
            game.proposals[proposal.id] !== proposal ||
            proposal.command !== command ||
            JSON.stringify(proposal) !== signature,
        )
      )
        revoke();
    };
    const unsubscribeGame = store.subscribe(checkSession);
    const unsubscribeUI = uiStore.subscribe(checkSession);
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
  }, [game, modal, owner]);
  const owns = () => {
    flushNative.current();
    if (
      !owner.revoked &&
      owner.subjects.some(
        ({ proposal, command, signature }) =>
          game.proposals[proposal.id] !== proposal ||
          proposal.command !== command ||
          JSON.stringify(proposal) !== signature,
      )
    ) {
      owner.revoked = true;
      setRevision((value) => value + 1);
    }
    const current = store.getState();
    const native = body.current?.closest('[data-ui-dialog]');
    const dialogs = document.querySelectorAll('[data-ui-dialog]');
    return (
      !owner.revoked &&
      activeOwner.current === owner &&
      current.game === game &&
      current.session.screen === 'main' &&
      !current.session.fatalError &&
      !current.session.viewportBlocked &&
      game.meta.gameOver === null &&
      game.meta.playerClanId === owner.clanId &&
      uiStore.getState().modal === modal &&
      JSON.stringify(modal) === owner.modalSignature &&
      (modal === null || modal.id === 'proposalInbox') &&
      native !== null &&
      native !== undefined &&
      dialogs.item(dialogs.length - 1) === native
    );
  };
  const capture = (id: string) => {
    const proposal = Object.values(game.proposals).find((item) => item.id === id);
    return proposal === undefined
      ? null
      : { proposal, command: proposal.command, signature: JSON.stringify(proposal) };
  };
  const ownsProposal = (subject: ReturnType<typeof capture>) =>
    subject !== null &&
    owns() &&
    game.proposals[subject.proposal.id] === subject.proposal &&
    subject.proposal.command === subject.command &&
    JSON.stringify(subject.proposal) === subject.signature &&
    subject.proposal.status === 'pending' &&
    subject.proposal.clanId === owner.clanId;
  const pending = model.proposals.filter((proposal) => !handled.has(proposal.id));
  const current = pending[0];
  const describe = useMemo(
    () =>
      makeCachedSelector((game, id: string | undefined) => {
        const proposal =
          id === undefined
            ? undefined
            : Object.values(game.proposals).find((item) => item.id === id);
        return proposal === undefined ? null : describeProposal(game, proposal);
      }),
    [],
  );
  const description = useCachedGameSelector(describe, current?.id);
  useEffect(() => {
    if (pending.length === 0 && modal?.id === 'proposalInbox' && owns())
      actions.closeOwnedModal(modal, { expectedGame: game });
  });
  if (current === undefined)
    return modal?.id === 'proposalInbox' ? (
      <Dialog
        open
        title={t('ui.proposal.title', { year: model.year, month: model.month, count: 0 })}
        onClose={() => {}}
        closeOnBackdrop={false}
        dismissible={false}
      >
        <article ref={body} />
      </Dialog>
    ) : null;
  const subject = capture(current.id);
  const bulkSubjects = pending.map((proposal) => capture(proposal.id));
  const submit = (
    captured: ReturnType<typeof capture>,
    command: Command,
  ): CommandDispatchResult => {
    if (
      !ownsProposal(captured) ||
      captured === null ||
      consumed.current.has(captured.proposal.id) ||
      command.type !== 'resolveProposal' ||
      command.proposalId !== captured.proposal.id ||
      command.clanId !== owner.clanId
    )
      return { ok: false, reason: 'cmd.reject.invalidTarget' };
    const native = body.current?.closest('[data-ui-dialog]');
    consumed.current.add(captured.proposal.id);
    const result = dispatchCommand(command);
    const canPublish = () =>
      ownsProposal(captured) && body.current?.closest('[data-ui-dialog]') === native;
    if (!canPublish()) return result;
    if (!result.ok) {
      consumed.current.delete(captured.proposal.id);
      setFeedback(t(result.reason, result.params));
      return result;
    }
    actions.markDecisionQueued(captured.proposal.id);
    if (canPublish()) setHandled((previous) => new Set([...previous, captured.proposal.id]));
    return result;
  };
  const rejectAll = () => {
    if (!owns() || bulkBusy.current) return;
    bulkBusy.current = true;
    for (const captured of bulkSubjects) {
      if (!ownsProposal(captured) || captured === null) break;
      const result = submit(captured, {
        type: 'resolveProposal',
        clanId: model.playerClanId,
        proposalId: captured.proposal.id,
        accept: false,
      });
      if (!result.ok || !owns()) break;
    }
    bulkBusy.current = false;
  };
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
        <button type="button" className={styles.rejectAll} onClick={rejectAll}>
          {t('ui.proposal.rejectAll')}
        </button>
      }
    >
      <article ref={body} className={styles.card} data-testid="proposal-inbox">
        <h3>{t('ui.proposal.author', { name: description?.proposer ?? current.officerId })}</h3>
        <span className={styles.badge} data-testid="proposal-kind">
          {description?.kind}
        </span>
        <p>{t(current.summaryKey, current.summaryParams)}</p>
        <div data-testid="proposal-command-details">
          {description?.details.map((detail, index) => (
            <p key={index}>{detail}</p>
          ))}
        </div>
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
              key={`${revision}:${identity(subject?.proposal ?? null)}:${subject?.signature}:${accept}`}
              command={{
                type: 'resolveProposal',
                clanId: model.playerClanId,
                proposalId: current.id,
                accept,
              }}
              label={t(accept ? 'ui.proposal.adopt' : 'ui.common.reject')}
              onCommand={(command) => submit(subject, command)}
            />
          ))}
        </div>
        <p aria-live="polite">{t('ui.proposal.remaining', { count: pending.length })}</p>
        {feedback !== null && <p role="alert">{feedback}</p>}
      </article>
    </Dialog>
  );
}
