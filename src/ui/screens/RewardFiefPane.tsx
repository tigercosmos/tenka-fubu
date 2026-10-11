import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { store } from '@app/store';
import { dispatchCommand, getQueuedPlayerCommands } from '@app/bridge';
import type { GameState } from '@core/state/gameState';
import type { DistrictId, OfficerId } from '@core/state/ids';
import { REJECT_REASONS } from '@core/commands/reasons';
import { BAL } from '@core/balance';
import { RANK_VALUES } from '@core/state/enums';
import { getEffectiveOfficerStat } from '@core/index';
import { t } from '@i18n/zh-TW';
import { CommandAction } from '../components/CommandAction';
import { makeCachedSelector, useCachedGameSelector } from '../hooks/useGameSelector';
import styles from './RewardFiefPane.module.css';
import { rankLabel } from './OfficerList';

export interface RewardFiefPaneProps {
  officerId: OfficerId;
  onBack: () => void;
  /** Parent-owned dialog/session authority; checked again at actual submission. */
  canSubmit?: () => boolean;
}
const selectModel = makeCachedSelector((game: GameState, officerId: OfficerId) => {
  const officer = game.officers[officerId];
  const eligible =
    officer?.hasComeOfAge === true &&
    officer.status === 'serving' &&
    officer.clanId === game.meta.playerClanId;
  return {
    playerClanId: game.meta.playerClanId,
    name: eligible ? officer.name : null,
    rank: eligible ? rankLabel(officer.rank) : '',
    pol: eligible ? getEffectiveOfficerStat(officer, 'pol') : 0,
    loyalty: eligible ? officer.loyalty : 0,
    cap: eligible ? (BAL.fiefMaxByRank[RANK_VALUES.indexOf(officer.rank)] ?? 0) : 0,
    fiefs: Object.values(game.districts)
      .filter((d) => d.stewardId === officerId)
      .map((d) => ({
        id: d.id,
        name: d.name,
        castle: game.castles[d.castleId]?.name ?? d.castleId,
      })),
    choices: Object.values(game.districts)
      .filter((d) => d.ownerClanId === game.meta.playerClanId)
      .map((d) => ({
        id: d.id,
        name: d.name,
        castle: game.castles[d.castleId]?.name ?? d.castleId,
        stewardId: d.stewardId,
        stewardName:
          d.stewardId === null
            ? t('ui.district.direct')
            : (game.officers[d.stewardId]?.name ?? d.stewardId),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  };
});

/** Same-owner navigation only; actual assignment remains a queued, centrally validated command. */
export function RewardFiefPane({ officerId, onBack, canSubmit }: RewardFiefPaneProps) {
  const game = useStore(store, (state) => state.game);
  useStore(store, (state) => state.session.pendingCommandCount);
  const model = useCachedGameSelector(selectModel, officerId);
  const [draft, setDraft] = useState<{
    game: GameState;
    officerId: OfficerId;
    districtId: DistrictId;
  } | null>(null);
  const selected =
    draft?.game === game &&
    draft.officerId === officerId &&
    model.choices.some((d) => d.id === draft.districtId)
      ? draft.districtId
      : model.choices[0]?.id;
  const pending =
    game !== null &&
    getQueuedPlayerCommands(game).some(
      (cmd) => cmd.type === 'grantFief' && cmd.districtId === selected,
    );
  const selectedDistrict = model.choices.find((d) => d.id === selected);
  const stewardId = selectedDistrict?.stewardId ?? null;
  const owner = useMemo(
    () => ({ game, officerId, selected, stewardId }),
    [game, officerId, selected, stewardId],
  );
  // Changing the consent subject discards CommandAction's open confirmation, including same-ID replacement games.
  const [actionScope, setActionScope] = useState({ owner, revision: 0 });
  if (actionScope.owner !== owner) setActionScope({ owner, revision: actionScope.revision + 1 });
  const activeOwner = useRef<typeof owner | null>(null);
  useLayoutEffect(() => {
    activeOwner.current = owner;
    return () => {
      if (activeOwner.current === owner) activeOwner.current = null;
    };
  }, [owner]);
  return (
    <section className={styles.pane} data-testid="reward-fief-pane">
      <header>
        <h3>{t('ui.reward.fiefTitle')}</h3>
        <button
          type="button"
          onClick={() => {
            activeOwner.current = null;
            onBack();
          }}
        >
          {t('ui.common.back')}
        </button>
      </header>
      {model.name === null ? (
        <p>{t('ui.reward.fiefUnavailable')}</p>
      ) : (
        <>
          <strong>{model.name}</strong>
          <dl className={styles.context} data-testid="reward-fief-context">
            <dt>{t('ui.officer.rank')}</dt>
            <dd>{model.rank}</dd>
            <dt>{t('ui.officer.pol')}</dt>
            <dd>{model.pol}</dd>
            <dt>{t('ui.officer.loyalty')}</dt>
            <dd>{model.loyalty}</dd>
            <dt>{t('ui.reward.fiefCurrent')}</dt>
            <dd>{t('ui.reward.fiefCount', { count: model.fiefs.length, cap: model.cap })}</dd>
          </dl>
          <section aria-label={t('ui.reward.fiefCurrent')} data-testid="reward-fief-current">
            <h4>{t('ui.reward.fiefCurrent')}</h4>
            {model.fiefs.length === 0 ? (
              <p>{t('ui.common.noData')}</p>
            ) : (
              <ul>
                {model.fiefs.map((d) => (
                  <li key={d.id}>
                    {d.castle} · {d.name}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <label>
            {t('ui.reward.fiefDistrict')}
            <select
              aria-label={t('ui.reward.fiefDistrict')}
              value={selected ?? ''}
              disabled={pending || selected === undefined}
              onChange={(event) => {
                if (game)
                  setDraft({
                    game,
                    officerId,
                    districtId: event.currentTarget.value as DistrictId,
                  });
              }}
            >
              {model.choices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.castle} · {d.name} · {t('ui.district.steward')}：{d.stewardName}
                </option>
              ))}
            </select>
          </label>
          {pending ? (
            <>
              <button type="button" disabled>
                {t('ui.reward.fiefAssign')}
              </button>
              <p role="status">{t('ui.reward.fiefPending')}</p>
            </>
          ) : selected === undefined ? (
            <p>{t('ui.common.noData')}</p>
          ) : (
            <CommandAction
              key={actionScope.revision}
              label={t('ui.reward.fiefAssign')}
              {...(stewardId !== null && stewardId !== officerId
                ? {
                    confirmation: t('cmd.fief.confirmDismiss', {
                      name: selectedDistrict?.stewardName ?? stewardId,
                    }),
                  }
                : {})}
              command={{
                type: 'grantFief',
                clanId: model.playerClanId,
                districtId: selected,
                officerId,
              }}
              onCommand={(command) => {
                if (
                  (canSubmit !== undefined && !canSubmit()) ||
                  activeOwner.current !== owner ||
                  game === null ||
                  store.getState().game !== game ||
                  store.getState().session.screen !== 'main' ||
                  store.getState().session.fatalError !== null ||
                  store.getState().session.viewportBlocked ||
                  game.districts[selected]?.stewardId !== stewardId ||
                  getQueuedPlayerCommands(game).some(
                    (cmd) => cmd.type === 'grantFief' && cmd.districtId === selected,
                  )
                )
                  return { ok: false, reason: REJECT_REASONS.invalidTarget };
                return dispatchCommand(command);
              }}
            />
          )}
        </>
      )}
    </section>
  );
}
