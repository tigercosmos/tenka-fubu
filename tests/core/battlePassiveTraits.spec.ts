import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { applyCommands, CommandQueue } from '../../src/core/commands/queue';
import { validateCommand } from '../../src/core/commands/validate';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { validateState } from '../../src/core/state/invariants';
import { defaultDiplomacyRow, pairKey } from '../../src/core/state/serialize';
import { advanceBattleTick, type BattleCommand } from '../../src/core/systems/battle';
import { militaryMovementSystem } from '../../src/core/systems/military';
import type { RoadEdgeId, TacticId, TraitId } from '../../src/core/state/ids';
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

/** Synthetic initial frontier; real queued marches, physical encounter, then legal kassen. */
function fixture(primary: TraitId[] = [], deputy: TraitId[] = []) {
  const state = buildTinyState();
  const roadId = 'road.passive-traits-frontier' as RoadEdgeId;
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
  state.officers[OFF_ALPHA_LORD]!.traits = primary;
  state.officers[OFF_ALPHA_BUSHO]!.traits = deputy;
  state.officers[OFF_BETA_LORD]!.traits = [];
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
      deputyIds: clanId === CLAN_ALPHA ? [OFF_ALPHA_BUSHO] : [],
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
  const start = { type: 'startKassen' as const, clanId: CLAN_ALPHA, fieldCombatId: combat.id };
  expect(validateCommand(state, start)).toEqual({ ok: true });
  queue.enqueue(start, state.time.day);
  expect(applyCommands(state, queue.drain(), () => {})).toHaveLength(1);
  const battle = Object.values(state.battles)[0]!;
  const actor = battle.units.find((unit) => unit.generalId === OFF_ALPHA_LORD)!;
  const enemy = battle.units.find((unit) => unit.generalId === OFF_BETA_LORD)!;
  // Isolate the contact stage at valid tactical positions, not a full campaign journey claim.
  enemy.jinId = actor.jinId;
  actor.delegated = false;
  battle.saihai = { attacker: 0, defender: 0 };
  expect(validateState(state)).toEqual([]);
  const attack: BattleCommand = { kind: 'attack', unitId: actor.id, targetUnitId: enemy.id };
  return { state, battle, actor, enemy, attack };
}

describe('primary-general passive tactical traits', () => {
  it('keeps the existing per-tick morale-loss formula: a battle刻 is not a strategic day', () => {
    const { state, battle, actor, attack } = fixture(['trait.reisei' as TraitId]);
    actor.troops = 1000;
    actor.morale = 70;
    const control = structuredClone(state);
    control.officers[actor.generalId]!.traits = [];
    const rng = structuredClone(state.rng);
    expect(advanceBattleTick(state, battle.id, [attack])).toEqual(
      advanceBattleTick(control, battle.id, [attack]),
    );
    expect(actor.morale).toBe(68);
    expect(actor.morale).toBe(
      control.battles[battle.id]!.units.find((unit) => unit.id === actor.id)!.morale,
    );
    expect(state.rng).toEqual(rng);
    expect(validateState(state)).toEqual([]);
    expect(validateState(control)).toEqual([]);
  });

  it('preserves the accepted last-stand morale floor before rout checks', () => {
    const { state, battle, actor, attack } = fixture([
      'trait.reisei' as TraitId,
      'trait.kesshi' as TraitId,
    ]);
    actor.morale = BAL.moraleBreakThreshold + 1;
    battle.saihai.attacker = 6;
    const rng = structuredClone(state.rng);
    const result = advanceBattleTick(state, battle.id, [
      attack,
      {
        kind: 'tactic',
        unitId: actor.id,
        tacticId: 'tac.last-stand' as TacticId,
        targetUnitId: null,
      },
    ]);
    expect(result.events).toContainEqual(
      expect.objectContaining({ type: 'tactic.accepted', tacticId: 'tac.last-stand' }),
    );
    expect(actor.morale).toBe(BAL.moraleBreakThreshold + 1);
    expect(actor.routed).toBe(false);
    expect(state.rng).toEqual(rng);
    expect(validateState(state)).toEqual([]);
  });
  it.each([0, 1])(
    'checks the lowered threshold inclusively after actual damage (offset=%s)',
    (offset) => {
      const { state, battle, actor, attack } = fixture(['trait.reisei' as TraitId]);
      const threshold = BAL.moraleBreakThreshold - BAL.traitReiseiRout;
      actor.morale = threshold + 1 + offset;
      advanceBattleTick(state, battle.id, [attack]);
      expect(actor.morale).toBe(threshold + offset);
      expect(actor.routed).toBe(offset === 0);
      expect(validateState(state)).toEqual([]);
    },
  );

  it('a deputy does not lower the primary-general rout threshold', () => {
    const { state, battle, actor, attack } = fixture([], ['trait.reisei' as TraitId]);
    actor.morale = BAL.moraleBreakThreshold + 1;
    advanceBattleTick(state, battle.id, [attack]);
    expect(actor.morale).toBe(BAL.moraleBreakThreshold);
    expect(actor.routed).toBe(true);
    expect(validateState(state)).toEqual([]);
  });

  it('low troop counts still rout a high-morale Reisei primary general', () => {
    const { state, battle, actor, attack } = fixture(['trait.reisei' as TraitId]);
    actor.troops = Math.floor(actor.battleInitialTroops * BAL.routTroopRatio) - 1;
    actor.morale = 100;
    advanceBattleTick(state, battle.id, [attack]);
    expect(actor.routed).toBe(true);
    expect(validateState(state)).toEqual([]);
  });
  it('Reisei lowers the tactical morale rout threshold, not the independent troop threshold', () => {
    const { state, battle, actor, attack } = fixture(['trait.reisei' as TraitId]);
    actor.morale = BAL.moraleBreakThreshold + 1;
    const troops = actor.troops;
    const rng = structuredClone(state.rng);
    advanceBattleTick(state, battle.id, [attack]);
    expect(actor.troops).toBeLessThan(troops);
    expect(actor.morale).toBeGreaterThan(BAL.moraleBreakThreshold - BAL.traitReiseiRout);
    expect(actor.routed).toBe(false);
    expect(state.rng).toEqual(rng);
    expect(validateState(state)).toEqual([]);
  });

  it('native save continuation preserves passive trait tick outcomes and RNG', () => {
    const { state, battle, actor, attack } = fixture(['trait.reisei' as TraitId]);
    actor.morale = BAL.moraleBreakThreshold + 1;
    const decoded = decodeSave(encodeSave(state, 42));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.code);
    const restored = decoded.saveFile.state;
    expect(advanceBattleTick(restored, battle.id, [attack])).toEqual(
      advanceBattleTick(state, battle.id, [attack]),
    );
    expect(restored).toEqual(state);
    expect(validateState(state)).toEqual([]);
  });
});
