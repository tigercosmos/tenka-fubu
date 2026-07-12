import type { CastleId } from '@core/state/ids';
import { formatNumber, t } from '@i18n/zh-TW';
import { useGameSelector } from '@ui/hooks/useGameSelector';
import { Badge } from '../Badge/Badge';
import { ProgressBar } from '../ProgressBar/ProgressBar';
import styles from './CastleListItem.module.css';
export interface CastleListItemProps {
  castleId: CastleId;
  selected?: boolean;
  showGarrison?: boolean;
  onClick?: (id: CastleId) => void;
}
export function CastleListItem({
  castleId,
  selected = false,
  showGarrison = true,
  onClick,
}: CastleListItemProps) {
  const model = useGameSelector((game) => {
    const castle = game.castles[castleId];
    return castle === undefined
      ? null
      : { castle, underSiege: Object.values(game.sieges).some((s) => s.castleId === castleId) };
  });
  if (model === null) return null;
  const { castle, underSiege } = model;
  return (
    <button
      type="button"
      className={`${styles.root} ${selected ? styles.selected : ''}`}
      onClick={() => onClick?.(castleId)}
    >
      <Badge clanId={castle.ownerClanId} />
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path
          d={
            castle.tier === 'main'
              ? 'M2 18h16V9h-3V5h-3v4H8V5H5v4H2z'
              : 'M4 18h12V9h-3V6h-2v3H8V6H6v3H4z'
          }
        />
      </svg>
      <span className={styles.name}>
        {castle.name}
        {underSiege && <b>{t('ui.castle.underSiege')}</b>}
      </span>
      {showGarrison && (
        <span className={styles.garrison}>
          {formatNumber(castle.soldiers)}
          {t('term.unit.soldiers')} {formatNumber(castle.food)}
          {t('term.unit.koku')}
        </span>
      )}
      <span className={styles.progress}>
        <ProgressBar value={castle.durability} max={castle.maxDurability} height={4} />
      </span>
    </button>
  );
}
