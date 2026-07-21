import styles from './StatBar.module.css';
export interface StatBarProps {
  label: string;
  value: number;
  compareValue?: number;
  width?: number;
  /** 值軸上限。預設 120（能力尺：100..120 為金色溢出區）；百分比快覽條傳 100 使滿值填滿整條。 */
  max?: number;
  /** 是否於尾端顯示數值（預設 true）。label 已含真值（如「兵 12,340」）時傳 false，
   *  避免佔比數字外洩為可見/aria 數值（M6-V9 review 補跑）。 */
  showValue?: boolean;
}
export function StatBar({
  label,
  value,
  compareValue,
  width = 120,
  max = 120,
  showValue = true,
}: StatBarProps) {
  const safe = Math.max(0, Math.min(max, value));
  const blue = (Math.min(safe, 100) / max) * 100;
  const gold = (Math.max(0, safe - 100) / max) * 100;
  return (
    <div className={styles.root} role="img" aria-label={showValue ? `${label} ${value}` : label}>
      <span className={styles.label}>{label}</span>
      <span className={styles.track} style={{ width }}>
        {compareValue !== undefined && (
          <span
            className={styles.compare}
            style={{ width: `${(Math.max(0, Math.min(max, compareValue)) / max) * 100}%` }}
          />
        )}
        <span className={styles.base} style={{ width: `${blue}%` }} />
        {gold > 0 && (
          <span
            className={styles.over}
            style={{ left: `${(100 / max) * 100}%`, width: `${gold}%` }}
          />
        )}
      </span>
      {showValue && <span className={styles.value}>{value}</span>}
    </div>
  );
}
