import { expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { applyCommands, CommandQueue } from '../../src/core/commands/queue';
import { validateCommand } from '../../src/core/commands/validate';
import { validateState } from '../../src/core/state/invariants';
import type { GameState } from '../../src/core/state/gameState';
import type { TraitId, TaimeiId } from '../../src/core/state/ids';
import { militaryMovementSystem } from '../../src/core/systems/military';
import { computeArmyPower } from '../../src/core/systems/fieldCombat';
import { siegeSystem } from '../../src/core/systems/siege';
import { taimeiEffects } from '../../src/core/systems/events/taimei';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import {
  buildTinyState,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_BETA,
  OFF_ALPHA_LORD,
  OFF_ALPHA_TAISHO,
  OFF_BETA_TAISHO,
  OFF_BETA_BUSHO,
  OFF_BETA_LORD,
} from '../fixtures/tiny';

function prepare() {
  const state = buildTinyState();
  state.meta.playerClanId = CLAN_BETA;
  state.castles[CASTLE_A2]!.soldiers = 100;
  // A real castle-lord command reaffirms the modeled defender, not a trait on an
  // arbitrary resident officer. Commands run with their genuine clan authority.
  const appointment = {
    type: 'appointLord' as const,
    clanId: state.castles[CASTLE_A2]!.ownerClanId,
    castleId: CASTLE_A2,
    officerId: OFF_ALPHA_TAISHO,
  };
  const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  const authority = { kind: 'clan' as const, clanId: appointment.clanId };
  expect(validateCommand(state, appointment, authority)).toEqual({ ok: true });
  queue.enqueue(appointment, state.time.day, authority);
  for (const [leaderId, soldiers] of [
    [OFF_BETA_TAISHO, 300],
    [OFF_BETA_BUSHO, 500],
  ] as const) {
    const command = {
      type: 'march' as const,
      clanId: CLAN_BETA,
      originCastleId: CASTLE_B1,
      leaderId,
      deputyIds: [],
      soldiers,
      food: 400,
      targetNodeId: CASTLE_A2,
    };
    expect(validateCommand(state, command)).toEqual({ ok: true });
    queue.enqueue(command, state.time.day);
  }
  expect(applyCommands(state, queue.drain(), () => {})).toHaveLength(3);
  expect(validateState(state)).toEqual([]);
  for (
    let day = 0;
    day < 20 && Object.values(state.armies).some((army) => army.siegeId === null);
    day++
  ) {
    militaryMovementSystem(state);
    expect(validateState(state)).toEqual([]);
  }
  expect(Object.values(state.sieges)).toHaveLength(1);
  expect(Object.values(state.sieges)[0]!.attackerArmyIds).toHaveLength(2);
  return state;
}

function day(state: GameState) {
  const rng = structuredClone(state.rng);
  const events = siegeSystem(state);
  expect(events).toEqual([]);
  expect(state.rng).toEqual(rng);
  expect(validateState(state)).toEqual([]);
}

it('weights Kojo durability damage by its actual attacking commander without boosting casualties', () => {
  const control = prepare();
  const subject = structuredClone(control);
  subject.officers[OFF_BETA_TAISHO]!.traits = ['trait.kojo' as TraitId];
  const armies = Object.values(control.armies);
  const ordinaryPower = armies.reduce((sum, army) => sum + computeArmyPower(control, army), 0);
  const enhancedPower = armies.reduce(
    (sum, army) =>
      sum +
      computeArmyPower(control, army) * (army.leaderId === OFF_BETA_TAISHO ? 1 + BAL.traitKojo : 1),
    0,
  );
  const before = control.castles[CASTLE_A2]!.durability;
  expect(
    Number.isInteger(
      before - ordinaryPower * BAL.assaultDurabilityRate * (1 - BAL.siegeMitigationBranch),
    ),
  ).toBe(false);
  day(control);
  day(subject);
  const mitigation = BAL.siegeMitigationBranch;
  expect(subject.castles[CASTLE_A2]!.durability).toBe(
    Math.round(before - enhancedPower * BAL.assaultDurabilityRate * (1 - mitigation)),
  );
  expect(control.castles[CASTLE_A2]!.durability).toBe(
    Math.round(before - ordinaryPower * BAL.assaultDurabilityRate * (1 - mitigation)),
  );
  expect(subject.castles[CASTLE_A2]!.soldiers).toBe(control.castles[CASTLE_A2]!.soldiers);
  expect(subject.armies).toEqual(control.armies);
});

it('rounds the Rojo half-point assault write separately and composes durability mitigation with actual taimei', () => {
  const state = prepare();
  state.officers[OFF_ALPHA_TAISHO]!.traits = ['trait.rojo' as TraitId];
  state.officers[OFF_BETA_TAISHO]!.traits = ['trait.kojo' as TraitId];
  const clan = state.clans[state.castles[CASTLE_A2]!.ownerClanId]!;
  clan.taimei.activeTaimeiId = 'taimei.teppeki' as TaimeiId;
  clan.taimei.activeUntilDay = state.time.day + 30;
  const castle = state.castles[CASTLE_A2]!;
  const before = { durability: castle.durability, morale: castle.morale };
  const power = Object.values(state.armies).reduce(
    (sum, army) =>
      sum +
      computeArmyPower(state, army) * (army.leaderId === OFF_BETA_TAISHO ? 1 + BAL.traitKojo : 1),
    0,
  );
  const effect = taimeiEffects(state, castle.ownerClanId);
  expect(effect.siegeDamageTakenMult).toBeLessThan(1);
  day(state);
  expect(castle.morale).toBe(before.morale);
  expect(castle.durability).toBe(
    Math.round(
      before.durability -
        power *
          BAL.assaultDurabilityRate *
          (1 - BAL.siegeMitigationBranch) *
          effect.siegeDamageTakenMult *
          (1 - BAL.traitRojo),
    ),
  );
  expect(Number.isInteger(castle.durability)).toBe(true);
  expect(Number.isInteger(castle.morale)).toBe(true);
});

it.each(['assault', 'encircle'] as const)(
  'Rojo reduces real lord daily %s morale and starvation losses, not defender troop losses',
  (mode) => {
    const control = prepare();
    const subject = structuredClone(control);
    subject.officers[OFF_ALPHA_TAISHO]!.traits = ['trait.rojo' as TraitId];
    for (const state of [control, subject]) {
      Object.values(state.sieges)[0]!.mode = mode;
      state.castles[CASTLE_A2]!.food = 0;
    }
    const before = control.castles[CASTLE_A2]!.durability;
    const power = Object.values(control.armies).reduce(
      (sum, army) => sum + computeArmyPower(control, army),
      0,
    );
    const beforeMorale = control.castles[CASTLE_A2]!.morale;
    day(control);
    day(subject);
    const baseMorale =
      mode === 'assault' ? BAL.assaultCastleMoraleDaily : BAL.encircleCastleMoraleDaily;
    expect(subject.castles[CASTLE_A2]!.morale).toBe(
      Math.round(
        Math.round(beforeMorale - baseMorale * (1 - BAL.traitRojoMorale)) -
          BAL.starvingCastleMoraleDaily * (1 - BAL.traitRojoMorale),
      ),
    );
    expect(subject.castles[CASTLE_A2]!.morale).toBeGreaterThan(control.castles[CASTLE_A2]!.morale);
    expect(subject.castles[CASTLE_A2]!.durability).toBe(
      mode === 'assault'
        ? Math.round(
            before -
              power *
                BAL.assaultDurabilityRate *
                (1 - BAL.siegeMitigationBranch) *
                (1 - BAL.traitRojo),
          )
        : before,
    );
    expect(subject.castles[CASTLE_A2]!.soldiers).toBe(control.castles[CASTLE_A2]!.soldiers);
  },
);

it('unrelated officers do not affect the siege and a missing lord is a neutral modifier', () => {
  const control = prepare();
  const subject = structuredClone(control);
  subject.officers[OFF_ALPHA_LORD]!.traits = ['trait.rojo' as TraitId];
  subject.officers[OFF_BETA_LORD]!.traits = ['trait.kojo' as TraitId];
  day(control);
  day(subject);
  expect(subject.castles[CASTLE_A2]).toEqual(control.castles[CASTLE_A2]);
  expect(subject.armies).toEqual(control.armies);
  subject.castles[CASTLE_A2]!.lordId = null;
  expect(() => day(subject)).not.toThrow();
});

it('native save continuation retains both trait effects and exact daily state/RNG', () => {
  const state = prepare();
  state.officers[OFF_BETA_TAISHO]!.traits = ['trait.kojo' as TraitId];
  state.officers[OFF_ALPHA_TAISHO]!.traits = ['trait.rojo' as TraitId];
  day(state);
  const saved = decodeSave(encodeSave(state, 42));
  expect(saved.ok).toBe(true);
  if (!saved.ok) throw new Error(saved.code);
  for (let i = 0; i < 3; i++) {
    day(state);
    day(saved.saveFile.state);
    expect(saved.saveFile.state).toEqual(state);
  }
});
