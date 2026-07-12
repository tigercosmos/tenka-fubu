import { Icon, type IconName } from '../IconButton/icons';
import styles from './EmptyState.module.css';
export interface EmptyStateProps {
  icon?: IconName;
  text: string;
  actionText?: string;
  onAction?: () => void;
}
export function EmptyState({ icon = 'scroll', text, actionText, onAction }: EmptyStateProps) {
  return (
    <div className={styles.root}>
      <Icon name={icon} />
      <span>{text}</span>
      {actionText !== undefined && onAction !== undefined && (
        <button type="button" onClick={onAction}>
          {actionText}
        </button>
      )}
    </div>
  );
}
