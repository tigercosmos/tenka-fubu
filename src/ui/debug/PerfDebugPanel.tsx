import { useEffect, useState } from 'react';
import { store } from '@app/store';
import { perfMonitor } from '@app/perfMonitor';
import { t } from '@i18n/zh-TW';
import { useStore } from 'zustand';

const REFRESH_MS = 500;
const readSnapshot = () => {
  const { game, tickSeq } = store.getState();
  return {
    ...perfMonitor.getSnapshot(game),
    hasTickSamples: perfMonitor.hasTickSamples(),
    game,
    tickSeq,
  };
};

/** Mounted only by the open DebugPanel; polling reads detached telemetry, never game commands. */
export function PerfDebugPanel() {
  const game = useStore(store, (state) => state.game);
  const [sample, setSnapshot] = useState(readSnapshot);
  // A replacement session cannot display the previous session's sampled measurements.
  const snapshot = sample.game === game ? sample : readSnapshot();
  useEffect(() => {
    const timer = window.setInterval(() => setSnapshot(readSnapshot()), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);
  const unavailable = t('ui.debugPerf.unavailable');
  const systems = Object.entries(snapshot.systemBreakdownMs);
  return (
    <section data-testid="perf-debug-panel" aria-label={t('ui.debugPerf.title')}>
      <h3>{t('ui.debugPerf.title')}</h3>
      <dl>
        <dt>{t('ui.debugPerf.tickSeq')}</dt>
        <dd data-testid="perf-tick-seq">{snapshot.tickSeq}</dd>
        <dt>{t('ui.debugPerf.schedulerFps')}</dt>
        <dd data-testid="perf-fps">{snapshot.fps > 0 ? snapshot.fps.toFixed(1) : unavailable}</dd>
        {(['lastTickMs', 'avgTickMs', 'maxTickMs'] as const).map((kind) => (
          <div key={kind}>
            <dt>{t(`ui.debugPerf.${kind}`)}</dt>
            <dd data-testid={`perf-${kind}`}>
              {snapshot.hasTickSamples ? `${snapshot[kind].toFixed(2)} ms` : unavailable}
            </dd>
          </div>
        ))}
      </dl>
      <p>{t('ui.debugPerf.fpsExplanation')}</p>
      <h4>{t('ui.debugPerf.systems')}</h4>
      {systems.length === 0 ? (
        <p data-testid="perf-systems">{unavailable}</p>
      ) : (
        <dl data-testid="perf-systems">
          {systems.map(([name, ms]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>{ms.toFixed(2)} ms</dd>
            </div>
          ))}
        </dl>
      )}
      <h4>{t('ui.debugPerf.entities')}</h4>
      <dl>
        {(['castles', 'districts', 'officers', 'armies'] as const).map((kind) => (
          <div key={kind}>
            <dt>{t(`ui.debugPerf.${kind}`)}</dt>
            <dd data-testid={`perf-count-${kind}`}>{snapshot.entityCounts[kind]}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
