import { describe, expect, it } from 'vitest';
import {
  createGeographicLabelLayouter,
  layoutGeographicLabels,
  type GeographicLabelCandidate,
} from '../../src/ui/map/geographicLabelLayout';
import {
  createReferenceGeographicLabelLayouter,
  layoutReferenceGeographicLabels,
} from '../helpers/geographicLabelLayoutReference';
import type { PlateRect } from '../../src/ui/map/armyPlateLayout';

function compare(
  candidates: GeographicLabelCandidate[],
  obstacles: PlateRect[],
  hard: PlateRect[],
) {
  const input = structuredClone({ candidates, obstacles, hard });
  expect([...layoutGeographicLabels(candidates, obstacles, hard)]).toEqual([
    ...layoutReferenceGeographicLabels(candidates, obstacles, hard),
  ]);
  expect({ candidates, obstacles, hard }).toEqual(input);
}

describe('geographic edge index frozen-source exact parity', () => {
  it('preserves 160 seeded dense and distant obstacle scenes and cached transitions', () => {
    let seed = 731;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const current = createGeographicLabelLayouter();
    const reference = createReferenceGeographicLabelLayouter();
    for (let scene = 0; scene < 160; scene++) {
      const rectangle = (): PlateRect => ({
        x: (random() - 0.5) * 2200,
        y: (random() - 0.5) * 1200,
        width: random() * 90,
        height: random() * 30,
      });
      const candidates: GeographicLabelCandidate[] = Array.from(
        { length: scene % 4 === 0 ? 120 : 12 },
        (_, index) => ({
          id: `label-${index}`,
          kind: (['province', 'district', 'road'] as const)[index % 3]!,
          rect: rectangle(),
          ...(index % 3 === 2 ? { roadLine: { normal: { x: 0, y: 1 }, slack: 12 } } : {}),
        }),
      );
      const obstacles = Array.from({ length: 120 }, rectangle);
      const hard = Array.from({ length: 10 }, rectangle);
      compare(candidates, obstacles, hard);
      for (let frame = 0; frame < 3; frame++) {
        if (frame === 2) obstacles[0]!.x += 0.125;
        expect([...current.layout(candidates, obstacles, hard)]).toEqual([
          ...reference.layout(candidates, obstacles, hard),
        ]);
        expect(current.getDiagnostics()).toEqual(reference.getDiagnostics());
      }
    }
  }, 20000);

  it('preserves both axis limits, gap boundaries and index coordinate bounds', () => {
    for (const origin of [-1e6, -100.125, 0, 999950, 1e6, 1e6 + 0.01])
      for (const delta of [-1e-8, -1e-10, 0, 1e-10, 1e-8]) {
        const candidates: GeographicLabelCandidate[] = [
          { id: 'edge', kind: 'road', rect: { x: origin, y: origin, width: 40, height: 12 } },
        ];
        const obstacles = [-52, -48, -44, 0, 44, 48, 52].flatMap((offset) => [
          { x: origin + 40 + offset + delta, y: origin, width: 20, height: 12 },
          { x: origin - 20 + offset + delta, y: origin, width: 20, height: 12 },
          { x: origin, y: origin + 12 + offset + delta, width: 40, height: 20 },
          { x: origin, y: origin - 20 + offset + delta, width: 40, height: 20 },
        ]);
        compare(candidates, obstacles, []);
      }
  });

  it('retains full-scan behavior for extreme finite coordinates and cancellation', () => {
    for (const magnitude of [1e7, 1e16, 1e100, 1e308]) {
      const candidates: GeographicLabelCandidate[] = [
        {
          id: 'huge',
          kind: 'province',
          rect: { x: -magnitude, y: -magnitude, width: magnitude, height: magnitude },
        },
        { id: 'ordinary', kind: 'district', rect: { x: 0, y: 0, width: 40, height: 12 } },
      ];
      compare(
        candidates,
        [
          { x: 10000, y: 10000, width: 5, height: 5 },
          { x: -magnitude, y: -magnitude, width: magnitude, height: magnitude },
        ],
        [],
      );
    }
  });
});
