import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { zDistrict } from '../../src/data/schemas/district';

const district = {
  id: 'dist.cap-boundary',
  name: '上限測試郡',
  castleId: 'castle.cap-boundary',
  pos: { x: 100, y: 100 },
  kokudaka: 1000,
  kokudakaCap: 1000,
  commerce: 0,
  commerceCap: BAL.commerceMaxAbs,
  population: 1000,
  populationCap: 1000,
};

describe('district commerce cap schema', () => {
  it.each([0, BAL.commerceMaxAbs])('accepts boundary %s and preserves normal defaults', (cap) => {
    const input = { ...district, commerceCap: cap, commerce: cap };
    const before = structuredClone(input);
    expect(zDistrict.parse(input)).toMatchObject({
      ...input,
      publicOrder: 60,
      stewardId: null,
      isPort: false,
      developFocus: 'agri',
    });
    expect(input).toEqual(before);
  });

  it.each([BAL.commerceMaxAbs + 1, -1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, null])(
    'rejects malformed cap %s independently of commerce',
    (cap) => {
      const result = zDistrict.safeParse({ ...district, commerceCap: cap });
      expect(result.success).toBe(false);
      if (result.success) throw new Error('Malformed cap accepted');
      expect(result.error.issues.some((issue) => issue.path[0] === 'commerceCap')).toBe(true);
    },
  );
});
