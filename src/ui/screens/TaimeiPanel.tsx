import { useId, useLayoutEffect, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { dispatchCommand, hasQueuedTaimeiInvocation } from '@app/bridge';
import { store } from '@app/store';
import { BAL } from '@core/balance';
import { validateInvokeTaimei } from '@core/commands/taimeiCommands';
import { availableTaimei, previewTaimeiFoodGain, TAIMEI_CATALOG, getTaimeiDef } from '@core/index';
import type { ClanId, TaimeiId } from '@core/state/ids';
import type { GameState } from '@core/state/gameState';
import { validateCommand } from '@core/index';
import { t } from '@i18n/zh-TW';
import { Panel, ConfirmDialog, Tooltip } from '../components';
import { makeCachedSelector, useCachedGameSelector } from '../hooks/useGameSelector';
import { uiStore, useUIStore, type ModalInstance, type PanelInstance } from '../hooks/uiStore';
import styles from './TaimeiPanel.module.css';

const selectModel = makeCachedSelector((game) => {
  const clanId = game.meta.playerClanId;
  const clan = game.clans[clanId]!;
  const unlocked = new Set(availableTaimei(clan).map((def) => def.id));
  return {
    clanId,
    prestige: clan.prestige,
    today: game.time.day,
    ...clan.taimei,
    foodGain: previewTaimeiFoodGain(game, clanId),
    rows: TAIMEI_CATALOG.map((def) => ({
      def,
      unlocked: unlocked.has(def.id),
      verdict: validateInvokeTaimei(game, { type: 'invokeTaimei', clanId, taimeiId: def.id }),
    })),
  };
});

const ownerIds = new WeakMap<object, number>();
let nextOwnerId = 0;
let nextRequestId = 0;
function ownerId(owner: object | null): number {
  if (owner === null) return 0;
  let id = ownerIds.get(owner);
  if (id === undefined) {
    id = ++nextOwnerId;
    ownerIds.set(owner, id);
  }
  return id;
}

interface InvocationRequest {
  modal: ModalInstance;
  token: string;
  clanId: ClanId;
  taimeiId: TaimeiId;
  consumed: boolean;
}

/** Every decision is queued through the normal command path; the UI owns no core effects. */
export function TaimeiPanel() {
  const game = useStore(store, (state) => state.game);
  const panel = useUIStore(
    (state) => state.panelStack.find((entry) => entry.id === 'taimei') ?? null,
  );
  return (
    <TaimeiPanelContent key={`${ownerId(game)}:${ownerId(panel)}`} game={game} panel={panel} />
  );
}

function TaimeiPanelContent({
  game,
  panel,
}: {
  game: GameState | null;
  panel: PanelInstance | null;
}) {
  const model = useCachedGameSelector(selectModel);
  const modal = useUIStore((state) => state.modal);
  const actions = useUIStore((state) => state.actions);
  // Dispatch updates this even before a tick, so duplicate pending invocations are visible.
  useStore(store, (state) => state.session.pendingCommandCount);
  const [selectedId, setSelectedId] = useState<TaimeiId>(TAIMEI_CATALOG[0]!.id);
  const [feedback, setFeedback] = useState<string | null>(null);
  const mounted = useRef(false);
  const activeRequest = useRef<InvocationRequest | null>(null);
  const [request, setRequest] = useState<InvocationRequest | null>(null);
  const confirmationBody = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    mounted.current = true;
    const unsubscribe = uiStore.subscribe((current, previous) => {
      const expected = activeRequest.current;
      if (
        expected !== null &&
        previous.modal === expected.modal &&
        current.modal !== expected.modal
      ) {
        expected.consumed = true;
        activeRequest.current = null;
        setRequest(null);
      }
    });
    return () => {
      unsubscribe();
      mounted.current = false;
      activeRequest.current = null;
    };
  }, []);
  const reasonId = useId();
  const selected = model.rows.find((row) => row.def.id === selectedId)!;
  const pending = hasQueuedTaimeiInvocation(model.clanId);
  const reason = pending
    ? t('ui.taimei.queued')
    : selected.verdict.ok
      ? null
      : t(selected.verdict.reasonKey, selected.verdict.params);
  const ownsPanel = () => {
    const current = store.getState();
    const top = uiStore.getState().panelStack.at(-1);
    return (
      mounted.current &&
      game !== null &&
      current.game === game &&
      current.session.screen === 'main' &&
      (panel === null ? top === undefined : top === panel)
    );
  };
  const canInvoke = () => {
    const current = store.getState();
    return (
      ownsPanel() &&
      current.session.fatalError === null &&
      !current.session.viewportBlocked &&
      game!.meta.gameOver === null &&
      game!.meta.playerClanId === model.clanId &&
      uiStore.getState().modal === null &&
      document.querySelector('[data-ui-dialog]') === null
    );
  };
  const ownsConfirmation = (expected: InvocationRequest | null) => {
    const dialogs = document.querySelectorAll('[data-ui-dialog]');
    const native = confirmationBody.current?.closest('[data-ui-dialog]');
    return (
      expected !== null &&
      activeRequest.current === expected &&
      ownsPanel() &&
      uiStore.getState().modal === expected.modal &&
      expected.modal.id === 'confirm' &&
      expected.modal.params.owner === 'taimei' &&
      expected.modal.params.requestId === expected.token &&
      expected.modal.params.clanId === expected.clanId &&
      expected.modal.params.taimeiId === expected.taimeiId &&
      game!.meta.playerClanId === expected.clanId &&
      native !== null &&
      native !== undefined &&
      dialogs.item(dialogs.length - 1) === native
    );
  };
  const confirmation =
    request !== null && activeRequest.current === request && modal === request.modal
      ? getTaimeiDef(request.taimeiId)
      : undefined;
  const closeConfirmation = () => {
    if (!ownsConfirmation(request)) return;
    activeRequest.current = null;
    setRequest(null);
    actions.closeModal();
  };
  function status(row: typeof selected): string {
    if (model.activeTaimeiId === row.def.id)
      return t('ui.taimei.stateActive', { days: Math.max(0, model.activeUntilDay - model.today) });
    if (!row.unlocked) return t('ui.taimei.stateLocked', { need: row.def.unlockPrestige });
    if (model.cooldownUntilDay > model.today)
      return t('ui.taimei.stateCooldown', { days: model.cooldownUntilDay - model.today });
    return t('ui.taimei.stateReady');
  }
  const invoke = (
    <button
      type="button"
      disabled={reason !== null}
      aria-describedby={reason ? reasonId : undefined}
      onClick={() => {
        if (!canInvoke() || hasQueuedTaimeiInvocation(model.clanId)) return;
        const command = {
          type: 'invokeTaimei' as const,
          clanId: model.clanId,
          taimeiId: selected.def.id,
        };
        const verdict = validateCommand(game!, command);
        if (!verdict.ok) {
          setFeedback(t(verdict.reasonKey, verdict.params));
          return;
        }
        const token = String(++nextRequestId);
        const next: InvocationRequest = {
          modal: {
            id: 'confirm',
            params: {
              owner: 'taimei',
              requestId: token,
              taimeiId: selected.def.id,
              clanId: model.clanId,
            },
            pausesTime: true,
          },
          token,
          clanId: model.clanId,
          taimeiId: selected.def.id,
          consumed: false,
        };
        setFeedback(null);
        activeRequest.current = next;
        setRequest(next);
        actions.enqueueModal(next.modal);
      }}
    >
      {t('ui.taimei.invoke')}
    </button>
  );
  return (
    <aside className={styles.anchor} data-testid="taimei-panel">
      <Panel
        title={t('ui.taimei.title')}
        variant="ornate"
        onClose={() => {
          if (
            ownsPanel() &&
            uiStore.getState().modal === null &&
            document.querySelector('[data-ui-dialog]') === null
          )
            actions.closePanelById('taimei');
        }}
      >
        <div className={styles.frame}>
          <p className={styles.prestige}>{t('ui.taimei.prestige', { value: model.prestige })}</p>
          <div className={styles.layout}>
            <div className={styles.grid}>
              {model.rows.map((row) => (
                <button
                  type="button"
                  key={row.def.id}
                  className={styles.card}
                  aria-pressed={selectedId === row.def.id}
                  onClick={() => setSelectedId(row.def.id)}
                >
                  <strong>{row.def.name}</strong>
                  <span>{t('ui.taimei.cost', { cost: row.def.prestigeCost })}</span>
                  <span>
                    {row.def.durationDays === 0
                      ? t('ui.taimei.instant')
                      : t('ui.taimei.duration', { days: row.def.durationDays })}
                  </span>
                  <span>{row.def.description}</span>
                  <span
                    className={model.activeTaimeiId === row.def.id ? styles.active : styles.status}
                  >
                    {status(row)}
                  </span>
                </button>
              ))}
            </div>
            <section className={styles.detail} aria-label={t('ui.taimei.detail')}>
              <h2>{selected.def.name}</h2>
              <p>{selected.def.description}</p>
              <p>{t('ui.taimei.cost', { cost: selected.def.prestigeCost })}</p>
              <p>
                {selected.def.durationDays === 0
                  ? t('ui.taimei.instant')
                  : t('ui.taimei.duration', { days: selected.def.durationDays })}
              </p>
              {selected.def.goldCost > 0 && (
                <p>{t('ui.taimei.goldCost', { cost: selected.def.goldCost })}</p>
              )}
              <p>{status(selected)}</p>
              {selected.def.id === 'taimei.kenkin-meneki' &&
                model.foodGain < BAL.taimeiKenkinGold * BAL.taimeiKenkinFoodPerGold && (
                  <p className={styles.warning}>
                    {t('ui.taimei.kenkinOverflow', { food: model.foodGain })}
                  </p>
                )}
              <Tooltip content={reason ?? ''} disabled={reason === null}>
                <span tabIndex={reason ? 0 : undefined}>{invoke}</span>
              </Tooltip>
              {reason && (
                <p id={reasonId} className={styles.warning}>
                  {reason}
                </p>
              )}
              {feedback && confirmation === undefined && <p role="alert">{feedback}</p>}
            </section>
          </div>
        </div>
      </Panel>
      <ConfirmDialog
        open={confirmation !== undefined}
        title={t('ui.taimei.invoke')}
        message={
          <>
            <span ref={confirmationBody}>
              {confirmation
                ? t('ui.taimei.confirm', {
                    cost: confirmation.prestigeCost,
                    name: confirmation.name,
                  })
                : ''}
            </span>
            {feedback && <p role="alert">{feedback}</p>}
          </>
        }
        onCancel={closeConfirmation}
        onConfirm={() => {
          if (!confirmation || request === null || request.consumed || !ownsConfirmation(request))
            return;
          const current = store.getState();
          if (
            current.session.fatalError !== null ||
            current.session.viewportBlocked ||
            game!.meta.gameOver !== null ||
            hasQueuedTaimeiInvocation(model.clanId)
          )
            return;
          const command = {
            type: 'invokeTaimei' as const,
            clanId: request.clanId,
            taimeiId: request.taimeiId,
          };
          const verdict = validateCommand(game!, command);
          if (!verdict.ok) {
            setFeedback(t(verdict.reasonKey, verdict.params));
            return;
          }
          request.consumed = true;
          const result = dispatchCommand(command);
          if (!ownsConfirmation(request)) return;
          const after = store.getState();
          if (
            after.session.fatalError !== null ||
            after.session.viewportBlocked ||
            game!.meta.gameOver !== null
          )
            return;
          setFeedback(result.ok ? null : t(result.reason, result.params));
          if (!result.ok) request.consumed = false;
          if (result.ok && ownsConfirmation(request)) closeConfirmation();
        }}
      />
    </aside>
  );
}
