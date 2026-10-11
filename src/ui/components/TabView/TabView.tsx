import { Children, isValidElement, useId, type KeyboardEvent, type ReactNode } from 'react';
import styles from './TabView.module.css';
export interface TabItem {
  id: string;
  label: string;
  badge?: number;
  disabled?: boolean;
}
export interface TabViewProps {
  tabs: TabItem[];
  activeId: string;
  onChange: (id: string) => void;
  variant?: 'line' | 'contained';
  keepMounted?: boolean;
  sticky?: boolean;
  children: ReactNode;
}
export interface TabPaneProps {
  id: string;
  children: ReactNode;
}
function Pane({ children }: TabPaneProps) {
  return <>{children}</>;
}
function TabViewRoot({
  tabs,
  activeId,
  onChange,
  variant = 'line',
  keepMounted = false,
  sticky = false,
  children,
}: TabViewProps) {
  const prefix = useId();
  const enabled = tabs.filter((t) => !t.disabled);
  const onKey = (event: KeyboardEvent<HTMLButtonElement>, id: string) => {
    const i = enabled.findIndex((t) => t.id === id);
    let next: number | undefined;
    if (event.key === 'ArrowRight') next = (i + 1) % enabled.length;
    if (event.key === 'ArrowLeft') next = (i - 1 + enabled.length) % enabled.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = enabled.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      const tab = enabled[next];
      if (tab) {
        onChange(tab.id);
        const target = document.getElementById(`${prefix}-tab-${tab.id}`);
        if (sticky) target?.focus({ preventScroll: true });
        else target?.focus();
      }
    }
  };
  const panes = Children.toArray(children).filter(isValidElement<TabPaneProps>);
  return (
    <div className={`${styles.root} ${styles[variant]}`}>
      <div role="tablist" className={`${styles.tabs}${sticky ? ` ${styles.sticky}` : ''}`}>
        {tabs.map((tab) => (
          <button
            type="button"
            role="tab"
            id={`${prefix}-tab-${tab.id}`}
            aria-controls={`${prefix}-panel-${tab.id}`}
            aria-selected={tab.id === activeId}
            tabIndex={tab.id === activeId ? 0 : -1}
            disabled={tab.disabled}
            key={tab.id}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onKey(e, tab.id)}
          >
            {tab.label}
            {Boolean(tab.badge) && <span className={styles.badge}>{tab.badge}</span>}
          </button>
        ))}
      </div>
      {panes.map((pane) => {
        const active = pane.props.id === activeId;
        if (!active && !keepMounted) return null;
        return (
          <div
            key={pane.props.id}
            role="tabpanel"
            id={`${prefix}-panel-${pane.props.id}`}
            aria-labelledby={`${prefix}-tab-${pane.props.id}`}
            hidden={!active}
          >
            {pane.props.children}
          </div>
        );
      })}
    </div>
  );
}
export const TabView = Object.assign(TabViewRoot, { Pane });
