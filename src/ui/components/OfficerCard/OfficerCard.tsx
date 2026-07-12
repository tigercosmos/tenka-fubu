import type { OfficerId } from '@core/state/ids';
import { t } from '@i18n/zh-TW';
import { useGameSelector } from '@ui/hooks/useGameSelector';
import { Badge } from '../Badge/Badge';
import { StatBar } from '../StatBar/StatBar';
import { Tooltip } from '../Tooltip/Tooltip';
import styles from './OfficerCard.module.css';
export type OfficerCardSize = 'sm' | 'md' | 'lg';
export interface OfficerCardProps {
  officerId: OfficerId;
  size?: OfficerCardSize;
  selected?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  showLoyalty?: boolean;
  onClick?: (id: OfficerId) => void;
}
const rankKey: Record<string, string> = {
  kumigashira: 'term.rank.ashigaruKumigashira',
  'ashigaru-taisho': 'term.rank.ashigaruTaisho',
  'samurai-taisho': 'term.rank.samuraiTaisho',
  busho: 'term.rank.busho',
  karo: 'term.rank.karo',
  shukuro: 'term.rank.shukuro',
};
export function OfficerCard({
  officerId,
  size = 'md',
  selected = false,
  disabled = false,
  disabledReason,
  showLoyalty = true,
  onClick,
}: OfficerCardProps) {
  const model = useGameSelector((game) => {
    const officer = game.officers[officerId];
    if (officer === undefined) return null;
    let title: string | undefined;
    for (const castle of Object.values(game.castles))
      if (castle.lordId === officerId) {
        title = t('term.title.lord');
        break;
      }
    if (title === undefined)
      for (const district of Object.values(game.districts))
        if (district.stewardId === officerId) {
          title = t('term.title.steward');
          break;
        }
    if (title === undefined)
      for (const corps of Object.values(game.corps))
        if (corps.corpsLeaderId === officerId) {
          title = t('term.title.corpsLeader');
          break;
        }
    return { officer, title };
  });
  if (model === null) return null;
  const { officer, title } = model;
  const activate = () => {
    if (!disabled) onClick?.(officerId);
  };
  const card = (
    <div
      className={`${styles.card} ${styles[size]} ${selected ? styles.selected : ''}`}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick && !disabled ? 0 : undefined}
      aria-disabled={disabled}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      }}
    >
      <div className={styles.heading}>
        <Badge clanId={officer.clanId} />
        <strong>{officer.name}</strong>
        {size !== 'sm' && <span>{t(rankKey[officer.rank] ?? `term.rank.${officer.rank}`)}</span>}
      </div>
      {size === 'sm' ? (
        <span className={styles.primary}>{officer.ldr}</span>
      ) : (
        <>
          <div className={styles.stats}>
            <span>
              {t('ui.officer.ldr')} {officer.ldr}
            </span>
            <span>
              {t('ui.officer.val')} {officer.val}
            </span>
            <span>
              {t('ui.officer.int')} {officer.int}
            </span>
            <span>
              {t('ui.officer.pol')} {officer.pol}
            </span>
          </div>
          {showLoyalty && (
            <span className={officer.loyalty < 30 ? styles.low : ''}>
              {t('ui.officer.loyalty')} {officer.loyalty}
            </span>
          )}
          {size === 'lg' && (
            <div className={styles.detail}>
              <StatBar label={t('ui.officer.ldr')} value={officer.ldr} />
              <StatBar label={t('ui.officer.val')} value={officer.val} />
              <StatBar label={t('ui.officer.int')} value={officer.int} />
              <StatBar label={t('ui.officer.pol')} value={officer.pol} />
              <div className={styles.traits}>
                {officer.traits.slice(0, 3).map((id) => (
                  <span key={id}>{t(`${id}.name`)}</span>
                ))}
              </div>
              <span>
                {t('ui.officer.merit')} {officer.merit}
              </span>
              {title && <span>{title}</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
  return disabledReason ? <Tooltip content={disabledReason}>{card}</Tooltip> : card;
}
