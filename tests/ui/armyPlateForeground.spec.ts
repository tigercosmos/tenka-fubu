import { describe, expect, it } from 'vitest';
import {
  layoutArmyPlates,
  type ArmyPlateCandidate,
  type PlateRect,
} from '../../src/ui/map/armyPlateLayout';

const plate = (id: string, x = 630, y = 365, priority = 3): ArmyPlateCandidate => ({
  id,
  priority,
  rect: { x, y, width: 32, height: 14 },
});
const moved = (r: PlateRect, d: { x: number; y: number }): PlateRect => ({
  ...r,
  x: r.x + d.x,
  y: r.y + d.y,
});
// Independent raw intersection oracle: no reserved-gap term enters either primary objective.
const area = (a: PlateRect, b: PlateRect): number =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
const total = (r: PlateRect, obstacles: readonly PlateRect[]) =>
  obstacles.reduce((sum, o) => sum + area(r, o), 0);

describe('mandatory troop plates around foreground models and flags', () => {
  it('moves a compact flagged cluster without hiding its mandatory numbers or moving anchors', () => {
    const c = plate('army.sunpu', 630, 365, 0);
    const foreground = [
      { x: 627, y: 350, width: 40, height: 35 },
      { x: 655, y: 345, width: 15, height: 28 },
    ];
    const before = structuredClone({ c, foreground });
    const result = layoutArmyPlates([c], [], [], foreground);
    const d = result.get(c.id)!;
    expect(total(c.rect, foreground)).toBeGreaterThan(0);
    expect(total(moved(c.rect, d), foreground)).toBe(0);
    expect(Math.hypot(d.x, d.y)).toBeLessThanOrEqual(48);
    expect([...result.keys()]).toEqual([c.id]);
    expect({ c, foreground }).toEqual(before);
  });
  it('never trades a castle-body improvement for a foreground-only priority reversal', () => {
    const c = plate('army.castle', 0, 0);
    const castle = [{ x: -30, y: 10, width: 60, height: 80 }];
    const actor = [{ x: -40, y: -30, width: 90, height: 35 }];
    const result = layoutArmyPlates([c], [], castle, actor).get(c.id)!;
    expect(total(moved(c.rect, result), castle)).toBeLessThanOrEqual(total(c.rect, castle));
    expect(total(moved(c.rect, result), castle)).toBe(0);
  });
  it('preserves exact two/three-argument controls when the foreground list is absent or empty', () => {
    const c = plate('army.legacy');
    const ribbon = [{ x: 590, y: 350, width: 120, height: 30 }];
    expect(layoutArmyPlates([c], ribbon).get(c.id)).toEqual({ x: 0, y: 19 });
    expect([...layoutArmyPlates([c], ribbon, [], [])]).toEqual([...layoutArmyPlates([c], ribbon)]);
    const body = [{ x: 615, y: 340, width: 50, height: 36 }];
    expect([...layoutArmyPlates([c], ribbon, body, [])]).toEqual([
      ...layoutArmyPlates([c], ribbon, body),
    ]);
  });
  it('is deterministic and baseline-monotone for bounded adversarial clusters', () => {
    // Local test-only integer generator; no production or core RNG is accessed.
    let state = 721;
    const next = () => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
      return state;
    };
    const rect = (): PlateRect => ({
      x: (next() % 180) - 90,
      y: (next() % 140) - 70,
      width: (next() % 90) + 1,
      height: (next() % 55) + 1,
    });
    for (let round = 0; round < 120; round++) {
      const cs = Array.from({ length: 5 }, (_, i) => ({
        id: `army.${i}`,
        priority: i % 4,
        rect: rect(),
      }));
      const ribbons = [rect(), rect()],
        castles = [rect(), rect()],
        actors = Array.from({ length: 8 }, rect);
      const original = structuredClone({ cs, ribbons, castles, actors });
      const result = layoutArmyPlates(cs, ribbons, castles, actors);
      expect([...result]).toEqual([
        ...layoutArmyPlates(
          [...cs].reverse(),
          [...ribbons].reverse(),
          [...castles].reverse(),
          [...actors].reverse(),
        ),
      ]);
      expect(result.size).toBe(cs.length);
      for (const c of cs) {
        const offset = result.get(c.id)!;
        const actual = moved(c.rect, offset);
        expect(Number.isFinite(offset.x) && Number.isFinite(offset.y)).toBe(true);
        expect(offset.x * offset.x + offset.y * offset.y).toBeLessThanOrEqual(48 * 48);
        const baselineCastle = total(c.rect, castles),
          actualCastle = total(actual, castles);
        expect(actualCastle).toBeLessThanOrEqual(baselineCastle);
        if (actualCastle === baselineCastle)
          expect(total(actual, actors)).toBeLessThanOrEqual(total(c.rect, actors));
      }
      expect({ cs, ribbons, castles, actors }).toEqual(original);
    }
  });
  it('returns every dense mandatory plate within the cap and rejects invalid foreground rectangles', () => {
    const cs = Array.from({ length: 8 }, (_, i) => plate(`army.${i}`, 0, 0, i % 4));
    const foreground = Array.from({ length: 40 }, (_, i) => ({
      x: -45 + (i % 5),
      y: -45 + (i % 7),
      width: 140,
      height: 100,
    }));
    const result = layoutArmyPlates(cs, [], [], foreground);
    expect(result.size).toBe(8);
    for (const d of result.values()) expect(d.x * d.x + d.y * d.y).toBeLessThanOrEqual(48 * 48);
    for (const bad of [
      { x: NaN, y: 0, width: 1, height: 1 },
      { x: 0, y: 0, width: Infinity, height: 1 },
      { x: 0, y: 0, width: 1, height: -1 },
    ]) {
      expect(() => layoutArmyPlates(cs, [], [], [bad])).toThrow('Invalid plate rectangle');
    }
    expect([...layoutArmyPlates([], [], [], [])]).toEqual([]);
  });
});
