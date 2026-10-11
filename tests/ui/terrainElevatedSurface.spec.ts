import { expect, it, vi } from 'vitest';
import { DOMAdapter, Texture } from 'pixi.js';
import { createTerrainElevation } from '@ui/map/terrain/terrainElevation';
import { createSampledTerrainElevation } from '@ui/map/terrain/sampledTerrainElevation';
import {
  buildTerrainElevatedSurfaceBuffers,
  createTerrainElevatedSurface,
} from '@ui/map/terrain/terrainElevatedSurface';
const mountain = {
  tier: 3 as const,
  mass: [
    { x: 100, y: 100 },
    { x: 900, y: 100 },
    { x: 900, y: 900 },
    { x: 100, y: 900 },
  ],
  ridges: [
    [
      { x: 500, y: 200 },
      { x: 500, y: 800 },
    ],
  ],
};
it('builds one bounded continuous global field using actual shared projection and UV registration', () => {
  const field = createSampledTerrainElevation(createTerrainElevation([mountain]));
  const before = structuredClone(mountain);
  const data = buildTerrainElevatedSurfaceBuffers(field);
  expect(data.bytes).toBe(1966080);
  expect(data.indices.length).toBe(128 * 128 * 6);
  expect(data.sourceSampleCount).toBe(129 * 129);
  expect(data.queryCount).toBe(5 * 129 * 129);
  let lifted = 0;
  for (let row = 0; row < 128; row++)
    for (let col = 0; col < 128; col++) {
      const x = col * 32,
        y = row * 32,
        offset = (row * 128 + col) * 24;
      for (const [corner, [px, py]] of [
        [x, y],
        [x + 32, y],
        [x + 32, y + 32],
        [x, y + 32],
      ].entries()) {
        const p = field.project({ x: px!, y: py! }),
          o = offset + corner * 6;
        expect(data.vertices[o]).toBe(Math.fround(p.x));
        expect(data.vertices[o + 1]).toBe(Math.fround(p.y));
        if (p.y < py!) lifted++;
        expect(data.vertices[o + 2]).toBe(Math.fround(px! / 256 - Math.floor((x + 16) / 256)));
        expect(data.vertices[o + 3]).toBe(Math.fround(py! / 256 - Math.floor((y + 16) / 256)));
      }
    }
  expect(lifted).toBeGreaterThan(0);
  expect(mountain).toEqual(before);
});
it('duplicates tile seam UV endpoints without a seam in scene positions', () => {
  const d = buildTerrainElevatedSurfaceBuffers(createTerrainElevation([]), {
    worldSize: 512,
    cells: 8,
  });
  const left = 3 * 24 + 6,
    right = 4 * 24;
  expect(d.vertices[left]).toBe(d.vertices[right]);
  expect(d.vertices[left + 1]).toBe(d.vertices[right + 1]);
  expect(d.vertices[left + 2]).toBe(1);
  expect(d.vertices[right + 2]).toBe(0);
  expect(d.vertices[left + 4]).toBe(1);
});
it('owns only geometry, two buffers and private shader/program; tears down once retaining shared texture', () => {
  // CPU ownership test only: no GL context/compiler is claimed by this adapter.
  const adapter = DOMAdapter.get();
  DOMAdapter.set({
    ...adapter,
    createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement,
  });
  const field = createTerrainElevation([mountain]);
  const style = Texture.WHITE.source.style;
  const a = createTerrainElevatedSurface(Texture.WHITE, field, { worldSize: 512, cells: 8 });
  const b = createTerrainElevatedSurface(Texture.WHITE, field, { worldSize: 512, cells: 8 });
  const program = a.shader.glProgram,
    other = b.shader.glProgram;
  expect(program._key).not.toBe(other._key);
  expect(program.vertex).toContain('uWorldTransformMatrix');
  expect(program.vertex).toContain('uTransformMatrix');
  expect(program.fragment).toContain('.28*tex.rgb');
  expect(a.mesh.texture).toBe(Texture.WHITE);
  expect(a.geometry.buffers.length).toBe(2);
  const destroyGeometry = vi.spyOn(a.geometry, 'destroy'),
    destroyShader = vi.spyOn(a.shader, 'destroy');
  const attribute = a.geometry.getBuffer('aPosition'),
    index = a.geometry.indexBuffer;
  const da = vi.spyOn(attribute, 'destroy'),
    di = vi.spyOn(index, 'destroy');
  a.destroy();
  a.destroy();
  expect(destroyGeometry).toHaveBeenCalledTimes(1);
  expect(destroyShader).toHaveBeenCalledTimes(1);
  expect(da).toHaveBeenCalledTimes(1);
  expect(di).toHaveBeenCalledTimes(1);
  expect(a.getDiagnostics().bufferBytes).toBe(0);
  expect(a.getDiagnostics().ownedPrograms).toBe(0);
  expect(Texture.WHITE.destroyed).toBe(false);
  expect(Texture.WHITE.source.style).toBe(style);
  b.destroy();
  DOMAdapter.set(adapter);
});
it('rejects invalid oversized grids and forests before any resource construction', () => {
  const field = createTerrainElevation([]);
  expect(() => buildTerrainElevatedSurfaceBuffers(field, { cells: 129 })).toThrow();
  expect(() => buildTerrainElevatedSurfaceBuffers(field, { cells: 3 })).toThrow();
  expect(() =>
    buildTerrainElevatedSurfaceBuffers(field, {
      forests: [
        [
          { x: NaN, y: 0 },
          { x: 1, y: 0 },
          { x: 0, y: 1 },
        ],
      ],
    }),
  ).toThrow();
  const bad = { ...field, project: () => ({ x: NaN, y: 0 }) };
  expect(() => buildTerrainElevatedSurfaceBuffers(bad, { worldSize: 256, cells: 4 })).toThrow();
});
it('uses the same triangle heights as models and rejects a mismatched sampled grid', () => {
  const field = createSampledTerrainElevation(createTerrainElevation([mountain]), {
    worldSize: 1024,
    cells: 16,
  });
  const d = buildTerrainElevatedSurfaceBuffers(field);
  for (let i = 0; i < d.indices.length; i += 3) {
    const a = d.indices[i]!,
      b = d.indices[i + 1]!,
      c = d.indices[i + 2]!,
      cell = Math.floor(a / 4),
      x = (cell % 16) * 64,
      y = Math.floor(cell / 16) * 64;
    const source =
      i % 6 === 0
        ? [
            { x, y },
            { x: x + 64, y },
            { x: x + 64, y: y + 64 },
          ]
        : [
            { x, y },
            { x: x + 64, y: y + 64 },
            { x, y: y + 64 },
          ];
    const p = {
      x: (source[0]!.x + source[1]!.x + source[2]!.x) / 3,
      y: (source[0]!.y + source[1]!.y + source[2]!.y) / 3,
    };
    const paintedY = (d.vertices[a * 6 + 1]! + d.vertices[b * 6 + 1]! + d.vertices[c * 6 + 1]!) / 3;
    expect(p.y - paintedY).toBeCloseTo(field.sample(p), 3);
  }
  expect(() => buildTerrainElevatedSurfaceBuffers(field, { cells: 32 })).toThrow();
});
