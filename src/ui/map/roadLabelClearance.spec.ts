import { expect, it } from 'vitest';
import { roadLabelBaselineOffset, roadLabelOffsetClearsLine } from './roadLabelClearance';

it('clears the whole long top-center diagonal text box rather than just its anchor', () => {
  const normal = { x: -142 / Math.hypot(206, 142), y: -206 / Math.hypot(206, 142) };
  const bounds = { x: -37, y: 0, width: 74, height: 16.04 };
  const base = roadLabelBaselineOffset(bounds, normal, 12.5, 2.5);
  const corners = [bounds.x, bounds.x + bounds.width].flatMap((x) =>
    [bounds.y, bounds.y + bounds.height].map((y) => ({ x, y })),
  );
  for (const p of corners)
    expect((p.x + base.x) * normal.x + (p.y + base.y) * normal.y + 12.5).toBeGreaterThanOrEqual(
      6.5 - 1e-10,
    );
  expect(roadLabelOffsetClearsLine(base, { x: 0, y: 0 }, bounds, normal, 12.5, 2.5)).toBe(true);
  expect(roadLabelOffsetClearsLine(base, { x: 24, y: 24 }, bounds, normal, 12.5, 2.5)).toBe(false);
});

it('preserves already safe horizontal labels and scales only world clearance, not glyph bounds', () => {
  const bounds = { x: -20, y: 0, width: 40, height: 16 };
  for (const scale of [0.8, 1.25, 2]) {
    const normal = { x: 0, y: -1 };
    const base = roadLabelBaselineOffset(bounds, normal, 10 * scale, 2 * scale);
    expect(-base.y + 10 * scale - 16).toBeCloseTo(2 * scale + 4);
  }
  expect(roadLabelBaselineOffset(bounds, { x: 0, y: -1 }, 50, 2)).toEqual({ x: 0, y: 0 });
});

it('clears vertical, reversed and oblique tangent lines with asymmetric halo bounds', () => {
  const bounds = { x: -43, y: -2, width: 86, height: 21 };
  for (const normal of [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: -1 },
    { x: -0.6, y: -0.8 },
    { x: 0.6, y: -0.8 },
  ]) {
    const base = roadLabelBaselineOffset(bounds, normal, 8, 3);
    expect(roadLabelOffsetClearsLine(base, { x: 0, y: 0 }, bounds, normal, 8, 3)).toBe(true);
  }
});
