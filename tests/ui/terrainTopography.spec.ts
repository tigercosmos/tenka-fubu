import { expect, it } from 'vitest';
import { createTerrainTopography } from '@ui/map/terrain/terrainTopography';
import { createTerrainElevation, type ElevationMountain } from '@ui/map/terrain/terrainElevation';
import { createSampledTerrainElevation } from '@ui/map/terrain/sampledTerrainElevation';
import { buildTerrainPack } from '@ui/map/terrain/terrainPack';
const square = (a: number, b: number) => [
  { x: a, y: a },
  { x: b, y: a },
  { x: b, y: b },
  { x: a, y: b },
];
const mountain = (tier: 1 | 2 | 3 = 3): ElevationMountain => ({
  tier,
  mass: square(-1, 1),
  ridges: [
    [
      { x: 0, y: 0 },
      { x: 0, y: 200 },
    ],
  ],
});
it('uses the accepted sharp face and C1 quadratic toe outside authored mass', () => {
  for (const [tier, peak] of [
    [1, 20],
    [2, 40],
    [3, 64],
  ] as const) {
    const field = createTerrainTopography([mountain(tier)]),
      join = (0.8 * peak) / 0.4,
      radius = (1.2 * peak) / 0.4;
    expect(field.sample({ x: 0, y: 100 })).toBe(peak);
    expect(field.sample({ x: peak / (2 * 0.4), y: 100 })).toBeCloseTo(peak / 2, 12);
    expect(field.sample({ x: join, y: 100 })).toBeCloseTo(0.2 * peak, 12);
    expect(field.sample({ x: (join + radius) / 2, y: 100 })).toBeCloseTo(0.05 * peak, 12);
    expect(field.sample({ x: radius, y: 100 })).toBe(0);
    expect(field.sample({ x: radius + 1, y: 100 })).toBe(0);
  }
});
it('preserves global gradient and inverse bounds across max-union creases and narrow masses', () => {
  const f = createTerrainTopography([
    mountain(),
    {
      ...mountain(2),
      ridges: [
        [
          { x: 80, y: 0 },
          { x: 80, y: 200 },
        ],
      ],
    },
  ]);
  for (let x = -180; x < 200; x += 3)
    for (let y = -30; y < 230; y += 13) {
      const p = { x, y },
        q = { x: x + 0.1, y: y + 0.07 };
      expect(Math.abs(f.sample(p) - f.sample(q))).toBeLessThanOrEqual(
        0.4 * Math.hypot(0.1, 0.07) + 1e-12,
      );
      const inverse = f.unprojectWithDiagnostics(f.project(p));
      expect(Math.hypot(inverse.point.x - x, inverse.point.y - y)).toBeLessThan(2e-9);
      expect(inverse.iterations).toBeLessThanOrEqual(64);
    }
});
it('retains exact land-zero and distance cap including concave boundaries', () => {
  const f = createTerrainTopography([mountain()], [square(-50, 250)]);
  for (const p of [
    { x: -50, y: 10 },
    { x: -51, y: 10 },
    { x: 300, y: 100 },
  ])
    expect(f.sample(p)).toBe(0);
  expect(f.sample({ x: -49, y: 100 })).toBeCloseTo(0.4, 12);
  const p = { x: -49, y: 100 },
    scene = f.project(p);
  expect(scene.x).toBeGreaterThan(-50);
  expect(scene.y).toBeGreaterThan(-50);
});
it('snapshots canonical input without inventing a center for ridge-less mountains', () => {
  const m = { tier: 3 as const, mass: square(-1, 1), ridges: [[{ x: 0, y: 0 }]] },
    land = [square(-500, 500)],
    before = JSON.stringify({ m, land });
  const f = createTerrainTopography([m], land);
  expect(JSON.stringify({ m, land })).toBe(before);
  m.ridges[0]![0]!.x = 100;
  land[0]![0]!.x = 400;
  expect(f.sample({ x: 0, y: 0 })).toBe(64);
  expect(createTerrainTopography([{ ...mountain(), ridges: [] }]).sample({ x: 0, y: 0 })).toBe(0);
});
it('fails closed on inherited tiers, oversized structures and invalid coordinates', () => {
  for (const tier of ['constructor', 'toString', '__proto__', 0, 4])
    expect(() => createTerrainTopography([{ ...mountain(), tier: tier as 1 }])).toThrow(RangeError);
  expect(() => createTerrainTopography(Array(65).fill(mountain()))).toThrow(RangeError);
  expect(() => createTerrainTopography([{ ...mountain(), ridges: Array(129).fill([]) }])).toThrow(
    RangeError,
  );
  expect(() =>
    createTerrainTopography([{ ...mountain(), ridges: [[{ x: 1e308, y: 0 }]] }]),
  ).toThrow(RangeError);
  expect(() => createTerrainTopography([mountain()], Array(17).fill(square(-10, 10)))).toThrow(
    RangeError,
  );
});
it('is structurally compatible with the exact sampled rendered field and keeps protected cells flat', () => {
  const protectedCells = new Uint8Array(16);
  protectedCells[5] = 1;
  const f = createSampledTerrainElevation(createTerrainTopography([mountain()]), {
    worldSize: 200,
    cells: 4,
    protectedCells,
  });
  for (const p of [
    { x: 50, y: 50 },
    { x: 100, y: 50 },
    { x: 50, y: 100 },
    { x: 100, y: 100 },
    { x: 75, y: 75 },
  ])
    expect(f.sample(p)).toBe(0);
});
it('produces materially nonvacuous national ridge bands before protection without changing terrain input', () => {
  const mountains = buildTerrainPack().mountains ?? [],
    before = JSON.stringify(mountains);
  const old = createSampledTerrainElevation(createTerrainElevation(mountains));
  const current = createSampledTerrainElevation(createTerrainTopography(mountains));
  const positive = (a: readonly number[]) => a.filter((h) => h > 1e-6).length;
  expect(positive(current.vertexHeights)).toBeGreaterThan(positive(old.vertexHeights));
  expect(Math.max(...current.vertexHeights)).toBeGreaterThan(15);
  expect(Math.max(...current.vertexHeights)).toBeLessThanOrEqual(64);
  expect(JSON.stringify(mountains)).toBe(before);
  console.log(
    'national-unprotected',
    JSON.stringify({
      oldPositive: positive(old.vertexHeights),
      newPositive: positive(current.vertexHeights),
      maximum: Math.max(...current.vertexHeights),
    }),
  );
});
