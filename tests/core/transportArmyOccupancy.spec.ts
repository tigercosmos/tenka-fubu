import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { CommandQueue } from '../../src/core/commands/queue';
import { validateCommand } from '../../src/core/commands/validate';
import type { Command } from '../../src/core/commands/types';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import type { RoadEdgeId } from '../../src/core/state/ids';
import { validateState } from '../../src/core/state/invariants';
import { advanceDay } from '../../src/core/systems';
import { armyPhysicalLeg } from '../../src/core/systems/armyReroute';
import { ensureDiplomacyRow } from '../../src/core/systems/diplomacyCommon';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  DIST_B1X,
  OFF_BETA_BUSHO,
} from '../fixtures/tiny';

function fixture(onNode: boolean) {
  const state = buildTinyState();
  // Controlled legal initial roads; no army/transport/status/resource injection after setup.
  state.roads['road.a1-a2' as RoadEdgeId]!.baseDays = 30;
  state.castles[CASTLE_B1]!.food = 50;
  state.officers[OFF_BETA_BUSHO]!.traits = [];
  for (const [id, a, b, baseDays] of [
    ['road.occupancy-in', CASTLE_A1, DIST_B1X, onNode ? 1 : 3],
    ['road.occupancy-out', DIST_B1X, CASTLE_A2, 2],
  ] as const) {
    state.roads[id as RoadEdgeId] = {
      id: id as RoadEdgeId,
      a,
      b,
      baseDays,
      type: 'land',
      grade: 1,
    };
  }
  ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA).lastHostileDay = state.time.day;
  expect(validateState(state)).toEqual([]);
  const commands: Command[] = [
    {
      type: 'march',
      clanId: CLAN_BETA,
      originCastleId: CASTLE_B1,
      leaderId: OFF_BETA_BUSHO,
      deputyIds: [],
      soldiers: 101,
      food: 50,
      targetNodeId: onNode ? DIST_B1X : CASTLE_A1,
    },
    {
      type: 'transport',
      clanId: CLAN_ALPHA,
      fromCastleId: CASTLE_A1,
      toCastleId: CASTLE_A2,
      soldiers: 50,
      food: 100,
      gold: 20,
    },
  ];
  const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  for (const command of commands) {
    const authority =
      command.clanId === CLAN_BETA
        ? { kind: 'clan' as const, clanId: CLAN_BETA }
        : { kind: 'player' as const };
    expect(validateCommand(state, command, authority)).toEqual({ ok: true });
    queue.enqueue(command, state.time.day, authority);
  }
  return { state, queue };
}

function persistent(state: ReturnType<typeof buildTinyState>) {
  const copy = structuredClone(state);
  copy.ai.intentLog = [];
  return copy;
}

describe('transport interception requires physical enemy node occupancy', () => {
  it.each([false, true])(
    'does not loot at an army departure cursor, including native continuation; recall=%s',
    (recall) => {
      const { state, queue } = fixture(false);
      const first = advanceDay(state, queue.drain());
      expect(first.appliedCommands).toHaveLength(2);
      expect(first.events.some((event) => event.type === 'command.rejected')).toBe(false);
      expect(validateState(state)).toEqual([]);
      const army = Object.values(state.armies)[0]!;
      expect(army.posNodeId).toBe(DIST_B1X);
      expect(armyPhysicalLeg(army)).toBeNull();
      const beforeLeg = decodeSave(encodeSave(state, 0));
      expect(beforeLeg.ok).toBe(true);
      if (!beforeLeg.ok) throw new Error(beforeLeg.code);
      const second = advanceDay(state, []);
      expect(advanceDay(beforeLeg.saveFile.state, []).events).toEqual(second.events);
      expect(persistent(beforeLeg.saveFile.state)).toEqual(persistent(state));
      expect(army.posNodeId).toBe(DIST_B1X);
      expect(armyPhysicalLeg(army)).toMatchObject({
        from: DIST_B1X,
        end: CASTLE_A1,
        progress: 1,
        cost: 3,
      });
      expect(validateState(state)).toEqual([]);
      const midLeg = decodeSave(encodeSave(state, 0));
      expect(midLeg.ok).toBe(true);
      if (!midLeg.ok) throw new Error(midLeg.code);
      const restored = midLeg.saveFile.state;
      if (recall) {
        const command = { type: 'recallArmy' as const, clanId: CLAN_BETA, armyId: army.id };
        const authority = { kind: 'clan' as const, clanId: CLAN_BETA };
        expect(validateCommand(state, command, authority)).toEqual({ ok: true });
        queue.enqueue(command, state.time.day, authority);
      }
      const destinationBefore = structuredClone(state.castles[CASTLE_A2]!);
      const goldBefore = state.clans[CLAN_ALPHA]!.gold;
      for (let day = 3; day <= 5; day++) {
        const commands = queue.drain();
        const result = advanceDay(state, commands);
        expect(result.events.some((event) => event.type === 'command.rejected')).toBe(false);
        if (recall && day === 3) expect(result.appliedCommands).toHaveLength(1);
        expect(advanceDay(restored, commands).events).toEqual(result.events);
        expect(result.events.some((event) => event.type === 'transport.looted')).toBe(false);
        expect(persistent(restored)).toEqual(persistent(state));
        expect(restored.rng).toEqual(state.rng);
        expect(validateState(state)).toEqual([]);
        expect(validateState(restored)).toEqual([]);
        if (day === 3) {
          const order = Object.values(state.transports)[0]!;
          expect(order.path[order.pathCursor]).toBe(DIST_B1X);
          expect(order.edgeCostDays).toBe(0);
          expect(armyPhysicalLeg(army)).not.toBeNull();
        }
        if (day === 5)
          expect(result.events.filter((event) => event.type === 'transport.arrived')).toMatchObject(
            [{ fromCastleId: CASTLE_A1, toCastleId: CASTLE_A2, food: 100, gold: 20, soldiers: 50 }],
          );
      }
      // Normal-day garrison consumption carries fractions and includes delivered troops on day 5.
      const consumed = Math.floor(
        destinationBefore.foodFrac +
          ((3 * destinationBefore.soldiers + 50) * BAL.garrisonFoodPerSoldierMonthly) / 30,
      );
      expect(state.castles[CASTLE_A2]!.food).toBe(destinationBefore.food + 100 - consumed);
      expect(state.castles[CASTLE_A2]!.soldiers).toBe(destinationBefore.soldiers + 50);
      expect(state.clans[CLAN_ALPHA]!.gold).toBe(goldBefore + 20);
      expect(Object.values(state.transports)).toHaveLength(0);
    },
  );

  it('still loots when the real enemy army occupies the actual cargo node', () => {
    const { state, queue } = fixture(true);
    advanceDay(state, queue.drain());
    expect(validateState(state)).toEqual([]);
    const army = Object.values(state.armies)[0]!;
    expect(army.posNodeId).toBe(DIST_B1X);
    expect(armyPhysicalLeg(army)).toBeNull();
    expect(army.edgeCostDays).toBeGreaterThan(0);
    expect(army.edgeProgressDays).toBe(0);
    const result = advanceDay(state, []);
    expect(result.events.filter((event) => event.type === 'transport.looted')).toMatchObject([
      { nodeId: DIST_B1X, byClanId: CLAN_BETA, food: 100, gold: 20, soldiers: 50 },
    ]);
    expect(Object.values(state.transports)).toHaveLength(0);
    expect(validateState(state)).toEqual([]);
  });
});
