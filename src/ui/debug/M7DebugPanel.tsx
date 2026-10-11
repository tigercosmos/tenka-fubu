import { useMemo, useState } from 'react';
import { useStore } from 'zustand';
import { store } from '@app/store';
import { perfMonitor } from '@app/perfMonitor';
import { BAL } from '@core/balance';
import { formatDate, t } from '@i18n/zh-TW';
import { makeCachedSelector } from '../hooks/useGameSelector';
import { useSession } from '../hooks/useSession';
import styles from './M7DebugPanel.module.css';

const PAGE_SIZE = 50;
const LAYERS = ['council', 'reactive', 'corps', 'steward', 'castle', 'proposal'] as const;
const selectLog = makeCachedSelector((game) => ({
  clans: Object.values(game.clans).map((clan) => ({ id: clan.id, name: clan.name })),
  intents: game.ai.intentLog
    .slice(-BAL.aiIntentLogSize)
    .map((intent) => ({
      ...intent,
      detail: { ...intent.detail },
      scores: intent.scores?.map((score) => ({ ...score })) ?? null,
      commands: structuredClone(intent.commands),
    }))
    .reverse(),
  deferred: game.ai.councilJobs.reduce((sum, job) => sum + job.phases.length, 0),
}));
const EMPTY: ReturnType<typeof selectLog> = { clans: [], intents: [], deferred: 0 };

/** Presentation-only: cloned bounded snapshots; no command dispatch or canonical state writes. */
export function M7DebugPanel() {
  const open = useSession((session) => session.debug.panelOpen);
  const model = useStore(store, (state) =>
    state.game === null ? EMPTY : selectLog(state.game, state.tickSeq),
  );
  const [clan, setClan] = useState(''),
    [day, setDay] = useState(''),
    [layer, setLayer] = useState(''),
    [kind, setKind] = useState('');
  const [page, setPage] = useState(0);
  const filtered = useMemo(
    () =>
      model.intents.filter(
        (intent) =>
          (clan === '' || intent.clanId === clan) &&
          (day === '' || intent.day === Number(day)) &&
          (layer === '' || intent.layer === layer) &&
          (kind === '' || intent.kind.includes(kind)),
      ),
    [model, clan, day, layer, kind],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const aiMs = perfMonitor.getSnapshot().systemBreakdownMs.ai;
  if (!open) return null;
  return (
    <section
      className={styles.panel}
      aria-label={t('ui.debugAi.title')}
      data-testid="ai-debug-panel"
    >
      <h3>{t('ui.debugAi.title')}</h3>
      <p>
        {aiMs === undefined
          ? t('ui.debugAi.budgetUnavailable')
          : t('ui.debugAi.budget', { ms: aiMs.toFixed(2) })}
      </p>
      <p>{t('ui.debugAi.deferred', { count: model.deferred })}</p>
      <div className={styles.filters}>
        <label>
          {t('ui.debugAi.filterClan')}
          <select
            value={clan}
            onChange={(e) => {
              setClan(e.target.value);
              setPage(0);
            }}
          >
            <option value="">{t('ui.debugAi.all')}</option>
            {model.clans.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('ui.debugAi.filterDay')}
          <input
            type="number"
            min="0"
            value={day}
            onChange={(e) => {
              setDay(e.target.value);
              setPage(0);
            }}
          />
        </label>
        <label>
          {t('ui.debugAi.filterLayer')}
          <select
            value={layer}
            onChange={(e) => {
              setLayer(e.target.value);
              setPage(0);
            }}
          >
            <option value="">{t('ui.debugAi.all')}</option>
            {LAYERS.map((value) => (
              <option key={value} value={value}>
                {t(`ui.debugAi.layer.${value}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('ui.debugAi.filterKind')}
          <input
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setPage(0);
            }}
          />
        </label>
      </div>
      <p role="status">
        {t('ui.debugAi.page', { page: currentPage + 1, pages, count: filtered.length })}
      </p>
      <div className={styles.pager}>
        <button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>
          {t('ui.debugAi.previous')}
        </button>
        <button
          type="button"
          disabled={currentPage + 1 >= pages}
          onClick={() => setPage(currentPage + 1)}
        >
          {t('ui.debugAi.next')}
        </button>
      </div>
      {filtered.length === 0 && <p>{t('ui.debugAi.empty')}</p>}
      {filtered
        .slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE)
        .map((intent, index) => (
          <details
            key={`${currentPage}:${index}:${intent.day}:${intent.clanId}:${intent.kind}`}
            data-testid="ai-intent-row"
          >
            <summary>
              {formatDate(intent.day)} ·{' '}
              {model.clans.find((c) => c.id === intent.clanId)?.name ?? intent.clanId} ·{' '}
              {t(`ui.debugAi.layer.${intent.layer}`)} · {intent.kind}
            </summary>
            <h4>{t('ui.debugAi.detail')}</h4>
            <pre>{JSON.stringify(intent.detail, null, 2)}</pre>
            <h4>{t('ui.debugAi.scores')}</h4>
            <pre>{JSON.stringify(intent.scores, null, 2)}</pre>
            <h4>{t('ui.debugAi.commands')}</h4>
            {intent.commands.length ? (
              <pre>{JSON.stringify(intent.commands, null, 2)}</pre>
            ) : (
              <p>{t('ui.debugAi.noAction')}</p>
            )}
          </details>
        ))}
    </section>
  );
}
