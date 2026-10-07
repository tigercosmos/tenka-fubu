import { t } from '@i18n/zh-TW';
import { useM6View } from '../hooks/useM6View';
import { useUIStore } from '../hooks/uiStore';
import { M6Panel } from './M6Panel';
import styles from './M6Panel.module.css';

export function RecruitPanel() {
  const model = useM6View();
  const actions = useUIStore((state) => state.actions);
  const officers = model.officers.filter(
    (officer) =>
      officer.status === 'ronin' ||
      (officer.status === 'captive' && officer.capturedByClanId === model.playerClanId),
  );
  return (
    <M6Panel
      title={t('ui.recruit.title')}
      testId="recruit-panel"
      onClose={() => actions.closePanelById('ronin')}
    >
      <div className={styles.list}>
        {officers.length === 0 && <p>{t('ui.common.noData')}</p>}
        {officers.map((officer) => (
          <button
            type="button"
            key={officer.id}
            onClick={() =>
              officer.status === 'captive'
                ? actions.enqueueModal({
                    id: 'captive',
                    params: { officerId: officer.id },
                    pausesTime: true,
                  })
                : actions.openPanel('officerDetail', { officerId: officer.id })
            }
          >
            {officer.name} ·{' '}
            {t(officer.status === 'captive' ? 'ui.captive.title' : 'ui.recruit.ronin')} ·{' '}
            {model.castles.find((castle) => castle.id === officer.locationCastleId)?.name ??
              t('ui.common.noData')}
          </button>
        ))}
      </div>
    </M6Panel>
  );
}
