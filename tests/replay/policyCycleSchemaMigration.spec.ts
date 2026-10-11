import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { advanceDay } from '../../src/core/systems';
import { stateHash } from '../../src/core/state/serialize';
import { SAVE_FORMAT_VERSION } from '../../src/core/save/migrate';
import { validateState } from '../../src/core/state/invariants';
import type { GameState } from '../../src/core/state/gameState';
import type { GameEvent } from '../../src/core/state/events';
import type { CommandEnvelope } from '../../src/core/commands/types';
import type { CommandLogFile } from '../../src/core/replay/commandLog';
import { buildMiniState } from '../fixtures/mini';

const evidence = new URL(
  '../../docs/validation/2026-10-12/golden-provenance/policy-cycle/',
  import.meta.url,
);
interface HistoricalProof {
  sourceArchiveSha256: string;
  historicalDays: Array<{
    day: number;
    state: GameState;
    events: GameEvent[];
    appliedCommands: CommandEnvelope[];
  }>;
}

it('retains all ten policy days while explicitly upgrading only fresh-game reward bookkeeping and save version', () => {
  const proof = JSON.parse(
    gunzipSync(readFileSync(new URL('full-state-proof.json.gz', evidence))).toString('utf8'),
  ) as HistoricalProof;
  expect(
    createHash('sha256')
      .update(readFileSync(new URL('historical-source.tar.gz', evidence)))
      .digest('hex'),
  ).toBe(proof.sourceArchiveSha256);
  const frozen = JSON.parse(
    readFileSync(new URL('frozen-v3.tfulog.json', evidence), 'utf8'),
  ) as CommandLogFile;
  const current = JSON.parse(
    readFileSync(new URL('./cases/ten-command-policy-cycle.tfulog.json', import.meta.url), 'utf8'),
  ) as CommandLogFile;
  expect(current.entries).toEqual(frozen.entries);
  expect(current.finalDay).toBe(10);
  expect(current.finalDay).toBe(frozen.finalDay);
  expect(proof.historicalDays).toHaveLength(10);
  expect(stateHash(proof.historicalDays[9]!.state)).toBe(frozen.finalHash);
  const state = buildMiniState({ seed: frozen.seed });
  expect(SAVE_FORMAT_VERSION).toBe(4);
  expect(state.meta.saveVersion).toBe(4);
  for (const clan of Object.values(state.clans)) expect(clan.rewardGoldSpentThisMonth).toBe(0);
  let sequence = state.meta.lastAppliedCmdSeq + 1;
  for (const historical of proof.historicalDays) {
    const commands = frozen.entries
      .filter((entry) => entry.day === historical.day)
      .map((entry) => ({
        seq: sequence++,
        issuedDay: state.time.day,
        command: structuredClone(entry.command),
      }));
    const result = advanceDay(state, commands);
    expect(result.appliedCommands).toEqual(historical.appliedCommands);
    expect(result.events).toEqual(historical.events);
    const expected = structuredClone(historical.state);
    expect(expected.meta.saveVersion).toBe(3);
    expected.meta.saveVersion = 4;
    for (const clan of Object.values(expected.clans)) {
      expect(Object.hasOwn(clan, 'rewardGoldSpentThisMonth')).toBe(false);
      clan.rewardGoldSpentThisMonth = 0;
    }
    // Exact full state, including transient intent history: no broad metadata stripping.
    expect(state).toEqual(expected);
    expect(validateState(state)).toEqual([]);
  }
  expect(stateHash(state)).toBe(current.finalHash);
});
