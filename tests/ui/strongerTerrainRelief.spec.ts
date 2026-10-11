import { expect, it } from 'vitest';
import { Texture } from 'pixi.js';
import { createTerrainTopography } from '@ui/map/terrain/terrainTopography';
import { createSampledTerrainElevation } from '@ui/map/terrain/sampledTerrainElevation';
import { createProjectedTerrainOverlay } from '@ui/map/terrain/terrainProjectedOverlay';
import { buildTerrainElevatedSurfaceBuffers } from '@ui/map/terrain/terrainElevatedSurface';

it('admits the stronger contract without increasing inverse iterations or geometry allocation', () => {
  const source = [
    {
      tier: 3 as const,
      mass: [
        { x: 0, y: 0 },
        { x: 4096, y: 0 },
        { x: 4096, y: 4096 },
      ],
      ridges: [
        [
          { x: 2048, y: 0 },
          { x: 2048, y: 4096 },
        ],
      ],
    },
  ];
  const before = JSON.stringify(source),
    protectedCells = new Uint8Array(128 * 128);
  protectedCells[64 * 128 + 64] = 1;
  const field = createSampledTerrainElevation(createTerrainTopography(source), { protectedCells });
  expect(Math.max(...field.vertexHeights)).toBe(64);
  expect(field.bounds.displacementLipschitz).toBeLessThan(1);
  for (const p of [
    { x: 2048, y: 2048 },
    { x: 2080, y: 2080 },
    { x: 2064, y: 2064 },
  ])
    expect(field.sample(p)).toBe(0);
  let maxIterations = 0,
    maxError = 0;
  for (let y = 0; y <= 4096; y += 57)
    for (let x = 0; x <= 4096; x += 61) {
      const p = { x, y },
        result = field.unprojectWithDiagnostics(field.project(p));
      maxIterations = Math.max(maxIterations, result.iterations);
      maxError = Math.max(maxError, Math.hypot(result.point.x - x, result.point.y - y));
      expect(result.iterations).toBeLessThanOrEqual(64);
      expect(Math.hypot(result.point.x - x, result.point.y - y)).toBeLessThan(2e-9);
    }
  const buffers = buildTerrainElevatedSurfaceBuffers(field);
  expect(buffers).not.toBeNull();
  const overlay = createProjectedTerrainOverlay(Texture.EMPTY, field);
  try {
    const positions = overlay.mesh.geometry.positions,
      indices = overlay.mesh.geometry.indices;
    for (let i = 0; i < indices.length; i += 3) {
      const a = indices[i]! * 2,
        b = indices[i + 1]! * 2,
        c = indices[i + 2]! * 2;
      expect(
        (positions[b]! - positions[a]!) * (positions[c + 1]! - positions[a + 1]!) -
          (positions[b + 1]! - positions[a + 1]!) * (positions[c]! - positions[a]!),
      ).toBeGreaterThan(0);
    }
    console.info(
      'stronger-relief-inverse',
      JSON.stringify({
        maxIterations,
        maxError,
        maximum: Math.max(...field.vertexHeights),
        overlay: overlay.getDiagnostics(),
      }),
    );
  } finally {
    overlay.destroy();
  }
  expect(JSON.stringify(source)).toBe(before);
});

it('rejects heights and slopes above the new admission, retaining legacy sampling compatibility', () => {
  expect(() =>
    createSampledTerrainElevation({
      sample: () => 65,
      bounds: { heightLipschitz: 0.4, maximumHeight: 64 },
    }),
  ).toThrow('invalid base height');
  expect(() =>
    createSampledTerrainElevation({
      sample: () => 64,
      bounds: { heightLipschitz: 0.40001, maximumHeight: 64 },
    }),
  ).toThrow('invalid base Lipschitz');
  expect(() =>
    createSampledTerrainElevation({
      sample: () => 21,
      bounds: { heightLipschitz: 7 / 32, maximumHeight: 20 },
    }),
  ).toThrow('invalid base height');
  expect(
    createSampledTerrainElevation({
      sample: () => 20,
      bounds: { heightLipschitz: 7 / 32, maximumHeight: 20 },
    }).bounds.maximumHeight,
  ).toBe(20);
  for (const maximumHeight of [NaN, -1, 65])
    expect(() =>
      createSampledTerrainElevation({
        sample: () => 0,
        bounds: { heightLipschitz: 0.4, maximumHeight },
      }),
    ).toThrow('invalid base height bound');
  expect(() =>
    createProjectedTerrainOverlay(Texture.EMPTY, {
      vertexHeights: [0, 0, 0, 65],
      bounds: { cells: 1, worldSize: 64, displacementLipschitz: 0.5 },
      project: (p) => p,
    }),
  ).toThrow('invalid projected overlay height');
});
