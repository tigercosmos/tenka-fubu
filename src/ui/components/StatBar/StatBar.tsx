import styles from './StatBar.module.css';
export interface StatBarProps {
  label: string;
  value: number;
  compareValue?: number;
  width?: number;
}
export function StatBar({ label, value, compareValue, width = 120 }: StatBarProps) {
  const safe = Math.max(0, Math.min(120, value));
  const blue = (Math.min(safe, 100) / 120) * 100;
  const gold = (Math.max(0, safe - 100) / 120) * 100;
  return (
    <div className={styles.root} role="img" aria-label={`${label} ${value}`}>
      <span className={styles.label}>{label}</span>
      <span className={styles.track} style={{ width }}>
        {compareValue !== undefined && (
          <span
            className={styles.compare}
            style={{ width: `${(Math.max(0, Math.min(120, compareValue)) / 120) * 100}%` }}
          />
        )}
        <span className={styles.base} style={{ width: `${blue}%` }} />
        <span
          className={styles.over}
          style={{ left: `${(100 / 120) * 100}%`, width: `${gold}%` }}
        />
      </span>
      <span className={styles.value}>{value}</span>
    </div>
  );
}
