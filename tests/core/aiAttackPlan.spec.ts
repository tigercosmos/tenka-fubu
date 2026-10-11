import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { militaryPhase, attackPlansDailyTick } from '../../src/core/systems/ai/attackPlan';
import { militaryMovementSystem } from '../../src/core/systems/military';
import { ensureDiplomacyRow } from '../../src/core/systems/diplomacyCommon';
import { validateState } from '../../src/core/state/invariants';
import { dayToCalendar } from '../../src/core/systems/time';
import { siegeSystem } from '../../src/core/systems/siege';
import { applyCommand } from '../../src/core/commands/apply';
import { validateCommand } from '../../src/core/commands/validate';
import { encodeSave, decodeSave } from '../../src/core/save/serialize';
import { startFieldCombat, fieldCombatSystem } from '../../src/core/systems/fieldCombat';
import type { RoadEdgeId } from '../../src/core/state/ids';
import { addAiSource, aiScenario, validatingSink } from '../helpers/aiScenario';
import { estCastlePower } from '../../src/core/systems/ai/shared';
import {
  CLAN_ALPHA,
  CLAN_BETA,
  CASTLE_A1,
  CASTLE_B1,
  OFF_ALPHA_LORD,
  OFF_ALPHA_BUSHO,
  OFF_BETA_LORD,
  CASTLE_A2,
} from '../fixtures/tiny';

function launch() {
  const fixture = aiScenario(),
    { state, scope } = fixture;
  const q = validatingSink(state);
  militaryPhase(state, scope, q.sink);
  expect(state.ai.clans[CLAN_ALPHA]!.attackPlans).toHaveLength(1);
  q.flush();
  return fixture;
}
function nextDay(state: ReturnType<typeof aiScenario>['state']): void {
  state.time.day++;
  Object.assign(state.time, dayToCalendar(state.time.day));
}
function advance() {
  const fixture = launch(),
    { state, scope } = fixture;
  for (
    let day = 0;
    day < 30 && state.ai.clans[CLAN_ALPHA]!.attackPlans[0]!.stage === 'muster';
    day++
  ) {
    nextDay(state);
    militaryMovementSystem(state);
    const q = validatingSink(state);
    attackPlansDailyTick(state, scope, q.sink);
    q.flush();
  }
  expect(state.ai.clans[CLAN_ALPHA]!.attackPlans[0]!.stage).toBe('advance');
  return fixture;
}
function besiege() {
  const fixture = advance(),
    { state, scope } = fixture;
  for (
    let day = 0;
    day < 50 && state.ai.clans[CLAN_ALPHA]!.attackPlans[0]!.stage === 'advance';
    day++
  ) {
    nextDay(state);
    militaryMovementSystem(state);
    const q = validatingSink(state);
    attackPlansDailyTick(state, scope, q.sink);
    q.flush();
  }
  expect(state.ai.clans[CLAN_ALPHA]!.attackPlans[0]!.stage).toBe('siege');
  return fixture;
}

/** Real muster commands and movement, with daily AI maintenance deferred until arrival. */
function arrivedMuster(troops: number, plannedTroops: number, defenders: number) {
  const fixture = launch(),
    { state } = fixture;
  const plan = state.ai.clans[CLAN_ALPHA]!.attackPlans[0]!;
  for (let day = 0; day < BAL.aiMusterTimeoutDays; day++) {
    if (
      Object.values(plan.sourceLeaderIds).every(
        (id) =>
          state.officers[id]?.locationCastleId === plan.stagingCastleId &&
          state.officers[id]?.armyId === null,
      )
    )
      break;
    nextDay(state);
    militaryMovementSystem(state);
  }
  expect(
    Object.values(plan.sourceLeaderIds).every(
      (id) =>
        state.officers[id]?.locationCastleId === plan.stagingCastleId &&
        state.officers[id]?.armyId === null,
    ),
  ).toBe(true);
  plan.plannedTroops = plannedTroops;
  state.castles[plan.stagingCastleId]!.soldiers = plan.stagingRetainedTroops + troops;
  state.castles[plan.targetCastleId]!.soldiers = defenders;
  expect(validateState(state)).toEqual([]);
  const ratio =
    estCastlePower(state, state.castles[plan.stagingCastleId]!, troops) /
    Math.max(estCastlePower(state, state.castles[plan.targetCastleId]!), 1);
  const required =
    BAL.aiAttackPowerRatioBase -
    (state.ai.personas[state.ai.clans[CLAN_ALPHA]!.personaId]!.aggression / 100) *
      BAL.aiAttackPowerRatioAggrBonus;
  return { ...fixture, plan, ratio, required };
}

describe('M7 ordinary-command attack plans', () => {
  it('waits for a missing arrival through the exact timeout day, then advances with already available troops', () => {
    const { state, scope } = launch();
    const plan = state.ai.clans[CLAN_ALPHA]!.attackPlans[0]!;
    expect(
      Object.values(plan.sourceLeaderIds).some((id) => state.officers[id]?.armyId !== null),
    ).toBe(true);
    plan.plannedTroops = 1000;
    state.castles[plan.targetCastleId]!.soldiers = 2000;
    state.time.day = plan.stageEnteredDay + BAL.aiMusterTimeoutDays;
    Object.assign(state.time, dayToCalendar(state.time.day));
    let q = validatingSink(state);
    attackPlansDailyTick(state, scope, q.sink);
    expect(plan.stage).toBe('muster');
    expect(q.orders).toEqual([]);
    nextDay(state);
    q = validatingSink(state);
    attackPlansDailyTick(state, scope, q.sink);
    expect(plan.stage).toBe('advance');
    expect(q.orders.some((o) => o.command.type === 'march')).toBe(true);
    q.flush();
    expect(validateState(state)).toEqual([]);
  });
  it.each([false, true])('advances at exactly80percent troops alone (timeout=%s)', (timedOut) => {
    const { state, scope, plan, ratio, required } = arrivedMuster(800, 1000, 2000);
    expect(800).toBe(plan.plannedTroops * BAL.aiMusterReadyRatio);
    expect(ratio).toBeLessThan(required);
    if (timedOut) {
      state.time.day = plan.stageEnteredDay + BAL.aiMusterTimeoutDays + 1;
      Object.assign(state.time, dayToCalendar(state.time.day));
    }
    const rng = structuredClone(state.rng),
      q = validatingSink(state);
    attackPlansDailyTick(state, scope, q.sink);
    expect(plan.stage).toBe('advance');
    expect(q.orders.some((o) => o.command.type === 'march')).toBe(true);
    expect(state.rng).toEqual(rng);
    q.flush();
    expect(validateState(state)).toEqual([]);
  });
  it.each([false, true])('advances with sufficient power alone (timeout=%s)', (timedOut) => {
    const { state, scope, plan, ratio, required } = arrivedMuster(500, 2000, 100);
    expect(500).toBeLessThan(plan.plannedTroops * BAL.aiMusterReadyRatio);
    expect(ratio).toBeGreaterThanOrEqual(required);
    if (timedOut) {
      state.time.day = plan.stageEnteredDay + BAL.aiMusterTimeoutDays + 1;
      Object.assign(state.time, dayToCalendar(state.time.day));
    }
    const q = validatingSink(state);
    attackPlansDailyTick(state, scope, q.sink);
    expect(plan.stage).toBe('advance');
    q.flush();
    expect(validateState(state)).toEqual([]);
  });
  it.each([false, true])(
    'aborts just below80percent when power is insufficient (timeout=%s)',
    (timedOut) => {
      const { state, scope, plan, ratio, required } = arrivedMuster(799, 1000, 2000);
      expect(799).toBeLessThan(plan.plannedTroops * BAL.aiMusterReadyRatio);
      expect(ratio).toBeLessThan(required);
      if (timedOut) {
        state.time.day = plan.stageEnteredDay + BAL.aiMusterTimeoutDays + 1;
        Object.assign(state.time, dayToCalendar(state.time.day));
      }
      const q = validatingSink(state);
      attackPlansDailyTick(state, scope, q.sink);
      expect(plan.abortReason).toBe(timedOut ? 'musterTimeout' : 'musterWeak');
      expect(q.orders).toEqual([]);
      expect(validateState(state)).toEqual([]);
    },
  );
  it('does not advance before arrivals or bypass viable food/command validation', () => {
    const waiting = launch(),
      plan = waiting.state.ai.clans[CLAN_ALPHA]!.attackPlans[0]!;
    const q = validatingSink(waiting.state);
    attackPlansDailyTick(waiting.state, waiting.scope, q.sink);
    expect(plan.stage).toBe('muster');
    expect(plan.abortReason).toBeNull();
    expect(q.orders).toEqual([]);
    const ready = arrivedMuster(1000, 1000, 100);
    ready.state.castles[ready.plan.stagingCastleId]!.food = 0;
    const blocked = validatingSink(ready.state);
    attackPlansDailyTick(ready.state, ready.scope, blocked.sink);
    expect(ready.plan.abortReason).toBe('musterDispatchFailed');
    expect(blocked.orders).toEqual([]);
    expect(validateState(ready.state)).toEqual([]);
  });
  it('persists an engaged abort across saves and retries only after real combat resolution', () => {
    const { state, scope } = advance();
    const attacking = Object.values(state.armies)[0]!;
    const enemyCommand = {
      type: 'march' as const,
      clanId: CLAN_BETA,
      originCastleId: CASTLE_B1,
      leaderId: OFF_BETA_LORD,
      deputyIds: [],
      soldiers: 100,
      food: 120,
      targetNodeId: CASTLE_A2,
    };
    expect(validateCommand(state, enemyCommand)).toEqual({ ok: true });
    applyCommand(state, enemyCommand, () => {});
    const enemy = Object.values(state.armies).find((a) => a.clanId === CLAN_BETA)!;
    // A real field-combat boundary establishes the engaged lifecycle and officer references.
    startFieldCombat(state, attacking.posNodeId, [attacking.id], [enemy.id]);
    state.castles[CASTLE_B1]!.soldiers = 20000;
    let q = validatingSink(state);
    attackPlansDailyTick(state, scope, q.sink);
    expect(q.orders).toEqual([]);
    expect(state.ai.clans[CLAN_ALPHA]!.attackPlans[0]!.abortReason).toBe('advanceOutmatched');
    const decoded = decodeSave(encodeSave(state, 123));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error('abort save invalid');
    const loaded = decoded.saveFile.state;
    for (let day = 0; day < 100 && Object.keys(loaded.fieldCombats).length; day++) {
      nextDay(loaded);
      fieldCombatSystem(loaded);
    }
    expect(Object.keys(loaded.fieldCombats)).toHaveLength(0);
    q = validatingSink(loaded);
    attackPlansDailyTick(loaded, scope, q.sink);
    expect(q.orders.some((o) => o.command.type === 'returnArmyToCastle')).toBe(true);
    expect(loaded.ai.clans[CLAN_ALPHA]!.attackPlans).toHaveLength(1);
    q.flush();
    const cleanup = validatingSink(loaded);
    attackPlansDailyTick(loaded, scope, cleanup.sink);
    expect(cleanup.orders).toEqual([]);
    expect(loaded.ai.clans[CLAN_ALPHA]!.attackPlans).toEqual([]);
    expect(validateState(loaded)).toEqual([]);
  });
  it('marshals four hard-difficulty sources with original staging retention and multiple officer troop caps', () => {
    const { state, scope } = aiScenario();
    state.meta.difficulty = 'hard';
    state.officers[OFF_ALPHA_LORD]!.ldr = 10;
    state.officers[OFF_ALPHA_BUSHO]!.ldr = 120;
    scope.castleIds = [...scope.castleIds, addAiSource(state, 'a3'), addAiSource(state, 'a4')];
    expect(validateState(state)).toEqual([]);
    let q = validatingSink(state);
    militaryPhase(state, scope, q.sink);
    q.flush();
    const plan = state.ai.clans[CLAN_ALPHA]!.attackPlans[0]!;
    expect(plan.sourceCastleIds).toHaveLength(4);
    for (let day = 0; day < 30 && plan.stage === 'muster'; day++) {
      nextDay(state);
      militaryMovementSystem(state);
      q = validatingSink(state);
      attackPlansDailyTick(state, scope, q.sink);
      q.flush();
    }
    expect(plan.stage).toBe('advance');
    expect(Object.values(state.armies).length).toBeGreaterThan(1);
    expect(state.castles[plan.stagingCastleId]!.soldiers).toBe(plan.stagingRetainedTroops);
    expect(Object.values(state.armies).reduce((sum, a) => sum + a.soldiers, 0)).toBe(
      plan.plannedTroops,
    );
    expect(validateState(state)).toEqual([]);
  });
  it('creates cooperative muster without gameplay mutations, then marshals dissolved arrivals without self-march', () => {
    const { state, scope } = aiScenario(),
      castles = structuredClone(state.castles),
      officers = structuredClone(state.officers);
    const q = validatingSink(state);
    militaryPhase(state, scope, q.sink);
    expect(state.castles).toEqual(castles);
    expect(state.officers).toEqual(officers);
    expect(state.armies).toEqual({});
    expect(q.orders.some((o) => o.command.type === 'march')).toBe(true);
    for (const { command } of q.orders)
      if (command.type === 'march') expect(command.originCastleId).not.toBe(command.targetNodeId);
    const fixture = advance(),
      plan = fixture.state.ai.clans[CLAN_ALPHA]!.attackPlans[0]!;
    expect(fixture.state.castles[plan.stagingCastleId]!.soldiers).toBe(plan.stagingRetainedTroops);
    expect(Object.values(fixture.state.armies).every((a) => a.targetNodeId === CASTLE_B1)).toBe(
      true,
    );
    expect(validateState(fixture.state)).toEqual([]);
  });
  it('attaches redispatched armies by original leader identity and aborts outmatched advances with directed returns', () => {
    const { state, scope } = advance();
    nextDay(state);
    state.castles[CASTLE_B1]!.soldiers = 20_000;
    const q = validatingSink(state);
    attackPlansDailyTick(state, scope, q.sink);
    expect(state.ai.clans[CLAN_ALPHA]!.attackPlans[0]!.abortReason).toBe('advanceOutmatched');
    expect(q.orders.some((o) => o.command.type === 'returnArmyToCastle')).toBe(true);
    q.flush();
    attackPlansDailyTick(state, scope, validatingSink(state).sink);
    expect(Object.values(state.armies).every((a) => a.status === 'returning')).toBe(true);
    expect(state.ai.intentLog.at(-1)?.detail.reason).toBe('advanceOutmatched');
    expect(validateState(state)).toEqual([]);
  });
  it.each(['alliance', 'marriage', 'ceasefire', 'vassal'] as const)(
    'aborts before marching against new %s pact',
    (kind) => {
      const { state, scope } = launch();
      ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA).pacts.push({
        kind,
        vassalClanId: kind === 'vassal' ? CLAN_ALPHA : null,
        startDay: state.time.day,
        endDay: null,
      });
      const q = validatingSink(state);
      attackPlansDailyTick(state, scope, q.sink);
      q.flush();
      attackPlansDailyTick(state, scope, validatingSink(state).sink);
      expect(state.ai.clans[CLAN_ALPHA]!.attackPlans).toEqual([]);
      expect(state.ai.intentLog.at(-1)?.detail.reason).toBe('targetPact');
      expect(
        q.orders.every(
          (o) => o.command.type === 'returnArmyToCastle' || o.command.type === 'recallArmy',
        ),
      ).toBe(true);
    },
  );
  it('aborts source loss and unmet muster timeout without direct army changes', () => {
    for (const reason of ['sourceLost', 'musterTimeout']) {
      const { state, scope } = launch();
      if (reason === 'sourceLost') state.castles[CASTLE_A1]!.ownerClanId = CLAN_BETA;
      else {
        state.time.day += BAL.aiMusterTimeoutDays + 1;
        state.castles[CASTLE_B1]!.soldiers = 20_000;
      }
      const armies = structuredClone(state.armies),
        q = validatingSink(state);
      attackPlansDailyTick(state, scope, q.sink);
      expect(state.armies).toEqual(armies);
      expect(state.ai.intentLog.at(-1)?.detail.reason).toBe(reason);
      expect(state.ai.clans[CLAN_ALPHA]!.attackPlans[0]!.abortReason).toBe(reason);
      q.flush();
      attackPlansDailyTick(state, scope, validatingSink(state).sink);
      expect(state.ai.clans[CLAN_ALPHA]!.attackPlans).toEqual([]);
    }
  });
  it('moves from real enemy arrival to siege and aborts a low-food siege through recall command', () => {
    const { state, scope } = besiege();
    for (const army of Object.values(state.armies)) army.food = 1;
    const q = validatingSink(state);
    attackPlansDailyTick(state, scope, q.sink);
    q.flush();
    expect(state.ai.intentLog.at(-1)?.detail.reason).toBe('siegeFood');
    expect(Object.keys(state.sieges)).toHaveLength(0);
    expect(validateState(state)).toEqual([]);
  });
  it('selects canonical siege modes at the durability boundary through validated commands', () => {
    const { state, scope } = besiege(),
      castle = state.castles[CASTLE_B1]!;
    castle.durability = castle.maxDurability;
    let q = validatingSink(state);
    attackPlansDailyTick(state, scope, q.sink);
    q.flush();
    expect(Object.values(state.sieges)[0]!.mode).toBe('encircle');
    castle.durability = castle.maxDurability * 0.5;
    q = validatingSink(state);
    attackPlansDailyTick(state, scope, q.sink);
    q.flush();
    expect(Object.values(state.sieges)[0]!.mode).toBe('assault');
    expect(validateState(state)).toEqual([]);
  });
  it('withdraws a siege when a real approaching enemy army outmatches the retained garrison estimate', () => {
    const { state, scope } = besiege(),
      castle = state.castles[CASTLE_B1]!;
    castle.soldiers = 8000;
    castle.food = 20000;
    const command = {
      type: 'march' as const,
      clanId: CLAN_BETA,
      originCastleId: CASTLE_B1,
      leaderId: OFF_BETA_LORD,
      deputyIds: [],
      soldiers: 6000,
      food: 7200,
      targetNodeId: CASTLE_A2,
    };
    expect(validateCommand(state, command)).toEqual({ ok: true });
    applyCommand(state, command, () => {});
    const q = validatingSink(state);
    attackPlansDailyTick(state, scope, q.sink);
    q.flush();
    expect(state.ai.intentLog.at(-1)?.detail.reason).toBe('siegeRelief');
    attackPlansDailyTick(state, scope, validatingSink(state).sink);
    expect(state.ai.clans[CLAN_ALPHA]!.attackPlans).toEqual([]);
    expect(Object.keys(state.sieges)).toHaveLength(0);
    expect(validateState(state)).toEqual([]);
  });
  it('preserves the legal siege mode without repeatedly submitting an impossible encirclement', () => {
    const { state, scope } = besiege();
    state.castles[CASTLE_B1]!.soldiers = 2000;
    for (let day = 0; day < 2; day++) {
      const q = validatingSink(state);
      attackPlansDailyTick(state, scope, q.sink);
      expect(q.orders.filter((o) => o.command.type === 'setSiegeMode')).toEqual([]);
      expect(state.ai.intentLog.at(-1)?.detail.reason).toBe('encircleUnavailable');
      expect(state.ai.intentLog.filter((i) => i.kind === 'error.invalidCommand')).toEqual([]);
    }
    expect(Object.values(state.sieges)[0]!.mode).toBe('assault');
  });
  it('retargets enough existing armies to meet relief power while retaining the siege minimum', () => {
    const { state, scope } = aiScenario();
    state.meta.difficulty = 'hard';
    state.officers[OFF_ALPHA_LORD]!.ldr = 10;
    state.officers[OFF_ALPHA_BUSHO]!.ldr = 120;
    scope.castleIds = [...scope.castleIds, addAiSource(state, 'a3'), addAiSource(state, 'a4')];
    for (const id of scope.castleIds.slice(2))
      state.officers[state.castles[id]!.lordId!]!.rank = 'samurai-taisho';
    let q = validatingSink(state);
    militaryPhase(state, scope, q.sink);
    q.flush();
    const plan = state.ai.clans[CLAN_ALPHA]!.attackPlans[0]!;
    for (let day = 0; day < 50 && plan.stage !== 'siege'; day++) {
      nextDay(state);
      militaryMovementSystem(state);
      q = validatingSink(state);
      attackPlansDailyTick(state, scope, q.sink);
      q.flush();
    }
    expect(plan.stage).toBe('siege');
    for (
      let day = 0;
      day < 20 &&
      Object.values(state.armies).some((a) => a.clanId === CLAN_ALPHA && a.status !== 'sieging');
      day++
    ) {
      nextDay(state);
      militaryMovementSystem(state);
      q = validatingSink(state);
      attackPlansDailyTick(state, scope, q.sink);
      q.flush();
    }
    const castle = state.castles[CASTLE_B1]!,
      enemyCastleId = addAiSource(state, 'b2'),
      enemyCastle = state.castles[enemyCastleId]!;
    enemyCastle.ownerClanId = CLAN_BETA;
    enemyCastle.soldiers = 5000;
    enemyCastle.food = 20000;
    for (const id of enemyCastle.districtIds) state.districts[id]!.ownerClanId = CLAN_BETA;
    const leader = state.officers[enemyCastle.lordId!]!;
    leader.clanId = CLAN_BETA;
    leader.rank = 'shukuro';
    leader.ldr = 120;
    state.roads['road.b2-0' as RoadEdgeId]!.b = CASTLE_B1;
    const enemy = {
      type: 'march' as const,
      clanId: CLAN_BETA,
      originCastleId: enemyCastleId,
      leaderId: leader.id,
      deputyIds: [],
      soldiers: 3500,
      food: 4200,
      targetNodeId: CASTLE_B1,
    };
    expect(validateCommand(state, enemy)).toEqual({ ok: true });
    applyCommand(state, enemy, () => {});
    q = validatingSink(state);
    attackPlansDailyTick(state, scope, q.sink);
    const redirects = q.orders.filter((o) => o.command.type === 'setArmyTarget');
    expect(redirects).toHaveLength(2);
    q.flush();
    const besiegers = Object.values(state.armies).filter(
      (a) => a.clanId === CLAN_ALPHA && a.status === 'sieging',
    );
    expect(besiegers.reduce((sum, a) => sum + a.soldiers, 0)).toBeGreaterThanOrEqual(
      castle.soldiers * BAL.aiReliefRetainRatio,
    );
    expect(
      state.ai.intentLog.some((i) => i.kind === 'siege.intercept' && i.commands.length === 2),
    ).toBe(true);
    expect(validateState(state)).toEqual([]);
    q = validatingSink(state);
    attackPlansDailyTick(state, scope, q.sink);
    expect(q.orders.filter((o) => o.command.type === 'setArmyTarget')).toEqual([]);
  });
  it('consolidates a real siege victory by depositing half and returning remaining troops, then frees its slot', () => {
    const { state, scope } = besiege(),
      castle = state.castles[CASTLE_B1]!;
    castle.morale = 0;
    siegeSystem(state);
    expect(castle.ownerClanId).toBe(CLAN_ALPHA);
    const attackers = Object.values(state.armies).reduce((sum, a) => sum + a.soldiers, 0);
    const before = castle.soldiers,
      q = validatingSink(state);
    attackPlansDailyTick(state, scope, q.sink);
    expect(castle.soldiers).toBe(before);
    expect(q.orders.some((o) => o.command.type === 'depositGarrison')).toBe(true);
    q.flush();
    expect(castle.soldiers).toBe(Math.floor(attackers * BAL.aiConsolidateGarrisonRatio));
    expect(state.ai.clans[CLAN_ALPHA]!.attackPlans[0]!.stage).toBe('consolidate');
    expect(validateState(state)).toEqual([]);
    nextDay(state);
    const end = validatingSink(state);
    attackPlansDailyTick(state, scope, end.sink);
    expect(state.ai.clans[CLAN_ALPHA]!.attackPlans).toHaveLength(0);
    expect(state.ai.intentLog.at(-1)?.kind).toBe('plan.complete');
  });
});
