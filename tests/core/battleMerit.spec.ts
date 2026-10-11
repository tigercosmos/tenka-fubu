import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { applyMarch, applySetAutoReturn, validateMarch } from '../../src/core/commands/march';
import { CommandQueue } from '../../src/core/commands/queue';
import { validateCommand } from '../../src/core/commands/validate';
import { advanceDay } from '../../src/core/systems';
import { advanceBattleTick, closeResolvedBattle } from '../../src/core/systems/battle';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { validateState } from '../../src/core/state/invariants';
import type { Command } from '../../src/core/commands/types';
import type { TraitId } from '../../src/core/state/ids';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  DIST_A2X,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_LORD,
  OFF_ALPHA_BUSHO,
  OFF_ALPHA_TAISHO,
  OFF_BETA_TAISHO,
  OFF_BETA_BUSHO,
  OFF_BETA_LORD,
} from '../fixtures/tiny';

function realBattle(ambitious = false) {
  const state = buildTinyState();
  // Controlled connected frontier route reaches the district directly rather
  // than illegally passing through the hostile castle's transit blockade.
  const frontier = Object.values(state.roads).find(
    (road) =>
      (road.a === CASTLE_A2 && road.b === CASTLE_B1) ||
      (road.b === CASTLE_A2 && road.a === CASTLE_B1),
  )!;
  if (frontier.a === CASTLE_A2) frontier.a = DIST_A2X;
  else frontier.b = DIST_A2X;
  // Controlled sufficient garrisons are legal (05 permits over-cap stock).
  // All armies/encounter positions are produced by commands and normal ticks.
  for (const castleId of [CASTLE_A1, CASTLE_B1]) state.castles[castleId]!.soldiers = 2000;
  for (const [clanId, castleId, leaderId, deputyId] of [
    [CLAN_BETA, CASTLE_B1, OFF_BETA_TAISHO, OFF_BETA_BUSHO],
    [CLAN_ALPHA, CASTLE_A1, OFF_ALPHA_LORD, OFF_ALPHA_BUSHO],
  ] as const) {
    for (const officerId of [leaderId, deputyId])
      state.officers[officerId]!.traits = ambitious ? ['trait.yashin' as TraitId] : [];
    const cmd: Command = {
      type: 'march',
      clanId,
      originCastleId: castleId,
      leaderId,
      deputyIds: [deputyId],
      soldiers: 1800,
      food: 1080,
      targetNodeId: DIST_A2X,
    };
    expect(validateMarch(state, cmd)).toEqual({ ok: true });
    applyMarch(state, cmd, () => {});
    const army = Object.values(state.armies).find((candidate) => candidate.leaderId === leaderId)!;
    applySetAutoReturn(state, { type: 'setAutoReturn', clanId, armyId: army.id, enabled: false });
    // Stagger actual departures so both armies meet at the district; friendly
    // castle endpoints would instead deposit their troops normally.
    if (clanId === CLAN_BETA) advanceDay(state, []);
  }
  const contingent: Command = {
    type: 'march',
    clanId: CLAN_ALPHA,
    originCastleId: CASTLE_A2,
    leaderId: OFF_ALPHA_TAISHO,
    deputyIds: [],
    soldiers: 200,
    food: 120,
    targetNodeId: DIST_A2X,
  };
  state.officers[OFF_ALPHA_TAISHO]!.traits = ambitious ? ['trait.yashin' as TraitId] : [];
  expect(validateMarch(state, contingent)).toEqual({ ok: true });
  applyMarch(state, contingent, () => {});
  const contingentArmy = Object.values(state.armies).find(
    (army) => army.leaderId === OFF_ALPHA_TAISHO,
  )!;
  applySetAutoReturn(state, {
    type: 'setAutoReturn',
    clanId: CLAN_ALPHA,
    armyId: contingentArmy.id,
    enabled: false,
  });
  expect(validateState(state)).toEqual([]);
  for (let i = 0; i < 20 && Object.keys(state.fieldCombats).length === 0; i++) {
    advanceDay(state, []);
    expect(validateState(state)).toEqual([]);
  }
  const combat = Object.values(state.fieldCombats)[0]!;
  expect(combat).toBeDefined();
  // Let the larger friendly army finish its actual approach and join the
  // encounter before entry; the smaller contingent is a real participant.
  advanceDay(state, []);
  expect(validateState(state)).toEqual([]);
  const command: Command = { type: 'startKassen', clanId: CLAN_ALPHA, fieldCombatId: combat.id };
  expect(validateCommand(state, command)).toEqual({ ok: true });
  const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  queue.enqueue(command, state.time.day);
  const started = advanceDay(state, queue.drain());
  expect(started.events.some((event) => event.type === 'command.rejected')).toBe(false);
  expect(validateState(state)).toEqual([]);
  return state;
}

function resolve(state: ReturnType<typeof buildTinyState>) {
  const battle = Object.values(state.battles)[0]!;
  const orders = battle.units.map((unit) => ({
    kind: 'toggleDelegate' as const,
    unitId: unit.id,
    enabled: true,
  }));
  for (let i = 0; i < BAL.kassenMaxTicks && battle.result === null; i++) {
    advanceBattleTick(state, battle.id, i === 0 ? orders : []);
    expect(validateState(state)).toEqual([]);
  }
  expect(battle.result).not.toBeNull();
  return battle;
}

describe('actual tactical battle winner merit', () => {
  it.each([false, true])(
    'awards all winning commanders/deputies once with actual Awe (ambitious=%s)',
    (ambitious) => {
      const state = realBattle(ambitious);
      const before = structuredClone(state.officers);
      const rosters = Object.values(state.armies).map((army) => ({
        side: Object.values(state.battles)[0]!.units.find((unit) => unit.armyId === army.id)!.side,
        leader: army.leaderId,
        deputies: [...army.deputyIds],
      }));
      const battle = resolve(state);
      const base =
        BAL.meritBattleWin + (battle.result!.aweLevel === 'none' ? 0 : BAL.meritBattleAweBonus);
      expect(battle.result!.aweLevel).not.toBe('none');
      for (const roster of rosters)
        for (const id of [roster.leader, ...roster.deputies]) {
          const baseAward = Math.round(base * (id === roster.leader ? BAL.meritCommanderMult : 1));
          const expected =
            roster.side === battle.result!.winnerSide
              ? Math.round(baseAward * (ambitious ? 1 + BAL.traitYashinMerit : 1))
              : 0;
          expect(state.officers[id]!.merit - before[id]!.merit).toBe(expected);
          for (const stat of ['ldr', 'val'] as const)
            expect(
              state.officers[id]!.statExp[stat] +
                state.officers[id]!.statGrowth[stat] * BAL.statExpPerPoint -
                before[id]!.statExp[stat] -
                before[id]!.statGrowth[stat] * BAL.statExpPerPoint,
            ).toBe(expected);
        }
      expect(state.officers[OFF_BETA_LORD]!.merit).toBe(before[OFF_BETA_LORD]!.merit);
      expect(battle.units.filter((unit) => unit.side === battle.result!.winnerSide)).toHaveLength(
        2,
      );
      expect(
        battle.units.some(
          (unit) =>
            unit.side === battle.result!.winnerSide &&
            (unit.routed || unit.exited || unit.troops <= 0),
        ),
      ).toBe(true);
      const awarded = structuredClone(state.officers);
      const rng = structuredClone(state.rng);
      expect(() => advanceBattleTick(state, battle.id)).toThrow('已結束');
      expect(state.officers).toEqual(awarded);
      expect(state.rng).toEqual(rng);
      closeResolvedBattle(state, battle.id);
      advanceDay(state, []);
      for (const roster of rosters)
        for (const id of [roster.leader, ...roster.deputies])
          expect(state.officers[id]!.merit).toBe(awarded[id]!.merit);
      expect(validateState(state)).toEqual([]);
    },
  );

  it('native save continuation repeats tactical result, awards, deferred events and RNG', () => {
    const state = realBattle();
    const decoded = decodeSave(encodeSave(state, 42));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.code);
    const loaded = decoded.saveFile.state;
    expect(resolve(loaded).result).toEqual(resolve(state).result);
    state.ai.intentLog = [];
    loaded.ai.intentLog = [];
    expect(loaded).toEqual(state);
    expect(decodeSave(encodeSave(loaded, 42)).ok).toBe(true);
  });
});
