import { useEffect, useState } from 'react';
import { captiveRecruitSuccessRate, officerAbilityScore } from '@core/index';
import { BAL } from '@core/balance';
import type { OfficerId } from '@core/state/ids';
import { t } from '@i18n/zh-TW';
import { Dialog } from '../components';
import { CommandAction } from '../components/CommandAction';
import { useM6View } from '../hooks/useM6View';
import { useGameSelector } from '../hooks/useGameSelector';
import { uiStore, useUIStore } from '../hooks/uiStore';
import styles from './M6Panel.module.css';

export function CaptiveModal({ officerId }: { officerId: OfficerId }) {
  const model = useM6View();
  const officer = model.officers.find((item) => item.id === officerId);
  const actions = useUIStore((state) => state.actions);
  const [executor, setExecutor] = useState<OfficerId | ''>('');
  const chance = useGameSelector((game) =>
    captiveRecruitSuccessRate(game, officerId, (executor as OfficerId) || null, model.playerClanId),
  );
  const signingCost = useGameSelector((game) =>
    game.officers[officerId] === undefined
      ? 0
      : officerAbilityScore(game.officers[officerId]) * BAL.recruitSigningBonusPerAbility,
  );
  useEffect(() => {
    if (
      (officer?.status !== 'captive' || officer.capturedByClanId !== model.playerClanId) &&
      uiStore.getState().modal?.params.officerId === officerId
    )
      actions.closeModal();
  }, [officer, officerId, model.playerClanId, actions]);
  return (
    <Dialog
      open
      title={t('ui.captive.title')}
      onClose={() => actions.closeModal()}
      dismissible={false}
    >
      <div className={styles.form} data-testid="captive-modal">
        <h3>{officer?.name ?? t('ui.common.noData')}</h3>
        <p>{t('ui.captive.consequences')}</p>
        <label>
          {t('ui.recruit.executor')}
          <select
            value={executor}
            onChange={(event) => setExecutor(event.currentTarget.value as OfficerId)}
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
        <p>
          {t('ui.court.gold')} {t('ui.common.goldAmount', { value: signingCost })}
        </p>
        <div className={styles.actions}>
          {(['recruit', 'release', 'execute'] as const).map((action) => (
            <CommandAction
              key={action}
              command={{
                type: 'handleCaptive',
                clanId: model.playerClanId,
                officerId,
                action,
                executorId: action === 'recruit' ? (executor as OfficerId) || null : null,
              }}
              label={t(`cmd.captive.${action}`)}
              {...(action === 'execute'
                ? {
                    confirmation: t('ui.captive.executeConfirm', { name: officer?.name ?? '' }),
                    danger: true,
                  }
                : {})}
              onSubmitted={() => {
                actions.markDecisionQueued(officerId);
                actions.closeModal();
              }}
            />
          ))}
        </div>
      </div>
    </Dialog>
  );
}
