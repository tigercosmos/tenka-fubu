import { describe, expect, it } from 'vitest';
import { validateState } from '../../src/core/state/invariants';
import { advanceDay } from '../../src/core/systems/index';
import { makeLoopTestState, TEST_CLAN, TEST_LEADER } from './loopState';

describe('loop fixture referential integrity', () => {
  it('starts with a real adult serving leader and passes all invariants without mutation', () => {
    const game = makeLoopTestState();
    const before = structuredClone(game);
    expect(game.clans[TEST_CLAN]!.leaderId).toBe(TEST_LEADER);
    expect(game.officers[TEST_LEADER]).toMatchObject({
      clanId: TEST_CLAN,
      status: 'serving',
      hasComeOfAge: true,
      loyalty: 100,
    });
    expect(validateState(game)).toEqual([]);
    expect(game).toEqual(before);
  });
  it('remains valid across the first completed diagnostic interval', () => {
    const game = makeLoopTestState();
    for (let i = 0; i < 30; i++) {
      advanceDay(game, []);
      expect(validateState(game)).toEqual([]);
    }
    expect(game.time.day).toBe(30);
  });
});
