// 簡體字／日文新字體黑名單掃描器（規格：plan/17-testing.md §3.6.2〔範圍／演算法〕、§4.2〔型別〕、§5.4〔字元集〕）。
//
// 本檔拆成純函式庫＋CLI 包裝兩部分（比照 tools/validate.ts 的慣例）：
// - scanSimplified(rootDir) 不呼叫 process.exit、不印東西，供 Vitest 直接 import
//   （tests/data/no-simplified.spec.ts）。
// - CLI 包裝（本檔 main()）負責印報表與決定 exit code：有任何命中即 exit code 1。
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CONTEXT_L2, L1_MAP, L3_MAP } from './simplified-chars';
import { TESTCFG } from '../tests/config';

/** 掃描規則種類（17 §4.2）。 */
export type ScanRule =
  | 'simplified' // L1 無歧義簡體字
  | 'context' // L2 語境敏感字且該行未匹配允許 pattern
  | 'shinjitai'; // L3 日文新字體

/** 單筆掃描命中結果（17 §4.2）。 */
export interface ScanFinding {
  /** repo 相對路徑 */
  file: string;
  /** 1 起算行號 */
  line: number;
  /** 1 起算欄號（以 code point 計） */
  col: number;
  /** 命中字元（單一 code point） */
  char: string;
  /** 建議正體字（可能多個，如「發/髮」） */
  suggestion: string;
  rule: ScanRule;
}

/** 掃描範圍條目：目錄＋副檔名清單，或單一根目錄檔案（17 §3.6.2）。 */
type ScanTarget =
  { readonly dir: string; readonly exts: readonly string[] } | { readonly file: string };

/** 掃描範圍（原樣對應 17 §3.6.2 的 glob 清單）。 */
const SCAN_TARGETS: readonly ScanTarget[] = [
  { dir: 'src', exts: ['ts', 'tsx', 'json', 'css'] },
  { dir: 'plan', exts: ['md'] },
  { dir: 'tools', exts: ['ts'] },
  { dir: 'tests', exts: ['ts', 'json'] },
  { dir: 'e2e', exts: ['ts'] },
  { file: 'README.md' },
  { file: 'index.html' },
];

/** 遞迴列出 dir 底下副檔名屬於 exts 的全部檔案（絕對路徑）；dir 不存在時回傳空陣列。 */
function walk(dir: string, exts: readonly string[]): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const results: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walk(full, exts));
    } else if (entry.isFile() && exts.includes(path.extname(entry.name).slice(1))) {
      results.push(full);
    }
  }
  return results;
}

/** 絕對路徑轉為 repo 相對路徑，統一以 `/` 分隔（跨平台一致，供豁免清單比對）。 */
function toRepoRelative(rootDir: string, full: string): string {
  return path.relative(rootDir, full).split(path.sep).join('/');
}

/** 收集掃描範圍內全部檔案（絕對路徑），已扣除 TESTCFG.scanExemptFiles。 */
function collectFiles(rootDir: string): string[] {
  const exempt = new Set<string>(TESTCFG.scanExemptFiles);
  const all: string[] = [];
  for (const target of SCAN_TARGETS) {
    if ('file' in target) {
      const full = path.join(rootDir, target.file);
      if (existsSync(full)) {
        all.push(full);
      }
    } else {
      all.push(...walk(path.join(rootDir, target.dir), target.exts));
    }
  }
  return all.filter((full) => !exempt.has(toRepoRelative(rootDir, full)));
}

/** 由 map 取值；key 保證存在（呼叫前已用 map.has 判斷），缺值代表黑名單常數建構有誤。 */
function mustGet(map: ReadonlyMap<string, string>, key: string): string {
  const value = map.get(key);
  if (value === undefined) {
    throw new Error(`scan-simplified: 找不到字元「${key}」對應的建議正體字（黑名單常數不同步）`);
  }
  return value;
}

/** 純函式：掃描 rootDir 下全部檔案，回傳全部命中；不印東西、不呼叫 process.exit（17 §4.2）。 */
export function scanSimplified(rootDir: string): ScanFinding[] {
  const findings: ScanFinding[] = [];
  for (const full of collectFiles(rootDir)) {
    const relFile = toRepoRelative(rootDir, full);
    const lines = readFileSync(full, 'utf8').split('\n');
    lines.forEach((line, lineIdx) => {
      [...line].forEach((ch, colIdx) => {
        // 以 code point 迭代（17 §5.4 演算法）。
        if (L1_MAP.has(ch)) {
          findings.push({
            file: relFile,
            line: lineIdx + 1,
            col: colIdx + 1,
            char: ch,
            suggestion: mustGet(L1_MAP, ch),
            rule: 'simplified',
          });
          return;
        }
        if (L3_MAP.has(ch)) {
          findings.push({
            file: relFile,
            line: lineIdx + 1,
            col: colIdx + 1,
            char: ch,
            suggestion: mustGet(L3_MAP, ch),
            rule: 'shinjitai',
          });
          return;
        }
        const contextRule = CONTEXT_L2.find((c) => c.char === ch);
        if (contextRule !== undefined && !contextRule.allow.test(line)) {
          findings.push({
            file: relFile,
            line: lineIdx + 1,
            col: colIdx + 1,
            char: ch,
            suggestion: contextRule.suggestion,
            rule: 'context',
          });
        }
      });
    });
  }
  return findings;
}

/** CLI 包裝：印報表、決定 exit code（17 §3.6.2：每筆「檔案:行:欄 字元 → 建議正體字」）。 */
function main(): void {
  const rootDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
  const findings = scanSimplified(rootDir);
  for (const f of findings) {
    console.error(`${f.file}:${f.line}:${f.col} ${f.char} → ${f.suggestion}`);
  }
  if (findings.length > 0) {
    console.error(`簡體字／新字體掃描：共 ${findings.length} 筆命中，請修正後重跑。`);
  } else {
    console.log('簡體字／新字體掃描：0 筆命中。');
  }
  process.exit(findings.length > 0 ? 1 : 0);
}

// 僅在直接以 CLI 執行本檔時才呼叫 main()；被其他模組 import 時（如測試）不觸發 process.exit。
const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  main();
}
