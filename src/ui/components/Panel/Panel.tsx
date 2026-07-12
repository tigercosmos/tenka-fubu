import type { CSSProperties, ReactNode } from 'react';
import { IconButton } from '../IconButton/IconButton';
import type { TOKENS } from '@ui/styles/tokens';
import styles from './Panel.module.css';
export interface PanelProps {
  title?: string;
  variant?: 'plain' | 'ornate';
  padding?: keyof typeof TOKENS.space;
  onClose?: () => void;
  children: ReactNode;
}
export function Panel({
  title,
  variant = 'plain',
  padding = 'space4',
  onClose,
  children,
}: PanelProps) {
  return (
    <section
      className={`${styles.panel} ${variant === 'ornate' ? styles.ornate : ''}`}
      style={
        {
          '--panel-padding': `var(--${padding.replace('space', 'space-')})`,
          padding: 'var(--panel-padding)',
        } as CSSProperties
      }
    >
      {title !== undefined && (
        <header className={styles.header}>
          <span>{title}</span>
          {onClose !== undefined && (
            <IconButton icon="close" ariaLabel={title} size="sm" onClick={onClose} />
          )}
        </header>
      )}
      <div className={styles.content}>{children}</div>
    </section>
  );
}
