// 字型子集管線的共用路徑常數與 manifest 型別。
// 拆成獨立檔案是為了讓 tools/check-font-coverage.ts（validate:data 每次都跑）
// 不需要 import tools/subset-font.ts（進而拉入 `subset-font`／harfbuzzjs wasm），
// 只有實際重新產生字型（npm run font:subset）時才需要那條較重的相依鏈。
//
// 規格：plan/01-architecture.md §3.9.3、A13。

import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

export const OUTPUT_DIR = path.join(REPO_ROOT, 'public/fonts');
export const OUTPUT_WOFF2 = path.join(OUTPUT_DIR, 'noto-serif-tc-subset.woff2');
export const OUTPUT_MANIFEST = path.join(OUTPUT_DIR, 'noto-serif-tc-subset.manifest.json');
export const RAW_FONT_PATH = path.join(REPO_ROOT, 'tools/assets/NotoSerifTC-Regular.ttf');

/** 15 §5.1 表D `perfFontKb`＝2048（非模擬常數，不進 src/core/balance.ts，直接於工具內引用定案值）。 */
export const FONT_SIZE_BUDGET_KB = 2048;

export interface FontManifest {
  readonly generatedAt: string;
  readonly sourceFont: string;
  readonly weight: number;
  readonly charCount: number;
  readonly chars: string;
  readonly sizeBytes: number;
  readonly budgetKb: number;
}
