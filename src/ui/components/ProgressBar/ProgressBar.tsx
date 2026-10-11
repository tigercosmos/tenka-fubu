import styles from './ProgressBar.module.css';
import { logicalPxToRem } from '../../layout/sizing';
export interface ProgressBarProps {
  value: number;
  max: number;
  color?: 'gold' | 'moss' | 'vermilion' | 'indigo';
  height?: number;
  label?: string;
  /** Accessible-only name when the surrounding layout already shows the label. */
  ariaLabel?: string;
}
export function ProgressBar({
  value,
  max,
  color = 'moss',
  height = 8,
  label,
  ariaLabel,
}: ProgressBarProps) {
  const ratio = max <= 0 ? 0 : Math.max(0, Math.min(1, value / max));
  return (
    <div className={styles.row}>
      <div
        className={styles.track}
        style={{ height: logicalPxToRem(height) }}
        role="progressbar"
        aria-label={ariaLabel ?? label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.max(0, Math.min(value, max))}
      >
        <span
          className={`${styles.fill} ${styles[color]} motion-preserve`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      {label !== undefined && <span>{label}</span>}
    </div>
  );
}
