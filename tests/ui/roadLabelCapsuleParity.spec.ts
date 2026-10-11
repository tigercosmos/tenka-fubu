import { describe, expect, it } from 'vitest';
import { roadLabelClearsCapsules, type RoadLabelCapsule } from '../../src/ui/map/roadLabelCapsules';
import { referenceRoadLabelClearsCapsules } from '../helpers/roadLabelCapsulesReference';
import type { PlateRect } from '../../src/ui/map/armyPlateLayout';

function compare(rect: PlateRect, capsules: readonly RoadLabelCapsule[] | null) {
  const before = structuredClone({ rect, capsules });
  expect(roadLabelClearsCapsules(rect, capsules)).toBe(
    referenceRoadLabelClearsCapsules(rect, capsules),
  );
  expect({ rect, capsules }).toEqual(before);
}

describe('road capsule distance exact frozen-source parity', () => {
  it('preserves 600 seeded segment/rectangle scenes, including degenerate segments and rectangles', () => {
    let seed = 19;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    for (let scene = 0; scene < 600; scene += 1) {
      const point = () => ({ x: (random() - 0.5) * 2000, y: (random() - 0.5) * 2000 });
      const rect = {
        ...point(),
        width: scene % 7 === 0 ? 0 : random() * 120,
        height: scene % 11 === 0 ? 0 : random() * 40,
      };
      const capsules = Array.from({ length: scene % 20 }, (_, index) => {
        const a = point();
        return { a, b: index % 4 === 0 ? a : point(), radius: index % 5 === 0 ? 0 : random() * 16 };
      });
      compare(rect, capsules);
    }
  });

  it('retains exact edge, corner, tangent and epsilon-boundary decisions', () => {
    const rect = { x: 0, y: 0, width: 40, height: 12 };
    for (const radius of [0, 1e-4, 1, 4])
      for (const delta of [-1e-8, -1e-10, 0, 1e-10, 1e-8]) {
        const y = -radius + delta;
        for (const [a, b] of [
          [
            { x: -10, y },
            { x: 50, y },
          ],
          [
            { x: 0, y },
            { x: 0, y },
          ],
          [
            { x: -radius + delta, y: -radius + delta },
            { x: -radius + delta, y: -radius + delta },
          ],
          [
            { x: 40 + radius + delta, y: 0 },
            { x: 40 + radius + delta, y: 12 },
          ],
          [
            { x: -10, y: -10 },
            { x: 50, y: 22 },
          ],
        ])
          compare(rect, [{ a: a!, b: b!, radius }]);
      }
  });

  it('preserves existing null, length, nonfinite and negative-radius guards', () => {
    const rect = { x: 0, y: 0, width: 1, height: 1 };
    const capsule = { a: { x: 2, y: 2 }, b: { x: 3, y: 3 }, radius: 1 };
    compare(rect, null);
    compare(rect, []);
    compare(
      rect,
      Array.from({ length: 256 }, () => capsule),
    );
    for (const value of [NaN, Infinity, -Infinity]) {
      for (const key of ['x', 'y', 'width', 'height'] as const)
        compare({ ...rect, [key]: value }, [capsule]);
      compare(rect, [{ ...capsule, a: { ...capsule.a, x: value } }]);
      compare(rect, [{ ...capsule, b: { ...capsule.b, y: value } }]);
      compare(rect, [{ ...capsule, radius: value }]);
    }
    compare(rect, [{ ...capsule, radius: -1 }]);
    compare({ ...rect, width: -1 }, [capsule]);
  });
});
