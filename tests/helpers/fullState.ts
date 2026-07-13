import { buildGameStateFromScenario } from '../../src/core/state/builder';
import type { GameState } from '../../src/core/state/gameState';
import type { ClanId } from '../../src/core/state/ids';
import { loadS1560Scenario } from '../../src/data/scenarios/s1560';
import { TESTCFG } from '../config';

export interface BuildFullStateOptions {
  seed?: number;
}

/** 建立目前 s1560 全國資料狀態；劇本資料為 code-split loader，故 helper 是 async。 */
export async function buildFullState(opts: BuildFullStateOptions = {}): Promise<GameState> {
  const bundle = await loadS1560Scenario();
  return buildGameStateFromScenario(bundle, {
    appVersion: '0.0.0-test',
    seed: opts.seed ?? TESTCFG.goldenSeedFull,
    playerClanId: 'clan.oda' as ClanId,
    difficulty: 'normal',
    startDay: 0,
  });
}
