// 視覺素材 manifest 純函式測試（規格：plan/12-ui-components.md §3.7；M6-V3 設計文件 §9.1）。
// 只驗 src/ui/assets/manifest.ts 的資料健全性與純函式行為，不碰檔案系統
// （檔案存在性／hash 相符等交由 tools/validate-assets.ts 的整合測試把關，Slice C 負責）。
import { describe, expect, it } from 'vitest';
import {
  ASSET_FILENAME_STEM_RE,
  ASSET_ID_RE,
  FIRST_SCREEN_ASSET_IDS,
  FORBIDDEN_NAME_TOKENS,
  VALID_LICENSES,
  VISUAL_ASSET_MANIFEST,
  getManifestEntry,
} from '../../src/ui/assets/manifest';

/** 依補遺 AD2：去掉 `@<n>x` 縮放後綴後以 `-` 切段，逐段完全比對 FORBIDDEN_NAME_TOKENS
 *  （不可用 substring／includes，否則 `renewal`、`newmoon` 這類詞會被誤判）。 */
function stemSegments(filename: string): string[] {
  const stem = filename.replace(/\.[a-z0-9]+$/i, '').replace(/@[0-9]+x$/, '');
  return stem.split('-');
}

function basenameOf(p: string): string {
  const parts = p.split('/');
  return parts[parts.length - 1] ?? p;
}

describe('VISUAL_ASSET_MANIFEST — 資料健全性（12 §3.7）', () => {
  it('每筆 id 符合 ASSET_ID_RE', () => {
    for (const entry of VISUAL_ASSET_MANIFEST) {
      expect(entry.id).toMatch(ASSET_ID_RE);
    }
  });

  it('全部 id 唯一（無重複）', () => {
    const ids = VISUAL_ASSET_MANIFEST.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('非 atlas 的 runtimePath 唯一；atlas 的 runtimePath 恆等於其 id（§3.4 約定）', () => {
    const nonAtlasPaths = VISUAL_ASSET_MANIFEST.filter((e) => e.kind !== 'atlas').map(
      (e) => e.runtimePath,
    );
    expect(new Set(nonAtlasPaths).size).toBe(nonAtlasPaths.length);

    for (const entry of VISUAL_ASSET_MANIFEST) {
      if (entry.kind === 'atlas') {
        expect(entry.runtimePath).toBe(entry.id);
      }
    }
  });

  it('FIRST_SCREEN_ASSET_IDS 全部能在 manifest 找到（無孤兒 id）', () => {
    for (const id of FIRST_SCREEN_ASSET_IDS) {
      expect(getManifestEntry(id)).toBeDefined();
    }
  });

  it('kind:"atlas" 的 sourcePath 必為非 null（裁決 D3：atlas 一律要求 sourcePath）', () => {
    for (const entry of VISUAL_ASSET_MANIFEST) {
      if (entry.kind === 'atlas') {
        expect(entry.sourcePath).not.toBeNull();
      }
    }
  });

  it('kind:"svg" 的 runtimePath 以 .svg 結尾；kind:"texture" 的 runtimePath 以 .png 結尾且位於 assets/textures/', () => {
    for (const entry of VISUAL_ASSET_MANIFEST) {
      if (entry.kind === 'svg') {
        expect(entry.runtimePath.endsWith('.svg')).toBe(true);
      }
      if (entry.kind === 'texture') {
        expect(entry.runtimePath.endsWith('.png')).toBe(true);
        expect(entry.runtimePath.startsWith('assets/textures/')).toBe(true);
      }
    }
  });

  it('license 全部 ∈ VALID_LICENSES；非 project-original 或 derivative 者 sourceUrl 非 null', () => {
    for (const entry of VISUAL_ASSET_MANIFEST) {
      expect(VALID_LICENSES).toContain(entry.license);
      if (entry.license !== 'project-original' || entry.derivative) {
        expect(entry.sourceUrl).not.toBeNull();
      }
    }
  });

  it('本交付全為 project-original／非衍生，sourceUrl 可為 null', () => {
    for (const entry of VISUAL_ASSET_MANIFEST) {
      expect(entry.license).toBe('project-original');
      expect(entry.derivative).toBe(false);
      expect(entry.sourceUrl).toBeNull();
    }
  });

  it('authorOrTool 為非空字串；每筆皆有署名（需求 10、14）', () => {
    for (const entry of VISUAL_ASSET_MANIFEST) {
      expect(entry.authorOrTool.length).toBeGreaterThan(0);
    }
  });

  it('contentHash 為 64 字小寫 hex（sha256，裁決 D4）', () => {
    for (const entry of VISUAL_ASSET_MANIFEST) {
      expect(entry.contentHash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  /** 真實檔案路徑（有副檔名，非 atlas frame key）：atlas 的 runtimePath 等於 id（點分階層字串，
   *  非實體檔名，見 §3.4），故只收 sourcePath 與非 atlas 的 runtimePath。 */
  function realFilePaths(): string[] {
    const paths: string[] = [];
    for (const entry of VISUAL_ASSET_MANIFEST) {
      if (entry.kind !== 'atlas') paths.push(entry.runtimePath);
      if (entry.sourcePath !== null) paths.push(entry.sourcePath);
    }
    return paths;
  }

  it('真實檔名 stem 不含 FORBIDDEN_NAME_TOKENS 任一完整段（補遺 AD2）', () => {
    for (const p of realFilePaths()) {
      const segments = stemSegments(basenameOf(p));
      for (const token of FORBIDDEN_NAME_TOKENS) {
        expect(segments).not.toContain(token);
      }
    }
  });

  it('ASSET_FILENAME_STEM_RE 對真實檔名 basename（去副檔名）皆成立', () => {
    for (const p of realFilePaths()) {
      const stem = basenameOf(p).replace(/\.[a-z0-9]+$/i, '');
      expect(stem).toMatch(ASSET_FILENAME_STEM_RE);
    }
  });
});

describe('getManifestEntry — 命中／未命中', () => {
  it('已登錄 id 回傳對應 entry', () => {
    const entry = getManifestEntry('texture.washi.base@1x');
    expect(entry?.kind).toBe('texture');
  });

  it('未登錄 id 回傳 undefined', () => {
    expect(getManifestEntry('not.a.real.id')).toBeUndefined();
  });
});
