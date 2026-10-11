import { describe, expect, it } from 'vitest';
import { castleFoodCap, castleHarvest } from '../../src/core/domestic';
import { economySystem, eventHarvestMultiplier } from '../../src/core/systems/economy';
import { getDifficultyMods } from '../../src/core/systems/ai/difficulty';
import { buildTinyState, CLAN_ALPHA, CLAN_BETA, CASTLE_A1 } from '../fixtures/tiny';

describe('plan10 fixed-point harvest consumer', () => {
  it('reads only current-year clan-local flags without mutating state/RNG', () => {
    const state = buildTinyState();
    const year = state.time.year;
    state.events.flags[`harvest.${year}.${CLAN_ALPHA}`] = 120;
    state.events.flags[`harvest.${year}.${CLAN_BETA}`] = 70;
    state.events.flags[`harvest.${year - 1}.${CLAN_ALPHA}`] = 999;
    const before = structuredClone(state);
    expect(eventHarvestMultiplier(state, CLAN_ALPHA)).toBe(1.2);
    expect(eventHarvestMultiplier(state, CLAN_BETA)).toBe(0.7);
    expect(state).toEqual(before);
    state.time.year += 1;
    expect(eventHarvestMultiplier(state, CLAN_ALPHA)).toBe(1);
    expect(eventHarvestMultiplier(state, CLAN_BETA)).toBe(1);
  });

  it.each([120, 70, undefined])(
    'applies %s before final integer rounding and capacity clipping',
    (percentage) => {
      const state = buildTinyState();
      state.meta.difficulty = 'hard';
      state.time.month = 9;
      state.time.dayOfMonth = 1;
      if (percentage !== undefined)
        state.events.flags[`harvest.${state.time.year}.${CLAN_ALPHA}`] = percentage;
      for (const castle of Object.values(state.castles)) {
        castle.soldiers = 0;
        castle.foodFrac = 0;
        castle.food = 0;
      }
      state.castles[CASTLE_A1]!.food = castleFoodCap(state.castles[CASTLE_A1]!) - 3;
      const expected = Object.values(state.castles).map((castle) => {
        const gross = Math.floor(
          castleHarvest(state, castle.id) *
            getDifficultyMods(state, castle.ownerClanId).incomeMult *
            eventHarvestMultiplier(state, castle.ownerClanId),
        );
        const accepted = Math.min(gross, Math.max(0, castleFoodCap(castle) - castle.food));
        return { castle, gross, accepted, beforeFood: castle.food };
      });
      const events = economySystem(state);
      for (const row of expected) {
        expect(row.castle.food).toBe(row.beforeFood + row.accepted);
        if (row.gross > row.accepted)
          expect(events).toContainEqual(
            expect.objectContaining({
              type: 'economy.granaryOverflow',
              castleId: row.castle.id,
              food: row.gross - row.accepted,
            }),
          );
      }
      for (const clanId of [CLAN_ALPHA, CLAN_BETA])
        expect(events).toContainEqual(
          expect.objectContaining({
            type: 'economy.harvest',
            clanId,
            totalFood: expected
              .filter((row) => row.castle.ownerClanId === clanId)
              .reduce((sum, row) => sum + row.accepted, 0),
          }),
        );
      expect(state.castles[CASTLE_A1]!.food).toBe(castleFoodCap(state.castles[CASTLE_A1]!));
    },
  );
});
