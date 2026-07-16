// 全案「應顯示用字」收集（供 tools/subset-font.ts 產生子集、tools/check-font-coverage.ts 涵蓋率比對共用）。
// 規格：plan/01-architecture.md §3.9.3、A13——
//   掃描 src/i18n/zh-TW.ts 全字串＋ src/data/scenarios/**/*.json 全 name 欄位＋數字標點集。
// M6-V2 起加掃 src/core/debugVisual.ts：視覺 fixture 的城／郡／武將名以 BitmapText 直接上圖
// （17 §3.9.3 截圖 baseline），不在 i18n 與劇本 JSON 掃描範圍內，缺字會靜默烘成 tofu。
//
// 純函式庫：不印東西、不呼叫 process.exit，供 CLI 工具與 Vitest 共用（比照 tools/validate.ts 的
// 「純函式庫＋CLI 包裝」慣例，17 §3.6.1）。

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

/**
 * 基準字集（01 §3.9.3「數字標點集」）：確保純數字／日期／貨幣格式化輸出
 * （如「1560年5月3日」「3,000兵」「12,500石」「800貫」，見 13 §1.4）與常見標點
 * 即使在 i18n 字串尚未填入前也一律可顯示。此清單為實作期依現有規格片段彙整的
 * 合理基準，非另一份 plan 文件的定案表；日後 13 主表定稿後如發現缺漏標點，
 * 直接擴充本常數即可（不影響管線介面）。
 */
export const BASELINE_DIGITS = '0123456789';
export const BASELINE_LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const BASELINE_PUNCTUATION =
  '，。、；：？！「」『』（）～—…‧・〈〉《》【】,.:;!?()[]{}%＋+-−×÷=/\\@#&*_\'"　 ';

export const BASELINE_CHARS = BASELINE_DIGITS + BASELINE_LATIN + BASELINE_PUNCTUATION;

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const DEFAULT_I18N_FILE = path.join(REPO_ROOT, 'src/i18n/zh-TW.ts');
const DEFAULT_SCENARIOS_DIR = path.join(REPO_ROOT, 'src/data/scenarios');
/** 含地圖顯示名稱的 debug fixture 檔案（字串字面量整檔掃描，同 i18n 掃法）。 */
const DEFAULT_DEBUG_FIXTURE_FILES = [path.join(REPO_ROOT, 'src/core/debugVisual.ts')];

/** 將字串拆成 Unicode code point（非 UTF-16 code unit）的集合，正確處理 surrogate pair。 */
function toCharSet(text: string): Set<string> {
  return new Set(Array.from(text));
}

/**
 * 從一段 TypeScript 原始碼中抽出全部字串樣式節點（字串字面量、模板字面量各段）的文字內容。
 * 使用 TypeScript compiler API 而非正規表達式，避免跳脫序列／註解／程式碼標點誤入字集。
 */
export function extractStringLiteralTexts(sourceText: string, fileName = 'source.ts'): string[] {
  const sourceFile = ts.createSourceFile(fileName, sourceText, ts.ScriptTarget.ES2022, true);
  const texts: string[] = [];

  function visit(node: ts.Node): void {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      texts.push(node.text);
    } else if (ts.isTemplateExpression(node)) {
      texts.push(node.head.text);
      for (const span of node.templateSpans) {
        texts.push(span.literal.text);
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return texts;
}

/** 掃描 `src/i18n/zh-TW.ts`（或指定檔案）全部字串樣式節點，回傳用字集合。檔案不存在時回傳空集合。 */
export function collectI18nChars(i18nFilePath: string = DEFAULT_I18N_FILE): Set<string> {
  if (!existsSync(i18nFilePath)) return new Set();
  const sourceText = readFileSync(i18nFilePath, 'utf-8');
  const texts = extractStringLiteralTexts(sourceText, path.basename(i18nFilePath));
  const chars = new Set<string>();
  for (const text of texts) {
    for (const ch of toCharSet(text)) chars.add(ch);
  }
  return chars;
}

/** 遞迴走訪 JSON 值，收集所有 key 為 `name` 且值為字串者的用字。 */
function collectNameFieldChars(value: unknown, chars: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectNameFieldChars(item, chars);
    return;
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'name' && typeof v === 'string') {
        for (const ch of toCharSet(v)) chars.add(ch);
      } else {
        collectNameFieldChars(v, chars);
      }
    }
  }
}

/** 遞迴列出目錄下全部 `.json` 檔案的絕對路徑；目錄不存在時回傳空陣列。 */
function listJsonFilesRecursive(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const result: string[] = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    for (const entry of readdirSync(current)) {
      const full = path.join(current, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        stack.push(full);
      } else if (st.isFile() && full.endsWith('.json')) {
        result.push(full);
      }
    }
  }
  return result;
}

/** 掃描 `src/data/scenarios/**\/*.json`（或指定目錄）全部 `name` 欄位，回傳用字集合。 */
export function collectScenarioNameChars(
  scenariosDir: string = DEFAULT_SCENARIOS_DIR,
): Set<string> {
  const chars = new Set<string>();
  for (const file of listJsonFilesRecursive(scenariosDir)) {
    try {
      const json: unknown = JSON.parse(readFileSync(file, 'utf-8'));
      collectNameFieldChars(json, chars);
    } catch {
      // 壞掉的劇本 JSON 由 tools/validate.ts（zod）把關，本工具只管用字收集，跳過解析失敗的檔案。
    }
  }
  return chars;
}

/**
 * 掃描 debug fixture 檔案（預設 `src/core/debugVisual.ts`）全部字串樣式節點，回傳用字集合。
 * fixture 的顯示名稱（城／郡／武將）會由 MapRenderer 以 BitmapText 直接繪於截圖 baseline
 * （17 §3.9.3），故一併納入子集；非顯示用的 id 字串多為 ASCII，已被基準字集涵蓋，無額外成本。
 */
export function collectDebugFixtureChars(
  fixtureFiles: readonly string[] = DEFAULT_DEBUG_FIXTURE_FILES,
): Set<string> {
  const chars = new Set<string>();
  for (const file of fixtureFiles) {
    for (const ch of collectI18nChars(file)) chars.add(ch);
  }
  return chars;
}

export interface RequiredCharsOptions {
  readonly i18nFilePath?: string;
  readonly scenariosDir?: string;
  readonly debugFixtureFiles?: readonly string[];
}

export interface RequiredCharsResult {
  /** 全部應涵蓋字元（含基準字集）。 */
  readonly chars: Set<string>;
  /** 依來源分項的字元數，供報告輸出。 */
  readonly breakdown: {
    readonly baseline: number;
    readonly i18n: number;
    readonly scenarioNames: number;
    readonly debugFixtures: number;
  };
}

/** 彙整全案應顯示用字：基準字集 ∪ i18n 全字串 ∪ 劇本 name 欄位 ∪ debug fixture 顯示字串。 */
export function collectRequiredChars(options: RequiredCharsOptions = {}): RequiredCharsResult {
  const baseline = toCharSet(BASELINE_CHARS);
  const i18n = collectI18nChars(options.i18nFilePath);
  const scenarioNames = collectScenarioNameChars(options.scenariosDir);
  const debugFixtures = collectDebugFixtureChars(options.debugFixtureFiles);

  const chars = new Set<string>();
  for (const ch of baseline) chars.add(ch);
  for (const ch of i18n) chars.add(ch);
  for (const ch of scenarioNames) chars.add(ch);
  for (const ch of debugFixtures) chars.add(ch);

  return {
    chars,
    breakdown: {
      baseline: baseline.size,
      i18n: i18n.size,
      scenarioNames: scenarioNames.size,
      debugFixtures: debugFixtures.size,
    },
  };
}

/** 把字元集合序列化成穩定排序（依 code point）的字串，供 subset-font 的 text 參數與 manifest 使用。 */
export function charsToSortedString(chars: ReadonlySet<string>): string {
  return Array.from(chars)
    .sort((a, b) => (a.codePointAt(0) ?? 0) - (b.codePointAt(0) ?? 0))
    .join('');
}
