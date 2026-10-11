import { describe, expect, it } from 'vitest';
import { applyCommand } from '../../src/core/commands/apply';
import { validateCommand } from '../../src/core/commands/validate';
import { validateState } from '../../src/core/state/invariants';
import { canonicalStringify } from '../../src/core/state/serialize';
import { createAiCommandSink } from '../../src/core/systems/ai';
import { attackPlansDailyTick, militaryPhase } from '../../src/core/systems/ai/attackPlan';
import { militaryMovementSystem } from '../../src/core/systems/military';
import { dayToCalendar } from '../../src/core/systems/time';
import { aiScenario } from '../helpers/aiScenario';
import { CLAN_ALPHA } from '../fixtures/tiny';

function fixture(gold: number) {
  const result = aiScenario();
  result.state.clans[CLAN_ALPHA]!.gold = gold;
  expect(validateState(result.state)).toEqual([]);
  return result;
}
function flush(
  state: ReturnType<typeof fixture>['state'],
  batch: ReturnType<typeof createAiCommandSink>,
) {
  for (const { command, authority } of batch.orders) {
    expect(validateCommand(state, command, authority)).toEqual({ ok: true });
    applyCommand(state, command, () => {}, authority);
  }
  expect(validateState(state)).toEqual([]);
}
function move(state: ReturnType<typeof fixture>['state']) {
  state.time.day++;
  Object.assign(state.time, dayToCalendar(state.time.day));
  militaryMovementSystem(state);
  expect(validateState(state)).toEqual([]);
}
function arrivedMuster() {
  const f = fixture(100);
  const batch = createAiCommandSink(f.state);
  militaryPhase(f.state, f.scope, batch.sink);
  expect(batch.orders.some((o) => o.command.type === 'march')).toBe(true);
  flush(f.state, batch);
  const plan = f.state.ai.clans[CLAN_ALPHA]!.attackPlans[0]!;
  for (let i = 0; i < 30; i++) {
    if (
      Object.values(plan.sourceLeaderIds).every(
        (id) => f.state.officers[id]!.locationCastleId === plan.stagingCastleId,
      )
    )
      break;
    move(f.state);
  }
  expect(
    Object.values(plan.sourceLeaderIds).every(
      (id) => f.state.officers[id]!.locationCastleId === plan.stagingCastleId,
    ),
  ).toBe(true);
  return { ...f, plan };
}

describe('17 A4 low-gold offensive departures', () => {
  it.each([99, 100])('monthly gold %i obeys the strict below-100 boundary', (gold) => {
    const { state, scope } = fixture(gold);
    const rng = canonicalStringify(state.rng);
    const batch = createAiCommandSink(state);
    militaryPhase(state, scope, batch.sink);
    if (gold < 100) {
      expect(batch.orders.filter((o) => o.command.type === 'march')).toEqual([]);
      expect(state.ai.clans[CLAN_ALPHA]!.attackPlans).toEqual([]);
    } else {
      expect(batch.orders.some((o) => o.command.type === 'march')).toBe(true);
      expect(state.ai.clans[CLAN_ALPHA]!.attackPlans).toHaveLength(1);
      flush(state, batch);
    }
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(gold);
    expect(canonicalStringify(state.rng)).toBe(rng);
    expect(validateState(state)).toEqual([]);
    expect(validateState(batch.shadow)).toEqual([]);
  });

  it.each([99, 100])(
    'an existing funded plan rechecks gold %i before fresh castle departure',
    (gold) => {
      const { state, scope, plan } = arrivedMuster();
      state.clans[CLAN_ALPHA]!.gold = gold;
      const rng = canonicalStringify(state.rng);
      const batch = createAiCommandSink(state);
      attackPlansDailyTick(state, scope, batch.sink);
      const marches = batch.orders.filter((o) => o.command.type === 'march');
      if (gold < 100) expect(marches).toEqual([]);
      else {
        expect(marches.length).toBeGreaterThan(0);
        expect(
          marches.every(
            (o) => o.command.type === 'march' && o.command.targetNodeId === plan.targetCastleId,
          ),
        ).toBe(true);
        flush(state, batch);
      }
      expect(canonicalStringify(state.rng)).toBe(rng);
      expect(validateState(state)).toEqual([]);
    },
  );

  it('low gold does not freeze deployed movement or lawful plan recall', () => {
    const { state, scope, plan } = arrivedMuster();
    const departure = createAiCommandSink(state);
    attackPlansDailyTick(state, scope, departure.sink);
    flush(state, departure);
    const army = Object.values(state.armies).find((a) => a.clanId === CLAN_ALPHA)!;
    expect(army).toBeDefined();
    state.clans[CLAN_ALPHA]!.gold = 99;
    const before = canonicalStringify(army);
    const rng = canonicalStringify(state.rng);
    move(state);
    expect(canonicalStringify(army)).not.toBe(before);
    // Controlled AI bookkeeping abort; the army itself was created and moved by real commands.
    plan.abortReason = 'lowGoldWitness';
    const recall = createAiCommandSink(state);
    attackPlansDailyTick(state, scope, recall.sink);
    expect(
      recall.orders.some(
        (o) => o.command.type === 'recallArmy' || o.command.type === 'returnArmyToCastle',
      ),
    ).toBe(true);
    flush(state, recall);
    expect(canonicalStringify(state.rng)).toBe(rng);
    expect(validateState(state)).toEqual([]);
  });
});
