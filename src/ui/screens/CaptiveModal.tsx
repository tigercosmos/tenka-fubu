import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { store } from '@app/store';
import { dispatchCommand, type CommandDispatchResult } from '@app/bridge';
import { captiveRecruitSuccessRate, officerAbilityScore, validateCommand } from '@core/index';
import type { Command } from '@core/commands/types';
import { BAL } from '@core/balance';
import type { OfficerId } from '@core/state/ids';
import { t } from '@i18n/zh-TW';
import { ConfirmDialog, Dialog } from '../components';
import { CommandAction } from '../components/CommandAction';
import { useM6View } from '../hooks/useM6View';
import { useGameSelector } from '../hooks/useGameSelector';
import { uiStore, useUIStore } from '../hooks/uiStore';
import styles from './M6Panel.module.css';
import { CaptiveSummary } from './CaptiveSummary';

export function CaptiveModal({
  officerId,
  onCommand = dispatchCommand,
}: {
  officerId: OfficerId;
  onCommand?: (command: Command) => CommandDispatchResult;
}) {
  const model = useM6View();
  const game = useStore(store, (state) => state.game);
  const modal = useUIStore((state) => state.modal);
  const subject = game?.officers[officerId];
  const [leaseRevision, setLeaseRevision] = useState(0);
  const owner = useMemo(
    () => ({
      game,
      subject,
      modal,
      officerId,
      clanId: game?.meta.playerClanId,
      leaseRevision,
      revoked: false,
    }),
    [game, subject, modal, officerId, leaseRevision],
  );
  const activeOwner = useRef<typeof owner | null>(null);
  const consumed = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const confirmationRef = useRef<HTMLSpanElement>(null);
  const nativeObserver = useRef<MutationObserver | null>(null);
  const executeReasonId = useId();
  const [execution, setExecution] = useState<{ owner: typeof owner } | null>(null);
  const activeExecution = useRef<typeof execution>(null);
  const [executeFeedback, setExecuteFeedback] = useState<string | null>(null);
  const [executor, setExecutor] = useState<OfficerId | ''>('');
  const [executorRevision, setExecutorRevision] = useState(0);
  const executorOfficerId = executor || game?.clans[model.playerClanId]?.leaderId;
  const executorOfficer = executorOfficerId ? game?.officers[executorOfficerId] : undefined;
  const recruitDraft = useMemo(
    () => ({
      owner,
      executor,
      executorOfficerId,
      executorOfficer,
      executorRevision,
      revoked: false,
    }),
    [owner, executor, executorOfficerId, executorOfficer, executorRevision],
  );
  const [generation, setGeneration] = useState({ owner, value: 0 });
  if (generation.owner !== owner) setGeneration({ owner, value: generation.value + 1 });
  const [recruitGeneration, setRecruitGeneration] = useState({ recruitDraft, value: 0 });
  if (recruitGeneration.recruitDraft !== recruitDraft)
    setRecruitGeneration({ recruitDraft, value: recruitGeneration.value + 1 });
  useLayoutEffect(() => {
    if (owner.revoked) {
      setLeaseRevision((value) => value + 1);
      return;
    }
    activeOwner.current = owner;
    consumed.current = false;
    setExecutor('');
    activeExecution.current = null;
    setExecution(null);
    setExecuteFeedback(null);
    const revoke = () => {
      if (owner.revoked) return;
      owner.revoked = true;
      activeExecution.current = null;
      setExecution(null);
      setLeaseRevision((value) => value + 1);
    };
    const unsubscribeUI = uiStore.subscribe((current, previous) => {
      if (owner.modal !== null && previous.modal === owner.modal && current.modal !== owner.modal)
        revoke();
    });
    const unsubscribeGame = store.subscribe((current) => {
      if (
        current.game !== owner.game ||
        current.game?.officers[officerId] !== owner.subject ||
        current.game?.meta.playerClanId !== owner.clanId ||
        current.session.screen !== 'main' ||
        current.session.fatalError ||
        current.session.viewportBlocked ||
        current.game?.meta.gameOver !== null
      )
        revoke();
    });
    const parent = bodyRef.current?.closest('[data-ui-dialog]');
    const observer = new MutationObserver((records) => inspectNative(records));
    const inspectNative = (records: MutationRecord[]) => {
      const confirmation = confirmationRef.current?.closest('[data-ui-dialog]');
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          const added = [
            ...(node.matches('[data-ui-dialog]') ? [node] : []),
            ...node.querySelectorAll('[data-ui-dialog]'),
          ];
          if (added.some((dialog) => dialog !== parent && dialog !== confirmation)) revoke();
        }
        for (const node of record.removedNodes) {
          if (parent && (node === parent || (node instanceof Element && node.contains(parent))))
            revoke();
        }
      }
    };
    observer.observe(document.body, { childList: true, subtree: true });
    nativeObserver.current = observer;
    // Drain records synchronously before a retained callback can run in the same task.
    flushNative.current = () => inspectNative(observer.takeRecords());
    return () => {
      unsubscribeUI();
      unsubscribeGame();
      observer.disconnect();
      if (nativeObserver.current === observer) {
        nativeObserver.current = null;
        flushNative.current = () => {};
      }
      owner.revoked = true;
      if (activeOwner.current === owner) activeOwner.current = null;
    };
  }, [owner, officerId]);
  const officer = model.officers.find((item) => item.id === officerId);
  const actions = useUIStore((state) => state.actions);
  const flushNative = useRef<() => void>(() => {});
  const ownsModal = useCallback(() => {
    flushNative.current();
    const current = store.getState();
    return (
      activeOwner.current === owner &&
      !owner.revoked &&
      current.game === game &&
      game !== null &&
      game.officers[officerId] === subject &&
      game.meta.playerClanId === owner.clanId &&
      uiStore.getState().modal === modal &&
      modal?.id === 'captive' &&
      modal.params.officerId === officerId
    );
  }, [owner, game, subject, modal, officerId]);
  const nativeOwner = useCallback((confirmation = false) => {
    const expected = (confirmation ? confirmationRef.current : bodyRef.current)?.closest(
      '[data-ui-dialog]',
    );
    const dialogs = document.querySelectorAll('[data-ui-dialog]');
    return (
      expected !== null && expected !== undefined && dialogs.item(dialogs.length - 1) === expected
    );
  }, []);
  const submit = (command: Command, consent: typeof execution = null): CommandDispatchResult => {
    const current = store.getState();
    const ownsRecruitDraft = () =>
      command.type !== 'handleCaptive' ||
      command.action !== 'recruit' ||
      (!recruitDraft.revoked &&
        command.executorId === (recruitDraft.executor || null) &&
        (recruitDraft.executor || game?.clans[model.playerClanId]?.leaderId) ===
          recruitDraft.executorOfficerId &&
        recruitDraft.executorOfficerId !== undefined &&
        game?.officers[recruitDraft.executorOfficerId] === recruitDraft.executorOfficer);
    if (
      !ownsModal() ||
      !nativeOwner(consent !== null) ||
      (command.type === 'handleCaptive' &&
        command.action === 'execute' &&
        (consent === null || activeExecution.current !== consent || consent.owner !== owner)) ||
      consumed.current ||
      !ownsRecruitDraft() ||
      current.session.screen !== 'main' ||
      current.session.fatalError ||
      current.session.viewportBlocked ||
      game!.meta.gameOver !== null
    )
      return { ok: false, reason: 'cmd.reject.invalidTarget' };
    const verdict = validateCommand(game!, command);
    if (!verdict.ok)
      return {
        ok: false,
        reason: verdict.reasonKey,
        ...(verdict.params ? { params: verdict.params } : {}),
      };
    const native = (consent === null ? bodyRef.current : confirmationRef.current)?.closest(
      '[data-ui-dialog]',
    );
    const canPublish = () => {
      const session = store.getState().session;
      return (
        ownsModal() &&
        ownsRecruitDraft() &&
        nativeOwner(consent !== null) &&
        (consent === null || activeExecution.current === consent) &&
        (consent === null ? bodyRef.current : confirmationRef.current)?.closest(
          '[data-ui-dialog]',
        ) === native &&
        session.screen === 'main' &&
        !session.fatalError &&
        !session.viewportBlocked &&
        game!.meta.gameOver === null
      );
    };
    consumed.current = true;
    const result = onCommand(command);
    if (!result.ok) {
      if (canPublish()) consumed.current = false;
      return result;
    }
    if (canPublish()) {
      actions.markDecisionQueued(officerId);
      if (canPublish() && modal !== null) actions.closeOwnedModal(modal, { expectedGame: game });
    }
    return result;
  };
  const chance = useGameSelector((game) =>
    captiveRecruitSuccessRate(game, officerId, (executor as OfficerId) || null, model.playerClanId),
  );
  const signingCost = useGameSelector((game) =>
    game.officers[officerId] === undefined
      ? 0
      : officerAbilityScore(game.officers[officerId]) * BAL.recruitSigningBonusPerAbility,
  );
  const executeCommand: Command = {
    type: 'handleCaptive',
    clanId: model.playerClanId,
    officerId,
    action: 'execute',
    executorId: null,
  };
  const executeVerdict = useGameSelector((game) => validateCommand(game, executeCommand));
  const executeReason = executeVerdict.ok
    ? null
    : t(executeVerdict.reasonKey, executeVerdict.params);
  useEffect(() => {
    if (
      (officer?.status !== 'captive' || officer.capturedByClanId !== model.playerClanId) &&
      ownsModal() &&
      (nativeOwner() || nativeOwner(true))
    )
      actions.closeOwnedModal(modal!, { expectedGame: game });
  }, [officer, officerId, model.playerClanId, actions, ownsModal, nativeOwner, modal, game]);
  return (
    <Dialog
      open
      title={t('ui.captive.title')}
      onClose={() => {
        if (ownsModal() && nativeOwner()) actions.closeOwnedModal(modal!, { expectedGame: game });
      }}
      dismissible={false}
    >
      <div ref={bodyRef} className={styles.form} data-testid="captive-modal">
        <h3>{officer?.name ?? t('ui.common.noData')}</h3>
        <CaptiveSummary officerId={officerId} />
        <p>{t('ui.captive.consequences')}</p>
        <label>
          {t('ui.recruit.executor')}
          <select
            value={executor}
            onChange={(event) => {
              if (!ownsModal() || !nativeOwner() || consumed.current) return;
              recruitDraft.revoked = true;
              setExecutor(event.currentTarget.value as OfficerId);
              setExecutorRevision((value) => value + 1);
            }}
          >
            <option value="">{t('ui.captive.leaderExecutor')}</option>
            {model.officers
              .filter(
                (item) =>
                  item.clanId === model.playerClanId &&
                  item.status === 'serving' &&
                  item.locationCastleId === officer?.locationCastleId,
              )
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </label>
        <p>{t('ui.plot.chance', { chance: Math.round(chance * 100) })}</p>
        <p>{t('ui.recruit.signingCost', { value: signingCost })}</p>
        <div className={styles.actions}>
          {(['recruit', 'release'] as const).map((action) => (
            <CommandAction
              key={`${generation.value}:${action}:${action === 'recruit' ? recruitGeneration.value : 0}`}
              command={{
                type: 'handleCaptive',
                clanId: model.playerClanId,
                officerId,
                action,
                executorId: action === 'recruit' ? (executor as OfficerId) || null : null,
              }}
              label={t(`cmd.captive.${action}`)}
              onCommand={submit}
            />
          ))}
          <button
            type="button"
            disabled={!executeVerdict.ok}
            title={executeReason ?? undefined}
            aria-describedby={executeReason === null ? undefined : executeReasonId}
            onClick={() => {
              const current = store.getState();
              if (
                !ownsModal() ||
                !nativeOwner() ||
                consumed.current ||
                current.session.screen !== 'main' ||
                current.session.fatalError ||
                current.session.viewportBlocked ||
                game!.meta.gameOver !== null ||
                !validateCommand(game!, executeCommand).ok
              )
                return;
              const request = { owner };
              activeExecution.current = request;
              setExecution(request);
              setExecuteFeedback(null);
            }}
          >
            {t('cmd.captive.execute')}
          </button>
          {executeReason !== null && <small id={executeReasonId}>{executeReason}</small>}
          {executeFeedback !== null && execution === null && <p role="alert">{executeFeedback}</p>}
        </div>
        <ConfirmDialog
          key={generation.value}
          open={execution !== null && execution.owner === owner}
          title={t('cmd.captive.execute')}
          message={
            <span ref={confirmationRef}>
              {t('ui.captive.executeConfirm', { name: officer?.name ?? '' })}
              {executeFeedback !== null && <span role="alert">{executeFeedback}</span>}
            </span>
          }
          danger
          onCancel={() => {
            if (activeExecution.current !== execution || !ownsModal() || !nativeOwner(true)) return;
            activeExecution.current = null;
            setExecution(null);
          }}
          onConfirm={() => {
            if (
              !execution ||
              activeExecution.current !== execution ||
              !ownsModal() ||
              !nativeOwner(true)
            )
              return;
            const result = submit(executeCommand, execution);
            if (
              activeOwner.current !== owner ||
              activeExecution.current !== execution ||
              !ownsModal() ||
              !nativeOwner(true)
            )
              return;
            if (!result.ok) setExecuteFeedback(t(result.reason, result.params));
            else {
              activeExecution.current = null;
              setExecution(null);
            }
          }}
        />
      </div>
    </Dialog>
  );
}
