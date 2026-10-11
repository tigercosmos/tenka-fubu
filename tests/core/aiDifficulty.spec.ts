import { expect, it } from 'vitest';
import { buildTinyState } from '../fixtures/tiny';
import { DIFFICULTY_MODS, getDifficultyMods } from '../../src/core/systems/ai/difficulty';

it('uses all four difficulty modifiers only for nonplayer clans and returns detached values', () => {
  const state = buildTinyState();
  state.meta.difficulty = 'hard';
  expect(getDifficultyMods(state)).toEqual({
    incomeMult: 1.2,
    moraleBonus: 10,
    councilTimes: 2,
    coopMax: 4,
  });
  expect(getDifficultyMods(state, state.meta.playerClanId)).toEqual(DIFFICULTY_MODS.normal);
  const mods = getDifficultyMods(state);
  mods.incomeMult = 10;
  expect(getDifficultyMods(state).incomeMult).toBe(1.2);
  state.meta.difficulty = 'easy';
  expect(getDifficultyMods(state)).toEqual({
    incomeMult: 0.8,
    moraleBonus: 0,
    councilTimes: 1,
    coopMax: 2,
  });
});
