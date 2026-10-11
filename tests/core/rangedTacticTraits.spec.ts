import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { applyMarch, validateMarch } from '../../src/core/commands/march';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { validateState } from '../../src/core/state/invariants';
import type { TacticId, TraitId } from '../../src/core/state/ids';
import { advanceBattleTick, applyStartKassen } from '../../src/core/systems/battle';
import { startFieldCombat } from '../../src/core/systems/fieldCombat';
import { applyBattleTactic, type BattleTacticOrder } from '../../src/core/tactics';
import {
  buildTinyState,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_TAISHO,
  OFF_ALPHA_BUSHO,
  OFF_BETA_TAISHO,
} from '../fixtures/tiny';

function fixture(primary: string[] = [], deputy: string[] = []) {
  const state = buildTinyState();
  state.castles[CASTLE_A2]!.soldiers = 2000;
  state.officers[OFF_ALPHA_BUSHO]!.locationCastleId = CASTLE_A2;
  state.officers[OFF_ALPHA_TAISHO]!.traits = primary as TraitId[];
  state.officers[OFF_ALPHA_BUSHO]!.traits = deputy as TraitId[];
  for (const command of [
    {
      type: 'march' as const,
      clanId: CLAN_ALPHA,
      originCastleId: CASTLE_A2,
      leaderId: OFF_ALPHA_TAISHO,
      deputyIds: [OFF_ALPHA_BUSHO],
      targetNodeId: CASTLE_B1,
      soldiers: 1500,
      food: 900,
    },
    {
      type: 'march' as const,
      clanId: CLAN_BETA,
      originCastleId: CASTLE_B1,
      leaderId: OFF_BETA_TAISHO,
      deputyIds: [],
      targetNodeId: CASTLE_A2,
      soldiers: 1500,
      food: 900,
    },
  ]) {
    expect(validateMarch(state, command)).toEqual({ ok: true });
    applyMarch(state, command, () => undefined);
  }
  const armies = Object.values(state.armies);
  for (const army of armies) {
    // Controlled actual-node meeting, not a fabricated BattleState.
    Object.assign(army, {
      posNodeId: CASTLE_A2,
      path: [CASTLE_A2],
      pathCursor: 0,
      edgeProgressDays: 0,
      edgeCostDays: 0,
      status: 'holding',
    });
  }
  expect(validateState(state)).toEqual([]);
  startFieldCombat(
    state,
    CASTLE_A2,
    armies.filter((a) => a.clanId === CLAN_ALPHA).map((a) => a.id),
    armies.filter((a) => a.clanId === CLAN_BETA).map((a) => a.id),
  );
  applyStartKassen(
    state,
    {
      type: 'startKassen',
      clanId: CLAN_ALPHA,
      fieldCombatId: Object.values(state.fieldCombats)[0]!.id,
    },
    () => undefined,
  );
  const battle = Object.values(state.battles)[0]!;
  const actor = battle.units.find((u) => u.side === 'attacker')!;
  const target = battle.units.find((u) => u.side === 'defender')!;
  target.jinId = actor.jinId;
  battle.units.forEach((u) => {
    u.delegated = false;
  });
  battle.saihai.attacker = BAL.saihaiMax;
  expect(validateState(state)).toEqual([]);
  const order = (triple = false): BattleTacticOrder => ({
    kind: 'tactic',
    unitId: actor.id,
    tacticId: (triple ? 'tac.triple-volley' : 'tac.volley') as TacticId,
    targetUnitId: target.id,
  });
  const basePower = (gunshin = false) => {
    const general = state.officers[actor.generalId]!;
    const stat = (base: number, growth: number) =>
      Math.min(
        BAL.abilityMax,
        Math.min(BAL.abilityMax, base + growth) * (gunshin ? 1 + BAL.traitGunshin : 1),
      );
    return (
      actor.troops *
      (1 +
        stat(general.val, general.statGrowth.val) * BAL.valBattleFactor +
        stat(general.ldr, general.statGrowth.ldr) * BAL.ldrBattleFactor) *
      (BAL.moraleFactorBase + actor.morale / BAL.moraleFactorDivisor)
    );
  };
  return { state, battle, actor, target, order, basePower };
}

describe('primary ranged volley trait hooks', () => {
  it.each([false, true])('composes both ranged hooks once per hit (triple=%s)', (triple) => {
    const { state, battle, target, order, basePower } = fixture(['trait.teppo']);
    const rng = { ...state.rng };
    const world = structuredClone({ officers: state.officers, armies: state.armies });
    const hit = Math.round(
      basePower() *
        BAL.battleTickDamageRate *
        (triple ? 1 : BAL.tacVolleyDamageMult) *
        (1 + BAL.traitTeppo) ** 2,
    );
    const expected = Math.min(target.troops, hit * (triple ? 3 : 1));
    expect(applyBattleTactic(state, battle, order(triple)).damageDealt).toBe(expected);
    expect(state.rng).toEqual(rng);
    expect({ officers: state.officers, armies: state.armies }).toEqual(world);
    expect(validateState(state)).toEqual([]);
  });

  it('uses capped primary Gunshin stats in fallback without melee multipliers', () => {
    const { state, battle, order, basePower } = fixture([
      'trait.gunshin',
      'trait.kiba',
      'trait.goketsu',
    ]);
    const general = state.officers[OFF_ALPHA_TAISHO]!;
    general.val = BAL.abilityMax;
    general.ldr = BAL.abilityMax - 10;
    expect(applyBattleTactic(state, battle, order()).damageDealt).toBe(
      Math.round(basePower(true) * BAL.battleTickDamageRate * BAL.tacVolleyDamageMult),
    );
  });

  it('does not double-modify supplied power or stack deputy numeric traits', () => {
    const { state, battle, order } = fixture(['trait.gunshin'], ['trait.teppo', 'trait.gunshin']);
    const supplied = 1000;
    expect(
      applyBattleTactic(state, battle, order(true), { attackPower: supplied }).damageDealt,
    ).toBe(3 * Math.round(supplied * BAL.battleTickDamageRate));
  });

  it('uses each primary ranged hook once even when a deputy has the same trait', () => {
    const { state, battle, order } = fixture(['trait.teppo', 'trait.gunshin'], ['trait.teppo']);
    const supplied = 1000;
    expect(applyBattleTactic(state, battle, order(), { attackPower: supplied }).damageDealt).toBe(
      Math.round(
        supplied * BAL.battleTickDamageRate * BAL.tacVolleyDamageMult * (1 + BAL.traitTeppo) ** 2,
      ),
    );
    const before = structuredClone(state);
    expect(applyBattleTactic(state, battle, order()).applied).toBe(false);
    expect(state).toEqual(before);
  });

  it('real tick orders report the same ranged damage as standalone fallback', () => {
    const { state, battle, order } = fixture(['trait.teppo', 'trait.gunshin', 'trait.kiba']);
    const copy = structuredClone(state);
    const standalone = applyBattleTactic(copy, copy.battles[battle.id]!, order());
    const tick = advanceBattleTick(state, battle.id, [order()]);
    const event = tick.events.find((e) => e.type === 'tactic.accepted');
    expect(event).toMatchObject({ type: 'tactic.accepted', damageDealt: standalone.damageDealt });
    expect(validateState(state)).toEqual([]);
  });

  it('caps triple-hit losses to remaining troops and preserves native continuation', () => {
    const { state, battle, target, order } = fixture(['trait.teppo']);
    target.troops = 10;
    const decoded = decodeSave(encodeSave(state, 123));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error('Valid ranged battle failed native codec');
    const loaded = decoded.saveFile.state;
    expect(applyBattleTactic(state, battle, order(true)).damageDealt).toBe(10);
    applyBattleTactic(loaded, loaded.battles[battle.id]!, order(true));
    expect(loaded).toEqual(state);
    expect(validateState(state)).toEqual([]);
  });
});
