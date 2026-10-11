import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { applyMarch, validateMarch } from '../../src/core/commands/march';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import type { OfficerId } from '../../src/core/state/ids';
import { validateState } from '../../src/core/state/invariants';
import {
  buildTinyState,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  OFF_ALPHA_BUSHO,
  OFF_ALPHA_TAISHO,
  TINY_SCENARIO,
} from '../fixtures/tiny';

function fixture() {
  const scenario = structuredClone(TINY_SCENARIO);
  const template = scenario.officers.find((officer) => officer.id === OFF_ALPHA_BUSHO)!;
  const deputies = ['off.quota-one', 'off.quota-two', 'off.quota-three'] as OfficerId[];
  deputies.forEach((id, index) => {
    scenario.officers.push({
      ...structuredClone(template),
      id,
      name: `Deputy ${index + 1}`,
      locationCastleId: CASTLE_A2,
    });
  });
  const state = buildTinyState(scenario);
  expect(validateState(state)).toEqual([]);
  const command = {
    type: 'march' as const,
    clanId: CLAN_ALPHA,
    originCastleId: CASTLE_A2,
    targetNodeId: CASTLE_B1,
    leaderId: OFF_ALPHA_TAISHO,
    deputyIds: deputies.slice(0, 2),
    soldiers: 300,
    food: 180,
  };
  return { state, deputies, command };
}

describe('canonical two-deputy capacity boundary', () => {
  it('accepts two distinct eligible deputies, applies valid officer links, and roundtrips the native codec', () => {
    expect(BAL.maxDeputies).toBe(2);
    const { state, command } = fixture();
    expect(validateMarch(state, command)).toEqual({ ok: true });
    applyMarch(state, command, () => undefined);
    const army = Object.values(state.armies)[0]!;
    expect(army.deputyIds).toEqual(command.deputyIds);
    for (const id of [army.leaderId, ...army.deputyIds])
      expect(state.officers[id]!.armyId).toBe(army.id);
    expect(validateState(state)).toEqual([]);
    const decoded = decodeSave(encodeSave(state, 123));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error('Valid two-deputy march failed native save decode');
    expect(decoded.saveFile.state.armies[army.id]!.deputyIds).toEqual(command.deputyIds);
    expect(validateState(decoded.saveFile.state)).toEqual([]);
  });

  it('rejects three distinct deputies solely at the quota while every deputy is otherwise eligible', () => {
    const { state, deputies, command } = fixture();
    for (const deputy of deputies) {
      expect(validateMarch(state, { ...command, deputyIds: [deputy] })).toEqual({ ok: true });
    }
    const before = structuredClone(state);
    expect(validateMarch(state, { ...command, deputyIds: deputies })).toEqual({
      ok: false,
      reasonKey: 'cmd.reject.officerBusy',
    });
    expect(state).toEqual(before);
    expect(validateState(state)).toEqual([]);
  });

  it('rejects a three-deputy saved army with otherwise valid officer backlinks through INV06', () => {
    const { state, deputies, command } = fixture();
    expect(validateMarch(state, command)).toEqual({ ok: true });
    applyMarch(state, command, () => undefined);
    const army = Object.values(state.armies)[0]!;
    const extra = state.officers[deputies[2]!]!;
    army.deputyIds.push(extra.id);
    extra.armyId = army.id;
    extra.locationCastleId = null;
    const violations = validateState(state);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.inv).toBe('INV-06');
    expect(decodeSave(encodeSave(state, 123))).toEqual({ ok: false, code: 'corrupt' });
  });
});
