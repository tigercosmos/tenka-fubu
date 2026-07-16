// Atlas 打包工具（規格：plan/12-ui-components.md §3.7；決定性排序＋shelf packing＋分頁演算法見
// M6-V3 設計文件 §3.6、§5）。
//
// 分層（比照 tools/validate.ts「純函式庫＋CLI 包裝」慣例）：
// - `buildAtlas(frames)`：純函式，不讀寫檔、不呼叫 `process.exit`，同輸入必得同輸出（決定性）。
//   排序（§5.1 步驟1）→ shelf packing／分頁（步驟2）→ RGBA 合成（步驟3）→ pngjs 決定性編碼（步驟4）
//   → frame map／頁 PNG buffer（步驟5）。
// - `main()`：CLI 包裝——讀 `VISUAL_ASSET_MANIFEST` 過濾 `kind:'atlas'`、解碼來源 PNG、呼叫
//   `buildAtlas`、落盤產物、印出應填回 manifest 的 `contentHash`（裁決 D4／AD7 相關）。
//
// 決定性與跨平台注意事項（設計文件 §5.3、§12）：排序／packing／frame map 全為整數運算，跨平台、
// 跨 node 版本位元組級一致；PNG 頁 bytes 僅在「同一進程雙跑」保證一致（本檔測試即以此為準），
// 跨平台頁 bytes 不作為 validate-assets 的比對基準（那是 Slice C 的責任，見設計 §12 第 1 點）。

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { PNG } from 'pngjs';

import {
  ASSETS_PUBLIC_DIR,
  ATLAS_FRAMEMAP_PATH,
  ATLAS_MAX_PAGE_PX,
  DETERMINISTIC_PNG_OPTS,
  GENERATED_DIR,
  REPO_ROOT,
  atlasPagePublicPath,
} from './asset-paths';
import { VISUAL_ASSET_MANIFEST } from '../src/ui/assets/manifest';
import type { AtlasFrame, AtlasFrameMap, AtlasPage } from '../src/ui/assets/generated';

/** shelf packing 的 frame 間距（裁決：`PADDING = 0`，決定性且簡單，占位素材無 bleed 需求；
 *  見 12 §3.7 設計決策、M6-V3 設計文件 §5.1）。 */
const PADDING = 0;

/** 打包用來源 frame（設計文件 §3.6 逐字契約，不得增刪欄位）。 */
export interface AtlasSourceFrame {
  id: string; // frame key（＝manifest id）
  width: number;
  height: number;
  rgba: Uint8Array; // length = width*height*4
  sourceHash: string; // sha256 of the authored source png
}

/** `buildAtlas()` 回傳值（設計文件 §3.6 逐字契約）。 */
export interface BuildAtlasResult {
  frameMap: AtlasFrameMap; // 見 §3.5（pages[].contentHash 為記憶體重算之頁 hash）
  pagePngs: { file: string; png: Buffer }[]; // 決定性編碼後的頁 PNG buffer（CLI 才落盤）
}

function sha256hex(buf: Buffer | Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex');
}

/** 大於等於 `n` 的最小 2 的次方（`n<=1` 時回傳 1）。 */
function nextPowerOfTwo(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

interface Placement {
  id: string;
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface PackResult {
  placements: Placement[];
  /** 每頁實際使用的寬／高（未裁到 2 次方前的外接尺寸）；索引即頁碼。 */
  pageUsedWidth: number[];
  pageUsedHeight: number[];
}

/**
 * 決定性 shelf（列）packing（設計文件 §5.1 步驟2）。輸入須已按 id 二進位升冪排序。
 *
 * 演算法：目標頁邊長從「能容納全部 frame 最寬／最高邊」的最小 2 的次方起算（下限 128、上限
 * `ATLAS_MAX_PAGE_PX`）；逐 frame 放入目前 shelf，若當列剩餘寬度不足則換列，若整頁高度不足則
 * 開新頁。單一 frame 任一邊超過 `ATLAS_MAX_PAGE_PX` 視為不可打包，直接拋錯（該情形不該發生於
 * 占位素材，交由呼叫端／CLI 視為 build 失敗）。
 */
function packFrames(sortedFrames: readonly AtlasSourceFrame[]): PackResult {
  if (sortedFrames.length === 0) {
    return { placements: [], pageUsedWidth: [], pageUsedHeight: [] };
  }

  for (const frame of sortedFrames) {
    if (frame.width > ATLAS_MAX_PAGE_PX || frame.height > ATLAS_MAX_PAGE_PX) {
      throw new Error(
        `atlas frame「${frame.id}」尺寸 ${frame.width}x${frame.height} 超過單頁上限 ` +
          `${ATLAS_MAX_PAGE_PX}px（12 §3.7）`,
      );
    }
  }

  // 工作頁邊長：取全部 frame 寬／高最大值的最小 2 次方（同時涵蓋寬與高，避免狹長 frame
  // 在單頁高度不足時陷入無窮開新頁），下限 128、上限 ATLAS_MAX_PAGE_PX。
  const maxDim = sortedFrames.reduce((m, f) => Math.max(m, f.width, f.height), 0);
  const workingPageSize = Math.min(Math.max(nextPowerOfTwo(maxDim), 128), ATLAS_MAX_PAGE_PX);

  const placements: Placement[] = [];
  const pageUsedWidth: number[] = [0];
  const pageUsedHeight: number[] = [0];

  let page = 0;
  let shelfX = 0;
  let shelfY = 0;
  let shelfHeight = 0;

  for (const frame of sortedFrames) {
    if (shelfX + frame.width > workingPageSize) {
      // 當列剩餘寬度不足 → 換下一列。
      shelfY += shelfHeight + PADDING;
      shelfX = 0;
      shelfHeight = 0;
    }
    if (shelfY + frame.height > workingPageSize) {
      // 整頁已滿 → 開新頁，該 frame 從新頁左上重試。
      page += 1;
      shelfX = 0;
      shelfY = 0;
      shelfHeight = 0;
      pageUsedWidth[page] = 0;
      pageUsedHeight[page] = 0;
    }

    placements.push({ id: frame.id, page, x: shelfX, y: shelfY, w: frame.width, h: frame.height });

    shelfX += frame.width + PADDING;
    shelfHeight = Math.max(shelfHeight, frame.height);
    pageUsedWidth[page] = Math.max(pageUsedWidth[page] ?? 0, shelfX - PADDING);
    pageUsedHeight[page] = Math.max(pageUsedHeight[page] ?? 0, shelfY + frame.height);
  }

  return { placements, pageUsedWidth, pageUsedHeight };
}

/** 把單頁全部 frame 的 RGBA 逐列 blit 到頁緩衝（透明背景，全 0）。 */
function compositePage(
  width: number,
  height: number,
  placements: readonly Placement[],
  framesById: ReadonlyMap<string, AtlasSourceFrame>,
): Uint8Array {
  const data = new Uint8Array(width * height * 4);
  for (const placement of placements) {
    const frame = framesById.get(placement.id);
    if (frame === undefined) continue;
    const rowBytes = frame.width * 4;
    for (let row = 0; row < frame.height; row += 1) {
      const srcStart = row * rowBytes;
      const destStart = ((placement.y + row) * width + placement.x) * 4;
      data.set(frame.rgba.subarray(srcStart, srcStart + rowBytes), destStart);
    }
  }
  return data;
}

/** 決定性 PNG 編碼（`DETERMINISTIC_PNG_OPTS`：固定 deflate 選項＋`filterType:0`，見設計 §5.3）。 */
function encodePagePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const png = new PNG({ width, height });
  png.data = Buffer.from(rgba);
  return PNG.sync.write(png, DETERMINISTIC_PNG_OPTS);
}

/**
 * 純函式：決定性 atlas 打包（設計文件 §3.6、§5.1 逐字契約）。不讀寫檔、不呼叫
 * `process.exit`。同一 `frames` 輸入必得同一輸出。
 */
export function buildAtlas(frames: readonly AtlasSourceFrame[]): BuildAtlasResult {
  // 步驟1：id 二進位升冪排序（不用 localeCompare，見裁決 D5）。
  const sorted = [...frames].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const framesById = new Map(sorted.map((f) => [f.id, f] as const));

  // 步驟2：shelf packing／分頁。
  const { placements, pageUsedWidth, pageUsedHeight } = packFrames(sorted);

  const pageCount = pageUsedWidth.length;
  const pages: AtlasPage[] = [];
  const pagePngs: { file: string; png: Buffer }[] = [];

  for (let page = 0; page < pageCount; page += 1) {
    // 頁裁到實際使用範圍的最小外接 2 的次方（省 bytes，決定性）。
    const width = nextPowerOfTwo(pageUsedWidth[page] ?? 0);
    const height = nextPowerOfTwo(pageUsedHeight[page] ?? 0);
    const pagePlacements = placements.filter((p) => p.page === page);

    // 步驟3：合成頁 RGBA。
    const rgba = compositePage(width, height, pagePlacements, framesById);
    // 步驟4：決定性 PNG 編碼。
    const png = encodePagePng(width, height, rgba);
    const file = atlasPagePublicPath(page);
    pages.push({ file, width, height, contentHash: sha256hex(png) });
    pagePngs.push({ file, png });
  }

  // 步驟5：frame map（key 依排序後順序寫入，物件 key 順序即決定性）。
  const frameEntries: Record<string, AtlasFrame> = {};
  for (const frame of sorted) {
    const placement = placements.find((p) => p.id === frame.id);
    if (placement === undefined) continue; // 理論上不會發生：每個輸入 frame 皆會被 packFrames 放置。
    frameEntries[frame.id] = {
      page: placement.page,
      x: placement.x,
      y: placement.y,
      w: placement.w,
      h: placement.h,
      sourceHash: frame.sourceHash,
    };
  }

  const frameMap: AtlasFrameMap = {
    version: 1,
    generatedBy: 'tools/build-atlas.ts',
    pages,
    frames: frameEntries,
  };

  return { frameMap, pagePngs };
}

// ═══════════════════════════════════════════════════════════════════
// CLI（設計文件 §5.2）
// ═══════════════════════════════════════════════════════════════════

function main(): void {
  const atlasEntries = VISUAL_ASSET_MANIFEST.filter((e) => e.kind === 'atlas');
  const frames: AtlasSourceFrame[] = [];

  for (const entry of atlasEntries) {
    if (entry.sourcePath === null) {
      console.error(`ERROR atlas 素材「${entry.id}」缺少 sourcePath（12 §3.7）`);
      process.exit(1);
    }
    const sourceFile = path.join(REPO_ROOT, entry.sourcePath);
    const raw = readFileSync(sourceFile);
    const decoded = PNG.sync.read(raw);
    if (
      entry.pixelSize !== null &&
      (decoded.width !== entry.pixelSize.width || decoded.height !== entry.pixelSize.height)
    ) {
      console.error(
        `ERROR atlas 素材「${entry.id}」宣告尺寸 ${entry.pixelSize.width}x${entry.pixelSize.height} ` +
          `與來源檔實際尺寸 ${decoded.width}x${decoded.height} 不符（12 §3.7）`,
      );
      process.exit(1);
    }
    frames.push({
      id: entry.id,
      width: decoded.width,
      height: decoded.height,
      rgba: new Uint8Array(decoded.data),
      sourceHash: sha256hex(raw),
    });
  }

  const result = buildAtlas(frames);

  const publicRootDir = path.dirname(ASSETS_PUBLIC_DIR); // 'public'（atlasPagePublicPath 回傳的相對路徑以此為根）
  for (const { file, png } of result.pagePngs) {
    const outPath = path.join(publicRootDir, file);
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, png);
  }

  mkdirSync(GENERATED_DIR, { recursive: true });
  writeFileSync(ATLAS_FRAMEMAP_PATH, JSON.stringify(result.frameMap, null, 2) + '\n', 'utf-8');

  console.log(
    `atlas 打包完成：${result.pagePngs.length} 頁、${frames.length} 筆 frame。` +
      `以下為應填回 src/ui/assets/manifest.ts 的 contentHash（12 §3.7）：`,
  );
  for (const frame of frames) {
    console.log(`  ${frame.id} -> ${frame.sourceHash}`);
  }

  process.exit(0);
}

// ESM 直接執行判準（比照既有 tools/*.ts 慣例；`"type":"module"` 下無 `require.main`）。
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
