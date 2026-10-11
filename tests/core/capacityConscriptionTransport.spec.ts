import { describe, expect, it } from 'vitest';
import { applyTransport, validateTransport } from '../../src/core/commands/domesticCommands';
import { castleMaxSoldiers } from '../../src/core/domestic';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import type { GameState } from '../../src/core/state/gameState';
import type { CastleId, PolicyId } from '../../src/core/state/ids';
import { validateState } from '../../src/core/state/invariants';
import { conscriptionSystem } from '../../src/core/systems/conscription';
import { transportDaily } from '../../src/core/systems/transport';
import { advanceOneDay } from '../../src/core/systems/time';
import { buildTinyState, CASTLE_A1, CASTLE_A2, CLAN_ALPHA } from '../fixtures/tiny';

function fixture(castleId: CastleId, population: number, soldiers: number): GameState {
  const state = buildTinyState();
  state.policies[CLAN_ALPHA]!.active = ['pol.jokashuju' as PolicyId];
  const castle = state.castles[castleId]!;
  castle.soldiers = soldiers;
  castle.conscriptPolicy = 'mid';
  castle.districtIds.forEach((id, index) => {
    state.districts[id]!.population = index === 0 ? population : 0;
  });
  expect(validateState(state)).toEqual([]);
  return state;
}

describe('fractional castle capacity integer writes', () => {
  it.each([
    [25_000, 1687, 1688, 1],
    [24_880, 1684, 1684, 0],
    [25_160, 1691, 1692, 1],
    [25_000, 1690, 1690, 0],
  ])(
    'recruits integer actual amounts at population %i and garrison %i',
    (population, soldiers, expected, gain) => {
      const state = fixture(CASTLE_A1, population, soldiers);
      const rng = structuredClone(state.rng);
      const events = conscriptionSystem(state).filter(
        (event) => event.type === 'conscript.completed' && event.castleId === CASTLE_A1,
      );
      expect(state.castles[CASTLE_A1]!.soldiers).toBe(expected);
      if (gain === 0) expect(events).toEqual([]);
      else
        expect(events).toEqual([
          {
            type: 'conscript.completed',
            day: state.time.day,
            clanIds: [CLAN_ALPHA],
            castleId: CASTLE_A1,
            soldiers: gain,
          },
        ]);
      expect(state.rng).toEqual(rng);
      expect(validateState(state)).toEqual([]);
      const restored = decodeSave(encodeSave(state, 123));
      expect(restored.ok).toBe(true);
      if (!restored.ok) throw new Error('Integer recruitment failed native save validation');
      expect(restored.saveFile.state.castles[CASTLE_A1]!.soldiers).toBe(expected);
    },
  );

  it.each([
    [25_000, 1187, 1188, 1187.5],
    [24_880, 1184, 1184, 1184.2],
    [25_160, 1191, 1192, 1191.9],
    [25_000, 1190, 1190, 1187.5],
  ])(
    'moves legal integer cargo without duplicating it at population %i and garrison %i',
    (population, soldiers, expected, capacity) => {
      const state = fixture(CASTLE_A2, population, soldiers);
      expect(castleMaxSoldiers(state, state.castles[CASTLE_A2]!)).toBeCloseTo(capacity);
      const command = {
        type: 'transport' as const,
        clanId: CLAN_ALPHA,
        fromCastleId: CASTLE_A1,
        toCastleId: CASTLE_A2,
        soldiers: 3,
        food: 0,
        gold: 0,
      };
      const sourceBefore = state.castles[CASTLE_A1]!.soldiers;
      const rng = structuredClone(state.rng);
      expect(validateTransport(state, command)).toEqual({ ok: true });
      applyTransport(state, command);
      expect(state.castles[CASTLE_A1]!.soldiers).toBe(sourceBefore - 3);
      const decoded = decodeSave(encodeSave(state, 123));
      expect(decoded.ok).toBe(true);
      if (!decoded.ok)
        throw new Error('Legal in-flight integer cargo failed native save validation');
      const restored = decoded.saveFile.state;
      let arrivals = 0;
      for (let day = 0; day < 30 && Object.keys(state.transports).length; day += 1) {
        advanceOneDay(state.time);
        advanceOneDay(restored.time);
        const events = transportDaily(state);
        expect(transportDaily(restored)).toEqual(events);
        expect(restored).toEqual(state);
        expect(validateState(state)).toEqual([]);
        expect(validateState(restored)).toEqual([]);
        for (const event of events)
          if (event.type === 'transport.arrived') {
            arrivals += 1;
            expect(event.soldiers).toBe(3); // Original dispatched cargo, not accepted capacity delta.
          }
      }
      expect(arrivals).toBe(1);
      expect(Object.keys(state.transports)).toHaveLength(0);
      expect(state.castles[CASTLE_A2]!.soldiers).toBe(expected);
      expect(transportDaily(state)).toEqual([]);
      expect(state.castles[CASTLE_A2]!.soldiers).toBe(expected);
      expect(state.rng).toEqual(rng);
    },
  );
});
