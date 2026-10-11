import { describe, expect, it } from 'vitest';
import { attackPlansDailyTick, militaryPhase } from '../../src/core/systems/ai/attackPlan';
import { militaryMovementSystem } from '../../src/core/systems/military';
import { dayToCalendar } from '../../src/core/systems/time';
import { applyCommand } from '../../src/core/commands/apply';
import { validateCommand } from '../../src/core/commands/validate';
import { validateState } from '../../src/core/state/invariants';
import type { RoadEdgeId, SiegeId } from '../../src/core/state/ids';
import { addAiSource, aiScenario, validatingSink } from '../helpers/aiScenario';
import { CASTLE_B1, CLAN_ALPHA, CLAN_BETA } from '../fixtures/tiny';

/** Start an actual siege through ordinary AI orders and movement before controlling troop ratios. */
function fixture(reliefTroops: number) {
  const { state, scope } = aiScenario();
  const extraId = addAiSource(state, 'extra');
  const sourceId = addAiSource(state, 'relief'),
    source = state.castles[sourceId]!;
  source.ownerClanId = CLAN_BETA;
  source.soldiers = 0;
  source.food = 20000;
  for (const id of source.districtIds) state.districts[id]!.ownerClanId = CLAN_BETA;
  const leader = state.officers[source.lordId!]!;
  leader.clanId = CLAN_BETA;
  leader.rank = 'shukuro';
  state.roads['road.relief-0' as RoadEdgeId]!.b = CASTLE_B1;
  scope.targetNodeId = CASTLE_B1;
  let q = validatingSink(state);
  militaryPhase(state, scope, q.sink);
  q.flush();
  const plan = state.ai.clans[CLAN_ALPHA]!.attackPlans[0]!;
  for (let day = 0; day < 80; day++) {
    if (
      plan.stage === 'siege' &&
      plan.armyIds.every((id) => state.armies[id]?.status === 'sieging')
    )
      break;
    state.time.day++;
    Object.assign(state.time, dayToCalendar(state.time.day));
    militaryMovementSystem(state);
    q = validatingSink(state);
    attackPlansDailyTick(state, scope, q.sink);
    q.flush();
  }
  expect(plan.stage).toBe('siege');
  const extra = state.castles[extraId]!;
  extra.soldiers = 5000;
  extra.food = 20000;
  const extraMarch = {
    type: 'march' as const,
    clanId: CLAN_ALPHA,
    originCastleId: extraId,
    leaderId: extra.lordId!,
    deputyIds: [],
    soldiers: 1000,
    food: 1200,
    targetNodeId: CASTLE_B1,
  };
  const authority = { kind: 'clan' as const, clanId: CLAN_ALPHA };
  expect(validateCommand(state, extraMarch, authority)).toEqual({ ok: true });
  applyCommand(state, extraMarch, () => {}, authority);
  const extraArmy = Object.values(state.armies).find((a) => a.originCastleId === extraId)!;
  plan.armyIds.push(extraArmy.id);
  for (let day = 0; day < 30 && extraArmy.status !== 'sieging'; day++)
    militaryMovementSystem(state);
  const besiegers = plan.armyIds.map((id) => state.armies[id]!);
  expect(besiegers).toHaveLength(2);
  for (const army of besiegers) {
    expect(army.status).toBe('sieging');
    army.soldiers = 1000;
    army.food = 20000;
  }
  source.soldiers = 10000;
  const cmd = {
    type: 'march' as const,
    clanId: CLAN_BETA,
    originCastleId: sourceId,
    leaderId: leader.id,
    deputyIds: [],
    soldiers: reliefTroops,
    food: Math.ceil(reliefTroops * 1.2),
    targetNodeId: CASTLE_B1,
  };
  expect(validateCommand(state, cmd)).toEqual({ ok: true });
  applyCommand(state, cmd, () => {});
  state.ai.intentLog = [];
  expect(validateState(state)).toEqual([]);
  return { state, scope, plan, besiegers, leader, sourceId };
}

describe('09 siege relief raw troop ratio', () => {
  it.each([1, 120])(
    'holds at the exact 1.0 boundary regardless of relief leadership %s',
    (leadership) => {
      const { state, scope, leader } = fixture(1900);
      leader.ldr = leadership;
      expect(validateState(state)).toEqual([]);
      const q = validatingSink(state);
      attackPlansDailyTick(state, scope, q.sink);
      expect(state.ai.intentLog.some((i) => i.detail.reason === 'siegeRelief')).toBe(false);
      expect(state.ai.intentLog.some((i) => i.kind === 'siege.hold')).toBe(true);
      q.flush();
      expect(validateState(state)).toEqual([]);
    },
  );

  it('withdraws below 1.0 even when attacker leadership greatly exceeds relief leadership', () => {
    const { state, scope, besiegers, leader } = fixture(1901);
    leader.ldr = 1;
    for (const army of besiegers) state.officers[army.leaderId]!.ldr = 120;
    expect(validateState(state)).toEqual([]);
    const q = validatingSink(state);
    attackPlansDailyTick(state, scope, q.sink);
    expect(state.ai.intentLog.some((i) => i.detail.reason === 'siegeRelief')).toBe(true);
    expect(q.orders.some((o) => o.command.type === 'returnArmyToCastle')).toBe(true);
    q.flush();
    expect(validateState(state)).toEqual([]);
  });

  it('does not count a plan army bound to a different castle siege', () => {
    const { state, scope, besiegers, sourceId } = fixture(1000);
    const army = besiegers[1]!,
      original = state.sieges[army.siegeId!]!;
    original.attackerArmyIds = original.attackerArmyIds.filter((id) => id !== army.id);
    const otherId = 'siege.000999' as SiegeId;
    state.sieges[otherId] = {
      ...structuredClone(original),
      id: otherId,
      castleId: sourceId,
      attackerArmyIds: [army.id],
    };
    army.siegeId = otherId;
    army.soldiers = 9000;
    army.posNodeId = sourceId;
    army.path = [sourceId];
    army.pathCursor = 0;
    army.edgeProgressDays = 0;
    army.edgeCostDays = 0;
    army.targetNodeId = sourceId;
    expect(validateState(state)).toEqual([]);
    const q = validatingSink(state);
    attackPlansDailyTick(state, scope, q.sink);
    expect(state.ai.intentLog.some((i) => i.detail.reason === 'siegeRelief')).toBe(true);
    expect(q.orders.some((o) => o.command.type === 'setSiegeMode')).toBe(false);
    q.flush();
    expect(validateState(state)).toEqual([]);
  });

  it('issues legal interception commands while retaining the raw garrison minimum', () => {
    const { state, scope, besiegers, leader } = fixture(600);
    leader.ldr = 1;
    for (const army of besiegers) state.officers[army.leaderId]!.ldr = 120;
    expect(validateState(state)).toEqual([]);
    const q = validatingSink(state);
    attackPlansDailyTick(state, scope, q.sink);
    expect(q.orders.filter((o) => o.command.type === 'setArmyTarget')).toHaveLength(1);
    q.flush();
    expect(
      besiegers.filter((a) => a.status === 'sieging').reduce((sum, a) => sum + a.soldiers, 0),
    ).toBeGreaterThanOrEqual(300);
    expect(validateState(state)).toEqual([]);
  });

  it('does not apply target-castle assault or encirclement decisions to another siege', () => {
    const { state, scope, besiegers, sourceId } = fixture(600);
    const army = besiegers[1]!,
      original = state.sieges[army.siegeId!]!;
    original.attackerArmyIds = original.attackerArmyIds.filter((id) => id !== army.id);
    const otherId = 'siege.000999' as SiegeId;
    state.sieges[otherId] = {
      ...structuredClone(original),
      id: otherId,
      castleId: sourceId,
      attackerArmyIds: [army.id],
      mode: 'assault',
    };
    Object.assign(army, {
      siegeId: otherId,
      soldiers: 9000,
      posNodeId: sourceId,
      path: [sourceId],
      pathCursor: 0,
      edgeProgressDays: 0,
      edgeCostDays: 0,
      targetNodeId: sourceId,
    });
    // The relief army remains real but is no longer within the approach neighborhood.
    const relief = Object.values(state.armies).find((a) => a.clanId === CLAN_BETA)!;
    relief.status = 'returning';
    relief.mission = 'return';
    expect(validateState(state)).toEqual([]);
    const q = validatingSink(state);
    attackPlansDailyTick(state, scope, q.sink);
    expect(
      q.orders.some((o) => o.command.type === 'setSiegeMode' && o.command.siegeId === otherId),
    ).toBe(false);
    q.flush();
    expect(state.sieges[otherId].mode).toBe('assault');
    expect(validateState(state)).toEqual([]);
  });
});
