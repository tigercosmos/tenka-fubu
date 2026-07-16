// 首屏視覺素材 preload singleton（規格：plan/12-ui-components.md §3.7；M6-V3 設計文件 §6.3）。
//
// process 生命週期內僅 warm 一次 Pixi `Assets` 快取（`bootLoader` 為 module-level singleton、
// 冪等），StrictMode 雙掛載安全（第二次呼叫直接 no-op）。本里程碑僅預熱快取——尚未有畫面消費
// 這些 texture（`MapRenderer` 於 V5 起才接上 atlas frame）。

import { MapAssetLoader } from '../ui/assets/loader';
import { FIRST_SCREEN_ASSET_IDS } from '../ui/assets/manifest';

let bootLoader: MapAssetLoader | null = null;

/** 首屏必要視覺素材 preload；process 生命週期內冪等（第二次呼叫直接 no-op，StrictMode 安全）。 */
export async function preloadFirstScreenAssets(): Promise<void> {
  if (bootLoader !== null) return;
  const loader = new MapAssetLoader();
  bootLoader = loader;
  await loader.acquireMany(FIRST_SCREEN_ASSET_IDS);
}

/** 釋放首屏素材（僅供 `main.tsx` 卸載／測試 teardown 使用；preload 本身不隨畫面切換 dispose）。 */
export function disposeFirstScreenAssets(): void {
  bootLoader?.dispose();
  bootLoader = null;
}
