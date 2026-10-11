import { buildNewGameState, loadScenario } from '../../src/app/boot';
import type { ClanId } from '../../src/core/state/ids';

export const COURT_PLAYER = 'clan.ashikaga' as ClanId;

/** Real s1560 capital and ownership; favor is a controlled admission prerequisite. */
export async function prepareCourtAdmission() {
  const bundle = await loadScenario('s1560');
  const game = buildNewGameState(bundle, {
    playerClanId: COURT_PLAYER,
    difficulty: 'normal',
    seed: 42,
  });
  game.court.shogunateFavor[COURT_PLAYER] = 50;
  game.court.patronClanId = null;
  return game;
}
