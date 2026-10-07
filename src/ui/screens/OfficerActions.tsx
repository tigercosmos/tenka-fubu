import { useState } from 'react';
import {
  captiveRecruitSuccessRate,
  recruitRoninSuccessRate,
  rewardOfficerCost,
  rewardOfficerLoyaltyGain,
  officerAbilityScore,
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
  const model = useM6View();
  const officer = model.officers.find((item) => item.id === officerId);
  const [executor, setExecutor] = useState<OfficerId | ''>('');
  const [castleId, setCastleId] = useState<CastleId | ''>('');
  const [districtId, setDistrictId] = useState<DistrictId | ''>('');
  const actions = useUIStore((state) => state.actions);
  const isRonin = officer?.status === 'ronin';
  const isCaptive =
    officer?.status === 'captive' && officer.capturedByClanId === model.playerClanId;
  const gain = useGameSelector((game) => {
    const current = game.officers[officerId];
    return current === undefined
      ? []
      : (['small', 'medium', 'large'] as const).map((tier) =>
          rewardOfficerLoyaltyGain(current, tier),
        );
  });
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
            onChange={(event) => setExecutor(event.currentTarget.value as OfficerId)}
          >
            <option value="">{t('ui.common.select')}</option>
            {model.officers
              .filter(
                (item) =>
                  item.clanId === model.playerClanId &&
                  item.status === 'serving' &&
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
        <p>
          {t('ui.court.gold')} {t('ui.common.goldAmount', { value: signingCost })}
        </p>
        <CommandAction
          command={{
            type: 'recruitRonin',
            clanId: model.playerClanId,
            officerId,
            executorId: executor as OfficerId,
          }}
          label={t('cmd.officer.recruit')}
        />
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
            onChange={(event) => setDistrictId(event.currentTarget.value as DistrictId)}
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
        <CommandAction
          command={{
            type: 'grantFief',
            clanId: model.playerClanId,
            districtId: districtId as DistrictId,
            officerId,
          }}
          label={t('ui.officer.grantFief')}
        />
      </div>
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
