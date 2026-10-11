import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { getBattleOfficerStat, getEffectiveOfficerStat } from '../../src/core/battleStats';
import { applyCommands, CommandQueue } from '../../src/core/commands/queue';
import { validateCommand } from '../../src/core/commands/validate';
import { validateState } from '../../src/core/state/invariants';
import { canonicalStringify, defaultDiplomacyRow, pairKey } from '../../src/core/state/serialize';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { advanceBattleTick, computeBattleUnitAttackPower } from '../../src/core/systems/battle';
import { militaryMovementSystem } from '../../src/core/systems/military';
import { createDelegatedBattleOrders } from '../../src/core/systems/battleAi';
import { getAvailableTacticIds } from '../../src/core/tactics';
import type { RoadEdgeId, TraitId } from '../../src/core/state/ids';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_LORD,
  OFF_ALPHA_BUSHO,
  OFF_BETA_LORD,
} from '../fixtures/tiny';

/** Real legal queued marches, movement encounter, and queued startKassen; no army injection. */
function prepare(gunshin = false, deputyGunshin = false) {
  const state = buildTinyState();
  // Synthetic initial geography adds one valid frontier corridor so opposing
  // legal marches meet physically, without crossing a foreign intermediate castle.
  const roadId = 'road.battle-stats-frontier' as RoadEdgeId;
  state.roads[roadId] = {
    id: roadId,
    a: CASTLE_A1,
    b: CASTLE_B1,
    type: 'land',
    grade: 1,
    baseDays: 4,
  };
  const row = defaultDiplomacyRow(CLAN_ALPHA, CLAN_BETA);
  row.lastHostileDay = state.time.day;
  state.diplomacy.rows[pairKey(CLAN_ALPHA, CLAN_BETA)] = row;
  for (const id of [OFF_ALPHA_LORD, OFF_BETA_LORD]) {
    const officer = state.officers[id]!;
    officer.ldr = 90;
    officer.val = 80;
    officer.statGrowth = { ldr: 0, val: 0, int: 0, pol: 0 };
    officer.traits = [];
  }
  if (gunshin) state.officers[OFF_ALPHA_LORD]!.traits = ['trait.gunshin' as TraitId];
  if (deputyGunshin) state.officers[OFF_ALPHA_BUSHO]!.traits = ['trait.gunshin' as TraitId];
  const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  for (const [clanId, originCastleId, leaderId, targetNodeId] of [
    [CLAN_ALPHA, CASTLE_A1, OFF_ALPHA_LORD, CASTLE_B1],
    [CLAN_BETA, CASTLE_B1, OFF_BETA_LORD, CASTLE_A1],
  ] as const) {
    const command = {
      type: 'march' as const,
      clanId,
      originCastleId,
      leaderId,
      deputyIds: deputyGunshin && clanId === CLAN_ALPHA ? [OFF_ALPHA_BUSHO] : [],
      soldiers: 1500,
      food: 1000,
      targetNodeId,
    };
    const authority =
      clanId === state.meta.playerClanId
        ? { kind: 'player' as const }
        : { kind: 'clan' as const, clanId };
    expect(validateCommand(state, command, authority)).toEqual({ ok: true });
    queue.enqueue(command, state.time.day, authority);
  }
  expect(applyCommands(state, queue.drain(), () => {})).toHaveLength(2);
  for (let tick = 0; tick < 30 && Object.keys(state.fieldCombats).length === 0; tick++) {
    militaryMovementSystem(state);
    expect(validateState(state)).toEqual([]);
  }
  const combat = Object.values(state.fieldCombats)[0]!;
  expect(combat).toBeDefined();
  const command = { type: 'startKassen' as const, clanId: CLAN_ALPHA, fieldCombatId: combat.id };
  expect(validateCommand(state, command)).toEqual({ ok: true });
  queue.enqueue(command, state.time.day);
  expect(applyCommands(state, queue.drain(), () => {})).toHaveLength(1);
  expect(validateState(state)).toEqual([]);
  const battle = Object.values(state.battles)[0]!;
  const actor = battle.units.find((unit) => unit.generalId === OFF_ALPHA_LORD)!;
  return { state, battle, actor };
}

describe('capped primary-general tactical abilities', () => {
  it('a Gunshin deputy unlocks tactics but supplies no primary-general numerical bonus', () => {
    const { state, actor } = prepare(false, true);
    const officer = state.officers[actor.generalId]!;
    expect(getAvailableTacticIds(state, actor).map(String)).toContain('tac.inspire');
    expect(computeBattleUnitAttackPower(state, actor)).toBe(
      actor.troops *
        (1 + officer.val * BAL.valBattleFactor + officer.ldr * BAL.ldrBattleFactor) *
        (BAL.moraleFactorBase + actor.morale / BAL.moraleFactorDivisor),
    );
    expect(validateState(state)).toEqual([]);
  });
  it('caps all four transient calculation abilities after growth and Gunshin, without rounding or writes', () => {
    const { state, actor } = prepare(true);
    const officer = state.officers[actor.generalId]!;
    const before = structuredClone(officer);
    for (const stat of ['ldr', 'val', 'int', 'pol'] as const) {
      expect(getBattleOfficerStat(officer, stat)).toBe(
        Math.min(
          BAL.abilityMax,
          Math.min(BAL.abilityMax, officer[stat] + officer.statGrowth[stat]) *
            (1 + BAL.traitGunshin),
        ),
      );
    }
    expect(officer).toEqual(before);
    const capped = {
      ...officer,
      ldr: BAL.abilityMax,
      val: BAL.abilityMax,
      int: BAL.abilityMax,
      pol: BAL.abilityMax,
      statGrowth: {
        ldr: BAL.statGrowthCap,
        val: BAL.statGrowthCap,
        int: BAL.statGrowthCap,
        pol: BAL.statGrowthCap,
      },
    };
    for (const stat of ['ldr', 'val', 'int', 'pol'] as const) {
      expect(getEffectiveOfficerStat(capped, stat)).toBe(BAL.abilityMax);
      expect(getBattleOfficerStat(capped, stat)).toBe(BAL.abilityMax);
    }
  });
  it('caps ordinary base plus growth at 120 without changing any persisted state', () => {
    const { state, actor } = prepare();
    const officer = state.officers[actor.generalId]!;
    officer.val = BAL.abilityMax;
    officer.ldr = BAL.abilityMax;
    officer.statGrowth.val = BAL.statGrowthCap;
    officer.statGrowth.ldr = BAL.statGrowthCap;
    expect(validateState(state)).toEqual([]);
    const before = canonicalStringify(state);
    expect(computeBattleUnitAttackPower(state, actor)).toBe(
      actor.troops *
        (1 + BAL.abilityMax * BAL.valBattleFactor + BAL.abilityMax * BAL.ldrBattleFactor) *
        (BAL.moraleFactorBase + actor.morale / BAL.moraleFactorDivisor),
    );
    expect(canonicalStringify(state)).toBe(before);
  });

  it('uses Gunshin calculation stats once while keeping ordinary saihai and officer data untouched', () => {
    const { state, battle, actor } = prepare(true);
    const officer = state.officers[actor.generalId]!;
    const before = structuredClone(officer);
    const rng = structuredClone(state.rng);
    const saihai = battle.saihai.attacker;
    expect(computeBattleUnitAttackPower(state, actor)).toBe(
      actor.troops *
        (1 +
          Math.min(BAL.abilityMax, officer.val * (1 + BAL.traitGunshin)) * BAL.valBattleFactor +
          Math.min(BAL.abilityMax, officer.ldr * (1 + BAL.traitGunshin)) * BAL.ldrBattleFactor) *
        (BAL.moraleFactorBase + actor.morale / BAL.moraleFactorDivisor),
    );
    advanceBattleTick(state, battle.id, [
      { kind: 'toggleDelegate', unitId: actor.id, enabled: false },
    ]);
    expect(battle.saihai.attacker).toBe(
      Math.min(
        BAL.saihaiMax,
        saihai + BAL.saihaiBase + Math.floor(officer.ldr * BAL.saihaiLdrFactor),
      ),
    );
    expect(officer).toEqual(before);
    expect(state.rng).toEqual(rng);
    expect(validateState(state)).toEqual([]);
  });

  it('preserves native save continuation and deterministic real battle order outcomes', () => {
    const { state, battle, actor } = prepare(true);
    const decoded = decodeSave(encodeSave(state, 42));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.code);
    const restored = decoded.saveFile.state;
    const rng = structuredClone(state.rng);
    for (let tick = 0; tick < 4; tick++) {
      const edge = battle.edges.find(
        (candidate) => candidate.a === actor.jinId || candidate.b === actor.jinId,
      )!;
      const targetJinId = edge.a === actor.jinId ? edge.b : edge.a;
      const orders = [{ kind: 'move' as const, unitId: actor.id, targetJinId }];
      expect(advanceBattleTick(restored, battle.id, orders)).toEqual(
        advanceBattleTick(state, battle.id, orders),
      );
      expect(canonicalStringify(restored)).toBe(canonicalStringify(state));
      expect(validateState(state)).toEqual([]);
    }
    expect(state.rng).toEqual(rng);
  });

  it('delegated target choice uses capped Gunshin abilities without changing the existing AI morale formula', () => {
    const { state, battle, actor } = prepare(true);
    const enemy = battle.units.find((unit) => unit.side !== actor.side)!;
    // Isolated legal tactical positions/counts, not an authored historical layout.
    actor.jinId = enemy.jinId;
    actor.delegated = true;
    actor.troops = 1140;
    enemy.troops = 1500;
    actor.morale = enemy.morale = 100;
    battle.saihai = { attacker: 0, defender: 0 };
    const before = canonicalStringify(state);
    expect(validateState(state)).toEqual([]);
    expect(createDelegatedBattleOrders(state, battle)).toContainEqual({
      kind: 'attack',
      unitId: actor.id,
      targetUnitId: enemy.id,
    });
    expect(canonicalStringify(state)).toBe(before);
    state.officers[actor.generalId]!.traits = [];
    expect(createDelegatedBattleOrders(state, battle)).not.toContainEqual({
      kind: 'attack',
      unitId: actor.id,
      targetUnitId: enemy.id,
    });
  });
});
