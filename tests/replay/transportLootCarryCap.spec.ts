import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { CommandQueue } from '../../src/core/commands/queue';
import { validateCommand } from '../../src/core/commands/validate';
import {
  CommandLogRecorder,
  replayCommandLog,
  type CommandLogFile,
} from '../../src/core/replay/commandLog';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { canonicalStringify, stateHash } from '../../src/core/state/serialize';
import { validateState } from '../../src/core/state/invariants';
import type { GameEvent } from '../../src/core/state/events';
import { advanceDay } from '../../src/core/systems';
import { armyPhysicalLeg } from '../../src/core/systems/armyReroute';
import { buildMiniState, CASTLE_B2, CLAN_BETA } from '../fixtures/mini';

const source = JSON.parse(
  readFileSync(new URL('./cases/m6-transport-loot-carry-cap.tfulog.json', import.meta.url), 'utf8'),
) as CommandLogFile;

/** Unchanged mini, native AI orders and two explicit legal clan-authorized orders; no injected prerequisites. */
function journey(log = source, native = false) {
  let state = buildMiniState({ seed: log.seed });
  let queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  const recorder = new CommandLogRecorder();
  const events: GameEvent[][] = [];
  let lootBoundary = false;
  function restore() {
    const before = structuredClone(state);
    const pending = queue.snapshotPlayerCommands();
    const decoded = decodeSave(encodeSave(state, 0, pending));
    expect(state).toEqual(before);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.code);
    expect(decoded.saveFile.pendingCommands).toEqual(pending);
    expect(decoded.saveFile.state.ai.pendingOrders).toEqual(state.ai.pendingOrders);
    state = decoded.saveFile.state;
    queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
    for (const command of decoded.saveFile.pendingCommands) queue.enqueue(command, state.time.day);
  }
  expect(validateState(state)).toEqual([]);
  for (let tick = 1; tick <= log.finalDay; tick++) {
    // Ongoing siege before the explicit clan-authorized recall enters the external queue.
    if (native && tick === 65) {
      expect(state.time.day).toBe(154);
      expect(queue.snapshotPlayerCommands()).toEqual([]);
      restore();
    }
    for (const entry of log.entries.filter((entry) => entry.day === tick)) {
      expect(validateCommand(state, entry.command, entry.authority)).toEqual({ ok: true });
      if (entry.authority) {
        const index = state.ai.pendingOrders.findIndex(
          (order) =>
            canonicalStringify(order.command) === canonicalStringify(entry.command) &&
            canonicalStringify(order.authority) === canonicalStringify(entry.authority),
        );
        // Match core replay's consumption of actual pending AI commands. The day55 march
        // and day65 recall are explicit validated clan-authorized commands, not generated AI.
        if (index >= 0) state.ai.pendingOrders.splice(index, 1);
      }
      queue.enqueue(structuredClone(entry.command), state.time.day, entry.authority);
    }
    if (native && tick === 56) {
      expect(queue.snapshotPlayerCommands()).toEqual([
        log.entries.find((entry) => entry.command.type === 'transport')!.command,
      ]);
      restore();
    }
    const army = Object.values(state.armies).find((item) => item.clanId === CLAN_BETA);
    const goldBefore = state.clans[CLAN_BETA]!.gold;
    if (
      state.time.day === 154 &&
      log.entries.find((entry) => entry.command.type === 'transport')!.day === 56
    ) {
      expect(army).toMatchObject({
        posNodeId: CASTLE_B2,
        soldiers: 237,
        food: 306,
        status: 'sieging',
      });
      expect(armyPhysicalLeg(army!)).toBeNull();
      expect(army!.food).toBeGreaterThan(
        army!.soldiers * BAL.fieldFoodPerSoldierDaily * BAL.defaultCarryDays,
      );
      expect(
        Math.floor(army!.soldiers * BAL.fieldFoodPerSoldierDaily * BAL.maxCarryDays),
      ).toBeGreaterThanOrEqual(army!.food + 100);
      lootBoundary = true;
    }
    const envelopes = queue.drain();
    const result = advanceDay(state, envelopes);
    expect(result.appliedCommands).toEqual(envelopes);
    expect(result.events.filter((event) => event.type === 'command.rejected')).toEqual([]);
    expect(validateState(state)).toEqual([]);
    recorder.recordTick(result.appliedCommands);
    events.push(result.events);
    if (lootBoundary && state.time.day === 155) {
      expect(result.events.filter((event) => event.type === 'transport.looted')).toMatchObject([
        { nodeId: CASTLE_B2, byClanId: CLAN_BETA, food: 100, gold: 20 },
      ]);
      expect(army!.food).toBe(401); // Real 306 + cargo100 - normal daily consumption5.
      expect(Number.isInteger(army!.food)).toBe(true);
      expect(state.clans[CLAN_BETA]!.gold).toBe(goldBefore + 20);
      expect(Object.values(state.transports)).toEqual([]);
    }
  }
  return { state, log: recorder.export(state), events, lootBoundary };
}

describe('permanent earned-conquest maximum carry-room loot replay', () => {
  it('records twice from unchanged mini and actually receives food above default provisioning', () => {
    const first = journey();
    expect(journey()).toEqual(first);
    expect(first.lootBoundary).toBe(true);
    expect(first.log).toEqual(source);
    expect(first.log.truncated).toBe(false);
    expect(replayCommandLog(source, (log) => buildMiniState({ seed: log.seed }))).toMatchObject({
      match: true,
      balanceMismatch: false,
      actualHash: source.finalHash,
    });
  });
  it('restores real pending player cargo and ongoing siege with persistent AI orders through the loot day', () => {
    const original = journey();
    const restored = journey(source, true);
    const persistent = (state: typeof original.state) => {
      const copy = structuredClone(state);
      copy.ai.intentLog = [];
      return copy;
    };
    expect(persistent(restored.state)).toEqual(persistent(original.state));
    expect(restored.events).toEqual(original.events);
    expect(restored.state.rng).toEqual(original.state.rng);
    expect(stateHash(restored.state)).toBe(source.finalHash);
  });
  it('validates later cargo commands and detects a different actual no-loot delivery trajectory', () => {
    const tampered = structuredClone(source);
    tampered.entries.find((entry) => entry.command.type === 'transport')!.day += 1;
    const actual = journey(tampered);
    expect(actual.events.flat().filter((event) => event.type === 'transport.looted')).toEqual([]);
    expect(actual.events.flat()).toContainEqual(
      expect.objectContaining({ type: 'transport.arrived', day: 156 }),
    );
    expect(replayCommandLog(tampered, (log) => buildMiniState({ seed: log.seed }))).toMatchObject({
      match: false,
      balanceMismatch: false,
      actualHash: stateHash(actual.state),
    });
    expect(source.entries.find((entry) => entry.command.type === 'transport')!.day).toBe(56);
  });
});
