import { describe, expect, it } from 'vitest';
import {
  layoutArmySignals,
  ARMY_SIGNAL_LAYOUT,
  type ArmySignalCandidate,
  type SignalRect,
} from '@ui/map/armySignalLayout';
const overlap = (a: SignalRect, b: SignalRect) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
const moved = (c: ArmySignalCandidate, offsets: Map<string, { x: number; y: number }>) => ({
  ...c.rect,
  x: c.rect.x + offsets.get(c.id)!.x,
  y: c.rect.y + offsets.get(c.id)!.y,
});
const pairs = (rects: readonly SignalRect[]) =>
  rects.reduce((sum, a, i) => sum + rects.slice(i + 1).reduce((s, b) => s + overlap(a, b), 0), 0);
const candidate = (id: string, x: number, y: number, priority = 3): ArmySignalCandidate => ({
  id,
  priority,
  rect: { x, y, width: 12, height: 24 },
});
function invariants(candidates: ArmySignalCandidate[], fixed: SignalRect[]) {
  const before = JSON.stringify({ candidates, fixed }),
    output = layoutArmySignals(candidates, fixed);
  expect(output.size).toBe(candidates.length);
  for (const c of candidates) {
    const offset = output.get(c.id)!;
    expect(Math.hypot(offset.x, offset.y)).toBeLessThanOrEqual(24);
    for (const obstacle of fixed)
      expect(overlap(moved(c, output), obstacle)).toBeLessThanOrEqual(
        overlap(c.rect, obstacle) + 1e-8,
      );
  }
  expect(pairs(candidates.map((c) => moved(c, output)))).toBeLessThanOrEqual(
    pairs(candidates.map((c) => c.rect)) + 1e-8,
  );
  expect(JSON.stringify({ candidates, fixed })).toBe(before);
  return output;
}
describe('bounded painted army banner layout', () => {
  it('clears the copied old-native Sunpu banner cluster without paying for new fixed-object collisions', () => {
    // Original raw 20261010 native report, Sunpu1: whole-signal bounds included heading.
    // This is a retained projected-rectangle oracle, not proof of the new producer or pixels.
    const candidates: ArmySignalCandidate[] = [
      {
        id: 'army.000001',
        priority: 3,
        rect: { x: 638.0972148268079, y: 324.375, width: 28.103610387916675, height: 36.875 },
      },
      {
        id: 'army.000007',
        priority: 3,
        rect: { x: 656.8472148268079, y: 309.375, width: 21.7777851731919, height: 36.875 },
      },
      {
        id: 'army.000011',
        priority: 3,
        rect: {
          x: 664.64443785608,
          y: 300.40368627109365,
          width: 30.826875872825905,
          height: 35.846313728906054,
        },
      },
    ];
    const fixed: SignalRect[] = [
      { x: 637.61593204775, y: 323.7821395775936, width: 32.30027548209366, height: 35 },
      { x: 656.36593204775, y: 308.7821395775936, width: 32.30027548209366, height: 35 },
      { x: 668.86593204775, y: 298.7821395775936, width: 32.30027548209366, height: 35 },
      { x: 615, y: 328.64951768488754, width: 50, height: 42.765273311897104 },
      { x: 586.3380001831056, y: 390, width: 107.32399963378906, height: 20 },
    ];
    expect(pairs(candidates.map((c) => c.rect))).toBeCloseTo(598.8199347374202, 8);
    const output = invariants(candidates, fixed);
    expect(pairs(candidates.map((c) => moved(c, output)))).toBe(0);
  });
  it('caps exact overlap work without recording a million mock calls or hiding remaining banners', () => {
    const original = Math.min;
    let calls = 0;
    Math.min = (...values: number[]) => {
      calls++;
      return original(...values);
    };
    try {
      const dense = Array.from({ length: 256 }, (_, i) => candidate(`army.${i}`, 0, 0));
      const fixed = Array.from({ length: 1024 }, () => ({
        x: -100,
        y: -100,
        width: 200,
        height: 200,
      }));
      const output = layoutArmySignals(dense, fixed);
      expect(output.size).toBe(256);
      // Exact AABB predicate uses two Math.min calls; budget is checked before it.
      expect(calls).toBeLessThanOrEqual(2 * ARMY_SIGNAL_LAYOUT.overlapWork);
      expect(calls).toBeGreaterThan(0);
    } finally {
      Math.min = original;
    }
  });
  it('staggered dense banners reduce collisions while all fixed actor objects remain protected', () => {
    const candidates = [
      candidate('army.selected', 630, 365, 0),
      candidate('army.critical', 634, 363, 1),
      candidate('army.normal', 628, 361),
    ];
    const fixed = [
      { x: 615, y: 393, width: 40, height: 25 },
      { x: 638, y: 390, width: 26, height: 28 },
      { x: 602, y: 335, width: 20, height: 20 },
    ];
    const output = invariants(candidates, fixed);
    expect(pairs(candidates.map((c) => moved(c, output)))).toBeLessThan(
      pairs(candidates.map((c) => c.rect)),
    );
  });
  it('keeps an isolated banner at zero even when it already overlaps its own soldier frame', () => {
    expect([
      ...layoutArmySignals([candidate('army.one', 0, 0)], [{ x: 0, y: 10, width: 26, height: 28 }]),
    ]).toEqual([['army.one', { x: 0, y: 0 }]]);
    expect(layoutArmySignals([], []).size).toBe(0);
  });
  it('does not trade a new castle collision for a larger soldier-overlap improvement', () => {
    const candidates = [candidate('army.a', 0, 0), candidate('army.b', 4, 0)];
    const fixed = [
      { x: -30, y: -30, width: 30, height: 80 },
      { x: 15, y: -30, width: 40, height: 80 },
      { x: -30, y: -30, width: 85, height: 30 },
    ];
    const output = invariants(candidates, fixed);
    for (const c of candidates)
      for (const obstacle of fixed)
        expect(overlap(moved(c, output), obstacle)).toBeLessThanOrEqual(overlap(c.rect, obstacle));
  });
  it('is permutation-stable, ASCII-tied and globally translation-invariant', () => {
    const candidates = [
      candidate('army.z', 10, 12, 1),
      candidate('army.A', 12, 10, 1),
      candidate('army.a', 8, 11, 0),
    ];
    const fixed = [
      { x: 40, y: 0, width: 30, height: 50 },
      { x: 0, y: 40, width: 50, height: 30 },
    ];
    const a = invariants(candidates, fixed),
      b = layoutArmySignals([...candidates].reverse(), [...fixed].reverse());
    expect([...a]).toEqual([...b]);
    const dx = 1000,
      dy = -200;
    expect([
      ...layoutArmySignals(
        candidates.map((c) => ({ ...c, rect: { ...c.rect, x: c.rect.x + dx, y: c.rect.y + dy } })),
        fixed.map((r) => ({ ...r, x: r.x + dx, y: r.y + dy })),
      ),
    ]).toEqual([...a]);
    expect([...a.keys()]).toEqual(['army.a', 'army.A', 'army.z']);
  });
  it('preserves future-baseline peer costs and deterministic residual collisions in bounded adversarial clusters', () => {
    let seed = 73;
    const next = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let trial = 0; trial < 30; trial++) {
      const candidates = Array.from({ length: 8 }, (_, i) =>
        candidate(`army.${i}`, Math.floor(next() * 60), Math.floor(next() * 50), i % 4),
      );
      const fixed = Array.from({ length: 5 }, () => ({
        x: Math.floor(next() * 80) - 10,
        y: Math.floor(next() * 80) - 10,
        width: 8 + Math.floor(next() * 30),
        height: 8 + Math.floor(next() * 30),
      }));
      invariants(candidates, fixed);
    }
    const dense = Array.from({ length: 256 }, (_, i) => candidate(`army.${i}`, 0, 0));
    const fixed = Array.from({ length: 1024 }, () => ({
      x: -100,
      y: -100,
      width: 200,
      height: 200,
    }));
    const a = invariants(dense, fixed);
    expect([...layoutArmySignals(dense, fixed)]).toEqual([...a]);
    expect(pairs(dense.map((c) => moved(c, a)))).toBeGreaterThan(0);
  });
  it('rejects duplicate IDs, invalid coordinates and over-limit inputs without mutation', () => {
    const c = candidate('army.one', 0, 0);
    expect(() => layoutArmySignals([c, c], [])).toThrow(RangeError);
    for (const value of [NaN, Infinity, -Infinity]) {
      expect(() => layoutArmySignals([{ ...c, rect: { ...c.rect, x: value } }], [])).toThrow(
        RangeError,
      );
      expect(() => layoutArmySignals([{ ...c, priority: value }], [])).toThrow(RangeError);
    }
    expect(() => layoutArmySignals([c], [{ x: 0, y: 0, width: -1, height: 4 }])).toThrow(
      RangeError,
    );
    expect(() =>
      layoutArmySignals([{ ...c, rect: { x: 0, y: 0, width: 1e154, height: 1e154 } }], []),
    ).toThrow(RangeError);
    expect(() =>
      layoutArmySignals(
        Array.from({ length: ARMY_SIGNAL_LAYOUT.candidates + 1 }, (_, i) =>
          candidate(String(i), 0, 0),
        ),
        [],
      ),
    ).toThrow(RangeError);
    expect(() =>
      layoutArmySignals(
        [],
        Array.from({ length: ARMY_SIGNAL_LAYOUT.obstacles + 1 }, () => c.rect),
      ),
    ).toThrow(RangeError);
  });
});
