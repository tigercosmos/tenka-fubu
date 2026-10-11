import type { MapFrameMeasurementRenderer } from './mapFrameMeasurement';

export interface LiveFrameSessionObservation {
  day: number;
  speed: string;
  marchingCount: number;
  paidLegs: number;
  cohortCount: number;
  gameIdentityMatches: boolean;
  workloadActive: boolean;
  rendererIdentityMatches: boolean;
  visible: boolean;
  blockingReasons: string[];
  failure: string | null;
}

type LiveRenderer = Pick<
  MapFrameMeasurementRenderer,
  'subscribeRenderedFrames' | 'getArmyRenderObservation' | 'isReady'
> & {
  getDiagnostics(): Pick<
    ReturnType<MapFrameMeasurementRenderer['getDiagnostics']>,
    'resources' | 'lodStage'
  >;
};

/** Observe ordinary gameplay; this function never drives ticks, camera poses or army views. */
export async function measureLiveNationalMapFrames(options: {
  renderer: LiveRenderer;
  sample: () => LiveFrameSessionObservation;
  subscribeSessionChanges: (listener: () => void) => () => void;
  durationMs?: number;
  now?: () => number;
  wait?: (durationMs: number) => Promise<void>;
}) {
  const durationMs = options.durationMs ?? 30_000;
  if (!Number.isFinite(durationMs) || durationMs < 1000 || durationMs > 60_000)
    throw new Error('Live measurement duration must be between1000 and60000 ms');
  const now = options.now ?? (() => performance.now());
  const wait =
    options.wait ?? ((duration: number) => new Promise<void>((r) => setTimeout(r, duration)));
  const before = options.renderer.getDiagnostics();
  const frameTimesMs: number[] = [];
  const sessionSamples: Array<
    LiveFrameSessionObservation & {
      timestamp: number;
      trigger: 'start' | 'render' | 'change' | 'end';
    }
  > = [];
  const interruptions: Array<{ timestamp: number; day: number; reasons: string[] }> = [];
  const observationErrors: string[] = [];
  let completedFrames = 0;
  let firstPostrenderTimestamp: number | null = null;
  let lastPostrenderTimestamp: number | null = null;
  let minMarching = Infinity;
  let minPaidLegs = Infinity;
  let maxPaidLegs = 0;
  let minMountedArmies = Infinity;
  let minVisibleArmies = Infinity;
  let maxVisibleArmies = 0;
  let lastArmySample = -Infinity;
  const started = now();
  const capture = (trigger: 'start' | 'render' | 'change' | 'end', timestamp: number) => {
    try {
      const sample = options.sample();
      const preceding = sessionSamples.at(-1);
      sessionSamples.push({
        ...sample,
        blockingReasons: [...sample.blockingReasons],
        trigger,
        timestamp,
      });
      const reasons = [...sample.blockingReasons];
      if (preceding && sample.day < preceding.day) reasons.push('strategy-day-reversed');
      if (sample.speed !== 'x5') reasons.push(`speed:${sample.speed}`);
      if (!sample.gameIdentityMatches) reasons.push('game-replaced');
      if (!sample.rendererIdentityMatches) reasons.push('renderer-replaced');
      if (!sample.workloadActive) reasons.push('workload-disposed');
      if (!sample.visible) reasons.push('document-hidden');
      if (!options.renderer.isReady()) reasons.push('renderer-not-ready');
      if (sample.failure !== null) reasons.push(`workload-failure:${sample.failure}`);
      if (
        !Number.isInteger(sample.day) ||
        !Number.isInteger(sample.marchingCount) ||
        !Number.isInteger(sample.paidLegs) ||
        !Number.isInteger(sample.cohortCount) ||
        sample.day < 0 ||
        sample.paidLegs < 0 ||
        sample.paidLegs > sample.cohortCount ||
        sample.marchingCount < 40 ||
        sample.cohortCount !== 40 ||
        sample.marchingCount > sample.cohortCount
      )
        reasons.push('invalid-or-insufficient-cohort');
      if (reasons.length) interruptions.push({ timestamp, day: sample.day, reasons });
      minMarching = Math.min(minMarching, sample.marchingCount);
      minPaidLegs = Math.min(minPaidLegs, sample.paidLegs);
      maxPaidLegs = Math.max(maxPaidLegs, sample.paidLegs);
    } catch (error) {
      observationErrors.push(error instanceof Error ? error.message : String(error));
    }
  };
  let disposeFrames: (() => void) | null = null;
  let disposeSession: (() => void) | null = null;
  let ended = started;
  let after: ReturnType<LiveRenderer['getDiagnostics']> | null = null;
  try {
    capture('start', started);
    disposeSession = options.subscribeSessionChanges(() => capture('change', now()));
    disposeFrames = options.renderer.subscribeRenderedFrames((timestamp) => {
      if (
        !Number.isFinite(timestamp) ||
        timestamp < started ||
        (lastPostrenderTimestamp !== null && timestamp <= lastPostrenderTimestamp)
      ) {
        observationErrors.push('Invalid or nonmonotonic postrender timestamp');
        return;
      }
      firstPostrenderTimestamp ??= timestamp;
      completedFrames++;
      if (lastPostrenderTimestamp !== null) frameTimesMs.push(timestamp - lastPostrenderTimestamp);
      lastPostrenderTimestamp = timestamp;
      capture('render', timestamp);
      if (timestamp - lastArmySample < 250) return;
      lastArmySample = timestamp;
      try {
        const armyObservation = options.renderer.getArmyRenderObservation();
        minMountedArmies = Math.min(minMountedArmies, armyObservation.mounted);
        minVisibleArmies = Math.min(minVisibleArmies, armyObservation.cullVisibleArmyChips);
        maxVisibleArmies = Math.max(maxVisibleArmies, armyObservation.cullVisibleArmyChips);
      } catch (error) {
        observationErrors.push(error instanceof Error ? error.message : String(error));
      }
    });
    await wait(durationMs);
  } catch (error) {
    observationErrors.push(error instanceof Error ? error.message : String(error));
  } finally {
    try {
      ended = now();
      capture('end', ended);
    } catch (error) {
      observationErrors.push(error instanceof Error ? error.message : String(error));
    }
    for (const dispose of [disposeFrames, disposeSession]) {
      try {
        dispose?.();
      } catch (error) {
        observationErrors.push(error instanceof Error ? error.message : String(error));
      }
    }
    try {
      after = options.renderer.getDiagnostics();
    } catch (error) {
      observationErrors.push(error instanceof Error ? error.message : String(error));
    }
  }
  const first = sessionSamples[0];
  const last = sessionSamples.at(-1);
  const elapsed = ended - started;
  if (elapsed < durationMs || !Number.isFinite(elapsed))
    observationErrors.push('Incomplete wall window');
  if (!first || !last || last.day <= first.day)
    observationErrors.push('No actual strategy progression');
  if (!frameTimesMs.length) observationErrors.push('No actual postrender intervals');
  if (!Number.isFinite(minMountedArmies) || minMountedArmies < 40)
    observationErrors.push('Forty cohort army parts were not mounted');
  if (lastPostrenderTimestamp !== null && lastPostrenderTimestamp > ended)
    observationErrors.push('Postrender timestamp beyond wall window');
  const ordered = [...frameTimesMs].sort((a, b) => a - b);
  const frameTimeP95 = ordered.length ? ordered[Math.ceil(ordered.length * 0.95) - 1]! : null;
  return {
    scope: 'canonical-forty-armies/ordinary-live-x5/actual-postrender' as const,
    valid: interruptions.length === 0 && observationErrors.length === 0,
    durationMs: elapsed,
    startDay: first?.day ?? null,
    endDay: last?.day ?? null,
    actualDayDelta: first && last ? last.day - first.day : 0,
    completedFrames,
    frameTimesMs,
    averageFps: elapsed > 0 ? (completedFrames * 1000) / elapsed : 0,
    frameTimeP95,
    slowFrameFps: frameTimeP95 !== null && frameTimeP95 > 0 ? 1000 / frameTimeP95 : 0,
    firstPostrenderTimestamp,
    lastPostrenderTimestamp,
    headGapMs: firstPostrenderTimestamp === null ? null : firstPostrenderTimestamp - started,
    tailGapMs: lastPostrenderTimestamp === null ? null : ended - lastPostrenderTimestamp,
    minMarching,
    minPaidLegs,
    maxPaidLegs,
    minMountedArmies,
    minVisibleArmies,
    maxVisibleArmies,
    visibilityMetric: 'renderer-cull-visible-chips/not-GPU-presented-pixels' as const,
    sessionSamples,
    interruptions,
    observationErrors,
    resourcesBefore: before.resources,
    resourcesAfter: after?.resources ?? null,
    lodStage: after?.lodStage ?? null,
  };
}
