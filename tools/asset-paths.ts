// 素材管線共用路徑常數與型別 re-export（比照 tools/font-paths.ts）。
// 拆獨立檔：讓 validate-assets 只 import 這個輕量檔（不必拉 pngjs），與 build-atlas 分離重依賴。
//
// 規格：plan/12-ui-components.md §3.7；M6-V3 設計文件 §3.2。

import path from 'node:path';

export const REPO_ROOT = path.resolve(import.meta.dirname, '..');

/** source 工作檔根（裁決 D2：新設獨立目錄，不與既有 tools/assets/ raw-source 慣例混用語意）。 */
export const ASSETS_SOURCE_DIR = path.join(REPO_ROOT, 'tools/assets/visual/source');
export const ASSETS_SOURCE_FRAMES_DIR = path.join(ASSETS_SOURCE_DIR, 'frames');

/** runtime 素材根（進 build 的 public 目錄）。 */
export const ASSETS_PUBLIC_DIR = path.join(REPO_ROOT, 'public/assets');

/** frame map 產物（checked-in，裁決 D11）。 */
export const GENERATED_DIR = path.join(REPO_ROOT, 'src/ui/assets/generated');
export const ATLAS_FRAMEMAP_PATH = path.join(GENERATED_DIR, 'atlas.frames.json');

/** atlas 分頁 PNG 命名：assets/map/atlas-map-<page>.png。 */
export function atlasPagePublicPath(page: number): string {
  return `assets/map/atlas-map-${page}.png`;
}

/** 單頁上限（§3.7）。 */
export const ATLAS_MAX_PAGE_PX = 2048;

/** 決定性 PNG 編碼選項（見設計 §5.3、裁決 D12）：固定 filterType:0（None）避免 adaptive 濾波器
 *  造成跨輸入不可稽核；固定 deflateLevel/deflateStrategy 使同輸入同 node 環境下位元組一致。 */
export const DETERMINISTIC_PNG_OPTS = {
  deflateLevel: 9,
  deflateStrategy: 3,
  filterType: 0, // None：跨平台最可預期
  colorType: 6, // RGBA
} as const;

export type { VisualAssetManifestEntry } from '../src/ui/assets/manifest';
