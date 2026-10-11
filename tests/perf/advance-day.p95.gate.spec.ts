import { expect, it } from 'vitest';
import { advanceDay } from '../../src/core/systems';
import { CommandQueue, enqueuePendingAiOrders } from '../../src/core/commands/queue';
import { validateState } from '../../src/core/state/invariants';
import { createRuntimeEventEngine } from '../../src/core/systems/events/runtime';
import { loadS1560EventCatalog, S1560_LOADED_REGIONS } from '../../src/data/scenarios/s1560';
import { REGION_VALUES } from '../../src/core/state/enums';
import { buildFullState } from '../helpers/fullState';
import { TESTCFG } from '../config';
import { measureP95Ticks } from './p95Gate';

it('opt-in national candidate checkpoint measures actual advanceDay p95 strictly below 8ms', async () => {
  const state = await buildFullState({
    seed: TESTCFG.goldenSeedFull,
    allAi: true,
    difficulty: 'normal',
  });
  const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  const engine = createRuntimeEventEngine(loadS1560EventCatalog());
  // Explicit candidate, not a specification-defined midgame date. 360-day calendar, five elapsed years.
  const checkpointElapsedDays = 5 * 360;
  const startDay = state.time.day;
  let applied = 0;
  let minAlive = Infinity;
  let phase = 'checkpoint-preparation';
  let samplesMs: readonly number[] = [];
  const alive = () => Object.values(state.clans).filter((clan) => clan.alive).length;
  const diagnostics = (error?: unknown) => ({
    gate: 'national-candidate-p95',
    seed: TESTCFG.goldenSeedFull,
    allAi: state.ai.allAi,
    difficulty: 'normal',
    regions: S1560_LOADED_REGIONS,
    nodeVersion: process.version,
    candidateDate: '1565-01-01',
    checkpointElapsedDays,
    phase,
    currentDay: state.time.day,
    currentDate: {
      year: state.time.year,
      month: state.time.month,
      dayOfMonth: state.time.dayOfMonth,
    },
    aliveClans: alive(),
    minMeasuredAlive: Number.isFinite(minAlive) ? minAlive : null,
    appliedCommands: applied,
    limitMs: 8,
    percentile: 'nearest-rank-95',
    durationScope: 'advanceDay-only',
    chronologicalSamplesMs: samplesMs,
    measuredTickCount: samplesMs.length,
    error:
      error instanceof Error
        ? error.stack
        : typeof error === 'string'
          ? error
          : error === undefined
            ? undefined
            : 'Non-Error exception',
  });
  const prepare = () => {
    enqueuePendingAiOrders(state, queue);
    return queue.drain();
  };
  const advance = (commands: ReturnType<typeof prepare>) => {
    lastResult = advanceDay(state, commands, { eventEngine: engine });
  };
  let lastResult: ReturnType<typeof advanceDay> | null = null;
  const validate = () => {
    if (lastResult !== null) {
      applied += lastResult.appliedCommands.length;
      expect(
        lastResult.events.filter((event) => event.type === 'command.rejected'),
        `rejected commands day${state.time.day}`,
      ).toEqual([]);
    }
    const invalid = state.ai.intentLog.filter(
      (intent) => intent.day === state.time.day && intent.kind === 'error.invalidCommand',
    );
    expect(invalid, `invalid AI decisions day${state.time.day}`).toEqual([]);
    expect(validateState(state), `invariants day${state.time.day}`).toEqual([]);
  };
  try {
    expect(S1560_LOADED_REGIONS).toEqual(REGION_VALUES);
    validate();
    for (let day = 0; day < checkpointElapsedDays; day++) {
      advance(prepare());
      validate();
    }
    expect(state.time.year).toBe(1565);
    expect(state.time.month).toBe(1);
    expect(state.time.dayOfMonth).toBe(1);
    expect(state.time.day - startDay).toBe(checkpointElapsedDays);
    phase = 'measurement';
    const measured = measureP95Ticks({
      count: 360,
      prepare: () => {
        minAlive = Math.min(minAlive, alive());
        expect(alive(), `alive clans before day${state.time.day + 1}`).toBeGreaterThanOrEqual(20);
        return prepare();
      },
      advance,
      validate: () => {
        validate();
        minAlive = Math.min(minAlive, alive());
        expect(alive(), `alive clans after day${state.time.day}`).toBeGreaterThanOrEqual(20);
      },
      now: () => process.hrtime.bigint(),
      onFailure: (partial) => {
        samplesMs = partial;
      },
    });
    samplesMs = measured.samplesMs;
    phase = 'completed';
    console.info(JSON.stringify({ ...diagnostics(), p95Ms: measured.p95Ms }));
    expect(samplesMs).toHaveLength(360);
    expect(applied).toBeGreaterThan(0);
    expect(measured.p95Ms).toBeLessThan(8); // No CI multiplier and no timing retry.
  } catch (error) {
    console.error(JSON.stringify(diagnostics(error)));
    throw error;
  }
}, 300_000);
