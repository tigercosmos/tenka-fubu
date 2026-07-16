// 視覺素材驗證工具（規格：plan/12-ui-components.md §3.7；M6-V3 設計文件 §4；補遺 AD2／AD3）。
//
// 分層（比照 tools/validate.ts、tools/check-font-coverage.ts 的「純函式庫＋CLI 包裝」慣例）：
// - `validateAssets(options?)`：純函式，不讀取編譯期常數以外的全域狀態、不印東西、不呼叫
//   `process.exit`；全部路徑／manifest 皆可由 `options` 注入，供 Vitest 以 `mkdtempSync` 假環境
//   逐條驗收 A01–A16（見設計文件 §9.4）。
// - `main()`：CLI 包裝——印 per-domain bytes／首屏預算彙總、逐條印違規、決定 exit code。
//
// 檢查清單 A01–A16 對應設計文件 §4.2；exit 與 notice 語意依補遺 AD3（非設計文件 §4.3 草稿的筆誤版）：
// - exit code：`errors.length > 0 ? 1 : 0`。
// - `notice` 僅在 `assetsPublicDir` 目錄整個不存在時產生（極早期過渡狀態）：此時跳過 A09–A16
//   （檔案系統相依檢查），但 A01–A08（manifest 內在檢查）照跑；notice 不吞掉任何已產生的 ERROR。

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { PNG } from 'pngjs';

import {
  ASSET_ID_RE,
  FIRST_SCREEN_ASSET_IDS,
  FORBIDDEN_NAME_TOKENS,
  VALID_LICENSES,
  VISUAL_ASSET_MANIFEST,
  type VisualAssetManifestEntry,
} from '../src/ui/assets/manifest';
import {
  ASSETS_PUBLIC_DIR,
  ASSETS_SOURCE_DIR,
  ATLAS_FRAMEMAP_PATH,
  REPO_ROOT,
} from './asset-paths';
import { buildAtlas, type AtlasSourceFrame } from './build-atlas';
import type { AtlasFrameMap } from '../src/ui/assets/generated';
import { UI } from '../src/ui/uiConstants';

// ═══════════════════════════════════════════════════════════════════
// 型別（設計文件 §4.1 逐字契約）
// ═══════════════════════════════════════════════════════════════════

export interface AssetViolation {
  level: 'ERROR' | 'WARN';
  code: string; // 如 'A01-id-dup'
  message: string; // 繁中、附（12 §3.7）
  ids?: string[];
}

export interface AssetValidationResult {
  errors: AssetViolation[];
  warnings: AssetViolation[];
  notice: string | null; // 過渡期豁免說明（見 AD3）
  domainBytes: Record<'icons' | 'map' | 'textures', number>;
  firstScreenBytes: number;
}

export interface ValidateAssetsOptions {
  manifestPath?: string; // 測試覆寫：讀取一份 JSON manifest（罕用；正常測試優先用 `manifest`）
  manifest?: readonly VisualAssetManifestEntry[]; // 直接注入（測試優先用此，比照 font-coverage 手法）
  assetsPublicDir?: string; // 預設 ASSETS_PUBLIC_DIR
  assetsSourceDir?: string; // 預設 ASSETS_SOURCE_DIR
  frameMapPath?: string; // 預設 ATLAS_FRAMEMAP_PATH
  budgetBytesMax?: number; // 預設 UI.initialVisualAssetBytesMax
}

// ═══════════════════════════════════════════════════════════════════
// 小工具
// ═══════════════════════════════════════════════════════════════════

function sha256hex(buf: Buffer | Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex');
}

function err(code: string, message: string, ids: string[] = []): AssetViolation {
  return { level: 'ERROR', code, message, ids };
}

// 目前 A01–A16 全部為 ERROR（設計文件 §4.2 未定義任何 WARN 案例）；`warnings` 欄位保留供未來
// 擴充（如新增非阻斷性建議），`AssetValidationResult.warnings` 現階段恆為空陣列。

/** 相對路徑（如 manifest 內建常見的 repo 相對字串）解回絕對路徑；已是絕對路徑則原樣返回
 *  （供測試以 `mkdtempSync` 注入絕對路徑的假 manifest 亦可正確運作）。 */
function resolveRepoPath(value: string): string {
  return path.isAbsolute(value) ? value : path.join(REPO_ROOT, value);
}

/** manifest 的 `runtimePath`／frame map 的 `pages[].file` 皆是「以 public/ 為根」的相對路徑
 *  （一律帶 `assets/` 前綴、不帶前導斜線，12 §3.7、設計文件 §1）；`assetsPublicDir` 本身即
 *  `public/assets` 目錄，故實際磁碟路徑＝`assetsPublicDir` + 去掉 `assets/` 前綴後的餘下部分。 */
function publicFilePath(assetsPublicDir: string, publicRelativePath: string): string {
  return path.join(assetsPublicDir, publicRelativePath.replace(/^assets\//, ''));
}

function fileSize(absPath: string): number {
  try {
    return statSync(absPath).size;
  } catch {
    return 0;
  }
}

function listFilesRecursive(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  const stack: string[] = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) continue;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile()) out.push(full);
    }
  }
  return out;
}

/** 取檔名 stem（去副檔名／去 `@<n>x` 縮放後綴）後以 `-`／`.` 切段（補遺 AD2：逐段完全比對，
 *  不可用 substring `includes`，否則 `renewal`、`newmoon` 誤報）。`hasExtension=false` 用於
 *  kind:'atlas' 的 `runtimePath`（其值＝id，非真實檔案路徑，不含副檔名）。 */
function nameStemSegments(value: string, hasExtension: boolean): string[] {
  const base = path.basename(value);
  const ext = hasExtension ? path.extname(base) : '';
  const withoutExt = ext.length > 0 ? base.slice(0, base.length - ext.length) : base;
  const withoutScale = withoutExt.replace(/@[0-9]+x$/, '');
  return withoutScale.split(/[-.]/).filter((segment) => segment.length > 0);
}

function forbiddenTokenHit(segments: readonly string[]): string | undefined {
  const forbidden = FORBIDDEN_NAME_TOKENS as readonly string[];
  return segments.find((segment) => forbidden.includes(segment));
}

function assetDomain(id: string): 'icons' | 'map' | 'textures' | null {
  const head = id.split('.')[0];
  if (head === 'texture') return 'textures';
  if (head === 'map') return 'map';
  if (head === 'icon') return 'icons';
  return null;
}

// ═══════════════════════════════════════════════════════════════════
// 純函式：validateAssets（設計文件 §4.1 簽名逐字對照）
// ═══════════════════════════════════════════════════════════════════

export function validateAssets(options: ValidateAssetsOptions = {}): AssetValidationResult {
  const manifest =
    options.manifest ??
    (options.manifestPath !== undefined
      ? (JSON.parse(readFileSync(options.manifestPath, 'utf-8')) as VisualAssetManifestEntry[])
      : VISUAL_ASSET_MANIFEST);
  const assetsPublicDir = options.assetsPublicDir ?? ASSETS_PUBLIC_DIR;
  const assetsSourceDir = options.assetsSourceDir ?? ASSETS_SOURCE_DIR;
  const frameMapPath = options.frameMapPath ?? ATLAS_FRAMEMAP_PATH;
  const budgetBytesMax = options.budgetBytesMax ?? UI.initialVisualAssetBytesMax;

  const errors: AssetViolation[] = [];
  const warnings: AssetViolation[] = [];

  // ── A01–A08：manifest 內在檢查（不碰檔案系統，恆跑；AD3）──

  // A01 id 唯一。
  {
    const seen = new Map<string, number>();
    for (const entry of manifest) seen.set(entry.id, (seen.get(entry.id) ?? 0) + 1);
    const dupIds = [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
    if (dupIds.length > 0) errors.push(err('A01-id-dup', 'manifest id 重複（12 §3.7）', dupIds));
  }

  // A02 runtimePath 唯一（非 atlas；atlas frame key＝id 已由 A01 保證）。
  {
    const seen = new Map<string, number>();
    for (const entry of manifest) {
      if (entry.kind === 'atlas') continue;
      seen.set(entry.runtimePath, (seen.get(entry.runtimePath) ?? 0) + 1);
    }
    const dupPaths = [...seen.entries()].filter(([, n]) => n > 1).map(([p]) => p);
    if (dupPaths.length > 0) {
      errors.push(err('A02-runtimepath-dup', 'runtimePath 重複（12 §3.7）', dupPaths));
    }
  }

  // A03 id 格式。
  for (const entry of manifest) {
    if (!ASSET_ID_RE.test(entry.id)) {
      errors.push(err('A03-id-format', `id 不符命名格式（12 §3.7）：${entry.id}`, [entry.id]));
    }
  }

  // A04 檔名語意（補遺 AD2：逐段完全比對）。
  for (const entry of manifest) {
    const isAtlas = entry.kind === 'atlas';
    const rtHit = forbiddenTokenHit(nameStemSegments(entry.runtimePath, !isAtlas));
    if (rtHit !== undefined) {
      errors.push(
        err('A04-forbidden-name', `runtimePath 檔名含禁用 token「${rtHit}」（12 §3.7）`, [
          entry.id,
        ]),
      );
    }
    if (entry.sourcePath !== null) {
      const spHit = forbiddenTokenHit(nameStemSegments(entry.sourcePath, true));
      if (spHit !== undefined) {
        errors.push(
          err('A04-forbidden-name', `sourcePath 檔名含禁用 token「${spHit}」（12 §3.7）`, [
            entry.id,
          ]),
        );
      }
    }
  }

  // A05 kind ↔ 分類一致（結構性，manifest-only；「存在於 frame map」歸 A09 負責，避免重複報）。
  for (const entry of manifest) {
    if (entry.kind === 'atlas') {
      if (entry.runtimePath !== entry.id) {
        errors.push(
          err('A05-kind-mismatch', `kind:'atlas' 的 runtimePath 必須等於 id（12 §3.7）`, [
            entry.id,
          ]),
        );
      }
    } else if (entry.kind === 'svg') {
      if (!entry.runtimePath.endsWith('.svg') || !entry.runtimePath.startsWith('assets/')) {
        errors.push(
          err(
            'A05-kind-mismatch',
            `kind:'svg' 的 runtimePath 須為 public/assets/**/*.svg（12 §3.7）`,
            [entry.id],
          ),
        );
      }
    } else if (entry.kind === 'texture') {
      if (
        !entry.runtimePath.endsWith('.png') ||
        !entry.runtimePath.startsWith('assets/textures/')
      ) {
        errors.push(
          err(
            'A05-kind-mismatch',
            `kind:'texture' 的 runtimePath 須為 assets/textures/**/*.png（12 §3.7）`,
            [entry.id],
          ),
        );
      }
    }
  }

  // A06 授權欄完整（fail closed）。
  for (const entry of manifest) {
    if (entry.authorOrTool.trim().length === 0) {
      errors.push(err('A06-author-empty', `authorOrTool 不可為空（12 §3.7）`, [entry.id]));
    }
    if (!(VALID_LICENSES as readonly string[]).includes(entry.license)) {
      errors.push(
        err('A06-license-invalid', `license 值不在白名單內：${entry.license}（12 §3.7）`, [
          entry.id,
        ]),
      );
    }
  }

  // A07 外部來源必填 sourceUrl。
  for (const entry of manifest) {
    if ((entry.license !== 'project-original' || entry.derivative) && entry.sourceUrl === null) {
      errors.push(
        err('A07-sourceurl-required', `非原創或衍生素材必須填 sourceUrl（12 §3.7）`, [entry.id]),
      );
    }
  }

  // A08 kind:'atlas' 必填 sourcePath。
  for (const entry of manifest) {
    if (entry.kind === 'atlas' && entry.sourcePath === null) {
      errors.push(
        err('A08-atlas-sourcepath-null', `atlas 素材必須有 sourcePath（12 §3.7）`, [entry.id]),
      );
    }
  }

  // ── 過渡期豁免（AD3）：assetsPublicDir 目錄整個不存在 → 跳過 A09–A16 ──
  const assetsPublicDirExists = existsSync(assetsPublicDir);
  const notice = assetsPublicDirExists
    ? null
    : `視覺素材 public/assets 目錄尚未生成，跳過 A09–A16 檔案系統相依檢查（12 §3.7 過渡期豁免）。`;

  const byId = new Map(manifest.map((entry) => [entry.id, entry] as const));
  const domainBytes: Record<'icons' | 'map' | 'textures', number> = {
    icons: 0,
    map: 0,
    textures: 0,
  };
  let firstScreenBytes = 0;

  if (assetsPublicDirExists) {
    let frameMap: AtlasFrameMap | null = null;
    try {
      frameMap = JSON.parse(readFileSync(frameMapPath, 'utf-8')) as AtlasFrameMap;
    } catch {
      frameMap = null;
    }
    if (frameMap === null && manifest.some((entry) => entry.kind === 'atlas')) {
      errors.push(
        err(
          'A09-framemap-unreadable',
          `atlas frame map 無法讀取或格式錯誤：${frameMapPath}（12 §3.7）`,
        ),
      );
    }

    // A09 runtimePath 存在。
    for (const entry of manifest) {
      if (entry.kind === 'atlas') {
        if (frameMap === null) continue; // 已於上方報過一次，避免重複洗版
        const frame = frameMap.frames[entry.runtimePath];
        if (frame === undefined) {
          errors.push(
            err('A09-runtimepath-missing', `atlas frame 不存在於 frame map（12 §3.7）`, [entry.id]),
          );
          continue;
        }
        const page = frameMap.pages[frame.page];
        if (page === undefined) {
          errors.push(
            err('A09-runtimepath-missing', `atlas frame 所屬頁碼不存在（12 §3.7）`, [entry.id]),
          );
          continue;
        }
        if (!existsSync(publicFilePath(assetsPublicDir, page.file))) {
          errors.push(
            err('A09-runtimepath-missing', `atlas 頁 PNG 檔案不存在：${page.file}（12 §3.7）`, [
              entry.id,
            ]),
          );
        }
      } else {
        if (!existsSync(publicFilePath(assetsPublicDir, entry.runtimePath))) {
          errors.push(
            err(
              'A09-runtimepath-missing',
              `runtimePath 檔案不存在：${entry.runtimePath}（12 §3.7）`,
              [entry.id],
            ),
          );
        }
      }
    }

    // A10 sourcePath 存在且位於 source 目錄內。
    for (const entry of manifest) {
      if (entry.sourcePath === null) continue;
      const resolved = resolveRepoPath(entry.sourcePath);
      if (!existsSync(resolved)) {
        errors.push(
          err('A10-sourcepath-invalid', `sourcePath 不存在（12 §3.7）：${entry.sourcePath}`, [
            entry.id,
          ]),
        );
        continue;
      }
      const withinSourceDir =
        resolved === assetsSourceDir || resolved.startsWith(assetsSourceDir + path.sep);
      if (!withinSourceDir) {
        errors.push(
          err(
            'A10-sourcepath-invalid',
            `sourcePath 未位於 source 工作目錄內（12 §3.7）：${entry.sourcePath}`,
            [entry.id],
          ),
        );
      }
    }

    // A11 contentHash 相符。
    for (const entry of manifest) {
      if (entry.kind === 'atlas') {
        if (entry.sourcePath === null || frameMap === null) continue;
        const resolvedSource = resolveRepoPath(entry.sourcePath);
        if (!existsSync(resolvedSource)) continue; // 已由 A10 報過
        const sourceHash = sha256hex(readFileSync(resolvedSource));
        const frame = frameMap.frames[entry.runtimePath];
        const frameSourceHash = frame?.sourceHash;
        if (sourceHash !== entry.contentHash || frameSourceHash !== entry.contentHash) {
          errors.push(
            err(
              'A11-contenthash-mismatch',
              `atlas 三方雜湊不一致（manifest／source 檔／frame map 須一致，12 §3.7）`,
              [entry.id],
            ),
          );
        }
      } else {
        const filePath = publicFilePath(assetsPublicDir, entry.runtimePath);
        if (!existsSync(filePath)) continue; // 已由 A09 報過
        const actualHash = sha256hex(readFileSync(filePath));
        if (actualHash !== entry.contentHash) {
          errors.push(
            err('A11-contenthash-mismatch', `contentHash 與實際檔案不符（12 §3.7）`, [entry.id]),
          );
        }
      }
    }

    // A12 未登錄素材（反向掃描）。
    {
      const registered = new Set<string>();
      for (const entry of manifest) {
        if (entry.kind !== 'atlas')
          registered.add(publicFilePath(assetsPublicDir, entry.runtimePath));
      }
      if (frameMap !== null) {
        for (const page of frameMap.pages)
          registered.add(publicFilePath(assetsPublicDir, page.file));
      }
      const allFiles = listFilesRecursive(assetsPublicDir);
      const unregistered = allFiles.filter((f) => !registered.has(f));
      if (unregistered.length > 0) {
        errors.push(
          err(
            'A12-unregistered-asset',
            `public/assets 存在未登錄於 manifest／frame map 的素材（12 §3.7）`,
            unregistered.map((f) => path.relative(REPO_ROOT, f)),
          ),
        );
      }

      // A13 source 不得進 production（basename 比對）。
      const sourceBasenames = new Set(
        manifest
          .filter(
            (entry): entry is VisualAssetManifestEntry & { sourcePath: string } =>
              entry.sourcePath !== null,
          )
          .map((entry) => path.basename(entry.sourcePath)),
      );
      const leaked = allFiles.filter((f) => sourceBasenames.has(path.basename(f)));
      if (leaked.length > 0) {
        errors.push(
          err(
            'A13-source-leak',
            `public/assets 內出現與 source 工作檔同名的檔案（不得把 source 複製進 production，12 §3.7）`,
            leaked.map((f) => path.relative(REPO_ROOT, f)),
          ),
        );
      }
      const distDir = path.join(REPO_ROOT, 'dist');
      if (existsSync(distDir)) {
        const distLeaked = listFilesRecursive(distDir).filter((f) =>
          sourceBasenames.has(path.basename(f)),
        );
        if (distLeaked.length > 0) {
          errors.push(
            err(
              'A13-source-leak',
              `dist/ 內出現與 source 工作檔同名的檔案（12 §3.7）`,
              distLeaked.map((f) => path.relative(REPO_ROOT, f)),
            ),
          );
        }
      }
    }

    // A14 frame map 決定性重建一致（記憶體內重建比對；不比對頁 PNG bytes，§12）。
    if (frameMap !== null) {
      const atlasEntries = manifest.filter((entry) => entry.kind === 'atlas');
      const frames: AtlasSourceFrame[] = [];
      let decodeOk = true;
      for (const entry of atlasEntries) {
        if (entry.sourcePath === null) {
          decodeOk = false;
          continue;
        }
        const resolved = resolveRepoPath(entry.sourcePath);
        if (!existsSync(resolved)) {
          decodeOk = false;
          continue;
        }
        try {
          const buf = readFileSync(resolved);
          const decoded = PNG.sync.read(buf);
          frames.push({
            id: entry.id,
            width: decoded.width,
            height: decoded.height,
            rgba: new Uint8Array(decoded.data),
            sourceHash: sha256hex(buf),
          });
        } catch {
          decodeOk = false;
        }
      }
      if (decodeOk && frames.length === atlasEntries.length && atlasEntries.length > 0) {
        const rebuilt = buildAtlas(frames);
        const mismatchedIds: string[] = [];
        for (const frame of frames) {
          const committed = frameMap.frames[frame.id];
          const rebuiltFrame = rebuilt.frameMap.frames[frame.id];
          if (
            committed === undefined ||
            rebuiltFrame === undefined ||
            committed.x !== rebuiltFrame.x ||
            committed.y !== rebuiltFrame.y ||
            committed.w !== rebuiltFrame.w ||
            committed.h !== rebuiltFrame.h ||
            committed.sourceHash !== rebuiltFrame.sourceHash
          ) {
            mismatchedIds.push(frame.id);
          }
        }
        const pagesSizeMismatch =
          rebuilt.frameMap.pages.length !== frameMap.pages.length ||
          rebuilt.frameMap.pages.some((page, index) => {
            const committedPage = frameMap.pages[index];
            return (
              committedPage === undefined ||
              committedPage.width !== page.width ||
              committedPage.height !== page.height
            );
          });
        if (mismatchedIds.length > 0 || pagesSizeMismatch) {
          errors.push(
            err(
              'A14-atlas-rebuild-mismatch',
              'atlas 產物與決定性重建不一致，請重跑 npm run atlas:build（12 §3.7）',
              mismatchedIds,
            ),
          );
        }
      }
    }

    // A15 頁 PNG 未被竄改。
    if (frameMap !== null) {
      for (const page of frameMap.pages) {
        const filePath = publicFilePath(assetsPublicDir, page.file);
        if (!existsSync(filePath)) continue; // 已由 A09 報過
        const actualHash = sha256hex(readFileSync(filePath));
        if (actualHash !== page.contentHash) {
          errors.push(
            err('A15-page-hash-mismatch', `atlas 頁 PNG 與 frame map 記錄的雜湊不符（12 §3.7）`, [
              page.file,
            ]),
          );
        }
      }
    }

    // per-domain bytes（全部 manifest entries；atlas 依所屬頁去重，同頁只計一次）。
    {
      const countedPages = new Set<string>();
      for (const entry of manifest) {
        const domain = assetDomain(entry.id);
        if (domain === null) continue;
        if (entry.kind === 'atlas') {
          if (frameMap === null) continue;
          const frame = frameMap.frames[entry.runtimePath];
          if (frame === undefined) continue;
          const dedupKey = `${domain}:${frame.page}`;
          if (countedPages.has(dedupKey)) continue;
          countedPages.add(dedupKey);
          const page = frameMap.pages[frame.page];
          if (page === undefined) continue;
          domainBytes[domain] += fileSize(publicFilePath(assetsPublicDir, page.file));
        } else {
          domainBytes[domain] += fileSize(publicFilePath(assetsPublicDir, entry.runtimePath));
        }
      }
    }

    // A16 首屏尺寸預算（裁決 D9：同頁只計一次）。
    {
      const countedPages = new Set<number>();
      for (const id of FIRST_SCREEN_ASSET_IDS) {
        const entry = byId.get(id);
        if (entry === undefined) continue;
        if (entry.kind === 'atlas') {
          if (frameMap === null) continue;
          const frame = frameMap.frames[entry.runtimePath];
          if (frame === undefined) continue;
          if (countedPages.has(frame.page)) continue;
          countedPages.add(frame.page);
          const page = frameMap.pages[frame.page];
          if (page === undefined) continue;
          firstScreenBytes += fileSize(publicFilePath(assetsPublicDir, page.file));
        } else {
          firstScreenBytes += fileSize(publicFilePath(assetsPublicDir, entry.runtimePath));
        }
      }
      if (firstScreenBytes > budgetBytesMax) {
        errors.push(
          err(
            'A16-budget-exceeded',
            `首屏視覺素材 ${firstScreenBytes} bytes 超出預算 ${budgetBytesMax} bytes` +
              `（12 §3.7 UI.initialVisualAssetBytesMax）`,
          ),
        );
      }
    }
  }

  return { errors, warnings, notice, domainBytes, firstScreenBytes };
}

// ═══════════════════════════════════════════════════════════════════
// CLI（設計文件 §4.3；exit／notice 語意依補遺 AD3）
// ═══════════════════════════════════════════════════════════════════

function formatViolation(v: AssetViolation): string {
  const idPart = v.ids !== undefined && v.ids.length > 0 ? ` [${v.ids.join(', ')}]` : '';
  return `${v.level} ${v.code} ${v.message}${idPart}`;
}

function fmtBytes(bytes: number): string {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function main(): void {
  const result = validateAssets();

  console.log(
    `視覺素材各 domain bytes：icons=${fmtBytes(result.domainBytes.icons)} ` +
      `map=${fmtBytes(result.domainBytes.map)} textures=${fmtBytes(result.domainBytes.textures)}；` +
      `首屏合計 ${fmtBytes(result.firstScreenBytes)} / 預算 ${fmtBytes(UI.initialVisualAssetBytesMax)}（12 §3.7）`,
  );
  for (const w of result.warnings) console.warn(formatViolation(w));
  for (const e of result.errors) console.error(formatViolation(e));
  if (result.notice !== null) console.warn(result.notice);
  console.log(
    `素材驗證：${result.errors.length} 個 ERROR、${result.warnings.length} 個 WARN（12 §3.7）`,
  );

  // exit code 恆依 errors.length 判定（補遺 AD3：notice 不吞掉任何已產生的 ERROR）。
  process.exit(result.errors.length > 0 ? 1 : 0);
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  main();
}
