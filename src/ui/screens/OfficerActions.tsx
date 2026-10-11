import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';
import { store } from '@app/store';
import { dispatchCommand, getQueuedPlayerCommands } from '@app/bridge';
import { REJECT_REASONS } from '@core/commands/reasons';
import type { GameState } from '@core/state/gameState';
import {
  captiveRecruitSuccessRate,
  recruitRoninSuccessRate,
  rewardOfficerCost,
  rewardOfficerLoyaltyGain,
  officerAbilityScore,
  validateCommand,
} from '@core/index';
import { BAL } from '@core/balance';
import type { OfficerId, CastleId, DistrictId } from '@core/state/ids';
import { t } from '@i18n/zh-TW';
import { CommandAction } from '../components/CommandAction';
import { useM6View } from '../hooks/useM6View';
import { useGameSelector } from '../hooks/useGameSelector';
import { useUIStore } from '../hooks/uiStore';
import styles from './M6Panel.module.css';

export function OfficerActions({ officerId }: { officerId: OfficerId }) {
  const game = useStore(store, (state) => state.game);
  useStore(store, (state) => state.session.pendingCommandCount);
  const model = useM6View();
  const officer = model.officers.find((item) => item.id === officerId);
  const [recruitDraft, setRecruitDraft] = useState<{
    game: GameState;
    officerId: OfficerId;
    target: GameState['officers'][OfficerId];
    castleId: CastleId | null;
    executorId: OfficerId;
  } | null>(null);
  const target = game?.officers[officerId];
  const executor =
    recruitDraft?.game === game &&
    recruitDraft.officerId === officerId &&
    recruitDraft.target === target &&
    recruitDraft.castleId === target?.locationCastleId
      ? recruitDraft.executorId
      : '';
  const recruitExecutor = executor === '' ? undefined : game?.officers[executor];
  const recruitCastle = target?.locationCastleId
    ? game?.castles[target.locationCastleId]
    : undefined;
  const recruitPanel = useUIStore((state) =>
    state.panelStack.find((item) => item.id === 'officerDetail'),
  );
  const recruitOwner = useMemo(
    () => ({ game, officerId, target, executor, recruitExecutor, recruitCastle, recruitPanel }),
    [game, officerId, target, executor, recruitExecutor, recruitCastle, recruitPanel],
  );
  const activeRecruitOwner = useRef<typeof recruitOwner | null>(null);
  useLayoutEffect(() => {
    activeRecruitOwner.current = recruitOwner;
    return () => {
      if (activeRecruitOwner.current === recruitOwner) activeRecruitOwner.current = null;
    };
  }, [recruitOwner]);
  const pendingRecruit =
    game !== null &&
    getQueuedPlayerCommands(game).some(
      (command) => command.type === 'recruitRonin' && command.officerId === officerId,
    );
  const [castleId, setCastleId] = useState<CastleId | ''>('');
  const [fiefDraft, setFiefDraft] = useState<{
    game: GameState;
    officerId: OfficerId;
    districtId: DistrictId;
  } | null>(null);
  const districtId =
    fiefDraft?.game === game && fiefDraft.officerId === officerId ? fiefDraft.districtId : '';
  const selectedDistrict = model.districts.find((district) => district.id === districtId);
  const oldStewardId = selectedDistrict?.stewardId ?? null;
  const fiefOfficer = game?.officers[officerId];
  const fiefDistrict = districtId === '' ? undefined : game?.districts[districtId];
  const pendingFief =
    game !== null &&
    districtId !== '' &&
    getQueuedPlayerCommands(game).some(
      (command) => command.type === 'grantFief' && command.districtId === districtId,
    );
  const fiefOwner = useMemo(
    () => ({
      game,
      officerId,
      districtId,
      oldStewardId,
      officer: fiefOfficer,
      district: fiefDistrict,
    }),
    [game, officerId, districtId, oldStewardId, fiefOfficer, fiefDistrict],
  );
  const [fiefScope, setFiefScope] = useState({ owner: fiefOwner, revision: 0 });
  if (fiefScope.owner !== fiefOwner)
    setFiefScope({ owner: fiefOwner, revision: fiefScope.revision + 1 });
  const activeFiefOwner = useRef<typeof fiefOwner | null>(null);
  useLayoutEffect(() => {
    activeFiefOwner.current = fiefOwner;
    return () => {
      if (activeFiefOwner.current === fiefOwner) activeFiefOwner.current = null;
    };
  }, [fiefOwner]);
  const actions = useUIStore((state) => state.actions);
  const isRonin = officer?.status === 'ronin';
  const isCaptive =
    officer?.status === 'captive' && officer.capturedByClanId === model.playerClanId;
  const gain = useGameSelector((game) => {
    const current = game.officers[officerId];
    return current === undefined
      ? []
      : (['small', 'medium', 'large'] as const).map((tier) =>
          Math.min(rewardOfficerLoyaltyGain(current, tier), 100 - current.loyalty),
        );
  });
  const rewardGiftsThisYear = useGameSelector(
    (game) => game.officers[officerId]?.rewardGiftsThisYear ?? 0,
  );
  const signingCost = useGameSelector((game) =>
    game.officers[officerId] === undefined
      ? 0
      : officerAbilityScore(game.officers[officerId]) * BAL.recruitSigningBonusPerAbility,
  );
  const chance = useGameSelector((game) =>
    isRonin
      ? recruitRoninSuccessRate(game, officerId, executor as OfficerId, model.playerClanId)
      : isCaptive
        ? captiveRecruitSuccessRate(
            game,
            officerId,
            (executor as OfficerId) || null,
            model.playerClanId,
          )
        : 0,
  );
  if (officer === undefined) return null;
  if (isCaptive)
    return (
      <button
        type="button"
        onClick={() =>
          actions.enqueueModal({ id: 'captive', params: { officerId }, pausesTime: true })
        }
      >
        {t('ui.captive.title')}
      </button>
    );
  if (isRonin)
    return (
      <section className={styles.form}>
        <h3>{t('ui.recruit.title')}</h3>
        <label>
          {t('ui.recruit.executor')}
          <select
            value={executor}
            disabled={pendingRecruit}
            onChange={(event) => {
              if (game && target)
                setRecruitDraft({
                  game,
                  officerId,
                  target,
                  castleId: target.locationCastleId,
                  executorId: event.currentTarget.value as OfficerId,
                });
            }}
          >
            <option value="">{t('ui.common.select')}</option>
            {model.officers
              .filter(
                (item) =>
                  item.clanId === model.playerClanId &&
                  item.status === 'serving' &&
                  item.armyId === null &&
                  item.locationCastleId === officer.locationCastleId,
              )
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </label>
        <p>{t('ui.plot.chance', { chance: Math.round(chance * 100) })}</p>
        <p>{t('ui.recruit.attemptCost', { value: BAL.recruitAttemptCost })}</p>
        <p>{t('ui.recruit.signingCost', { value: signingCost })}</p>
        {pendingRecruit ? (
          <>
            <button type="button" disabled>
              {t('cmd.officer.recruit')}
            </button>
            <p role="status">{t('ui.recruit.pending')}</p>
          </>
        ) : (
          <CommandAction
            command={{
              type: 'recruitRonin',
              clanId: model.playerClanId,
              officerId,
              executorId: executor as OfficerId,
            }}
            label={t('cmd.officer.recruit')}
            onCommand={(command) => {
              const current = store.getState();
              if (
                activeRecruitOwner.current !== recruitOwner ||
                game === null ||
                current.game !== game ||
                useUIStore.getState().panelStack.find((item) => item.id === 'officerDetail') !==
                  recruitPanel ||
                current.session.screen !== 'main' ||
                current.session.fatalError !== null ||
                useUIStore.getState().modal !== null ||
                document.querySelector('[data-ui-dialog]') !== null ||
                current.session.viewportBlocked ||
                game.meta.gameOver !== null ||
                target === undefined ||
                recruitExecutor === undefined ||
                game.officers[officerId] !== target ||
                game.officers[recruitExecutor.id] !== recruitExecutor ||
                !target.hasComeOfAge ||
                target.status !== 'ronin' ||
                !recruitExecutor.hasComeOfAge ||
                recruitExecutor.status !== 'serving' ||
                recruitExecutor.clanId !== game.meta.playerClanId ||
                recruitExecutor.armyId !== null ||
                target.locationCastleId === null ||
                recruitExecutor.locationCastleId !== target.locationCastleId ||
                game.castles[target.locationCastleId] !== recruitCastle ||
                recruitCastle?.ownerClanId !== game.meta.playerClanId ||
                getQueuedPlayerCommands(game).some(
                  (pending) => pending.type === 'recruitRonin' && pending.officerId === officerId,
                )
              )
                return { ok: false, reason: REJECT_REASONS.invalidTarget };
              const validation = validateCommand(game, command);
              if (!validation.ok)
                return {
                  ok: false,
                  reason: validation.reasonKey,
                  ...(validation.params === undefined ? {} : { params: validation.params }),
                };
              return dispatchCommand(command);
            }}
          />
        )}
      </section>
    );
  if (officer.clanId !== model.playerClanId)
    return (
      <button
        type="button"
        onClick={() =>
          actions.openPanel('plot', {
            kind: 'poach',
            targetClanId: officer.clanId ?? '',
            targetId: officerId,
          })
        }
      >
        {t('ui.plot.title')}
      </button>
    );
  return (
    <section>
      <h3>{t('ui.officer.actions')}</h3>
      <div className={styles.form}>
        <label>
          {t('ui.officer.appointCastle')}
          <select
            value={castleId}
            onChange={(event) => setCastleId(event.currentTarget.value as CastleId)}
          >
            <option value="">{t('ui.common.select')}</option>
            {model.castles
              .filter((castle) => castle.ownerClanId === model.playerClanId)
              .map((castle) => (
                <option key={castle.id} value={castle.id}>
                  {castle.name}
                </option>
              ))}
          </select>
        </label>
        <CommandAction
          command={{
            type: 'appointLord',
            clanId: model.playerClanId,
            castleId: castleId as CastleId,
            officerId,
          }}
          label={t('ui.officer.appointLord')}
        />
        <label>
          {t('ui.officer.appointDistrict')}
          <select
            value={districtId}
            onChange={(event) => {
              if (game)
                setFiefDraft({
                  game,
                  officerId,
                  districtId: event.currentTarget.value as DistrictId,
                });
            }}
          >
            <option value="">{t('ui.common.select')}</option>
            {model.districts
              .filter((district) => district.ownerClanId === model.playerClanId)
              .map((district) => (
                <option key={district.id} value={district.id}>
                  {district.name}
                </option>
              ))}
          </select>
        </label>
        {pendingFief ? (
          <>
            <button type="button" disabled>
              {t('ui.officer.grantFief')}
            </button>
            <p role="status">{t('ui.reward.fiefPending')}</p>
          </>
        ) : (
          <CommandAction
            key={fiefScope.revision}
            {...(oldStewardId !== null && oldStewardId !== officerId
              ? {
                  confirmation: t('cmd.fief.confirmDismiss', {
                    name:
                      model.officers.find((item) => item.id === oldStewardId)?.name ?? oldStewardId,
                  }),
                }
              : {})}
            command={{
              type: 'grantFief',
              clanId: model.playerClanId,
              districtId: districtId as DistrictId,
              officerId,
            }}
            label={t('ui.officer.grantFief')}
            onCommand={(command) => {
              const current = store.getState();
              if (
                activeFiefOwner.current !== fiefOwner ||
                game === null ||
                current.game !== game ||
                current.session.screen !== 'main' ||
                current.session.fatalError !== null ||
                current.session.viewportBlocked ||
                game.meta.gameOver !== null ||
                districtId === '' ||
                game.officers[officerId] !== fiefOwner.officer ||
                game.districts[districtId] !== fiefOwner.district ||
                game.districts[districtId]?.stewardId !== oldStewardId ||
                getQueuedPlayerCommands(game).some(
                  (pending) => pending.type === 'grantFief' && pending.districtId === districtId,
                )
              )
                return { ok: false, reason: REJECT_REASONS.invalidTarget };
              return dispatchCommand(command);
            }}
          />
        )}
      </div>
      <p>{t('ui.officer.rewardGiftsThisYear', { count: rewardGiftsThisYear })}</p>
      <div className={styles.actions}>
        {(['small', 'medium', 'large'] as const).map((tier, index) => (
          <CommandAction
            key={tier}
            command={{ type: 'rewardOfficer', clanId: model.playerClanId, officerId, tier }}
            label={t('ui.officer.rewardOffer', {
              tier: t(`term.reward.${tier}`),
              gold: rewardOfficerCost(tier),
              loyalty: gain[index] ?? 0,
            })}
          />
        ))}
        <CommandAction
          command={{ type: 'promoteRank', clanId: model.playerClanId, officerId }}
          label={t('cmd.officer.promote')}
        />
      </div>
    </section>
  );
}
