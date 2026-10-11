import { BAL } from '@core/balance';
import type { GameState } from '@core/state/gameState';
import type { OfficerId } from '@core/state/ids';
import { t } from '@i18n/zh-TW';
import { StatBar, Tooltip } from '../components';
import { makeCachedSelector, useCachedGameSelector } from '../hooks/useGameSelector';
import { describeOfficerTrait } from '../officers/traitDescription';
import { rankLabel } from './OfficerList';
import styles from './CaptiveSummary.module.css';

const sessions = new WeakMap<GameState, number>();
let nextSession = 0;
const selectSummary = makeCachedSelector((game, officerId: OfficerId) => {
  const officer = game.officers[officerId];
  if (officer === undefined || officer.status !== 'captive') return null;
  let session = sessions.get(game);
  if (session === undefined) {
    session = ++nextSession;
    sessions.set(game, session);
  }
  return {
    owner: `${session}:${officer.id}`,
    clanName:
      officer.clanId === null
        ? t('ui.captive.originalClanUnknown')
        : (game.clans[officer.clanId]?.name ?? officer.clanId),
    rank: officer.rank,
    loyalty: officer.loyalty,
    stats: (['ldr', 'val', 'int', 'pol'] as const).map((stat) => ({
      stat,
      value: Math.min(BAL.abilityMax, officer[stat] + officer.statGrowth[stat]),
    })),
    traits: officer.traits.map(describeOfficerTrait).filter((trait) => trait !== null),
  };
});

export function CaptiveSummary({ officerId }: { officerId: OfficerId }) {
  const summary = useCachedGameSelector(selectSummary, officerId);
  if (summary === null) return null;
  return (
    <section className={styles.summary} data-testid="captive-summary">
      <dl className={styles.identity}>
        <div>
          <dt>{t('ui.captive.originalClan')}</dt>
          <dd>{summary.clanName}</dd>
        </div>
        <div>
          <dt>{t('ui.officer.rank')}</dt>
          <dd>{rankLabel(summary.rank)}</dd>
        </div>
        <div>
          <dt>{t('ui.captive.oldLoyalty')}</dt>
          <dd>{summary.loyalty}</dd>
        </div>
      </dl>
      <div className={styles.stats}>
        {summary.stats.map(({ stat, value }) => (
          <StatBar key={stat} label={t(`ui.officer.${stat}`)} value={value} />
        ))}
      </div>
      <h4>{t('ui.officer.traits')}</h4>
      <div className={styles.traits}>
        {summary.traits.length === 0
          ? t('ui.common.noData')
          : summary.traits.map((trait) => (
              <Tooltip
                key={`${summary.owner}:${trait.id}`}
                content={
                  <div>
                    {trait.lines.map((line, index) => (
                      <div key={index}>{line}</div>
                    ))}
                  </div>
                }
              >
                <button type="button" className={styles.trait}>
                  {trait.name}
                </button>
              </Tooltip>
            ))}
      </div>
    </section>
  );
}
