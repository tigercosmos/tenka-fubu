import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { applyCommands, CommandQueue } from '../../src/core/commands/queue';
import { validateCommand } from '../../src/core/commands/validate';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { validateState } from '../../src/core/state/invariants';
import { canonicalStringify } from '../../src/core/state/serialize';
import { militaryMovementSystem } from '../../src/core/systems/military';
import type { RoadEdgeId, TraitId, TaimeiId } from '../../src/core/state/ids';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CLAN_ALPHA,
  DIST_A1X,
  DIST_B1X,
  OFF_ALPHA_LORD,
} from '../fixtures/tiny';

/** Synthetic port corridor; every army and recall is created by a legal queued command. */
function fixture(sea = true, kaizoku = false) {
  const state = buildTinyState();
  state.roads['road.a1-a2' as RoadEdgeId]!.baseDays = 8;
  state.roads['road.a2-b1' as RoadEdgeId]!.baseDays = 8;
  state.districts[DIST_A1X]!.isPort = true;
  state.districts[DIST_B1X]!.isPort = true;
  const edgeId = 'road.sea-modifier-ports' as RoadEdgeId;
  state.roads[edgeId] = {
    id: edgeId,
    a: DIST_A1X,
    b: DIST_B1X,
    type: 'sea',
    grade: 1,
    baseDays: 8,
  };
  state.officers[OFF_ALPHA_LORD]!.traits = kaizoku ? ['trait.kaizoku' as TraitId] : [];
  const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  const command = {
    type: 'march' as const,
    clanId: CLAN_ALPHA,
    originCastleId: CASTLE_A1,
    leaderId: OFF_ALPHA_LORD,
    deputyIds: [],
    soldiers: 200,
    food: 100,
    targetNodeId: sea ? DIST_B1X : CASTLE_A2,
  };
  expect(validateCommand(state, command)).toEqual({ ok: true });
  queue.enqueue(command, state.time.day);
  expect(applyCommands(state, queue.drain(), () => {})).toHaveLength(1);
  const army = Object.values(state.armies)[0]!;
  expect(army.path).toEqual(sea ? [CASTLE_A1, DIST_A1X, DIST_B1X] : [CASTLE_A1, CASTLE_A2]);
  if (sea) {
    for (let day = 0; day < 5 && army.posNodeId !== DIST_A1X; day++) militaryMovementSystem(state);
    expect(army.posNodeId).toBe(DIST_A1X);
  }
  expect(validateState(state)).toEqual([]);
  return { state, army, queue };
}

function recall(context: ReturnType<typeof fixture>) {
  const { state, army, queue } = context;
  const command = { type: 'recallArmy' as const, clanId: CLAN_ALPHA, armyId: army.id };
  expect(validateCommand(state, command)).toEqual({ ok: true });
  queue.enqueue(command, state.time.day);
  expect(applyCommands(state, queue.drain(), () => {})).toHaveLength(1);
  expect(army.status).toBe('returning');
}

describe('sea excludes ordinary land movement modifiers', () => {
  it.each([false, true])(
    'ignores low morale on actual sea ticks while preserving primary Kaizoku=%s',
    (kaizoku) => {
      const { state, army } = fixture(true, kaizoku);
      // Controlled valid morale boundary, not an injected movement status or army.
      army.morale = BAL.marchLowMoraleThreshold - 1;
      const before = army.edgeProgressDays;
      const rng = structuredClone(state.rng);
      militaryMovementSystem(state);
      expect(army.edgeProgressDays - before).toBeCloseTo(kaizoku ? 1 + BAL.traitKaizoku : 1, 12);
      expect(army.status).toBe('marching');
      expect(state.rng).toEqual(rng);
      expect(validateState(state)).toEqual([]);
    },
  );

  it.each([
    [false, 39],
    [true, 39],
    [false, 80],
    [true, 80],
  ] as const)(
    'ignores ordinary modifiers on a legal reverse sea leg; Kaizoku=%s, morale=%s',
    (kaizoku, morale) => {
      const context = fixture(true, kaizoku);
      const { state, army } = context;
      for (let day = 0; day < 3; day++) militaryMovementSystem(state);
      recall(context);
      army.morale = morale;
      const before = army.edgeProgressDays;
      militaryMovementSystem(state);
      expect(before - army.edgeProgressDays).toBeCloseTo(kaizoku ? 1 + BAL.traitKaizoku : 1, 12);
      expect(army.status).toBe('returning');
      expect(validateState(state)).toEqual([]);
    },
  );

  it.each([false, true])(
    'ignores retreat factor for a core-routed sea army; troop-loss route=%s',
    (troopLoss) => {
      const { state, army } = fixture();
      for (let day = 0; day < 3; day++) militaryMovementSystem(state);
      if (troopLoss) army.soldiers = Math.ceil(army.initialTroops * BAL.routTroopRatio) - 1;
      else army.morale = BAL.moraleBreakThreshold;
      const before = army.edgeProgressDays;
      const events = militaryMovementSystem(state);
      expect(events.some((event) => event.type === 'army.routed')).toBe(true);
      expect(army.status).toBe('routed');
      expect(before - army.edgeProgressDays).toBeCloseTo(1, 12);
      expect(validateState(state)).toEqual([]);
    },
  );

  it('preserves land low-morale, primary trait, return and taimei composition with the existing clamp', () => {
    const context = fixture(false);
    const { state, army, queue } = context;
    state.officers[OFF_ALPHA_LORD]!.traits = ['trait.shinsoku' as TraitId];
    const taimeiId = 'taimei.shippu-jinrai' as TaimeiId;
    state.clans[CLAN_ALPHA]!.prestige = BAL.taimeiUnlockPrestige['taimei.shippu-jinrai'];
    const invoke = { type: 'invokeTaimei' as const, clanId: CLAN_ALPHA, taimeiId };
    expect(validateCommand(state, invoke)).toEqual({ ok: true });
    queue.enqueue(invoke, state.time.day);
    expect(applyCommands(state, queue.drain(), () => {})).toHaveLength(1);
    army.morale = BAL.marchLowMoraleThreshold - 1;
    const forward = Math.min(
      BAL.marchSpeedMax,
      Math.max(
        BAL.marchSpeedMin,
        (1 + BAL.traitShinsoku) * BAL.marchLowMoraleFactor * (1 + BAL.taimeiShippuSpeedBonus),
      ),
    );
    militaryMovementSystem(state);
    expect(army.edgeProgressDays).toBeCloseTo(forward, 12);
    for (let day = 0; day < 2; day++) militaryMovementSystem(state);
    recall(context);
    const before = army.edgeProgressDays;
    militaryMovementSystem(state);
    expect(before - army.edgeProgressDays).toBeCloseTo(
      Math.min(BAL.marchSpeedMax, Math.max(BAL.marchSpeedMin, forward * BAL.retreatSpeedFactor)),
      12,
    );
    expect(validateState(state)).toEqual([]);
  });

  it('preserves partial reverse sea legs through native save continuation and RNG', () => {
    const context = fixture(true, true);
    const { state, army } = context;
    for (let day = 0; day < 3; day++) militaryMovementSystem(state);
    recall(context);
    army.morale = BAL.marchLowMoraleThreshold - 1;
    const decoded = decodeSave(encodeSave(state, 0));
    if (!decoded.ok) throw new Error(decoded.code);
    const restored = decoded.saveFile.state;
    const rng = structuredClone(state.rng);
    for (let day = 0; day < 4; day++) {
      expect(militaryMovementSystem(restored)).toEqual(militaryMovementSystem(state));
      expect(canonicalStringify(restored)).toBe(canonicalStringify(state));
      expect(validateState(state)).toEqual([]);
      expect(validateState(restored)).toEqual([]);
    }
    expect(state.rng).toEqual(rng);
  });
});
