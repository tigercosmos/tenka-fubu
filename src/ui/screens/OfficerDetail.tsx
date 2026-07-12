import type { ReactElement } from 'react';
import { BAL } from '@core/balance';
import { RANK_VALUES } from '@core/state/enums';
import type { Officer } from '@core/state/gameState';
import type { OfficerId } from '@core/state/ids';
import { TRAITS } from '@core/traits';
import { formatNumber, t } from '@i18n/zh-TW';
import { Badge, EmptyState, Panel, StatBar } from '@ui/components';
import { makeCachedSelector, useCachedGameSelector } from '@ui/hooks/useGameSelector';
import { useUIStore } from '@ui/hooks/uiStore';
import { rankLabel, roleLabel, type OfficerRoleKind } from './OfficerList';
import styles from './OfficerDetail.module.css';

export interface OfficerDetailProps {
  officerId?: OfficerId;
  onClose?: () => void;
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
  const traits = officer.traits
    .map((traitId) => TRAITS[traitId])
    .filter((trait) => trait !== undefined);
  const nextThreshold = BAL.rankMeritThresholds[RANK_VALUES.indexOf(officer.rank) + 1];
  return {
    id: officer.id,
    name: officer.name,
    clanId: officer.clanId,
    clanName,
    rank: officer.rank,
    stats,
    loyalty: officer.loyalty,
    merit: officer.merit,
    age: Math.max(0, game.time.year - officer.birthYear),
    roleName,
    traits,
    fiefs,
    promotionReady: nextThreshold !== undefined && officer.merit >= nextThreshold,
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
        <section className={styles.section}>
          <h3>{t('ui.officer.traits')}</h3>
          <div className={styles.chips}>
            {model.traits.length === 0
              ? t('ui.common.noData')
              : model.traits.map((trait) => <span key={trait.id}>{t(`${trait.id}.name`)}</span>)}
          </div>
        </section>
        <section className={styles.section}>
          <h3>{t('ui.officer.fiefs')}</h3>
          <p>{model.fiefs.length === 0 ? t('ui.common.noData') : model.fiefs.join('、')}</p>
        </section>
        <section className={styles.section}>
          <h3>{t('ui.officer.history')}</h3>
          <p>{t('ui.common.noData')}</p>
        </section>
      </Panel>
    </aside>
  );
}
