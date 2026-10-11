import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { runAiGolden, type AiGoldenSnapshot } from './aiRunner';

const SNAPSHOT_PATH = fileURLToPath(new URL('./snapshots/golden-ai.json', import.meta.url));
it('locks360 autonomous mini ticks with daily invariants, repeatability and save-load continuation', () => {
  const actual = runAiGolden();
  expect(runAiGolden()).toEqual(actual);
  expect(runAiGolden(true)).toEqual(actual);
  if (process.env.UPDATE_GOLDEN === '1') {
    writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(actual, null, 2)}\n`, 'utf8');
    return;
  }
  const expected = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as AiGoldenSnapshot;
  expect(actual, 'Intentional AI changes require a reviewed UPDATE_GOLDEN=1 baseline.').toEqual(
    expected,
  );
}, 20_000);
