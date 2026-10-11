import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { dispatchCommand } from '@app/bridge';
import { store } from '@app/store';
import { validateCommand } from '@core/index';
import type { Command } from '@core/commands/types';
import type { GameState } from '@core/state/gameState';
import type { CorpsDirective } from '@core/state/enums';
import type { CastleId, CorpsId, MapNodeId, OfficerId } from '@core/state/ids';
import { RANK_VALUES } from '@core/state/enums';
import { t } from '@i18n/zh-TW';
import { makeCachedSelector, useCachedGameSelector } from '../hooks/useGameSelector';
import { uiStore, useUIStore, type ModalInstance, type PanelInstance } from '../hooks/uiStore';
import { ConfirmDialog } from '../components';
import actionStyles from '../components/CommandAction.module.css';
import { M6Panel } from './M6Panel';
import styles from './M6Panel.module.css';
import presentation from './CorpsScreen.module.css';

const selectCorps = makeCachedSelector((game) => ({
  clanId: game.meta.playerClanId,
  corps: Object.values(game.corps)
    .filter((c) => c.clanId === game.meta.playerClanId)
    .map((c) => ({ ...c })),
  officers: Object.values(game.officers)
    .filter(
      (o) =>
        o.clanId === game.meta.playerClanId &&
        o.status === 'serving' &&
        o.hasComeOfAge &&
        (o.id === game.clans[game.meta.playerClanId]?.leaderId ||
          RANK_VALUES.indexOf(o.rank) >= RANK_VALUES.indexOf('karo')),
    )
    .map((o) => ({ id: o.id, name: o.name })),
  castles: Object.values(game.castles)
    .filter((c) => c.ownerClanId === game.meta.playerClanId)
    .map((c) => ({ id: c.id, name: c.name, corpsId: c.corpsId, directControl: c.directControl })),
  targets: [...Object.values(game.castles), ...Object.values(game.districts)]
    .filter((n) => n.ownerClanId !== game.meta.playerClanId)
    .map((n) => ({ id: n.id, name: n.name })),
}));
type Model = ReturnType<typeof selectCorps>;

const ownerIds = new WeakMap<object, number>();
let nextOwnerId = 0;
function ownerId(owner: object | null | undefined): number {
  if (owner == null) return 0;
  let id = ownerIds.get(owner);
  if (id === undefined) {
    id = ++nextOwnerId;
    ownerIds.set(owner, id);
  }
  return id;
}

interface CorpsConsent {
  consumed: boolean;
  game: GameState;
  modal: ModalInstance;
}
let nextConsentId = 0;

/** Local command and consent ownership; the shared CommandAction contract stays unchanged. */
function CorpsAction({
  command,
  label,
  confirmation,
  danger = false,
  canSubmit,
  canCancel,
}: {
  command: Command;
  label: string;
  confirmation?: string;
  danger?: boolean;
  canSubmit: (command: Command, native?: Element, modal?: ModalInstance) => boolean;
  canCancel: (native: Element, modal: ModalInstance) => boolean;
}) {
  const modal = useUIStore((state) => state.modal);
  const serialized = JSON.stringify(command);
  const owner = useMemo(() => ({ serialized }), [serialized]);
  const activeOwner = useRef<object | null>(null);
  const requestRef = useRef<CorpsConsent | null>(null);
  const [request, setRequest] = useState<CorpsConsent | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const body = useRef<HTMLSpanElement>(null);
  const reasonId = useId();
  const validate = useMemo(
    () =>
      makeCachedSelector((game, value: string) =>
        validateCommand(game, JSON.parse(value) as Command),
      ),
    [],
  );
  const verdict = useCachedGameSelector(validate, serialized);
  const reason = verdict.ok ? null : t(verdict.reasonKey, verdict.params);
  useLayoutEffect(() => {
    activeOwner.current = owner;
    requestRef.current = null;
    setRequest(null);
    setFeedback(null);
    const unsubscribe = uiStore.subscribe((current, previous) => {
      const expected = requestRef.current;
      if (
        expected !== null &&
        (previous.modal === expected.modal || previous.modalQueue.includes(expected.modal)) &&
        current.modal !== expected.modal &&
        !current.modalQueue.includes(expected.modal)
      ) {
        expected.consumed = true;
        requestRef.current = null;
        setRequest(null);
      }
    });
    return () => {
      unsubscribe();
      if (activeOwner.current === owner) activeOwner.current = null;
      const expected = requestRef.current;
      requestRef.current = null;
      if (expected !== null) {
        expected.consumed = true;
        uiStore.getState().actions.closeOwnedModal(expected.modal, {
          resume: false,
          expectedGame: expected.game,
        });
      }
    };
  }, [owner]);
  const native = () => body.current?.closest('[data-ui-dialog]') ?? undefined;
  const ownsRequest = (expected: CorpsConsent | null) =>
    expected !== null &&
    requestRef.current === expected &&
    activeOwner.current === owner &&
    store.getState().game === expected.game &&
    uiStore.getState().modal === expected.modal;
  const closeRequest = (expected: CorpsConsent) => {
    expected.consumed = true;
    requestRef.current = null;
    setRequest(null);
    uiStore.getState().actions.closeOwnedModal(expected.modal, { expectedGame: expected.game });
  };
  const cancel = () => {
    const dialog = native();
    if (
      !ownsRequest(request) ||
      request === null ||
      dialog === undefined ||
      !canCancel(dialog, request.modal)
    )
      return;
    closeRequest(request);
    setFeedback(null);
  };
  const submit = (consent: CorpsConsent | null = null) => {
    const dialog = consent === null ? undefined : native();
    if (
      activeOwner.current !== owner ||
      (confirmation !== undefined && !ownsRequest(consent)) ||
      consent?.consumed === true ||
      (consent !== null && dialog === undefined) ||
      !canSubmit(command, dialog, consent?.modal)
    )
      return;
    const game = store.getState().game;
    if (game === null) return;
    const fresh = validateCommand(game, command);
    if (!fresh.ok) {
      setFeedback(t(fresh.reasonKey, fresh.params));
      return;
    }
    if (consent !== null) consent.consumed = true;
    const result = dispatchCommand(command);
    if (
      activeOwner.current !== owner ||
      (consent !== null && (!ownsRequest(consent) || native() !== dialog)) ||
      !canSubmit(command, consent === null ? undefined : native(), consent?.modal)
    )
      return;
    setFeedback(result.ok ? null : t(result.reason, result.params));
    if (consent !== null) closeRequest(consent);
  };
  return (
    <div className={actionStyles.action}>
      <button
        type="button"
        disabled={!verdict.ok}
        title={reason ?? undefined}
        aria-describedby={reason === null ? undefined : reasonId}
        onClick={() => {
          if (activeOwner.current !== owner || !canSubmit(command)) return;
          const game = store.getState().game;
          if (game === null) return;
          const fresh = validateCommand(game, command);
          if (!fresh.ok) {
            setFeedback(t(fresh.reasonKey, fresh.params));
            return;
          }
          if (confirmation === undefined) submit();
          else {
            const next: CorpsConsent = {
              consumed: false,
              game,
              modal: {
                id: 'confirm',
                params: {
                  owner: 'corps',
                  requestId: String(++nextConsentId),
                  corpsId: command.type === 'dissolveCorps' ? command.corpsId : '',
                  clanId: command.clanId,
                },
                pausesTime: false,
              },
            };
            requestRef.current = next;
            setRequest(next);
            setFeedback(null);
            uiStore.getState().actions.enqueueModal(next.modal);
          }
        }}
      >
        {label}
      </button>
      {reason !== null && <small id={reasonId}>{reason}</small>}
      {feedback !== null && (request === null || modal !== request.modal) && (
        <p role="alert">{feedback}</p>
      )}
      {confirmation !== undefined && (
        <ConfirmDialog
          open={request !== null && requestRef.current === request && modal === request.modal}
          title={label}
          message={
            <>
              <span ref={body}>{confirmation}</span>
              {feedback !== null && <p role="alert">{feedback}</p>}
            </>
          }
          danger={danger}
          onConfirm={() => submit(request)}
          onCancel={cancel}
        />
      )}
    </div>
  );
}

function CorpsEditor({
  model,
  corpsId,
  game,
  ownsScope,
  ownsCloseScope,
}: {
  model: Model;
  corpsId: CorpsId | null;
  game: GameState | null;
  ownsScope: (native?: Element, modal?: ModalInstance) => boolean;
  ownsCloseScope: (native: Element, modal: ModalInstance) => boolean;
}) {
  const corps = model.corps.find((c) => c.id === corpsId);
  const [leaderId, setLeaderId] = useState<OfficerId | null>(model.officers[0]?.id ?? null);
  const [castleIds, setCastleIds] = useState<CastleId[]>([]);
  const [directive, setDirective] = useState<CorpsDirective>(corps?.directive ?? 'hold');
  const [targetId, setTargetId] = useState<MapNodeId | null>(
    corps?.targetNodeId ?? model.targets[0]?.id ?? null,
  );
  const targetNodeId = directive === 'advance' ? targetId : null;
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const subject = corpsId === null ? null : game?.corps[corpsId];
  const castleSubjects = new Map(
    model.castles.map((castle) => [castle.id, game?.castles[castle.id]]),
  );
  const leaderSubject = leaderId === null ? null : game?.officers[leaderId];
  const canSubmit = (command: Command, native?: Element, modal?: ModalInstance) => {
    if (
      !mounted.current ||
      !ownsScope(native, modal) ||
      game === null ||
      game.meta.playerClanId !== model.clanId
    )
      return false;
    if (
      corpsId !== null &&
      (subject === undefined || game.corps[corpsId] !== subject || subject?.clanId !== model.clanId)
    )
      return false;
    if (command.type === 'assignCastleToCorps') {
      const row = model.castles.find((castle) => castle.id === command.castleId);
      const current = game.castles[command.castleId];
      if (
        row === undefined ||
        current === undefined ||
        current !== castleSubjects.get(command.castleId) ||
        current.corpsId !== row.corpsId ||
        current.directControl !== row.directControl
      )
        return false;
    }
    if (
      command.type === 'createCorps' &&
      (game.officers[command.corpsLeaderId] !== leaderSubject || command.corpsLeaderId !== leaderId)
    )
      return false;
    if (
      command.type === 'createCorps' &&
      command.castleIds.some((id) => {
        const row = model.castles.find((castle) => castle.id === id);
        const current = game.castles[id];
        return (
          row === undefined ||
          current === undefined ||
          current !== castleSubjects.get(id) ||
          current.corpsId !== row.corpsId ||
          current.directControl !== row.directControl
        );
      })
    )
      return false;
    return true;
  };
  const canCancel = (native: Element, modal: ModalInstance) =>
    mounted.current && ownsCloseScope(native, modal);
  return (
    <section className={`${styles.form} ${presentation.editor}`}>
      {corps ? (
        <>
          <h3>
            {t('ui.corps.name', {
              name:
                model.officers.find((o) => o.id === corps.corpsLeaderId)?.name ??
                corps.corpsLeaderId,
            })}
          </h3>
          <p>{t('ui.corps.wallet', { gold: corps.gold })}</p>
          <CorpsAction
            canSubmit={canSubmit}
            canCancel={canCancel}
            command={{ type: 'dissolveCorps', clanId: model.clanId, corpsId: corps.id }}
            label={t('ui.corps.dissolve')}
            confirmation={t('ui.corps.dissolveConfirm')}
            danger
          />
        </>
      ) : (
        <label className={presentation.leader}>
          {t('ui.corps.leader')}
          <select value={leaderId ?? ''} onChange={(e) => setLeaderId(e.target.value as OfficerId)}>
            {model.officers.length === 0 && <option value="">{t('ui.common.noData')}</option>}
            {model.officers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <fieldset className={presentation.directive}>
        <legend>{t('ui.corps.directive')}</legend>
        {(['advance', 'hold', 'develop'] as const).map((value) => (
          <label key={value} className={presentation.directiveOption}>
            <input
              type="radio"
              name="corps-directive"
              checked={directive === value}
              onChange={() => setDirective(value)}
            />
            {t(`ui.corps.${value}`)}
          </label>
        ))}
        <p className={presentation.effect}>{t(`ui.corps.${directive}Effect`)}</p>
      </fieldset>
      {directive === 'advance' && (
        <label className={presentation.leader}>
          {t('ui.corps.target')}
          <select value={targetId ?? ''} onChange={(e) => setTargetId(e.target.value as MapNodeId)}>
            {model.targets.length === 0 && <option value="">{t('ui.common.noData')}</option>}
            {model.targets.map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <fieldset className={presentation.castles}>
        <legend>{t('ui.corps.castles')}</legend>
        {model.castles
          .filter((c) =>
            corps
              ? c.corpsId === corps.id || (c.corpsId === null && c.directControl)
              : c.corpsId === null && c.directControl,
          )
          .map((c) =>
            corps ? (
              <div key={c.id} className={presentation.castleRow}>
                {c.name}
                <CorpsAction
                  canSubmit={canSubmit}
                  canCancel={canCancel}
                  command={{
                    type: 'assignCastleToCorps',
                    clanId: model.clanId,
                    castleId: c.id,
                    corpsId: c.corpsId === corps.id ? null : corps.id,
                  }}
                  label={t(c.corpsId === corps.id ? 'ui.corps.remove' : 'ui.corps.assign')}
                />
              </div>
            ) : (
              <label key={c.id} className={presentation.castleRow}>
                <input
                  type="checkbox"
                  checked={castleIds.includes(c.id)}
                  onChange={(e) =>
                    setCastleIds((ids) =>
                      e.target.checked ? [...ids, c.id] : ids.filter((id) => id !== c.id),
                    )
                  }
                />
                {c.name}
              </label>
            ),
          )}
      </fieldset>
      <p className={presentation.tithe}>{t('ui.corps.tithe')}</p>
      {corps ? (
        <CorpsAction
          canSubmit={canSubmit}
          canCancel={canCancel}
          command={{
            type: 'setCorpsDirective',
            clanId: model.clanId,
            corpsId: corps.id,
            directive,
            targetNodeId,
          }}
          label={t('ui.corps.saveDirective')}
        />
      ) : (
        leaderId !== null && (
          <CorpsAction
            canSubmit={canSubmit}
            canCancel={canCancel}
            command={{
              type: 'createCorps',
              clanId: model.clanId,
              corpsLeaderId: leaderId,
              castleIds,
              directive,
              targetNodeId,
            }}
            label={t('ui.corps.create')}
          />
        )
      )}
    </section>
  );
}

export function CorpsScreen() {
  const game = useStore(store, (state) => state.game);
  const panel = useUIStore(
    (state) => state.panelStack.find((entry) => entry.id === 'corps') ?? null,
  );
  return <CorpsContent key={`${ownerId(game)}:${ownerId(panel)}`} game={game} panel={panel} />;
}

function CorpsContent({ game, panel }: { game: GameState | null; panel: PanelInstance | null }) {
  const model = useCachedGameSelector(selectCorps);
  const actions = useUIStore((s) => s.actions);
  const [selection, setSelection] = useState<CorpsId | 'new' | null>(null);
  const selected = selection === 'new' ? null : model.corps.find((c) => c.id === selection);
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
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
  const foreground = (native?: Element, expectedModal?: ModalInstance) => {
    const dialogs = document.querySelectorAll('[data-ui-dialog]');
    return (
      uiStore.getState().modal === (expectedModal ?? null) &&
      (native === undefined
        ? dialogs.length === 0
        : native.isConnected && dialogs.item(dialogs.length - 1) === native)
    );
  };
  const ownsScope = (native?: Element, modal?: ModalInstance) => {
    const current = store.getState();
    return (
      ownsPanel() &&
      foreground(native, modal) &&
      current.session.fatalError === null &&
      !current.session.viewportBlocked &&
      game!.meta.gameOver === null
    );
  };
  return (
    <div className={presentation.screen}>
      <M6Panel
        title={t('ui.corps.title')}
        testId="corps-panel"
        onClose={() => {
          if (ownsPanel() && foreground()) actions.closePanelById('corps');
        }}
      >
        <div className={presentation.frame}>
          <div className={`${styles.columns} ${presentation.columns}`}>
            <nav
              className={`${styles.list} ${presentation.roster}`}
              aria-label={t('ui.corps.title')}
            >
              <button
                type="button"
                onClick={() => {
                  if (ownsScope()) setSelection('new');
                }}
              >
                {t('ui.corps.create')}
              </button>
              {model.corps.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  aria-pressed={selection === c.id}
                  onClick={() => {
                    if (ownsScope() && game?.corps[c.id]?.clanId === model.clanId)
                      setSelection(c.id);
                  }}
                >
                  {t('ui.corps.name', {
                    name:
                      model.officers.find((o) => o.id === c.corpsLeaderId)?.name ?? c.corpsLeaderId,
                  })}{' '}
                  · {model.castles.filter((castle) => castle.corpsId === c.id).length} ·{' '}
                  {t(`ui.corps.${c.directive}`)}
                </button>
              ))}
            </nav>
            {selection === 'new' || selected ? (
              <CorpsEditor
                key={
                  selected
                    ? `${ownerId(game?.corps[selected.id])}:${selected.directive}:${selected.targetNodeId}`
                    : 'new'
                }
                model={model}
                corpsId={selected?.id ?? null}
                game={game}
                ownsScope={ownsScope}
                ownsCloseScope={(native, modal) => ownsPanel() && foreground(native, modal)}
              />
            ) : (
              <p>{t('ui.corps.select')}</p>
            )}
          </div>
        </div>
      </M6Panel>
    </div>
  );
}
