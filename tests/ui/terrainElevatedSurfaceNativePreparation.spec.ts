import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { PNG } from 'pngjs';
import { expect, it } from 'vitest';
import { BufferImageSource, DOMAdapter, Texture } from 'pixi.js';
import { buildTerrainPack } from '@ui/map/terrain/terrainPack';
import { createTerrainElevation } from '@ui/map/terrain/terrainElevation';
import { createSampledTerrainElevation } from '@ui/map/terrain/sampledTerrainElevation';
import {
  createTerrainElevatedSurface,
  buildTerrainElevatedSurfaceBuffers,
} from '@ui/map/terrain/terrainElevatedSurface';

it('rejects inherited property names masquerading as a numeric mountain tier', () => {
  const mass = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ];
  for (const tier of ['constructor', 'toString', '__proto__'])
    expect(() =>
      createTerrainElevation([{ tier: tier as unknown as 1, mass, ridges: [] }]),
    ).toThrow('invalid elevation mountain');
});

it('admits the actual unchanged full-frame ground bitmap and retains its shared source', () => {
  const bytes = readFileSync('public/assets/textures/terrain-ground-grass-v1.png'),
    png = PNG.sync.read(bytes);
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    'c941f9f218751b22f5928b2ed157cbfb5df53a5f1e26e4bbc135cc2a9be769a1',
  );
  expect([png.width, png.height]).toEqual([1254, 1254]);
  let nonopaque = 0;
  for (let i = 3; i < png.data.length; i += 4) if (png.data[i] !== 255) nonopaque++;
  expect(nonopaque).toBe(0);
  const source = new BufferImageSource({
      resource: png.data,
      width: png.width,
      height: png.height,
    }),
    texture = new Texture({ source }),
    adapter = DOMAdapter.get();
  // Constructor/ownership preparation only: this supplies NO GL context or shader compiler.
  DOMAdapter.set({
    ...adapter,
    createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement,
  });
  try {
    const surface = createTerrainElevatedSurface(
      texture,
      createSampledTerrainElevation(createTerrainElevation([])),
    );
    try {
      expect(surface.mesh.texture).toBe(texture);
      expect(surface.shader.resources.uTexture).toBe(source);
      expect(surface.geometry.getBuffer('aUV')).toBe(surface.geometry.getBuffer('aPosition'));
      expect(surface.geometry.getAttribute('aUV').stride).toBe(24);
      expect(surface.geometry.getAttribute('aUV').offset).toBe(8);
      expect(surface.getDiagnostics()).toMatchObject({
        ownedTextures: 0,
        ownedSources: 0,
        ownedFilters: 0,
        ownedMasks: 0,
        bufferBytes: 1966080,
      });
      const program = surface.shader.glProgram;
      for (const name of [
        'uProjectionMatrix',
        'uWorldTransformMatrix',
        'uTransformMatrix',
        'uWorldColorAlpha',
        'uColor',
      ])
        expect(program.vertex).toContain(name);
      for (const varying of ['vUV', 'vLight', 'vForest', 'vColor']) {
        expect(program.vertex).toMatch(new RegExp(`varying highp [^;]+ ${varying};`));
        expect(program.fragment).toMatch(new RegExp(`varying highp [^;]+ ${varying};`));
      }
    } finally {
      surface.destroy();
      surface.destroy();
    }
    expect(source.destroyed).toBe(false);
    expect(texture.destroyed).toBe(false);
  } finally {
    DOMAdapter.set(adapter);
    texture.destroy(true);
  }
});

it('bounds Float32 grounding error over actual national terrain, without a fake GL claim', () => {
  const field = createSampledTerrainElevation(
      createTerrainElevation(buildTerrainPack().mountains ?? []),
    ),
    data = buildTerrainElevatedSurfaceBuffers(field);
  let maxError = 0,
    positive = 0;
  for (let cell = 0; cell < 128 * 128; cell++) {
    const x = (cell % 128) * 32,
      y = Math.floor(cell / 128) * 32;
    for (const [corner, [gx, gy]] of [
      [x, y],
      [x + 32, y],
      [x + 32, y + 32],
      [x, y + 32],
    ].entries()) {
      const exact = field.project({ x: gx!, y: gy! }),
        offset = cell * 24 + corner * 6;
      maxError = Math.max(
        maxError,
        Math.abs(exact.x - data.vertices[offset]!),
        Math.abs(exact.y - data.vertices[offset + 1]!),
      );
      if (field.sample({ x: gx!, y: gy! }) > 0) positive++;
    }
  }
  expect(positive).toBeGreaterThan(0);
  // World coordinates stay in[0,4096]; nearest Float32 rounding per axis <=2^-12.
  expect(maxError).toBeLessThanOrEqual(2 ** -12);
  // At supported maxScale4, this is <=.0009765625CSS px, before GPU transforms.
  expect(maxError * 4).toBeLessThanOrEqual(2 ** -10);
});
