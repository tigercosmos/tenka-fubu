import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  layoutCastleRibbons,
  type CastleRibbonCandidate,
  type RibbonRect,
} from '../../src/ui/map/sceneParts/castleRibbonLayout';
import { layoutCastleRibbons as reference } from '../helpers/castleRibbonZeroObjectiveReference';

type Scene = {
  candidates: CastleRibbonCandidate[];
  obstacles: RibbonRect[];
  hard: RibbonRect[];
};
const rect = (x: number, y: number, width = 20, height = 12): RibbonRect => ({
  x,
  y,
  width,
  height,
});
const ribbon = (id: string, baseline: RibbonRect): CastleRibbonCandidate => ({
  id,
  baseline,
  anchor: { x: baseline.x + baseline.width / 2, y: baseline.y - 20 },
});
function compare(scene: Scene) {
  const before = structuredClone(scene);
  const execute = (fn: typeof layoutCastleRibbons) => {
    const work: number[] = [];
    const entries = [
      ...fn(scene.candidates, scene.obstacles, scene.hard, {
        onWork: (value) => work.push(value),
      }),
    ];
    expect(scene).toStrictEqual(before);
    return { entries, work };
  };
  const expected = execute(reference);
  const actual = execute(layoutCastleRibbons);
  // Full map order, every geometry/leader/diagnostic field and callback bytes are exact.
  expect(actual).toStrictEqual(expected);
  expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
  return actual;
}
function randomScene(seed: number): Scene {
  let value = seed;
  const random = () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
  const obstacle = () =>
    rect(random() * 500 - 250, random() * 200 - 100, 4 + random() * 90, 4 + random() * 45);
  const candidates = Array.from({ length: 1 + (seed % 12) }, (_, i) => ({
    ...ribbon(`castle.${i}`, obstacle()),
    selected: i === 0 && seed % 3 === 0,
    critical: i % 3 === seed % 3,
    target: i % 4 === seed % 4,
    leaderObstacles: Array.from({ length: seed % 5 }, obstacle),
  }));
  return {
    candidates,
    obstacles: Array.from({ length: seed % 37 }, obstacle),
    hard: Array.from({ length: seed % 9 }, obstacle),
  };
}

describe('castle ribbon zero-objective exact parity', () => {
  it('pins the independent complete pre-optimization producer', () => {
    const source = readFileSync(
      new URL('../helpers/castleRibbonZeroObjectiveReference.ts', import.meta.url),
    );
    const body = source.subarray(source.indexOf('export interface RibbonRect'));
    expect(createHash('sha256').update(body).digest('hex')).toBe(
      '2c5e8d577598f1204cdcd67dfc0473e29be15ca4f4a3a613c24aa8287c6559ad',
    );
  });

  it('keeps all proposal accounting when a zero baseline faces future collisions and leader guards', () => {
    const candidate = ribbon('castle.free', rect(0, 0, 10, 10));
    candidate.leaderObstacles = [rect(2, -12, 4, 4)];
    const actual = compare({
      candidates: [candidate],
      obstacles: [rect(14, 0, 10, 10), rect(-30, 0, 5, 10)],
      hard: [rect(-20, 0, 10, 10)],
    });
    expect(actual.entries[0]![1].offset).toStrictEqual({ x: 0, y: 0 });
    expect(actual.entries[0]![1].triedPlacements).toBeGreaterThan(100);
    expect(actual.work[0]).toBeGreaterThan(0);
  });

  it('still searches when padding or hard area improves despite zero ordinary overlap', () => {
    for (const scene of [
      {
        candidates: [ribbon('castle.padded', rect(0, 0, 10, 10))],
        obstacles: [rect(12, 0, 10, 10)],
        hard: [],
      },
      {
        candidates: [ribbon('castle.hard', rect(0, 0, 10, 10))],
        obstacles: [],
        hard: [rect(9, 0, 2, 10)],
      },
    ]) {
      const actual = compare(scene);
      expect(actual.entries[0]![1].offset).not.toStrictEqual({ x: 0, y: 0 });
    }
  });

  it('preserves zero-charge tries after earlier candidates exhaust their shared work budget', () => {
    const candidates = Array.from({ length: 40 }, (_, i) =>
      ribbon(`castle.${String(i).padStart(2, '0')}`, rect(20, 20, 12, 12)),
    );
    candidates.push(ribbon('zz.free', rect(10000, 10000)));
    const fixed = Array.from({ length: 1024 }, () => rect(-10, -10, 80, 80));
    const actual = compare({ candidates, obstacles: fixed, hard: fixed });
    expect(actual.entries.some(([, value]) => value.budgetLimited)).toBe(true);
    const free = actual.entries.find(([id]) => id === 'zz.free')![1];
    expect(free.triedPlacements).toBeGreaterThan(100);
    expect(free.budgetLimited).toBe(false);
    expect(free.offset).toStrictEqual({ x: 0, y: 0 });
  });

  it('matches exact signed-zero, fractional gap contacts, edge-axis and admitted coordinate boundaries', () => {
    for (const origin of [-0, 0, 0.1, 1e-9, 999999900.125, -999999900.125]) {
      for (const epsilon of [-Number.EPSILON * 32, 0, Number.EPSILON * 32]) {
        compare({
          candidates: [
            ribbon('castle.A', rect(origin, origin, 10, 10)),
            ribbon('castle.a', rect(origin + 80, origin + 80, 12.125, 8.5)),
          ],
          obstacles: [
            rect(origin + 14 + epsilon, origin, 10, 10),
            rect(origin - 48, origin + 70, 12, 12),
          ],
          hard: [rect(origin - 20, origin + 20, 10, 10)],
        });
      }
    }
    expect(
      compare({ candidates: [ribbon('castle.zero', rect(-0, -0))], obstacles: [], hard: [] }).work,
    ).toStrictEqual([0]);
  });

  it('matches every returned field for seeded mixed scenes and reversed input permutations', () => {
    for (let seed = 1; seed <= 120; seed++) {
      const scene = randomScene(seed);
      compare(scene);
      compare({
        candidates: [...scene.candidates].reverse(),
        obstacles: [...scene.obstacles].reverse(),
        hard: [...scene.hard].reverse(),
      });
    }
  });
});
