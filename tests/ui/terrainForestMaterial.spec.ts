import { describe, expect, it, vi } from 'vitest';
import { BufferImageSource, Texture } from 'pixi.js';
import {
  createForestRaster,
  forestRasterLayout,
  mountainFeatherMask,
} from '@ui/map/terrain/terrainRaster';
import { buildTerrainPack } from '@ui/map/terrain/terrainPack';
import { createForestMaterial, forestMaterialMask } from '@ui/map/terrain/terrainForestMaterial';
import type { MountainMaterialPatch } from '@ui/map/terrain/terrainMountainMaterial';

/** Independent original hypot-per-edge algorithm, before squared-minimum optimization. */
function originalMask(patch: MountainMaterialPatch) {
  const size = 128,
    pixels = new Uint8Array(size * size * 4);
  const band = Math.min(8, patch.width * 0.12, patch.height * 0.12);
  for (let row = 0; row < size; row++)
    for (let col = 0; col < size; col++) {
      const x = patch.x + ((col + 0.5) / size) * patch.width,
        y = patch.y + ((row + 0.5) / size) * patch.height;
      let inside = false,
        distance = Infinity;
      for (let i = 0; i < patch.polygon.length; i++) {
        const a = patch.polygon[i]!,
          b = patch.polygon[(i + 1) % patch.polygon.length]!;
        if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x)
          inside = !inside;
        const dx = b.x - a.x,
          dy = b.y - a.y,
          denominator = dx * dx + dy * dy;
        const t =
          denominator > 0
            ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / denominator))
            : 0;
        distance = Math.min(distance, Math.hypot(x - a.x - t * dx, y - a.y - t * dy));
      }
      const t = inside && band > 0 && Number.isFinite(distance) ? Math.min(1, distance / band) : 0;
      const coverage = Math.round(255 * t * t * (3 - 2 * t)),
        offset = (row * size + col) * 4;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = coverage;
      pixels[offset + 3] = 255;
    }
  return pixels;
}

const texture = () =>
  new Texture({
    source: new BufferImageSource({ resource: new Uint8Array(8 * 8 * 4), width: 8, height: 8 }),
  });

describe('approved forest material coverage', () => {
  it('performs no per-edge hypot and bounds square roots to one per inside pixel', () => {
    const patch = forestRasterLayout(buildTerrainPack())[0]!;
    let hypotCalls = 0,
      sqrtCalls = 0;
    const hypot = Math.hypot,
      sqrt = Math.sqrt;
    Math.hypot = (...args: number[]) => {
      hypotCalls++;
      return hypot(...args);
    };
    Math.sqrt = (value: number) => {
      sqrtCalls++;
      return sqrt(value);
    };
    try {
      forestMaterialMask(patch);
    } finally {
      Math.hypot = hypot;
      Math.sqrt = sqrt;
    }
    expect(hypotCalls).toBe(0);
    expect(sqrtCalls).toBeGreaterThan(0);
    expect(sqrtCalls).toBeLessThanOrEqual(128 * 128);
  });

  it('preserves every independent original byte for actual and synthetic polygon edge cases', () => {
    const actual = forestRasterLayout(buildTerrainPack());
    const triangle = {
      id: 'negative',
      x: -20,
      y: -30,
      width: 40,
      height: 60,
      polygon: [
        { x: -20, y: -30 },
        { x: 20, y: -30 },
        { x: -20, y: 30 },
      ],
    };
    const cases = [
      ...actual,
      triangle,
      { ...triangle, polygon: triangle.polygon.slice().reverse() },
      { ...triangle, polygon: [...triangle.polygon, triangle.polygon[0]!] },
      { ...triangle, width: 0, height: 0 },
      { ...triangle, polygon: [] },
      { ...triangle, polygon: [{ x: -5, y: -5 }] },
      {
        ...triangle,
        polygon: [
          { x: -20, y: -30 },
          { x: 20, y: -30 },
          { x: 20, y: -29.75 },
          { x: -20, y: -29.75 },
        ],
      },
    ];
    for (const patch of cases)
      expect(
        Buffer.from(forestMaterialMask(patch).pixels).equals(Buffer.from(originalMask(patch))),
        patch.id,
      ).toBe(true);
  });
  it('matches every approved feather byte for all ten actual forest polygons', () => {
    const patches = forestRasterLayout(buildTerrainPack());
    expect(patches).toHaveLength(10);
    for (const patch of patches) {
      const expected = mountainFeatherMask(patch);
      const actual = forestMaterialMask(patch);
      expect(actual.size).toBe(128);
      expect(Buffer.from(actual.pixels).equals(Buffer.from(expected.pixels)), patch.id).toBe(true);
      for (const polygon of [
        patch.polygon.slice().reverse(),
        [...patch.polygon, patch.polygon[0]!],
      ]) {
        const alternate = { ...patch, polygon };
        expect(
          Buffer.from(forestMaterialMask(alternate).pixels).equals(
            Buffer.from(mountainFeatherMask(alternate).pixels),
          ),
        ).toBe(true);
      }
    }
  });

  it('binds world phase, alpha, exact polygon clip and idempotent owned mask cleanup', () => {
    const woodland = texture();
    const patch = forestRasterLayout(buildTerrainPack())[0]!;
    const material = createForestMaterial(woodland, patch);
    expect(material.sprite.texture).toBe(woodland);
    expect(material.sprite.tileScale.x * woodland.width).toBe(96);
    expect(material.sprite.position.x + material.sprite.tilePosition.x).toBe(0);
    expect(material.sprite.position.y + material.sprite.tilePosition.y).toBe(0);
    expect(material.sprite.alpha).toBe(0.35);
    expect(material.sprite.mask).toBe(material.softMask);
    expect(material.container.children[0]!.mask).toBe(material.clip);
    const sharedDestroy = vi.spyOn(woodland, 'destroy');
    const maskDestroy = vi.spyOn(material.softMask.texture, 'destroy');
    material.destroy();
    material.destroy();
    expect(maskDestroy).toHaveBeenCalledTimes(1);
    expect(maskDestroy).toHaveBeenCalledWith(true);
    expect(sharedDestroy).not.toHaveBeenCalled();
    woodland.destroy(true);
  });

  it('omits distance work for outside and zero-extent pixels while keeping opaque mask alpha', () => {
    const hypot = vi.spyOn(Math, 'hypot');
    const patch = {
      id: 'outside',
      x: -100,
      y: -100,
      width: 1,
      height: 1,
      polygon: [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        { x: 1, y: 2 },
      ],
    };
    try {
      for (const p of [patch, { ...patch, width: 0, height: 0, polygon: [] }]) {
        const mask = forestMaterialMask(p);
        expect(mask.pixels.every((v, i) => v === (i % 4 === 3 ? 255 : 0))).toBe(true);
      }
      expect(hypot).not.toHaveBeenCalled();
    } finally {
      hypot.mockRestore();
    }
  });
  it('places ten original woodland materials beneath the unchanged canopy artwork', () => {
    const canopy = texture(),
      woodland = texture();
    const terrain = buildTerrainPack();
    const raster = createForestRaster(canopy, terrain, woodland);
    try {
      expect(raster.coveredIds.size).toBe(10);
      const layer = raster.container.children[0]!;
      expect(layer.label).toBe('forest-woodland-materials');
      expect(layer.children).toHaveLength(10);
    } finally {
      raster.destroy();
      canopy.destroy(true);
      woodland.destroy(true);
    }
  });

  it('retains canopy without optional material and never destroys shared artwork', () => {
    const canopy = texture();
    const destroy = vi.spyOn(canopy, 'destroy');
    const raster = createForestRaster(canopy, buildTerrainPack());
    expect(raster.coveredIds.size).toBe(10);
    expect(
      raster.container.children.some((child) => child.label === 'forest-woodland-materials'),
    ).toBe(false);
    raster.destroy();
    expect(destroy).not.toHaveBeenCalled();
    canopy.destroy(true);
  });
});
