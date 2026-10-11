export interface TickMeasurement {
  averageMs: number;
  samplesMs: number[];
}

/** Preserve the real gate's outer elapsed window and per-tick diagnostic samples. */
export function measureTicks(options: {
  warmupTicks: number;
  measuredTicks: number;
  tick: () => void;
  afterWarmup: () => void;
  now: () => bigint;
}): TickMeasurement {
  for (let index = 0; index < options.warmupTicks; index++) options.tick();
  options.afterWarmup();
  const samplesMs: number[] = [];
  const start = options.now();
  for (let index = 0; index < options.measuredTicks; index++) {
    const tickStart = options.now();
    options.tick();
    samplesMs.push(Number(options.now() - tickStart) / 1e6);
  }
  const averageMs = Number(options.now() - start) / 1e6 / options.measuredTicks;
  return { averageMs, samplesMs };
}

export function performanceLimitMs(baseMs: number, ciFactor: number, ci: boolean): number {
  return baseMs * (ci ? ciFactor : 1);
}

/** Retry a slow measurement once; workload/invariant exceptions are never timing retries. */
export async function runPerformanceGate<T extends TickMeasurement>(options: {
  limitMs: number;
  measureAttempt: () => Promise<T>;
  onAttempt: (measurement: T, attemptNumber: number) => void;
}): Promise<{ passed: boolean; attempts: T[] }> {
  const attempts: T[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const measured = await options.measureAttempt();
    attempts.push(measured);
    options.onAttempt(measured, attempt + 1);
    if (measured.averageMs < options.limitMs) return { passed: true, attempts };
  }
  return { passed: false, attempts };
}
