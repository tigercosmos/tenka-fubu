import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDate, t } from '@i18n/zh-TW';
import { TOKENS } from '@ui/styles/tokens';
import { UI } from '@ui/uiConstants';
import { IconButton } from '../IconButton/IconButton';
import type { ReportSeverity } from '../types';
import styles from './ReportStack.module.css';

export interface ToastItem {
  id: string;
  severity: ReportSeverity;
  title: string;
  body?: string;
  date: number;
  onClick?: () => void;
  sticky?: boolean;
}

export interface ReportStackProps {
  items: ToastItem[];
  max?: number;
  onDismiss: (id: string) => void;
}

function autoDismissMs(item: ToastItem): number | null {
  if (item.sticky === true || item.severity === 'critical') return null;
  return item.severity === 'warning' ? UI.toastDurationWarnMs : UI.toastDurationInfoMs;
}

interface ToastProps {
  item: ToastItem;
  onDismiss: (id: string) => void;
}

function Toast({ item, onDismiss }: ToastProps) {
  const duration = autoDismissMs(item);
  const remainingMs = useRef(duration);
  const startedAtMs = useRef(0);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitingRef = useRef(false);
  const onDismissRef = useRef(onDismiss);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  const clearDismissTimer = useCallback(() => {
    if (dismissTimer.current !== null) clearTimeout(dismissTimer.current);
    dismissTimer.current = null;
  }, []);

  const beginDismiss = useCallback(() => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    clearDismissTimer();
    setExiting(true);
    exitTimer.current = setTimeout(() => onDismissRef.current(item.id), TOKENS.duration.normal);
  }, [clearDismissTimer, item.id]);

  const schedule = useCallback(() => {
    if (remainingMs.current === null || exitingRef.current) return;
    clearDismissTimer();
    startedAtMs.current = Date.now();
    dismissTimer.current = setTimeout(beginDismiss, remainingMs.current);
  }, [beginDismiss, clearDismissTimer]);

  useEffect(() => {
    remainingMs.current = duration;
    schedule();
    return () => {
      clearDismissTimer();
      if (exitTimer.current !== null) clearTimeout(exitTimer.current);
    };
  }, [clearDismissTimer, duration, schedule]);

  const pause = () => {
    if (dismissTimer.current === null || remainingMs.current === null) return;
    remainingMs.current = Math.max(0, remainingMs.current - (Date.now() - startedAtMs.current));
    clearDismissTimer();
  };

  const resume = () => {
    if (!exitingRef.current) schedule();
  };

  const activate = () => item.onClick?.();

  return (
    <article
      className={`${styles.toast} ${styles[item.severity]} ${exiting ? styles.exiting : ''} ${item.onClick !== undefined ? styles.clickable : ''}`}
      role={item.severity === 'critical' ? 'alert' : 'status'}
      tabIndex={item.onClick === undefined ? undefined : 0}
      onClick={activate}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate();
        }
      }}
      onMouseEnter={pause}
      onMouseLeave={resume}
    >
      <div className={styles.heading}>
        <strong>{item.title}</strong>
        <span
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
        >
          <IconButton
            icon="close"
            ariaLabel={t('ui.toast.dismiss')}
            size="sm"
            onClick={beginDismiss}
          />
        </span>
      </div>
      {item.body !== undefined && <p>{item.body}</p>}
      <time>{formatDate(item.date)}</time>
    </article>
  );
}

export function ReportStack({ items, max = UI.toastMaxVisible, onDismiss }: ReportStackProps) {
  const evicted = useRef(new Set<string>());
  const overflow = items.slice(Math.max(0, max));

  useEffect(() => {
    const overflowIds = new Set(overflow.map((item) => item.id));
    for (const id of evicted.current) {
      if (!overflowIds.has(id)) evicted.current.delete(id);
    }
    for (const item of overflow) {
      if (item.sticky === true || item.severity === 'critical' || evicted.current.has(item.id)) {
        continue;
      }
      evicted.current.add(item.id);
      onDismiss(item.id);
    }
  }, [onDismiss, overflow]);

  return (
    <section className={styles.stack} aria-live="polite">
      {items.slice(0, Math.max(0, max)).map((item) => (
        <Toast key={item.id} item={item} onDismiss={onDismiss} />
      ))}
    </section>
  );
}
