// 字型子集涵蓋率檢查（涵蓋率檢查納入 `validate:data`；規格：plan/01-architecture.md §3.9.3、A13）。
//
// 純函式庫 checkFontCoverage()：不呼叫 process.exit、不印東西，供 Vitest 直接 import
// （比照 tools/validate.ts、tools/scan-simplified.ts 的「純函式庫＋CLI 包裝」慣例）。
// CLI 包裝 main()：印報告、依結果決定 exit code。
//
// 比對方式：以 tools/subset-font.ts 產生時寫入的 manifest（記錄「產生當下實際嵌入的字元」）
// 與「重新掃描目前原始碼／資料得到的應涵蓋字元」（tools/font-charset.ts）比較，缺字即回報。
// 不重新解析 woff2 二進位 cmap 表——manifest 與成品由同一次執行寫出，可信度等同直接讀 cmap，
// 但實作成本低得多；代價是若有人手動置換 woff2 卻不更新 manifest 則偵測不到，此為已知限制
// （M0 階段風險低：成品只由 npm run font:subset 產生）。
//
// manifest／成品缺席（如離線環境無法取得 tools/assets 原始字型檔）：回傳 status='missing-font'，
// CLI 包裝只印警告、exit 0——此為 M0 期間的明式豁免（01 §8 決策記錄）；一旦字型原始檔補齊、
// 執行過一次 `npm run font:subset`，此檢查即自動恢復把關（缺字時 exit 1）。

import { existsSync, readFileSync } from 'node:fs';
import { collectRequiredChars } from './font-charset';
import {
  FONT_SIZE_BUDGET_KB,
  OUTPUT_MANIFEST,
  OUTPUT_WOFF2,
  type FontManifest,
} from './font-paths';

export interface FontCoverageResult {
  readonly status: 'ok' | 'missing-chars' | 'missing-font' | 'over-budget';
  readonly missingChars: readonly string[];
  readonly sizeKb: number | null;
  readonly message: string;
}

export interface FontCoverageOptions {
  /** 覆寫 manifest 路徑（測試用；預設為 public/fonts/noto-serif-tc-subset.manifest.json）。 */
  readonly manifestPath?: string;
  /** 覆寫 woff2 路徑（測試用；預設為 public/fonts/noto-serif-tc-subset.woff2）。 */
  readonly woff2Path?: string;
  /** 覆寫「目前應涵蓋字元」的計算結果（測試用；預設重新掃描 zh-TW.ts＋劇本資料）。 */
  readonly requiredChars?: ReadonlySet<string>;
}

/** 純函式：比對目前應涵蓋字元與最近一次 `npm run font:subset` 產生的 manifest。 */
export function checkFontCoverage(options: FontCoverageOptions = {}): FontCoverageResult {
  const manifestPath = options.manifestPath ?? OUTPUT_MANIFEST;
  const woff2Path = options.woff2Path ?? OUTPUT_WOFF2;

  if (!existsSync(manifestPath) || !existsSync(woff2Path)) {
    return {
      status: 'missing-font',
      missingChars: [],
      sizeKb: null,
      message:
        '尚未產生字型子集（tools/assets 原始字型缺席，或尚未執行過 npm run font:subset）。' +
        'M0 期間豁免：本次 validate:data 僅警告、不視為失敗（01 §8 決策記錄）；' +
        '字型原始檔補齊後請執行 npm run font:subset 以啟用完整涵蓋率把關。',
    };
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as FontManifest;
  const embedded = new Set(Array.from(manifest.chars));
  const required = options.requiredChars ?? collectRequiredChars().chars;

  const missingChars = Array.from(required).filter((ch) => !embedded.has(ch));
  const sizeKb = manifest.sizeBytes / 1024;

  if (missingChars.length > 0) {
    return {
      status: 'missing-chars',
      missingChars,
      sizeKb,
      message: `字型子集缺 ${missingChars.length} 個字元，請重新執行 npm run font:subset。`,
    };
  }

  if (sizeKb > FONT_SIZE_BUDGET_KB) {
    return {
      status: 'over-budget',
      missingChars: [],
      sizeKb,
      message: `子集字型 ${sizeKb.toFixed(1)} KB 超出 BAL.perfFontKb=${FONT_SIZE_BUDGET_KB} KB 預算（01 §3.9.1）。`,
    };
  }

  return {
    status: 'ok',
    missingChars: [],
    sizeKb,
    message: `字型涵蓋率通過（${required.size} 字元，${sizeKb.toFixed(1)} KB／${FONT_SIZE_BUDGET_KB} KB 預算）。`,
  };
}

function formatMissing(chars: readonly string[]): string {
  return chars
    .map((ch) => `${ch}(U+${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')})`)
    .join(' ');
}

function isDirectRun(): boolean {
  return process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
}

function main(): void {
  const result = checkFontCoverage();
  console.log(result.message);
  if (result.status === 'missing-font') {
    process.exit(0);
  }
  if (result.status === 'missing-chars') {
    console.error(formatMissing(result.missingChars));
  }
  process.exit(result.status === 'ok' ? 0 : 1);
}

if (isDirectRun()) {
  main();
}
