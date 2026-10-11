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
import type { GameState } from '../../src/core/state/gameState';
import { validateState } from '../../src/core/state/invariants';
import { stateHash } from '../../src/core/state/serialize';
import { advanceDay } from '../../src/core/systems';
import { buildMiniState, CLAN_ALPHA, OFF_ALPHA_TAISHO_B } from '../fixtures/mini';

const source = JSON.parse(
  readFileSync(new URL('./cases/m6-reward-month-boundary.tfulog.json', import.meta.url), 'utf8'),
) as CommandLogFile;
const persistent = (state: GameState) => {
  const copy = structuredClone(state);
  copy.ai.intentLog = [];
  return copy;
};

/** Unchanged mini: only player gifts, with every command admitted and every daily INV checked. */
function journey(log = source, native = false) {
  let state = buildMiniState({ seed: log.seed });
  const twin = buildMiniState({ seed: log.seed });
  let queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  const recorder = new CommandLogRecorder();
  const events = [];
  const counters: number[] = [];
  expect(validateState(state)).toEqual([]);
  for (let tick = 1; tick <= log.finalDay; tick++) {
    for (const entry of log.entries.filter((entry) => entry.day === tick)) {
      expect(validateCommand(state, entry.command)).toEqual({ ok: true });
      queue.enqueue(structuredClone(entry.command), state.time.day);
    }
    // Genuine pending gifts at old-month day119 and new-month day120, not original envelopes.
    if (native && (tick === 30 || tick === 31)) {
      expect(state.time.day).toBe(tick === 30 ? 119 : 120);
      const before = structuredClone(state);
      const pending = queue.snapshotPlayerCommands();
      expect(pending).toHaveLength(1);
      const decoded = decodeSave(encodeSave(state, 0, pending));
      expect(state).toEqual(before);
      if (!decoded.ok) throw new Error('native reward checkpoint failed');
      expect(decoded.saveFile.pendingCommands).toEqual(pending);
      expect(persistent(decoded.saveFile.state)).toEqual(persistent(state));
      expect(decoded.saveFile.state.ai.pendingOrders).toEqual(state.ai.pendingOrders);
      state = decoded.saveFile.state;
      queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
      for (const command of decoded.saveFile.pendingCommands)
        queue.enqueue(command, state.time.day);
    }
    const envelopes = queue.drain();
    const result = advanceDay(state, envelopes);
    expect(result.appliedCommands).toEqual(envelopes);
    expect(result.events.filter((event) => event.type === 'command.rejected')).toEqual([]);
    expect(validateState(state)).toEqual([]);
    recorder.recordTick(result.appliedCommands);
    events.push(result.events);
    advanceDay(twin, []);
    expect(validateState(twin)).toEqual([]);
    if (tick >= 29) counters.push(state.clans[CLAN_ALPHA]!.rewardGoldSpentThisMonth!);
  }
  // Actual no-gift twin accounts for normal monthly income/salary instead of assuming static cash.
  expect(twin.clans[CLAN_ALPHA]!.gold - state.clans[CLAN_ALPHA]!.gold).toBe(
    3 * BAL.rewardGoldSmallCost,
  );
  expect(state.officers[OFF_ALPHA_TAISHO_B]!.rewardGiftsThisYear).toBe(3);
  return { state, log: recorder.export(state), events, counters };
}

describe('permanent mini monthly reward accounting boundary', () => {
  it('records three accepted gifts and actual old-month reset without refunding their payments', () => {
    const first = journey();
    const second = journey();
    expect(first.counters).toEqual([BAL.rewardGoldSmallCost, 0, BAL.rewardGoldSmallCost]);
    expect(first.log).toEqual(source);
    expect(first).toEqual(second);
    expect(first.state.time.day).toBe(121);
    expect(replayCommandLog(source, (log) => buildMiniState({ seed: log.seed }))).toEqual({
      match: true,
      actualHash: source.finalHash,
      expectedHash: source.finalHash,
      balanceMismatch: false,
    });
  });

  it('continues genuinely restored pending gifts across both sides of the month boundary', () => {
    const original = journey();
    const restored = journey(source, true);
    expect(restored.log).toEqual(source);
    expect(restored.events).toEqual(original.events);
    expect(restored.counters).toEqual(original.counters);
    expect(persistent(restored.state)).toEqual(persistent(original.state));
    expect(restored.state.rng).toEqual(original.state.rng);
    expect(stateHash(restored.state)).toBe(source.finalHash);
  });

  it('detects a legally applied third gift moved into the old month, retaining total payment/count', () => {
    const tampered = structuredClone(source);
    tampered.entries[2]!.day = 30;
    tampered.entries[2]!.seq = 1;
    const actual = journey(tampered);
    expect(actual.counters).toEqual([BAL.rewardGoldSmallCost, 0, 0]);
    expect(actual.log.entries).toEqual(tampered.entries);
    const replay = replayCommandLog(tampered, (log) => buildMiniState({ seed: log.seed }));
    expect(replay.match).toBe(false);
    expect(replay.actualHash).toBe(stateHash(actual.state));
    expect(replay.actualHash).not.toBe(source.finalHash);
  });
});
