import {
  createContext,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useStore } from 'zustand';
import { dispatchCommand, getQueuedPlayerCommands } from '@app/bridge';
import { store } from '@app/store';
import { BAL } from '@core/balance';
import {
  evaluateProposal,
  getTrust,
  getSentiment,
  monthlyDiplomacyWorkCost,
  pactTrustCost,
  validateCommand,
} from '@core/index';
import type { DiplomacyActionKind, DiploMission, GameState, Pact } from '@core/state/gameState';
import type { Command } from '@core/commands/types';
import type { ClanId, OfficerId } from '@core/state/ids';
import { formatNumber, t } from '@i18n/zh-TW';
import { ConfirmDialog, TabView } from '../components';
import { CommandAction } from '../components/CommandAction';
import { useM6View } from '../hooks/useM6View';
import { useGameSelector } from '../hooks/useGameSelector';
import { uiStore, useUIStore, type ModalInstance } from '../hooks/uiStore';
import { M6Panel } from './M6Panel';
import { CourtPage } from './CourtPage';
import { PactIndicators } from '../diplomacy/PactIndicators';
import styles from './M6Panel.module.css';
import presentation from './DiplomacyPanel.module.css';
import actionStyles from '../components/CommandAction.module.css';

type Scope = (native?: Element, modal?: ModalInstance, closing?: boolean) => boolean;
const ScopeContext = createContext<Scope | null>(null);
const ownerIds = new WeakMap<object, number>();
let nextOwnerId = 0;
let nextRequestId = 0;
function ownerId(owner: object | null | undefined): number {
  if (owner == null) return 0;
  let id = ownerIds.get(owner);
  if (id === undefined) {
    id = ++nextOwnerId;
    ownerIds.set(owner, id);
  }
  return id;
}

function ScopedCommandAction(props: { command: Command; label: string }) {
  const scope = useContext(ScopeContext);
  const serialized = JSON.stringify(props.command);
  const owner = useMemo(() => ({ serialized }), [serialized]);
  const active = useRef<object | null>(null);
  useLayoutEffect(() => {
    active.current = owner;
    return () => {
      if (active.current === owner) active.current = null;
    };
  }, [owner]);
  return (
    <CommandAction
      {...props}
      onCommand={(command) => {
        if (active.current !== owner || (scope !== null && !scope()))
          return { ok: false, reason: 'cmd.reject.invalidTarget' };
        const game = store.getState().game;
        if (game === null) return { ok: false, reason: 'cmd.reject.invalidTarget' };
        const verdict = validateCommand(game, command);
        if (!verdict.ok)
          return {
            ok: false,
            reason: verdict.reasonKey,
            ...(verdict.params ? { params: verdict.params } : {}),
          };
        return dispatchCommand(command);
      }}
    />
  );
}

interface PactConsent {
  game: GameState;
  modal: ModalInstance;
  consumed: boolean;
}

function PactBreakAction({ targetId, pact }: { targetId: ClanId; pact: Pact }) {
  const game = useStore(store, (state) => state.game);
  const modal = useUIStore((state) => state.modal);
  const scope = useContext(ScopeContext);
  const row =
    game === null
      ? undefined
      : Object.values(game.diplomacy.rows).find(
          (entry) =>
            (entry.a === game.meta.playerClanId && entry.b === targetId) ||
            (entry.b === game.meta.playerClanId && entry.a === targetId),
        );
  const actual = row?.pacts.find((entry) => entry.kind === pact.kind);
  const clanId = game?.meta.playerClanId;
  const target = game?.clans[targetId];
  const startDay = actual?.startDay;
  const endDay = actual?.endDay;
  const vassalClanId = actual?.vassalClanId;
  const owner = useMemo(
    () => ({
      game,
      row,
      actual,
      clanId,
      target,
      kind: pact.kind,
      startDay,
      endDay,
      vassalClanId,
    }),
    [game, row, actual, clanId, target, pact.kind, startDay, endDay, vassalClanId],
  );
  const activeOwner = useRef<object | null>(null);
  const activeRequest = useRef<PactConsent | null>(null);
  const [request, setRequest] = useState<PactConsent | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const body = useRef<HTMLSpanElement>(null);
  const reasonId = useId();
  useLayoutEffect(() => {
    activeOwner.current = owner;
    setFeedback(null);
    setRequest(null);
    const unsubscribe = uiStore.subscribe((current, previous) => {
      const expected = activeRequest.current;
      if (
        expected !== null &&
        (previous.modal === expected.modal || previous.modalQueue.includes(expected.modal)) &&
        current.modal !== expected.modal &&
        !current.modalQueue.includes(expected.modal)
      ) {
        expected.consumed = true;
        activeRequest.current = null;
        setRequest(null);
      }
    });
    return () => {
      unsubscribe();
      if (activeOwner.current === owner) activeOwner.current = null;
      const expected = activeRequest.current;
      activeRequest.current = null;
      if (expected !== null) {
        expected.consumed = true;
        uiStore
          .getState()
          .actions.closeOwnedModal(expected.modal, { resume: false, expectedGame: expected.game });
      }
    };
  }, [owner]);
  const ownsSubject = () => {
    const current = store.getState().game;
    return (
      activeOwner.current === owner &&
      game !== null &&
      current === game &&
      clanId !== undefined &&
      game.meta.playerClanId === clanId &&
      actual !== undefined &&
      row !== undefined &&
      game.diplomacy.rows[row.key] === row &&
      row.pacts.includes(actual) &&
      actual.kind === owner.kind &&
      actual.startDay === owner.startDay &&
      actual.endDay === owner.endDay &&
      actual.vassalClanId === owner.vassalClanId &&
      game.clans[targetId] === target &&
      target?.alive === true
    );
  };
  const native = () => body.current?.closest('[data-ui-dialog]') ?? undefined;
  const ownsRequest = (expected: PactConsent | null) =>
    expected !== null &&
    activeRequest.current === expected &&
    activeOwner.current === owner &&
    store.getState().game === expected.game &&
    uiStore.getState().modal === expected.modal;
  const closeRequest = (expected: PactConsent) => {
    expected.consumed = true;
    activeRequest.current = null;
    setRequest(null);
    uiStore.getState().actions.closeOwnedModal(expected.modal, { expectedGame: expected.game });
  };
  const command =
    clanId === undefined
      ? null
      : { type: 'breakPact' as const, clanId, targetClanId: targetId, kind: pact.kind };
  const verdict = useGameSelector((state) =>
    command === null
      ? { ok: false as const, reasonKey: 'cmd.reject.invalidTarget' }
      : validateCommand(state, command),
  );
  const reason = verdict.ok
    ? null
    : t(verdict.reasonKey, 'params' in verdict ? verdict.params : undefined);
  const open = request !== null && activeRequest.current === request && modal === request.modal;
  return (
    <div className={actionStyles.action}>
      <button
        type="button"
        disabled={!verdict.ok}
        title={reason ?? undefined}
        aria-describedby={reason === null ? undefined : reasonId}
        onClick={() => {
          if (!ownsSubject() || scope === null || !scope() || command === null || game === null)
            return;
          const fresh = validateCommand(game, command);
          if (!fresh.ok) {
            setFeedback(t(fresh.reasonKey, fresh.params));
            return;
          }
          const next: PactConsent = {
            game,
            consumed: false,
            modal: {
              id: 'confirm',
              params: {
                owner: 'breakPact',
                requestId: String(++nextRequestId),
                targetClanId: targetId,
                kind: pact.kind,
              },
              pausesTime: false,
            },
          };
          activeRequest.current = next;
          setRequest(next);
          setFeedback(null);
          uiStore.getState().actions.enqueueModal(next.modal);
        }}
      >
        {t('cmd.diplomacy.breakPact')}
      </button>
      {reason !== null && <small id={reasonId}>{reason}</small>}
      {feedback !== null && !open && <p role="alert">{feedback}</p>}
      <ConfirmDialog
        open={open}
        title={t('cmd.diplomacy.breakPact')}
        danger
        message={
          <>
            <span ref={body}>
              {t('cmd.diplomacy.breakPactConfirm', {
                clan: target?.name ?? targetId,
                pact: t(`term.pact.${pact.kind}`),
              })}
            </span>
            {feedback !== null && <p role="alert">{feedback}</p>}
          </>
        }
        onCancel={() => {
          const dialog = native();
          if (
            request !== null &&
            ownsRequest(request) &&
            dialog !== undefined &&
            scope?.(dialog, request.modal, true)
          )
            closeRequest(request);
        }}
        onConfirm={() => {
          const expected = request,
            dialog = native();
          if (
            expected === null ||
            expected.consumed ||
            !ownsRequest(expected) ||
            !ownsSubject() ||
            dialog === undefined ||
            scope === null ||
            !scope(dialog, expected.modal) ||
            command === null ||
            game === null
          )
            return;
          const fresh = validateCommand(game, command);
          if (!fresh.ok) {
            setFeedback(t(fresh.reasonKey, fresh.params));
            return;
          }
          expected.consumed = true;
          const result = dispatchCommand(command);
          if (
            !ownsRequest(expected) ||
            !ownsSubject() ||
            native() !== dialog ||
            !scope(dialog, expected.modal)
          )
            return;
          setFeedback(result.ok ? null : t(result.reason, result.params));
          closeRequest(expected);
        }}
      />
    </div>
  );
}

const kinds: DiplomacyActionKind[] = [
  'proposeAlliance',
  'proposeMarriage',
  'proposeCeasefire',
  'demandVassal',
  'offerVassal',
  'requestReinforce',
];

function DiploWorkAction({
  command,
  label,
  scope,
  subject,
}: {
  command: Command;
  label: string;
  scope: () => boolean;
  subject: () => boolean;
}) {
  const [lease, setLease] = useState(0);
  const renewLease = useCallback(() => setLease((current) => current + 1), []);
  return (
    <DiploWorkActionLease
      key={lease}
      command={command}
      label={label}
      scope={scope}
      subject={subject}
      onSettled={renewLease}
    />
  );
}

function DiploWorkActionLease({
  command,
  label,
  scope,
  subject,
  onSettled,
}: {
  command: Command;
  label: string;
  scope: () => boolean;
  subject: () => boolean;
  onSettled: () => void;
}) {
  const reasonId = useId();
  const [feedback, setFeedback] = useState<string | null>(null);
  const mounted = useRef(false);
  const revoked = useRef(false);
  const submitted = useRef(false);
  const queued = useRef<{ game: GameState; day: number; serialized: string } | null>(null);
  const originalSubject = useRef(subject).current;
  useLayoutEffect(() => {
    mounted.current = true;
    const unsubscribe = store.subscribe((current) => {
      if (!originalSubject()) {
        revoked.current = true;
        return;
      }
      const expected = queued.current;
      if (
        expected !== null &&
        current.game === expected.game &&
        current.game.time.day > expected.day &&
        !getQueuedPlayerCommands(expected.game).some(
          (entry) => JSON.stringify(entry) === expected.serialized,
        )
      ) {
        queued.current = null;
        revoked.current = true;
        onSettled();
      }
    });
    return () => {
      unsubscribe();
      mounted.current = false;
      revoked.current = true;
    };
  }, [originalSubject, onSettled]);
  const [valid, reason] = useGameSelector((game) => {
    const verdict = validateCommand(game, command);
    return [verdict.ok, verdict.ok ? null : t(verdict.reasonKey, verdict.params)] as const;
  });
  const owns = () => mounted.current && !revoked.current && originalSubject() && scope();
  return (
    <div className={actionStyles.action}>
      <button
        type="button"
        disabled={!valid}
        title={reason ?? undefined}
        aria-describedby={reason === null ? undefined : reasonId}
        onClick={() => {
          if (submitted.current || !owns()) return;
          const game = store.getState().game;
          if (game === null) return;
          const verdict = validateCommand(game, command);
          if (!verdict.ok) {
            setFeedback(t(verdict.reasonKey, verdict.params));
            return;
          }
          submitted.current = true;
          queued.current = { game, day: game.time.day, serialized: JSON.stringify(command) };
          const result = dispatchCommand(command);
          if (!owns()) return;
          if (!result.ok) {
            submitted.current = false;
            queued.current = null;
          }
          setFeedback(result.ok ? null : t(result.reason, result.params));
        }}
      >
        {label}
      </button>
      {reason !== null && <small id={reasonId}>{reason}</small>}
      {feedback !== null && <p role="alert">{feedback}</p>}
    </div>
  );
}

export function DiploWork({ target, scope }: { target: DiploMission['target']; scope?: Scope }) {
  const game = useStore(store, (state) => state.game);
  const panel = useUIStore(
    (state) => state.panelStack.find((entry) => entry.id === 'diplomacy') ?? null,
  );
  return (
    <DiploWorkContent
      key={`${ownerId(game)}:${ownerId(panel)}:${target}`}
      target={target}
      parentScope={scope}
      game={game}
      panel={panel}
    />
  );
}

function DiploWorkContent({
  target,
  parentScope,
  game,
  panel,
}: {
  target: DiploMission['target'];
  parentScope: Scope | undefined;
  game: GameState | null;
  panel: ReturnType<typeof uiStore.getState>['panelStack'][number] | null;
}) {
  const inheritedScope = useContext(ScopeContext);
  const mounted = useRef(false);
  const revoked = useRef(false);
  const playerClanId = game?.meta.playerClanId;
  const generation = useRef(0);
  const [renderedGeneration, setRenderedGeneration] = useState(0);
  const actor = playerClanId === undefined ? undefined : game?.clans[playerClanId];
  useLayoutEffect(() => {
    mounted.current = true;
    const unsubscribeGame = store.subscribe((current) => {
      if (
        current.game !== game ||
        current.session.screen !== 'main' ||
        current.game?.meta.playerClanId !== playerClanId
      )
        revoked.current = true;
    });
    const unsubscribePanel = uiStore.subscribe((current, previous) => {
      if (
        panel !== null &&
        previous.panelStack.includes(panel) &&
        !current.panelStack.includes(panel)
      )
        revoked.current = true;
      const previousTop = previous.panelStack.at(-1),
        currentTop = current.panelStack.at(-1);
      if (
        (previous.modal === null && current.modal !== null) ||
        ((panel === null ? previousTop === undefined : previousTop === panel) &&
          !(panel === null ? currentTop === undefined : currentTop === panel))
      ) {
        generation.current += 1;
        setRenderedGeneration(generation.current);
      }
    });
    return () => {
      unsubscribeGame();
      unsubscribePanel();
      mounted.current = false;
      revoked.current = true;
    };
  }, [game, panel, playerClanId]);
  const foreground = () => {
    const app = store.getState(),
      ui = uiStore.getState(),
      top = ui.panelStack.at(-1);
    return (
      mounted.current &&
      !revoked.current &&
      generation.current === renderedGeneration &&
      game !== null &&
      app.game === game &&
      app.session.screen === 'main' &&
      app.session.fatalError === null &&
      !app.session.viewportBlocked &&
      game.meta.gameOver === null &&
      game.meta.playerClanId === playerClanId &&
      game.clans[playerClanId] === actor &&
      (panel === null ? top === undefined : top === panel) &&
      ui.modal === null &&
      document.querySelector('[data-ui-dialog]') === null &&
      (parentScope === undefined || parentScope()) &&
      (inheritedScope === null || inheritedScope())
    );
  };
  const model = useM6View();
  const [executorId, setExecutorId] = useState<OfficerId | ''>('');
  const currentExecutor = useRef(executorId);
  currentExecutor.current = executorId;
  const actualMission = game?.diplomacy.missions.find(
    (entry) => entry.fromClanId === playerClanId && entry.target === target,
  );
  const missionFrom = actualMission?.fromClanId,
    missionTarget = actualMission?.target,
    missionOfficer = actualMission?.officerId,
    missionStart = actualMission?.startDay;
  const executor = executorId === '' ? undefined : game?.officers[executorId];
  const targetClan = target === 'court' || target === 'shogunate' ? undefined : game?.clans[target];
  const missionCurrent = () => {
    if (store.getState().game !== game || game === null || game.meta.playerClanId !== playerClanId)
      return false;
    return (
      game.diplomacy.missions.find(
        (entry) => entry.fromClanId === playerClanId && entry.target === target,
      ) === actualMission &&
      actualMission?.fromClanId === missionFrom &&
      actualMission?.target === missionTarget &&
      actualMission?.officerId === missionOfficer &&
      actualMission?.startDay === missionStart
    );
  };
  const startCurrent = () =>
    missionCurrent() &&
    actualMission === undefined &&
    currentExecutor.current === executorId &&
    (executorId === '' || game?.officers[executorId] === executor) &&
    (target === 'court' || target === 'shogunate' || game?.clans[target] === targetClan);
  const mission = model.missions.find(
    (item) => item.fromClanId === model.playerClanId && item.target === target,
  );
  const cost = useGameSelector((game) =>
    monthlyDiplomacyWorkCost(game, {
      fromClanId: model.playerClanId,
      target,
      officerId: mission?.officerId ?? (executorId || null),
    }),
  );
  const officers = model.officers.filter(
    (officer) => officer.status === 'serving' && officer.clanId === model.playerClanId,
  );
  return (
    <section className={`${styles.card} ${presentation.work}`}>
      <h3>{t('ui.diplomacy.assignWork')}</h3>
      <p>{t('ui.diplomacy.monthlyCost', { gold: cost })}</p>
      {mission !== undefined ? (
        <>
          <p>
            {model.officers.find((officer) => officer.id === mission.officerId)?.name} ·{' '}
            {t('ui.diplomacy.workMonths', {
              months: Math.floor((model.day - mission.startDay) / 30),
            })}
          </p>
          <DiploWorkAction
            key={`${renderedGeneration}:${ownerId(actualMission)}:${missionFrom}:${missionTarget}:${missionOfficer}:${missionStart}`}
            scope={foreground}
            subject={missionCurrent}
            command={{ type: 'stopDiploWork', clanId: model.playerClanId, target }}
            label={t('ui.diplomacy.stopWork')}
          />
        </>
      ) : (
        <>
          <label>
            {t('ui.diplomacy.workOfficer')}
            <select
              value={executorId}
              onChange={(event) => {
                if (foreground() && currentExecutor.current === executorId)
                  setExecutorId(event.currentTarget.value as OfficerId);
              }}
            >
              <option value="">{t('ui.common.select')}</option>
              {officers.map((officer) => (
                <option key={officer.id} value={officer.id}>
                  {officer.name}
                </option>
              ))}
            </select>
          </label>
          <DiploWorkAction
            key={`${renderedGeneration}:${executorId}:${ownerId(executor)}:${ownerId(targetClan)}`}
            scope={foreground}
            subject={startCurrent}
            command={{
              type: 'startDiploWork',
              clanId: model.playerClanId,
              target,
              executorId: executorId as OfficerId,
            }}
            label={t('ui.diplomacy.startWork')}
          />
        </>
      )}
    </section>
  );
}

function ClanDetail({ targetId }: { targetId: ClanId }) {
  const scope = useContext(ScopeContext);
  const model = useM6View();
  const target = model.clans.find((clan) => clan.id === targetId);
  const [against, setAgainst] = useState<ClanId | ''>('');
  const trust = useGameSelector((game) => getTrust(game, model.playerClanId, targetId));
  const sentiment = useGameSelector((game) => getSentiment(game, targetId, model.playerClanId));
  const pacts = (() => {
    const row = model.diplomacyRows.find(
      (row) =>
        (row.a === model.playerClanId && row.b === targetId) ||
        (row.b === model.playerClanId && row.a === targetId),
    );
    return row?.pacts ?? [];
  })();
  const scores = useGameSelector((game) =>
    kinds.map((kind) => evaluateProposal(game, model.playerClanId, targetId, kind)),
  );
  const actions = useUIStore((state) => state.actions);
  if (target === undefined) return null;
  return (
    <section className={presentation.detail}>
      <h3>{target.name}</h3>
      <p>
        {t('ui.diplomacy.leader', {
          name: model.officers.find((officer) => officer.id === target.leaderId)?.name ?? '',
        })}
      </p>
      <p>
        {t('ui.diplomacy.trust')} {formatNumber(Math.floor(trust))} / 100 ·{' '}
        {t('ui.diplomacy.sentiment')} {formatNumber(Math.floor(sentiment))}
      </p>
      <h3>{t('ui.diplomacy.pacts')}</h3>
      {pacts.length === 0 && <p>{t('ui.diplomacy.pactNone')}</p>}
      {pacts.map((pact) => (
        <div className={`${styles.card} ${presentation.pact}`} key={pact.kind}>
          <PactIndicators pacts={[pact]} />
          {pact.kind === 'marriage' &&
            model.officers
              .filter(
                (officer) =>
                  officer.clanId === model.playerClanId &&
                  model.officers.some(
                    (spouse) => spouse.id === officer.spouseId && spouse.clanId === targetId,
                  ),
              )
              .map((officer) => (
                <p key={officer.id}>
                  {t('ui.envoy.marriage', {
                    names: [
                      officer.name,
                      model.officers.find((spouse) => spouse.id === officer.spouseId)?.name ?? '',
                    ].join('、'),
                  })}
                </p>
              ))}
          <p>
            {t(`term.pact.${pact.kind}`)} ·{' '}
            {pact.endDay === null
              ? t('ui.diplomacy.permanent')
              : t('ui.diplomacy.remaining', {
                  months: Math.ceil(Math.max(0, pact.endDay - model.day) / 30),
                })}
            {pact.vassalClanId !== null && (
              <>
                {' '}
                ·{' '}
                {t('ui.diplomacy.vassalClan', {
                  name: model.clans.find((clan) => clan.id === pact.vassalClanId)?.name ?? '',
                })}
              </>
            )}
          </p>
          <PactBreakAction targetId={targetId} pact={pact} />
        </div>
      ))}
      <DiploWork key={targetId} target={targetId} />
      <label>
        {t('ui.diplomacy.reinforceAgainst')}
        <select
          value={against}
          onChange={(event) => setAgainst(event.currentTarget.value as ClanId)}
        >
          <option value="">{t('ui.common.select')}</option>
          {model.clans
            .filter((clan) => clan.id !== model.playerClanId && clan.id !== targetId)
            .map((clan) => (
              <option key={clan.id} value={clan.id}>
                {clan.name}
              </option>
            ))}
        </select>
      </label>
      <div className={`${styles.actions} ${presentation.proposals}`}>
        {kinds.map((kind, index) => (
          <div key={kind}>
            <p>
              {t('ui.diplomacy.trust')} −{pactTrustCost(kind)}
              {kind === 'proposeMarriage' && (
                <>
                  {' '}
                  · {t('ui.court.gold')} {BAL.goldCostMarriage}
                </>
              )}
            </p>
            {(kind === 'proposeAlliance' || kind === 'proposeCeasefire') && (
              <p>
                {t('ui.diplomacy.remaining', {
                  months: kind === 'proposeAlliance' ? BAL.allianceMonths : BAL.ceasefireMonths,
                })}
              </p>
            )}
            {kind === 'proposeMarriage' && <p>{t('ui.diplomacy.permanent')}</p>}
            {kind !== 'requestReinforce' && (
              <p>
                {t(
                  `ui.diplomacy.outlook.${scores[index]! >= BAL.dipAcceptThreshold ? 'high' : scores[index]! >= BAL.dipAcceptThreshold / 2 ? 'mid' : 'low'}`,
                )}
              </p>
            )}
            <ScopedCommandAction
              command={{
                type: 'proposePact',
                clanId: model.playerClanId,
                targetClanId: targetId,
                kind,
                reinforceAgainstClanId:
                  kind === 'requestReinforce' ? (against as ClanId) || null : null,
              }}
              label={t(`cmd.diplomacy.${kind}`)}
            />
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => {
          if (scope?.()) actions.openPanel('plot', { targetClanId: targetId });
        }}
      >
        {t('ui.plot.title')}
      </button>
    </section>
  );
}

export function DiplomacyPanel() {
  const game = useStore(store, (state) => state.game);
  const panel = useUIStore(
    (state) => state.panelStack.find((entry) => entry.id === 'diplomacy') ?? null,
  );
  return <DiplomacyContent key={`${ownerId(game)}:${ownerId(panel)}`} />;
}

function DiplomacyContent() {
  const game = useStore(store, (state) => state.game);
  const ownerGame = useRef(game);
  const ownerPanel = useRef(
    uiStore.getState().panelStack.find((entry) => entry.id === 'diplomacy') ?? null,
  );
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const model = useM6View();
  const actions = useUIStore((state) => state.actions);
  const [tab, setTab] = useState('clans');
  const others = model.clans.filter((clan) => clan.id !== model.playerClanId);
  const [targetId, setTargetId] = useState<ClanId | undefined>(others[0]?.id);
  const currentTab = useRef(tab);
  const currentTarget = useRef(targetId);
  currentTab.current = tab;
  currentTarget.current = targetId;
  const ownsPanel = () => {
    const current = store.getState(),
      top = uiStore.getState().panelStack.at(-1);
    return (
      mounted.current &&
      ownerGame.current !== null &&
      current.game === ownerGame.current &&
      current.session.screen === 'main' &&
      (ownerPanel.current === null ? top === undefined : top === ownerPanel.current)
    );
  };
  const foreground = (native?: Element, expected?: ModalInstance) => {
    const dialogs = document.querySelectorAll('[data-ui-dialog]');
    return (
      uiStore.getState().modal === (expected ?? null) &&
      (native === undefined
        ? dialogs.length === 0
        : native.isConnected && dialogs.item(dialogs.length - 1) === native)
    );
  };
  const scope: Scope = (native, modal, closing = false) => {
    const current = store.getState();
    return (
      ownsPanel() &&
      currentTab.current === tab &&
      currentTarget.current === targetId &&
      foreground(native, modal) &&
      (closing ||
        (current.session.fatalError === null &&
          !current.session.viewportBlocked &&
          current.game!.meta.gameOver === null))
    );
  };
  const relations = model.relations;
  return (
    <div className={presentation.screen}>
      <M6Panel
        title={t('ui.diplomacy.title')}
        testId="diplomacy-panel"
        onClose={() => {
          if (ownsPanel() && foreground()) actions.closePanelById('diplomacy');
        }}
      >
        <div className={presentation.frame}>
          <ScopeContext.Provider value={scope}>
            <TabView
              tabs={[
                { id: 'clans', label: t('ui.diplomacy.clans') },
                { id: 'court', label: t('ui.court.title') },
                { id: 'shogunate', label: t('ui.shogunate.title') },
              ]}
              activeId={tab}
              onChange={(id) => {
                if (scope()) setTab(id);
              }}
            >
              <TabView.Pane id="clans">
                <div className={`${styles.columns} ${presentation.columns}`}>
                  <div className={`${styles.list} ${presentation.roster}`}>
                    {relations.map((clan) => (
                      <button
                        type="button"
                        key={clan.id}
                        aria-pressed={clan.id === targetId}
                        onClick={() => {
                          if (scope() && game?.clans[clan.id]?.alive) setTargetId(clan.id);
                        }}
                      >
                        <span className={presentation.clanName}>{clan.name}</span> ·{' '}
                        <span className={presentation.clanStatus}>
                          {t('ui.diplomacy.sentiment')} {Math.floor(clan.sentiment)} ·{' '}
                          {t('ui.diplomacy.trust')} {Math.floor(clan.trust)}{' '}
                          {clan.war && t('ui.diplomacy.atWar')}
                        </span>
                        <PactIndicators
                          pacts={
                            model.diplomacyRows.find(
                              (row) =>
                                (row.a === model.playerClanId && row.b === clan.id) ||
                                (row.b === model.playerClanId && row.a === clan.id),
                            )?.pacts ?? []
                          }
                        />
                      </button>
                    ))}
                  </div>
                  {targetId !== undefined && <ClanDetail key={targetId} targetId={targetId} />}
                </div>
              </TabView.Pane>
              <TabView.Pane id="court">
                <CourtPage target="court" />
              </TabView.Pane>
              <TabView.Pane id="shogunate">
                <CourtPage target="shogunate" />
              </TabView.Pane>
            </TabView>
          </ScopeContext.Provider>
        </div>
      </M6Panel>
    </div>
  );
}
