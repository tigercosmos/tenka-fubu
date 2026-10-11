import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { BufferImageSource, DOMAdapter, Texture } from 'pixi.js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  buildTerrainFoothillCanopyBuffers,
  createTerrainFoothillCanopy,
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
  vi.restoreAllMocks();
  DOMAdapter.set(adapter);
});
function field(dx: number, dy: number, height = 32): FoothillCanopyField {
  const sample = (p: { x: number; y: number }) =>
    height === 0 ? 0 : height + dx * (p.x - 128) + dy * (p.y - 128);
  return {
    bounds: { cells: 8, worldSize: 256, maximumHeight: 64, displacementLipschitz: 0.6 },
    vertexHeights: Object.freeze(
      Array.from({ length: 81 }, (_, i) => sample({ x: (i % 9) * 32, y: Math.floor(i / 9) * 32 })),
    ),
    sample,
    project(p) {
      const h = sample(p);
      return { x: p.x - 0.18 * h, y: p.y - h };
    },
  };
}
const smooth = (a: number, b: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
it('uses the existing NW irradiance on actual vertices without changing projected/source coordinates, coverage, index topology or query counts', () => {
  for (const [dx, dy, height] of [
    [0.12, 0.08, 32],
    [-0.12, -0.08, 32],
    [0, 0, 24],
    [0, 0, 0],
  ] as const) {
    const f = field(dx, dy, height),
      before = JSON.stringify(f.vertexHeights),
      sample = vi.spyOn(f, 'sample');
    const data = buildTerrainFoothillCanopyBuffers(f);
    expect(data.vertices.length).toBe(81 * 6);
    expect(data.bytes).toBe(81 * 24 + 8 * 8 * 6 * 4);
    // Project calls the retained local sampler; direct query count remains five.
    expect(sample).toHaveBeenCalledTimes(81 * 5);
    expect(data.sampleQueries).toBe(81 * 6);
    for (let y = 0; y <= 8; y++)
      for (let x = 0; x <= 8; x++) {
        const i = (y * 9 + x) * 6,
          p = { x: x * 32, y: y * 32 },
          h = f.vertexHeights[y * 9 + x]!,
          q = f.project(p);
        const coverage =
          0.88 *
          smooth(0, 12, h) *
          (1 - smooth(0.16, 0.5, Math.hypot(dx, dy))) *
          (1 - 0.5 * smooth(36, 64, h));
        const light =
          1 +
          (0.45 * dx + 0.55 * dy + 0.7) / Math.hypot(dx, dy, 1) / Math.hypot(0.45, 0.55, 0.7) -
          0.7 / Math.hypot(0.45, 0.55, 0.7);
        expect(Array.from(data.vertices.slice(i, i + 5))).toEqual([
          Math.fround(q.x),
          Math.fround(q.y),
          p.x,
          p.y,
          Math.fround(coverage),
        ]);
        expect(data.vertices[i + 5]).toBe(Math.fround(light));
      }
    expect(Array.from(data.indices.slice(0, 6))).toEqual([0, 1, 10, 0, 10, 9]);
    expect(JSON.stringify(f.vertexHeights)).toBe(before);
    const central = data.vertices[(4 * 9 + 4) * 6 + 5]!;
    if (dx > 0) expect(central).toBeGreaterThan(1);
    if (dx < 0) expect(central).toBeLessThan(1);
    if (dx === 0) expect(central).toBe(1);
  }
});
it('binds actual light data and lights only premultiplied RGB, retaining original canopy alpha/taps/texture and private teardown', () => {
  const png = PNG.sync.read(readFileSync('public/assets/textures/terrain-forest-canopy-v1.png'));
  const texture = new Texture({
    source: new BufferImageSource({ resource: png.data, width: png.width, height: png.height }),
  });
  const style = () => [
    texture.source.style.addressModeU,
    texture.source.style.addressModeV,
    texture.source.style.minFilter,
    texture.source.style.magFilter,
    texture.source.style.mipmapFilter,
  ];
  const bytesBefore = Buffer.from(png.data),
    styleBefore = style();
  const sourceDestroy = vi.spyOn(texture.source, 'destroy'),
    textureDestroy = vi.spyOn(texture, 'destroy');
  const owner = createTerrainFoothillCanopy(texture, field(0.12, 0.08));
  try {
    expect(owner.geometry.attributes.aLight).toMatchObject({
      stride: 24,
      offset: 20,
      format: 'float32',
    });
    expect(owner.geometry.getBuffer('aLight').data).toBe(owner.buffers.vertices);
    expect(owner.shader.glProgram.vertex).toContain('vLight=aLight');
    expect(owner.shader.glProgram.fragment).toContain(
      'vec4(canopy.rgb*vLight,canopy.a)*vCanopy*vColor',
    );
    expect(owner.shader.glProgram.fragment).not.toContain('canopy*vLight');
    expect(owner.shader.glProgram.fragment).toContain(
      'canopy=tap(p,a)*w.x+tap(p,b)*w.y+tap(p,c)*w.z',
    );
    expect(owner.mesh.texture).toBe(texture);
    expect(owner.getDiagnostics()).toMatchObject({
      ownedMeshes: 1,
      ownedGeometries: 1,
      ownedBuffers: 2,
      ownedShaders: 1,
      ownedPrograms: 1,
      ownedTextures: 0,
      ownedSources: 0,
      ownedMasks: 0,
      ownedFilters: 0,
    });
    expect(style()).toEqual(styleBefore);
    expect(Buffer.compare(png.data, bytesBefore)).toBe(0);
  } finally {
    owner.destroy();
    owner.destroy();
  }
  expect(textureDestroy).not.toHaveBeenCalled();
  expect(sourceDestroy).not.toHaveBeenCalled();
  expect(owner.getDiagnostics()).toMatchObject({
    ownedMeshes: 0,
    ownedGeometries: 0,
    ownedBuffers: 0,
    ownedShaders: 0,
    ownedPrograms: 0,
    bufferBytes: 0,
  });
  texture.destroy(true);
});
