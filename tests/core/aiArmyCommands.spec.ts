import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/core/commands/apply';
import { validateCommand } from '../../src/core/commands/validate';
import { castleMaxSoldiers, castleFoodCap } from '../../src/core/domestic';
import { validateState } from '../../src/core/state/invariants';
import { militaryMovementSystem } from '../../src/core/systems/military';
import { siegeSystem } from '../../src/core/systems/siege';
import { dayToCalendar } from '../../src/core/systems/time';
import { attackPlansDailyTick, militaryPhase } from '../../src/core/systems/ai/attackPlan';
import { planMarchFromCastle, scopeAuthority } from '../../src/core/systems/ai/shared';
import { aiScenario, validatingSink } from '../helpers/aiScenario';
import {
  CLAN_ALPHA,
  CLAN_BETA,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  OFF_ALPHA_BUSHO,
  OFF_ALPHA_LORD,
} from '../fixtures/tiny';

function holdingArmy() {
  const fixture = aiScenario(),
    { state, scope } = fixture;
  const march = planMarchFromCastle(state, scope, state.castles[CASTLE_A1]!, CASTLE_B1)!;
  march.deputyIds = [OFF_ALPHA_BUSHO];
  const q = validatingSink(state);
  expect(q.sink.enqueue(march, scopeAuthority(scope))).toEqual({ ok: true });
  q.flush();
  const army = Object.values(state.armies)[0]!;
  army.status = 'holding';
  return { ...fixture, army, authority: scopeAuthority(scope) };
}
describe('M7 validated directed return and garrison deposit', () => {
  it('routes to the specified own castle and rejects a foreign castle or foreign army', () => {
    const { state, army, authority } = holdingArmy();
    const command = {
      type: 'returnArmyToCastle' as const,
      clanId: CLAN_ALPHA,
      armyId: army.id,
      destinationCastleId: CASTLE_A2,
    };
    expect(
      validateCommand(state, { ...command, destinationCastleId: CASTLE_B1 }, authority).ok,
    ).toBe(false);
    expect(validateCommand(state, { ...command, clanId: CLAN_BETA }, authority).ok).toBe(false);
    expect(validateCommand(state, command, authority)).toEqual({ ok: true });
    applyCommand(state, command, () => {}, authority);
    expect(army.status).toBe('returning');
    expect(army.targetNodeId).toBe(CASTLE_A2);
    expect(army.path.at(-1)).toBe(CASTLE_A2);
    expect(validateState(state)).toEqual([]);
  });
  it.each(['routed', 'engaged'] as const)('rejects return and deposit for %s armies', (status) => {
    const { state, army, authority } = holdingArmy();
    army.status = status;
    expect(
      validateCommand(
        state,
        {
          type: 'returnArmyToCastle',
          clanId: CLAN_ALPHA,
          armyId: army.id,
          destinationCastleId: CASTLE_A2,
        },
        authority,
      ).ok,
    ).toBe(false);
    expect(
      validateCommand(
        state,
        {
          type: 'depositGarrison',
          clanId: CLAN_ALPHA,
          armyId: army.id,
          castleId: CASTLE_A1,
          soldiers: 100,
          food: 10,
        },
        authority,
      ).ok,
    ).toBe(false);
  });
  it('deposits partial troops and food conservatively without relocating or dissolving officers', () => {
    const { state, army, authority } = holdingArmy(),
      castle = state.castles[CASTLE_A1]!,
      soldiers = castle.soldiers + army.soldiers,
      food = castle.food + army.food;
    const command = {
      type: 'depositGarrison' as const,
      clanId: CLAN_ALPHA,
      armyId: army.id,
      castleId: CASTLE_A1,
      soldiers: 100,
      food: 50,
    };
    expect(validateCommand(state, command, authority)).toEqual({ ok: true });
    applyCommand(state, command, () => {}, authority);
    expect(castle.soldiers + army.soldiers).toBe(soldiers);
    expect(castle.food + army.food).toBe(food);
    expect(state.officers[army.leaderId]!.armyId).toBe(army.id);
    expect(state.officers[OFF_ALPHA_BUSHO]!.armyId).toBe(army.id);
    expect(validateState(state)).toEqual([]);
  });
  it('all-deposit requires all food and executes the complete army/officer lifecycle', () => {
    const { state, army, authority } = holdingArmy(),
      castle = state.castles[CASTLE_A1]!;
    castle.soldiers = 0;
    const total = army.soldiers;
    const command = {
      type: 'depositGarrison' as const,
      clanId: CLAN_ALPHA,
      armyId: army.id,
      castleId: CASTLE_A1,
      soldiers: army.soldiers,
      food: army.food,
    };
    expect(validateCommand(state, { ...command, food: army.food - 1 }, authority).ok).toBe(false);
    expect(validateCommand(state, command, authority)).toEqual({ ok: true });
    applyCommand(state, command, () => {}, authority);
    expect(state.armies[army.id]).toBeUndefined();
    expect(castle.soldiers).toBe(total);
    for (const id of [army.leaderId, ...army.deputyIds]) {
      expect(state.officers[id]!.armyId).toBeNull();
      expect(state.officers[id]!.locationCastleId).toBe(CASTLE_A1);
    }
    expect(validateState(state)).toEqual([]);
  });
  it.each([
    { soldiers: -1, food: 0 },
    { soldiers: 0.5, food: 0 },
    { soldiers: 1, food: 0.5 },
    { soldiers: 0, food: 0 },
    { soldiers: 10000, food: 0 },
    { soldiers: 1, food: 100000 },
  ])('rejects invalid integer/resources %j', (values) => {
    const { state, army, authority } = holdingArmy();
    expect(
      validateCommand(
        state,
        {
          type: 'depositGarrison',
          clanId: CLAN_ALPHA,
          armyId: army.id,
          castleId: CASTLE_A1,
          ...values,
        },
        authority,
      ).ok,
    ).toBe(false);
  });
  it('checks castle troop/food capacity and exact current position', () => {
    const { state, army, authority } = holdingArmy(),
      castle = state.castles[CASTLE_A1]!;
    const command = {
      type: 'depositGarrison' as const,
      clanId: CLAN_ALPHA,
      armyId: army.id,
      castleId: CASTLE_A1,
      soldiers: 1,
      food: 1,
    };
    castle.soldiers = castleMaxSoldiers(state, castle);
    expect(validateCommand(state, command, authority).ok).toBe(false);
    castle.soldiers = 0;
    castle.food = castleFoodCap(castle);
    expect(validateCommand(state, command, authority).ok).toBe(false);
    castle.food = 0;
    army.edgeProgressDays = 0.1;
    expect(validateCommand(state, command, authority).ok).toBe(false);
    army.edgeProgressDays = 0;
    expect(validateCommand(state, { ...command, castleId: CASTLE_A2 }, authority).ok).toBe(false);
    expect(validateCommand(state, { ...command, castleId: CASTLE_B1 }, authority).ok).toBe(false);
  });
  it('allows a corps army to consolidate adjacent newly captured nonmember territory without granting broad control', () => {
    const { state, scope } = aiScenario();
    state.meta.playerClanId = CLAN_ALPHA;
    const create = {
      type: 'createCorps' as const,
      clanId: CLAN_ALPHA,
      corpsLeaderId: OFF_ALPHA_LORD,
      castleIds: [CASTLE_A1, CASTLE_A2],
      directive: 'advance' as const,
      targetNodeId: CASTLE_B1,
    };
    expect(validateCommand(state, create)).toEqual({ ok: true });
    applyCommand(state, create, () => {});
    const corps = Object.values(state.corps)[0]!,
      authority = { kind: 'corps' as const, clanId: CLAN_ALPHA, corpsId: corps.id };
    scope.corpsId = corps.id;
    let q = validatingSink(state);
    militaryPhase(state, scope, q.sink);
    q.flush();
    const plan = state.ai.clans[CLAN_ALPHA]!.attackPlans[0]!,
      castle = state.castles[CASTLE_B1]!;
    for (let day = 0; day < 50 && plan.stage !== 'siege'; day++) {
      state.time.day++;
      Object.assign(state.time, dayToCalendar(state.time.day));
      militaryMovementSystem(state);
      q = validatingSink(state);
      attackPlansDailyTick(state, scope, q.sink);
      q.flush();
    }
    expect(plan.stage).toBe('siege');
    const army = Object.values(state.armies)[0]!;
    castle.morale = 0;
    siegeSystem(state);
    expect(castle.ownerClanId).toBe(CLAN_ALPHA);
    expect(army.status).toBe('holding');
    const command = {
      type: 'depositGarrison' as const,
      clanId: CLAN_ALPHA,
      armyId: army.id,
      castleId: CASTLE_B1,
      soldiers: 100,
      food: 10,
    };
    // An untracked corps army gets no authority over arbitrary nonmember castles.
    expect(validateCommand(state, command, authority).ok).toBe(false);
    q = validatingSink(state);
    attackPlansDailyTick(state, scope, q.sink);
    expect(plan.stage).toBe('consolidate');
    expect(q.orders.some((o) => o.command.type === 'depositGarrison')).toBe(true);
    q.flush();
    expect(
      validateCommand(
        state,
        { type: 'setConscriptPolicy', clanId: CLAN_ALPHA, castleId: CASTLE_B1, policy: 'high' },
        authority,
      ).ok,
    ).toBe(false);
    expect(castle.corpsId).toBeNull();
    expect(castle.soldiers).toBeGreaterThan(0);
    expect(validateState(state)).toEqual([]);
  });
});
