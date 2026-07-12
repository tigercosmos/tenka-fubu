import { Icon, type IconName } from './icons';
import styles from './IconButton.module.css';

export interface IconButtonProps {
  icon: IconName;
  ariaLabel: string;
  size?: 'sm' | 'md';
  toggled?: boolean;
  disabled?: boolean;
  onClick: () => void;
}
export function IconButton({
  icon,
  ariaLabel,
  size = 'md',
  toggled = false,
  disabled = false,
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
      onClick={onClick}
    >
      <Icon name={icon} />
    </button>
  );
}
export type { IconName } from './icons';
