import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDate, t } from '@i18n/zh-TW';
import { TOKENS } from '@ui/styles/tokens';
import { UI } from '@ui/uiConstants';
import { IconButton } from '../IconButton/IconButton';
import { Icon, type IconName } from '../IconButton/icons';
import { useReducedMotion } from '../../motion/MotionContext';
import type { ReportSeverity } from '../types';
import type { ReportCategory } from '../../reports/reportCenter';
import styles from './ReportStack.module.css';

export interface ToastItem {
  id: string;
  severity: ReportSeverity;
  category?: ReportCategory;
  title: string;
  body?: string;
  date: number;
  onClick?: () => void;
  sticky?: boolean;
  dismissible?: boolean;
}

export interface ReportStackProps {
  items: ToastItem[];
  max?: number;
  onDismiss: (id: string) => void;
  onOpenReports?: () => void;
  /** Conceal floating notifications under a full-screen report view without a dismissal action. */
  hidden?: boolean;
  /** CSS space reserved for the actual minimap/lower context panel. */
  bottomInset?: string;
}

function autoDismissMs(item: ToastItem): number | null {
  if (item.sticky === true || item.severity === 'critical') return null;
  return item.severity === 'warning' ? UI.toastDurationWarnMs : UI.toastDurationInfoMs;
}

interface ToastProps {
  item: ToastItem;
  onDismiss: (id: string) => void;
}

const severityIcons: Record<ReportSeverity, IconName> = {
  info: 'scroll',
  success: 'flag',
  warning: 'warning',
  critical: 'warning',
};

const categoryIcons: Record<ReportCategory, IconName> = {
  domestic: 'rice',
  military: 'sword',
  diplomacy: 'handshake',
  personnel: 'people',
  event: 'scroll',
  system: 'gear',
};

function Toast({ item, onDismiss }: ToastProps) {
  const reducedMotion = useReducedMotion();
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;
  const duration = autoDismissMs(item);
  const remainingMs = useRef(duration);
  const startedAtMs = useRef(0);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const exitingRef = useRef(false);
  const hoveredRef = useRef(false);
  const focusedRef = useRef(false);
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
    if (reducedMotionRef.current) {
      onDismissRef.current(item.id);
      return;
    }
    exitTimer.current = setTimeout(() => {
      exitTimer.current = null;
      onDismissRef.current(item.id);
    }, TOKENS.duration.normal);
  }, [clearDismissTimer, item.id]);

  useEffect(() => {
    if (!reducedMotion || !exitingRef.current || exitTimer.current === null) return;
    clearTimeout(exitTimer.current);
    exitTimer.current = null;
    onDismissRef.current(item.id);
  }, [reducedMotion, item.id]);

  const schedule = useCallback(() => {
    if (
      remainingMs.current === null ||
      exitingRef.current ||
      hoveredRef.current ||
      focusedRef.current
    )
      return;
    clearDismissTimer();
    startedAtMs.current = Date.now();
    dismissTimer.current = setTimeout(beginDismiss, remainingMs.current);
  }, [beginDismiss, clearDismissTimer]);

  useEffect(() => {
    remainingMs.current = duration;
    schedule();
    return clearDismissTimer;
  }, [clearDismissTimer, duration, schedule]);

  // An accepted exit belongs to this keyed notification, not its changing severity timer.
  useEffect(
    () => () => {
      if (exitTimer.current !== null) clearTimeout(exitTimer.current);
      exitTimer.current = null;
    },
    [],
  );

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
    <div
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
      onMouseEnter={() => {
        hoveredRef.current = true;
        pause();
      }}
      onMouseLeave={() => {
        hoveredRef.current = false;
        resume();
      }}
      onFocus={() => {
        focusedRef.current = true;
        pause();
      }}
      onBlur={(event) => {
        if (
          event.relatedTarget instanceof Node &&
          event.currentTarget.contains(event.relatedTarget)
        )
          return;
        focusedRef.current = false;
        resume();
      }}
    >
      <div className={styles.heading}>
        <span
          className={styles.severitySeal}
          data-severity={item.severity}
          data-category={item.category}
          aria-hidden="true"
        >
          <Icon
            name={
              item.category === undefined
                ? severityIcons[item.severity]
                : categoryIcons[item.category]
            }
            width={20}
            height={20}
          />
        </span>
        <div className={styles.metadata}>
          <strong>{item.title}</strong>
          <time>{formatDate(item.date)}</time>
        </div>
        {item.dismissible !== false && (
          <span
            className={styles.dismissControl}
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
        )}
      </div>
      {item.body !== undefined && <p>{item.body}</p>}
    </div>
  );
}

export function ReportStack({
  items,
  max = UI.toastMaxVisible,
  onDismiss,
  onOpenReports,
  hidden = false,
  bottomInset = 'var(--space-3)',
}: ReportStackProps) {
  const evicted = useRef(new Set<string>());
  // M6-V9 §4.7：可收合（本地 UI 態，不進 store）；收合時只留計數 pill。
  const [collapsed, setCollapsed] = useState(false);
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

  const countText = t('ui.hud.reportCount', { count: items.length });
  return (
    <section
      className={styles.stack}
      aria-live="polite"
      hidden={hidden}
      style={{ bottom: bottomInset }}
    >
      {/* [M6-V9 review 補跑] 零通報時不畫 header/chevron——維持空態淨空（section 保留為
          aria-live 容器）；有通報時才提供收合/計數。 */}
      {items.length > 0 && (
        <div className={styles.header}>
          {collapsed && <span className={styles.countPill}>{countText}</span>}
          <IconButton
            icon={collapsed ? 'chevron-down' : 'chevron-up'}
            ariaLabel={countText}
            size="sm"
            onClick={() => setCollapsed((value) => !value)}
          />
        </div>
      )}
      {!collapsed && items.length > 0 && (
        <div
          className={styles.list}
          data-testid="report-toast-list"
          tabIndex={0}
          aria-label={countText}
        >
          {items.slice(0, Math.max(0, max)).map((item) => (
            <Toast key={item.id} item={item} onDismiss={onDismiss} />
          ))}
        </div>
      )}
      {onOpenReports !== undefined && (
        <button
          type="button"
          className={styles.openReports}
          onClick={onOpenReports}
          data-testid="reports-open"
        >
          {t('ui.reports.title')}
        </button>
      )}
    </section>
  );
}
