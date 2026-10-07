import type { ReactNode } from 'react';
import { Panel } from '../components';
import styles from './M6Panel.module.css';

export function M6Panel({
  title,
  testId,
  onClose,
  children,
}: {
  title: string;
  testId: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className={styles.scrim}>
      <section className={styles.panel} data-testid={testId}>
        <Panel title={title} onClose={onClose}>
          {children}
        </Panel>
      </section>
    </div>
  );
}
