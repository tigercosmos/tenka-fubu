import { useRef, type KeyboardEvent } from 'react';
import { Icon, type IconName } from '../IconButton/icons';
import { Tooltip } from '../Tooltip/Tooltip';
import styles from './MenuList.module.css';
export interface MenuItem {
  id: string;
  label: string;
  icon?: IconName;
  disabled?: boolean;
  disabledReason?: string;
  danger?: boolean;
}
export interface MenuListProps {
  items: MenuItem[];
  onSelect: (id: string) => void;
}
export function MenuList({ items, onSelect }: MenuListProps) {
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const onKey = (e: KeyboardEvent, id: string) => {
    const enabled = items.filter((x) => !x.disabled);
    const i = enabled.findIndex((x) => x.id === id);
    let n: number | undefined;
    if (e.key === 'ArrowDown') n = (i + 1) % enabled.length;
    if (e.key === 'ArrowUp') n = (i - 1 + enabled.length) % enabled.length;
    if (n !== undefined) {
      e.preventDefault();
      const item = enabled[n];
      if (item) refs.current.get(item.id)?.focus();
    }
    if (e.key === 'Enter') {
      const item = items.find((x) => x.id === id);
      if (item && !item.disabled) onSelect(id);
    }
  };
  return (
    <div role="menu" className={styles.menu}>
      {items.map((item) => {
        const button = (
          <button
            type="button"
            role="menuitem"
            aria-disabled={item.disabled}
            tabIndex={item.disabled ? -1 : 0}
            ref={(node) => {
              if (node) refs.current.set(item.id, node);
              else refs.current.delete(item.id);
            }}
            className={`${item.danger ? styles.danger : ''}`}
            onKeyDown={(e) => onKey(e, item.id)}
            onClick={() => {
              if (!item.disabled) onSelect(item.id);
            }}
          >
            {item.icon && <Icon name={item.icon} />}
            <span>{item.label}</span>
          </button>
        );
        return (
          <div key={item.id}>
            {item.disabled && item.disabledReason ? (
              <Tooltip content={item.disabledReason}>{button}</Tooltip>
            ) : (
              button
            )}
          </div>
        );
      })}
    </div>
  );
}
