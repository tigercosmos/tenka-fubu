import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { CommandQueue } from '../../src/core/commands/queue';
import { validateCommand } from '../../src/core/commands/validate';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import type { ClanId } from '../../src/core/state/ids';
import { validateState } from '../../src/core/state/invariants';
import { advanceDay } from '../../src/core/systems';
import {
  adjustSentiment,
  adjustTrust,
  getDiplomacyRow,
} from '../../src/core/systems/diplomacyCommon';
import { dominionClanIds } from '../../src/core/systems/victory';
import {
  buildTinyState,
  CASTLE_A2,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_TAISHO,
} from '../fixtures/tiny';

function fixture(gap: number = BAL.vassalPrestigeGap, thirdPlayer = false) {
  const state = buildTinyState();
  state.clans[CLAN_ALPHA]!.prestige = gap;
  state.clans[CLAN_BETA]!.prestige = 0;
  for (const district of Object.values(state.districts))
    if (district.ownerClanId === CLAN_BETA) district.kokudaka = 1;
  state.castles['castle.b1' as keyof typeof state.castles]!.soldiers = 0;
  adjustSentiment(state, CLAN_ALPHA, CLAN_BETA, 100);
  adjustSentiment(state, CLAN_BETA, CLAN_ALPHA, 100);
  if (thirdPlayer) {
    const gamma = 'clan.victory-control' as ClanId;
    state.clans[gamma] = {
      ...structuredClone(state.clans[CLAN_ALPHA]!),
      id: gamma,
      name: '丙家',
      leaderId: OFF_ALPHA_TAISHO,
      homeCastleId: CASTLE_A2,
    };
    state.officers[OFF_ALPHA_TAISHO]!.clanId = gamma;
    state.officers[OFF_ALPHA_TAISHO]!.loyalty = 100;
    state.castles[CASTLE_A2]!.ownerClanId = gamma;
    state.castles[CASTLE_A2]!.tier = 'main';
    for (const district of Object.values(state.districts))
      if (district.castleId === CASTLE_A2) district.ownerClanId = gamma;
    state.policies[gamma] = structuredClone(state.policies[CLAN_ALPHA]!);
    state.meta.playerClanId = gamma;
  }
  expect(state.meta.territoryChangedToday).toBe(false);
  expect(validateState(state)).toEqual([]);
  return state;
}

function demand(state: ReturnType<typeof fixture>) {
  const command = {
    type: 'proposePact' as const,
    clanId: CLAN_ALPHA,
    targetClanId: CLAN_BETA,
    kind: 'demandVassal' as const,
    reinforceAgainstClanId: null,
  };
  const authority =
    state.meta.playerClanId === CLAN_ALPHA
      ? { kind: 'player' as const }
      : { kind: 'clan' as const, clanId: CLAN_ALPHA };
  expect(validateCommand(state, command, authority)).toEqual({ ok: true });
  const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  queue.enqueue(command, state.time.day, authority);
  const rng = structuredClone(state.rng);
  const result = advanceDay(state, queue.drain());
  expect(result.appliedCommands).toHaveLength(1);
  expect(result.events.some((event) => event.type === 'command.rejected')).toBe(false);
  expect(state.rng).toEqual(rng);
  expect(validateState(state)).toEqual([]);
  return result;
}

describe('vassal agreement invalidates the player dominion victory check', () => {
  it('a legal final vassal agreement wins on its normal settlement day, including native continuation', () => {
    const state = fixture();
    const decoded = decodeSave(encodeSave(state, 0));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.code);
    const result = demand(state);
    expect(demand(decoded.saveFile.state).events).toEqual(result.events);
    expect(result.events.some((event) => event.type === 'pact.signed')).toBe(true);
    const dominion = dominionClanIds(state, CLAN_ALPHA);
    expect(Object.values(state.castles).every((castle) => dominion.has(castle.ownerClanId))).toBe(
      true,
    );
    expect(state.meta.gameOver).toEqual({ kind: 'victory', endingId: 'unification' });
    expect(result.events.filter((event) => event.type === 'game.victory')).toMatchObject([
      { condition: 'unification', clanId: CLAN_ALPHA },
    ]);
    expect(decoded.saveFile.state.meta.gameOver).toEqual(state.meta.gameOver);
    const persistent = (game: typeof state) => {
      const copy = structuredClone(game);
      copy.ai.intentLog = [];
      return copy;
    };
    expect(persistent(decoded.saveFile.state)).toEqual(persistent(state));
  });

  it('a refused agreement makes no dominion change and grants no ending', () => {
    const state = fixture(BAL.vassalPrestigeGap - 1);
    demand(state);
    expect(getDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA).pacts).toEqual([]);
    expect(state.meta.gameOver).toBeNull();
  });

  it('an accepted nonplayer agreement does not win for the independent player', () => {
    const state = fixture(BAL.vassalPrestigeGap, true);
    const result = demand(state);
    expect(result.events.some((event) => event.type === 'pact.signed')).toBe(true);
    expect(dominionClanIds(state, state.meta.playerClanId)).toEqual(
      new Set([state.meta.playerClanId]),
    );
    expect(state.meta.gameOver).toBeNull();
  });

  it('ordinary alliance signing does not count allied castles as player dominion', () => {
    const state = fixture();
    adjustTrust(state, CLAN_ALPHA, CLAN_BETA, BAL.trustCostAlliance);
    const command = {
      type: 'proposePact' as const,
      clanId: CLAN_ALPHA,
      targetClanId: CLAN_BETA,
      kind: 'proposeAlliance' as const,
      reinforceAgainstClanId: null,
    };
    expect(validateCommand(state, command)).toEqual({ ok: true });
    const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
    queue.enqueue(command, state.time.day);
    expect(
      advanceDay(state, queue.drain()).events.some((event) => event.type === 'pact.signed'),
    ).toBe(true);
    expect(state.meta.gameOver).toBeNull();
    expect(validateState(state)).toEqual([]);
  });

  it('the player offering submission does not expand its own dominion', () => {
    const state = fixture();
    state.clans[CLAN_ALPHA]!.prestige = 0;
    state.clans[CLAN_BETA]!.prestige = BAL.vassalPrestigeGap;
    state.castles['castle.b1' as keyof typeof state.castles]!.soldiers = 1000;
    for (const district of Object.values(state.districts))
      district.kokudaka = district.ownerClanId === CLAN_ALPHA ? 1 : 10000;
    for (const castle of Object.values(state.castles))
      if (castle.ownerClanId === CLAN_ALPHA) castle.soldiers = 0;
    expect(validateState(state)).toEqual([]);
    const command = {
      type: 'proposePact' as const,
      clanId: CLAN_ALPHA,
      targetClanId: CLAN_BETA,
      kind: 'offerVassal' as const,
      reinforceAgainstClanId: null,
    };
    expect(validateCommand(state, command)).toEqual({ ok: true });
    const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
    queue.enqueue(command, state.time.day);
    expect(
      advanceDay(state, queue.drain()).events.some((event) => event.type === 'pact.signed'),
    ).toBe(true);
    expect(getDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA).pacts[0]!.vassalClanId).toBe(CLAN_ALPHA);
    expect(dominionClanIds(state, CLAN_ALPHA)).toEqual(new Set([CLAN_ALPHA]));
    expect(state.meta.gameOver).toBeNull();
    expect(validateState(state)).toEqual([]);
  });
});
