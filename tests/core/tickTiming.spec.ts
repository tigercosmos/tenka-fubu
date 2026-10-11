import { expect, it } from 'vitest';
import { advanceDay, STEP_SEQUENCE } from '../../src/core/systems';
import { stateHash } from '../../src/core/state/serialize';
import { buildTinyState } from '../fixtures/tiny';

it('injects step timing without changing canonical state or RNG', () => {
  const plain = buildTinyState(),
    timed = buildTinyState();
  let clock = 0;
  const untimedResult = advanceDay(plain, []);
  const timedResult = advanceDay(timed, [], { now: () => clock++ });
  expect(untimedResult.perf).toEqual({ totalMs: 0, stepMs: STEP_SEQUENCE.map(() => 0) });
  expect(timedResult.perf.stepMs).toEqual(STEP_SEQUENCE.map(() => 1));
  expect(timedResult.perf.totalMs).toBe(27);
  expect(stateHash(timed)).toBe(stateHash(plain));
  expect(timed.rng).toEqual(plain.rng);
});
