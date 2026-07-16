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
// StrictMode 安全：`await Assets.load` 之後、正式登記 refcount／held 之後，務必再檢查
// `this.disposed`（比照 `MapRenderer.init` 的 race 防護慣例）——若此時已 dispose，立刻透過
// `release()` 回收剛才的登記，確保卸載後才 resolve 的 acquire 不會遺留 refcount。

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
}

// 模組層級、跨 instance 共享的狀態（設計文件 §6.2）。
const globalRefcount = new Map<string, number>();
const subTextureCache = new Map<string, Texture>();

function atlasPageKey(page: number): string {
  return `__atlas_page_${page}`;
}

export class MapAssetLoader {
  private readonly held = new Set<string>();
  private disposed = false;

  /** 取得素材對應 Texture（依 kind 走不同路徑）；同 instance 重複 acquire 同 id 為 no-op
   *  （不重複計入 refcount）。 */
  async acquire(id: string): Promise<Texture> {
    if (this.held.has(id)) {
      const cached = this.readCachedTexture(id);
      if (cached !== undefined) return cached;
    }

    const entry = getManifestEntry(id);
    if (entry === undefined) {
      throw new Error(`視覺素材 manifest 查無 id：${id}（12 §3.7）`);
    }

    if (entry.kind === 'atlas') {
      return this.acquireAtlasFrame(id);
    }
    return this.acquireDirect(id, entry.runtimePath);
  }

  /** texture／svg：`alias = id`，直接快取整檔。 */
  private async acquireDirect(id: string, runtimePath: string): Promise<Texture> {
    const key = id;
    Assets.add({ alias: key, src: resolveRuntimeUrl(runtimePath) });
    if ((globalRefcount.get(key) ?? 0) === 0) {
      await Assets.load(key);
    }
    globalRefcount.set(key, (globalRefcount.get(key) ?? 0) + 1);
    this.held.add(id);
    if (this.disposed) {
      // StrictMode race：await 期間本 instance 已 dispose，回收剛才的登記、不留下持有紀錄。
      this.release(id);
      throw new Error(`MapAssetLoader 已 dispose，取消 acquire：${id}（12 §3.7）`);
    }
    return Assets.get<Texture>(key);
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
    Assets.add({ alias: pageKey, src: resolveRuntimeUrl(page.file) });
    if ((globalRefcount.get(pageKey) ?? 0) === 0) {
      await Assets.load(pageKey);
    }
    globalRefcount.set(pageKey, (globalRefcount.get(pageKey) ?? 0) + 1);

    let sub = subTextureCache.get(id);
    if (sub === undefined) {
      const pageTexture = Assets.get<Texture>(pageKey);
      sub = new Texture({
        source: pageTexture.source,
        frame: new Rectangle(frame.x, frame.y, frame.w, frame.h),
      });
      subTextureCache.set(id, sub);
    }
    this.held.add(id);
    if (this.disposed) {
      this.release(id);
      throw new Error(`MapAssetLoader 已 dispose，取消 acquire：${id}（12 §3.7）`);
    }
    return sub;
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
    if (remaining > 0) {
      globalRefcount.set(key, remaining);
      return;
    }

    globalRefcount.delete(key);
    if (frame !== undefined) {
      // 頁歸零：連帶 destroy 由此頁切出的全部 sub-Texture（`destroy(false)`——不連帶 destroy
      // source，source 由頁本身的 `Assets.unload` 釋放）。
      for (const [frameId, frameDef] of Object.entries(ATLAS_FRAME_MAP.frames)) {
        if (atlasPageKey(frameDef.page) !== key) continue;
        const sub = subTextureCache.get(frameId);
        if (sub !== undefined) {
          sub.destroy(false);
          subTextureCache.delete(frameId);
        }
      }
    }
    void Assets.unload(key);
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
  };
}
