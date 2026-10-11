// 視覺素材 loader：以 Pixi `Assets` 為底層快取，本模組疊加「跨 instance 引用計數」與 atlas
// frame 的 sub-Texture 切割（規格：plan/12-ui-components.md §3.7；契約見 M6-V3 設計文件 §6）。
//
// 生命週期（設計文件 §6.2）：
// - texture／svg：`alias = id`，直接以 `Assets.load(id)` 快取整檔。
// - atlas：`alias = '__atlas_page_<n>'` 快取整頁；由頁 Texture 切出的 sub-Texture 存於本模組
//   的 `subTextureCache`（不受 Assets 管理，需自行 destroy）。
// - refcount 全局共享（跨 `MapAssetLoader` instance）：多個 renderer 共享同一 atlas 頁時，僅在
//   全部 instance 都釋放後才真正 `Assets.unload`，避免「重掛 renderer 砍到仍在用的共享 texture」。
//
// Pending acquisitions reserve the shared resource before awaiting load. A disposed
// owner cannot unload a page another owner is still acquiring; new generations wait
// for the previous asynchronous unload before loading or creating atlas frames.

import { Assets, Rectangle, Texture } from 'pixi.js';
import { getManifestEntry } from './manifest';
import { ATLAS_FRAME_MAP } from './generated';

/** 以 `BASE_URL` 前綴組出 runtime 素材 URL（`BASE_URL` 尾端已含 `/`，故不會產生雙斜線；
 *  12 §3.7 base-path 對齊，GitHub Pages 子路徑部署安全）。 */
export function resolveRuntimeUrl(runtimePath: string): string {
  return `${import.meta.env.BASE_URL}${runtimePath}`;
}

export interface AssetLoaderStats {
  readonly instanceHeld: readonly string[];
  readonly globalRefcounts: Readonly<Record<string, number>>;
  readonly loadedKeys: readonly string[]; // Assets 已載入的 alias/page key（refcount>0 者）
  readonly unloadErrors: Readonly<Record<string, string>>;
}

// 模組層級、跨 instance 共享的狀態（設計文件 §6.2）。
const globalRefcount = new Map<string, number>();
const subTextureCache = new Map<string, Texture>();

interface SharedResource {
  readonly key: string;
  readonly runtimePath: string;
  users: number; // committed holds plus pending acquisitions
  texture: Texture | null;
  loading: Promise<Texture> | null;
  unloading: Promise<void> | null;
  unloadFailure: { readonly error: unknown } | null;
}
const resources = new Map<string, SharedResource>();

// These original high-resolution castle paintings are strongly minified at map
// scale. Admit their mip policy before the first upload; never mutate an already
// shared source or change atlas/terrain/army sampling. Pixi retains its supported
// backend/NPOT fallback and owns the mip chain with the original source.
const mipmappedCastleAssets = new Set([
  'texture.castle.main-plain-v1',
  'texture.castle.main-mountain-v1',
  'texture.castle.branch-plain-v1',
  'texture.castle.branch-mountain-v1',
]);

function reserveResource(key: string, runtimePath: string): SharedResource {
  let resource = resources.get(key);
  if (resource === undefined) {
    resource = {
      key,
      runtimePath,
      users: 0,
      texture: null,
      loading: null,
      unloading: null,
      unloadFailure: null,
    };
    resources.set(key, resource);
  }
  resource.users++;
  return resource;
}

async function loadResource(resource: SharedResource): Promise<Texture> {
  if (resource.unloading !== null) await resource.unloading;
  if (resource.unloadFailure !== null) throw resource.unloadFailure.error;
  if (resource.texture !== null) return resource.texture;
  if (resource.loading === null) {
    resource.loading = (async () => {
      const asset = { alias: resource.key, src: resolveRuntimeUrl(resource.runtimePath) };
      Assets.add(
        mipmappedCastleAssets.has(resource.key)
          ? { ...asset, data: { autoGenerateMipmaps: true, scaleMode: 'linear' } }
          : asset,
      );
      const texture = await Assets.load<Texture>(resource.key);
      resource.texture = texture;
      return texture;
    })();
  }
  const loading = resource.loading;
  try {
    return await loading;
  } finally {
    if (resource.loading === loading) resource.loading = null;
  }
}

function releaseResource(resource: SharedResource): void {
  resource.users--;
  if (resource.users !== 0) return;
  if (resource.texture === null) {
    if (resource.unloading === null && resource.unloadFailure === null)
      resources.delete(resource.key);
    return;
  }
  // No committed or pending owner remains: subtextures die before their page.
  for (const [id, frame] of Object.entries(ATLAS_FRAME_MAP.frames)) {
    if (atlasPageKey(frame.page) !== resource.key) continue;
    subTextureCache.get(id)?.destroy(false);
    subTextureCache.delete(id);
  }
  resource.texture = null;
  // release/dispose are synchronous. Retain and expose a failed unload, and reject
  // future acquisitions rather than returning a potentially destroyed cache entry.
  resource.unloading = (async () => {
    try {
      await Assets.unload(resource.key);
    } catch (error) {
      resource.unloadFailure = { error };
    } finally {
      resource.unloading = null;
      if (resource.users === 0 && resource.unloadFailure === null) resources.delete(resource.key);
    }
  })();
}

function atlasPageKey(page: number): string {
  return `__atlas_page_${page}`;
}

export class MapAssetLoader {
  private readonly held = new Set<string>();
  private readonly pending = new Map<string, Promise<Texture>>();
  private disposed = false;

  /** 取得素材對應 Texture（依 kind 走不同路徑）；同 instance 重複 acquire 同 id 為 no-op
   *  （不重複計入 refcount）。 */
  async acquire(id: string): Promise<Texture> {
    if (this.disposed) throw new Error(`MapAssetLoader 已 dispose，取消 acquire：${id}（12 §3.7）`);
    if (this.held.has(id)) {
      const cached = this.readCachedTexture(id);
      if (cached !== undefined) return cached;
    }
    const pending = this.pending.get(id);
    if (pending !== undefined) return pending;

    const entry = getManifestEntry(id);
    if (entry === undefined) {
      throw new Error(`視覺素材 manifest 查無 id：${id}（12 §3.7）`);
    }

    const acquisition =
      entry.kind === 'atlas'
        ? this.acquireAtlasFrame(id)
        : this.acquireDirect(id, entry.runtimePath);
    this.pending.set(id, acquisition);
    try {
      return await acquisition;
    } finally {
      if (this.pending.get(id) === acquisition) this.pending.delete(id);
    }
  }

  /** texture／svg：`alias = id`，直接快取整檔。 */
  private async acquireDirect(id: string, runtimePath: string): Promise<Texture> {
    return this.acquireResource(id, reserveResource(id, runtimePath));
  }

  /** atlas frame：頁以 `Assets` 快取，frame 由本模組自建 sub-Texture（不受 Assets 管理）。 */
  private async acquireAtlasFrame(id: string): Promise<Texture> {
    const frame = ATLAS_FRAME_MAP.frames[id];
    if (frame === undefined) {
      throw new Error(`atlas frame map 查無 id：${id}（12 §3.7）`);
    }
    const page = ATLAS_FRAME_MAP.pages[frame.page];
    if (page === undefined) {
      throw new Error(`atlas frame map 頁碼不存在：${id} → page ${frame.page}（12 §3.7）`);
    }
    const pageKey = atlasPageKey(frame.page);
    return this.acquireResource(id, reserveResource(pageKey, page.file), (pageTexture) => {
      let sub = subTextureCache.get(id);
      if (sub === undefined) {
        sub = new Texture({
          source: pageTexture.source,
          frame: new Rectangle(frame.x, frame.y, frame.w, frame.h),
        });
        subTextureCache.set(id, sub);
      }
      return sub;
    });
  }

  private async acquireResource(
    id: string,
    resource: SharedResource,
    project: (texture: Texture) => Texture = (texture) => texture,
  ): Promise<Texture> {
    try {
      const texture = await loadResource(resource);
      if (this.disposed)
        throw new Error(`MapAssetLoader 已 dispose，取消 acquire：${id}（12 §3.7）`);
      const result = project(texture);
      globalRefcount.set(resource.key, (globalRefcount.get(resource.key) ?? 0) + 1);
      this.held.add(id);
      // The lease is committed even if outer async wrappers have not settled yet.
      // A release/reacquire in that microtask window must not reuse this old promise.
      this.pending.delete(id);
      return result;
    } catch (error) {
      releaseResource(resource);
      throw error;
    }
  }

  /** 批次 acquire（首屏 preload）。任一失敗整體 reject，但已 acquire 的仍計入本 instance
   *  （呼叫端可 dispose 回收）。 */
  async acquireMany(ids: readonly string[]): Promise<void> {
    for (const id of ids) {
      await this.acquire(id);
    }
  }

  /** 釋放本 instance 對某 id 的持有（decrement refcount；歸零才真正 `Assets.unload`，不砍
   *  仍被其他 instance 持有的共享 atlas 頁）。 */
  release(id: string): void {
    if (!this.held.has(id)) return;
    this.held.delete(id);

    const entry = getManifestEntry(id);
    const frame = entry?.kind === 'atlas' ? ATLAS_FRAME_MAP.frames[id] : undefined;
    const key = frame !== undefined ? atlasPageKey(frame.page) : id;

    const remaining = (globalRefcount.get(key) ?? 0) - 1;
    if (remaining > 0) globalRefcount.set(key, remaining);
    else globalRefcount.delete(key);
    const resource = resources.get(key);
    if (resource !== undefined) releaseResource(resource);
  }

  /** 冪等：釋放本 instance 全部持有並清空 held；可重複呼叫、可在 acquire 進行中呼叫。 */
  dispose(): void {
    this.disposed = true;
    for (const id of [...this.held]) {
      this.release(id);
    }
  }

  isHeld(id: string): boolean {
    return this.held.has(id);
  }

  /** DEV/測試診斷用：目前本 instance 持有的 id 清單（唯讀快照）。 */
  getHeldIds(): readonly string[] {
    return Array.from(this.held);
  }

  private readCachedTexture(id: string): Texture | undefined {
    const sub = subTextureCache.get(id);
    if (sub !== undefined) return sub;
    return Assets.get<Texture>(id) as Texture | undefined;
  }
}

/** DEV/測試診斷（裁決 D10）。 */
export function getAssetLoaderStats(loader?: MapAssetLoader): AssetLoaderStats {
  return {
    instanceHeld: loader === undefined ? [] : loader.getHeldIds(),
    globalRefcounts: Object.fromEntries(globalRefcount),
    loadedKeys: Array.from(globalRefcount.keys()),
    unloadErrors: Object.fromEntries(
      [...resources]
        .filter(([, resource]) => resource.unloadFailure !== null)
        .map(([key, resource]) => [key, String(resource.unloadFailure?.error)]),
    ),
  };
}
