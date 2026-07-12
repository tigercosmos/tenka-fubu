import { useState, type ReactElement } from 'react';
import { dispatchCommand, type CommandDispatchResult } from '@app/bridge';
import type { Command } from '@core/commands/types';
import { validateGrantFief } from '@core/commands/domesticCommands';
import type { DistrictId, OfficerId } from '@core/state/ids';
import { formatNumber, t } from '@i18n/zh-TW';
import { Panel } from '@ui/components';
import { makeCachedSelector, useCachedGameSelector } from '@ui/hooks/useGameSelector';
import { uiStore } from '@ui/hooks/uiStore';
import styles from './DistrictPanel.module.css';

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
        officer.clanId === district.ownerClanId &&
        officer.locationCastleId === district.castleId &&
        officer.armyId === null &&
        officer.id !== clan?.leaderId,
    )
    .sort((a, b) => b.pol - a.pol || b.loyalty - a.loyalty || a.id.localeCompare(b.id))
    .map((officer) => ({
      id: officer.id,
      name: officer.name,
      pol: officer.pol,
      loyalty: officer.loyalty,
      disabled: !validateGrantFief(game, {
        type: 'grantFief',
        clanId: district.ownerClanId,
        districtId,
        officerId: officer.id,
      }).ok,
    }));
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
  const [feedback, setFeedback] = useState<string | null>(null);
  if (!model) return null;
  const owned = model.district.ownerClanId === model.playerClanId;
  const submit = (command: Command) => {
    const result = onCommand(command);
    setFeedback(result && !result.ok ? result.reason : null);
  };
  const close = onClose ?? (() => uiStore.getState().actions.closePanelById('district'));
  const focusDisabled = !owned || model.district.stewardId !== null;
  return (
    <aside className={styles.anchor} data-testid="district-panel">
      <Panel
        title={t('ui.district.title', {
          district: model.district.name,
          castle: model.castleName,
          clan: model.clanName,
        })}
        onClose={close}
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
                disabled={!owned}
                onChange={(event) =>
                  submit({
                    type: 'grantFief',
                    clanId: model.playerClanId,
                    districtId,
                    officerId:
                      event.currentTarget.value === ''
                        ? null
                        : (event.currentTarget.value as OfficerId),
                  })
                }
              >
                <option value="">{t('ui.district.direct')}</option>
                {model.candidates.map((officer) => (
                  <option key={officer.id} value={officer.id} disabled={officer.disabled}>
                    {t('ui.district.stewardCandidate', {
                      name: officer.name,
                      pol: officer.pol,
                      loyalty: officer.loyalty,
                    })}
                  </option>
                ))}
              </select>
            </label>
            {model.stewardName && (
              <p>{t('ui.district.currentSteward', { name: model.stewardName })}</p>
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
              {t(feedback)}
            </p>
          )}
        </div>
      </Panel>
    </aside>
  );
}
