import { describe, expect, it } from 'vitest';
import { applyMarch } from '../../src/core/commands/march';
import { ensureDiplomacyRow } from '../../src/core/systems/diplomacyCommon';
import { monthlyUprising } from '../../src/core/systems/uprising';
import { BAL } from '../../src/core/balance';
import { validateCommand } from '../../src/core/commands/validate';
import { validateState } from '../../src/core/state/invariants';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  DIST_A1X,
  DIST_A1Y,
  OFF_BETA_LORD,
  OFF_BETA_TAISHO,
  OFF_ALPHA_LORD,
} from '../fixtures/tiny';

function fixture(own = false) {
  const state = buildTinyState();
  for (const castle of Object.values(state.castles)) {
    castle.lordId = null;
    castle.conscriptPolicy = 'mid';
    castle.facilities = [];
  }
  for (const district of Object.values(state.districts)) {
    district.stewardId = null;
    district.publicOrder = 60;
  }
  const command = {
    type: 'march' as const,
    clanId: own ? CLAN_ALPHA : CLAN_BETA,
    originCastleId: own ? CASTLE_A1 : CASTLE_B1,
    leaderId: own ? OFF_ALPHA_LORD : OFF_BETA_LORD,
    deputyIds: [],
    soldiers: 100,
    food: 200,
    targetNodeId: own ? DIST_A1X : CASTLE_A2,
  };
  expect(validateCommand(state, command)).toEqual({ ok: true });
  applyMarch(state, command, () => {});
  const army = Object.values(state.armies)[0]!;
  army.posNodeId = DIST_A1X;
  army.path = [DIST_A1X, CASTLE_A1];
  army.pathCursor = 0;
  army.edgeProgressDays = 0;
  army.edgeCostDays = 0;
  const row = ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA);
  row.lastHostileDay = state.time.day;
  expect(validateState(state)).toEqual([]);
  return { state, army, row };
}

describe('05 §3.8.1 monthly enemy presence security', () => {
  it('deducts once for hostile armies actually at the district, without unrelated writes or RNG draws', () => {
    const { state, army } = fixture();
    const command = {
      type: 'march' as const,
      clanId: CLAN_BETA,
      originCastleId: CASTLE_B1,
      leaderId: OFF_BETA_TAISHO,
      deputyIds: [],
      soldiers: 100,
      food: 200,
      targetNodeId: CASTLE_A2,
    };
    expect(validateCommand(state, command)).toEqual({ ok: true });
    applyMarch(state, command, () => {});
    const duplicate = Object.values(state.armies).find(
      (entry) => entry.leaderId === OFF_BETA_TAISHO,
    )!;
    duplicate.posNodeId = army.posNodeId;
    duplicate.path = [...army.path];
    duplicate.pathCursor = army.pathCursor;
    duplicate.edgeProgressDays = 0;
    duplicate.edgeCostDays = 0;
    expect(validateState(state)).toEqual([]);
    const before = structuredClone(state);
    expect(monthlyUprising(state)).toEqual([]);
    expect(state.districts[DIST_A1X]!.publicOrder).toBe(60 - BAL.securityEnemyArmyDelta);
    expect(state.districts[DIST_A1Y]!.publicOrder).toBe(60);
    before.districts[DIST_A1X]!.publicOrder -= BAL.securityEnemyArmyDelta;
    expect(state).toEqual(before);
    expect(validateState(state)).toEqual([]);
  });

  it.each(['neutral', 'alliance', 'marriage', 'vassal', 'ceasefire', 'own'] as const)(
    'does not punish %s presence',
    (kind) => {
      const { state, row } = fixture(kind === 'own');
      if (kind === 'neutral') row.lastHostileDay = null;
      else if (kind !== 'own')
        row.pacts.push({
          kind,
          startDay: state.time.day,
          endDay: kind === 'alliance' || kind === 'ceasefire' ? state.time.day + 30 : null,
          vassalClanId: kind === 'vassal' ? CLAN_BETA : null,
        });
      const before = structuredClone(state);
      expect(validateState(state)).toEqual([]);
      expect(monthlyUprising(state)).toEqual([]);
      expect(state).toEqual(before);
      expect(validateState(state)).toEqual([]);
    },
  );

  it.each(['forward', 'reverse'] as const)(
    'does not punish a hostile %s transit using the last-arrived district',
    (direction) => {
      const { state, army } = fixture();
      army.edgeCostDays = 4;
      army.edgeProgressDays = 1;
      if (direction === 'reverse') army.reversingEdgeEndNodeId = CASTLE_A1;
      const before = structuredClone(state);
      expect(validateState(state)).toEqual([]);
      expect(monthlyUprising(state)).toEqual([]);
      expect(state).toEqual(before);
      expect(validateState(state)).toEqual([]);
    },
  );

  it('still counts hostile presence before any distance is paid on an entered edge', () => {
    const { state, army } = fixture();
    army.edgeCostDays = 4;
    army.edgeProgressDays = 0;
    expect(validateState(state)).toEqual([]);
    monthlyUprising(state);
    expect(state.districts[DIST_A1X]!.publicOrder).toBe(58);
    expect(validateState(state)).toEqual([]);
  });

  it('re-evaluates an expired pact and current ownership rather than caching diplomacy', () => {
    const { state, row } = fixture();
    row.pacts.push({
      kind: 'alliance',
      startDay: state.time.day - 2,
      endDay: state.time.day - 1,
      vassalClanId: null,
    });
    expect(validateState(state)).toEqual([]);
    monthlyUprising(state);
    expect(state.districts[DIST_A1X]!.publicOrder).toBe(58);
    expect(validateState(state)).toEqual([]);
    state.districts[DIST_A1X]!.ownerClanId = CLAN_BETA;
    monthlyUprising(state);
    expect(state.districts[DIST_A1X]!.publicOrder).toBe(58);
    expect(validateState(state)).toEqual([]);
  });
});
