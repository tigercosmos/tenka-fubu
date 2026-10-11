import { describe, expect, it, vi } from 'vitest';
import { BufferImageSource, Texture, type FillInstruction } from 'pixi.js';
import { createMountainRasterVariants } from '@ui/map/terrain/terrainRaster';
import { buildTerrainPack } from '@ui/map/terrain/terrainPack';
import { prepareMountainRiverContact } from '@ui/map/terrain/mountainRiverContact';
import {
  createMountainShade,
  mountainShadeHeight,
  mountainShadeLight,
  mountainShadePixels,
} from '@ui/map/terrain/terrainMountainShade';
const patch = {
  id: 'slope',
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  polygon: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
    { x: 0, y: 100 },
  ],
};

describe('continuous mountain foothill lighting', () => {
  it('attenuates actual shade ALPHA only while retaining all NW-lit RGB bytes', () => {
    const ridges = [
      [
        { x: 50, y: 10 },
        { x: 50, y: 90 },
      ],
    ];
    const contact = prepareMountainRiverContact([
      { id: 'river', a: { x: 0, y: 50 }, b: { x: 100, y: 50 }, radius: 2 },
    ]);
    const old = mountainShadePixels(patch, ridges, 3)!;
    const actual = mountainShadePixels(patch, ridges, 3, contact)!;
    let reduced = 0,
      changedRGB = 0;
    for (let i = 0; i < old.pixels.length; i += 4) {
      for (let j = 0; j < 3; j++) if (old.pixels[i + j] !== actual.pixels[i + j]) changedRGB++;
      if (actual.pixels[i + 3]! < old.pixels[i + 3]!) reduced++;
    }
    expect(changedRGB).toBe(0);
    expect(reduced).toBeGreaterThan(0);
  });
  it('assembles an owned continuous light surface below successful painted peaks', () => {
    const terrain = buildTerrainPack();
    const texture = new Texture({
      source: new BufferImageSource({
        resource: new Uint8Array(16 * 16 * 4),
        width: 16,
        height: 16,
      }),
    });
    const raster = createMountainRasterVariants(
      new Map([[terrain.mountainArtAssetId!, texture]]),
      terrain,
      texture,
    );
    try {
      expect(
        raster.materialLayer?.children[0]?.children.some((child) =>
          child.label?.startsWith('mountain-foothill-shade:'),
        ),
      ).toBe(true);
      expect(raster.getShadeDiagnostics()).toEqual({
        patches: 14,
        ownedTextures: 14,
        ownedSources: 14,
        rgbaBytes: 896 * 1024,
      });
      const before = raster.getShadeDiagnostics();
      expect(raster.getShadeDiagnostics()).toEqual(before); // Observation/LOD-independent static allocation.
      raster.destroy();
      raster.destroy();
      expect(raster.getShadeDiagnostics().rgbaBytes).toBe(0);
      expect(texture.source.destroyed).toBe(false);
    } finally {
      raster.destroy();
      texture.destroy(true);
    }
  });
  it('uses the authored relief height and independent fixed NW diffuse normals', () => {
    expect(mountainShadeHeight({ x: 50, y: 50 }, patch, [], 3).height).toBeCloseTo(
      38 * (0.15 + 0.85 * 0.65),
      12,
    );
    expect(mountainShadeHeight({ x: 0, y: 50 }, patch, [], 3)).toEqual({ height: 0, fade: 0 });
    expect(mountainShadeHeight({ x: -1, y: 50 }, patch, [], 3)).toEqual({ height: 0, fade: 0 });
    const expected =
      (0.45 * 0.5 + 0.55 * 0.2 + 0.7) /
        Math.sqrt(1 + 0.5 ** 2 + 0.2 ** 2) /
        Math.sqrt(0.45 ** 2 + 0.55 ** 2 + 0.7 ** 2) -
      0.7 / Math.sqrt(0.45 ** 2 + 0.55 ** 2 + 0.7 ** 2);
    expect(mountainShadeLight(0.5, 0.2)).toBeCloseTo(expected, 14);
    expect(mountainShadeLight(0, 0)).toBe(0);
    expect(mountainShadeLight(0.5, 0.2)).toBeGreaterThan(0);
    expect(mountainShadeLight(-0.5, -0.2)).toBeLessThan(0);
  });
  it('produces a deterministic continuous two-sided field with faded boundary and unchanged polygon', () => {
    const before = structuredClone(patch),
      ridges = [
        [
          { x: 50, y: 10 },
          { x: 50, y: 90 },
        ],
      ];
    const result = mountainShadePixels(patch, ridges, 3)!;
    expect(result.pixels.byteLength).toBe(65536);
    expect(mountainShadePixels(patch, ridges, 3)).toEqual(result);
    expect(patch).toEqual(before);
    const alpha = (x: number, y: number) => result.pixels[(y * 128 + x) * 4 + 3]!;
    expect(alpha(0, 64)).toBe(0);
    expect(alpha(30, 64)).toBeGreaterThan(0);
    expect(alpha(96, 64)).toBeGreaterThan(0);
    expect(result.pixels[(64 * 128 + 30) * 4]).toBe(224);
    expect(result.pixels[(64 * 128 + 96) * 4]).toBe(38);
    expect(Math.max(...result.pixels.filter((_, i) => i % 4 === 3))).toBeLessThanOrEqual(72);
    const translated = {
      ...patch,
      x: 400,
      y: -200,
      polygon: patch.polygon.map((p) => ({ x: p.x + 400, y: p.y - 200 })),
    };
    expect(
      mountainShadePixels(
        translated,
        ridges.map((r) => r.map((p) => ({ x: p.x + 400, y: p.y - 200 }))),
        3,
      )?.pixels,
    ).toEqual(result.pixels);
  });
  it('clips to exact ground geometry and destroys only owned texture/source exactly once', () => {
    const shade = createMountainShade(patch, [], 2)!;
    const destroy = vi.spyOn(shade.texture.source, 'destroy');
    const contextDestroy = vi.spyOn(shade.clip.context, 'destroy');
    expect(shade.sprite.mask).toBe(shade.clip);
    expect(shade.sprite.position.x).toBe(patch.x);
    expect(shade.sprite.width).toBe(patch.width);
    const fill = shade.clip.context.instructions[0]! as FillInstruction;
    expect(fill.action).toBe('fill');
    expect(Reflect.get(fill.data.path.shapePath.shapePrimitives[0]!.shape, 'points')).toEqual(
      patch.polygon.flatMap((p) => [p.x, p.y]),
    );
    shade.destroy();
    shade.destroy();
    expect(destroy).toHaveBeenCalledTimes(1);
    expect(contextDestroy).toHaveBeenCalledTimes(1);
    expect(shade.getDiagnostics()).toEqual({ ownedTextures: 0, ownedSources: 0, rgbaBytes: 0 });
    expect(Texture.WHITE.source.destroyed).toBe(false);
  });
  it('rejects nonfinite/zero/over-budget inputs before allocation', () => {
    for (const invalid of [
      { ...patch, width: 0 },
      { ...patch, width: Infinity },
      { ...patch, x: 1e12 },
      { ...patch, polygon: [{ x: NaN, y: 0 }, ...patch.polygon] },
      { ...patch, polygon: Array.from({ length: 257 }, () => ({ x: 0, y: 0 })) },
    ])
      expect(createMountainShade(invalid, [], 1)).toBeNull();
    expect(
      createMountainShade(patch, [Array.from({ length: 2049 }, () => ({ x: 1, y: 1 }))], 1),
    ).toBeNull();
  });
  it('allocates no shade for failed or legacy no-woodland raster admission', () => {
    const terrain = buildTerrainPack();
    const texture = new Texture({
      source: new BufferImageSource({ resource: new Uint8Array(4 * 4 * 4), width: 4, height: 4 }),
    });
    const failed = createMountainRasterVariants(new Map(), terrain, texture);
    const legacy = createMountainRasterVariants(
      new Map([[terrain.mountainArtAssetId!, texture]]),
      terrain,
    );
    try {
      expect(failed.getShadeDiagnostics()).toEqual({
        patches: 0,
        ownedTextures: 0,
        ownedSources: 0,
        rgbaBytes: 0,
      });
      expect(legacy.getShadeDiagnostics()).toEqual(failed.getShadeDiagnostics());
      expect(legacy.materialLayer).toBeNull();
      expect(legacy.container.children).toHaveLength(28);
    } finally {
      failed.destroy();
      legacy.destroy();
      texture.destroy(true);
    }
  });
});
