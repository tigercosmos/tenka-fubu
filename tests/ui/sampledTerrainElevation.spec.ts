import { expect, it } from 'vitest';
import { createTerrainElevation } from '@ui/map/terrain/terrainElevation';
import { createSampledTerrainElevation } from '@ui/map/terrain/sampledTerrainElevation';
const mass = [
  { x: 0, y: 0 },
  { x: 1024, y: 0 },
  { x: 1024, y: 1024 },
  { x: 0, y: 1024 },
];
const base = () =>
  createTerrainElevation([
    {
      tier: 3,
      mass,
      ridges: [
        [
          { x: 400, y: 0 },
          { x: 700, y: 1024 },
        ],
      ],
    },
  ]);
it('uses exact rendered triangle barycentrics rather than analytic or bilinear heights', () => {
  const f = createSampledTerrainElevation(base(), { worldSize: 1024, cells: 16 }),
    h = f.vertexHeights,
    s = 17;
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++)
      for (const [u, v] of [
        [0.8, 0.2],
        [0.2, 0.8],
        [0.5, 0.5],
      ]) {
        const i = y * s + x,
          expected =
            v! <= u!
              ? h[i]! * (1 - u!) + h[i + 1]! * (u! - v!) + h[i + s + 1]! * v!
              : h[i]! * (1 - v!) + h[i + s + 1]! * u! + h[i + s]! * (v! - u!);
        const p = { x: (x + u!) * 64, y: (y + v!) * 64 };
        expect(f.sample(p)).toBeCloseTo(expected, 12);
        const q = f.unproject(f.project(p));
        expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeLessThan(2e-9);
      }
  expect(f.bounds.displacementLipschitz).toBeLessThan(1);
});
it('zeros every protected cell corner and proves EDT cap independently by brute distance', () => {
  const protectedCells = new Uint8Array(16 * 16);
  protectedCells[8 * 16 + 8] = 1;
  const f = createSampledTerrainElevation(base(), { worldSize: 1024, cells: 16, protectedCells }),
    h = f.vertexHeights,
    zeros: number[] = [];
  for (let y = 0; y <= 16; y++)
    for (let x = 0; x <= 16; x++)
      if (
        x === 0 ||
        y === 0 ||
        x === 16 ||
        y === 16 ||
        (x >= 8 && x <= 9 && y >= 8 && y <= 9) ||
        base().sample({ x: x * 64, y: y * 64 }) === 0
      )
        zeros.push(y * 17 + x);
  for (let y = 0; y <= 16; y++)
    for (let x = 0; x <= 16; x++) {
      const distance = Math.min(
        ...zeros.map((i) => Math.hypot(x - (i % 17), y - Math.floor(i / 17)) * 64),
      );
      expect(h[y * 17 + x]).toBeCloseTo(
        Math.min(base().sample({ x: x * 64, y: y * 64 }), (7 / 32) * distance),
        12,
      );
    }
  for (const p of [
    { x: 512, y: 512 },
    { x: 530, y: 550 },
    { x: 576, y: 576 },
  ])
    expect(f.sample(p)).toBe(0);
});
it('bounds inputs and does not retain mutable protection arrays', () => {
  expect(() => createSampledTerrainElevation(base(), { cells: 129 })).toThrow();
  expect(() => createSampledTerrainElevation(base(), { cells: 16, protectedCells: [] })).toThrow();
  const protectedCells = new Uint8Array(256),
    f = createSampledTerrainElevation(base(), { worldSize: 1024, cells: 16, protectedCells });
  const h = f.sample({ x: 512, y: 512 });
  protectedCells.fill(1);
  expect(f.sample({ x: 512, y: 512 })).toBe(h);
});
