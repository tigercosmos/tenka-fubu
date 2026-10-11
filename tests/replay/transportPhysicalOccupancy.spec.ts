import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
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
import { buildMiniState, CASTLE_B2, CLAN_ALPHA, CLAN_BETA } from '../fixtures/mini';

const source = JSON.parse(
  readFileSync(
    new URL('./cases/m6-transport-physical-occupancy.tfulog.json', import.meta.url),
    'utf8',
  ),
) as CommandLogFile;

/** Unmodified mini, including normally generated Beta orders recorded with clan authority. */
function journey(log = source, native = false) {
  let state = buildMiniState({ seed: log.seed });
  let queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  const recorder = new CommandLogRecorder();
  const events: GameEvent[][] = [];
  let boundary: { armyProgress: number; cargoProgress: number; cargoCost: number } | undefined;
  expect(validateState(state)).toEqual([]);
  for (let tick = 1; tick <= log.finalDay; tick++) {
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
    // Real pending player cargo, then the ongoing physical departure just before arrival.
    if (native && [57, 66].includes(tick)) {
      const before = structuredClone(state);
      const pending = queue.snapshotPlayerCommands();
      const decoded = decodeSave(encodeSave(state, 0, pending));
      expect(state).toEqual(before);
      expect(decoded.ok).toBe(true);
      if (!decoded.ok) throw new Error(decoded.code);
      expect(decoded.saveFile.pendingCommands).toEqual(pending);
      expect(pending).toEqual(
        tick === 57 ? [log.entries.find((e) => e.command.type === 'transport')!.command] : [],
      );
      state = decoded.saveFile.state;
      queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
      for (const command of decoded.saveFile.pendingCommands)
        queue.enqueue(command, state.time.day);
    }
    if (state.time.day === 154) {
      const army = Object.values(state.armies).find((a) => a.clanId === CLAN_BETA)!;
      expect(army.posNodeId).toBe(CASTLE_B2);
      expect(armyPhysicalLeg(army)).toBeNull();
      expect(army.status).toBe('sieging');
    }
    if (
      state.time.day === 155 &&
      log.entries.find((e) => e.command.type === 'transport')!.day === 57
    ) {
      const army = Object.values(state.armies).find((a) => a.clanId === CLAN_BETA)!;
      const cargo = Object.values(state.transports)[0]!;
      const leg = armyPhysicalLeg(army);
      expect(army.posNodeId).toBe(CASTLE_B2);
      expect(army.status).toBe('returning');
      expect(leg).toMatchObject({
        from: CASTLE_B2,
        end: 'dist.b1y',
        progress: 1.25,
        reversing: false,
      });
      expect(cargo.path[cargo.pathCursor + 1]).toBe(CASTLE_B2);
      expect(cargo.edgeProgressDays).toBeCloseTo(27 / 13);
      expect(cargo.edgeCostDays).toBeCloseTo(30 / 13);
      boundary = {
        armyProgress: leg!.progress,
        cargoProgress: cargo.edgeProgressDays,
        cargoCost: cargo.edgeCostDays,
      };
    }
    const envelopes = queue.drain();
    const result = advanceDay(state, envelopes);
    expect(result.appliedCommands).toEqual(envelopes);
    expect(result.events.filter((e) => e.type === 'command.rejected')).toEqual([]);
    expect(state.ai.intentLog.filter((intent) => intent.kind === 'error.invalidCommand')).toEqual(
      [],
    );
    expect(validateState(state), `mini day ${state.time.day}`).toEqual([]);
    recorder.recordTick(result.appliedCommands);
    events.push(result.events);
    if (state.time.day === 143) expect(state.castles[CASTLE_B2]!.ownerClanId).toBe(CLAN_ALPHA);
  }
  return { state, log: recorder.export(state), events, boundary };
}

describe('unchanged mini earned-conquest physical transport occupancy replay', () => {
  it('records and repeats legal commands, earns B2, and delivers cargo past the departed army', () => {
    const first = journey();
    expect(journey()).toEqual(first);
    expect(first.log).toEqual(source);
    expect(first.log.truncated).toBe(false);
    expect(first.boundary?.armyProgress).toBe(1.25);
    expect(first.events.flat()).toContainEqual(
      expect.objectContaining({ type: 'siege.ended', day: 143, fallen: true, castleId: CASTLE_B2 }),
    );
    expect(first.events.flat()).toContainEqual(
      expect.objectContaining({
        type: 'transport.arrived',
        day: 156,
        toCastleId: CASTLE_B2,
        food: 100,
        gold: 20,
        soldiers: 0,
      }),
    );
    expect(first.events.flat().filter((e) => e.type === 'transport.looted')).toEqual([]);
    expect(replayCommandLog(source, (log) => buildMiniState({ seed: log.seed }))).toMatchObject({
      match: true,
      balanceMismatch: false,
    });
  });

  it('restores actual pending cargo and the mid-leg departure with identical persisted state/events/RNG', () => {
    const original = journey();
    const restored = journey(source, true);
    const persistent = (state: typeof original.state) => {
      const copy = structuredClone(state);
      copy.ai.intentLog = []; // Explicitly transient codec diagnostics, no gameplay field removed.
      return copy;
    };
    expect(persistent(restored.state)).toEqual(persistent(original.state));
    expect(restored.events).toEqual(original.events);
    expect(restored.boundary).toEqual(original.boundary);
    expect(restored.state.rng).toEqual(original.state.rng);
    expect(stateHash(restored.state)).toBe(source.finalHash);
  });

  it('one-day-earlier legal cargo is looted while the recalling army is genuinely still at B2', () => {
    const tampered = structuredClone(source);
    tampered.entries.find((e) => e.command.type === 'transport')!.day -= 1;
    // Earlier cargo has already settled at the original mid-leg checkpoint.
    const actual = journey(tampered);
    expect(actual.events.flat()).toContainEqual(
      expect.objectContaining({
        type: 'transport.looted',
        day: 155,
        nodeId: CASTLE_B2,
        food: 100,
        gold: 20,
      }),
    );
    expect(actual.events.flat().filter((e) => e.type === 'transport.arrived')).toEqual([]);
    const result = replayCommandLog(tampered, (log) => buildMiniState({ seed: log.seed }));
    expect(result).toMatchObject({ balanceMismatch: false, match: false });
    expect(result.actualHash).toBe(stateHash(actual.state));
    expect(source.entries.find((e) => e.command.type === 'transport')!.day).toBe(57);
  });
});
