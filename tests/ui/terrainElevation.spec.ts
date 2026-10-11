import { expect, it } from 'vitest';
import { createTerrainElevation } from '@ui/map/terrain/terrainElevation';

it('tapers at actual displayed coast, preserves projected land and the inverse', () => {
  const land = [
    [
      { x: 450, y: 450 },
      { x: 550, y: 450 },
      { x: 550, y: 550 },
      { x: 450, y: 550 },
    ],
  ];
  const e = createTerrainElevation(
    [
      {
        tier: 3,
        mass: [
          { x: 0, y: 0 },
          { x: 1000, y: 0 },
          { x: 1000, y: 1000 },
          { x: 0, y: 1000 },
        ],
        ridges: [],
      },
    ],
    land,
  );
  expect(e.sample({ x: 400, y: 500 })).toBe(0);
  expect(e.sample({ x: 450, y: 500 })).toBe(0);
  for (let x = 450; x <= 550; x += 0.5)
    for (let y = 450; y <= 550; y += 7) {
      const p = { x, y },
        q = e.project(p),
        d = Math.min(x - 450, 550 - x, y - 450, 550 - y);
      expect(e.sample(p)).toBeLessThanOrEqual((7 / 32) * d + 1e-12);
      expect(q.x).toBeGreaterThanOrEqual(450);
      expect(q.x).toBeLessThanOrEqual(550);
      expect(q.y).toBeGreaterThanOrEqual(450);
      expect(q.y).toBeLessThanOrEqual(550);
      const inverse = e.unproject(q);
      expect(Math.hypot(inverse.x - x, inverse.y - y)).toBeLessThan(2e-9);
    }
  expect(
    createTerrainElevation([{ tier: 3, mass, ridges: [] }], []).sample({ x: 500, y: 500 }),
  ).toBe(0);
  expect(() =>
    createTerrainElevation(
      [],
      Array.from({ length: 17 }, () => land[0]!),
    ),
  ).toThrow();
});

it('keeps concave notches and degenerate authored ridges continuous without filling outside land', () => {
  const mass = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 60, y: 100 },
    { x: 60, y: 40 },
    { x: 40, y: 40 },
    { x: 40, y: 100 },
    { x: 0, y: 100 },
  ];
  const e = createTerrainElevation([
    {
      tier: 3,
      mass,
      ridges: [
        [],
        [
          { x: 20, y: 20 },
          { x: 20, y: 20 },
        ],
      ],
    },
  ]);
  expect(e.sample({ x: 50, y: 80 })).toBe(0);
  expect(e.sample({ x: 40, y: 80 })).toBe(0);
  for (const epsilon of [1e-2, 1e-5, 1e-8]) {
    const p = { x: 40 - epsilon, y: 80 };
    expect(e.sample(p)).toBeLessThanOrEqual(e.bounds.heightLipschitz * epsilon + 1e-12);
    const q = e.unproject(e.project(p));
    expect(Math.hypot(q.x - p.x, q.y - p.y)).toBeLessThan(2e-9);
  }
});
const mass = [
  { x: 0, y: 0 },
  { x: 1000, y: 0 },
  { x: 1000, y: 1000 },
  { x: 0, y: 1000 },
];
it('has zero boundary/outside and positive bounded authored ridge relief', () => {
  const e = createTerrainElevation([
    {
      tier: 3,
      mass,
      ridges: [
        [
          { x: 500, y: 0 },
          { x: 500, y: 1000 },
        ],
      ],
    },
  ]);
  expect(e.sample({ x: 500, y: 500 })).toBeGreaterThan(19);
  for (const p of [
    { x: 0, y: 500 },
    { x: -1, y: 500 },
    { x: 1000, y: 500 },
  ])
    expect(e.sample(p)).toBe(0);
  expect(e.bounds.displacementLipschitz).toBeLessThan(1);
});
it('proves numerical bounds and inverse across overlap, concavity, narrow ridges and edges', () => {
  const e = createTerrainElevation([
    { tier: 3, mass, ridges: [[{ x: 500, y: 500 }]] },
    {
      tier: 2,
      mass: [
        { x: 400, y: -10 },
        { x: 402, y: -10 },
        { x: 402, y: 1010 },
        { x: 400, y: 1010 },
      ],
      ridges: [
        [
          { x: 401, y: 0 },
          { x: 401, y: 1000 },
        ],
      ],
    },
  ]);
  for (let x = -10; x <= 1010; x += 17)
    for (let y = -10; y <= 1010; y += 31) {
      const p = { x, y },
        q = { x: x + 0.0001, y: y + 0.0003 };
      expect(Math.abs(e.sample(p) - e.sample(q))).toBeLessThanOrEqual(
        e.bounds.heightLipschitz * Math.hypot(q.x - p.x, q.y - p.y) + 1e-10,
      );
      const result = e.unprojectWithDiagnostics(e.project(p));
      expect(Math.hypot(result.point.x - x, result.point.y - y)).toBeLessThan(2e-9);
      expect(result.iterations).toBeLessThanOrEqual(64);
    }
});
it('snapshots input and rejects unbounded/invalid queries and geometry', () => {
  const source = { tier: 1 as const, mass: mass.map((p) => ({ ...p })), ridges: [] };
  const e = createTerrainElevation([source]);
  const before = e.sample({ x: 500, y: 500 });
  source.mass[0]!.x = 500;
  expect(e.sample({ x: 500, y: 500 })).toBe(before);
  expect(() => e.sample({ x: NaN, y: 0 })).toThrow();
  expect(() =>
    createTerrainElevation([{ tier: 1, mass: [{ x: Infinity, y: 0 }, ...mass], ridges: [] }]),
  ).toThrow();
});
