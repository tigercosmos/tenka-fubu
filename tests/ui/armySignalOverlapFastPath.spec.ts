import { describe, expect, it } from 'vitest';
import {
  layoutArmySignals,
  type ArmySignalCandidate,
  type SignalRect,
} from '@ui/map/armySignalLayout';
import { layoutArmySignals as originalLayoutArmySignals } from './fixtures/armySignalLayoutOriginal';

const candidate = (id: string, rect: SignalRect, priority = 2): ArmySignalCandidate => ({
  id,
  rect,
  priority,
});

function expectExactOriginal(candidates: ArmySignalCandidate[], obstacles: SignalRect[]) {
  const before = JSON.stringify({ candidates, obstacles });
  const original = originalLayoutArmySignals(candidates, obstacles);
  const current = layoutArmySignals(candidates, obstacles);
  expect([...current.keys()]).toEqual([...original.keys()]);
  for (const [id, offset] of original) {
    const actual = current.get(id)!;
    expect(Object.is(actual.x, offset.x), `${id}.x`).toBe(true);
    expect(Object.is(actual.y, offset.y), `${id}.y`).toBe(true);
  }
  expect(JSON.stringify({ candidates, obstacles })).toBe(before);
}

describe('army signal zero-X overlap fast path', () => {
  it('preserves the copied painted Sunpu layout and sparse national-style geometry', () => {
    expectExactOriginal(
      [
        candidate('army.1', {
          x: 638.0972148268079,
          y: 324.375,
          width: 28.103610387916675,
          height: 36.875,
        }),
        candidate('army.7', {
          x: 656.8472148268079,
          y: 309.375,
          width: 21.7777851731919,
          height: 36.875,
        }),
        candidate('army.11', {
          x: 664.64443785608,
          y: 300.40368627109365,
          width: 30.826875872825905,
          height: 35.846313728906054,
        }),
      ],
      [
        { x: 637.61593204775, y: 323.7821395775936, width: 32.30027548209366, height: 35 },
        { x: 656.36593204775, y: 308.7821395775936, width: 32.30027548209366, height: 35 },
        { x: 668.86593204775, y: 298.7821395775936, width: 32.30027548209366, height: 35 },
        { x: 615, y: 328.64951768488754, width: 50, height: 42.765273311897104 },
        { x: 586.3380001831056, y: 390, width: 107.32399963378906, height: 20 },
      ],
    );
    expectExactOriginal(
      Array.from({ length: 120 }, (_, i) =>
        candidate(`army.${i}`, {
          x: (i % 20) * 72,
          y: Math.floor(i / 20) * 52,
          width: 29,
          height: 35,
        }),
      ),
      Array.from({ length: 300 }, (_, i) => ({
        x: (i % 30) * 51,
        y: Math.floor(i / 30) * 45,
        width: 33,
        height: 36,
      })),
    );
  });

  it('matches the original near MAX, signed zero, subnormals, and bounded displacements', () => {
    const edge = Number.MAX_VALUE / 16;
    const bits = new DataView(new ArrayBuffer(8));
    bits.setFloat64(0, edge);
    const word = bits.getBigUint64(0);
    bits.setBigUint64(0, word - 1n);
    const below = bits.getFloat64(0);
    bits.setBigUint64(0, word + 1n);
    const above = bits.getFloat64(0);
    const cases: Array<[ArmySignalCandidate[], SignalRect[]]> = [
      [
        [candidate('zero', { x: -0, y: -0, width: 0, height: Number.MIN_VALUE })],
        [{ x: 0, y: Number.MIN_VALUE, width: 0, height: Number.MIN_VALUE }],
      ],
      [
        [candidate('huge', { x: 0, y: -Number.MAX_VALUE, width: 0, height: Number.MAX_VALUE })],
        [{ x: 100, y: -Number.MAX_VALUE, width: 0, height: Number.MAX_VALUE }],
      ],
      [
        [
          candidate('bounded', {
            x: -24,
            y: -Number.MAX_VALUE / 4,
            width: 0,
            height: Number.MAX_VALUE / 4,
          }),
        ],
        [{ x: 24, y: Number.MAX_VALUE / 4, width: 0, height: 0 }],
      ],
      [
        [
          candidate('subnormal', {
            x: 0,
            y: -Number.MIN_VALUE,
            width: Number.MIN_VALUE,
            height: Number.MIN_VALUE,
          }),
        ],
        [{ x: 24, y: 0, width: Number.MIN_VALUE, height: Number.MIN_VALUE }],
      ],
      [
        [candidate('safe-boundary', { x: 0, y: -below, width: 0, height: below })],
        [{ x: 24, y: below, width: 0, height: below }],
      ],
      [
        [candidate('fallback-boundary', { x: 0, y: -above, width: 0, height: above })],
        [{ x: 24, y: above, width: 0, height: above }],
      ],
    ];
    for (const [candidates, obstacles] of cases) expectExactOriginal(candidates, obstacles);
  });

  it('matches ordered offsets across randomized crowded and sparse scenes plus exact work exhaustion', () => {
    expectExactOriginal([], Array<SignalRect>(3));
    let seed = 0x12345678;
    const next = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
    for (let trial = 0; trial < 100; trial++) {
      const spread = trial % 2 ? 12 : 240;
      const candidates = Array.from({ length: 2 + (trial % 16) }, (_, i) =>
        candidate(
          `army.${i}`,
          {
            x: Math.floor(next() * spread) - spread / 2,
            y: Math.floor(next() * spread) - spread / 2,
            width: 5 + Math.floor(next() * 35),
            height: 5 + Math.floor(next() * 40),
          },
          i % 3,
        ),
      );
      const obstacles = Array.from({ length: 2 + (trial % 19) }, () => ({
        x: Math.floor(next() * spread) - spread / 2,
        y: Math.floor(next() * spread) - spread / 2,
        width: 2 + Math.floor(next() * 60),
        height: 2 + Math.floor(next() * 70),
      }));
      expectExactOriginal(candidates, obstacles);
    }
    expectExactOriginal(
      Array.from({ length: 256 }, (_, i) =>
        candidate(`army.${i}`, { x: 0, y: 0, width: 12, height: 24 }),
      ),
      Array.from({ length: 1024 }, () => ({ x: -100, y: -100, width: 200, height: 200 })),
    );
  });
});
