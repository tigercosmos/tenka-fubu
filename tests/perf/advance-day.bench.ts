import { afterAll, beforeAll, bench, describe, expect } from 'vitest';
import type { GameState } from '../../src/core/state/gameState';
import { advanceDay } from '../../src/core/systems';
import { TESTCFG } from '../config';
import { buildFullState } from '../helpers/fullState';
import { CommandQueue, enqueuePendingAiOrders } from '../../src/core/commands/queue';
import { validateState } from '../../src/core/state/invariants';
import { createRuntimeEventEngine } from '../../src/core/systems/events/runtime';
import { loadS1560EventCatalog } from '../../src/data/scenarios/s1560';
import type { EventEngine } from '../../src/core/systems/events/engine';

let state: GameState;
let queue: CommandQueue;
let engine: EventEngine;

function tick(): void {
  enqueuePendingAiOrders(state, queue);
  advanceDay(state, queue.drain(), { eventEngine: engine });
}

beforeAll(async () => {
  state = await buildFullState({ seed: TESTCFG.goldenSeedFull });
  state.ai.allAi = true;
  queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  engine = createRuntimeEventEngine(loadS1560EventCatalog());
  for (let day = 0; day < TESTCFG.perfWarmupDays; day += 1) {
    tick();
  }
});

afterAll(() => {
  expect(state.meta.lastAppliedCmdSeq).toBeGreaterThan(0);
  expect(validateState(state)).toEqual([]);
});

describe('advanceDay reference benchmark', () => {
  bench('loaded s1560 all-AI queued advanceDay (reports mean/p99)', tick, {
    // 固定 360 個 sample：報表的 mean/p99 每次都對應同一長度遊戲窗口。
    iterations: TESTCFG.perfMeasureDays,
    time: 0,
    warmupIterations: 0,
    warmupTime: 0,
  });
});
