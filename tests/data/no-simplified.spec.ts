// 簡體字掃描器整合測試（規格：plan/17-testing.md §3.6.2〔演算法／範圍〕、§7-T3〔驗收案例〕）。
// import 純函式 scanSimplified，斷言回傳的 ScanFinding[] 為空或符合預期命中；
// 失敗訊息由 vitest 的 toEqual/toMatchObject 完整列出所有筆數與位置（17 §3.6.2）。
//
// 注意：本檔本身落在掃描範圍 tests/**/*.ts 內（不在豁免清單），故下方三個測試探針字元一律以
// \u 逃逸序列表示、不在原始檔內嵌黑名單字元本體（比照 17 §8 決策 3／19 §3.13 E-72 的處理方向），
// 避免掃描器自我誤報；探針字元只在執行期組成暫存檔內容，暫存檔不落在 repo 掃描範圍內。
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { scanSimplified } from '../../tools/scan-simplified';

// 本檔位於 tests/data/，回推兩層即 repo 根目錄。
const REPO_ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));

// 探針常數刻意以 \u 逃逸序列賦值（而非原始檔內嵌字元），使本檔原始位元組不含黑名單字元本體。
/** L1 測試探針：對應正體「戰」的無歧義簡體字（碼位 U+6218），出現即應報告。 */
const L1_PROBE = '\u6218';
/** L3 測試探針：對應正體「櫻」的日文新字體（碼位 U+685C），出現即應報告。 */
const L3_PROBE = '\u685c';
/** L2 測試探針：語境敏感字，對應正體「後」的簡轉繁誤植形（碼位 U+540E），語境不合法時應報告。 */
const CONTEXT_PROBE = '\u540e';

describe('scanSimplified — 全 repo 掃描（17 §3.6.2／18 M0-6 驗收）', () => {
  it('掃描全 repo（豁免清單以外）結果為 0 筆', () => {
    const findings = scanSimplified(REPO_ROOT);
    expect(findings).toEqual([]);
  });

  it('CLI（npm run scan:simplified 同源）對目前 repo 掃描 exit code 為 0', () => {
    const tsxBin = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx');
    const result = spawnSync(tsxBin, ['tools/scan-simplified.ts'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
  });
});

describe('scanSimplified — 植入測試字元（17 §7-T3：簡體／新字體／語境各一）', () => {
  let tempRoot: string | undefined;

  afterEach(() => {
    if (tempRoot !== undefined) {
      rmSync(tempRoot, { recursive: true, force: true });
      tempRoot = undefined;
    }
  });

  it('植入 L1 簡體字探針 → 1 筆，rule=simplified，建議正體字為對應繁體', () => {
    tempRoot = writeFixture(`${L1_PROBE}國時代`);
    const findings = scanSimplified(tempRoot);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ char: L1_PROBE, rule: 'simplified', suggestion: '戰' });
  });

  it('植入 L3 日文新字體探針 → 1 筆，rule=shinjitai，建議正體字為對應繁體', () => {
    tempRoot = writeFixture(`${L3_PROBE}の花が咲く`);
    const findings = scanSimplified(tempRoot);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ char: L3_PROBE, rule: 'shinjitai', suggestion: '櫻' });
  });

  it('植入 L2 語境誤植探針（不合法語境）→ 1 筆，rule=context，建議正體字「後」', () => {
    tempRoot = writeFixture(`越${CONTEXT_PROBE}之戰`);
    const findings = scanSimplified(tempRoot);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ char: CONTEXT_PROBE, rule: 'context', suggestion: '後' });
  });

  it('合法語境用字（皇后／若干／公里）→ 0 筆', () => {
    tempRoot = writeFixture('皇后與若干公里');
    const findings = scanSimplified(tempRoot);
    expect(findings).toEqual([]);
  });
});

/** 建立一個獨立暫存 repo（含 src/ 子目錄與一個 .ts 檔），回傳其根目錄路徑。 */
function writeFixture(lineContent: string): string {
  const root = mkdtempSync(path.join(tmpdir(), 'scan-simplified-fixture-'));
  const srcDir = path.join(root, 'src');
  mkdirSync(srcDir, { recursive: true });
  writeFileSync(path.join(srcDir, 'fixture.ts'), `// ${lineContent}\n`, 'utf8');
  return root;
}
