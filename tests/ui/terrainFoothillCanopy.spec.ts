import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
const failure = vi.hoisted(() => ({ shader: false }));
vi.mock('pixi.js', async (importActual) => {
  const actual = await importActual<typeof import('pixi.js')>();
  return {
    ...actual,
    Shader: class extends actual.Shader {
      constructor(...args: ConstructorParameters<typeof actual.Shader>) {
        if (failure.shader) throw new Error('controlled shader admission failure');
        super(...args);
      }
    },
  };
});
import {
  Buffer,
  BufferImageSource,
  DOMAdapter,
  GlProgram,
  Texture,
  Rectangle,
  UniformGroup,
} from 'pixi.js';
import { createTerrainTopography } from '@ui/map/terrain/terrainTopography';
import { createSampledTerrainElevation } from '@ui/map/terrain/sampledTerrainElevation';
import { createTerrainElevatedSurface } from '@ui/map/terrain/terrainElevatedSurface';
import { buildTerrainPack } from '@ui/map/terrain/terrainPack';
import { forestRasterLayout, mountainRasterPlacement } from '@ui/map/terrain/terrainRaster';
import {
  buildTerrainFoothillCanopyBuffers,
  createTerrainFoothillCanopy,
  foothillCanopySamples,
  foothillCanopyTileWorld,
  type FoothillCanopyField,
} from '@ui/map/terrain/terrainFoothillCanopy';
const adapter = DOMAdapter.get();
beforeEach(() =>
  DOMAdapter.set({
    ...adapter,
    createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement,
  }),
);
afterEach(() => {
  failure.shader = false;
  vi.restoreAllMocks();
  DOMAdapter.set(adapter);
});
function field() {
  const protectedCells = new Uint8Array(128 * 128);
  protectedCells[64 * 128 + 64] = 1;
  return createSampledTerrainElevation(
    createTerrainTopography([
      {
        tier: 3,
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
    ]),
    { protectedCells },
  );
}
it('matches the actual ten authored canopy median pixel density on both axes instead of enlarging trees', () => {
  const width = 1374,
    height = 1145;
  const scales = forestRasterLayout(buildTerrainPack())
    .map((patch) => mountainRasterPlacement(patch, width, height).scale)
    .sort((a, b) => a - b);
  expect(scales).toHaveLength(10);
  const median = (scales[4]! + scales[5]!) / 2;
  expect(median).toBeCloseTo(0.065764192139738, 14);
  const options = { width, height, worldPerSourcePixel: median };
  const at = (x: number, y: number) => foothillCanopySamples({ x, y }, options);
  const a = at(1, 1),
    dx = at(1.0001, 1),
    dy = at(1, 1.0001);
  expect((dx[0]!.u - a[0]!.u) / 0.0001).toBeCloseTo(1 / (width * median), 9);
  expect((dy[0]!.v - a[0]!.v) / 0.0001).toBeCloseTo(1 / (height * median), 9);
  const tile = foothillCanopyTileWorld(options);
  expect(tile.x).toBeCloseTo(9.4878, 12);
  expect(tile.y).toBeCloseTo(7.9065, 12);
  const png = PNG.sync.read(readFileSync('public/assets/textures/terrain-forest-canopy-v1.png'));
  const texture = new Texture({
    source: new BufferImageSource({ resource: png.data, width, height }),
  });
  const owner = createTerrainFoothillCanopy(texture, field());
  try {
    const uniforms = owner.shader.resources.canopyUniforms as UniformGroup;
    expect(Array.from(uniforms.uniforms.uCanopyTile as Float32Array)).toEqual([
      Math.fround(tile.x),
      Math.fround(tile.y),
    ]);
    expect(owner.shader.glProgram.fragment).toContain('p=vWorld/uCanopyTile');
    expect(owner.shader.glProgram.fragment).not.toContain('vWorld/96.0');
    expect(owner.getDiagnostics().tileWorld).toEqual([tile.x, tile.y]);
    expect(owner.getDiagnostics().bufferBytes).toBe(792600);
  } finally {
    owner.destroy();
    texture.destroy(true);
  }
  for (const invalid of [
    { ...options, width: 0 },
    { ...options, height: Infinity },
    { ...options, width: 16385 },
    { ...options, width: 1.5 },
    { ...options, worldPerSourcePixel: NaN },
    { ...options, worldPerSourcePixel: 0 },
  ])
    expect(() => foothillCanopySamples({ x: 1, y: 1 }, invalid)).toThrow('pixel density');
});
it('emits genuine numeric canopy coverage on the same field while the old ground shader has no canopy channel', () => {
  const f = field(),
    before = [...f.vertexHeights],
    data = buildTerrainFoothillCanopyBuffers(f);
  const old = createTerrainElevatedSurface(Texture.WHITE, f),
    current = createTerrainFoothillCanopy(Texture.WHITE, f);
  try {
    // Existing real ground producer is the negative control, not a missing module.
    // Zero old canopy texture taps vs three shared-site taps is architecture evidence only.
    expect(old.shader.glProgram.fragment?.match(/texture2D\(/g)).toHaveLength(1);
    expect(old.shader.glProgram.fragment).not.toContain('canopy');
    expect(old.geometry.attributes.aCanopy).toBeUndefined();
    expect(data.positiveVertices).toBeGreaterThan(0);
    expect(data.maximumCoverage).toBeGreaterThan(0.4);
    expect(data.maximumCoverage).toBeLessThanOrEqual(0.88);
    expect(current.shader.glProgram.fragment).toContain(
      'canopy=tap(p,a)*w.x+tap(p,b)*w.y+tap(p,c)*w.z',
    );
    expect(current.geometry.getBuffer('aCanopy').data).toBe(current.buffers.vertices);
    expect(f.vertexHeights).toEqual(before);
  } finally {
    old.destroy();
    current.destroy();
  }
});
it('keeps projected vertices, diagonal, canonical UV and all protected flat coverage exact', () => {
  const f = field(),
    data = buildTerrainFoothillCanopyBuffers(f);
  expect(data.bytes).toBe(792600);
  expect(data.directSampleQueries).toBe(5 * 129 * 129);
  expect(data.projectionQueries).toBe(129 * 129);
  expect(data.sampleQueries).toBe(6 * 129 * 129);
  expect(Array.from(data.indices.slice(0, 6))).toEqual([0, 1, 130, 0, 130, 129]);
  for (let y = 0; y <= 128; y++)
    for (let x = 0; x <= 128; x++) {
      const i = y * 129 + x,
        p = { x: x * 32, y: y * 32 },
        q = f.project(p);
      expect(data.vertices[i * 6]).toBe(Math.fround(q.x));
      expect(data.vertices[i * 6 + 1]).toBe(Math.fround(q.y));
      expect(Array.from(data.vertices.slice(i * 6 + 2, i * 6 + 4))).toEqual([p.x, p.y]);
      if (f.vertexHeights[i] === 0) {
        expect(data.vertices[i * 6 + 4]).toBe(0);
        expect(data.vertices[i * 6 + 5]).toBe(1);
      }
    }
  for (const i of [64 * 129 + 64, 64 * 129 + 65, 65 * 129 + 64, 65 * 129 + 65])
    expect(data.vertices[i * 6 + 4]).toBe(0);
  let minimum = Infinity;
  for (let i = 0; i < data.indices.length; i += 3) {
    const a = data.indices[i]! * 6,
      b = data.indices[i + 1]! * 6,
      c = data.indices[i + 2]! * 6;
    minimum = Math.min(
      minimum,
      (data.vertices[b]! - data.vertices[a]!) * (data.vertices[c + 1]! - data.vertices[a + 1]!) -
        (data.vertices[b + 1]! - data.vertices[a + 1]!) * (data.vertices[c]! - data.vertices[a]!),
    );
  }
  expect(minimum).toBeGreaterThan(0);
  expect(minimum).toBe(data.minimumFloat32Area);
  expect(buildTerrainFoothillCanopyBuffers(f).vertices).toEqual(data.vertices);
});
it('samples certified near-opaque original crown windows without rotating baked light', () => {
  const png = PNG.sync.read(
    readFileSync(
      new URL('../../public/assets/textures/terrain-forest-canopy-v1.png', import.meta.url),
    ),
  );
  let minAlpha = 255,
    maxDelta = 0;
  const means: number[] = [];
  for (let y = 0; y <= 4096; y += 71)
    for (let x = 0; x <= 4096; x += 67) {
      const taps = foothillCanopySamples({ x, y });
      expect(taps).toHaveLength(3);
      expect(taps.reduce((sum, tap) => sum + tap.weight, 0)).toBeCloseTo(1, 12);
      let luminance = 0;
      for (const tap of taps) {
        expect(tap.u).toBeGreaterThan(0);
        expect(tap.u).toBeLessThan(1);
        expect(tap.v).toBeGreaterThan(0);
        expect(tap.v).toBeLessThan(1);
        const i = (Math.floor(tap.v * png.height) * png.width + Math.floor(tap.u * png.width)) * 4;
        minAlpha = Math.min(minAlpha, png.data[i + 3]!);
        luminance +=
          tap.weight *
          (0.2126 * png.data[i]! + 0.7152 * png.data[i + 1]! + 0.0722 * png.data[i + 2]!);
      }
      means.push(luminance);
    }
  maxDelta = Math.max(...means) - Math.min(...means);
  expect(minAlpha).toBeGreaterThanOrEqual(250);
  expect(maxDelta).toBeGreaterThan(20);
  // Same seed tap at a boundary: no UV reset, and zero-weight taps cannot jump paint.
  const tile = foothillCanopyTileWorld({
    width: png.width,
    height: png.height,
    worldPerSourcePixel: 0.065764192139738,
  });
  const left = foothillCanopySamples({ x: 0.75 * tile.x - 1e-9, y: (Math.sqrt(3) / 4) * tile.y }),
    right = foothillCanopySamples({ x: 0.75 * tile.x + 1e-9, y: (Math.sqrt(3) / 4) * tile.y });
  for (const a of left.filter((t) => t.weight > 1e-10)) {
    const b = right.find((t) => t.site[0] === a.site[0] && t.site[1] === a.site[1])!;
    expect(a.u).toBeCloseTo(b.u, 8);
    expect(a.v).toBeCloseTo(b.v, 8);
    expect(a.weight).toBeCloseTo(b.weight, 8);
  }
  const translated = foothillCanopySamples({ x: 21.0001, y: 43 }),
    original = foothillCanopySamples({ x: 21, y: 43 });
  expect(translated[0]!.u - original[0]!.u).toBeCloseTo((0.3 * 0.35 * 0.0001) / tile.x, 12);
  expect(translated[0]!.v).toBe(original[0]!.v);
  console.info(
    'canopy-interior-RGBA',
    JSON.stringify({
      width: png.width,
      height: png.height,
      sampledMinimumAlpha: minAlpha,
      weightedLumaRange: maxDelta,
    }),
  );
});
it('owns exactly one mesh, two buffers and private shader/program; never destroys shared texture/style', () => {
  const f = field(),
    style = Texture.WHITE.source.style,
    a = createTerrainFoothillCanopy(Texture.WHITE, f),
    b = createTerrainFoothillCanopy(Texture.WHITE, f);
  expect(a.shader.glProgram._key).not.toBe(b.shader.glProgram._key);
  expect(a.getDiagnostics()).toMatchObject({
    ownedMeshes: 1,
    ownedGeometries: 1,
    ownedBuffers: 2,
    ownedShaders: 1,
    ownedPrograms: 1,
    ownedTextures: 0,
    ownedSources: 0,
    ownedMasks: 0,
    ownedFilters: 0,
    ownedFramebuffers: 0,
    bufferBytes: 792600,
  });
  expect(a.mesh.eventMode).toBe('none');
  expect(a.mesh.texture).toBe(Texture.WHITE);
  expect(a.geometry.getBuffer('aPosition')).toBe(a.geometry.getBuffer('aWorld'));
  const attribute = a.geometry.getBuffer('aPosition'),
    index = a.geometry.indexBuffer;
  const attrDestroy = vi.spyOn(attribute, 'destroy'),
    indexDestroy = vi.spyOn(index, 'destroy'),
    geometryDestroy = vi.spyOn(a.geometry, 'destroy'),
    shaderDestroy = vi.spyOn(a.shader, 'destroy'),
    programDestroy = vi.spyOn(a.shader.glProgram, 'destroy');
  a.destroy();
  a.destroy();
  for (const spy of [attrDestroy, indexDestroy, geometryDestroy, shaderDestroy, programDestroy])
    expect(spy).toHaveBeenCalledTimes(1);
  expect(a.getDiagnostics()).toMatchObject({
    ownedMeshes: 0,
    ownedGeometries: 0,
    ownedBuffers: 0,
    ownedShaders: 0,
    ownedPrograms: 0,
    bufferBytes: 0,
  });
  expect(Texture.WHITE.destroyed).toBe(false);
  expect(Texture.WHITE.source.style).toBe(style);
  b.destroy();
});
it('releases both actual buffers and private program if shader construction fails', () => {
  const buffers = vi.spyOn(Buffer.prototype, 'destroy'),
    programs = vi.spyOn(GlProgram.prototype, 'destroy');
  failure.shader = true;
  expect(() => createTerrainFoothillCanopy(Texture.WHITE, field())).toThrow(
    'controlled shader admission failure',
  );
  expect(buffers).toHaveBeenCalledTimes(2);
  expect(programs).toHaveBeenCalledTimes(1);
  expect(Texture.WHITE.destroyed).toBe(false);
});
it('rejects invalid full-frame/source/grid/height/projection before resource ownership', () => {
  const f = field(),
    buffers = vi.spyOn(Buffer.prototype, 'destroy');
  for (const input of [
    { ...f, bounds: { ...f.bounds, cells: 129 } },
    { ...f, bounds: { ...f.bounds, maximumHeight: 65 } },
    { ...f, bounds: { ...f.bounds, displacementLipschitz: 1 } },
    { ...f, vertexHeights: [NaN] },
    { ...f, sample: () => Infinity },
    { ...f, project: (p: { x: number; y: number }) => ({ x: p.x, y: p.y - 1 }) },
  ])
    expect(() => createTerrainFoothillCanopy(Texture.WHITE, input)).toThrow(RangeError);
  const crop = new Texture({
    source: Texture.WHITE.source,
    frame: new Rectangle(0, 0, 1, 1),
    orig: new Rectangle(1, 0, 1, 1),
  });
  expect(() => createTerrainFoothillCanopy(crop, f)).toThrow('full frame');
  crop.destroy();
  for (const texture of [
    new Texture({ source: Texture.WHITE.source, rotate: 2 }),
    new Texture({ source: Texture.WHITE.source, trim: new Rectangle(0, 0, 1, 1) }),
  ]) {
    expect(() => createTerrainFoothillCanopy(texture, f)).toThrow('full frame');
    texture.destroy();
  }
  const deadSource = new BufferImageSource({ resource: new Uint8Array(4), width: 1, height: 1 });
  const sourceTexture = new Texture({ source: deadSource });
  deadSource.destroy();
  expect(() => createTerrainFoothillCanopy(sourceTexture, f)).toThrow('full frame');
  sourceTexture.destroy();
  const dead = new Texture({ source: Texture.WHITE.source });
  dead.destroy();
  expect(() => createTerrainFoothillCanopy(dead, f)).toThrow('full frame');
  expect(buffers).not.toHaveBeenCalled();
  const folded: FoothillCanopyField = {
    vertexHeights: [0, 0, 40, 40],
    bounds: { cells: 1, worldSize: 32, maximumHeight: 64, displacementLipschitz: 0.5 },
    sample: (p) => Math.max(0, Math.min(40, 1.25 * p.y)),
    project: (p) => {
      const h = Math.max(0, Math.min(40, 1.25 * p.y));
      return { x: p.x - 0.18 * h, y: p.y - h };
    },
  };
  expect(() => buildTerrainFoothillCanopyBuffers(folded)).toThrow('Float32 winding');
});
it('uses actual national ridge height rather than an invented canopy footprint or hidden all-zero mesh', () => {
  const terrain = buildTerrainPack(),
    before = JSON.stringify(terrain);
  const f = createSampledTerrainElevation(createTerrainTopography(terrain.mountains ?? [])),
    data = buildTerrainFoothillCanopyBuffers(f);
  expect(data.positiveVertices).toBeGreaterThan(0);
  expect(data.minimumFloat32Area).toBeGreaterThan(0);
  expect(data.bytes).toBeLessThanOrEqual(2 * 1024 * 1024);
  expect(JSON.stringify(terrain)).toBe(before);
  console.info(
    'national-foothill-canopy-unprotected',
    JSON.stringify({
      positiveVertices: data.positiveVertices,
      maximumCoverage: data.maximumCoverage,
      bytes: data.bytes,
      sampleQueries: data.sampleQueries,
    }),
  );
});
