import { describe, expect, it } from 'vitest';
import { loadS1560Scenario } from '../../src/data/scenarios/s1560';
import { buildGameStateFromScenario } from '../../src/core/state/builder';
import { validateState } from '../../src/core/state/invariants';
import { validateCommand } from '../../src/core/commands/validate';
import { applyCreateCorps } from '../../src/core/commands/corpsCommands';
import type { ExecutionAuthority } from '../../src/core/commands/authority';
import type { AiScope, AiSink } from '../../src/core/systems/ai/types';
import type { GameState } from '../../src/core/state/gameState';
import type { ClanId } from '../../src/core/state/ids';
import { createAiCommandSink } from '../../src/core/systems/ai';
import { runDomesticCouncil } from '../../src/core/systems/ai/council';
import { runDomesticCouncilReference, foodReserve } from '../helpers/councilDonorReference';

const HOJO = 'clan.hojo' as ClanId;
type Mode = 'clan' | 'castle' | 'corps';
type Failure = 'none' | 'canEnqueue' | 'enqueue';
async function fixture(mode: Mode) {
  const state = buildGameStateFromScenario(await loadS1560Scenario(), {
    seed: 42,
    appVersion: 'council-parity',
    playerClanId: HOJO,
    difficulty: 'normal',
  });
  state.ai.allAi = true;
  const castles = Object.values(state.castles)
    .filter((c) => c.ownerClanId === HOJO)
    .sort((a, b) => a.id.localeCompare(b.id));
  expect(castles.length).toBeGreaterThanOrEqual(3);
  const home = state.castles[state.clans[HOJO]!.homeCastleId]!;
  const donor = castles.find((c) => c.id !== home.id)!;
  const second = castles.find((c) => c.id !== donor.id && c.id !== home.id)!;
  for (const castle of castles) castle.food = foodReserve(state, castle);
  home.food = 0;
  second.food = 0;
  const surplus = foodReserve(state, home) + foodReserve(state, second);
  donor.food += surplus;
  state.clans[HOJO]!.gold = 100000;
  let scope: AiScope = {
    clanId: HOJO,
    corpsId: null,
    castleIds: castles.map((c) => c.id),
    targetNodeId: null,
  };
  let authority: ExecutionAuthority = { kind: 'clan', clanId: HOJO };
  if (mode === 'castle') {
    home.directControl = false;
    scope = { ...scope, castleIds: [home.id] };
    authority = { kind: 'castle', clanId: HOJO, castleId: home.id };
  } else if (mode === 'corps') {
    const leader = Object.values(state.officers).find(
      (o) =>
        o.clanId === HOJO &&
        o.status === 'serving' &&
        o.hasComeOfAge &&
        o.armyId === null &&
        o.id !== state.clans[HOJO]!.leaderId,
    )!;
    leader.rank = 'karo';
    const command = {
      type: 'createCorps' as const,
      clanId: HOJO,
      corpsLeaderId: leader.id,
      castleIds: castles.map((c) => c.id),
      directive: 'develop' as const,
      targetNodeId: null,
    };
    expect(validateCommand(state, command)).toEqual({ ok: true });
    applyCreateCorps(state, command, () => {});
    const corps = Object.values(state.corps)[0]!;
    corps.gold = 100000;
    scope = { ...scope, corpsId: corps.id };
    authority = { kind: 'corps', clanId: HOJO, corpsId: corps.id };
  }
  expect(validateState(state)).toEqual([]);
  return { state, scope, authority, donor, home, second, surplus };
}
function run(
  initial: GameState,
  scope: AiScope,
  authority: ExecutionAuthority,
  reference: boolean,
  failure: Failure = 'none',
) {
  const state = structuredClone(initial);
  const reserved = createAiCommandSink(state);
  const checks: unknown[] = [],
    attempts: unknown[] = [];
  const sink: AiSink = {
    record(intent) {
      reserved.sink.record(intent);
    },
    canEnqueue(command, context) {
      checks.push(structuredClone({ command, authority: context }));
      if (failure === 'canEnqueue' && command.type === 'transport')
        return { ok: false, reasonKey: 'cmd.reject.invalidTarget' };
      return reserved.sink.canEnqueue!(command, context);
    },
    enqueue(command, context) {
      attempts.push(structuredClone({ command, authority: context }));
      if (failure === 'enqueue' && command.type === 'transport')
        return { ok: false, reasonKey: 'cmd.reject.invalidTarget' };
      return reserved.sink.enqueue(command, context);
    },
  };
  (reference ? runDomesticCouncilReference : runDomesticCouncil)(state, scope, sink, { authority });
  return { state, shadow: reserved.shadow, orders: reserved.orders, checks, attempts };
}
describe('independent pre-pruning complete council parity', () => {
  it('preserves delegated-castle supply authority while excluding a donor assigned to another corps', async () => {
    const { state, scope, authority, donor, home } = await fixture('castle');
    expect(donor.directControl).toBe(true);
    const delegated = run(state, scope, authority, false);
    expect(delegated).toEqual(run(state, scope, authority, true));
    expect(
      delegated.orders.some(
        (order) =>
          order.command.type === 'transport' &&
          order.command.fromCastleId === donor.id &&
          order.command.toCastleId === home.id,
      ),
    ).toBe(true);
    const leader = Object.values(state.officers).find(
      (officer) =>
        officer.clanId === HOJO &&
        officer.status === 'serving' &&
        officer.hasComeOfAge &&
        officer.armyId === null &&
        officer.id !== state.clans[HOJO]!.leaderId,
    )!;
    leader.rank = 'karo';
    const create = {
      type: 'createCorps' as const,
      clanId: HOJO,
      corpsLeaderId: leader.id,
      castleIds: [donor.id],
      directive: 'develop' as const,
      targetNodeId: null,
    };
    expect(validateCommand(state, create)).toEqual({ ok: true });
    applyCreateCorps(state, create, () => {});
    expect(validateState(state)).toEqual([]);
    const excluded = run(state, scope, authority, false);
    expect(excluded).toEqual(run(state, scope, authority, true));
    expect(excluded.orders.some((order) => order.command.type === 'transport')).toBe(false);
    expect(validateState(excluded.state)).toEqual([]);
    expect(validateState(excluded.shadow)).toEqual([]);
  });
  it.each(['clan', 'castle', 'corps'] as const)(
    'retains complete %s authority decisions, reservations, intents and RNG for all sink outcomes',
    async (mode) => {
      const { state, scope, authority } = await fixture(mode);
      const before = structuredClone(state);
      for (const failure of ['none', 'canEnqueue', 'enqueue'] as const) {
        const old = run(state, scope, authority, true, failure);
        const current = run(state, scope, authority, false, failure);
        expect(current).toEqual(old);
        expect(current.state.rng).toEqual(before.rng);
        expect(validateState(current.state)).toEqual([]);
        expect(validateState(current.shadow)).toEqual([]);
        expect(current.state.ai.intentLog.at(-1)?.kind).toBe('domestic.evaluated');
        if (failure === 'none')
          expect(current.orders.some((o) => o.command.type === 'transport')).toBe(true);
        else expect(current.orders.some((o) => o.command.type === 'transport')).toBe(false);
      }
      expect(state).toEqual(before);
    },
  );
  it('preserves donor exhaustion across actual destinations and reserves against pending shadow cargo', async () => {
    const { state, scope, authority, donor, home, surplus } = await fixture('clan');
    const current = run(state, scope, authority, false);
    expect(current).toEqual(run(state, scope, authority, true));
    const transports = current.orders.filter((o) => o.command.type === 'transport');
    expect(
      new Set(transports.map((o) => (o.command.type === 'transport' ? o.command.toCastleId : null)))
        .size,
    ).toBe(2);
    expect(
      transports.reduce((sum, o) => sum + (o.command.type === 'transport' ? o.command.food : 0), 0),
    ).toBe(surplus);
    const pending = {
      command: {
        type: 'transport' as const,
        clanId: HOJO,
        fromCastleId: donor.id,
        toCastleId: home.id,
        soldiers: 0,
        gold: 0,
        food: foodReserve(state, home),
      },
      authority,
    };
    expect(validateCommand(state, pending.command, authority)).toEqual({ ok: true });
    state.ai.pendingOrders.push(pending);
    const withPending = run(state, scope, authority, false);
    expect(withPending).toEqual(run(state, scope, authority, true));
    expect(validateState(withPending.shadow)).toEqual([]);
  });
});
