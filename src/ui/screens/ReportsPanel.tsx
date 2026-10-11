import { useEffect, useState } from 'react';
import { getSessionEventEngine } from '@app/bridge';
import { dayToCalendar } from '@core/index';
import { formatDate, t } from '@i18n/zh-TW';
import { Panel } from '../components';
import { Icon, type IconName } from '../components/IconButton/icons';
import { makeCachedSelector, useCachedGameSelector } from '../hooks/useGameSelector';
import { useUIStore } from '../hooks/uiStore';
import {
  selectReportCenter,
  type ReportCategory,
  type ReportCenterFilters,
  type ReportDestination,
  type ReportMonth,
} from '../reports/reportCenter';
import styles from './ReportsPanel.module.css';

const categories: readonly ReportCategory[] = [
  'domestic',
  'military',
  'diplomacy',
  'personnel',
  'event',
  'system',
];
const icons: Record<ReportCategory, IconName> = {
  domestic: 'rice',
  military: 'sword',
  diplomacy: 'handshake',
  personnel: 'people',
  event: 'scroll',
  system: 'gear',
};
const selectModel = makeCachedSelector((game, filters: ReportCenterFilters, page: number) => {
  const oldestDay = game.reports.reduce((day, report) => Math.min(day, report.day), game.time.day);
  const newestDay = game.reports.reduce((day, report) => Math.max(day, report.day), game.time.day);
  const first = dayToCalendar(oldestDay),
    last = dayToCalendar(newestDay);
  const selectedMonths = [filters.startMonth, filters.endMonth].filter(
    (month): month is ReportMonth => month != null,
  );
  // Retention may drop the selected month, but must not hide an active user date bound.
  const firstIndex = Math.min(
    first.year * 12 + first.month - 1,
    ...selectedMonths.map((month) => month.year * 12 + month.month - 1),
  );
  const lastIndex = Math.max(
    last.year * 12 + last.month - 1,
    ...selectedMonths.map((month) => month.year * 12 + month.month - 1),
  );
  const months: ReportMonth[] = [];
  for (let index = firstIndex; index <= lastIndex; index++) {
    months.push({ year: Math.floor(index / 12), month: (index % 12) + 1 });
  }
  return {
    ...selectReportCenter(game, filters, page, {
      eventTitle: (id) => getSessionEventEngine()?.getDef(id)?.cutscene.title,
    }),
    months,
  };
});

export interface ReportsPanelProps {
  /** Navigation is explicit; filtering, opening and reading never move the map. */
  onGoto: (destination: ReportDestination) => void;
}

export function ReportsPanel({ onGoto }: ReportsPanelProps) {
  const actions = useUIStore((state) => state.actions);
  const [filters, setFilters] = useState<ReportCenterFilters>({ categories });
  const [page, setPage] = useState(1);
  const model = useCachedGameSelector(selectModel, filters, page);
  // Retention can remove a page; do not jump back to that stale page when new reports arrive.
  useEffect(() => {
    if (page !== model.page) setPage(model.page);
  }, [page, model.page]);
  const changeFilter = (patch: Partial<ReportCenterFilters>) => {
    setFilters((current) => ({ ...current, ...patch }));
    setPage(1);
  };
  const monthKey = (month: ReportMonth | null | undefined) =>
    month ? `${month.year}/${month.month}` : '';
  const dateControl = (field: 'startMonth' | 'endMonth') => (
    <label>
      {t(`ui.reports.${field}`)}
      <select
        aria-label={t(`ui.reports.${field}`)}
        value={monthKey(filters[field])}
        onChange={(event) => {
          const value = event.target.value;
          const [year, month] = value.split('/').map(Number);
          changeFilter({ [field]: value === '' ? null : { year: year!, month: month! } });
        }}
      >
        <option value="">{t('ui.reports.allDates')}</option>
        {model.months.map((month) => (
          <option key={monthKey(month)} value={monthKey(month)}>
            {t('ui.reports.month', { year: String(month.year), month: month.month })}
          </option>
        ))}
      </select>
    </label>
  );
  const invalidRange =
    filters.startMonth &&
    filters.endMonth &&
    filters.startMonth.year * 12 + filters.startMonth.month >
      filters.endMonth.year * 12 + filters.endMonth.month;
  return (
    <div className={styles.scrim}>
      <section className={styles.panel} data-testid="reports-panel">
        <Panel title={t('ui.reports.title')} onClose={() => actions.closePanelById('reports')}>
          <div className={styles.frame}>
            <div className={styles.layout}>
              <aside className={styles.filters}>
                <fieldset>
                  <legend>{t('ui.reports.category')}</legend>
                  {categories.map((category) => (
                    <label key={category}>
                      <input
                        type="checkbox"
                        checked={filters.categories?.includes(category) ?? true}
                        onChange={(event) =>
                          changeFilter({
                            categories: event.target.checked
                              ? [...(filters.categories ?? categories), category]
                              : (filters.categories ?? categories).filter(
                                  (item) => item !== category,
                                ),
                          })
                        }
                      />
                      {t(`ui.reports.category.${category}`)}
                    </label>
                  ))}
                </fieldset>
                <label>
                  <input
                    type="checkbox"
                    checked={filters.importantOnly ?? false}
                    onChange={(event) => changeFilter({ importantOnly: event.target.checked })}
                  />
                  {t('ui.reports.importantOnly')}
                </label>
                {dateControl('startMonth')}
                {dateControl('endMonth')}
                {invalidRange && <p role="alert">{t('ui.reports.invalidRange')}</p>}
              </aside>
              <section className={styles.timeline} aria-label={t('ui.reports.timeline')}>
                <div className={styles.rows}>
                  {model.rows.length === 0 && <p role="status">{t('ui.reports.empty')}</p>}
                  <ol>
                    {model.rows.map((row) => (
                      <li key={row.id} className={styles.row}>
                        <div className={styles.heading}>
                          <span aria-label={t(`ui.reports.category.${row.category}`)}>
                            <Icon
                              name={icons[row.category]}
                              aria-hidden="true"
                              width={20}
                              height={20}
                            />
                          </span>
                          <time>{formatDate(row.day)}</time>
                          <span className={styles[row.severity]}>
                            {t(`ui.notify.severity.${row.severity}`)}
                          </span>
                        </div>
                        <p>{row.text}</p>
                        <button
                          type="button"
                          disabled={row.destination === null}
                          title={
                            row.destination === null ? t('ui.reports.gotoUnavailable') : undefined
                          }
                          onClick={() => {
                            if (row.destination !== null) onGoto(row.destination);
                          }}
                        >
                          {t('ui.reports.goto')}
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
                <nav className={styles.pagination} aria-label={t('ui.reports.title')}>
                  <button
                    type="button"
                    disabled={model.page <= 1}
                    onClick={() => setPage(model.page - 1)}
                  >
                    {t('ui.reports.previous')}
                  </button>
                  <span role="status">
                    {t('ui.reports.pagination', {
                      page: model.page,
                      pages: model.pageCount,
                      total: model.total,
                    })}
                  </span>
                  <button
                    type="button"
                    disabled={model.page >= model.pageCount}
                    onClick={() => setPage(model.page + 1)}
                  >
                    {t('ui.reports.next')}
                  </button>
                </nav>
              </section>
            </div>
          </div>
        </Panel>
      </section>
    </div>
  );
}
