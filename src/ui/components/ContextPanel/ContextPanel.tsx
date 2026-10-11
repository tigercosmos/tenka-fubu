import type { ReactNode } from 'react';
import { logicalPxToRem } from '../../layout/sizing';
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
      style={{
        height: logicalPxToRem(height),
        maxHeight: 'calc(100dvh - 3rem)',
        overflowY: 'auto',
      }}
      aria-hidden={!open}
      {...(open ? {} : { inert: '' })}
    >
      <Panel title={title} variant="ornate" padding="space2" onClose={onClose}>
        <div className={`${styles.body} ${actions ? styles.hasActions : ''}`}>
          <div className={styles.facts} tabIndex={open ? 0 : -1}>
            {children}
          </div>
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
      </Panel>
    </div>
  );
}
