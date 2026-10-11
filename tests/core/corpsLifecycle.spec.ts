import { describe, expect, it } from 'vitest';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_BUSHO,
  OFF_ALPHA_LORD,
  OFF_BETA_LORD,
} from '../fixtures/tiny';
import { applyCreateCorps } from '../../src/core/commands/corpsCommands';
import { applyMarch } from '../../src/core/commands/march';
import { dieOfficer } from '../../src/core/systems/officers';
import { beginSiege, siegeSystem } from '../../src/core/systems/siege';
import { destroyClanRemnants } from '../../src/core/systems/victory';
import { dissolveCorps } from '../../src/core/systems/corps';
import type { CastleId } from '../../src/core/state/ids';
import type { GameState } from '../../src/core/state/gameState';

function corpsFixture(castleIds: CastleId[] = [CASTLE_A1, CASTLE_A2]) {
  const state = buildTinyState();
  state.officers[OFF_ALPHA_BUSHO]!.rank = 'karo';
  state.officers[OFF_ALPHA_BUSHO]!.locationCastleId = CASTLE_A2;
  for (const id of castleIds) state.castles[id]!.directControl = true;
  applyCreateCorps(
    state,
    {
      type: 'createCorps',
      clanId: CLAN_ALPHA,
      corpsLeaderId: OFF_ALPHA_BUSHO,
      castleIds,
      directive: 'hold',
      targetNodeId: null,
    },
    () => {},
  );
  const corps = Object.values(state.corps)[0]!;
  corps.gold = 321;
  return { state, corps };
}

function capture(state: GameState, castleId: CastleId) {
  let army = Object.values(state.armies).find((a) => a.clanId === CLAN_BETA);
  if (!army) {
    applyMarch(
      state,
      {
        type: 'march',
        clanId: CLAN_BETA,
        originCastleId: CASTLE_B1,
        leaderId: OFF_BETA_LORD,
        deputyIds: [],
        soldiers: 300,
        food: 300,
        targetNodeId: castleId,
      },
      () => {},
    );
    army = Object.values(state.armies).find((a) => a.clanId === CLAN_BETA)!;
  }
  army.posNodeId = castleId;
  army.status = 'holding';
  state.castles[castleId]!.soldiers = 0;
  beginSiege(state, castleId, army.id);
  const events = siegeSystem(state);
  expect(events).toContainEqual(
    expect.objectContaining({ type: 'siege.ended', castleId, fallen: true }),
  );
}

describe('shared corps lifecycle cleanup', () => {
  it('leader death refunds once and restores all owned members to direct control', () => {
    const { state, corps } = corpsFixture();
    const gold = state.clans[CLAN_ALPHA]!.gold;
    dieOfficer(state, OFF_ALPHA_BUSHO, null);
    expect(state.corps[corps.id]).toBeUndefined();
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(gold + 321);
    expect(
      [CASTLE_A1, CASTLE_A2].every(
        (id) => state.castles[id]!.directControl && state.castles[id]!.corpsId === null,
      ),
    ).toBe(true);
    dissolveCorps(state, corps.id);
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(gold + 321);
  });
  it('member capture releases only its originating army and keeps a surviving corps wallet', () => {
    const { state, corps } = corpsFixture();
    applyMarch(
      state,
      {
        type: 'march',
        clanId: CLAN_ALPHA,
        originCastleId: CASTLE_A1,
        leaderId: OFF_ALPHA_LORD,
        deputyIds: [],
        soldiers: 100,
        food: 100,
        targetNodeId: CASTLE_B1,
      },
      () => {},
    );
    const ownArmy = Object.values(state.armies).find((a) => a.clanId === CLAN_ALPHA)!;
    capture(state, CASTLE_A1);
    expect(ownArmy.corpsId).toBeNull();
    expect(state.corps[corps.id]?.gold).toBe(321);
    expect(state.castles[CASTLE_A2]!.corpsId).toBe(corps.id);
    expect(state.castles[CASTLE_A2]!.directControl).toBe(false);
    expect(state.castles[CASTLE_A1]).toMatchObject({
      ownerClanId: CLAN_BETA,
      corpsId: null,
      directControl: true,
    });
  });
  it('last member capture returns the wallet to a surviving old clan exactly once', () => {
    const { state, corps } = corpsFixture([CASTLE_A1]);
    const gold = state.clans[CLAN_ALPHA]!.gold;
    capture(state, CASTLE_A1);
    expect(state.clans[CLAN_ALPHA]!.alive).toBe(true);
    expect(state.corps[corps.id]).toBeUndefined();
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(gold + 321);
    dissolveCorps(state, corps.id);
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(gold + 321);
  });
  it('successive capture destroys the old clan without transferring its wallet to the conqueror', () => {
    const { state, corps } = corpsFixture();
    const gold = state.clans[CLAN_ALPHA]!.gold,
      conquerorGold = state.clans[CLAN_BETA]!.gold;
    capture(state, CASTLE_A1);
    capture(state, CASTLE_A2);
    expect(state.clans[CLAN_ALPHA]!.alive).toBe(false);
    expect(state.corps[corps.id]).toBeUndefined();
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(gold + 321);
    expect(state.clans[CLAN_BETA]!.gold).toBe(conquerorGold);
  });
  it('remnant destruction clears corps references but does not overwrite foreign castle control', () => {
    const { state, corps } = corpsFixture();
    const gold = state.clans[CLAN_ALPHA]!.gold;
    for (const id of [CASTLE_A1, CASTLE_A2]) state.castles[id]!.ownerClanId = CLAN_BETA;
    expect(destroyClanRemnants(state, state.clans[CLAN_ALPHA]!, [])).toBe(true);
    expect(state.corps[corps.id]).toBeUndefined();
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(gold + 321);
    expect(state.castles[CASTLE_A1]!.corpsId).toBeNull();
    expect(state.castles[CASTLE_A1]!.directControl).toBe(false);
    dissolveCorps(state, corps.id);
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(gold + 321);
  });
});
