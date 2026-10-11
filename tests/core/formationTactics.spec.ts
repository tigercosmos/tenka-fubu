import { expect, it } from 'vitest';
import * as tactics from '../../src/core/tactics';
import * as core from '../../src/core/index';
import { validateCommand } from '../../src/core/commands/validate';
import { applyMarch } from '../../src/core/commands/march';
import { advanceDay } from '../../src/core/systems';
import { CommandQueue } from '../../src/core/commands/queue';
import { validateState } from '../../src/core/state/invariants';
import type { OfficerId, TraitId, ArmyId } from '../../src/core/state/ids';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  DIST_A2X,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_LORD,
  OFF_ALPHA_BUSHO,
  OFF_BETA_TAISHO,
  OFF_BETA_BUSHO,
} from '../fixtures/tiny';

// Independent copy of the pre-extraction union/filter, not the future helper.
function oldAlgorithm(state: ReturnType<typeof buildTinyState>, ids: readonly OfficerId[]) {
  const traits = new Set<TraitId>();
  for (const officerId of ids)
    for (const id of state.officers[officerId]?.traits ?? []) traits.add(id);
  return tactics.TACTIC_IDS.filter((id) => {
    const unlock = tactics.TACTICS[id]?.unlockTraitId;
    return unlock === null || (unlock !== undefined && traits.has(unlock));
  });
}
it('has a formation API without requiring an invented unit or army', () => {
  expect(tactics.getOfficerTacticIds).toBeTypeOf('function');
  expect(core.getOfficerTacticIds).toBe(tactics.getOfficerTacticIds);
});
it.each(tactics.TACTIC_IDS)('matches the old independent algorithm for %s unlock/default', (id) => {
  const state = buildTinyState();
  const unlock = tactics.TACTICS[id]!.unlockTraitId;
  state.officers[OFF_ALPHA_LORD]!.traits = unlock === null ? [] : [unlock];
  const before = structuredClone(state);
  expect(tactics.getOfficerTacticIds(state, [OFF_ALPHA_LORD])).toEqual(
    oldAlgorithm(state, [OFF_ALPHA_LORD]),
  );
  expect(tactics.getOfficerTacticIds(state, [OFF_ALPHA_LORD])).toContain(id);
  expect(state).toEqual(before);
});
it('unions selected roster traits in canonical order, deduplicates and ignores missing IDs', () => {
  const state = buildTinyState();
  state.officers[OFF_ALPHA_LORD]!.traits = ['trait.gunshin', 'trait.gunryaku'] as TraitId[];
  state.officers[OFF_ALPHA_BUSHO]!.traits = [
    'trait.gunryaku',
    'trait.fudou',
    'trait.roukou',
  ] as TraitId[];
  const ids = [OFF_ALPHA_BUSHO, 'off.missing' as OfficerId, OFF_ALPHA_LORD, OFF_ALPHA_BUSHO];
  const before = structuredClone(state);
  expect(tactics.getOfficerTacticIds(state, ids)).toEqual(oldAlgorithm(state, ids));
  expect(tactics.getOfficerTacticIds(state, [])).toEqual(oldAlgorithm(state, []));
  expect(state).toEqual(before);
});
it('matches availability of a real validated march and generated tactical unit, preserving missing-army general fallback', () => {
  const state = buildTinyState();
  const frontier = Object.values(state.roads).find(
    (road) =>
      (road.a === CASTLE_A2 && road.b === CASTLE_B1) ||
      (road.b === CASTLE_A2 && road.a === CASTLE_B1),
  )!;
  if (frontier.a === CASTLE_A2) frontier.a = DIST_A2X;
  else frontier.b = DIST_A2X;
  for (const castleId of [CASTLE_A1, CASTLE_B1]) state.castles[castleId]!.soldiers = 2000;
  state.officers[OFF_ALPHA_LORD]!.traits = ['trait.gunshin'] as TraitId[];
  state.officers[OFF_ALPHA_BUSHO]!.traits = ['trait.gunryaku', 'trait.fudou'] as TraitId[];
  for (const [clanId, originCastleId, leaderId, deputyId] of [
    [CLAN_BETA, CASTLE_B1, OFF_BETA_TAISHO, OFF_BETA_BUSHO],
    [CLAN_ALPHA, CASTLE_A1, OFF_ALPHA_LORD, OFF_ALPHA_BUSHO],
  ] as const) {
    const cmd = {
      type: 'march' as const,
      clanId,
      originCastleId,
      leaderId,
      deputyIds: [deputyId],
      soldiers: 1800,
      food: 1080,
      targetNodeId: DIST_A2X,
    };
    expect(validateCommand(state, cmd)).toEqual({ ok: true });
    applyMarch(state, cmd, () => {});
    if (clanId === CLAN_BETA) advanceDay(state, []);
  }
  for (let i = 0; i < 20 && Object.keys(state.fieldCombats).length === 0; i++) {
    advanceDay(state, []);
    expect(validateState(state)).toEqual([]);
  }
  const combat = Object.values(state.fieldCombats)[0]!;
  expect(combat).toBeDefined();
  const start = { type: 'startKassen' as const, clanId: CLAN_ALPHA, fieldCombatId: combat.id };
  expect(validateCommand(state, start)).toEqual({ ok: true });
  const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  queue.enqueue(start, state.time.day);
  advanceDay(state, queue.drain());
  expect(validateState(state)).toEqual([]);
  const unit = Object.values(state.battles)[0]!.units.find(
    (candidate) => candidate.side === 'attacker',
  )!;
  const army = state.armies[unit.armyId]!;
  const ids = [army.leaderId, ...army.deputyIds];
  const before = structuredClone(state);
  expect(tactics.getAvailableTacticIds(state, unit)).toEqual(
    tactics.getOfficerTacticIds(state, ids),
  );
  expect(tactics.getAvailableTacticIds(state, { ...unit, generalId: OFF_BETA_BUSHO })).toEqual(
    oldAlgorithm(state, ids),
  );
  expect(
    tactics.getAvailableTacticIds(state, { ...unit, armyId: 'army.missing' as ArmyId }),
  ).toEqual(oldAlgorithm(state, [unit.generalId]));
  expect(state).toEqual(before);
});
