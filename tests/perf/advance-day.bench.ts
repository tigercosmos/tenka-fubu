import { beforeAll, bench, describe } from 'vitest';
import type { GameState } from '../../src/core/state/gameState';
import { advanceDay } from '../../src/core/systems';
import { TESTCFG } from '../config';
import { buildFullState } from '../helpers/fullState';

let state: GameState;

beforeAll(async () => {
  state = await buildFullState({ seed: TESTCFG.goldenSeedFull });
  for (let day = 0; day < TESTCFG.perfWarmupDays; day += 1) {
    advanceDay(state, []);
  }
});

describe('advanceDay reference benchmark', () => {
  bench(
    's1560 advanceDay (reports mean/p99)',
    () => {
      advanceDay(state, []);
    },
    {
      // 固定 360 個 sample：報表的 mean/p99 每次都對應同一長度遊戲窗口。
      iterations: TESTCFG.perfMeasureDays,
      time: 0,
      warmupIterations: 0,
      warmupTime: 0,
    },
  );
});
