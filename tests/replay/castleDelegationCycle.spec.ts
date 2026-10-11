import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { envelopeAuthority } from '../../src/core/commands/authority';
import { CommandQueue, enqueuePendingAiOrders } from '../../src/core/commands/queue';
import { validateCommand } from '../../src/core/commands/validate';
import {
  CommandLogRecorder,
  replayCommandLog,
  type CommandLogFile,
} from '../../src/core/replay/commandLog';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { validateState } from '../../src/core/state/invariants';
import { stateHash } from '../../src/core/state/serialize';
import { advanceDay } from '../../src/core/systems';
import { buildMiniState, CASTLE_A2, CLAN_ALPHA } from '../fixtures/mini';

const source = JSON.parse(
  readFileSync(new URL('./cases/m6-castle-delegation-cycle.tfulog.json', import.meta.url), 'utf8'),
) as CommandLogFile;
const persistent = (state: ReturnType<typeof buildMiniState>) => {
  const clone = structuredClone(state);
  clone.ai.intentLog = [];
  return clone;
};
function journey(log = source, native = false) {
  let state = buildMiniState({ seed: log.seed });
  let queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  const recorder = new CommandLogRecorder();
  const events = [];
  const checkpoints = [];
  expect(validateState(state)).toEqual([]);
  for (let tick = 1; tick <= log.finalDay; tick++) {
    for (const entry of log.entries.filter((e) => e.day === tick && !e.authority)) {
      expect(validateCommand(state, entry.command)).toEqual({ ok: true });
      queue.enqueue(structuredClone(entry.command), state.time.day);
    }
    if (native && [1, 24, 31, 32, 61].includes(tick)) {
      const pending = queue.snapshotPlayerCommands();
      const before = structuredClone(state);
      const decoded = decodeSave(encodeSave(state, 0, pending));
      expect(state).toEqual(before);
      if (!decoded.ok) throw Error(decoded.code);
      expect(decoded.saveFile.pendingCommands).toEqual(pending);
      expect(persistent(decoded.saveFile.state)).toEqual(persistent(state));
      expect(decoded.saveFile.state.ai.pendingOrders).toEqual(state.ai.pendingOrders);
      checkpoints.push({ tick, player: pending.length, ai: state.ai.pendingOrders.length });
      state = decoded.saveFile.state;
      queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
      for (const cmd of decoded.saveFile.pendingCommands) queue.enqueue(cmd, state.time.day);
    }
    enqueuePendingAiOrders(state, queue);
    const envelopes = queue.drain();
    for (const envelope of envelopes)
      expect(validateCommand(state, envelope.command, envelopeAuthority(envelope))).toEqual({
        ok: true,
      });
    const result = advanceDay(state, envelopes);
    expect(result.appliedCommands).toEqual(envelopes);
    expect(result.events.filter((e) => e.type === 'command.rejected')).toEqual([]);
    expect(validateState(state), `day ${state.time.day}`).toEqual([]);
    recorder.recordTick(result.appliedCommands);
    events.push(result.events);
  }
  return { state, log: recorder.export(state), events, checkpoints };
}
describe('unchanged mini delegated castle monthly administration and direct restoration', () => {
  it('records and replays actual castle-authority orders, with no delegated orders after restoration', () => {
    const actual = journey();
    expect(journey()).toEqual(actual);
    expect(actual.log).toEqual(source);
    expect(actual.log.truncated).toBe(false);
    const delegated = actual.log.entries.filter((e) => e.authority?.kind === 'castle');
    expect(delegated.map((e) => e.command.type)).toEqual([
      'setConscriptPolicy',
      'buildFacility',
      'setDevelopFocus',
      'setDevelopFocus',
    ]);
    for (const entry of delegated) {
      expect(entry.day).toBe(31);
      expect(entry.authority).toEqual({ kind: 'castle', clanId: CLAN_ALPHA, castleId: CASTLE_A2 });
    }
    expect(actual.log.entries.some((e) => e.authority?.kind === 'clan')).toBe(true);
    expect(actual.state.castles[CASTLE_A2]!.directControl).toBe(true);
    expect(
      actual.state.castles[CASTLE_A2]!.buildQueue.some((b) => b.facilityTypeId === 'fac.ichi'),
    ).toBe(true);
    expect(actual.state.ai.pendingOrders).toEqual([]);
    expect(replayCommandLog(source, (log) => buildMiniState({ seed: log.seed }))).toEqual({
      match: true,
      actualHash: source.finalHash,
      expectedHash: source.finalHash,
      balanceMismatch: false,
    });
  });
  it('restores real pending player and generated AI commands into fresh native queues', () => {
    const original = journey();
    const restored = journey(source, true);
    expect(restored.checkpoints).toEqual([
      { tick: 1, player: 1, ai: 0 },
      { tick: 24, player: 0, ai: 7 },
      { tick: 31, player: 0, ai: 4 },
      { tick: 32, player: 1, ai: 0 },
      { tick: 61, player: 0, ai: 0 },
    ]);
    expect(restored.log).toEqual(source);
    expect(restored.events).toEqual(original.events);
    expect(persistent(restored.state)).toEqual(persistent(original.state));
    expect(restored.state.rng).toEqual(original.state.rng);
  });
  it('proves a legal earlier restoration prevents that monthly delegation and changes the recorded hash', () => {
    const altered = structuredClone(source);
    altered.entries.find(
      (e) => e.command.type === 'setCastleControl' && e.command.directControl,
    )!.day = 29;
    const actual = journey(altered);
    expect(actual.log.entries.filter((e) => e.authority?.kind === 'castle')).toEqual([]);
    const replay = replayCommandLog({ ...actual.log, finalHash: source.finalHash }, (log) =>
      buildMiniState({ seed: log.seed }),
    );
    expect(replay.match).toBe(false);
    expect(replay.actualHash).toBe(stateHash(actual.state));
    expect(replay.actualHash).not.toBe(source.finalHash);
  });
});
