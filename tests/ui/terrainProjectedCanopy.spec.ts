import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { BufferImageSource, Rectangle, Texture } from 'pixi.js';
import { createTerrainProjectedCanopy } from '@ui/map/terrain/terrainProjectedCanopy';
import { buildTerrainPack } from '@ui/map/terrain/terrainPack';
import { createSampledTerrainElevation } from '@ui/map/terrain/sampledTerrainElevation';
import { createTerrainTopography } from '@ui/map/terrain/terrainTopography';
import { forestRasterLayout, mountainRasterPlacement } from '@ui/map/terrain/terrainRaster';
const point = (x: number, y: number) => ({ x, y });
const flat = { project: (p: { x: number; y: number }) => p, bounds: { cells: 8, worldSize: 256 } };
const texture = () =>
  new Texture({
    source: new BufferImageSource({ resource: new Uint8Array(64 * 32 * 4), width: 64, height: 32 }),
  });
it('rejects finite doubles that cannot produce finite Float32 paint vertices', () => {
  const tex = texture();
  expect(() =>
    createTerrainProjectedCanopy(tex, terrain(), {
      ...flat,
      project: () => ({ x: 1e308, y: 1e308 }),
    }),
  ).toThrow(RangeError);
  tex.destroy(true);
});
it('rejects rotated, trimmed, cropped-original and destroyed borrowed assets', () => {
  for (const options of [
    { rotate: 2 },
    { trim: new Rectangle(0, 0, 64, 32) },
    { orig: new Rectangle(0, 0, 65, 32) },
  ]) {
    const source = new BufferImageSource({
        resource: new Uint8Array(64 * 32 * 4),
        width: 64,
        height: 32,
      }),
      tex = new Texture({ source, ...options });
    expect(() => createTerrainProjectedCanopy(tex, terrain(), flat)).toThrow(RangeError);
    tex.destroy(true);
  }
  const deadTexture = texture(),
    source = deadTexture.source;
  deadTexture.destroy(false);
  expect(() => createTerrainProjectedCanopy(deadTexture, terrain(), flat)).toThrow(RangeError);
  expect(source.destroyed).toBe(false);
  source.destroy();
  const deadSource = texture();
  deadSource.source.destroy();
  expect(() => createTerrainProjectedCanopy(deadSource, terrain(), flat)).toThrow(RangeError);
  deadSource.destroy(false);
});
const terrain = (polygon = [point(20, 20), point(180, 20), point(180, 160), point(20, 160)]) => ({
  ...buildTerrainPack(),
  forests: [{ id: 'fo.test', polygon }],
});
it('warps actual clipped canopy triangles on the exact sampled field and preserves original UV registration', () => {
  const tex = texture(),
    data = terrain(),
    field = createSampledTerrainElevation(
      createTerrainTopography([
        {
          tier: 3,
          mass: [point(1, 1), point(2, 1), point(1, 2)],
          ridges: [[point(80, 80), point(80, 180)]],
        },
      ]),
      { cells: 8, worldSize: 256 },
    );
  const before = JSON.stringify(data),
    result = createTerrainProjectedCanopy(tex, data, field),
    d = result.getDiagnostics();
  expect(d.ownedMeshes).toBe(1);
  expect(d.forests[0]!.indices.length).toBeGreaterThan(0);
  const placement = mountainRasterPlacement(forestRasterLayout(data)[0]!, 64, 32),
    f = d.forests[0]!;
  for (let i = 0; i < f.sourceGround.length; i += 2) {
    const p = point(f.sourceGround[i]!, f.sourceGround[i + 1]!),
      scene = field.project(p),
      j = i * 2;
    expect(f.projectedUV[j]).toBe(Math.fround(scene.x));
    expect(f.projectedUV[j + 1]).toBe(Math.fround(scene.y));
    expect(f.projectedUV[j + 2]).toBe(Math.fround((p.x - placement.x) / (64 * placement.scale)));
    expect(f.projectedUV[j + 3]).toBe(Math.fround((p.y - placement.y) / (32 * placement.scale)));
    expect(f.projectedUV[j + 2]).toBeGreaterThanOrEqual(-1e-6);
    expect(f.projectedUV[j + 2]).toBeLessThanOrEqual(1 + 1e-6);
  }
  expect(JSON.stringify(data)).toBe(before);
  expect(d.bufferBytes).toBeLessThanOrEqual(2 * 1024 * 1024);
  expect(d).toMatchObject({
    ownedTextures: 0,
    ownedSources: 0,
    ownedShaders: 0,
    ownedMasks: 0,
    ownedFilters: 0,
  });
  const mesh = result.container.children[0]!;
  expect(mesh.label).toBe('projected-canopy:fo.test');
  result.destroy();
  result.destroy();
  expect(tex.source.destroyed).toBe(false);
  tex.destroy(true);
});
it('retains all ten actual forest identities with bounded ownership and destroys each owned buffer once', () => {
  const bytes = readFileSync('public/assets/textures/terrain-forest-canopy-v1.png');
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    '451903f3bd3eb1b6c4d5127fa3e3a135ad31541709a009895c8b70ed590c4262',
  );
  const png = PNG.sync.read(bytes);
  expect(png.data.some((value, i) => i % 4 === 3 && value > 0)).toBe(true);
  const tex = new Texture({
      source: new BufferImageSource({ resource: png.data, width: png.width, height: png.height }),
    }),
    data = buildTerrainPack(),
    field = createSampledTerrainElevation(createTerrainTopography(data.mountains ?? []));
  const result = createTerrainProjectedCanopy(tex, data, field),
    d = result.getDiagnostics();
  expect(d.forests.map((f) => f.id)).toEqual(forestRasterLayout(data).map((p) => p.id));
  expect(d.ownedMeshes).toBe(10);
  expect(d.work).toBeLessThanOrEqual(4_000_000);
  expect(d.bufferBytes).toBeLessThanOrEqual(2 * 1024 * 1024);
  const buffers = result.container.children.flatMap((child) => {
    const g = (child as import('pixi.js').Mesh).geometry;
    return [g.getBuffer('aPosition'), g.indexBuffer];
  });
  const spies = buffers.map((b) => vi.spyOn(b, 'destroy'));
  result.destroy();
  result.destroy();
  for (const spy of spies) expect(spy).toHaveBeenCalledTimes(1);
  expect(tex.source.destroyed).toBe(false);
  tex.destroy(true);
  console.log(
    'actual-canopy',
    JSON.stringify({
      triangles: d.forests.reduce((s, f) => s + f.indices.length / 3, 0),
      bytes: d.bufferBytes,
      work: d.work,
    }),
  );
});
it('rejects singular, crossing, excessive and invalid clip inputs before GPU resource creation', () => {
  const tex = texture();
  for (const polygon of [
    [point(1, 1), point(2, 2), point(3, 3)],
    [point(10, 10), point(100, 100), point(10, 100), point(100, 10)],
    [point(NaN, 0), point(20, 0), point(20, 20)],
  ])
    expect(() => createTerrainProjectedCanopy(tex, terrain(polygon), flat)).toThrow(RangeError);
  expect(() =>
    createTerrainProjectedCanopy(
      tex,
      { ...terrain(), forests: Array(11).fill(terrain().forests[0]!) },
      flat,
    ),
  ).toThrow('budget');
  expect(() =>
    createTerrainProjectedCanopy(tex, terrain(), {
      ...flat,
      bounds: { cells: 129, worldSize: 256 },
    }),
  ).toThrow('grid');
  expect(tex.source.destroyed).toBe(false);
  tex.destroy(true);
});
it('handles exact grid-edge tangencies without zero triangles and fails preflight on excessive work/geometry', () => {
  const tex = texture(),
    result = createTerrainProjectedCanopy(
      tex,
      terrain([point(32, 32), point(96, 32), point(96, 96), point(32, 96)]),
      flat,
    );
  for (const f of result.getDiagnostics().forests)
    for (let i = 0; i < f.projectedUV.length; i += 12) {
      const v = f.projectedUV;
      const area =
        (v[i + 4]! - v[i]!) * (v[i + 9]! - v[i + 1]!) -
        (v[i + 5]! - v[i + 1]!) * (v[i + 8]! - v[i]!);
      expect(area).toBeGreaterThan(0);
    }
  result.destroy();
  const large = {
    ...buildTerrainPack(),
    forests: Array.from({ length: 10 }, (_, i) => ({
      id: `large.${i}`,
      polygon: [point(0, 0), point(4096, 0), point(4096, 4096), point(0, 4096)],
    })),
  };
  expect(() =>
    createTerrainProjectedCanopy(tex, large, {
      project: (p) => p,
      bounds: { cells: 128, worldSize: 4096 },
    }),
  ).toThrow(/budget/);
  expect(tex.source.destroyed).toBe(false);
  tex.destroy(true);
});
