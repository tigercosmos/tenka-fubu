import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { applyMarch, validateMarch } from '../../src/core/commands/march';
import { advanceDay } from '../../src/core/systems';
import { computeArmyPower } from '../../src/core/systems/fieldCombat';
import { siegeSystem } from '../../src/core/systems/siege';
import { validateState } from '../../src/core/state/invariants';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import type { CmdMarch } from '../../src/core/commands/types';
import type { TraitId, FacilityTypeId } from '../../src/core/state/ids';
import {
  buildTinyState,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_BETA,
  OFF_ALPHA_TAISHO,
  OFF_BETA_TAISHO,
} from '../fixtures/tiny';

function realSiege(troops = 300, defenders = 200) {
  const state = buildTinyState();
  state.meta.playerClanId = CLAN_BETA;
  state.castles[CASTLE_A2]!.soldiers = defenders;
  const command: CmdMarch = {
    type: 'march',
    clanId: CLAN_BETA,
    originCastleId: CASTLE_B1,
    leaderId: OFF_BETA_TAISHO,
    deputyIds: [],
    soldiers: troops,
    food: troops,
    targetNodeId: CASTLE_A2,
  };
  expect(validateMarch(state, command)).toEqual({ ok: true });
  applyMarch(state, command, () => {});
  for (let day = 0; day < 20 && Object.keys(state.sieges).length === 0; day++) {
    advanceDay(state, []);
    expect(validateState(state)).toEqual([]);
  }
  expect(Object.values(state.sieges)).toHaveLength(1);
  expect(Object.values(state.sieges)[0]!.mode).toBe('assault');
  return state;
}

function defend(base: number, growth: number, gunshin = false) {
  const state = realSiege();
  // Controlled valid ability boundary on an actual command-generated siege.
  const lord = state.officers[OFF_ALPHA_TAISHO]!;
  lord.ldr = base;
  lord.statGrowth.ldr = growth;
  lord.traits = gunshin ? ['trait.gunshin' as TraitId] : [];
  expect(validateState(state)).toEqual([]);
  const castle = state.castles[CASTLE_A2]!;
  const siege = Object.values(state.sieges)[0]!;
  const army = state.armies[siege.attackerArmyIds[0]!]!;
  const troops = army.soldiers;
  const expectedLoss = Math.round(
    castle.soldiers *
      (1 + Math.min(BAL.abilityMax, base + growth) * BAL.ldrCombatFactor) *
      (1 + BAL.siegeMitigationBranch) *
      BAL.assaultAttackerLossRate,
  );
  const rng = structuredClone(state.rng);
  const events = siegeSystem(state);
  expect(troops - army.soldiers).toBe(expectedLoss);
  expect(lord.ldr).toBe(base);
  expect(lord.statGrowth.ldr).toBe(growth);
  expect(state.rng).toEqual(rng);
  expect(validateState(state)).toEqual([]);
  return { state, events, loss: troops - army.soldiers };
}

describe('ordinary effective castle-lord siege leadership', () => {
  it('caps base plus growth at abilityMax without discarding below-cap growth', () => {
    const capped = defend(BAL.abilityMax, BAL.statGrowthCap);
    const baseOnly = defend(BAL.abilityMax, 0);
    const exactCap = defend(BAL.abilityMax - BAL.statGrowthCap, BAL.statGrowthCap);
    expect(capped.loss).toBe(baseOnly.loss);
    expect(exactCap.loss).toBe(baseOnly.loss);
    const below = defend(BAL.abilityMax - 30, 0);
    const grown = defend(BAL.abilityMax - 30, BAL.statGrowthCap);
    expect(grown.loss).toBeGreaterThan(below.loss);
  });

  it('does not apply the tactical Gunshin multiplier to ordinary siege defense', () => {
    expect(defend(BAL.abilityMax - 30, BAL.statGrowthCap, true).loss).toBe(
      defend(BAL.abilityMax - 30, BAL.statGrowthCap).loss,
    );
  });

  it('preserves capped siege behavior through native save continuation', () => {
    const { state } = defend(BAL.abilityMax, BAL.statGrowthCap);
    const decoded = decodeSave(encodeSave(state, 42));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.code);
    const loaded = decoded.saveFile.state;
    expect(advanceDay(loaded, []).events).toEqual(advanceDay(state, []).events);
    // Native saves intentionally omit transient AI diagnostic intent history.
    state.ai.intentLog = [];
    loaded.ai.intentLog = [];
    expect(loaded).toEqual(state);
    expect(validateState(state)).toEqual([]);
  });
});

describe('completed origin smithy assault support', () => {
  it('increases actual assault defender losses once and leaves counterattack losses unchanged', () => {
    const plain = realSiege(1000, 800);
    plain.castles[CASTLE_B1]!.facilities = [];
    const boosted = structuredClone(plain);
    boosted.castles[CASTLE_B1]!.facilities.push('fac.kajiba' as FacilityTypeId);
    const siege = Object.values(plain.sieges)[0]!;
    const army = plain.armies[siege.attackerArmyIds[0]!]!;
    const power = computeArmyPower(plain, army);
    const beforeDefenders = plain.castles[CASTLE_A2]!.soldiers;
    const beforeAttackers = army.soldiers;
    const rng = structuredClone(boosted.rng);
    siegeSystem(plain);
    siegeSystem(boosted);
    expect(beforeDefenders - plain.castles[CASTLE_A2]!.soldiers).toBe(
      Math.round(power * BAL.assaultDefenderLossRate),
    );
    expect(beforeDefenders - boosted.castles[CASTLE_A2]!.soldiers).toBe(
      Math.round(power * 1.05 * BAL.assaultDefenderLossRate),
    );
    expect(boosted.castles[CASTLE_A2]!.soldiers).toBeLessThan(plain.castles[CASTLE_A2]!.soldiers);
    expect(boosted.armies[army.id]!.soldiers).toBe(plain.armies[army.id]!.soldiers);
    expect(beforeAttackers - plain.armies[army.id]!.soldiers).toBeGreaterThan(0);
    expect(boosted.rng).toEqual(rng);
    expect(validateState(plain)).toEqual([]);
    expect(validateState(boosted)).toEqual([]);
  });
});
