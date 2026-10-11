import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { applyMarch, validateMarch } from '../../src/core/commands/march';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import type { Army, BattleState } from '../../src/core/state/gameState';
import { validateState } from '../../src/core/state/invariants';
import {
  advanceBattleTick,
  applyStartKassen,
  validateStartKassen,
} from '../../src/core/systems/battle';
import { startFieldCombat } from '../../src/core/systems/fieldCombat';
import {
  buildTinyState,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_TAISHO,
  OFF_BETA_TAISHO,
} from '../fixtures/tiny';

function fixture() {
  const state = buildTinyState(); // Fixed declared seed42.
  state.castles[CASTLE_A2]!.soldiers = 2000;
  const commands = [
    {
      type: 'march' as const,
      clanId: CLAN_ALPHA,
      originCastleId: CASTLE_A2,
      leaderId: OFF_ALPHA_TAISHO,
      targetNodeId: CASTLE_B1,
      deputyIds: [],
      soldiers: 1500,
      food: 900,
    },
    {
      type: 'march' as const,
      clanId: CLAN_BETA,
      originCastleId: CASTLE_B1,
      leaderId: OFF_BETA_TAISHO,
      targetNodeId: CASTLE_A2,
      deputyIds: [],
      soldiers: 1500,
      food: 900,
    },
  ];
  for (const command of commands) {
    expect(validateMarch(state, command)).toEqual({ ok: true });
    applyMarch(state, command, () => undefined);
  }
  const armies = Object.values(state.armies);
  for (const army of armies) {
    // Controlled real-node meeting, matching the existing battle unit fixture.
    army.posNodeId = CASTLE_A2;
    army.path = [CASTLE_A2];
    army.pathCursor = 0;
    army.edgeProgressDays = 0;
    army.edgeCostDays = 0;
    army.status = 'holding';
  }
  const side = (clanId: Army['clanId']) =>
    armies.filter((army) => army.clanId === clanId).map((army) => army.id);
  expect(validateState(state)).toEqual([]);
  startFieldCombat(state, CASTLE_A2, side(CLAN_ALPHA), side(CLAN_BETA));
  const combat = Object.values(state.fieldCombats)[0]!;
  const command = { type: 'startKassen' as const, clanId: CLAN_ALPHA, fieldCombatId: combat.id };
  expect(validateStartKassen(state, command)).toEqual({ ok: true });
  applyStartKassen(state, command, () => undefined);
  const battle = Object.values(state.battles)[0]!;
  // Isolate accumulation from tactic spending; delegation does not affect the cap.
  battle.units.forEach((unit) => {
    unit.delegated = false;
  });
  expect(validateState(state)).toEqual([]);
  return { state, battle };
}

describe('canonical20-point battle saihai boundary', () => {
  it('accumulates both sides from19 to20 and remains saturated on repeated real ticks', () => {
    expect(BAL.saihaiMax).toBe(20);
    const { state, battle } = fixture();
    battle.saihai = { attacker: 19, defender: 19 };
    expect(validateState(state)).toEqual([]);
    const armies = structuredClone(state.armies);
    for (let tick = 1; tick <= 3; tick += 1) {
      advanceBattleTick(state, battle.id);
      expect(battle.tick).toBe(tick);
      expect(battle.result).toBeNull();
      expect(battle.saihai).toEqual({ attacker: 20, defender: 20 });
      expect(validateState(state)).toEqual([]);
    }
    expect(state.armies).toEqual(armies);
    const decoded = decodeSave(encodeSave(state, 123));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error('Canonical capped battle failed native codec');
    expect(decoded.saveFile.state.battles[battle.id]!.saihai).toEqual({
      attacker: 20,
      defender: 20,
    });
    expect(validateState(decoded.saveFile.state)).toEqual([]);
  });

  it.each(['attacker', 'defender'] as const)(
    'rejects21 on the %s side in invariants and native decode',
    (side: keyof BattleState['saihai']) => {
      const { state, battle } = fixture();
      battle.saihai = { attacker: 20, defender: 20 };
      expect(validateState(state)).toEqual([]);
      battle.saihai[side] = 21;
      const before = structuredClone(state);
      expect(validateState(state).some((failure) => failure.inv === 'INV-13')).toBe(true);
      expect(decodeSave(encodeSave(state, 123))).toEqual({ ok: false, code: 'corrupt' });
      expect(state).toEqual(before);
    },
  );
});
