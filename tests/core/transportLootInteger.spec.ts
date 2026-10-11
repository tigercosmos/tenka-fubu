import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { CommandQueue } from '../../src/core/commands/queue';
import { validateCommand } from '../../src/core/commands/validate';
import type { Command } from '../../src/core/commands/types';
import type { RoadEdgeId } from '../../src/core/state/ids';
import { validateState } from '../../src/core/state/invariants';
import { advanceDay } from '../../src/core/systems';
import { ensureDiplomacyRow } from '../../src/core/systems/diplomacyCommon';
import { armyPhysicalLeg } from '../../src/core/systems/armyReroute';
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

describe('normal-day transport loot preserves integer army food', () => {
  it.each([10, 1000])(
    'interdicts legal cargo food=%s without creating fractional resources',
    (food) => {
      // Controlled initial corridor and stocks; all subsequent movement/resources are core-owned.
      const state = buildTinyState();
      state.castles[CASTLE_B1]!.food = 50;
      state.officers[OFF_BETA_BUSHO]!.traits = [];
      state.roads['road.a1-a2' as RoadEdgeId]!.baseDays = 30;
      for (const [id, a, b, baseDays] of [
        ['road.loot-in', CASTLE_A1, DIST_B1X, 2],
        ['road.loot-out', DIST_B1X, CASTLE_A2, 2],
      ] as const) {
        state.roads[id as RoadEdgeId] = {
          id: id as RoadEdgeId,
          a,
          b,
          baseDays,
          grade: 1,
          type: 'land',
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
          targetNodeId: DIST_B1X,
        },
        {
          type: 'transport',
          clanId: CLAN_ALPHA,
          fromCastleId: CASTLE_A1,
          toCastleId: CASTLE_A2,
          soldiers: 0,
          gold: 0,
          food,
        },
      ];
      const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
      for (const command of commands) {
        expect(
          validateCommand(
            state,
            command,
            command.clanId === CLAN_BETA ? { kind: 'clan', clanId: CLAN_BETA } : { kind: 'player' },
          ),
        ).toEqual({ ok: true });
        queue.enqueue(
          command,
          state.time.day,
          command.clanId === CLAN_BETA ? { kind: 'clan', clanId: CLAN_BETA } : { kind: 'player' },
        );
      }
      const first = advanceDay(state, queue.drain());
      expect(first.appliedCommands).toHaveLength(2);
      expect(first.events.filter((event) => event.type === 'command.rejected')).toEqual([]);
      expect(validateState(state)).toEqual([]);
      const army = Object.values(state.armies)[0]!;
      expect(army.posNodeId).toBe(DIST_B1X);
      expect(armyPhysicalLeg(army)).toBeNull();
      expect(army.soldiers).toBe(101);
      const beforeFood = army.food;
      const daily = Math.ceil(army.soldiers * BAL.fieldFoodPerSoldierDaily);
      const capacity = Math.floor(army.soldiers * BAL.fieldFoodPerSoldierDaily * BAL.maxCarryDays);
      const accepted = Math.min(food, Math.max(0, capacity - beforeFood));
      const second = advanceDay(state, []);
      expect(second.events.filter((event) => event.type === 'transport.looted')).toMatchObject([
        { nodeId: DIST_B1X, byClanId: CLAN_BETA, ownerClanId: CLAN_ALPHA, food },
      ]);
      expect(Object.values(state.transports)).toHaveLength(0);
      // Returning to its own castle deposits the legitimately looted cargo after daily consumption.
      const returned = second.events.find((event) => event.type === 'army.returned');
      expect(returned).toBeDefined();
      expect(state.castles[CASTLE_B1]!.food).toBe(beforeFood + accepted - daily);
      expect(validateState(state)).toEqual([]);
    },
  );
});
