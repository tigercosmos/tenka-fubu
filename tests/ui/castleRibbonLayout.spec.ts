import { describe, expect, it } from 'vitest';
import {
  layoutCastleRibbons,
  type CastleRibbonCandidate,
} from '../../src/ui/map/sceneParts/castleRibbonLayout';

const ribbon = (id = 'castle.a'): CastleRibbonCandidate => ({
  id,
  baseline: { x: 0, y: 0, width: 20, height: 10 },
  anchor: { x: 10, y: -8 },
});
const area = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

describe('bounded castle ribbon CSS placement', () => {
  it('does not trade a new hard-rectangle collision for ordinary clearance', () => {
    const input = ribbon();
    const hard = [
      { x: -100, y: -100, width: 100, height: 200 },
      { x: 20, y: -100, width: 100, height: 200 },
      { x: 0, y: -100, width: 20, height: 100 },
      { x: 0, y: 10, width: 20, height: 100 },
    ];
    const result = Reflect.apply(layoutCastleRibbons, undefined, [
      [input],
      [input.baseline],
      hard,
    ]).get(input.id)!;
    expect(result.offset).toEqual({ x: 0, y: 0 });
    hard.forEach((rect) => expect(area(result.rect, rect)).toBe(0));
  });
  it('keeps baseline eligible when every displaced leader crosses an anchor obstacle', () => {
    const input = { ...ribbon(), leaderObstacles: [{ x: 9, y: -9, width: 2, height: 2 }] };
    const result = layoutCastleRibbons([input], [input.baseline]).get(input.id)!;
    expect(result.offset).toEqual({ x: 0, y: 0 });
  });
  it('reports the actual nearest-point leader and permits boundary-only contact', () => {
    const input = { ...ribbon(), anchor: { x: 10, y: -40 } };
    const plain = layoutCastleRibbons([input], [input.baseline]).get(input.id)!;
    const end = {
      x: Math.max(plain.rect.x, Math.min(input.anchor.x, plain.rect.x + plain.rect.width)),
      y: Math.max(plain.rect.y, Math.min(input.anchor.y, plain.rect.y + plain.rect.height)),
    };
    expect(plain.leader).toEqual({ start: input.anchor, end, visible: true });
    const guarded = layoutCastleRibbons(
      [{ ...input, leaderObstacles: [{ x: 10, y: -41, width: 1, height: 1 }] }],
      [input.baseline],
    ).get(input.id)!;
    // The selected leader touches only the obstacle's lower-left corner.
    expect(guarded.offset).toEqual(plain.offset);
    expect(layoutCastleRibbons([input], []).get(input.id)!.leader.visible).toBe(false);
  });
  it('validates new guard inputs before returning any placements', () => {
    expect(() => layoutCastleRibbons([], [], [{ x: NaN, y: 0, width: 1, height: 1 }])).toThrow();
    expect(() =>
      layoutCastleRibbons(
        [],
        [],
        Array.from({ length: 1025 }, () => ribbon().baseline),
      ),
    ).toThrow();
    expect(() =>
      layoutCastleRibbons(
        [{ ...ribbon(), leaderObstacles: [{ x: 0, y: 0, width: 0, height: 1 }] }],
        [],
      ),
    ).toThrow();
    expect(() =>
      layoutCastleRibbons(
        [{ ...ribbon(), leaderObstacles: Array.from({ length: 1025 }, () => ribbon().baseline) }],
        [],
      ),
    ).toThrow();
  });
  it('retains an already clear baseline without changing inputs', () => {
    const input = ribbon();
    const original = structuredClone(input);
    const placement = layoutCastleRibbons([input], []).get(input.id)!;
    expect(placement.offset).toEqual({ x: 0, y: 0 });
    expect(placement.rect).toEqual(input.baseline);
    expect(placement.unresolved).toBe(false);
    expect(input).toEqual(original);
  });
  it('finds an interior diagonal escape, not only four aggregate directions', () => {
    const input = ribbon();
    const obstacles = [
      { x: -10, y: -10, width: 29, height: 19 },
      { x: 23, y: -10, width: 60, height: 22 },
      { x: -10, y: 13, width: 32, height: 50 },
      { x: -80, y: -50, width: 70, height: 150 },
      { x: -10, y: -60, width: 100, height: 50 },
    ];
    const result = layoutCastleRibbons([input], obstacles).get(input.id)!;
    expect(result.overlapArea).toBe(0);
    expect(result.offset.x).not.toBe(0);
    expect(result.offset.y).not.toBe(0);
    expect(Math.hypot(result.offset.x, result.offset.y)).toBeLessThanOrEqual(48);
    obstacles.forEach((obstacle) => expect(area(result.rect, obstacle)).toBe(0));
    expect(result.triedPlacements).toBeGreaterThan(4);
  });
  it('separates ribbons deterministically and gives selected priority over stable ids', () => {
    const a = ribbon('a'),
      b = { ...ribbon('b'), selected: true };
    const first = layoutCastleRibbons([a, b], []);
    const second = layoutCastleRibbons([b, a], []);
    expect([...first]).toEqual([...second]);
    expect([...first.keys()]).toEqual(['b', 'a']);
    expect(area(first.get('a')!.rect, first.get('b')!.rect)).toBe(0);
  });
  it('reports unavoidable collision without hiding, resizing, or exceeding the cap', () => {
    const input = ribbon();
    const result = layoutCastleRibbons(
      [input],
      [{ x: -100, y: -100, width: 200, height: 200 }],
    ).get(input.id)!;
    expect(result.unresolved).toBe(true);
    expect(result.overlapArea).toBe(200);
    expect(result.offset).toEqual({ x: 0, y: 0 });
    expect(result.rect.width).toBe(20);
    expect(result.rect.height).toBe(10);
  });
  it('rejects invalid, duplicate, and oversized requests without partial results', () => {
    expect(() => layoutCastleRibbons([ribbon(), ribbon()], [])).toThrow();
    expect(() => layoutCastleRibbons([{ ...ribbon(), anchor: { x: NaN, y: 0 } }], [])).toThrow();
    expect(() => layoutCastleRibbons([ribbon()], [{ x: 0, y: 0, width: -1, height: 1 }])).toThrow();
    expect(() =>
      layoutCastleRibbons(
        Array.from({ length: 257 }, (_, index) => ribbon(String(index))),
        [],
      ),
    ).toThrow();
  });
  it('reports final sibling overlap rather than a reservation already vacated', () => {
    const inputs = [ribbon('a'), ribbon('b'), ribbon('c')];
    const results = layoutCastleRibbons(inputs, []);
    for (const input of inputs) {
      const result = results.get(input.id)!;
      const others = inputs
        .filter((other) => other.id !== input.id)
        .map((other) => results.get(other.id)!.rect);
      expect(result.overlapArea).toBe(
        others.reduce((sum, other) => sum + area(result.rect, other), 0),
      );
      expect(result.baselineOverlapArea).toBe(
        others.reduce((sum, other) => sum + area(input.baseline, other), 0),
      );
      expect(result.unresolved).toBe(result.overlapArea > 0);
    }
  });
  it('keeps every ribbon with explicit bounded-work fallback at maximum admitted counts', () => {
    const inputs = Array.from({ length: 256 }, (_, index) => ribbon(String(index)));
    const obstacles = Array.from({ length: 1024 }, () => ({
      x: -100,
      y: -100,
      width: 200,
      height: 200,
    }));
    const results = layoutCastleRibbons(inputs, obstacles);
    expect(results.size).toBe(256);
    expect([...results.values()].some((result) => result.budgetLimited)).toBe(true);
    for (const result of results.values()) {
      expect(Math.hypot(result.offset.x, result.offset.y)).toBeLessThanOrEqual(48);
      expect(result.triedPlacements).toBeGreaterThanOrEqual(1);
      expect(result.triedPlacements).toBeLessThanOrEqual(257);
      expect(result.unresolved).toBe(true);
    }
  });
});
