import { buildGameStateFromScenario } from '../../src/core/state/builder';
import type { GameState } from '../../src/core/state/gameState';
import type { ClanId } from '../../src/core/state/ids';
import type { Difficulty } from '../../src/core/state/enums';
import { loadS1560Scenario } from '../../src/data/scenarios/s1560';
import { TESTCFG } from '../config';

export interface BuildFullStateOptions {
  seed?: number;
  allAi?: boolean;
  difficulty?: Difficulty;
}

/** 建立目前已載入的 s1560 資料狀態；code-split loader 使 helper 為 async。 */
export async function buildFullState(opts: BuildFullStateOptions = {}): Promise<GameState> {
  const bundle = await loadS1560Scenario();
  const state = buildGameStateFromScenario(bundle, {
    appVersion: '0.0.0-test',
    seed: opts.seed ?? TESTCFG.goldenSeedFull,
    playerClanId: 'clan.oda' as ClanId,
    difficulty: opts.difficulty ?? 'normal',
    startDay: 0,
  });
  state.ai.allAi = opts.allAi ?? false;
  return state;
}
