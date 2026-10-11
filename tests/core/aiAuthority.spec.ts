import { describe, expect, it } from 'vitest';
import { validateCommand } from '../../src/core/commands/validate';
import { applyCommand } from '../../src/core/commands/apply';
import { validateExecutionAuthority } from '../../src/core/commands/authority';
import type { Command } from '../../src/core/commands/types';
import type { CorpsId, FacilityTypeId, SiegeId } from '../../src/core/state/ids';
import { dispatchCommand, resetBridgeForTests } from '../../src/app/bridge';
import { resetGameStoreForTests, store } from '../../src/app/store';
import { CoreError } from '../../src/core/errors';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_BUSHO,
  OFF_BETA_BUSHO,
  OFF_BETA_LORD,
} from '../fixtures/tiny';

const CORPS_A = 'corps.test-a' as CorpsId,
  CORPS_B = 'corps.test-b' as CorpsId;
function scopedState() {
  const state = buildTinyState();
  state.corps[CORPS_A] = {
    id: CORPS_A,
    clanId: CLAN_ALPHA,
    corpsLeaderId: OFF_ALPHA_BUSHO,
    directive: 'hold',
    targetNodeId: null,
    gold: 1000,
    createdDay: state.time.day,
  };
  state.corps[CORPS_B] = {
    id: CORPS_B,
    clanId: CLAN_BETA,
    corpsLeaderId: OFF_BETA_BUSHO,
    directive: 'hold',
    targetNodeId: null,
    gold: 1000,
    createdDay: state.time.day,
  };
  state.castles[CASTLE_A2]!.corpsId = CORPS_A;
  state.castles[CASTLE_A2]!.directControl = false;
  return state;
}
describe('M7 trusted authority boundaries', () => {
  it('ignores forged authority inside a player payload and the UI bridge rejects generic NPC commands', () => {
    const state = scopedState();
    const forged = {
      type: 'setConscriptPolicy',
      clanId: CLAN_ALPHA,
      castleId: CASTLE_A2,
      policy: 'high',
      authority: { kind: 'corps', clanId: CLAN_ALPHA, corpsId: CORPS_A },
    } as unknown as Command;
    expect(validateCommand(state, forged).ok).toBe(false);
    const npc: Command = {
      type: 'setConscriptPolicy',
      clanId: CLAN_BETA,
      castleId: CASTLE_B1,
      policy: 'high',
    };
    expect(validateCommand(state, npc).ok).toBe(true); // Generic core API compatibility, not UI permission.
    resetBridgeForTests();
    resetGameStoreForTests(state);
    expect(dispatchCommand(npc)).toEqual({ ok: false, reason: 'cmd.reject.notOwner' });
    // M8 rejects malformed player JSON at the bridge boundary, before core authority handling.
    expect(() => dispatchCommand(forged)).toThrowError(CoreError);
    expect(store.getState().session.pendingCommandCount).toBe(0);
    resetBridgeForTests();
    resetGameStoreForTests(null);
  });
  it('requires matching clan/corps membership and debits only the actual corps wallet', () => {
    const state = scopedState();
    state.clans[CLAN_ALPHA]!.gold = 0;
    const command: Command = {
      type: 'buildFacility',
      clanId: CLAN_ALPHA,
      castleId: CASTLE_A2,
      facilityTypeId: 'fac.ichi' as FacilityTypeId,
    };
    expect(
      validateCommand(state, command, { kind: 'corps', clanId: CLAN_ALPHA, corpsId: CORPS_B }).ok,
    ).toBe(false);
    expect(
      validateCommand(
        state,
        { ...command, clanId: CLAN_BETA },
        { kind: 'corps', clanId: CLAN_ALPHA, corpsId: CORPS_A },
      ).ok,
    ).toBe(false);
    expect(
      validateCommand(
        state,
        { ...command, castleId: CASTLE_A1 },
        { kind: 'corps', clanId: CLAN_ALPHA, corpsId: CORPS_A },
      ).ok,
    ).toBe(false);
    const authority = { kind: 'corps' as const, clanId: CLAN_ALPHA, corpsId: CORPS_A };
    expect(validateCommand(state, command, authority).ok).toBe(true);
    applyCommand(state, command, () => {}, authority);
    expect(state.corps[CORPS_A]!.gold).toBe(800);
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(0);
  });
  it('keeps corps resource transports inside its own controlled castles', () => {
    const state = scopedState();
    expect(
      validateCommand(
        state,
        {
          type: 'transport',
          clanId: CLAN_ALPHA,
          fromCastleId: CASTLE_A2,
          toCastleId: CASTLE_A1,
          soldiers: 0,
          gold: 0,
          food: 1,
        },
        { kind: 'corps', clanId: CLAN_ALPHA, corpsId: CORPS_A },
      ).ok,
    ).toBe(false);
  });
  it('NPC clan authority cannot command a corps siege or another corps army', () => {
    const state = scopedState();
    const march: Command = {
      type: 'march',
      clanId: CLAN_BETA,
      originCastleId: CASTLE_B1,
      leaderId: OFF_BETA_LORD,
      deputyIds: [],
      soldiers: 500,
      food: 600,
      targetNodeId: CASTLE_A2,
    };
    expect(validateCommand(state, march, { kind: 'clan', clanId: CLAN_BETA }).ok).toBe(true);
    applyCommand(state, march, () => {}, { kind: 'clan', clanId: CLAN_BETA });
    const army = Object.values(state.armies)[0]!;
    army.corpsId = CORPS_B;
    const siegeId = 'siege.test' as SiegeId;
    state.sieges[siegeId] = {
      id: siegeId,
      castleId: CASTLE_A2,
      attackerClanId: CLAN_BETA,
      attackerArmyIds: [army.id],
      mode: 'encircle',
      startDay: state.time.day,
      interrupted: false,
      betrayalUsed: false,
    };
    expect(
      validateExecutionAuthority(
        state,
        { type: 'setSiegeMode', clanId: CLAN_BETA, siegeId, mode: 'assault' },
        { kind: 'clan', clanId: CLAN_BETA },
      ).ok,
    ).toBe(false);
    expect(
      validateCommand(
        state,
        { type: 'setAutoReturn', clanId: CLAN_BETA, armyId: army.id, enabled: false },
        { kind: 'corps', clanId: CLAN_ALPHA, corpsId: CORPS_A },
      ).ok,
    ).toBe(false);
  });
});
