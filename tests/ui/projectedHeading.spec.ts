import { expect, it, vi } from 'vitest';
import { tangentAtPolyline } from '@ui/map/roads/roadGeometry';
import type { RoadPoint } from '@ui/map/roads/roadGeometry';
import { projectedPolylineHeading } from '@ui/map/roads/projectedHeading';
import { projectPolyline } from '@ui/map/roads/projectPolyline';

const points = Object.freeze(
  [
    { x: 0, y: 0 },
    { x: 16, y: 0 },
    { x: 16, y: 32 },
  ].map((point) => Object.freeze(point)),
);

const project = (point: RoadPoint) => ({ x: point.x, y: point.y - 0.5 * point.x });
function close(actual: RoadPoint | null, expected: RoadPoint) {
  expect(actual).not.toBeNull();
  expect(actual!.x).toBeCloseTo(expected.x, 12);
  expect(actual!.y).toBeCloseTo(expected.y, 12);
}

it('projects the actual first-leg tangent; canonical heading remains an independent negative control', () => {
  const angle = tangentAtPolyline(points, 0.2)!;
  // Actual old production helper, not a missing new API. The projected first
  // leg under scene={x,y-.5x} has this independently known direction.
  const expected = { x: 2 / Math.sqrt(5), y: -1 / Math.sqrt(5) };
  expect({ x: Math.cos(angle), y: Math.sin(angle) }).not.toEqual(expected);
  close(projectedPolylineHeading(points, 0.2, project), expected);
});

it('locates the correct SOURCE interval instead of redistributing progress by projected arclength', () => {
  const sampled = projectPolyline(points, project);
  const wrong = tangentAtPolyline(sampled.points, 0.35)!;
  expect(Math.sin(wrong)).toBeLessThan(0);
  close(projectedPolylineHeading(points, 0.35, project), { x: 0, y: 1 });
  const wrongReverse = tangentAtPolyline([...sampled.points].reverse(), 0.65)!;
  expect(Math.cos(wrongReverse)).toBeLessThan(-0.8);
  close(projectedPolylineHeading(points, 0.65, project, true), { x: 0, y: -1 });
});

it('reverses only after canonical sampling, retains travel-direction joint convention and reuses cached stations', () => {
  const callback = vi.fn(project);
  const before = JSON.stringify(points);
  close(projectedPolylineHeading(points, 1 / 3, callback), {
    x: 2 / Math.sqrt(5),
    y: -1 / Math.sqrt(5),
  });
  const calls = callback.mock.calls.length;
  for (const t of [0, 0.2, 0.35, 0.8, 1]) {
    projectedPolylineHeading(points, t, callback);
    projectedPolylineHeading(points, t, callback, true);
  }
  expect(callback).toHaveBeenCalledTimes(calls);
  close(projectedPolylineHeading(points, 2 / 3, callback, true), { x: 0, y: -1 });
  close(projectedPolylineHeading(points, 1, callback, true), {
    x: -2 / Math.sqrt(5),
    y: 1 / Math.sqrt(5),
  });
  expect(JSON.stringify(points)).toBe(before);
  const replacement = vi.fn((point: RoadPoint) => ({ ...point }));
  close(projectedPolylineHeading(points, 0.2, replacement), { x: 1, y: 0 });
  expect(replacement).toHaveBeenCalled();
});

it('handles finite clamping, empty/degenerate source legs and collapsed projected tangents without NaNs', () => {
  expect(projectedPolylineHeading([], 0, project)).toBeNull();
  expect(projectedPolylineHeading([{ x: 0, y: 0 }], 0, project)).toBeNull();
  expect(projectedPolylineHeading(points, NaN, project)).toBeNull();
  expect(
    projectedPolylineHeading(
      [
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ],
      0.5,
      project,
    ),
  ).toBeNull();
  expect(projectedPolylineHeading(points, 0.2, () => ({ x: 0, y: 0 }))).toBeNull();
  const duplicated = Object.freeze(
    [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 16, y: 0 },
      { x: 16, y: 0 },
    ].map((point) => Object.freeze(point)),
  );
  close(projectedPolylineHeading(duplicated, -1, project), {
    x: 2 / Math.sqrt(5),
    y: -1 / Math.sqrt(5),
  });
  close(projectedPolylineHeading(duplicated, 2, project), {
    x: 2 / Math.sqrt(5),
    y: -1 / Math.sqrt(5),
  });
  close(projectedPolylineHeading(duplicated, 0, project, true), {
    x: -2 / Math.sqrt(5),
    y: 1 / Math.sqrt(5),
  });
});
