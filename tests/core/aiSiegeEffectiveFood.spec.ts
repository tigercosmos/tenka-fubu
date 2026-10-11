import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { armyFoodDays } from '../../src/core/armyFood';
import { traitModifier } from '../../src/core/traits';
import { CommandQueue, enqueuePendingAiOrders } from '../../src/core/commands/queue';
import { validateState } from '../../src/core/state/invariants';
import type { RoadEdgeId, TraitId } from '../../src/core/state/ids';
import { advanceDay } from '../../src/core/systems';
import { militaryPhase } from '../../src/core/systems/ai/attackPlan';
import { createAiCommandSink } from '../../src/core/systems/ai';
import { aiScenario } from '../helpers/aiScenario';
import {
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  OFF_ALPHA_BUSHO,
  OFF_ALPHA_TAISHO,
  OFF_BETA_LORD,
} from '../fixtures/tiny';

describe('AI siege retreat uses actual sustainable food days', () => {
  it.each([
    [102, false, 50],
    [251, true, 100],
    [101, false, 50],
    [251, true, 99],
  ] as const)(
    'honors rounded primary food use after normal siege losses: troops=%s Heitan=%s',
    (troops, heitan, initialFood) => {
      const { state, scope } = aiScenario();
      state.castles[CASTLE_A1]!.soldiers = BAL.aiHomeGarrisonMin;
      state.castles[CASTLE_A2]!.soldiers = BAL.aiHomeGarrisonMin + troops;
      state.castles[CASTLE_A2]!.food = initialFood;
      state.castles[CASTLE_B1]!.soldiers = 10;
      // Controlled legal initial fortress endurance, not a realistic national campaign.
      state.castles[CASTLE_B1]!.durability = 10000;
      state.castles[CASTLE_B1]!.maxDurability = 10000;
      state.castles[CASTLE_B1]!.food = 20000;
      state.officers[OFF_ALPHA_BUSHO]!.traits = heitan ? ['trait.heitan' as TraitId] : [];
      state.officers[OFF_ALPHA_TAISHO]!.traits = heitan ? ['trait.heitan' as TraitId] : [];
      state.officers[OFF_BETA_LORD]!.traits = ['trait.rojo' as TraitId];
      state.roads['road.a2-b1' as RoadEdgeId]!.baseDays = 1;
      scope.castleIds = [CASTLE_A2];
      expect(validateState(state)).toEqual([]);
      const sink = createAiCommandSink(state);
      militaryPhase(state, scope, sink.sink);
      const plan = state.ai.clans[CLAN_ALPHA]!.attackPlans[0]!;
      expect(plan).toBeDefined();
      state.ai.pendingOrders.push(...sink.orders);
      const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
      let sawSiege = false;
      let sawBoundary = false;
      const observations = new Map<string, { food: number; soldiers: number }>();
      for (let tick = 1; tick <= 60; tick++) {
        const wasSieging = plan.stage === 'siege';
        enqueuePendingAiOrders(state, queue);
        const result = advanceDay(state, queue.drain());
        expect(result.events.filter((event) => event.type === 'command.rejected')).toEqual([]);
        expect(validateState(state)).toEqual([]);
        const army = Object.values(state.armies).find((candidate) =>
          plan.armyIds.includes(candidate.id),
        );
        if (!army) continue;
        const primary = state.officers[army.leaderId]!;
        const daily = Math.ceil(
          army.soldiers *
            BAL.fieldFoodPerSoldierDaily *
            traitModifier(primary, 'army.foodUseMult').mult,
        );
        const actualDays = army.food / Math.max(1, daily);
        const beforeQuery = structuredClone(state.rng);
        expect(armyFoodDays(state, army)).toBe(actualDays);
        expect(state.rng).toEqual(beforeQuery);
        const previous = observations.get(army.id);
        if (wasSieging && previous !== undefined && previous.soldiers === army.soldiers)
          expect(previous.food - army.food).toBe(daily);
        observations.set(army.id, { food: army.food, soldiers: army.soldiers });
        const oldDays = army.food / Math.max(1, army.soldiers * BAL.fieldFoodPerSoldierDaily);
        if (army.siegeId !== null || plan.abortReason === 'siegeFood') {
          sawSiege = true;
          if (
            (wasSieging || plan.abortReason === 'siegeFood') &&
            (actualDays <= BAL.aiSiegeFoodAbortDays || plan.abortReason === 'siegeFood')
          ) {
            sawBoundary = true;
            expect(plan.abortReason, `actualDays=${actualDays}, oldDays=${oldDays}`).toBe(
              actualDays <= BAL.aiSiegeFoodAbortDays ? 'siegeFood' : null,
            );
            if (initialFood === 99) expect(actualDays).toBe(15);
            break;
          }
        }
      }
      expect(sawSiege).toBe(true);
      expect(sawBoundary).toBe(true);
      expect(plan.abortReason).toBe('siegeFood');
      const originalArmyIds = [...plan.armyIds];
      const returnsOriginalArmy = (command: (typeof state.ai.pendingOrders)[number]['command']) =>
        (command.type === 'returnArmyToCastle' || command.type === 'recallArmy') &&
        originalArmyIds.includes(command.armyId);
      expect(state.ai.pendingOrders.some((order) => returnsOriginalArmy(order.command))).toBe(true);
      enqueuePendingAiOrders(state, queue);
      const settlement = advanceDay(state, queue.drain());
      expect(settlement.events.filter((event) => event.type === 'command.rejected')).toEqual([]);
      expect(settlement.appliedCommands.some((order) => returnsOriginalArmy(order.command))).toBe(
        true,
      );
      expect(
        Object.values(state.sieges).some((siege) =>
          siege.attackerArmyIds.some((id) => originalArmyIds.includes(id)),
        ),
      ).toBe(false);
      expect(validateState(state)).toEqual([]);
    },
  );
});
