import type { GameState } from '../../src/core/state/gameState';
import {
  adjustSentiment,
  adjustTrust,
  getDiplomacyRow,
} from '../../src/core/systems/diplomacyCommon';
import { CLAN_ALPHA, CLAN_BETA } from '../fixtures/tiny';

/** Controlled admission prerequisites, not a fabricated pact or settlement. */
export function prepareAllianceAdmission(game: GameState): void {
  adjustTrust(game, CLAN_ALPHA, CLAN_BETA, 100);
  adjustSentiment(game, CLAN_BETA, CLAN_ALPHA, 100);
}

export function tinyAllianceRow(game: GameState) {
  return getDiplomacyRow(game, CLAN_ALPHA, CLAN_BETA);
}
