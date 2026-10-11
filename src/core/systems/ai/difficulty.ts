import type { GameState } from '../../state/gameState';
import type { ClanId } from '../../state/ids';
import type { Difficulty } from '../../state/enums';
import type { DifficultyMods } from './types';

/** 09 / 15 difficulty table is deliberately separate from neutral BAL constants. */
export const DIFFICULTY_MODS: Readonly<Record<Difficulty, Readonly<DifficultyMods>>> = {
  easy: { incomeMult: 0.8, moraleBonus: 0, councilTimes: 1, coopMax: 2 },
  normal: { incomeMult: 1, moraleBonus: 0, councilTimes: 1, coopMax: 3 },
  hard: { incomeMult: 1.2, moraleBonus: 10, councilTimes: 2, coopMax: 4 },
};

export function getDifficultyMods(state: Readonly<GameState>, clanId?: ClanId): DifficultyMods {
  const level =
    clanId === state.meta.playerClanId && !state.ai.allAi ? 'normal' : state.meta.difficulty;
  return { ...DIFFICULTY_MODS[level] };
}
