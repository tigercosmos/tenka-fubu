import { describe, expect, it, vi } from 'vitest';
import { BufferImageSource, Texture } from 'pixi.js';
import { createTerrainFieldMaterial } from '@ui/map/terrain/terrainFieldMaterial';
const terrain = { reliefAssetId: 'r', forestAssetId: 'f', rivers: [], lakes: [] };
const outline = { polygons: [{ id: 'world', points: [0, 0, 4096, 0, 4096, 4096, 0, 4096] }] };
function fixture(controlled = true) {
  const texture = new Texture({
    source: new BufferImageSource({ resource: new Uint8Array(7 * 11 * 4), width: 7, height: 11 }),
  });
  const art = Reflect.apply(createTerrainFieldMaterial, null, [
    texture,
    outline,
    terrain,
    controlled,
  ]) as ReturnType<typeof createTerrainFieldMaterial> & {
    setViewport: (x: number, y: number, s: number, w: number, h: number) => void;
  };
  return {
    art,
    texture,
    dispose: () => {
      art.destroy();
      texture.destroy(true);
    },
  };
}
describe('actual field viewport allocation and phase', () => {
  it('opts into hidden bounded first frame while retaining legacy default', () => {
    const a = fixture(),
      b = fixture(false);
    try {
      expect(a.art.sprite.visible).toBe(false);
      expect(a.art.sprite.width).toBe(1);
      expect(b.art.sprite.width).toBe(4096);
      expect(b.art.sprite.visible).toBe(true);
    } finally {
      a.dispose();
      b.dispose();
    }
  });
  it('clamps padded world extent, keeps full static masks and actual NPOT UV arithmetic through pan/zoom/resize', () => {
    const f = fixture();
    try {
      const mask: unknown = f.art.softMask.texture.source.resource;
      for (const [x, y, s, w, h] of [
        [-1500.125, -2400.25, 1.5, 1280, 720],
        [-3999.5, -3700.75, 1, 1920, 1080],
        [12, 25, 0.25, 640, 480],
      ]) {
        f.art.setViewport(x!, y!, s!, w!, h!);
        const left = Math.max(0, Math.min(4096, (-2 - x!) / s!)),
          top = Math.max(0, Math.min(4096, (-2 - y!) / s!));
        const right = Math.max(0, Math.min(4096, (w! + 2 - x!) / s!)),
          bottom = Math.max(0, Math.min(4096, (h! + 2 - y!) / s!));
        expect(f.art.sprite.position).toMatchObject({ x: left, y: top });
        expect(f.art.sprite.width).toBe(right - left);
        expect(f.art.sprite.height).toBe(bottom - top);
        expect(f.art.sprite.tilePosition).toMatchObject({ x: -left, y: -top });
        const world = { x: left + (right - left) * 0.37, y: top + (bottom - top) * 0.61 };
        const uv = f.art.sprite.tileTransform.matrix.applyInverse({
          x: world.x - left,
          y: world.y - top,
        });
        expect(uv.x / 7).toBeCloseTo(world.x / 384, 11);
        expect(uv.y / 7).toBeCloseTo(world.y / 384, 11);
        expect(f.art.softMask.width).toBe(4096);
        expect(f.art.softMask.height).toBe(4096);
        expect(f.art.softMask.texture.source.resource).toBe(mask);
      }
    } finally {
      f.dispose();
    }
  });
  it('does not issue mutations for unchanged bounds and restores phase after roundtrip', () => {
    const f = fixture();
    try {
      f.art.setViewport(-1500, -2400, 2, 1280, 720);
      const pos = vi.spyOn(f.art.sprite.position, 'set'),
        tile = vi.spyOn(f.art.sprite.tilePosition, 'set');
      f.art.setViewport(-1500, -2400, 2, 1280, 720);
      expect(pos).not.toHaveBeenCalled();
      expect(tile).not.toHaveBeenCalled();
      f.art.setViewport(-1400, -2200, 1, 1280, 720);
      f.art.setViewport(-1500, -2400, 2, 1280, 720);
      expect(f.art.sprite.position).toMatchObject({ x: 749, y: 1199 });
      expect(f.art.sprite.tilePosition).toMatchObject({ x: -749, y: -1199 });
    } finally {
      f.dispose();
    }
  });
  it('hides invalid/outside viewport without retaining fullworld first frame, then recovers', () => {
    const f = fixture();
    try {
      for (const v of [
        [NaN, 0, 1, 1280, 720],
        [0, 0, 0, 1280, 720],
        [0, 0, 1, -1, 720],
        [-50000, -50000, 2, 1280, 720],
      ]) {
        f.art.setViewport(...(v as [number, number, number, number, number]));
        expect(f.art.sprite.visible).toBe(false);
        expect(f.art.sprite.width).toBe(1);
        expect(f.art.sprite.height).toBe(1);
      }
      f.art.setViewport(-1000, -1000, 1, 100, 100);
      expect(f.art.sprite.visible).toBe(true);
    } finally {
      f.dispose();
    }
  });
  it('is inert after idempotent destroy and never destroys shared art', () => {
    const f = fixture(),
      shared = vi.spyOn(f.texture, 'destroy'),
      source = vi.spyOn(f.art.softMask.texture.source, 'destroy');
    f.art.setViewport(-1000, -1000, 1, 100, 100);
    f.art.destroy();
    f.art.destroy();
    expect(() => f.art.setViewport(0, 0, 1, 100, 100)).not.toThrow();
    expect(shared).not.toHaveBeenCalled();
    expect(source).toHaveBeenCalledTimes(1);
    f.texture.destroy(true);
  });
});
