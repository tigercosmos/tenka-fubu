import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { Assets, ImageSource, Texture } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapAssetLoader } from '@ui/assets/loader';
import { getManifestEntry } from '@ui/assets/manifest';

const castleIds = [
  'texture.castle.main-plain-v1',
  'texture.castle.main-mountain-v1',
  'texture.castle.branch-plain-v1',
  'texture.castle.branch-mountain-v1',
] as const;

afterEach(() => vi.restoreAllMocks());

describe('original castle texture minification admission', () => {
  it.each(castleIds)('admits %s with mip generation before the first shared load', async (id) => {
    const entry = getManifestEntry(id)!;
    const png = PNG.sync.read(readFileSync(`public/${entry.runtimePath}`));
    let data: Record<string, unknown> | undefined;
    const add = vi.spyOn(Assets, 'add').mockImplementation((asset) => {
      data = (asset as { data?: Record<string, unknown> }).data;
      return Assets;
    });
    // Real ImageSource/Texture, with the installed image parser's data spread.
    // This exercises loader admission, not WebGL upload or generateMipmap.
    let image: Texture;
    const load = vi.spyOn(Assets, 'load').mockImplementation((() => {
      image = new Texture({
        source: new ImageSource({
          resource: png.data as unknown as ImageBitmap,
          width: png.width,
          height: png.height,
          alphaMode: 'premultiply-alpha-on-upload',
          ...data,
        }),
      });
      return Promise.resolve(image);
    }) as typeof Assets.load);
    const unload = vi.spyOn(Assets, 'unload').mockImplementation(() => {
      image.destroy(true);
      return Promise.resolve();
    });
    const a = new MapAssetLoader();
    const b = new MapAssetLoader();
    const [first, second] = await Promise.all([a.acquire(id), b.acquire(id)]);
    try {
      expect(data).toEqual({ autoGenerateMipmaps: true, scaleMode: 'linear' });
      expect(first).toBe(second);
      expect(add).toHaveBeenCalledTimes(1);
      expect(load).toHaveBeenCalledTimes(1);
      expect(first.source.autoGenerateMipmaps).toBe(true);
      expect(first.source.style).toMatchObject({
        minFilter: 'linear',
        magFilter: 'linear',
        mipmapFilter: 'linear',
      });
      expect(first.source.alphaMode).toBe('premultiply-alpha-on-upload');
      expect(first.source.resource).toBe(png.data);
      expect(first.frame).toMatchObject({ x: 0, y: 0, width: png.width, height: png.height });
      expect(first.trim).toBeUndefined();
      expect(first.rotate).toBe(0);
      expect(first.source.mipLevelCount).toBe(1); // GPU initializes the supported chain later.
      a.dispose();
      expect(unload).not.toHaveBeenCalled();
    } finally {
      a.dispose();
      b.dispose();
      await Promise.resolve();
    }
    expect(unload).toHaveBeenCalledTimes(1);
  });

  it('does not change a non-castle source sampling policy', async () => {
    const add = vi.spyOn(Assets, 'add').mockImplementation(() => Assets);
    const image = new Texture({
      source: new ImageSource({
        resource: new Uint8Array(4) as unknown as ImageBitmap,
        width: 1,
        height: 1,
      }),
    });
    vi.spyOn(Assets, 'load').mockImplementation((() =>
      Promise.resolve(image)) as typeof Assets.load);
    vi.spyOn(Assets, 'unload').mockResolvedValue();
    const loader = new MapAssetLoader();
    try {
      await loader.acquire('texture.terrain.forest-canopy-v1');
      expect(add.mock.calls[0]![0]).not.toHaveProperty('data');
      expect(image.source.autoGenerateMipmaps).toBe(false);
    } finally {
      loader.dispose();
      await Promise.resolve();
      image.destroy(true);
    }
  });
});
