import { describe, expect, it } from 'vitest';
import { applyCommands, CommandQueue } from '../../src/core/commands/queue';
import { validateCommand } from '../../src/core/commands/validate';
import type { Command } from '../../src/core/commands/types';
import type { ExecutionAuthority } from '../../src/core/commands/authority';
import type { GameState } from '../../src/core/state/gameState';
import { validateState } from '../../src/core/state/invariants';
import { advanceDay } from '../../src/core/systems';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CLAN_ALPHA,
  DIST_A1X,
  DIST_A2X,
  OFF_ALPHA_BUSHO,
  OFF_ALPHA_LORD,
  OFF_ALPHA_TAISHO,
} from '../fixtures/tiny';

function queued(state: GameState, command: Command, authority?: ExecutionAuthority) {
  expect(validateCommand(state, command, authority)).toEqual({ ok: true });
  const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  queue.enqueue(command, state.time.day, authority);
  const rng = structuredClone(state.rng);
  const events: { type: string }[] = [];
  expect(applyCommands(state, queue.drain(), (event) => events.push(event))).toHaveLength(1);
  expect(events.filter((event) => event.type === 'command.rejected')).toEqual([]);
  expect(state.rng).toEqual(rng);
  expect(validateState(state)).toEqual([]);
}

function prepared() {
  const state = buildTinyState();
  queued(state, {
    type: 'createCorps',
    clanId: CLAN_ALPHA,
    corpsLeaderId: OFF_ALPHA_LORD,
    castleIds: [CASTLE_A1, CASTLE_A2],
    directive: 'hold',
    targetNodeId: null,
  });
  // Earn the wallet through an actual month-start income settlement, not a
  // fabricated treasury/refund. The player corps remains on its hold policy.
  for (let day = 0; day < 30; day++) {
    advanceDay(state, []);
    expect(validateState(state)).toEqual([]);
  }
  const corps = Object.values(state.corps)[0]!;
  expect(corps.gold).toBeGreaterThan(0);
  expect(state.time.dayOfMonth).toBe(1);
  return { state, corps };
}

function reclaim(castleId = CASTLE_A1): Command {
  return { type: 'assignCastleToCorps', clanId: CLAN_ALPHA, castleId, corpsId: null };
}

describe('explicit corps castle reclaim treasury settlement (07 §3.12)', () => {
  it('refunds the first of two castles immediately, rejects duplicates, and never refunds twice', () => {
    const { state, corps } = prepared();
    const wallet = corps.gold;
    const gold = state.clans[CLAN_ALPHA]!.gold;
    queued(state, reclaim());
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(gold + wallet);
    expect(corps.gold).toBe(0);
    expect(state.corps[corps.id]).toBe(corps);
    expect(state.castles[CASTLE_A1]).toMatchObject({ corpsId: null, directControl: true });
    expect(state.castles[CASTLE_A2]).toMatchObject({ corpsId: corps.id, directControl: false });

    const beforeDuplicate = structuredClone(state);
    expect(validateCommand(state, reclaim()).ok).toBe(false);
    const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
    queue.enqueue(reclaim(), state.time.day);
    const events: { type: string }[] = [];
    expect(applyCommands(state, queue.drain(), (event) => events.push(event))).toEqual([]);
    expect(events.map((event) => event.type)).toEqual(['command.rejected']);
    expect(state.clans).toEqual(beforeDuplicate.clans);
    expect(state.corps).toEqual(beforeDuplicate.corps);
    expect(state.rng).toEqual(beforeDuplicate.rng);
    queued(state, { type: 'dissolveCorps', clanId: CLAN_ALPHA, corpsId: corps.id });
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(gold + wallet);
    expect(state.corps[corps.id]).toBeUndefined();
  });

  it('refunds subsequently earned income on the final reclaim without duplicating the first wallet', () => {
    const { state, corps } = prepared();
    queued(state, reclaim());
    expect(corps.gold).toBe(0);
    for (let day = 0; day < 30; day++) {
      advanceDay(state, []);
      expect(validateState(state)).toEqual([]);
    }
    const laterIncome = corps.gold;
    expect(laterIncome).toBeGreaterThan(0);
    const gold = state.clans[CLAN_ALPHA]!.gold;
    queued(state, reclaim(CASTLE_A2));
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(gold + laterIncome);
    expect(state.corps[corps.id]).toBeUndefined();
  });

  it('preserves only departing-castle army snapshots while settling the entire wallet', () => {
    const { state, corps } = prepared();
    const authority: ExecutionAuthority = { kind: 'corps', clanId: CLAN_ALPHA, corpsId: corps.id };
    for (const [originCastleId, leaderId, targetNodeId] of [
      [CASTLE_A1, OFF_ALPHA_BUSHO, DIST_A1X],
      [CASTLE_A2, OFF_ALPHA_TAISHO, DIST_A2X],
    ] as const) {
      queued(
        state,
        {
          type: 'march',
          clanId: CLAN_ALPHA,
          originCastleId,
          leaderId,
          deputyIds: [],
          soldiers: 100,
          food: 100,
          targetNodeId,
        },
        authority,
      );
    }
    expect(Object.values(state.armies)).toHaveLength(2);
    const armiesBefore = structuredClone(state.armies);
    const gold = state.clans[CLAN_ALPHA]!.gold;
    const wallet = corps.gold;
    queued(state, reclaim());
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(gold + wallet);
    for (const army of Object.values(state.armies)) {
      expect(army).toEqual({
        ...armiesBefore[army.id],
        corpsId: army.originCastleId === CASTLE_A1 ? null : corps.id,
      });
    }
  });

  it('settles before month-opening income and continues an actual saved pending queue identically', () => {
    const { state, corps } = prepared();
    for (let day = 0; day < 29; day++) advanceDay(state, []);
    expect(state.time.dayOfMonth).toBe(30);
    expect(validateState(state)).toEqual([]);
    const command = reclaim();
    const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
    queue.enqueue(command, state.time.day);
    const beforeSave = structuredClone(state);
    const decoded = decodeSave(encodeSave(state, 42, queue.snapshotPlayerCommands()));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.code);
    expect(state).toEqual(beforeSave);
    const restored = decoded.saveFile.state;
    const restoredQueue = new CommandQueue(restored.meta.lastAppliedCmdSeq + 1);
    for (const pending of decoded.saveFile.pendingCommands)
      restoredQueue.enqueue(pending, restored.time.day);
    const gold = state.clans[CLAN_ALPHA]!.gold;
    const wallet = corps.gold;
    const result = advanceDay(state, queue.drain());
    const replayResult = advanceDay(restored, restoredQueue.drain());
    expect(result.events.filter((event) => event.type === 'command.rejected')).toEqual([]);
    const settlement = result.monthOpeningSettlement!.clans.find(
      (row) => row.clanId === CLAN_ALPHA,
    )!;
    expect(settlement.goldBefore).toBe(gold + wallet);
    expect(corps.gold).toBe(settlement.retainedCorpsGold);
    expect(corps.gold).toBeGreaterThan(0);
    expect(result.events).toEqual(replayResult.events);
    expect(result.appliedCommands).toEqual(replayResult.appliedCommands);
    expect(result.monthOpeningSettlement).toEqual(replayResult.monthOpeningSettlement);
    const persistent = structuredClone(state);
    persistent.ai.intentLog = [];
    const restoredPersistent = structuredClone(restored);
    restoredPersistent.ai.intentLog = [];
    expect(restoredPersistent).toEqual(persistent);
    expect(restored.rng).toEqual(state.rng);
    expect(validateState(state)).toEqual([]);
    expect(validateState(restored)).toEqual([]);
  });
});
