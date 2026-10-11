import { describe, expect, it } from 'vitest';
import {
  buildTinyState,
  CLAN_ALPHA,
  CLAN_BETA,
  CASTLE_A2,
  CASTLE_B1,
  OFF_ALPHA_TAISHO,
  OFF_BETA_TAISHO,
} from '../fixtures/tiny';
import { applyMarch } from '../../src/core/commands/march';
import { applyCreateCorps } from '../../src/core/commands/corpsCommands';
import { validateCommand } from '../../src/core/commands/validate';
import { applyCommand } from '../../src/core/commands/apply';
import { validateStartKassen } from '../../src/core/systems/battle';
import { startFieldCombat } from '../../src/core/systems/fieldCombat';
import { runReactiveAi } from '../../src/core/systems/ai/reactive';
import type { GameEvent } from '../../src/core/state/events';
import type { Command } from '../../src/core/commands/types';
import type { ExecutionAuthority } from '../../src/core/commands/authority';

function prepare(allAi = false, asCorps = false) {
  const state = buildTinyState();
  state.ai.allAi = allAi;
  if (asCorps) {
    const leader = state.officers[state.clans[CLAN_BETA]!.leaderId]!;
    leader.rank = 'karo';
    state.castles[CASTLE_B1]!.directControl = true;
    applyCreateCorps(
      state,
      {
        type: 'createCorps',
        clanId: CLAN_BETA,
        corpsLeaderId: leader.id,
        castleIds: [CASTLE_B1],
        directive: 'hold',
        targetNodeId: null,
      },
      () => {},
    );
  }
  for (const [clanId, originCastleId, leaderId, soldiers] of [
    [CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, 1000],
    [CLAN_BETA, CASTLE_B1, OFF_BETA_TAISHO, 4000],
  ] as const) {
    state.castles[originCastleId]!.soldiers = soldiers + 500;
    applyMarch(
      state,
      {
        type: 'march',
        clanId,
        originCastleId,
        leaderId,
        deputyIds: [],
        soldiers,
        food: 1000,
        targetNodeId: CASTLE_A2,
      },
      () => {},
    );
    const army = Object.values(state.armies).find((a) => a.clanId === clanId)!;
    army.posNodeId = CASTLE_A2;
    army.path = [CASTLE_A2];
    army.pathCursor = 0;
    army.edgeProgressDays = 0;
    army.edgeCostDays = 0;
    army.status = 'holding';
  }
  const armies = Object.values(state.armies);
  startFieldCombat(
    state,
    CASTLE_A2,
    [armies.find((a) => a.clanId === CLAN_ALPHA)!.id],
    [armies.find((a) => a.clanId === CLAN_BETA)!.id],
  );
  return { state, combat: Object.values(state.fieldCombats)[0]! };
}

describe('trusted AI strategic kassen', () => {
  it('allows a corps authority only when its actual army participates', () => {
    const { state, combat } = prepare(false, true);
    const corps = Object.values(state.corps)[0]!;
    const command = { type: 'startKassen' as const, clanId: CLAN_BETA, fieldCombatId: combat.id };
    expect(
      validateCommand(state, command, { kind: 'corps', clanId: CLAN_BETA, corpsId: corps.id }),
    ).toEqual({ ok: true });
    for (const army of Object.values(state.armies)) army.corpsId = null;
    expect(
      validateCommand(state, command, { kind: 'corps', clanId: CLAN_BETA, corpsId: corps.id }).ok,
    ).toBe(false);
  });
  it('keeps default player authorization unchanged while allowing matching trusted clans', () => {
    const { state, combat } = prepare();
    const command = { type: 'startKassen' as const, clanId: CLAN_BETA, fieldCombatId: combat.id };
    expect(validateStartKassen(state, command).ok).toBe(false);
    expect(validateCommand(state, command).ok).toBe(false);
    expect(validateCommand(state, command, { kind: 'clan', clanId: CLAN_ALPHA }).ok).toBe(false);
    expect(validateCommand(state, command, { kind: 'clan', clanId: CLAN_BETA })).toEqual({
      ok: true,
    });
  });
  it('queues a legal NPC decision above65% and creates a normal battle against the player', () => {
    const { state, combat } = prepare();
    const orders: Array<{ command: Command; authority: ExecutionAuthority }> = [];
    runReactiveAi(
      state,
      [
        {
          type: 'battle.kassenAvailable',
          day: state.time.day,
          clanIds: [CLAN_ALPHA, CLAN_BETA],
          battleId: combat.id,
        },
      ],
      {
        enqueue: (command, authority) => {
          const result = validateCommand(state, command, authority);
          if (result.ok) orders.push({ command, authority });
          return result;
        },
        record: () => {},
      },
    );
    expect(orders).toHaveLength(1);
    expect(orders[0]!.command).toMatchObject({ type: 'startKassen', clanId: CLAN_BETA });
    applyCommand(state, orders[0]!.command, () => {}, orders[0]!.authority);
    expect(Object.values(state.battles)).toHaveLength(1);
    expect(Object.values(state.battles)[0]).toMatchObject({
      attackerClanId: CLAN_BETA,
      defenderClanId: CLAN_ALPHA,
    });
    expect(combat.interrupted).toBe(true);
  });
  it('keeps all-AI encounters in field resolution without tactical state, pause events or RNG consumption', () => {
    const { state, combat } = prepare(true);
    const rng = structuredClone(state.rng),
      events: GameEvent[] = [];
    const command = { type: 'startKassen' as const, clanId: CLAN_BETA, fieldCombatId: combat.id };
    const authority = { kind: 'clan' as const, clanId: CLAN_BETA };
    expect(validateCommand(state, command, authority).ok).toBe(true);
    applyCommand(state, command, (event) => events.push(event), authority);
    expect(combat.kassenUsed).toBe(true);
    expect(combat.interrupted).toBe(false);
    expect(Object.values(state.battles)).toHaveLength(0);
    expect(Object.values(state.armies).every((a) => a.battleId === null)).toBe(true);
    expect(events).toEqual([]);
    expect(state.rng).toEqual(rng);
  });
});
