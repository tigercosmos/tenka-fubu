import type { ReactNode } from 'react';
import { Panel } from '../Panel/Panel';
import styles from './ContextPanel.module.css';
export interface ContextPanelProps {
  open: boolean;
  title: string;
  height?: number;
  actions?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}
export function ContextPanel({
  open,
  title,
  height = 260,
  actions,
  onClose,
  children,
}: ContextPanelProps) {
  return (
    <div
      className={`${styles.root} ${open ? styles.open : ''}`}
      style={{ height }}
      aria-hidden={!open}
    >
      <Panel title={title} variant="ornate" onClose={onClose}>
        <div className={styles.actions}>{actions}</div>
        {children}
      </Panel>
    </div>
  );
}
