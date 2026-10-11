import { useRef } from 'react';
import { formatDate, formatNumber, t } from '@i18n/zh-TW';
import type { MonthSummaryView } from '../reports/monthSummary';
import { Dialog } from '../components';
import styles from './MonthSummaryModal.module.css';

export interface MonthSummaryModalProps {
  view: MonthSummaryView;
  onContinue: () => void;
  onRewards?: () => void;
}

/** Read-only opening settlement, current food forecast and retained monthly reports. */
export function MonthSummaryModal({ view, onContinue, onRewards }: MonthSummaryModalProps) {
  const continueButton = useRef<HTMLButtonElement>(null);
  const settlement = view.settlement;
  const money = (value: number) => t('ui.summary.gold', { value: formatNumber(value) });
  const reportGroup = (kind: 'domestic' | 'world') => (
    <section aria-label={t(`ui.summary.${kind}`)}>
      <h3>{t(`ui.summary.${kind}`)}</h3>
      {view[kind].length === 0 ? (
        <p>{t('ui.summary.noReports')}</p>
      ) : (
        <ol className={styles.reports}>
          {view[kind].map((row) => (
            <li key={row.id}>
              <time>{formatDate(row.day)}</time>
              <span>{row.text}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
  return (
    <Dialog
      open
      size="lg"
      title={t('ui.summary.title', { year: String(view.year), month: String(view.month) })}
      onClose={() => {}}
      closeOnBackdrop={false}
      dismissible={false}
      focusScopeKey={view.key}
      initialFocusRef={continueButton}
      footer={
        <>
          {onRewards && (
            <button type="button" className={styles.rewards} onClick={onRewards}>
              {t('ui.reward.title')}
            </button>
          )}
          <button
            ref={continueButton}
            type="button"
            className={styles.continue}
            data-testid="month-summary-continue"
            data-dialog-primary="true"
            onClick={onContinue}
          >
            {t('ui.summary.continue')}
          </button>
        </>
      }
    >
      <div
        className={styles.summary}
        data-testid="month-summary"
        role="region"
        aria-label={t('ui.summary.contents')}
        tabIndex={0}
      >
        <section aria-label={t('ui.summary.settlement')}>
          <h3>{t('ui.summary.settlement')}</h3>
          <p>{t('ui.summary.settlementScope')}</p>
          {settlement === null ? (
            <p data-testid="month-summary-unavailable">{t('ui.summary.unavailable')}</p>
          ) : (
            <dl className={styles.figures} data-testid="month-summary-settlement">
              <dt>{t('ui.summary.income')}</dt>
              <dd>{money(settlement.incomeGold)}</dd>
              <dt>{t('ui.summary.tributeReceived')}</dt>
              <dd>{money(settlement.tributeReceived)}</dd>
              <dt>{t('ui.summary.salary')}</dt>
              <dd>
                {t('ui.summary.salaryPaidDue', {
                  paid: formatNumber(settlement.salaryPaid),
                  due: formatNumber(settlement.salaryDue),
                })}
              </dd>
              <dt>{t('ui.summary.policy')}</dt>
              <dd>{money(settlement.policyPaid)}</dd>
              <dt>{t('ui.summary.tributePaid')}</dt>
              <dd>{money(settlement.tributePaid)}</dd>
              <dt>{t('ui.summary.expense')}</dt>
              <dd>
                {money(settlement.salaryPaid + settlement.policyPaid + settlement.tributePaid)}
              </dd>
              <dt>{t('ui.summary.net')}</dt>
              <dd>{money(settlement.goldAfter - settlement.goldBefore)}</dd>
              <dt>{t('ui.summary.goldAfter')}</dt>
              <dd>{money(settlement.goldAfter)}</dd>
              <dt>{t('ui.summary.corpsRetained')}</dt>
              <dd>{money(settlement.retainedCorpsGold)}</dd>
            </dl>
          )}
        </section>
        <section aria-label={t('ui.summary.food')}>
          <h3>{t('ui.summary.food')}</h3>
          <dl className={styles.figures}>
            <dt>{t('ui.summary.foodStock')}</dt>
            <dd>{t('ui.summary.koku', { value: formatNumber(view.foodStock) })}</dd>
            <dt>{t('ui.summary.foodForecast')}</dt>
            <dd>{t('ui.summary.koku', { value: formatNumber(view.foodForecast) })}</dd>
          </dl>
          <p>{t('ui.summary.forecastScope')}</p>
        </section>
        {view.reportsMayBeIncomplete && <p role="note">{t('ui.summary.incomplete')}</p>}
        {reportGroup('domestic')}
        {reportGroup('world')}
      </div>
    </Dialog>
  );
}
