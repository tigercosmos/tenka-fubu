export interface SimulationRunFailure {
  seed: number;
  phase: 'primary' | 'repeat';
  day: number | null;
  error: string;
}

/** Preserve the observed failure without reinterpreting its day or seed. */
export function recordSimulationFailure(
  seed: number,
  phase: SimulationRunFailure['phase'],
  day: number | null,
  error: unknown,
): SimulationRunFailure {
  return {
    seed,
    phase,
    day,
    error: error instanceof Error ? (error.stack ?? String(error)) : String(error),
  };
}

/** Failed runs cannot disappear from acceptance by selecting only completed survivors. */
export function invalidateFailedSimulationAcceptance<
  T extends {
    status: 'pass' | 'fail' | 'incomplete';
    reasons: Array<{ kind: 'fail' | 'incomplete'; code: string; seed?: number }>;
  },
>(acceptance: T, failures: readonly SimulationRunFailure[]): T {
  const detached = structuredClone(acceptance);
  if (failures.length) {
    detached.status = 'incomplete';
    for (const failure of failures)
      detached.reasons.push({
        kind: 'incomplete',
        code: `${failure.phase}-simulation-failed`,
        seed: failure.seed,
      });
  }
  return detached;
}
