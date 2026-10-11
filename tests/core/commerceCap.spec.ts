import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { SAVE_FORMAT_VERSION } from '../../src/core/save/migrate';
import { validateState } from '../../src/core/state/invariants';
import { stateHash } from '../../src/core/state/serialize';
import { advanceDay } from '../../src/core/systems/index';
import { buildTinyState } from '../fixtures/tiny';

const LIMIT = BAL.commerceMaxAbs;
const TIMESTAMP = 1_751_808_000_000;

function fixture(commerceCap: number, commerce = 0) {
  const game = buildTinyState();
  const district = Object.values(game.districts)[0]!;
  district.commerceCap = commerceCap;
  district.commerce = commerce;
  return { game, district };
}

describe('commerce cap runtime and save validation', () => {
  it.each([LIMIT + 1, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NaN, 0.5, -1])(
    'rejects malformed cap %s even when commerce does not exceed it',
    (cap) => {
      const { game, district } = fixture(cap);
      const before = structuredClone(game);
      expect(validateState(game)).toContainEqual(
        expect.objectContaining({ inv: 'INV-16', refs: [district.id] }),
      );
      expect(game).toEqual(before);
    },
  );

  it('rejects commerce equal to an oversized cap', () => {
    const { game } = fixture(LIMIT + 1, LIMIT + 1);
    expect(validateState(game).some((violation) => violation.inv === 'INV-16')).toBe(true);
  });

  it.each([0, LIMIT])('accepts exact valid cap %s with commerce equal to cap', (cap) => {
    const { game } = fixture(cap, cap);
    expect(validateState(game)).toEqual([]);
    const before = structuredClone(game);
    const decoded = decodeSave(encodeSave(game, TIMESTAMP));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.code);
    expect(decoded.saveFile.version).toBe(SAVE_FORMAT_VERSION);
    expect(decoded.saveFile.state).toEqual(game);
    expect(game).toEqual(before);
  });

  it('preserves valid fractional commerce and native save continuation', () => {
    const { game } = fixture(LIMIT, 100.25);
    expect(validateState(game)).toEqual([]);
    const decoded = decodeSave(encodeSave(game, TIMESTAMP));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.code);
    const resumed = decoded.saveFile.state;
    for (let day = 0; day < 10; day += 1) {
      expect(advanceDay(resumed, []).events).toEqual(advanceDay(game, []).events);
      expect(validateState(game)).toEqual([]);
      expect(validateState(resumed)).toEqual([]);
      expect(stateHash(resumed)).toBe(stateHash(game));
      expect(resumed.rng).toEqual(game.rng);
    }
  });

  it.each([LIMIT + 1, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects encoded malformed cap %s as corrupt',
    (cap) => {
      const { game } = fixture(cap);
      const before = structuredClone(game);
      expect(decodeSave(encodeSave(game, TIMESTAMP))).toMatchObject({
        ok: false,
        code: 'corrupt',
      });
      expect(game).toEqual(before);
    },
  );
});
