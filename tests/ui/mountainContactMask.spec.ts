import { describe, expect, it, vi } from 'vitest';
import { BufferImageSource, Container, Sprite, Texture } from 'pixi.js';
import {
  createMountainRasterVariants,
  mountainFeatherMask,
  mountainRasterLayout,
} from '@ui/map/terrain/terrainRaster';
import { buildTerrainPack } from '@ui/map/terrain/terrainPack';

const patch = mountainRasterLayout({
  reliefAssetId: 'test-relief',
  forestAssetId: 'test-forest',
  rivers: [],
  lakes: [],
  mountains: [
    {
      id: 'test-mountain',
      tier: 2,
      mass: [
        { x: 0, y: 0 },
        { x: 128, y: 0 },
        { x: 128, y: 128 },
        { x: 0, y: 128 },
      ],
      ridges: [],
    },
  ],
})[0]!;

function mask(land: readonly (readonly number[])[]) {
  return mountainFeatherMask(patch, land);
}

describe('mountain hero display-land contact', () => {
  it('does not paint east/south sea, including the complete linear-filter support', () => {
    const { pixels, size } = mask([[0, 50, 64, 50, 64, 100, 0, 100]]);
    let illegal = 0;
    let grounded = 0;
    for (let row = 0; row < size; row++) {
      for (let col = 0; col < size; col++) {
        if (pixels[(row * size + col) * 4] === 0) continue;
        const x = col + 0.5;
        const y = row + 0.5;
        // A linear-filter basis has support one texel either side of its center.
        if (x - 1 < 0 || x + 1 > 64 || y - 1 < 38 || y + 1 > 100) illegal++;
        if (x > 8 && x < 56 && y > 58 && y < 92) grounded++;
      }
    }
    expect(grounded).toBeGreaterThan(0);
    expect(illegal).toBe(0);
  });

  it('preserves bounded north canopy but never projects east, south, or more than12world', () => {
    const { pixels, size } = mask([[0, 50, 64, 50, 64, 100, 0, 100]]);
    const coverage = (x: number, y: number) => pixels[(y * size + x) * 4]!;
    expect(coverage(32, 42)).toBeGreaterThan(0);
    expect(coverage(32, 36)).toBe(0);
    expect(coverage(80, 70)).toBe(0);
    expect(coverage(32, 110)).toBe(0);
    const short = {
      ...patch,
      height: 32,
      polygon: patch.polygon.map((p) => ({ x: p.x, y: p.y / 4 })),
    };
    const small = mountainFeatherMask(short, [[0, 16, 128, 16, 128, 32, 0, 32]]);
    expect(small.pixels[(56 * size + 32) * 4]).toBeGreaterThan(0);
    expect(small.pixels[(44 * size + 32) * 4]).toBe(0);
  });

  it('preserves exact inland bytes and never fills sea gaps between islands', () => {
    const original = mountainFeatherMask(patch);
    expect(mask([[-100, -100, 300, -100, 300, 300, -100, 300]]).pixels).toEqual(original.pixels);
    const separated = mask([
      [0, 0, 40, 0, 40, 128, 0, 128],
      [80, 0, 128, 0, 128, 128, 80, 128],
    ]);
    expect(separated.pixels[(64 * 128 + 20) * 4]).toBeGreaterThan(0);
    expect(separated.pixels[(64 * 128 + 100) * 4]).toBeGreaterThan(0);
    for (let col = 42; col < 78; col++) expect(separated.pixels[(64 * 128 + col) * 4]).toBe(0);
  });

  it('certifies diagonal shore support and preserves a concave sea inlet', () => {
    const diagonal = mask([[0, 0, 128, 0, 0, 128]]);
    let retained = 0;
    for (let row = 0; row < 128; row++) {
      for (let col = 0; col < 128; col++) {
        if (!diagonal.pixels[(row * 128 + col) * 4]) continue;
        retained++;
        // Entire support rectangle must remain in the north-swept half-plane.
        expect(col + 0.5 + row + 0.5 + 2).toBeLessThanOrEqual(128 + 12);
      }
    }
    expect(retained).toBeGreaterThan(1000);
    const inlet = mask([[0, 0, 128, 0, 128, 128, 80, 128, 80, 48, 48, 48, 48, 128, 0, 128]]);
    expect(inlet.pixels[(80 * 128 + 64) * 4]).toBe(0);
    expect(inlet.pixels[(80 * 128 + 32) * 4]).toBeGreaterThan(0);
  });

  it('fails closed for invalid/budget-exceeding land and does not mutate inputs', () => {
    for (const land of [
      [],
      [[0, 0, 10, 0, NaN, 10]],
      [[0, 0, 10]],
      Array(65).fill([0, 0, 10, 0, 10, 10]),
    ]) {
      const result = mask(land);
      expect(result.pixels.filter((_, i) => i % 4 !== 3).some((value) => value !== 0)).toBe(false);
      expect(result.pixels.filter((_, i) => i % 4 === 3).every((value) => value === 255)).toBe(
        true,
      );
    }
    const land = Object.freeze([Object.freeze([0, 50, 64, 50, 64, 100, 0, 100])]);
    const before = JSON.stringify(land);
    expect(mask(land).pixels).toEqual(mask(land).pixels);
    expect(JSON.stringify(land)).toBe(before);
  });

  it('keeps14owned masks and destroys each once without destroying shared art', () => {
    const terrain = buildTerrainPack();
    const shared = new Texture({
      source: new BufferImageSource({
        resource: new Uint8Array(16 * 16 * 4),
        width: 16,
        height: 16,
      }),
    });
    const textures = new Map(
      mountainRasterLayout(terrain).flatMap((p) =>
        [p.assetId, p.axisAssetId, terrain.mountainArtAssetId]
          .filter((id): id is string => !!id)
          .map((id) => [id, shared] as const),
      ),
    );
    const raster = createMountainRasterVariants(textures, terrain, undefined, [
      [-100, -100, 5000, -100, 5000, 5000, -100, 5000],
    ]);
    const owned: Texture[] = [];
    const visit = (container: Container) => {
      if (container instanceof Sprite && container.texture !== shared)
        owned.push(container.texture);
      for (const child of container.children) visit(child);
    };
    visit(raster.container);
    expect(owned).toHaveLength(14);
    const dispose = owned.map((texture) => vi.spyOn(texture, 'destroy'));
    const sharedDispose = vi.spyOn(shared, 'destroy');
    raster.destroy();
    raster.destroy();
    for (const spy of dispose) {
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(true);
    }
    expect(sharedDispose).not.toHaveBeenCalled();
    shared.destroy(true);
  });
});
