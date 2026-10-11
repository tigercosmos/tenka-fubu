import { expect, it } from 'vitest';
import { advanceDay } from '../../src/core/systems';
import { CommandQueue, enqueuePendingAiOrders } from '../../src/core/commands/queue';
import { validateState } from '../../src/core/state/invariants';
import { createRuntimeEventEngine } from '../../src/core/systems/events/runtime';
import { loadS1560EventCatalog, S1560_LOADED_REGIONS } from '../../src/data/scenarios/s1560';
import { REGION_VALUES } from '../../src/core/state/enums';
import { buildFullState } from '../helpers/fullState';
import { TESTCFG } from '../config';
import { measureTicks, performanceLimitMs, runPerformanceGate } from './performanceGate';

async function measureAttempt() {
  expect(S1560_LOADED_REGIONS).toEqual(REGION_VALUES);
  const state = await buildFullState({ seed: TESTCFG.goldenSeedFull, allAi: true });
  const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  const engine = createRuntimeEventEngine(loadS1560EventCatalog());
  const startDay = state.time.day;
  let applied = 0;
  function tick() {
    enqueuePendingAiOrders(state, queue);
    const result = advanceDay(state, queue.drain(), { eventEngine: engine });
    const rejected = result.events.filter((event) => event.type === 'command.rejected');
    if (rejected.length)
      throw new Error(`perf workload rejected commands: ${JSON.stringify(rejected)}`);
    const invalid = state.ai.intentLog.filter(
      (intent) => intent.day === state.time.day && intent.kind === 'error.invalidCommand',
    );
    if (invalid.length) throw new Error(`perf workload invalid intent: ${JSON.stringify(invalid)}`);
    applied += result.appliedCommands.length;
  }
  const measured = measureTicks({
    warmupTicks: TESTCFG.perfWarmupDays,
    measuredTicks: TESTCFG.perfMeasureDays,
    tick,
    afterWarmup: () => expect(validateState(state)).toEqual([]),
    now: () => process.hrtime.bigint(),
  });
  expect(validateState(state)).toEqual([]);
  expect(state.time.day - startDay).toBe(TESTCFG.perfWarmupDays + TESTCFG.perfMeasureDays);
  expect(applied).toBeGreaterThan(0);
  return measured;
}

it('national all-AI/event advanceDay stays below the blocking mean budget (one retry)', async () => {
  const limitMs = performanceLimitMs(
    TESTCFG.advanceDayAvgMsMax,
    TESTCFG.ciPerfFactor,
    Boolean(process.env.CI),
  );
  const { attempts } = await runPerformanceGate({
    limitMs,
    measureAttempt,
    onAttempt: (measured, attempt) => {
      console.info(
        JSON.stringify({
          gate: 'national-advanceDay',
          seed: TESTCFG.goldenSeedFull,
          warmup: TESTCFG.perfWarmupDays,
          measured: TESTCFG.perfMeasureDays,
          attempt,
          limitMs,
          ...measured,
        }),
      );
    },
  });
  expect(
    attempts.at(-1)!.averageMs,
    `national mean must be <${limitMs}ms; attempted means=${attempts.map((a) => a.averageMs).join(',')}`,
  ).toBeLessThan(limitMs);
}, 60_000);
