import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { executeCurrentBattleTranscript } from './battleTranscriptCurrent';
import { replayBattleTranscript, type BattleTranscriptFile } from './battleTranscript';

const source = JSON.parse(
  readFileSync(
    new URL('./battle-cases/m5-battle-subloop-v1.tfbattle.json', import.meta.url),
    'utf8',
  ),
) as BattleTranscriptFile;

it('records real current battle execution and independently repeats all thirty tick states', () => {
  const first = executeCurrentBattleTranscript(source);
  const second = executeCurrentBattleTranscript(source);
  expect(first.tickStates).toHaveLength(30);
  expect(second).toEqual(first);
  expect(replayBattleTranscript(first.transcript)).toMatchObject({
    match: true,
    balanceMismatch: false,
    initialMatch: true,
    executedTicks: 30,
    resolved: true,
  });
});

it('preserves every current battle state and RNG through native fifteen-plus-fifteen continuation', () => {
  const uninterrupted = executeCurrentBattleTranscript(source);
  const continued = executeCurrentBattleTranscript(source, 16);
  expect(continued.tickStates).toHaveLength(30);
  expect(continued).toEqual(uninterrupted);
});
