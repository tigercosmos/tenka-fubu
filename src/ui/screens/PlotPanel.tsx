import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { dispatchCommand } from '@app/bridge';
import { store } from '@app/store';
import { BAL } from '@core/balance';
import { getPlotSuccessRate, plotMonthlyProgress, validateCommand } from '@core/index';
import type { Clan, GameState, Plot } from '@core/state/gameState';
import { traitModifier } from '@core/traits';
import type { ClanId, OfficerId, CastleId } from '@core/state/ids';
import type { PlotKind } from '@core/state/enums';
import type { CmdStartPlot, Command } from '@core/commands/types';
import { t } from '@i18n/zh-TW';
import { CommandAction } from '../components/CommandAction';
import { useM6View } from '../hooks/useM6View';
import { useGameSelector } from '../hooks/useGameSelector';
import { uiStore, useUIStore, type ModalInstance, type PanelInstance } from '../hooks/uiStore';
import { ConfirmDialog } from '../components';
import { M6Panel } from './M6Panel';
import styles from './M6Panel.module.css';
import presentation from './PlotPanel.module.css';

type Scope = (native?: Element, modal?: ModalInstance, closing?: boolean) => boolean;
const identities = new WeakMap<object, number>();
let nextIdentity = 0;
let nextRequest = 0;
function identity(value: object | null): number {
  if (value === null) return 0;
  let id = identities.get(value);
  if (id === undefined) {
    id = ++nextIdentity;
    identities.set(value, id);
  }
  return id;
}
function plotSubject(plot: Plot): string {
  const { progress: _progress, ...subject } = plot;
  void _progress;
  return JSON.stringify(subject);
}

function PlotCommandAction({
  command,
  label,
  scope,
  afterSubmit,
  claim,
}: {
  command: Command;
  label: string;
  scope: Scope;
  afterSubmit?: () => void;
  claim?: () => boolean;
}) {
  const game = useStore(store, (state) => state.game);
  const serialized = JSON.stringify(command);
  const owner = useMemo(() => ({ serialized, submitting: false }), [serialized]);
  const active = useRef<object | null>(null);
  useLayoutEffect(() => {
    active.current = owner;
    return () => {
      if (active.current === owner) active.current = null;
    };
  }, [owner]);
  const subjects =
    game === null
      ? []
      : command.type === 'startPlot'
        ? [
            game.clans[command.clanId],
            game.clans[command.targetClanId],
            game.officers[command.executorId],
            command.targetOfficerId === null ? null : game.officers[command.targetOfficerId],
            command.targetCastleId === null ? null : game.castles[command.targetCastleId],
          ]
        : command.type === 'useBetrayal'
          ? [
              game.sieges[command.siegeId],
              game.sieges[command.siegeId] === undefined
                ? undefined
                : game.castles[game.sieges[command.siegeId]!.castleId],
            ]
          : [];
  const owns = () => {
    if (active.current !== owner || game === null || store.getState().game !== game || !scope())
      return false;
    const fresh =
      command.type === 'startPlot'
        ? [
            game.clans[command.clanId],
            game.clans[command.targetClanId],
            game.officers[command.executorId],
            command.targetOfficerId === null ? null : game.officers[command.targetOfficerId],
            command.targetCastleId === null ? null : game.castles[command.targetCastleId],
          ]
        : command.type === 'useBetrayal'
          ? [
              game.sieges[command.siegeId],
              game.sieges[command.siegeId] === undefined
                ? undefined
                : game.castles[game.sieges[command.siegeId]!.castleId],
            ]
          : [];
    return subjects.every((subject, index) => subject === fresh[index]);
  };
  return (
    <CommandAction
      command={command}
      label={label}
      onCommand={(current) => {
        if (!owns() || game === null || owner.submitting)
          return { ok: false, reason: 'cmd.reject.invalidTarget' };
        const verdict = validateCommand(game, current);
        if (!verdict.ok)
          return {
            ok: false,
            reason: verdict.reasonKey,
            ...(verdict.params ? { params: verdict.params } : {}),
          };
        if (claim !== undefined && !claim())
          return { ok: false, reason: 'cmd.reject.invalidTarget' };
        owner.submitting = true;
        const result = dispatchCommand(current);
        if (!result.ok && owns()) owner.submitting = false;
        if (result.ok && owns()) afterSubmit?.();
        return result;
      }}
    />
  );
}

interface PlotConsent {
  game: GameState;
  actor: Clan;
  plot: Plot;
  subject: string;
  modal: ModalInstance;
  modalKey: string;
  consumed: boolean;
}
function PlotCancelAction({
  plotId,
  clanId,
  scope,
}: {
  plotId: Plot['id'];
  clanId: ClanId;
  scope: Scope;
}) {
  const game = useStore(store, (state) => state.game);
  const modal = useUIStore((state) => state.modal);
  const mounted = useRef(false);
  const active = useRef<PlotConsent | null>(null);
  const [request, setRequest] = useState<PlotConsent | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const body = useRef<HTMLSpanElement>(null);
  const reasonId = useId();
  const plot = game?.diplomacy.plots.find((item) => item.id === plotId);
  const subject = plot === undefined ? null : plotSubject(plot);
  useLayoutEffect(() => {
    mounted.current = true;
    const unsubscribe = uiStore.subscribe((current, previous) => {
      const expected = active.current;
      if (
        expected !== null &&
        (previous.modal === expected.modal || previous.modalQueue.includes(expected.modal)) &&
        current.modal !== expected.modal &&
        !current.modalQueue.includes(expected.modal)
      ) {
        expected.consumed = true;
        active.current = null;
        setRequest(null);
      }
    });
    return () => {
      unsubscribe();
      mounted.current = false;
      const expected = active.current;
      active.current = null;
      if (expected !== null) {
        expected.consumed = true;
        uiStore.getState().actions.closeOwnedModal(expected.modal, {
          resume: false,
          expectedGame: expected.game,
        });
      }
    };
  }, [game, plot, subject]);
  const command = { type: 'cancelPlot' as const, clanId, plotId };
  const verdict = useGameSelector((state) => validateCommand(state, command));
  const reason = verdict.ok ? null : t(verdict.reasonKey, verdict.params);
  const native = () => body.current?.closest('[data-ui-dialog]') ?? undefined;
  const owns = (expected: PlotConsent) =>
    mounted.current &&
    active.current === expected &&
    store.getState().game === expected.game &&
    uiStore.getState().modal === expected.modal &&
    JSON.stringify(expected.modal) === expected.modalKey;
  const ownsSubject = (expected: PlotConsent) =>
    expected.game.meta.playerClanId === clanId &&
    expected.game.clans[clanId] === expected.actor &&
    expected.game.diplomacy.plots.find((item) => item.id === plotId) === expected.plot &&
    expected.plot.ownerClanId === clanId &&
    plotSubject(expected.plot) === expected.subject;
  const close = (expected: PlotConsent) => {
    expected.consumed = true;
    active.current = null;
    setRequest(null);
    uiStore.getState().actions.closeOwnedModal(expected.modal, { expectedGame: expected.game });
  };
  const open = request !== null && active.current === request && modal === request.modal;
  return (
    <div>
      <button
        type="button"
        disabled={!verdict.ok}
        title={reason ?? undefined}
        aria-describedby={reason === null ? undefined : reasonId}
        onClick={() => {
          if (
            !mounted.current ||
            game === null ||
            store.getState().game !== game ||
            !scope() ||
            plot === undefined ||
            game.diplomacy.plots.find((item) => item.id === plotId) !== plot ||
            plotSubject(plot) !== subject ||
            game.meta.playerClanId !== clanId
          )
            return;
          const fresh = validateCommand(game, command);
          if (!fresh.ok) {
            setFeedback(t(fresh.reasonKey, fresh.params));
            return;
          }
          const actor = game.clans[clanId];
          if (actor === undefined) return;
          const descriptor: ModalInstance = {
            id: 'confirm',
            params: { owner: 'cancelPlot', requestId: String(++nextRequest), plotId, clanId },
            pausesTime: false,
          };
          const next: PlotConsent = {
            game,
            actor,
            plot,
            subject: plotSubject(plot),
            consumed: false,
            modal: descriptor,
            modalKey: JSON.stringify(descriptor),
          };
          active.current = next;
          setRequest(next);
          setFeedback(null);
          uiStore.getState().actions.enqueueModal(next.modal);
        }}
      >
        {t('cmd.plot.cancel')}
      </button>
      {reason !== null && <small id={reasonId}>{reason}</small>}
      {feedback !== null && !open && <p role="alert">{feedback}</p>}
      <ConfirmDialog
        open={open}
        title={t('cmd.plot.cancel')}
        message={
          <>
            <span ref={body}>{t('ui.plot.cancelConfirm')}</span>
            {feedback !== null && <p role="alert">{feedback}</p>}
          </>
        }
        onCancel={() => {
          const dialog = native();
          if (
            request !== null &&
            owns(request) &&
            dialog !== undefined &&
            scope(dialog, request.modal, true)
          )
            close(request);
        }}
        onConfirm={() => {
          const expected = request,
            dialog = native();
          if (
            expected === null ||
            expected.consumed ||
            !owns(expected) ||
            !ownsSubject(expected) ||
            dialog === undefined ||
            !scope(dialog, expected.modal)
          )
            return;
          const fresh = validateCommand(expected.game, command);
          if (!fresh.ok) {
            setFeedback(t(fresh.reasonKey, fresh.params));
            return;
          }
          expected.consumed = true;
          const result = dispatchCommand(command);
          if (
            !owns(expected) ||
            !ownsSubject(expected) ||
            native() !== dialog ||
            !scope(dialog, expected.modal)
          )
            return;
          setFeedback(result.ok ? null : t(result.reason, result.params));
          if (result.ok) close(expected);
          else expected.consumed = false;
        }}
      />
    </div>
  );
}

function ActivePlot({
  plot,
  playerClanId,
  targetName,
  scope,
}: {
  plot: Plot;
  playerClanId: ClanId;
  targetName: (id: string | null) => string;
  scope: Scope;
}) {
  const [chance, monthlyProgress] = useGameSelector(
    (game) => [getPlotSuccessRate(game, plot), plotMonthlyProgress(game, plot)] as const,
  );
  return (
    <article className={`${styles.card} ${presentation.dossier}`}>
      <h4>
        {t(`term.plot.${plot.kind}`)} · {targetName(plot.targetCastleId ?? plot.targetOfficerId)}
      </h4>
      <p>
        {targetName(plot.officerId)} · {Math.floor(plot.progress)}%
      </p>
      <progress value={plot.progress} max={100} aria-label={t('ui.plot.progress')} />
      <p>
        {t('ui.plot.chance', { chance: Math.round(chance * 100) })}
        {monthlyProgress > 0 && (
          <>
            {' '}
            ·{' '}
            {t('ui.diplomacy.remaining', {
              months: Math.ceil((BAL.plotProgressMax - plot.progress) / monthlyProgress),
            })}
          </>
        )}
      </p>
      <PlotCancelAction plotId={plot.id} clanId={playerClanId} scope={scope} />
    </article>
  );
}

export function PlotPanel() {
  const game = useStore(store, (state) => state.game);
  const panel = useUIStore(
    (state) => [...state.panelStack].reverse().find((entry) => entry.id === 'plot') ?? null,
  );
  const params = JSON.stringify(panel?.params ?? {});
  return (
    <PlotContent
      key={`${identity(game)}:${identity(panel)}:${params}`}
      game={game}
      panel={panel}
      paramsKey={params}
    />
  );
}

function PlotContent({
  game,
  panel,
  paramsKey,
}: {
  game: GameState | null;
  panel: PanelInstance | null;
  paramsKey: string;
}) {
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const actor = game?.clans[game.meta.playerClanId];
  const scope: Scope = (native, modal, closing = false) => {
    const current = store.getState(),
      ui = uiStore.getState(),
      top = ui.panelStack.at(-1);
    const dialogs = document.querySelectorAll('[data-ui-dialog]');
    return (
      mounted.current &&
      game !== null &&
      current.game === game &&
      current.session.screen === 'main' &&
      (panel === null ? top === undefined : top === panel) &&
      JSON.stringify(panel?.params ?? {}) === paramsKey &&
      ui.modal === (modal ?? null) &&
      (native === undefined
        ? dialogs.length === 0
        : native.isConnected && dialogs.item(dialogs.length - 1) === native) &&
      (closing ||
        (current.session.fatalError === null &&
          !current.session.viewportBlocked &&
          game.meta.gameOver === null &&
          game.clans[game.meta.playerClanId] === actor))
    );
  };
  const model = useM6View();
  const params = panel?.params;
  const actions = useUIStore((state) => state.actions);
  const [kind, setKind] = useState<PlotKind>((params?.kind as PlotKind) ?? 'poach');
  const [clanId, setClanId] = useState<ClanId | ''>((params?.targetClanId as ClanId) ?? '');
  const [targetId, setTargetId] = useState(params?.targetId ?? '');
  const [rumorCastle, setRumorCastle] = useState(false);
  const [executorId, setExecutorId] = useState<OfficerId | ''>('');
  const [gold, setGold] = useState(params?.kind === 'betrayal' ? BAL.plotBetrayalMinInvestGold : 0);
  const generation = useRef(0);
  const consumedGeneration = useRef<number | null>(null);
  const [revision, setRevision] = useState(0);
  const edit = (change: () => void) => {
    if (!scope() || generation.current !== revision) return;
    generation.current += 1;
    setRevision(generation.current);
    change();
  };
  const draftScope: Scope = (native, modal, closing) =>
    generation.current === revision && scope(native, modal, closing);
  const castleMode = kind === 'betrayal' || (kind === 'rumor' && rumorCastle);
  const command: CmdStartPlot = {
    type: 'startPlot',
    clanId: model.playerClanId,
    kind,
    executorId: executorId as OfficerId,
    targetClanId: clanId as ClanId,
    targetOfficerId: castleMode ? null : (targetId as OfficerId) || null,
    targetCastleId: castleMode ? (targetId as CastleId) || null : null,
    investGold: gold,
  };
  const chance = useGameSelector((game) => getPlotSuccessRate(game, command));
  const monthlyCost = useGameSelector((game) =>
    Math.round(
      BAL.plotMonthlyCost *
        (kind === 'betrayal' ? BAL.plotBetrayalCostMult : 1) *
        (game.officers[executorId as OfficerId]
          ? traitModifier(game.officers[executorId as OfficerId]!, 'plot.costMult').mult
          : 1),
    ),
  );
  const plots = model.plots.filter((plot) => plot.ownerClanId === model.playerClanId);
  const targetName = (id: string | null) =>
    model.officers.find((officer) => officer.id === id)?.name ??
    model.castles.find((castle) => castle.id === id)?.name ??
    t('ui.common.noData');
  return (
    <div className={presentation.screen}>
      <M6Panel
        title={t('ui.plot.title')}
        testId="plot-panel"
        onClose={() => {
          if (scope(undefined, undefined, true)) actions.closePanelById('plot');
        }}
      >
        <div className={presentation.frame}>
          <h3>{t('ui.plot.active', { count: plots.length })}</h3>
          <div className={`${styles.list} ${presentation.operations}`}>
            {plots.map((plot) => (
              <ActivePlot
                key={plot.id}
                plot={plot}
                playerClanId={model.playerClanId}
                targetName={targetName}
                scope={scope}
              />
            ))}
          </div>
          {model.castles
            .filter(
              (castle) =>
                castle.betrayalReadyClanId === model.playerClanId &&
                castle.betrayalReadyUntilDay >= model.day,
            )
            .map((castle) => (
              <article className={`${styles.card} ${presentation.dossier}`} key={castle.id}>
                <h4>
                  {castle.name} · {t('ui.plot.ready')}
                </h4>
                <p>{t('ui.plot.markerUntil', { day: castle.betrayalReadyUntilDay })}</p>
                {model.sieges
                  .filter((siege) => siege.castleId === castle.id)
                  .map((siege) => (
                    <PlotCommandAction
                      key={siege.id}
                      scope={scope}
                      command={{
                        type: 'useBetrayal',
                        clanId: model.playerClanId,
                        siegeId: siege.id,
                      }}
                      label={t('cmd.plot.activate')}
                    />
                  ))}
              </article>
            ))}
          <h3>{t('ui.plot.new')}</h3>
          <div className={`${styles.form} ${presentation.form}`}>
            <fieldset className={presentation.strategy}>
              <legend>{t('ui.plot.kind')}</legend>
              {(['poach', 'rumor', 'betrayal'] as const).map((value) => (
                <label key={value} className={presentation.strategyOption}>
                  <input
                    type="radio"
                    name="plot-kind"
                    value={value}
                    checked={kind === value}
                    onChange={() => {
                      edit(() => {
                        setKind(value);
                        setTargetId('');
                        setGold(value === 'betrayal' ? BAL.plotBetrayalMinInvestGold : 0);
                      });
                    }}
                  />
                  {t(`term.plot.${value}`)}
                </label>
              ))}
            </fieldset>
            <label>
              {t('ui.plot.targetClan')}
              <select
                value={clanId}
                onChange={(event) => {
                  const value = event.currentTarget.value as ClanId;
                  edit(() => {
                    setClanId(value);
                    setTargetId('');
                  });
                }}
              >
                <option value="">{t('ui.common.select')}</option>
                {model.clans
                  .filter((clan) => clan.id !== model.playerClanId)
                  .map((clan) => (
                    <option key={clan.id} value={clan.id}>
                      {clan.name}
                    </option>
                  ))}
              </select>
            </label>
            {kind === 'rumor' && (
              <label className={presentation.castleMode}>
                <input
                  type="checkbox"
                  checked={rumorCastle}
                  onChange={(event) => {
                    const checked = event.currentTarget.checked;
                    edit(() => {
                      setRumorCastle(checked);
                      setTargetId('');
                    });
                  }}
                />
                {t('ui.plot.castleMode')}
              </label>
            )}
            <label>
              {t('ui.plot.target')}
              <select
                value={targetId}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  edit(() => setTargetId(value));
                }}
              >
                <option value="">{t('ui.common.select')}</option>
                {(castleMode
                  ? model.castles.filter((castle) => castle.ownerClanId === clanId)
                  : model.officers.filter(
                      (officer) => officer.clanId === clanId && officer.status === 'serving',
                    )
                ).map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('ui.plot.executor')}
              <select
                value={executorId}
                onChange={(event) => {
                  const value = event.currentTarget.value as OfficerId;
                  edit(() => setExecutorId(value));
                }}
              >
                <option value="">{t('ui.common.select')}</option>
                {model.officers
                  .filter(
                    (officer) =>
                      officer.clanId === model.playerClanId && officer.status === 'serving',
                  )
                  .map((officer) => (
                    <option key={officer.id} value={officer.id}>
                      {officer.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {t('ui.plot.investGold')}
              {kind === 'rumor' ? (
                <input type="number" value={0} readOnly />
              ) : (
                <select
                  value={gold}
                  onChange={(event) => {
                    const value = Number(event.currentTarget.value);
                    edit(() => setGold(value));
                  }}
                >
                  {(kind === 'betrayal'
                    ? BAL.plotBetrayalInvestGoldOptions
                    : BAL.plotPoachInvestGoldOptions
                  ).map((amount) => (
                    <option key={amount} value={amount}>
                      {amount}
                    </option>
                  ))}
                </select>
              )}
            </label>
            <p className={presentation.estimate}>
              {t('ui.diplomacy.monthlyCost', {
                gold: monthlyCost,
              })}{' '}
              · {t('ui.plot.chance', { chance: Math.round(chance * 100) })}
            </p>
            <PlotCommandAction
              key={revision}
              command={command}
              label={t('cmd.plot.start')}
              scope={draftScope}
              claim={() => {
                if (generation.current !== revision || consumedGeneration.current === revision)
                  return false;
                consumedGeneration.current = revision;
                return true;
              }}
              afterSubmit={() => {
                if (!draftScope()) return;
                generation.current += 1;
                setRevision(generation.current);
                setTargetId('');
                setGold(0);
              }}
            />
            <button
              type="button"
              onClick={() => {
                edit(() => {
                  setTargetId('');
                  setExecutorId('');
                  setGold(kind === 'betrayal' ? BAL.plotBetrayalMinInvestGold : 0);
                });
              }}
            >
              {t('ui.common.cancel')}
            </button>
          </div>
        </div>
      </M6Panel>
    </div>
  );
}
