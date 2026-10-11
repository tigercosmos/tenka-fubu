import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { expect, it } from 'vitest';
import { advanceDay } from '../../src/core/systems';
import { stateHash } from '../../src/core/state/serialize';
import { validateState } from '../../src/core/state/invariants';
import { BAL } from '../../src/core/balance';
import type { GameState } from '../../src/core/state/gameState';
import type { GameEvent } from '../../src/core/state/events';
import type { CommandEnvelope } from '../../src/core/commands/types';
import type { CommandLogFile } from '../../src/core/replay/commandLog';
import { buildMiniState } from '../fixtures/mini';

const evidence = new URL(
  '../../docs/validation/2026-10-12/golden-provenance/m4-siege/',
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
  days: Array<{
    stateDifferences: Array<{ path: string; old?: number; current: number }>;
    eventDifferences: number;
  }>;
}

it('retains all 61 siege replay days except specified integer durability, victory merit and fresh-game schema', () => {
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
    readFileSync(new URL('./cases/m4-military-siege-fall.tfulog.json', import.meta.url), 'utf8'),
  ) as CommandLogFile;
  expect(current.entries).toEqual(frozen.entries);
  expect(current.finalDay).toBe(61);
  expect(current.finalDay).toBe(frozen.finalDay);
  expect(proof.historicalDays).toHaveLength(61);
  expect(stateHash(proof.historicalDays[60]!.state)).toBe(frozen.finalHash);
  const state = buildMiniState({ seed: frozen.seed });
  let sequence = state.meta.lastAppliedCmdSeq + 1;
  let previousHistoricalDurability = 500;
  let integerDurability = 500;
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
    expect(proof.days[historical.day - 1]!.eventDifferences).toBe(0);
    const expected = structuredClone(historical.state);
    expected.meta.saveVersion = 4;
    for (const clan of Object.values(expected.clans)) {
      expect(Object.hasOwn(clan, 'rewardGoldSpentThisMonth')).toBe(false);
      clan.rewardGoldSpentThisMonth = 0;
    }
    const historicalDurability =
      expected.castles['castle.b2' as keyof GameState['castles']]!.durability;
    if (historical.day < 61) {
      const unchangedDamage = previousHistoricalDurability - historicalDurability;
      integerDurability = Math.round(Math.max(0, integerDurability - unchangedDamage));
    }
    previousHistoricalDurability = historicalDurability;
    const changes = proof.days[historical.day - 1]!.stateDifferences;
    for (const change of changes) {
      // This is a closed set of attributable fields, never a generic JSON patch.
      if (change.path === '/castles/castle.b2/durability') {
        expect(historical.day).toBeGreaterThanOrEqual(10);
        expect(historical.day).toBeLessThan(61);
        expect(change.current).toBe(integerDurability);
        expected.castles['castle.b2' as keyof GameState['castles']]!.durability = integerDurability;
      } else {
        expect(change.path).toMatch(
          /^\/(meta\/saveVersion|clans\/clan\.(alpha|beta)\/rewardGoldSpentThisMonth|officers\/off\.alpha-lord\/(merit|statExp\/(ldr|val)))$/,
        );
      }
    }
    if (historical.day === 10)
      expect(state.castles['castle.b2' as keyof GameState['castles']]!.durability).toBe(
        Math.round(496.69208),
      );
    if (historical.day === 61) {
      expect(result.events.some((event) => event.type === 'siege.ended' && event.fallen)).toBe(
        true,
      );
      const commander = expected.officers['off.alpha-lord' as keyof GameState['officers']]!;
      const award = Math.round(BAL.meritSiegeWin * BAL.meritCommanderMult);
      expect(award).toBe(45);
      expect(commander.merit).toBe(0);
      commander.merit = award;
      commander.statExp.ldr = award;
      commander.statExp.val = award;
      expect(changes.map((change) => change.path).sort()).toEqual([
        '/clans/clan.alpha/rewardGoldSpentThisMonth',
        '/clans/clan.beta/rewardGoldSpentThisMonth',
        '/meta/saveVersion',
        '/officers/off.alpha-lord/merit',
        '/officers/off.alpha-lord/statExp/ldr',
        '/officers/off.alpha-lord/statExp/val',
      ]);
    }
    expect(state).toEqual(expected);
    expect(validateState(state)).toEqual([]);
  }
  expect(stateHash(state)).toBe(current.finalHash);
});
