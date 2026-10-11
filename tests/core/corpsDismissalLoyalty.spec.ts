import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { applyCommands, CommandQueue } from '../../src/core/commands/queue';
import { validateCommand } from '../../src/core/commands/validate';
import type { Command } from '../../src/core/commands/types';
import type { GameState } from '../../src/core/state/gameState';
import { validateState } from '../../src/core/state/invariants';
import { advanceDay } from '../../src/core/systems';
import { dissolveCorps } from '../../src/core/systems/corps';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CLAN_ALPHA,
  OFF_ALPHA_LORD,
  OFF_ALPHA_TAISHO,
} from '../fixtures/tiny';

function queued(state: GameState, command: Command) {
  expect(validateCommand(state, command)).toEqual({ ok: true });
  const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  queue.enqueue(command, state.time.day);
  const rng = structuredClone(state.rng);
  const events: unknown[] = [];
  expect(applyCommands(state, queue.drain(), (event) => events.push(event))).toHaveLength(1);
  expect(events).toEqual([]);
  expect(state.rng).toEqual(rng);
  expect(validateState(state)).toEqual([]);
}

function prepared(ruler = false) {
  const state = buildTinyState();
  // Controlled eligible rank prerequisite; role assignment and income use the
  // production command/tick pipeline, with no fabricated Corps entity.
  state.officers[OFF_ALPHA_TAISHO]!.rank = 'karo';
  const leaderId = ruler ? OFF_ALPHA_LORD : OFF_ALPHA_TAISHO;
  queued(state, {
    type: 'createCorps',
    clanId: CLAN_ALPHA,
    corpsLeaderId: leaderId,
    castleIds: [CASTLE_A1, CASTLE_A2],
    directive: 'hold',
    targetNodeId: null,
  });
  for (let day = 0; day < 30; day++) {
    advanceDay(state, []);
    expect(validateState(state)).toEqual([]);
  }
  const corps = Object.values(state.corps)[0]!;
  expect(corps.gold).toBeGreaterThan(0);
  return { state, corps, leader: state.officers[leaderId]! };
}

function reclaim(castleId = CASTLE_A1): Command {
  return { type: 'assignCastleToCorps', clanId: CLAN_ALPHA, castleId, corpsId: null };
}

describe('explicit corps-role dismissal loyalty (06 §3.6.3)', () => {
  it('penalizes a nonruling leader once on queued dissolution while refunding the entire wallet', () => {
    const { state, corps, leader } = prepared();
    const loyalty = leader.loyalty;
    const wallet = corps.gold;
    const gold = state.clans[CLAN_ALPHA]!.gold;
    const command: Command = { type: 'dissolveCorps', clanId: CLAN_ALPHA, corpsId: corps.id };
    queued(state, command);
    expect(leader.loyalty).toBe(loyalty - BAL.loyaltyDismiss);
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(gold + wallet);
    expect(state.corps[corps.id]).toBeUndefined();
    const after = structuredClone(state);
    expect(validateCommand(state, command).ok).toBe(false);
    const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
    queue.enqueue(command, state.time.day);
    const events: { type: string }[] = [];
    expect(applyCommands(state, queue.drain(), (event) => events.push(event))).toEqual([]);
    expect(events.map((event) => event.type)).toEqual(['command.rejected']);
    expect(state.officers).toEqual(after.officers);
    expect(state.clans).toEqual(after.clans);
    expect(state.rng).toEqual(after.rng);
    expect(validateState(state)).toEqual([]);
  });

  it('does not dismiss on partial reclaim, but penalizes exactly once when the final role disappears', () => {
    const { state, corps, leader } = prepared();
    const loyalty = leader.loyalty;
    const gold = state.clans[CLAN_ALPHA]!.gold;
    const wallet = corps.gold;
    queued(state, reclaim());
    expect(leader.loyalty).toBe(loyalty);
    expect(state.corps[corps.id]).toBe(corps);
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(gold + wallet);
    queued(state, reclaim(CASTLE_A2));
    expect(leader.loyalty).toBe(loyalty - BAL.loyaltyDismiss);
    expect(state.corps[corps.id]).toBeUndefined();
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(gold + wallet);
  });

  it.each(['dissolve', 'reclaim'] as const)(
    'clamps low loyalty on explicit %s without affecting ruling loyalty',
    (mode) => {
      const { state, corps, leader } = prepared();
      leader.loyalty = BAL.loyaltyDismiss - 1;
      expect(validateState(state)).toEqual([]);
      if (mode === 'reclaim') {
        queued(state, reclaim());
        queued(state, reclaim(CASTLE_A2));
      } else queued(state, { type: 'dissolveCorps', clanId: CLAN_ALPHA, corpsId: corps.id });
      expect(leader.loyalty).toBe(0);
      expect(state.officers[OFF_ALPHA_LORD]!.loyalty).toBe(100);

      const ruled = prepared(true);
      if (mode === 'reclaim') {
        queued(ruled.state, reclaim());
        queued(ruled.state, reclaim(CASTLE_A2));
      } else
        queued(ruled.state, { type: 'dissolveCorps', clanId: CLAN_ALPHA, corpsId: ruled.corps.id });
      // Higher-priority 02 INV-08 and 06 §3.4.3 override the ordinary dismissal hit.
      expect(ruled.leader.loyalty).toBe(100);
      expect(validateState(ruled.state)).toEqual([]);
    },
  );

  it('leaves involuntary system-helper dissolution loyalty unchanged', () => {
    const { state, corps, leader } = prepared();
    const before = structuredClone(state.officers);
    const rng = structuredClone(state.rng);
    dissolveCorps(state, corps.id);
    expect(state.officers).toEqual(before);
    expect(leader.loyalty).toBe(before[leader.id]!.loyalty);
    expect(state.rng).toEqual(rng);
    expect(validateState(state)).toEqual([]);
  });

  it('applies pending saved final reclaim identically at the ordinary daily boundary', () => {
    const { state, leader } = prepared();
    queued(state, reclaim());
    const command = reclaim(CASTLE_A2);
    const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
    queue.enqueue(command, state.time.day);
    const before = structuredClone(state);
    const decoded = decodeSave(encodeSave(state, 42, queue.snapshotPlayerCommands()));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.code);
    expect(state).toEqual(before);
    const restored = decoded.saveFile.state;
    const replay = new CommandQueue(restored.meta.lastAppliedCmdSeq + 1);
    for (const pending of decoded.saveFile.pendingCommands)
      replay.enqueue(pending, restored.time.day);
    const loyalty = leader.loyalty;
    const result = advanceDay(state, queue.drain());
    const continued = advanceDay(restored, replay.drain());
    expect(result.events.filter((event) => event.type === 'command.rejected')).toEqual([]);
    expect(leader.loyalty).toBe(loyalty - BAL.loyaltyDismiss);
    expect(result.events).toEqual(continued.events);
    expect(result.appliedCommands).toEqual(continued.appliedCommands);
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
