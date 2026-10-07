import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runDiplomacyGolden, type DiplomacyGoldenSnapshot } from './diplomacyRunner';

const SNAPSHOT_PATH = fileURLToPath(new URL('./snapshots/golden-diplomacy.json', import.meta.url));
describe('golden-diplomacy M6-17', () => {
  it('locks five years of real diplomacy, court and plot commands with daily invariants', () => {
    const actual = runDiplomacyGolden();
    expect(runDiplomacyGolden()).toEqual(actual);
    if (process.env.UPDATE_GOLDEN === '1') {
      writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(actual, null, 2)}\n`, 'utf8');
      return;
    }
    const expected = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as DiplomacyGoldenSnapshot;
    expect(
      actual,
      'Intentional core changes require UPDATE_GOLDEN=1 and a documented reason.',
    ).toEqual(expected);
  }, 20_000);
});
