import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { applyCommands, CommandQueue } from '../../src/core/commands/queue';
import { validateCommand } from '../../src/core/commands/validate';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { validateState } from '../../src/core/state/invariants';
import { canonicalStringify, defaultDiplomacyRow, pairKey } from '../../src/core/state/serialize';
import { computeArmyPower, fieldCombatSystem } from '../../src/core/systems/fieldCombat';
import { militaryMovementSystem } from '../../src/core/systems/military';
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

/** Synthetic initial frontier; armies and encounter come only from legal queued marches. */
function encounter(deputyTrait = false) {
  const state = buildTinyState();
  const id = 'road.field-effective-frontier' as RoadEdgeId;
  state.roads[id] = { id, a: CASTLE_A1, b: CASTLE_B1, type: 'land', grade: 1, baseDays: 4 };
  const row = defaultDiplomacyRow(CLAN_ALPHA, CLAN_BETA);
  row.lastHostileDay = state.time.day;
  state.diplomacy.rows[pairKey(CLAN_ALPHA, CLAN_BETA)] = row;
  for (const officerId of [OFF_ALPHA_LORD, OFF_BETA_LORD]) {
    const officer = state.officers[officerId]!;
    officer.ldr = BAL.abilityMax;
    officer.statGrowth.ldr = BAL.statGrowthCap;
    officer.traits = [];
  }
  state.officers[OFF_ALPHA_BUSHO]!.traits = deputyTrait ? ['trait.goketsu' as TraitId] : [];
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
      targetNodeId,
      deputyIds: clanId === CLAN_ALPHA ? [OFF_ALPHA_BUSHO] : [],
      soldiers: 1500,
      food: 1000,
    };
    const authority =
      clanId === CLAN_ALPHA ? { kind: 'player' as const } : { kind: 'clan' as const, clanId };
    expect(validateCommand(state, command, authority)).toEqual({ ok: true });
    queue.enqueue(command, state.time.day, authority);
  }
  expect(applyCommands(state, queue.drain(), () => {})).toHaveLength(2);
  for (let day = 0; day < 30 && !Object.keys(state.fieldCombats).length; day++) {
    militaryMovementSystem(state);
    expect(validateState(state)).toEqual([]);
  }
  expect(Object.keys(state.fieldCombats)).toHaveLength(1);
  const alpha = Object.values(state.armies).find((army) => army.clanId === CLAN_ALPHA)!;
  const beta = Object.values(state.armies).find((army) => army.clanId === CLAN_BETA)!;
  return { state, alpha, beta };
}

describe('ordinary field-combat effective leadership', () => {
  it('caps growth at 120, preserves below-cap growth, and never applies Gunshin', () => {
    const { state, alpha } = encounter();
    const officer = state.officers[alpha.leaderId]!;
    for (const [base, growth] of [
      [BAL.abilityMax, BAL.statGrowthCap],
      [BAL.abilityMax - 1, 1],
      [90, 3],
    ]) {
      officer.ldr = base!;
      officer.statGrowth.ldr = growth!;
      officer.traits = ['trait.gunshin' as TraitId];
      const before = canonicalStringify(state);
      expect(computeArmyPower(state, alpha)).toBe(
        alpha.soldiers *
          (1 + Math.min(BAL.abilityMax, base! + growth!) * BAL.ldrCombatFactor) *
          (BAL.moraleFactorBase + alpha.morale / BAL.moraleFactorDivisor),
      );
      expect(canonicalStringify(state)).toBe(before);
      expect(validateState(state)).toEqual([]);
    }
  });

  it('uses capped power in a real encounter tick and preserves field-specific deputy traits', () => {
    const { state, alpha, beta } = encounter(true);
    const betaBefore = beta.soldiers;
    const power =
      alpha.soldiers *
      (1 + BAL.abilityMax * BAL.ldrCombatFactor) *
      (BAL.moraleFactorBase + alpha.morale / BAL.moraleFactorDivisor);
    const owner = state.castles[alpha.posNodeId as typeof CASTLE_A1]?.ownerClanId ?? null;
    const expected = Math.round(
      power *
        BAL.fieldCombatDailyLossRate *
        (owner === CLAN_BETA ? BAL.homeGroundLossMult : 1) *
        Math.min(BAL.traitCombatMultCap, 1 + BAL.traitGoketsu),
    );
    const rng = structuredClone(state.rng);
    fieldCombatSystem(state);
    expect(betaBefore - beta.soldiers).toBe(expected);
    expect(state.rng).toEqual(rng);
    expect(validateState(state)).toEqual([]);
  });

  it('continues identically through the native save codec without altering officer abilities', () => {
    const { state } = encounter(true);
    fieldCombatSystem(state);
    const decoded = decodeSave(encodeSave(state, 0));
    if (!decoded.ok) throw new Error(JSON.stringify(decoded));
    const restored = decoded.saveFile.state;
    const officers = structuredClone(state.officers);
    for (let day = 0; day < 4; day++) {
      expect(fieldCombatSystem(restored)).toEqual(fieldCombatSystem(state));
      expect(canonicalStringify(restored)).toBe(canonicalStringify(state));
      expect(validateState(state)).toEqual([]);
      expect(validateState(restored)).toEqual([]);
    }
    expect(state.officers).toEqual(officers);
  });
});
