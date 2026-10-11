import { afterEach, expect, it, vi } from 'vitest';
import { applyCommand } from '../../src/core/commands/apply';
import { validateCommand } from '../../src/core/commands/validate';
import { validateState } from '../../src/core/state/invariants';
import { createAiCommandSink } from '../../src/core/systems/ai';
import { foodReserve, runDomesticCouncil } from '../../src/core/systems/ai/council';
import * as pathfinding from '../../src/core/systems/pathfinding';
import { addAiSource, aiScenario } from '../helpers/aiScenario';
import { CASTLE_A1, CASTLE_A2, CLAN_ALPHA } from '../fixtures/tiny';

afterEach(() => vi.restoreAllMocks());
function fixture() {
  const result = aiScenario();
  result.state.clans[CLAN_ALPHA]!.gold = 0;
  for (const id of result.scope.castleIds) {
    const castle = result.state.castles[id]!;
    castle.food = foodReserve(result.state, castle);
  }
  expect(validateState(result.state)).toEqual([]);
  return result;
}
it.each([0, 0.5])('prunes integer available surplus %s before council path lookup', (spare) => {
  const { state, scope } = fixture();
  state.castles[CASTLE_A1]!.food = 0;
  state.castles[CASTLE_A2]!.food += spare;
  // Half-unit food is an explicitly invalid arithmetic-boundary probe, not a legal game fixture.
  if (spare === 0) expect(validateState(state)).toEqual([]);
  const path = vi.spyOn(pathfinding, 'computePath');
  const batch = createAiCommandSink(state);
  const rng = structuredClone(state.rng);
  runDomesticCouncil(state, scope, batch.sink, { rewards: false, policies: false });
  expect(path.mock.calls.filter(([input]) => input === state)).toHaveLength(0);
  expect(batch.orders.filter(({ command }) => command.type === 'transport')).toEqual([]);
  expect(state.rng).toEqual(rng);
});
it('still looks up eligible donors, excludes the destination, and executes the same legal transport', () => {
  const { state, scope } = fixture();
  state.castles[CASTLE_A1]!.food = 0;
  state.castles[CASTLE_A2]!.food += 1;
  const path = vi.spyOn(pathfinding, 'computePath');
  const before = structuredClone(state);
  const batch = createAiCommandSink(state);
  runDomesticCouncil(state, scope, batch.sink, { rewards: false, policies: false });
  expect(
    path.mock.calls.filter(([input]) => input === state).map(([, , args]) => [args.from, args.to]),
  ).toEqual([[CASTLE_A2, CASTLE_A1]]);
  const transfers = batch.orders.filter(({ command }) => command.type === 'transport');
  expect(transfers).toHaveLength(1);
  expect(transfers[0]!.command).toMatchObject({
    fromCastleId: CASTLE_A2,
    toCastleId: CASTLE_A1,
    food: 1,
  });
  expect(state.castles).toEqual(before.castles);
  expect(state.rng).toEqual(before.rng);
  for (const { command, authority } of batch.orders) {
    expect(validateCommand(state, command, authority)).toEqual({ ok: true });
    applyCommand(state, command, () => {}, authority);
  }
  expect(state.castles[CASTLE_A2]!.food).toBe(before.castles[CASTLE_A2]!.food - 1);
  expect(validateState(state)).toEqual([]);
});
it('recomputes donor surplus after a prior destination consumes the local reservation', () => {
  const { state, scope } = fixture();
  const donor = addAiSource(state, 'pruning-donor');
  scope.castleIds = [...scope.castleIds, donor];
  state.castles[CASTLE_A1]!.food = 0;
  state.castles[CASTLE_A2]!.food = 0;
  state.castles[donor]!.food = foodReserve(state, state.castles[donor]!) + 1;
  expect(validateState(state)).toEqual([]);
  const path = vi.spyOn(pathfinding, 'computePath');
  const batch = createAiCommandSink(state);
  runDomesticCouncil(state, scope, batch.sink, { rewards: false, policies: false });
  expect(
    path.mock.calls.filter(([input]) => input === state).map(([, , args]) => [args.from, args.to]),
  ).toEqual([[donor, CASTLE_A1]]);
  expect(batch.orders.filter(({ command }) => command.type === 'transport')).toHaveLength(1);
  expect(validateState(batch.shadow)).toEqual([]);
});
it('does not hide positive canonical donors rejected by pre-existing queued reservations', () => {
  const { state, scope } = fixture();
  state.castles[CASTLE_A1]!.food = 0;
  const source = state.castles[CASTLE_A2]!;
  source.food += 1;
  const authority = { kind: 'clan' as const, clanId: CLAN_ALPHA };
  const command = {
    type: 'transport' as const,
    clanId: CLAN_ALPHA,
    fromCastleId: CASTLE_A2,
    toCastleId: CASTLE_A1,
    soldiers: 0,
    gold: 0,
    food: source.food,
  };
  expect(validateCommand(state, command, authority)).toEqual({ ok: true });
  state.ai.pendingOrders.push({ command, authority });
  expect(validateState(state)).toEqual([]);
  const path = vi.spyOn(pathfinding, 'computePath');
  const batch = createAiCommandSink(state);
  runDomesticCouncil(state, scope, batch.sink, { rewards: false, policies: false });
  expect(path.mock.calls.filter(([input]) => input === state)).toHaveLength(1);
  expect(batch.orders.filter(({ command }) => command.type === 'transport')).toEqual([]);
  expect(
    state.ai.intentLog.some(
      (intent) =>
        intent.kind === 'decision.ineligible' && intent.detail.decision === 'food.transport',
    ),
  ).toBe(true);
});
