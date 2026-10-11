import { useEffect, useMemo, useRef, useState, type CSSProperties, type UIEvent } from 'react';
import { t } from '@i18n/zh-TW';
import { UI } from '@ui/uiConstants';
import { useUIStore } from '../../hooks/uiStore';
import { scaledUiPixels } from '../../layout/sizing';
import { EmptyState } from '../EmptyState/EmptyState';
import styles from './DataTable.module.css';
export interface ColumnDef<T> {
  key: string;
  header: string;
  width?: number;
  align?: 'left' | 'right' | 'center';
  sortable?: boolean;
  sortValue?: (row: T) => number | string;
  render: (row: T) => React.ReactNode;
}
export interface SortState {
  key: string;
  dir: 'asc' | 'desc';
}
export interface DataTableProps<T> {
  rows: readonly T[];
  columns: ColumnDef<T>[];
  rowKey: (row: T) => string;
  rowHeight?: number;
  height?: number;
  sort?: SortState;
  onSortChange?: (s: SortState) => void;
  onRowClick?: (row: T) => void;
  selectedKey?: string | null;
  emptyText?: string;
}
const collator = new Intl.Collator('zh-Hant');
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  rowHeight = UI.tableRowHeightPx,
  height,
  sort,
  onSortChange,
  onRowClick,
  selectedKey = null,
  emptyText = t('ui.table.empty'),
}: DataTableProps<T>) {
  const uiScale = useUIStore((state) => state.uiScale);
  const effectiveRowHeight = scaledUiPixels(rowHeight, uiScale);
  const effectiveHeight = height === undefined ? undefined : scaledUiPixels(height, uiScale);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const measure = () =>
      setMeasuredHeight(viewport.clientHeight > 0 ? viewport.clientHeight : null);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [effectiveHeight]);
  const [localSort, setLocalSort] = useState<SortState | undefined>(sort);
  useEffect(() => setLocalSort(sort), [sort]);
  const activeSort = sort ?? localSort;
  const sorted = useMemo(() => {
    if (activeSort === undefined) return [...rows];
    const column = columns.find((c) => c.key === activeSort.key);
    if (column?.sortValue === undefined) return [...rows];
    const direction = activeSort.dir === 'asc' ? 1 : -1;
    return rows
      .map((row, index) => ({ row, index, key: rowKey(row), value: column.sortValue?.(row) }))
      .sort((a, b) => {
        let result = 0;
        if (typeof a.value === 'number' && typeof b.value === 'number') result = a.value - b.value;
        else result = collator.compare(String(a.value), String(b.value));
        return result === 0 ? a.key.localeCompare(b.key) || a.index - b.index : result * direction;
      })
      .map((x) => x.row);
  }, [rows, columns, rowKey, activeSort]);
  const virtual = height !== undefined && rows.length > UI.virtualizeThreshold;
  const [scrollTop, setScrollTop] = useState(0);
  const raf = useRef<number | null>(null);
  const latestScrollTop = useRef(0);
  const onScroll = (e: UIEvent<HTMLDivElement>) => {
    latestScrollTop.current = e.currentTarget.scrollTop;
    if (raf.current !== null) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = null;
      setScrollTop(latestScrollTop.current);
    });
  };
  useEffect(
    () => () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    },
    [],
  );
  const first = virtual
    ? Math.min(
        Math.max(0, sorted.length - 1),
        Math.max(0, Math.floor(scrollTop / effectiveRowHeight) - UI.tableOverscanRows),
      )
    : 0;
  const last = virtual
    ? Math.min(
        sorted.length - 1,
        Math.ceil((scrollTop + (measuredHeight ?? effectiveHeight ?? 0)) / effectiveRowHeight) +
          UI.tableOverscanRows,
      )
    : sorted.length - 1;
  const visible = sorted.slice(first, last + 1);
  const changeSort = (column: ColumnDef<T>) => {
    if (!column.sortable || column.sortValue === undefined) return;
    const next: SortState = {
      key: column.key,
      dir: activeSort?.key === column.key && activeSort.dir === 'asc' ? 'desc' : 'asc',
    };
    setLocalSort(next);
    onSortChange?.(next);
  };
  const widths = columns.map((c) =>
    c.width === undefined
      ? undefined
      : ({ width: scaledUiPixels(c.width, uiScale) } satisfies CSSProperties),
  );
  return (
    <div
      ref={viewportRef}
      className={styles.viewport}
      style={{ height: effectiveHeight, maxHeight: 'calc(100dvh - 6rem)' }}
      onScroll={onScroll}
    >
      {rows.length === 0 ? (
        <EmptyState text={emptyText} />
      ) : (
        <table>
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th
                  key={c.key}
                  style={{ ...widths[i], textAlign: c.align ?? 'left' }}
                  aria-sort={
                    activeSort?.key === c.key
                      ? activeSort.dir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                >
                  <button type="button" disabled={!c.sortable} onClick={() => changeSort(c)}>
                    {c.header}
                    {activeSort?.key === c.key && (activeSort.dir === 'asc' ? ' ▲' : ' ▼')}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {first > 0 && (
              <tr aria-hidden="true">
                <td
                  colSpan={columns.length}
                  style={{ height: first * effectiveRowHeight, padding: 0 }}
                />
              </tr>
            )}
            {visible.map((row) => {
              const key = rowKey(row);
              return (
                <tr
                  key={key}
                  className={key === selectedKey ? styles.selected : ''}
                  style={{ height: effectiveRowHeight }}
                  tabIndex={onRowClick === undefined ? undefined : 0}
                  onClick={(event) => {
                    const target = event.target;
                    if (
                      target instanceof Element &&
                      target.closest(
                        'button,a,input,select,textarea,[contenteditable="true"],[role="button"]',
                      ) !== null
                    )
                      return;
                    onRowClick?.(row);
                  }}
                  onKeyDown={(event) => {
                    if (onRowClick === undefined || event.target !== event.currentTarget) return;
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      onRowClick(row);
                    }
                  }}
                >
                  {columns.map((c) => (
                    <td key={c.key} style={{ textAlign: c.align ?? 'left' }}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
            {last < sorted.length - 1 && (
              <tr aria-hidden="true">
                <td
                  colSpan={columns.length}
                  style={{ height: (sorted.length - 1 - last) * effectiveRowHeight, padding: 0 }}
                />
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
