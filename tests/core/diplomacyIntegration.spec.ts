import { describe, expect, it } from 'vitest';
import { applyMarch, validateMarch } from '../../src/core/commands/march';
import { applyAppointLord } from '../../src/core/commands/domesticCommands';
import { beginSiege, siegeSystem } from '../../src/core/systems/siege';
import { startFieldCombat, fieldCombatSystem } from '../../src/core/systems/fieldCombat';
import { diplomacySystem } from '../../src/core/systems/diplomacy';
import { economySystem } from '../../src/core/systems/economy';
import { monthlyGoldIncome } from '../../src/core/domestic';
import { ensureDiplomacyRow } from '../../src/core/systems/diplomacyCommon';
import { validateState } from '../../src/core/state/invariants';
import { BAL } from '../../src/core/balance';
import type { Army, GameState } from '../../src/core/state/gameState';
import type { CastleId, ClanId, OfficerId } from '../../src/core/state/ids';
import {
  buildTinyState,
  CLAN_ALPHA,
  CLAN_BETA,
  CASTLE_A1,
  CASTLE_B1,
  OFF_ALPHA_BUSHO,
  OFF_BETA_BUSHO,
  OFF_BETA_LORD,
} from '../fixtures/tiny';

function deploy(state: GameState, clanId: ClanId, castleId: CastleId, leaderId: OfficerId): Army {
  applyMarch(
    state,
    {
      type: 'march',
      clanId,
      originCastleId: castleId,
      leaderId,
      deputyIds: [],
      soldiers: 200,
      food: 120,
      targetNodeId: clanId === CLAN_ALPHA ? CASTLE_B1 : CASTLE_A1,
    },
    () => undefined,
  );
  return Object.values(state.armies).find((army) => army.leaderId === leaderId)!;
}
function place(army: Army, node: CastleId) {
  army.posNodeId = node;
  army.path = [node];
  army.pathCursor = 0;
  army.edgeCostDays = 0;
  army.edgeProgressDays = 0;
  army.status = 'holding';
}
function makePeace(state: GameState) {
  ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA).pacts.push({
    kind: 'ceasefire',
    startDay: state.time.day,
    endDay: state.time.day + 30,
    vassalClanId: null,
  });
  state.time.dayOfMonth = 2;
  state.time.day += 1;
}
describe('M6 cross-system contracts', () => {
  it('stops a siege without damage even when peace blocks the retreat route', () => {
    const state = buildTinyState(),
      army = deploy(state, CLAN_ALPHA, CASTLE_A1, OFF_ALPHA_BUSHO);
    place(army, CASTLE_B1);
    beginSiege(state, CASTLE_B1, army.id);
    expect(Object.keys(state.sieges)).toHaveLength(1);
    const castle = state.castles[CASTLE_B1]!,
      before = { soldiers: castle.soldiers, durability: castle.durability, morale: castle.morale };
    makePeace(state);
    diplomacySystem(state);
    siegeSystem(state);
    expect(castle).toMatchObject(before);
    expect(Object.keys(state.sieges)).toHaveLength(0);
    expect(state.armies[army.id]?.siegeId ?? null).toBeNull();
    expect(validateState(state)).toEqual([]);
  });
  it('ends field combat peacefully with no casualties, morale rewards, or random draws', () => {
    const state = buildTinyState(),
      a = deploy(state, CLAN_ALPHA, CASTLE_A1, OFF_ALPHA_BUSHO),
      b = deploy(state, CLAN_BETA, CASTLE_B1, OFF_BETA_BUSHO);
    place(a, CASTLE_B1);
    place(b, CASTLE_B1);
    startFieldCombat(state, CASTLE_B1, [a.id], [b.id]);
    expect(Object.keys(state.fieldCombats)).toHaveLength(1);
    const rng = structuredClone(state.rng),
      troops = [a.soldiers, b.soldiers],
      morale = [a.morale, b.morale];
    makePeace(state);
    diplomacySystem(state);
    fieldCombatSystem(state);
    expect(Object.keys(state.fieldCombats)).toHaveLength(0);
    expect([a.soldiers, b.soldiers]).toEqual(troops);
    expect([a.morale, b.morale]).toEqual(morale);
    expect(state.rng).toEqual(rng);
    expect(validateState(state)).toEqual([]);
  });
  it('blocks marching an officer assigned to diplomacy or intrigue', () => {
    const state = buildTinyState();
    state.diplomacy.missions.push({
      fromClanId: CLAN_ALPHA,
      target: CLAN_BETA,
      officerId: OFF_ALPHA_BUSHO,
      startDay: state.time.day,
    });
    expect(
      validateMarch(state, {
        type: 'march',
        clanId: CLAN_ALPHA,
        originCastleId: CASTLE_A1,
        leaderId: OFF_ALPHA_BUSHO,
        deputyIds: [],
        soldiers: 200,
        food: 120,
        targetNodeId: CASTLE_B1,
      }),
    ).toMatchObject({ ok: false, reasonKey: 'cmd.reject.officerBusy' });
  });
  it('clears the snapshot at the lord mutation boundary, even if restored the same day', () => {
    const state = buildTinyState(),
      castle = state.castles[CASTLE_B1]!;
    castle.betrayalReadyClanId = CLAN_ALPHA;
    castle.betrayalReadyUntilDay = state.time.day + 30;
    castle.betrayalReadyTargetClanId = CLAN_BETA;
    castle.betrayalReadyTargetLordId = castle.lordId;
    applyAppointLord(state, {
      type: 'appointLord',
      clanId: CLAN_BETA,
      castleId: CASTLE_B1,
      officerId: null,
    });
    applyAppointLord(state, {
      type: 'appointLord',
      clanId: CLAN_BETA,
      castleId: CASTLE_B1,
      officerId: OFF_BETA_LORD,
    });
    expect(castle.betrayalReadyClanId).toBeNull();
    expect(validateState(state)).toEqual([]);
  });
  it('transfers tribute from gross monthly income, never from treasury', () => {
    const ordinary = buildTinyState(),
      subject = structuredClone(ordinary);
    ensureDiplomacyRow(subject, CLAN_ALPHA, CLAN_BETA).pacts.push({
      kind: 'vassal',
      startDay: subject.time.day,
      endDay: null,
      vassalClanId: CLAN_BETA,
    });
    const tribute = Math.floor(monthlyGoldIncome(subject, CLAN_BETA) * BAL.vassalTributeRate);
    economySystem(ordinary);
    economySystem(subject);
    expect(subject.clans[CLAN_ALPHA]!.gold - ordinary.clans[CLAN_ALPHA]!.gold).toBe(tribute);
    expect(ordinary.clans[CLAN_BETA]!.gold - subject.clans[CLAN_BETA]!.gold).toBe(tribute);
  });
});
