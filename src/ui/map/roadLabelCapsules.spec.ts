import { expect, it } from 'vitest';
import {
  nearbyRoadLabelCapsules,
  prepareRoadLabelSegments,
  roadLabelClearsCapsules,
} from './roadLabelCapsules';

it('checks independent corner-circle distances, cap contacts and crossing segments', () => {
  const rect = { x: 10, y: 10, width: 20, height: 10 };
  for (const distance of [2, 3, 4]) {
    const point = { x: 10 - distance, y: 10 - distance };
    const radius = 5;
    expect(roadLabelClearsCapsules(rect, [{ a: point, b: point, radius }])).toBe(
      Math.hypot(distance, distance) >= radius,
    );
  }
  expect(
    roadLabelClearsCapsules(rect, [{ a: { x: 0, y: 15 }, b: { x: 40, y: 15 }, radius: 2 }]),
  ).toBe(false);
  expect(
    roadLabelClearsCapsules(rect, [{ a: { x: 0, y: 0 }, b: { x: 40, y: 30 }, radius: 2 }]),
  ).toBe(false);
  expect(
    roadLabelClearsCapsules(rect, [{ a: { x: 5, y: 0 }, b: { x: 5, y: 30 }, radius: 5 }]),
  ).toBe(true);
});

it('prepares frozen original segments once, retains duplicate caps and conservatively culls only beyond the whole 48px search disk', () => {
  const input = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 50, y: 0 },
    { x: 1000, y: 0 },
    { x: 1100, y: 0 },
  ];
  const saved = structuredClone(input);
  const segments = prepareRoadLabelSegments(input)!;
  expect(input).toEqual(saved);
  expect(
    Object.isFrozen(segments) &&
      segments.every((s) => Object.isFrozen(s) && Object.isFrozen(s.a) && Object.isFrozen(s.b)),
  ).toBe(true);
  input[0]!.x = 99;
  expect(segments[0]!.a.x).toBe(0);
  const rect = { x: 0, y: -20, width: 20, height: 10 };
  const near = nearbyRoadLabelCapsules(segments, rect, 1, 6)!;
  expect(near).toHaveLength(3);
  expect(near[0]!.a).toEqual({ x: 0, y: 0 });
  expect(nearbyRoadLabelCapsules(segments, rect, 2, 6)![1]!.b).toEqual({ x: 100, y: 0 });
  expect(
    prepareRoadLabelSegments([
      { x: NaN, y: 0 },
      { x: 2, y: 0 },
    ]),
  ).toBeNull();
  expect(prepareRoadLabelSegments(Array.from({ length: 257 }, (_, x) => ({ x, y: 0 })))).toBeNull();
  expect(roadLabelClearsCapsules(rect, null)).toBe(false);
});
