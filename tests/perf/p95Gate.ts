/** Nearest-rank percentile; input remains chronological and unmodified. */
export function nearestRankP95(samples: readonly number[]): number {
  if (samples.length === 0 || samples.some((value) => !Number.isFinite(value) || value < 0))
    throw new Error('Invalid p95 samples');
  return [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * 0.95) - 1]!;
}

/** Only advance is timed. Preparation, validation and artifact callbacks are outside the clock. */
export function measureP95Ticks<T>(options: {
  count: number;
  prepare: () => T;
  advance: (prepared: T) => void;
  validate: () => void;
  now: () => bigint;
  onFailure: (samples: readonly number[], error: unknown) => void;
}): { samplesMs: number[]; p95Ms: number } {
  if (!Number.isInteger(options.count) || options.count <= 0)
    throw new Error('Invalid measurement count');
  const samplesMs: number[] = [];
  try {
    for (let index = 0; index < options.count; index++) {
      const prepared = options.prepare();
      const start = options.now();
      try {
        options.advance(prepared);
      } finally {
        samplesMs.push(Number(options.now() - start) / 1e6);
      }
      options.validate();
    }
    return { samplesMs, p95Ms: nearestRankP95(samplesMs) };
  } catch (error) {
    try {
      options.onFailure([...samplesMs], error);
    } catch {
      // Artifact failure must not replace the original workload/invariant exception.
    }
    throw error;
  }
}
