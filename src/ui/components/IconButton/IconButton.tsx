import { Icon, type IconName } from './icons';
import styles from './IconButton.module.css';

export interface IconButtonProps {
  icon: IconName;
  ariaLabel: string;
  size?: 'sm' | 'md' | 'lg';
  toggled?: boolean;
  disabled?: boolean;
  /** e2e／spec 契約 data-testid（M6-V9 §4.3／§4.5：speed-*／rail-* 由呼叫端指定）。 */
  testId?: string;
  /** 滑鼠懸停原生提示（M6-V9 §4.6：disabled 動作鈕說明用）。 */
  title?: string;
  onClick: () => void;
}
export function IconButton({
  icon,
  ariaLabel,
  size = 'md',
  toggled = false,
  disabled = false,
  testId,
  title,
  onClick,
}: IconButtonProps) {
  return (
    <button
      type="button"
      className={`${styles.button} ${styles[size]} ${toggled ? styles.toggled : ''}`}
      aria-label={ariaLabel}
      aria-pressed={toggled}
      aria-disabled={disabled}
      disabled={disabled}
      data-testid={testId}
      title={title}
      onClick={onClick}
    >
      <Icon name={icon} />
    </button>
  );
}
export type { IconName } from './icons';
