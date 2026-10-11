import { expect, it, vi } from 'vitest';
import { TESTCFG } from '../config';
import {
  measureTicks,
  performanceLimitMs,
  runPerformanceGate,
  type TickMeasurement,
} from '../perf/performanceGate';

function fakeMeasurement(measuredMs: number) {
  let clockNs = 0n;
  let ticks = 0;
  const now = vi.fn(() => clockNs);
  const tick = vi.fn(() => {
    ticks++;
    // Deliberately expensive warmup must not leak into the measured average.
    clockNs += BigInt(ticks <= TESTCFG.perfWarmupDays ? 1000 : measuredMs) * 1_000_000n;
  });
  const afterWarmup = vi.fn(() => {
    expect(ticks).toBe(60);
    expect(now).not.toHaveBeenCalled();
    clockNs += 500_000_000n; // Pre-measurement invariant checks are outside the window too.
  });
  const measured = measureTicks({
    warmupTicks: TESTCFG.perfWarmupDays,
    measuredTicks: TESTCFG.perfMeasureDays,
    now,
    tick,
    afterWarmup,
  });
  return { measured, tick, now, afterWarmup };
}

it('warms60 then measures360 actual ticks, excluding warmup and validation from timing', () => {
  const { measured, tick, now, afterWarmup } = fakeMeasurement(2);
  expect(tick).toHaveBeenCalledTimes(420);
  expect(afterWarmup).toHaveBeenCalledTimes(1);
  expect(now).toHaveBeenCalledTimes(722); // Outer start/end plus two clocks per sample.
  expect(measured.averageMs).toBe(2);
  expect(measured.samplesMs).toEqual(Array<number>(360).fill(2));
});

it('uses the outer elapsed window, not a cherry-picked average of individual samples', () => {
  let clockNs = 0n;
  const measured = measureTicks({
    warmupTicks: 0,
    measuredTicks: 2,
    tick: () => {
      clockNs += 2_000_000n;
    },
    afterWarmup: () => undefined,
    now: () => {
      const value = clockNs;
      clockNs += 1_000_000n;
      return value;
    },
  });
  expect(measured.samplesMs).toEqual([3, 3]);
  expect(measured.averageMs).toBe(4.5);
});

it('uses strict less-than and the canonical CI multiplier without changing samples', async () => {
  const localLimit = performanceLimitMs(TESTCFG.advanceDayAvgMsMax, TESTCFG.ciPerfFactor, false);
  const ciLimit = performanceLimitMs(TESTCFG.advanceDayAvgMsMax, TESTCFG.ciPerfFactor, true);
  expect(localLimit).toBe(8);
  expect(ciLimit).toBe(16);
  for (const limitMs of [localLimit, ciLimit]) {
    const measureAttempt = vi.fn(() => Promise.resolve(fakeMeasurement(limitMs).measured));
    const result = await runPerformanceGate({
      limitMs,
      measureAttempt,
      onAttempt: () => undefined,
    });
    expect(result.passed).toBe(false);
    expect(measureAttempt).toHaveBeenCalledTimes(2);
    expect(result.attempts.map((a) => a.averageMs)).toEqual([limitMs, limitMs]);
  }
});

it('returns immediately after the first passing attempt and retains every raw sample', async () => {
  const raw = fakeMeasurement(7).measured;
  const measureAttempt = vi.fn(() => Promise.resolve(raw));
  const onAttempt = vi.fn();
  const result = await runPerformanceGate({ limitMs: 8, measureAttempt, onAttempt });
  expect(result.passed).toBe(true);
  expect(measureAttempt).toHaveBeenCalledTimes(1);
  expect(result.attempts).toEqual([raw]);
  expect(result.attempts[0]).toBe(raw);
  expect(onAttempt).toHaveBeenCalledTimes(1);
  expect(onAttempt).toHaveBeenCalledWith(raw, 1);
});

it('first failure retries a fresh full420-tick workload exactly once and preserves both raw attempts', async () => {
  const workloads: ReturnType<typeof fakeMeasurement>[] = [];
  const measureAttempt = vi.fn(() => {
    const fresh = fakeMeasurement(workloads.length === 0 ? 9 : 7);
    workloads.push(fresh);
    return Promise.resolve(fresh.measured);
  });
  const onAttempt = vi.fn();
  const result = await runPerformanceGate({ limitMs: 8, measureAttempt, onAttempt });
  expect(result.passed).toBe(true);
  expect(measureAttempt).toHaveBeenCalledTimes(2);
  expect(workloads[0]!.tick).not.toBe(workloads[1]!.tick);
  for (const workload of workloads) expect(workload.tick).toHaveBeenCalledTimes(420);
  expect(result.attempts.map((a) => a.averageMs)).toEqual([9, 7]);
  expect(result.attempts[0]!.samplesMs).toEqual(Array<number>(360).fill(9));
  expect(result.attempts[1]!.samplesMs).toEqual(Array<number>(360).fill(7));
  expect(onAttempt.mock.calls).toEqual([
    [workloads[0]!.measured, 1],
    [workloads[1]!.measured, 2],
  ]);
});

it('two over-budget attempts remain red, with no third attempt or dropped slow samples', async () => {
  const measureAttempt = vi.fn(() => Promise.resolve(fakeMeasurement(9).measured));
  const result = await runPerformanceGate({
    limitMs: 8,
    measureAttempt,
    onAttempt: () => undefined,
  });
  expect(result.passed).toBe(false);
  expect(measureAttempt).toHaveBeenCalledTimes(2);
  expect(result.attempts).toHaveLength(2);
  expect(result.attempts.flatMap((a) => a.samplesMs)).toEqual(Array<number>(720).fill(9));
});

it('propagates workload exceptions without interpreting them as a slow measurement retry', async () => {
  const error = new Error('actual command rejection');
  const measureAttempt = vi.fn(() => Promise.reject(error));
  const onAttempt = vi.fn();
  await expect(runPerformanceGate({ limitMs: 8, measureAttempt, onAttempt })).rejects.toBe(error);
  expect(measureAttempt).toHaveBeenCalledTimes(1);
  expect(onAttempt).not.toHaveBeenCalled();
});

it('retains the reported first failure if the second workload throws', async () => {
  const raw = fakeMeasurement(9).measured;
  const error = new Error('actual invariant failure');
  const measureAttempt = vi
    .fn<() => Promise<TickMeasurement>>()
    .mockResolvedValueOnce(raw)
    .mockRejectedValueOnce(error);
  const reports: TickMeasurement[] = [];
  await expect(
    runPerformanceGate({
      limitMs: 8,
      measureAttempt,
      onAttempt: (measured) => reports.push(measured),
    }),
  ).rejects.toBe(error);
  expect(measureAttempt).toHaveBeenCalledTimes(2);
  expect(reports).toEqual([raw]);
  expect(reports[0]!.samplesMs).toHaveLength(360);
});

it('does not mask warmup, pre-measurement validation or measured tick exceptions', () => {
  const error = new Error('invalid workload');
  for (const phase of ['warmup', 'validation', 'measured'] as const) {
    let ticks = 0;
    const now = vi.fn(() => 0n);
    expect(() =>
      measureTicks({
        warmupTicks: 1,
        measuredTicks: 1,
        now,
        tick: () => {
          ticks++;
          if ((phase === 'warmup' && ticks === 1) || (phase === 'measured' && ticks === 2))
            throw error;
        },
        afterWarmup: () => {
          if (phase === 'validation') throw error;
        },
      }),
    ).toThrow(error);
    expect(now).toHaveBeenCalledTimes(phase === 'measured' ? 2 : 0);
  }
});
