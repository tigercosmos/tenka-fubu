import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { CommandQueue } from '../../src/core/commands/queue';
import { validateCommand } from '../../src/core/commands/validate';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import type { RoadEdgeId, TraitId } from '../../src/core/state/ids';
import { validateState } from '../../src/core/state/invariants';
import { advanceDay } from '../../src/core/systems';
import { ensureDiplomacyRow } from '../../src/core/systems/diplomacyCommon';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CLAN_ALPHA,
  CLAN_BETA,
  DIST_B1X,
  OFF_ALPHA_BUSHO,
  OFF_ALPHA_LORD,
} from '../fixtures/tiny';

function fixture(role: 'primary' | 'deputy' | 'none', food = 100, enemy = false) {
  const state = buildTinyState();
  state.roads['road.a1-a2' as RoadEdgeId]!.baseDays = 100;
  state.castles[CASTLE_A1]!.food = food;
  state.officers[OFF_ALPHA_BUSHO]!.traits = role === 'primary' ? ['trait.reisei' as TraitId] : [];
  state.officers[OFF_ALPHA_LORD]!.traits = role === 'deputy' ? ['trait.reisei' as TraitId] : [];
  if (enemy) {
    const id = 'road.reisei-frontier' as RoadEdgeId;
    state.roads[id] = { id, a: CASTLE_A1, b: DIST_B1X, baseDays: 1, grade: 1, type: 'land' };
    ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA).lastHostileDay = state.time.day;
  }
  expect(validateState(state)).toEqual([]);
  const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  const command = {
    type: 'march' as const,
    clanId: CLAN_ALPHA,
    originCastleId: CASTLE_A1,
    leaderId: OFF_ALPHA_BUSHO,
    deputyIds: role === 'deputy' ? [OFF_ALPHA_LORD] : [],
    soldiers: 101,
    food,
    targetNodeId: enemy ? DIST_B1X : CASTLE_A2,
  };
  expect(validateCommand(state, command)).toEqual({ ok: true });
  queue.enqueue(command, state.time.day);
  return { state, queue };
}

describe('primary Reisei modifies ordinary daily supply morale loss', () => {
  it.each(['primary', 'none'] as const)(
    'rounds the one-point hostile-land daily write: %s',
    (role) => {
      const { state, queue } = fixture(role, 100, true);
      advanceDay(state, queue.drain());
      expect(validateState(state)).toEqual([]);
      const army = Object.values(state.armies)[0]!;
      expect(army.posNodeId).toBe(DIST_B1X);
      expect(state.districts[DIST_B1X]!.ownerClanId).toBe(CLAN_BETA);
      const before = army.morale;
      advanceDay(state, []);
      const multiplier = role === 'primary' ? 1 - BAL.traitReisei : 1;
      expect(army.morale).toBe(
        Math.round(Math.max(0, before - BAL.moraleEnemyLandDaily * multiplier)),
      );
      // At the canonical one-point rate, final integer rounding preserves the ordinary one-point loss.
      expect(before - army.morale).toBe(1);
      expect(validateState(state)).toEqual([]);
    },
  );
  it.each(['primary', 'deputy', 'none'] as const)('naturally depleted queued march: %s', (role) => {
    const { state, queue } = fixture(role);
    for (let tick = 1; tick <= 33; tick++) {
      const result = advanceDay(state, queue.drain());
      expect(result.events.filter((event) => event.type === 'command.rejected')).toEqual([]);
      expect(validateState(state)).toEqual([]);
    }
    const army = Object.values(state.armies)[0]!;
    expect(army.food).toBe(1);
    expect(army.status).toBe('returning');
    const before = { morale: army.morale, soldiers: army.soldiers };
    const decoded = decodeSave(encodeSave(state, 0));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.code);
    const restored = decoded.saveFile.state;
    const result = advanceDay(state, []);
    expect(advanceDay(restored, []).events).toEqual(result.events);
    expect(result.events.filter((event) => event.type === 'army.starving')).toHaveLength(1);
    const multiplier = role === 'primary' ? 1 - BAL.traitReisei : 1;
    expect(army.morale).toBe(
      Math.round(Math.max(0, before.morale - BAL.noFoodMoraleDaily * multiplier)),
    );
    expect(army.soldiers).toBe(
      before.soldiers - Math.ceil(before.soldiers * BAL.noFoodDesertionRate),
    );
    expect(army.food).toBe(0);
    expect(state.armies[army.id]).toBe(army);
    expect(restored.armies[army.id]).toEqual(state.armies[army.id]);
    const persistent = (game: typeof state) => {
      const copy = structuredClone(game);
      copy.ai.intentLog = [];
      return copy;
    };
    expect(persistent(restored)).toEqual(persistent(state));
    expect(restored.rng).toEqual(state.rng);
    expect(validateState(state)).toEqual([]);
    expect(validateState(restored)).toEqual([]);
  });

  it('keeps naturally routed morale locked after starvation', () => {
    const { state, queue } = fixture('primary', 200);
    let routed = false;
    for (let tick = 1; tick <= 100; tick++) {
      const result = advanceDay(state, queue.drain());
      expect(result.events.filter((event) => event.type === 'command.rejected')).toEqual([]);
      expect(validateState(state)).toEqual([]);
      const army = Object.values(state.armies)[0];
      if (army?.status !== 'routed') continue;
      routed = true;
      const before = { morale: army.morale, soldiers: army.soldiers };
      advanceDay(state, []);
      expect(army.morale).toBe(before.morale);
      expect(army.soldiers).toBeLessThanOrEqual(before.soldiers);
      expect(validateState(state)).toEqual([]);
      break;
    }
    expect(routed).toBe(true);
  });
});
