import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { dispatchCommand } from '@app/bridge';
import { store } from '@app/store';
import { BAL } from '@core/balance';
import {
  courtRankOrder,
  shogunateTitleOrder,
  controlsCourtCapital,
  shogunateTitleCost,
  mediationFavorCost,
  validateCommand,
} from '@core/index';
import type { CastleId, ClanId } from '@core/state/ids';
import type { Command } from '@core/commands/types';
import type { Castle, Clan, GameState } from '@core/state/gameState';
import { getCourtMetadata } from '@data/courtMetadata';
import { t } from '@i18n/zh-TW';
import { CommandAction } from '../components/CommandAction';
import { ConfirmDialog } from '../components';
import { useM6View } from '../hooks/useM6View';
import { useGameSelector } from '../hooks/useGameSelector';
import { DiploWork } from './DiplomacyPanel';
import { uiStore, useUIStore, type ModalInstance, type PanelInstance } from '../hooks/uiStore';
import styles from './M6Panel.module.css';
import presentation from './CourtPage.module.css';
import actionStyles from '../components/CommandAction.module.css';

type Scope = (native?: Element, modal?: ModalInstance, closing?: boolean) => boolean;
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

function CourtCommandAction({
  command,
  label,
  scope,
}: {
  command: Command;
  label: string;
  scope: Scope;
}) {
  const serialized = JSON.stringify(command);
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
      command={command}
      label={label}
      onCommand={(current) => {
        if (active.current !== owner || !scope())
          return { ok: false, reason: 'cmd.reject.invalidTarget' };
        const game = store.getState().game;
        if (game === null) return { ok: false, reason: 'cmd.reject.invalidTarget' };
        const verdict = validateCommand(game, current);
        if (!verdict.ok)
          return {
            ok: false,
            reason: verdict.reasonKey,
            ...(verdict.params ? { params: verdict.params } : {}),
          };
        return dispatchCommand(current);
      }}
    />
  );
}

interface NominationConsent {
  game: GameState;
  actor: Clan;
  clanId: ClanId;
  capitalId: CastleId;
  capital: Castle;
  modal: ModalInstance;
  consumed: boolean;
}

function NominationAction({
  game,
  clanId,
  scope,
}: {
  game: GameState | null;
  clanId: ClanId;
  scope: Scope;
}) {
  const modal = useUIStore((state) => state.modal);
  const mounted = useRef(false);
  const active = useRef<NominationConsent | null>(null);
  const [request, setRequest] = useState<NominationConsent | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const body = useRef<HTMLSpanElement>(null);
  const reasonId = useId();
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
        uiStore
          .getState()
          .actions.closeOwnedModal(expected.modal, { resume: false, expectedGame: expected.game });
      }
    };
  }, []);
  const command = { type: 'nominateShogun' as const, clanId };
  const verdict = useGameSelector((state) => validateCommand(state, command));
  const reason = verdict.ok ? null : t(verdict.reasonKey, verdict.params);
  const native = () => body.current?.closest('[data-ui-dialog]') ?? undefined;
  const ownsRequest = (expected: NominationConsent | null) =>
    expected !== null &&
    mounted.current &&
    active.current === expected &&
    store.getState().game === expected.game &&
    uiStore.getState().modal === expected.modal;
  const ownsSubject = (expected: NominationConsent) =>
    expected.game.meta.playerClanId === expected.clanId &&
    expected.game.clans[expected.clanId] === expected.actor &&
    getCourtMetadata(expected.game.meta.scenarioId)?.capitalCastleId === expected.capitalId &&
    expected.game.castles[expected.capitalId] === expected.capital;
  const closeRequest = (expected: NominationConsent) => {
    expected.consumed = true;
    active.current = null;
    setRequest(null);
    uiStore.getState().actions.closeOwnedModal(expected.modal, { expectedGame: expected.game });
  };
  const open = request !== null && active.current === request && modal === request.modal;
  return (
    <div className={actionStyles.action}>
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
            game.meta.playerClanId !== clanId
          )
            return;
          const fresh = validateCommand(game, command);
          if (!fresh.ok) {
            setFeedback(t(fresh.reasonKey, fresh.params));
            return;
          }
          const capitalId = getCourtMetadata(game.meta.scenarioId)?.capitalCastleId;
          const capital = capitalId === undefined ? undefined : game.castles[capitalId];
          const actor = game.clans[clanId];
          if (capitalId === undefined || capital === undefined || actor === undefined) return;
          const next: NominationConsent = {
            game,
            actor,
            clanId,
            capitalId,
            capital,
            consumed: false,
            modal: {
              id: 'confirm',
              params: {
                owner: 'nominateShogun',
                requestId: String(++nextRequestId),
                clanId,
                target: 'shogunate',
              },
              pausesTime: false,
            },
          };
          active.current = next;
          setRequest(next);
          setFeedback(null);
          uiStore.getState().actions.enqueueModal(next.modal);
        }}
      >
        {t('cmd.shogunate.nominate')}
      </button>
      {reason !== null && <small id={reasonId}>{reason}</small>}
      {feedback !== null && !open && <p role="alert">{feedback}</p>}
      <ConfirmDialog
        open={open}
        title={t('cmd.shogunate.nominate')}
        message={
          <>
            <span ref={body}>{t('ui.shogunate.nominateConfirm')}</span>
            {feedback !== null && <p role="alert">{feedback}</p>}
          </>
        }
        onCancel={() => {
          const dialog = native();
          if (
            request !== null &&
            ownsRequest(request) &&
            dialog !== undefined &&
            scope(dialog, request.modal, true)
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
            !ownsSubject(expected) ||
            dialog === undefined ||
            !scope(dialog, expected.modal)
          )
            return;
          const fresh = validateCommand(expected.game, {
            type: 'nominateShogun',
            clanId: expected.clanId,
          });
          if (!fresh.ok) {
            setFeedback(t(fresh.reasonKey, fresh.params));
            return;
          }
          expected.consumed = true;
          const result = dispatchCommand({ type: 'nominateShogun', clanId: expected.clanId });
          if (
            !ownsRequest(expected) ||
            !ownsSubject(expected) ||
            native() !== dialog ||
            !scope(dialog, expected.modal) ||
            expected.capital.ownerClanId !== expected.clanId
          )
            return;
          setFeedback(result.ok ? null : t(result.reason, result.params));
          closeRequest(expected);
        }}
      />
    </div>
  );
}

export function CourtPage({ target }: { target: 'court' | 'shogunate' }) {
  const game = useStore(store, (state) => state.game);
  const panel = useUIStore(
    (state) => state.panelStack.find((entry) => entry.id === 'diplomacy') ?? null,
  );
  return (
    <CourtContent
      key={`${ownerId(game)}:${ownerId(panel)}:${target}`}
      target={target}
      game={game}
      panel={panel}
    />
  );
}

function CourtContent({
  target,
  game,
  panel,
}: {
  target: 'court' | 'shogunate';
  game: GameState | null;
  panel: PanelInstance | null;
}) {
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const scope: Scope = (native, expectedModal, closing = false) => {
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
      ui.modal === (expectedModal ?? null) &&
      (native === undefined
        ? dialogs.length === 0
        : native.isConnected && dialogs.item(dialogs.length - 1) === native) &&
      (closing ||
        (current.session.fatalError === null &&
          !current.session.viewportBlocked &&
          game.meta.gameOver === null))
    );
  };
  const model = useM6View();
  const clan = model.clans.find((item) => item.id === model.playerClanId)!;
  const court = target === 'court';
  const current = court ? courtRankOrder(clan.courtRank) : shogunateTitleOrder(clan.shogunateTitle);
  const table = court ? BAL.courtRankTable : BAL.shogunateTitleTable;
  const nextTitle = !court && current !== null ? BAL.shogunateTitleTable[current] : undefined;
  const favor = court ? model.courtFavor : model.shogunateFavor;
  const titleCost = useGameSelector((game) => shogunateTitleCost(game, model.playerClanId));
  const hasCapital = useGameSelector((game) => controlsCourtCapital(game, model.playerClanId));
  const mediationCost = useGameSelector((game) => mediationFavorCost(game, model.playerClanId));
  const [enemy, setEnemy] = useState<ClanId | ''>('');
  return (
    <div className={`${styles.columns} ${presentation.courtFrame}`}>
      <section className={presentation.dossier}>
        <h3>{t(court ? 'ui.court.title' : 'ui.shogunate.title')}</h3>
        {!court && !model.shogunateExists && <p role="status">{t('ui.shogunate.collapsed')}</p>}
        <p>
          {t('ui.court.favor')} {Math.floor(favor)} / 100
        </p>
        <progress value={favor} max={100} aria-label={t('ui.court.favor')} />
        <p>
          {t('ui.court.current')}{' '}
          {t(
            court
              ? `term.courtRank.${clan.courtRank}`
              : `term.shogunateTitle.${clan.shogunateTitle}`,
          )}
        </p>
        {model.patronClanId !== null && (
          <p>
            {t('ui.shogunate.patron', {
              name: model.clans.find((item) => item.id === model.patronClanId)?.name ?? '',
            })}
          </p>
        )}
        <DiploWork key={target} target={target} scope={scope} />
        <div className={styles.actions}>
          <CourtCommandAction
            scope={scope}
            command={{
              type: court ? 'requestCourtRank' : 'requestShogunateTitle',
              clanId: model.playerClanId,
            }}
            label={t(court ? 'cmd.court.requestRank' : 'cmd.shogunate.requestTitle')}
          />
          {!court && <NominationAction game={game} clanId={model.playerClanId} scope={scope} />}
        </div>
        {court && (
          <>
            <p>
              {t('ui.court.mediationCost', {
                gold: BAL.courtMediationGoldCost,
                favor: mediationCost,
              })}
            </p>
            <label>
              {t('ui.court.mediationTarget')}
              <select
                value={enemy}
                onChange={(event) => setEnemy(event.currentTarget.value as ClanId)}
              >
                <option value="">{t('ui.common.select')}</option>
                {model.clans
                  .filter((item) => item.id !== model.playerClanId)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
            <CourtCommandAction
              scope={scope}
              command={{
                type: 'requestMediation',
                clanId: model.playerClanId,
                targetClanId: enemy as ClanId,
              }}
              label={t('cmd.court.mediate')}
            />
          </>
        )}
      </section>
      <section className={presentation.register}>
        <h3>{t('ui.court.requirements')}</h3>
        <table className={`${styles.table} ${presentation.rankTable}`}>
          <thead>
            <tr>
              <th>{t('ui.court.rank')}</th>
              <th>{t('ui.court.favor')}</th>
              <th>{t('ui.court.gold')}</th>
              <th>{t('ui.court.prestige')}</th>
              <th>{t('ui.court.effect')}</th>
            </tr>
          </thead>
          <tbody>
            {table.map((def, index) => (
              <tr key={def.id} aria-current={current === index + 1 ? 'step' : undefined}>
                <td>
                  {current !== null && current >= index + 1 ? '✓ ' : ''}
                  {def.name}
                </td>
                <td>{def.favorRequired}</td>
                <td>{def.goldCost}</td>
                <td>
                  +{def.prestigeBonus}
                  {'prestigeRequired' in def && (
                    <> ({t('ui.court.required', { value: def.prestigeRequired })})</>
                  )}
                </td>
                <td>
                  {t(
                    'unlock' in def
                      ? `ui.court.unlock.${def.unlock ?? 'none'}`
                      : `ui.shogunate.effect.${def.effect}`,
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>{t('ui.court.nextRequirements')}</h3>
        {current !== null && table[current] !== undefined ? (
          <ul>
            <li>
              {favor >= table[current].favorRequired ? '✓' : '✗'} {t('ui.court.favor')}{' '}
              {table[current].favorRequired}
            </li>
            <li>
              {clan.gold >= (court ? table[current].goldCost : (titleCost ?? Infinity)) ? '✓' : '✗'}{' '}
              {t('ui.court.gold')} {court ? table[current].goldCost : titleCost}
            </li>
            {nextTitle !== undefined && (
              <>
                <li>
                  {model.shogunateExists ? '✓' : '✗'} {t('ui.shogunate.exists')}
                </li>
                {nextTitle.requiresCapitalOrPatron && (
                  <li>
                    {hasCapital || model.patronClanId === model.playerClanId ? '✓' : '✗'}{' '}
                    {t('ui.court.controlsCapital')}
                  </li>
                )}
                {nextTitle.requiresPatron && (
                  <li>
                    {model.patronClanId === model.playerClanId ? '✓' : '✗'}{' '}
                    {t('ui.shogunate.requiresPatron')}
                  </li>
                )}
                <li>
                  {clan.prestige >= nextTitle.prestigeRequired ? '✓' : '✗'} {t('ui.court.prestige')}{' '}
                  {nextTitle.prestigeRequired}
                </li>
              </>
            )}
          </ul>
        ) : (
          <p>{t('ui.court.highest')}</p>
        )}
      </section>
    </div>
  );
}
