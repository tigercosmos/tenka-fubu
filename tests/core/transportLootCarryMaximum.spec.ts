import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { armyDailyFoodUse } from '../../src/core/armyFood';
import { CommandQueue } from '../../src/core/commands/queue';
import { validateCommand } from '../../src/core/commands/validate';
import type { CommandLogFile } from '../../src/core/replay/commandLog';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { canonicalStringify } from '../../src/core/state/serialize';
import { validateState } from '../../src/core/state/invariants';
import type { GameEvent } from '../../src/core/state/events';
import { advanceDay } from '../../src/core/systems';
import { armyPhysicalLeg } from '../../src/core/systems/armyReroute';
import { buildMiniState, CASTLE_B2, CLAN_BETA } from '../fixtures/mini';

const source = JSON.parse(
  readFileSync(
    new URL('../replay/cases/m6-transport-physical-occupancy.tfulog.json', import.meta.url),
    'utf8',
  ),
) as CommandLogFile;

function journey(food: number, native = false) {
  const log = structuredClone(source);
  const transport = log.entries.find((e) => e.command.type === 'transport')!;
  transport.day -= 1;
  if (transport.command.type !== 'transport') throw new Error('Missing actual cargo');
  transport.command.food = food;
  let state = buildMiniState({ seed: log.seed });
  let queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  const events: GameEvent[][] = [];
  let accounting:
    { before: number; cap: number; gained: number; consumed: number; after: number } | undefined;
  for (let tick = 1; tick <= log.finalDay; tick++) {
    // Checkpoint BEFORE enqueueing the trusted Beta recall; no enemy command becomes a player save entry.
    if (native && tick === 65) {
      const decoded = decodeSave(encodeSave(state, 0, queue.snapshotPlayerCommands()));
      expect(decoded.ok).toBe(true);
      if (!decoded.ok) throw new Error(decoded.code);
      expect(decoded.saveFile.pendingCommands).toEqual([]);
      state = decoded.saveFile.state;
      queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
    }
    for (const entry of log.entries.filter((e) => e.day === tick)) {
      expect(validateCommand(state, entry.command, entry.authority)).toEqual({ ok: true });
      if (entry.authority) {
        const index = state.ai.pendingOrders.findIndex(
          (order) =>
            canonicalStringify(order.command) === canonicalStringify(entry.command) &&
            canonicalStringify(order.authority) === canonicalStringify(entry.authority),
        );
        if (index >= 0) state.ai.pendingOrders.splice(index, 1);
      }
      queue.enqueue(structuredClone(entry.command), state.time.day, entry.authority);
    }
    const army =
      state.time.day === 154
        ? Object.values(state.armies).find((a) => a.clanId === CLAN_BETA)!
        : undefined;
    const before = army?.food;
    const soldiers = army?.soldiers;
    const id = army?.id;
    if (army) {
      expect(army.posNodeId).toBe(CASTLE_B2);
      expect(armyPhysicalLeg(army)).toBeNull();
      expect(army.soldiers).toBe(237);
      expect(army.food).toBe(306);
      expect(state.officers[army.leaderId]!.traits).toEqual([]);
    }
    const envelopes = queue.drain();
    const result = advanceDay(state, envelopes);
    expect(result.appliedCommands).toEqual(envelopes);
    expect(result.events.filter((e) => e.type === 'command.rejected')).toEqual([]);
    expect(state.ai.intentLog.filter((e) => e.kind === 'error.invalidCommand')).toEqual([]);
    expect(validateState(state)).toEqual([]);
    events.push(result.events);
    if (id !== undefined && before !== undefined && soldiers !== undefined) {
      const afterArmy = state.armies[id]!;
      const cap = soldiers * BAL.fieldFoodPerSoldierDaily * BAL.maxCarryDays;
      const gained = Math.min(food, Math.floor(Math.max(0, cap - before)));
      const consumed = Math.ceil(soldiers * BAL.fieldFoodPerSoldierDaily);
      expect(armyDailyFoodUse(state, afterArmy)).toBe(consumed);
      expect(afterArmy.soldiers).toBe(soldiers);
      expect(afterArmy.food).toBe(before + gained - consumed);
      expect(result.events).toContainEqual(
        expect.objectContaining({
          type: 'transport.looted',
          day: 155,
          food,
          gold: 20,
          nodeId: CASTLE_B2,
        }),
      );
      expect(state.transports).toEqual({});
      accounting = { before, cap, gained, consumed, after: afterArmy.food };
    }
  }
  return { state, events, accounting };
}

describe('actual transport interception uses maximum carry allowance, not default refill target', () => {
  it('receives all 100 food above the default 60-day target in an unchanged-mini earned campaign', () => {
    expect(journey(100).accounting).toMatchObject({
      before: 306,
      gained: 100,
      consumed: 5,
      after: 401,
    });
  });

  it('floors integer free capacity at the maximum and scatters excess cargo', () => {
    expect(journey(1000).accounting).toMatchObject({
      before: 306,
      gained: 547,
      consumed: 5,
      after: 848,
    });
  });

  it('restores the actual pre-loot army/cargo and preserves persistent state, events and RNG', () => {
    const original = journey(100);
    const restored = journey(100, true);
    const persistent = (state: typeof original.state) => {
      const copy = structuredClone(state);
      copy.ai.intentLog = [];
      return copy;
    };
    expect(persistent(restored.state)).toEqual(persistent(original.state));
    expect(restored.events).toEqual(original.events);
    expect(restored.state.rng).toEqual(original.state.rng);
    expect(restored.accounting).toEqual(original.accounting);
  });
});
