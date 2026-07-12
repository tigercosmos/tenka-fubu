import type { ClanId } from '@core/state/ids';
import { useGameSelector } from '@ui/hooks/useGameSelector';
import styles from './Badge.module.css';

export interface BadgeProps {
  clanId?: ClanId | null;
  label?: string;
  size?: 'sm' | 'md';
}
export function Badge({ clanId = null, label, size = 'sm' }: BadgeProps) {
  const colorIndex = useGameSelector((game) =>
    clanId === null ? null : (game.clans[clanId]?.colorIndex ?? null),
  );
  const color =
    colorIndex === null
      ? 'var(--neutral-clanless)'
      : `var(--clan-${String(colorIndex).padStart(2, '0')}-bright)`;
  return (
    <span
      className={`${styles.badge} ${styles[size]} ${label === undefined ? styles.swatch : ''}`}
      style={{ backgroundColor: color }}
    >
      {label}
    </span>
  );
}
