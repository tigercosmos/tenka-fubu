import { useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { useStore } from 'zustand';
import { store } from '@app/store';
import { dispatchCommand, getQueuedPlayerCommands, type CommandDispatchResult } from '@app/bridge';
import type { Command } from '@core/commands/types';
import { validateCommand, getEffectiveOfficerStat } from '@core/index';
import { BAL } from '@core/balance';
import { RANK_VALUES } from '@core/state/enums';
import type { DistrictId, OfficerId } from '@core/state/ids';
import { formatNumber, t } from '@i18n/zh-TW';
import { Panel, ConfirmDialog } from '@ui/components';
import { makeCachedSelector, useCachedGameSelector } from '@ui/hooks/useGameSelector';
import { uiStore } from '@ui/hooks/uiStore';
import styles from './DistrictPanel.module.css';
import { rankLabel } from '../OfficerList';

type Dispatch = (command: Command) => CommandDispatchResult | void;
export interface DistrictPanelProps {
  districtId: DistrictId;
  onClose?: () => void;
  onCommand?: Dispatch;
}

function Metric({
  label,
  value,
  max,
  unit = '',
  danger = false,
}: {
  label: string;
  value: number;
  max: number;
  unit?: string;
  danger?: boolean;
}) {
  return (
    <div className={`${styles.metric} ${danger ? styles.danger : ''}`}>
      <span>{label}</span>
      <progress aria-label={label} value={Math.min(value, max)} max={Math.max(1, max)} />
      <strong>
        {max > 100
          ? t('ui.common.currentMax', { current: value, max })
          : formatNumber(Math.floor(value))}
        {unit}
      </strong>
    </div>
  );
}

const selectDistrictPanelModel = makeCachedSelector((game, districtId: DistrictId) => {
  const district = game.districts[districtId];
  if (!district) return null;
  const castle = game.castles[district.castleId];
  const clan = game.clans[district.ownerClanId];
  const steward = district.stewardId === null ? null : game.officers[district.stewardId];
  const candidates = Object.values(game.officers)
    .filter(
      (officer) =>
        officer.status === 'serving' &&
        officer.hasComeOfAge &&
        officer.clanId === district.ownerClanId &&
        officer.locationCastleId === district.castleId,
    )
    .sort(
      (a, b) =>
        getEffectiveOfficerStat(b, 'pol') - getEffectiveOfficerStat(a, 'pol') ||
        b.loyalty - a.loyalty ||
        a.id.localeCompare(b.id),
    )
    .map((officer) => {
      const verdict = validateCommand(game, {
        type: 'grantFief',
        clanId: game.meta.playerClanId,
        districtId,
        officerId: officer.id,
      });
      return {
        id: officer.id,
        name: officer.name,
        pol: getEffectiveOfficerStat(officer, 'pol'),
        rank: rankLabel(officer.rank),
        loyalty: officer.loyalty,
        count: Object.values(game.districts).filter((d) => d.stewardId === officer.id).length,
        cap: BAL.fiefMaxByRank[RANK_VALUES.indexOf(officer.rank)] ?? 0,
        disabled: !verdict.ok,
        reason: verdict.ok ? null : t(verdict.reasonKey, { name: officer.name, ...verdict.params }),
      };
    });
  return {
    district: {
      id: district.id,
      name: district.name,
      ownerClanId: district.ownerClanId,
      stewardId: district.stewardId,
      kokudaka: district.kokudaka,
      kokudakaCap: district.kokudakaCap,
      commerce: district.commerce,
      commerceCap: district.commerceCap,
      population: district.population,
      populationCap: district.populationCap,
      publicOrder: district.publicOrder,
      developFocus: district.developFocus,
    },
    castleName: castle?.name ?? district.castleId,
    clanName: clan?.name ?? district.ownerClanId,
    playerClanId: game.meta.playerClanId,
    stewardName: steward?.name ?? null,
    candidates,
  };
});

export function DistrictPanel({
  districtId,
  onClose,
  onCommand = dispatchCommand,
}: DistrictPanelProps): ReactElement | null {
  const model = useCachedGameSelector(selectDistrictPanelModel, districtId);
  const game = useStore(store, (s) => s.game);
  const tickSeq = useStore(store, (s) => s.tickSeq);
  useStore(store, (s) => s.session.pendingCommandCount);
  const [feedback, setFeedback] = useState<string | null>(null);
  const owner = useMemo(
    () => ({ game, districtId, stewardId: model?.district.stewardId }),
    [game, districtId, model?.district.stewardId],
  );
  const activeOwner = useRef<typeof owner | null>(null);
  type Request = { owner: typeof owner; target: OfficerId | null; previousName: string };
  const [request, setRequest] = useState<Request | null>(null);
  const activeRequest = useRef<Request | null>(null);
  const submitted = useRef<{ owner: typeof owner; tickSeq: number } | null>(null);
  const [submittedView, setSubmittedView] = useState<typeof submitted.current>(null);
  useLayoutEffect(() => {
    activeOwner.current = owner;
    activeRequest.current = null;
    setRequest(null);
    return () => {
      if (activeOwner.current === owner) activeOwner.current = null;
      activeRequest.current = null;
    };
  }, [owner]);
  if (!model) return null;
  const owned = model.district.ownerClanId === model.playerClanId;
  const submit = (command: Command) => {
    const result = onCommand(command);
    setFeedback(result && !result.ok ? t(result.reason, result.params) : null);
  };
  const close = onClose ?? (() => uiStore.getState().actions.closePanelById('district'));
  const pending =
    game !== null &&
    (getQueuedPlayerCommands(game).some(
      (cmd) => cmd.type === 'grantFief' && cmd.districtId === districtId,
    ) ||
      (submittedView?.owner === owner && submittedView.tickSeq === tickSeq));
  function grant(target: OfficerId | null, consent: Request | null = null) {
    const current = store.getState();
    if (
      activeOwner.current !== owner ||
      game === null ||
      current.game !== game ||
      current.session.screen !== 'main' ||
      current.session.fatalError !== null ||
      current.session.viewportBlocked ||
      game.meta.gameOver !== null ||
      game.districts[districtId]?.stewardId !== owner.stewardId ||
      (consent !== null && activeRequest.current !== consent) ||
      (submitted.current?.owner === owner && submitted.current.tickSeq === current.tickSeq) ||
      getQueuedPlayerCommands(game).some(
        (cmd) => cmd.type === 'grantFief' && cmd.districtId === districtId,
      )
    )
      return;
    const command = {
      type: 'grantFief' as const,
      clanId: game.meta.playerClanId,
      districtId,
      officerId: target,
    };
    const verdict = validateCommand(game, command);
    if (!verdict.ok) {
      setFeedback(t(verdict.reasonKey, verdict.params));
      return;
    }
    // Consume this UI intent before publication can reenter the callback.
    activeRequest.current = null;
    setRequest(null);
    submitted.current = { owner, tickSeq: current.tickSeq };
    setSubmittedView(submitted.current);
    const result = onCommand(command);
    if (activeOwner.current !== owner || store.getState().game !== game) return;
    if (result && !result.ok) {
      submitted.current = null;
      setSubmittedView(null);
      setFeedback(t(result.reason, result.params));
    } else setFeedback(null);
  }
  const focusDisabled = !owned || model.district.stewardId !== null;
  return (
    <aside className={styles.anchor} data-testid="district-panel">
      <Panel
        title={t('ui.district.title', {
          district: model.district.name,
          castle: model.castleName,
          clan: model.clanName,
        })}
        onClose={() => {
          if (activeOwner.current !== owner) return;
          activeOwner.current = null;
          activeRequest.current = null;
          setRequest(null);
          close();
        }}
        variant="ornate"
      >
        <div className={styles.content}>
          <Metric
            label={t('ui.district.kokudaka')}
            value={model.district.kokudaka}
            max={model.district.kokudakaCap}
            unit={t('term.unit.koku')}
          />
          <Metric
            label={t('ui.district.commerce')}
            value={model.district.commerce}
            max={model.district.commerceCap}
          />
          <Metric
            label={t('ui.district.population')}
            value={model.district.population}
            max={model.district.populationCap}
            unit={t('term.unit.people')}
          />
          <Metric
            label={t('ui.district.security')}
            value={model.district.publicOrder}
            max={100}
            danger={model.district.publicOrder < 30}
          />
          {model.district.publicOrder < 30 && (
            <strong className={styles.warning}>{t('ui.district.uprisingRisk')}</strong>
          )}
          <section>
            <h3>{t('ui.district.appointSection')}</h3>
            <label>
              {t('ui.district.steward')}：
              <select
                aria-label={t('ui.district.steward')}
                value={model.district.stewardId ?? ''}
                disabled={!owned || pending}
                onChange={(event) => {
                  if (!owned || pending || activeOwner.current !== owner) return;
                  const target =
                    event.currentTarget.value === ''
                      ? null
                      : (event.currentTarget.value as OfficerId);
                  activeRequest.current = null;
                  setRequest(null);
                  if (model.district.stewardId !== null && target !== model.district.stewardId) {
                    const next = {
                      owner,
                      target,
                      previousName: model.stewardName ?? model.district.stewardId,
                    };
                    activeRequest.current = next;
                    setRequest(next);
                  } else grant(target);
                }}
              >
                <option value="">{t('ui.district.direct')}</option>
                {model.candidates.map((officer) => (
                  <option key={officer.id} value={officer.id} disabled={officer.disabled}>
                    {t('ui.district.stewardCandidateContext', {
                      name: officer.name,
                      pol: officer.pol,
                      loyalty: officer.loyalty,
                      rank: officer.rank,
                      fiefs: t('ui.reward.fiefCount', { count: officer.count, cap: officer.cap }),
                    })}
                    {officer.reason ? ` · ${officer.reason}` : ''}
                  </option>
                ))}
              </select>
            </label>
            {model.stewardName && (
              <p>{t('ui.district.currentSteward', { name: model.stewardName })}</p>
            )}
            {pending && (
              <p role="status" className={styles.hint}>
                {t('ui.district.fiefPending')}
              </p>
            )}
          </section>
          <section>
            <h3>{t('ui.district.devPolicy')}</h3>
            <div className={styles.focus}>
              {(
                [
                  ['agri', 'term.devPolicy.agri'],
                  ['commerce', 'term.devPolicy.commerce'],
                  ['barracks', 'term.devPolicy.barracks'],
                ] as const
              ).map(([focus, label]) => (
                <label key={focus}>
                  <input
                    type="radio"
                    name="develop-focus"
                    value={focus}
                    checked={model.district.developFocus === focus}
                    disabled={focusDisabled}
                    onChange={() =>
                      submit({
                        type: 'setDevelopFocus',
                        clanId: model.playerClanId,
                        districtId,
                        focus,
                      })
                    }
                  />
                  {t('ui.district.focusOption', { focus: t(label) })}
                </label>
              ))}
            </div>
            {model.district.stewardId !== null && (
              <p className={styles.hint}>{t('ui.district.stewardAutoFocus')}</p>
            )}
          </section>
          <section>
            <h3>{t('ui.district.info')}</h3>
            <p>{t('ui.district.specialtyRoad', { castle: model.castleName })}</p>
          </section>
          {feedback && (
            <p role="alert" className={styles.error}>
              {feedback}
            </p>
          )}
        </div>
      </Panel>
      <ConfirmDialog
        open={request !== null && request.owner === owner}
        title={t('ui.district.appointSection')}
        message={request ? t('cmd.fief.confirmDismiss', { name: request.previousName }) : ''}
        danger
        onCancel={() => {
          if (activeRequest.current === request) {
            activeRequest.current = null;
            setRequest(null);
          }
        }}
        onConfirm={() => {
          if (request) grant(request.target, request);
        }}
      />
    </aside>
  );
}
