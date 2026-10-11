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
import { validateState } from '../../src/core/state/invariants';
import { stateHash } from '../../src/core/state/serialize';
import { advanceDay } from '../../src/core/systems';
import { getTrust } from '../../src/core/systems/diplomacyCommon';
import { buildMiniState, CLAN_ALPHA, CLAN_BETA, OFF_ALPHA_TAISHO_C } from '../fixtures/mini';

const source = JSON.parse(
  readFileSync(new URL('./cases/m6-diplomacy-trust-merit.tfulog.json', import.meta.url), 'utf8'),
) as CommandLogFile;

function journey(log = source, native = false) {
  let state = buildMiniState({ seed: log.seed });
  const control = buildMiniState({ seed: log.seed });
  let queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  const recorder = new CommandLogRecorder();
  const events = [];
  let paidMonths = 0;
  let crossings = 0;
  let accepted = 0;
  for (let tick = 1; tick <= log.finalDay; tick++) {
    for (const entry of log.entries.filter((entry) => entry.day === tick)) {
      expect(validateCommand(state, entry.command, entry.authority)).toEqual({ ok: true });
      queue.enqueue(structuredClone(entry.command), state.time.day, entry.authority);
    }
    // Restore initial pending START, ongoing capped work, and the genuinely pending STOP.
    if (native && [1, 661, 691].includes(tick)) {
      const before = structuredClone(state);
      const pending = queue.snapshotPlayerCommands();
      const decoded = decodeSave(encodeSave(state, 0, pending));
      expect(state).toEqual(before);
      expect(decoded.ok).toBe(true);
      if (!decoded.ok) throw new Error(decoded.code);
      expect(decoded.saveFile.pendingCommands).toEqual(pending);
      if (tick === 1) expect(pending).toEqual([log.entries[0]!.command]);
      else {
        expect(state.diplomacy.missions).toHaveLength(1);
        expect(getTrust(state, CLAN_ALPHA, CLAN_BETA)).toBe(BAL.trustMax);
        expect(state.officers[OFF_ALPHA_TAISHO_C]!.merit).toBe(BAL.meritDiplomacy);
        expect(pending).toEqual(tick === 691 ? [log.entries[1]!.command] : []);
      }
      state = decoded.saveFile.state;
      queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
      for (const command of decoded.saveFile.pendingCommands)
        queue.enqueue(command, state.time.day);
    }
    const trustBefore = getTrust(state, CLAN_ALPHA, CLAN_BETA);
    const meritBefore = state.officers[OFF_ALPHA_TAISHO_C]!.merit;
    const expBefore = state.officers[OFF_ALPHA_TAISHO_C]!.statExp.pol;
    const envelopes = queue.drain();
    const result = advanceDay(state, envelopes);
    advanceDay(control, []);
    expect(result.appliedCommands).toEqual(envelopes);
    expect(result.events.filter((event) => event.type === 'command.rejected')).toEqual([]);
    expect(validateState(state)).toEqual([]);
    accepted += result.appliedCommands.length;
    recorder.recordTick(result.appliedCommands);
    events.push(result.events);
    if (state.time.dayOfMonth === 1 && state.diplomacy.missions.length) paidMonths++;
    expect(control.clans[CLAN_ALPHA]!.gold - state.clans[CLAN_ALPHA]!.gold).toBe(
      paidMonths * BAL.diplomacyWorkMonthlyCost,
    );
    const crosses =
      trustBefore < BAL.trustMax && getTrust(state, CLAN_ALPHA, CLAN_BETA) === BAL.trustMax;
    if (crosses) crossings++;
    expect(state.officers[OFF_ALPHA_TAISHO_C]!.merit - meritBefore).toBe(
      crosses ? BAL.meritDiplomacy : 0,
    );
    expect(state.officers[OFF_ALPHA_TAISHO_C]!.statExp.pol - expBefore).toBe(
      crosses ? BAL.meritDiplomacy : 0,
    );
  }
  expect(accepted).toBe(log.entries.length);
  return { state, log: recorder.export(state), events, crossings, paidMonths };
}

describe('permanent naturally completed diplomacy merit replay', () => {
  it('records unchanged mini seed twice, pays real months and awards only the genuine crossing', () => {
    const first = journey();
    const second = journey();
    expect(first).toEqual(second);
    expect(first.log).toEqual(source);
    expect(first.crossings).toBe(1);
    expect(first.paidMonths).toBe(23); // 22 months to the cap, then one further paid month.
    expect(first.state.diplomacy.missions).toEqual([]);
    expect(replayCommandLog(source, (log) => buildMiniState({ seed: log.seed }))).toMatchObject({
      match: true,
      balanceMismatch: false,
      actualHash: source.finalHash,
    });
  });

  it('restores pending START/STOP and ongoing work through native codec with identical persistent state/events/RNG', () => {
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

  it('validates every tampered normal-day command and detects the resulting different final state', () => {
    const tampered = structuredClone(source);
    tampered.entries[1]!.day -= 1;
    const actual = journey(tampered);
    const replay = replayCommandLog(tampered, (log) => buildMiniState({ seed: log.seed }));
    expect(replay).toMatchObject({
      match: false,
      balanceMismatch: false,
      actualHash: stateHash(actual.state),
    });
    expect(source.entries[1]!.day).toBe(691);
  });
});
