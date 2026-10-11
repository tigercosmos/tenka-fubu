import { expect, it } from 'vitest';
import { runInNewContext } from 'node:vm';
import { encodeFullSnapshot } from '../../e2e/full-snapshot-transport';
import { buildFullState } from '../helpers/fullState';
import { validateState } from '../../src/core/state/invariants';

it('roundtrips every field of a genuine national s1560 snapshot without mutating it', async () => {
  const game = await buildFullState({ seed: 42 });
  const before = structuredClone(game);
  const decoded: unknown = JSON.parse(encodeFullSnapshot(game));
  expect(decoded).toStrictEqual(before);
  expect(game).toStrictEqual(before);
  expect(validateState(game)).toEqual([]);
  expect(Object.keys(game.castles)).toHaveLength(121);
  expect(Object.keys(game.districts)).toHaveLength(344);
  // Mirror the native expression: the encoder must have no module closures,
  // and validate same-realm objects just as the browser's direct GameState does.
  const isolated: unknown = runInNewContext(
    `(${encodeFullSnapshot.toString()})(JSON.parse(input))`,
    { input: JSON.stringify(game) },
  );
  expect(typeof isolated).toBe('string');
  expect(JSON.parse(isolated as string)).toStrictEqual(before);
});

it.each([
  ['undefined value', { lost: undefined }],
  ['nonfinite number', { lost: Number.NaN }],
  ['infinite number', { lost: Infinity }],
  ['negative zero', { lost: -0 }],
  ['function', { lost: () => 1 }],
  ['symbol value', { lost: Symbol('lost') }],
  ['bigint', { lost: 1n }],
  ['date', { lost: new Date(0) }],
  ['map', { lost: new Map([['key', 1]]) }],
  ['set', { lost: new Set([1]) }],
  ['sparse array', { lost: new Array(2) }],
  ['undefined array entry', { lost: [undefined] }],
  ['array extra property', { lost: Object.assign([1], { extra: 2 }) }],
  ['symbol key', { lost: { [Symbol('key')]: 2 } }],
  ['nonenumerable field', { lost: Object.defineProperty({}, 'hidden', { value: 2 }) }],
  [
    'accessor',
    {
      lost: {
        get value() {
          throw new Error('getter must not execute');
        },
      },
    },
  ],
])('rejects JSON information loss: %s', (_label, value) => {
  expect(() => encodeFullSnapshot(value)).toThrow(/Full snapshot/);
});

it('rejects cycles and custom prototypes while retaining all ordinary JSON primitives', () => {
  const cyclic: { child?: unknown } = {};
  cyclic.child = cyclic;
  expect(() => encodeFullSnapshot(cyclic)).toThrow(/Full snapshot/);
  expect(() => encodeFullSnapshot(Object.create({ inherited: 1 }))).toThrow(/Full snapshot/);
  const ordinary = { empty: '', nil: null, yes: true, no: false, n: 0, nested: [{ a: 1.25 }] };
  expect(JSON.parse(encodeFullSnapshot(ordinary))).toStrictEqual(ordinary);
});
