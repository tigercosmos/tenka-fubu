import { describe, expect, it, vi } from 'vitest';
import { BufferImageSource, Container, Sprite, Texture } from 'pixi.js';
import { createSeaSurface, seaSurfacePixels, SEA_MATERIAL } from '@ui/map/terrain/seaSurface';

describe('original static sea surface', () => {
  it('reproduces capped opaque two-dimensional material without RNG or high contrast bands', () => {
    const random = vi.spyOn(Math, 'random').mockImplementation(() => {
      throw new Error('No RNG permitted');
    });
    try {
      const a = seaSurfacePixels(),
        b = seaSurfacePixels();
      expect(Buffer.compare(Buffer.from(a.pixels), Buffer.from(b.pixels))).toBe(0);
      expect(a.pixels.byteLength).toBe(SEA_MATERIAL.maxBytes);
      let nonOpaque = 0,
        low = 255,
        high = 0,
        maxNeighbor = 0;
      for (let y = 0; y < a.resolution; y++)
        for (let x = 0; x < a.resolution; x++) {
          const i = (y * a.resolution + x) * 4;
          if (a.pixels[i + 3] !== 255) nonOpaque++;
          low = Math.min(low, a.pixels[i]!);
          high = Math.max(high, a.pixels[i]!);
          if (x > 0) maxNeighbor = Math.max(maxNeighbor, Math.abs(a.pixels[i]! - a.pixels[i - 4]!));
          if (y > 0)
            maxNeighbor = Math.max(
              maxNeighbor,
              Math.abs(a.pixels[i]! - a.pixels[i - a.resolution * 4]!),
            );
        }
      expect(high - low).toBeGreaterThan(4);
      expect(nonOpaque).toBe(0);
      expect(high - low).toBeLessThan(20);
      expect(maxNeighbor).toBeLessThanOrEqual(4);
      const value = (x: number, y: number) => a.pixels[(y * a.resolution + x) * 4]!;
      expect(
        new Set([value(32, 128), value(128, 128), value(256, 128), value(480, 128)]).size,
      ).toBeGreaterThan(1);
      expect(
        new Set([value(128, 32), value(128, 128), value(128, 256), value(128, 480)]).size,
      ).toBeGreaterThan(1);
      expect(random).not.toHaveBeenCalled();
      for (const [worldX, worldY] of [
        [2048, 2048],
        [2100, 3100],
        [2700, 2700],
      ]) {
        const cx = Math.floor((worldX! / 4096) * a.resolution),
          cy = Math.floor((worldY! / 4096) * a.resolution);
        const values: number[] = [];
        for (let y = cy - 6; y <= cy + 6; y++)
          for (let x = cx - 6; x <= cx + 6; x++) values.push(value(x, y));
        expect(Math.max(...values) - Math.min(...values)).toBeGreaterThanOrEqual(2);
        expect(Math.max(...values) - Math.min(...values)).toBeLessThan(10);
      }
    } finally {
      random.mockRestore();
    }
  });
  it('uses actual public Pixi owned buffer/texture/sprite and static world geometry', () => {
    const a = createSeaSurface({ resolution: 64 });
    expect(a.sprite).toBeInstanceOf(Sprite);
    expect(a.texture.source).toBeInstanceOf(BufferImageSource);
    expect(a.texture.source.resource).toBeInstanceOf(Uint8Array);
    expect(a.texture.source.width).toBe(64);
    expect(a.texture.source.height).toBe(64);
    expect(a.texture.source.scaleMode).toBe('linear');
    expect(a.sprite.width).toBe(4096);
    expect(a.sprite.height).toBe(4096);
    expect(a.sprite.position.x).toBe(0);
    expect(a.sprite.position.y).toBe(0);
    expect(a.sprite.rotation).toBe(0);
    expect(a.sprite.tint).toBe(0xffffff);
    expect(a.sprite.alpha).toBe(1);
    expect(a.container.eventMode).toBe('none');
    expect(a.sprite.eventMode).toBe('none');
    expect(a.sprite.mask).toBeUndefined();
    expect(a.container.children).toEqual([a.sprite]);
    expect(a.getDiagnostics()).toEqual({
      resolution: 64,
      rawBytes: 16384,
      ownedRawBytes: 16384,
      rgbaBytes: 16384,
      ownedTextures: 1,
      ownedSources: 1,
      facets: 96,
      destroyed: false,
    });
    expect(Object.isFrozen(a.getDiagnostics())).toBe(true);
    a.destroy();
  });
  it('disposes its own source exactly once without touching WHITE or a separate live owner', () => {
    const whiteSource = Texture.WHITE.source;
    const whiteDestroyed = whiteSource.destroyed;
    const a = createSeaSurface({ resolution: 32 }),
      b = createSeaSurface({ resolution: 32 });
    const source = a.texture.source,
      dispose = vi.fn();
    source.on('destroy', dispose);
    const parent = new Container();
    parent.addChild(a.container, b.container);
    a.destroy();
    a.destroy();
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(source.destroyed).toBe(true);
    expect(a.texture.destroyed).toBe(true);
    expect(a.sprite.destroyed).toBe(true);
    expect(parent.children).toEqual([b.container]);
    expect(b.sprite.destroyed).toBe(false);
    expect(b.texture.source.destroyed).toBe(false);
    expect(Texture.WHITE.source).toBe(whiteSource);
    expect(whiteSource.destroyed).toBe(whiteDestroyed);
    expect(a.getDiagnostics().ownedRawBytes).toBe(0);
    b.destroy();
    parent.destroy();
  });
  it('rejects invalid allocation sizes before constructing Pixi resources', () => {
    for (const resolution of [0, 31, 513, Infinity, NaN, 128.5, -1]) {
      expect(() => seaSurfacePixels(resolution)).toThrow(RangeError);
      expect(() => createSeaSurface({ resolution })).toThrow(RangeError);
    }
    expect(seaSurfacePixels(32).pixels.byteLength).toBe(4096);
  });
});
