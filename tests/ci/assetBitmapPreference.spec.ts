import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Assets,
  DOMAdapter,
  ImageSource,
  Loader,
  Texture,
  WorkerManager,
  loadTextures,
} from 'pixi.js';

// Real pinned parser/source/texture objects; decoding is controlled here.
// Native remount tests separately exercise actual browser image decoding.
const originalAdapter = DOMAdapter.get();
const originalConfig = { ...loadTextures.config! };
const owned: Texture[] = [];
const url = 'https://assets.test/fixture@2x.png';
const asset = {
  src: url,
  data: { resolution: 2, autoGenerateMipmaps: true, scaleMode: 'linear' as const },
};
const bitmap = () => ({ width: 8, height: 6, close: vi.fn() }) as unknown as ImageBitmap;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  // Explicit stock-compatible control, independent of other application policy.
  Object.assign(loadTextures.config!, originalConfig, {
    preferWorkers: true,
    preferCreateImageBitmap: true,
  });
});
afterEach(async () => {
  for (const texture of owned.splice(0))
    if (!texture.destroyed) await loadTextures.unload!(texture, undefined, new Loader());
  DOMAdapter.set(originalAdapter);
  Object.assign(loadTextures.config!, originalConfig);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function assertSource(texture: Texture, resource: ImageBitmap, alphaMode: string) {
  expect(texture).toBeInstanceOf(Texture);
  expect(texture.source).toBeInstanceOf(ImageSource);
  expect(texture.source.resource).toBe(resource);
  expect(texture.source).toMatchObject({
    resolution: 2,
    alphaMode,
    autoGenerateMipmaps: true,
    pixelWidth: 8,
    pixelHeight: 6,
  });
  expect(texture.source.style).toMatchObject({ minFilter: 'linear', magFilter: 'linear' });
  expect(texture.frame).toMatchObject({ x: 0, y: 0, width: 4, height: 3 });
  expect(texture.destroyed).toBe(false);
  expect(texture.source.destroyed).toBe(false);
}

describe('pinned Pixi image-loader preference routing', () => {
  it('CONTROL: true preference selects the worker path and preserves source options', async () => {
    const resource = bitmap();
    const support = vi.spyOn(WorkerManager, 'isImageBitmapSupported').mockResolvedValue(true);
    const workerLoad = vi.spyOn(WorkerManager, 'loadImageBitmap').mockResolvedValue(resource);
    const fetch = vi.fn<typeof globalThis.fetch>();
    DOMAdapter.set({ ...originalAdapter, fetch });
    const decode = vi.fn();
    vi.stubGlobal('createImageBitmap', decode);
    Assets.setPreferences({ preferWorkers: true });
    const texture = await loadTextures.load!<Texture>(url, asset, new Loader());
    owned.push(texture);
    expect(support).toHaveBeenCalledTimes(1);
    expect(workerLoad).toHaveBeenCalledTimes(1);
    expect(workerLoad).toHaveBeenCalledWith(url, asset);
    expect(fetch).not.toHaveBeenCalled();
    expect(decode).not.toHaveBeenCalled();
    assertSource(texture, resource, 'premultiply-alpha-on-upload');
  });

  it.each(['default', 'premultiplied-alpha'] as const)(
    'GREEN: false preference keeps async main decoding and ownership (%s)',
    async (alpha) => {
      const response = deferred<Response>();
      const decoded = deferred<ImageBitmap>();
      const fetch = vi.fn<typeof globalThis.fetch>(() => response.promise);
      DOMAdapter.set({ ...originalAdapter, fetch });
      const decode = vi.fn<
        (source: ImageBitmapSource, options?: ImageBitmapOptions) => Promise<ImageBitmap>
      >(() => decoded.promise);
      vi.stubGlobal('createImageBitmap', decode);
      // These fail immediately if either image-worker route is entered.
      const support = vi.spyOn(WorkerManager, 'isImageBitmapSupported').mockImplementation(() => {
        throw new Error('Unexpected image-worker support probe');
      });
      const workerLoad = vi.spyOn(WorkerManager, 'loadImageBitmap').mockImplementation(() => {
        throw new Error('Unexpected image-worker decode');
      });
      Assets.setPreferences({ preferWorkers: false });
      const metadata =
        alpha === 'default' ? asset : { ...asset, data: { ...asset.data, alphaMode: alpha } };
      let settled = false;
      const loading = loadTextures.load!<Texture>(url, metadata, new Loader()).then((texture) => {
        owned.push(texture);
        settled = true;
        return texture;
      });
      // Keep early assertion failures from leaving an unobserved rejection;
      // the original loading promise is still awaited below.
      void loading.catch(() => undefined);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(url);
      expect(decode).not.toHaveBeenCalled();
      expect(settled).toBe(false);
      response.resolve(
        new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } }),
      );
      await vi.waitFor(() => expect(decode).toHaveBeenCalledTimes(1));
      expect(settled).toBe(false);
      const [blob] = decode.mock.calls[0]!;
      expect(blob).toBeInstanceOf(Blob);
      expect(Array.from(new Uint8Array(await (blob as Blob).arrayBuffer()))).toEqual([1, 2, 3]);
      if (alpha === 'default') expect(decode.mock.calls).toEqual([[blob]]);
      else expect(decode.mock.calls).toEqual([[blob, { premultiplyAlpha: 'none' }]]);
      const resource = bitmap();
      decoded.resolve(resource);
      const texture = await loading;
      expect(settled).toBe(true);
      expect(support).not.toHaveBeenCalled();
      expect(workerLoad).not.toHaveBeenCalled();
      assertSource(texture, resource, alpha === 'default' ? 'premultiply-alpha-on-upload' : alpha);
      const source = texture.source;
      await loadTextures.unload!(texture, metadata, new Loader());
      expect(texture.destroyed).toBe(true);
      expect(source.destroyed).toBe(true);
      expect(source.resource).toBeNull();
    },
  );
});
