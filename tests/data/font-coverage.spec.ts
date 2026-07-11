// 字型子集管線整合測試（規格：plan/01-architecture.md §3.9.3、A13；驗收見 18-roadmap.md M0-11）。
//
// 涵蓋兩層：
// 1. tools/font-charset.ts 的用字收集純函式（i18n 字串抽取、劇本 name 欄位遞迴收集、基準字集合併）。
// 2. tools/check-font-coverage.ts 的涵蓋率比對純函式（缺字／超出預算／缺席降級／通過四種狀態），
//    比照 tools/scan-simplified.ts 的慣例，以 mkdtempSync 建立隔離 fixture，不動到真實
//    public/fonts 與 src/i18n/zh-TW.ts。
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BASELINE_CHARS,
  charsToSortedString,
  collectI18nChars,
  collectRequiredChars,
  collectScenarioNameChars,
  extractStringLiteralTexts,
} from '../../tools/font-charset';
import { checkFontCoverage } from '../../tools/check-font-coverage';
import type { FontManifest } from '../../tools/font-paths';

// 本檔位於 tests/data/，回推兩層即 repo 根目錄。
const REPO_ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));

describe('extractStringLiteralTexts — TS 字串樣式節點抽取', () => {
  it('抽出一般字串字面量與模板字面量各段落，不含程式碼標點', () => {
    const texts = extractStringLiteralTexts(
      "export const a = '安土城'; const b = `攻略${1}日目`; // 註解不算",
    );
    expect(texts).toEqual(['安土城', '攻略', '日目']);
  });

  it('跳脫序列還原為實際字元（不殘留反斜線）', () => {
    const texts = extractStringLiteralTexts(String.raw`const a = '第\n二行';`);
    expect(texts.join('')).toBe('第\n二行');
  });
});

describe('collectI18nChars — 掃描 zh-TW.ts 全字串', () => {
  let tempRoot: string | undefined;

  afterEach(() => {
    if (tempRoot !== undefined) {
      rmSync(tempRoot, { recursive: true, force: true });
      tempRoot = undefined;
    }
  });

  it('收集全部字串樣式節點的用字（含 key 與 value）', () => {
    tempRoot = mkdtempSync(path.join(tmpdir(), 'tenka-font-i18n-'));
    const file = path.join(tempRoot, 'zh-TW.fixture.ts');
    writeFileSync(file, "export const STR = { 'ui.title': '天下布武' } as const;", 'utf-8');

    const chars = collectI18nChars(file);
    for (const ch of '天下布武') expect(chars.has(ch)).toBe(true);
  });

  it('檔案不存在時回傳空集合（不拋錯）', () => {
    const chars = collectI18nChars(path.join(REPO_ROOT, '__not-exist__.ts'));
    expect(chars.size).toBe(0);
  });
});

describe('collectScenarioNameChars — 遞迴收集劇本 JSON 的 name 欄位', () => {
  let tempRoot: string | undefined;

  afterEach(() => {
    if (tempRoot !== undefined) {
      rmSync(tempRoot, { recursive: true, force: true });
      tempRoot = undefined;
    }
  });

  it('收集巢狀陣列/物件內任意深度的 name 欄位，忽略其他欄位', () => {
    tempRoot = mkdtempSync(path.join(tmpdir(), 'tenka-font-scenario-'));
    mkdirSync(path.join(tempRoot, 'sub'), { recursive: true });
    writeFileSync(
      path.join(tempRoot, 'castles.json'),
      JSON.stringify([
        { id: 'azuchi', name: '安土城', note: '不應被收錄的罕字擬' },
        { id: 'gifu', name: '岐阜城', garrison: { commanderName: '不是 name 欄位不收' } },
      ]),
      'utf-8',
    );
    writeFileSync(
      path.join(tempRoot, 'sub', 'officers.json'),
      JSON.stringify({ list: [{ name: '織田信長' }] }),
      'utf-8',
    );

    const chars = collectScenarioNameChars(tempRoot);
    for (const ch of '安土城岐阜織田信長') expect(chars.has(ch)).toBe(true);
    // "不"、"擬" 只出現在非 name 欄位，不應被收錄。
    expect(chars.has('擬')).toBe(false);
  });

  it('目錄不存在或 JSON 壞掉時不拋錯（壞檔交由 tools/validate.ts 的 zod 把關）', () => {
    tempRoot = mkdtempSync(path.join(tmpdir(), 'tenka-font-scenario-bad-'));
    const dir = tempRoot;
    writeFileSync(path.join(dir, 'broken.json'), '{ not valid json', 'utf-8');
    expect(() => collectScenarioNameChars(dir)).not.toThrow();
    expect(() => collectScenarioNameChars(path.join(dir, 'nope'))).not.toThrow();
  });
});

describe('collectRequiredChars — 基準字集 ∪ i18n ∪ 劇本 name', () => {
  it('至少涵蓋基準數字標點集', () => {
    const { chars, breakdown } = collectRequiredChars();
    for (const ch of BASELINE_CHARS) expect(chars.has(ch)).toBe(true);
    expect(breakdown.baseline).toBe(new Set(BASELINE_CHARS).size);
  });
});

describe('charsToSortedString — 穩定排序序列化', () => {
  it('依 code point 由小到大排序且結果穩定（呼叫兩次一致）', () => {
    const set = new Set(['木', 'a', '1', '天']);
    const first = charsToSortedString(set);
    const second = charsToSortedString(new Set(['天', '1', 'a', '木']));
    expect(first).toBe(second);
  });
});

describe('checkFontCoverage — 涵蓋率比對四種狀態（隔離 fixture，不動真實成品）', () => {
  let tempRoot: string | undefined;

  afterEach(() => {
    if (tempRoot !== undefined) {
      rmSync(tempRoot, { recursive: true, force: true });
      tempRoot = undefined;
    }
  });

  function writeManifest(dir: string, overrides: Partial<FontManifest> = {}): string {
    const manifestPath = path.join(dir, 'noto-serif-tc-subset.manifest.json');
    const manifest: FontManifest = {
      generatedAt: new Date().toISOString(),
      sourceFont: 'tools/assets/NotoSerifTC-Regular.ttf',
      weight: 400,
      charCount: 2,
      chars: '天下',
      sizeBytes: 40_000,
      budgetKb: 2048,
      ...overrides,
    };
    writeFileSync(manifestPath, JSON.stringify(manifest), 'utf-8');
    return manifestPath;
  }

  it('manifest／woff2 缺席 → missing-font（M0 豁免，非失敗）', () => {
    tempRoot = mkdtempSync(path.join(tmpdir(), 'tenka-font-cov-'));
    const result = checkFontCoverage({
      manifestPath: path.join(tempRoot, '不存在.manifest.json'),
      woff2Path: path.join(tempRoot, '不存在.woff2'),
    });
    expect(result.status).toBe('missing-font');
  });

  it('required 字元不在 manifest.chars 內 → missing-chars 且列出全部缺字', () => {
    tempRoot = mkdtempSync(path.join(tmpdir(), 'tenka-font-cov-'));
    const woff2Path = path.join(tempRoot, 'x.woff2');
    writeFileSync(woff2Path, Buffer.from([0, 1, 2]));
    const manifestPath = writeManifest(tempRoot, { chars: '天下' });

    const result = checkFontCoverage({
      manifestPath,
      woff2Path,
      requiredChars: new Set(['天', '下', '布', '武']),
    });

    expect(result.status).toBe('missing-chars');
    expect([...result.missingChars].sort()).toEqual(['布', '武']);
  });

  it('woff2 實際大小超出 budgetKb → over-budget', () => {
    tempRoot = mkdtempSync(path.join(tmpdir(), 'tenka-font-cov-'));
    const woff2Path = path.join(tempRoot, 'x.woff2');
    writeFileSync(woff2Path, Buffer.alloc(3000 * 1024)); // 3000 KB > 2048 KB 預算
    const manifestPath = writeManifest(tempRoot, {
      chars: '天下',
      sizeBytes: 3000 * 1024,
      budgetKb: 2048,
    });

    const result = checkFontCoverage({
      manifestPath,
      woff2Path,
      requiredChars: new Set(['天', '下']),
    });

    expect(result.status).toBe('over-budget');
  });

  it('全部涵蓋且未超預算 → ok', () => {
    tempRoot = mkdtempSync(path.join(tmpdir(), 'tenka-font-cov-'));
    const woff2Path = path.join(tempRoot, 'x.woff2');
    writeFileSync(woff2Path, Buffer.alloc(40 * 1024));
    const manifestPath = writeManifest(tempRoot, { chars: '天下布武', sizeBytes: 40 * 1024 });

    const result = checkFontCoverage({
      manifestPath,
      woff2Path,
      requiredChars: new Set(['天', '下']),
    });

    expect(result.status).toBe('ok');
  });
});

describe('checkFontCoverage — 對目前 repo 實際成品的健康檢查（18 M0-11 驗收精神）', () => {
  it('目前 repo：涵蓋率通過，或尚未產生子集（兩者皆非壞掉）；不可為 missing-chars/over-budget', () => {
    const result = checkFontCoverage();
    expect(['ok', 'missing-font']).toContain(result.status);
  });

  it('CLI（npm run font:subset 同源檢查）對目前 repo exit code 為 0', () => {
    const tsxBin = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx');
    const result = spawnSync(tsxBin, ['tools/check-font-coverage.ts'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
  });
});
