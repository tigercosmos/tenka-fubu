import type { ReactElement } from 'react';
import { BAL } from '@core/balance';
import { getOfficerTacticIds } from '@core/index';
import { TACTICS } from '@core/tactics';
import { RANK_VALUES } from '@core/state/enums';
import type { Officer } from '@core/state/gameState';
import type { OfficerId } from '@core/state/ids';
import { formatNumber, formatDate, t } from '@i18n/zh-TW';
import { Badge, EmptyState, Panel, ProgressBar, StatBar, Tooltip } from '@ui/components';
import { makeCachedSelector, useCachedGameSelector } from '@ui/hooks/useGameSelector';
import { useUIStore } from '@ui/hooks/uiStore';
import { rankLabel, roleLabel, type OfficerRoleKind } from './OfficerList';
import styles from './OfficerDetail.module.css';
import { OfficerActions } from './OfficerActions';
import { renderReport } from '../reports/renderReport';
import { describeOfficerTrait } from '../officers/traitDescription';

export interface OfficerDetailProps {
  officerId?: OfficerId;
  onClose?: () => void;
}

// Presentation ownership survives ordinary ticks, but never a game replacement.
// Weak keys do not retain retired sessions.
const traitSessions = new WeakMap<object, number>();
let nextTraitSession = 0;
function traitSessionKey(game: object): number {
  let key = traitSessions.get(game);
  if (key === undefined) {
    key = ++nextTraitSession;
    traitSessions.set(game, key);
  }
  return key;
}

function effectiveStats(officer: Officer) {
  return {
    ldr: Math.min(BAL.abilityMax, officer.ldr + officer.statGrowth.ldr),
    val: Math.min(BAL.abilityMax, officer.val + officer.statGrowth.val),
    int: Math.min(BAL.abilityMax, officer.int + officer.statGrowth.int),
    pol: Math.min(BAL.abilityMax, officer.pol + officer.statGrowth.pol),
  };
}

const selectOfficerDetail = makeCachedSelector((game, resolvedOfficerId: OfficerId | undefined) => {
  const officer = resolvedOfficerId === undefined ? undefined : game.officers[resolvedOfficerId];
  if (officer === undefined) return null;
  const clanName = officer.clanId === null ? '' : (game.clans[officer.clanId]?.name ?? '');
  const stats = effectiveStats(officer);
  let role: OfficerRoleKind = 'none';
  let roleName = roleLabel(role);
  const lordCastle = Object.values(game.castles).find((castle) => castle.lordId === officer.id);
  const stewardDistrict = Object.values(game.districts).find(
    (district) => district.stewardId === officer.id,
  );
  const ledCorps = Object.values(game.corps).find((corps) => corps.corpsLeaderId === officer.id);
  if (lordCastle !== undefined) {
    role = 'lord';
    roleName = `${lordCastle.name}${roleLabel(role)}`;
  } else if (stewardDistrict !== undefined) {
    role = 'steward';
    roleName = `${stewardDistrict.name}${roleLabel(role)}`;
  } else if (ledCorps !== undefined) {
    role = 'corpsLeader';
    roleName = roleLabel(role);
  }
  const fiefs = Object.values(game.districts)
    .filter((district) => district.stewardId === officer.id)
    .map((district) => district.name)
    .sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  const traits = officer.traits.map(describeOfficerTrait).filter((trait) => trait !== null);
  const nextThreshold = BAL.rankMeritThresholds[RANK_VALUES.indexOf(officer.rank) + 1];
  return {
    traitOwner: `${traitSessionKey(game)}:${officer.id}`,
    id: officer.id,
    name: officer.name,
    clanId: officer.clanId,
    clanName,
    rank: officer.rank,
    stats,
    growth: (['ldr', 'val', 'int', 'pol'] as const).map((stat) => ({
      stat,
      base: officer[stat],
      gained: officer.statGrowth[stat],
      experience: officer.statExp[stat],
    })),
    loyalty: officer.loyalty,
    merit: officer.merit,
    age: Math.max(0, game.time.year - officer.birthYear),
    roleName,
    traits,
    tactics: getOfficerTacticIds(game, [officer.id]).map((id) => ({
      id,
      label: t('ui.march.tacticCost', { name: t(`${id}.name`), cost: TACTICS[id]!.saihaiCost }),
    })),
    fiefs,
    promotionReady: nextThreshold !== undefined && officer.merit >= nextThreshold,
    history: game.reports
      .filter(
        (report) =>
          ('officerId' in report.event && report.event.officerId === officer.id) ||
          ('targetOfficerId' in report.event && report.event.targetOfficerId === officer.id),
      )
      .slice(0, 5)
      .map((report) => ({
        id: report.id,
        text: renderReport(report.event, game, game.meta.playerClanId),
        day: report.day,
      })),
  };
});

export function OfficerDetail({ officerId, onClose }: OfficerDetailProps): ReactElement {
  const stackedOfficerId = useUIStore((state) => {
    const panel = [...state.panelStack]
      .reverse()
      .find((candidate) => candidate.id === 'officerDetail');
    return panel?.params.officerId as OfficerId | undefined;
  });
  const actions = useUIStore((state) => state.actions);
  const resolvedOfficerId = officerId ?? stackedOfficerId;
  const model = useCachedGameSelector(selectOfficerDetail, resolvedOfficerId);

  const close = onClose ?? (() => actions.closePanelById('officerDetail'));
  if (model === null) {
    return (
      <aside className={styles.detail} data-testid="officer-detail">
        <Panel title={t('ui.officers.title')} onClose={close}>
          <EmptyState text={t('ui.common.noData')} />
        </Panel>
      </aside>
    );
  }

  return (
    <aside className={styles.detail} data-testid="officer-detail">
      <Panel title={`${model.name}・${model.clanName}・${rankLabel(model.rank)}`} onClose={close}>
        <div className={styles.identity}>
          <Badge clanId={model.clanId} label={model.clanName} />
          {model.promotionReady && (
            <span className={styles.ready}>{t('ui.officer.meritReady')}</span>
          )}
        </div>
        <div className={styles.stats}>
          <StatBar label={t('ui.officer.ldr')} value={model.stats.ldr} width={260} />
          <StatBar label={t('ui.officer.val')} value={model.stats.val} width={260} />
          <StatBar label={t('ui.officer.int')} value={model.stats.int} width={260} />
          <StatBar label={t('ui.officer.pol')} value={model.stats.pol} width={260} />
        </div>
        <section className={styles.section}>
          <h3>{t('ui.officer.growthTitle')}</h3>
          <div className={styles.growth}>
            {model.growth.map(({ stat, base, gained, experience }) => {
              const capped = gained >= BAL.statGrowthCap;
              const label = t(capped ? 'ui.officer.growthCapped' : 'ui.officer.growthExperience', {
                stat: t(`ui.officer.${stat}`),
              });
              return (
                <div key={stat}>
                  <p>{label}</p>
                  <ProgressBar
                    value={capped ? gained : experience}
                    max={capped ? BAL.statGrowthCap : BAL.statExpPerPoint}
                    ariaLabel={label}
                  />
                  <p className={styles.growthSummary}>
                    {t('ui.officer.growthSummary', {
                      base,
                      growth: gained,
                      cap: BAL.statGrowthCap,
                    })}
                  </p>
                </div>
              );
            })}
          </div>
        </section>
        <dl className={styles.summary}>
          <div>
            <dt>{t('ui.officer.loyalty')}</dt>
            <dd className={model.loyalty < 30 ? styles.risk : undefined}>
              {formatNumber(model.loyalty)}
            </dd>
          </div>
          <div>
            <dt>{t('ui.officer.merit')}</dt>
            <dd>{formatNumber(model.merit)}</dd>
          </div>
          <div>
            <dt>{t('ui.officer.age')}</dt>
            <dd>{formatNumber(model.age)}</dd>
          </div>
          <div>
            <dt>{t('ui.officer.rank')}</dt>
            <dd>{rankLabel(model.rank)}</dd>
          </div>
          <div>
            <dt>{t('ui.officer.role')}</dt>
            <dd>{model.roleName}</dd>
          </div>
        </dl>
        <section
          className={styles.section}
          aria-label={t('ui.march.officerTactics', { tactics: '' })}
        >
          <h3>{t('ui.march.officerTactics', { tactics: '' })}</h3>
          <ul className={styles.tactics}>
            {model.tactics.map((tactic) => (
              <li key={tactic.id}>{tactic.label}</li>
            ))}
          </ul>
          <p className={styles.tacticNote}>{t('ui.march.tacticPreviewNote')}</p>
        </section>
        <section className={styles.section}>
          <h3>{t('ui.officer.traits')}</h3>
          <div className={styles.chips}>
            {model.traits.length === 0
              ? t('ui.common.noData')
              : model.traits.map((trait) => (
                  <Tooltip
                    key={`${model.traitOwner}:${trait.id}`}
                    content={
                      <div className={styles.traitTooltip}>
                        {trait.lines.map((line, index) => (
                          <div key={index}>{line}</div>
                        ))}
                      </div>
                    }
                  >
                    <span tabIndex={0}>{trait.name}</span>
                  </Tooltip>
                ))}
          </div>
        </section>
        <section className={styles.section}>
          <h3>{t('ui.officer.fiefs')}</h3>
          <p>{model.fiefs.length === 0 ? t('ui.common.noData') : model.fiefs.join('、')}</p>
        </section>
        <section className={styles.section}>
          <h3>{t('ui.officer.history')}</h3>
          {model.history.length === 0 ? (
            <p>{t('ui.common.noData')}</p>
          ) : (
            <ul>
              {model.history.map((report) => (
                <li key={report.id}>
                  {formatDate(report.day)} · {report.text}
                </li>
              ))}
            </ul>
          )}
        </section>
        <div className={styles.assignments}>
          <OfficerActions officerId={model.id} />
        </div>
      </Panel>
    </aside>
  );
}
