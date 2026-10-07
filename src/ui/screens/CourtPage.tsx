import { useState } from 'react';
import { BAL } from '@core/balance';
import {
  courtRankOrder,
  shogunateTitleOrder,
  controlsCourtCapital,
  shogunateTitleCost,
  mediationFavorCost,
} from '@core/index';
import type { ClanId } from '@core/state/ids';
import { t } from '@i18n/zh-TW';
import { CommandAction } from '../components/CommandAction';
import { useM6View } from '../hooks/useM6View';
import { useGameSelector } from '../hooks/useGameSelector';
import { DiploWork } from './DiplomacyPanel';
import styles from './M6Panel.module.css';

export function CourtPage({ target }: { target: 'court' | 'shogunate' }) {
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
    <div className={styles.columns}>
      <section>
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
        <DiploWork key={target} target={target} />
        <div className={styles.actions}>
          <CommandAction
            command={{
              type: court ? 'requestCourtRank' : 'requestShogunateTitle',
              clanId: model.playerClanId,
            }}
            label={t(court ? 'cmd.court.requestRank' : 'cmd.shogunate.requestTitle')}
          />
          {!court && (
            <CommandAction
              command={{ type: 'nominateShogun', clanId: model.playerClanId }}
              label={t('cmd.shogunate.nominate')}
              confirmation={t('ui.shogunate.nominateConfirm')}
            />
          )}
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
            <CommandAction
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
      <section>
        <h3>{t('ui.court.requirements')}</h3>
        <table className={styles.table}>
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
