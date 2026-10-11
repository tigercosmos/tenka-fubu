import { describe, expect, it } from 'vitest';
import {
  layoutArmyPlates,
  type ArmyPlateCandidate,
  type PlateRect,
} from '../../src/ui/map/armyPlateLayout';
import { referenceArmyPlateSeed } from '../helpers/armyPlateLayoutReference';

function random(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 2 ** 32;
  };
}
function compare(
  candidates: ArmyPlateCandidate[],
  obstacles: PlateRect[],
  bodies: PlateRect[],
  foreground: PlateRect[],
) {
  const before = structuredClone({ candidates, obstacles, bodies, foreground });
  expect(layoutArmyPlates(candidates, obstacles, bodies, foreground)).toEqual(
    referenceArmyPlateSeed(candidates, obstacles, bodies, foreground),
  );
  expect({ candidates, obstacles, bodies, foreground }).toEqual(before);
}

describe('army plate broadphase exact frozen-seed parity', () => {
  it('retains exact offsets and priority order across 320 seeded sparse and dense scenes', () => {
    for (let seed = 1; seed <= 320; seed++) {
      const next = random(seed);
      const span = seed % 3 === 0 ? 100 : 3000;
      const rect = (): PlateRect => ({
        x: (next() - 0.5) * span,
        y: (next() - 0.5) * span,
        width: next() * 110,
        height: next() * 40,
      });
      const candidates = Array.from({ length: 1 + (seed % 40) }, (_, index) => ({
        id: `army.${index}`,
        priority: Math.floor(next() * 5),
        rect: rect(),
      }));
      compare(
        candidates,
        Array.from({ length: seed % 90 }, rect),
        Array.from({ length: seed % 20 }, rect),
        Array.from({ length: seed % 50 }, rect),
      );
    }
  });
  it('includes boundaries around both 48px offsets and the four-pixel padded gap', () => {
    for (const axis of ['x', 'y'] as const)
      for (const sign of [-1, 1])
        for (const delta of [-1e-9, 0, 1e-9])
          for (const width of [0, 20]) {
            const rect = { x: 0, y: 0, width: 20, height: 10 };
            const near = { x: -3, y: -3, width: 26, height: 16 };
            const boundary = {
              ...rect,
              width,
              [axis]:
                sign > 0
                  ? rect[axis] + (axis === 'x' ? rect.width : rect.height) + 48 + 4 + delta
                  : -48 - 4 - (axis === 'x' ? width : rect.height) + delta,
            };
            compare(
              [
                { id: 'a', priority: 0, rect },
                { id: 'b', priority: 1, rect: { ...rect, x: 9, y: 2 } },
              ],
              [near, boundary],
              [boundary],
              [near, boundary],
            );
          }
  });
  it('keeps far rectangles in edge-derived proposals and includes previously placed plates', () => {
    compare(
      Array.from({ length: 120 }, (_, index) => ({
        id: `army.${index}`,
        priority: index % 3,
        rect: { x: (index % 8) * 13, y: Math.floor(index / 8) * 8, width: 96, height: 20 },
      })),
      [
        { x: -10000, y: 22, width: 1, height: 1 },
        { x: 10000, y: -30, width: 1, height: 1 },
        { x: 2, y: 2, width: 130, height: 25 },
      ],
      [{ x: 50, y: 14, width: 25, height: 30 }],
      [{ x: 90, y: 50, width: 30, height: 40 }],
    );
  });
});
