// 字型子集化管線（規格：plan/01-architecture.md §3.9.3、A13；工具選型記錄：01 §8）。
//
// 掃描 src/i18n/zh-TW.ts 全字串＋src/data/scenarios/**/*.json 全 name 欄位＋數字標點集
// （tools/font-charset.ts），由 tools/assets/NotoSerifTC-Regular.ttf（Noto Serif TC 官方
// 可變字型原始檔，僅供子集化、不進 bundle）以 `subset-font`（harfbuzzjs 綁定）產出
// public/fonts/noto-serif-tc-subset.woff2（committed 成品；01 §8-D7）。
//
// 成品旁同時寫入 noto-serif-tc-subset.manifest.json：記錄「產生當下實際嵌入的字元集合」，
// 供 tools/check-font-coverage.ts 在不重新解析 woff2 二進位（cmap）的前提下判斷涵蓋率是否
// 與目前原始碼／資料同步（字串或劇本大改後必須手動重跑本腳本，manifest 才會更新）。
//
// 原始字型缺席時（如離線環境無法下載）：本腳本印出警告並以 exit 0 結束、不產生任何檔案；
// 下游 tools/check-font-coverage.ts 偵測不到 manifest 時同樣視為「尚無字型子集」而只警告、
// 不使 CI 紅燈——此為 M0 期間的明式豁免（01 §8 決策記錄），待字型原始檔補齊即自動恢復把關。

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import subsetFont from 'subset-font';
import { charsToSortedString, collectRequiredChars } from './font-charset';
import {
  FONT_SIZE_BUDGET_KB,
  OUTPUT_DIR,
  OUTPUT_MANIFEST,
  OUTPUT_WOFF2,
  RAW_FONT_PATH,
  type FontManifest,
} from './font-paths';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

/** 供 CLI 與測試共用的產生流程；純粹以回傳值表達結果，不呼叫 process.exit。 */
export async function generateFontSubset(): Promise<
  | { status: 'skipped-missing-source'; message: string }
  | { status: 'generated'; manifest: FontManifest }
> {
  if (!existsSync(RAW_FONT_PATH)) {
    return {
      status: 'skipped-missing-source',
      message:
        `原始字型檔缺席（${path.relative(REPO_ROOT, RAW_FONT_PATH)}），略過子集化。` +
        '請自 https://github.com/google/fonts/blob/main/ofl/notoseriftc/NotoSerifTC%5Bwght%5D.ttf ' +
        '取得後放回原路徑，再重跑 npm run font:subset（01 §8 決策記錄）。',
    };
  }

  const { chars, breakdown } = collectRequiredChars();
  const text = charsToSortedString(chars);
  const rawFont = readFileSync(RAW_FONT_PATH);

  const subsetBuffer = await subsetFont(rawFont, text, {
    targetFormat: 'woff2',
    variationAxes: { wght: 400 }, // 官方可變字型預設軸值為 200（ExtraLight）；明確釘選 400 才是 Regular。
  });

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_WOFF2, subsetBuffer);

  const manifest: FontManifest = {
    generatedAt: new Date().toISOString(),
    sourceFont: path.relative(REPO_ROOT, RAW_FONT_PATH),
    weight: 400,
    charCount: chars.size,
    chars: text,
    sizeBytes: subsetBuffer.byteLength,
    budgetKb: FONT_SIZE_BUDGET_KB,
  };
  writeFileSync(OUTPUT_MANIFEST, JSON.stringify(manifest, null, 2) + '\n');

  console.log(
    `字型子集完成：${chars.size} 字元(基準 ${breakdown.baseline}／i18n ${breakdown.i18n}／` +
      `劇本 name ${breakdown.scenarioNames})，成品 ${(subsetBuffer.byteLength / 1024).toFixed(1)} KB` +
      `(預算 ${FONT_SIZE_BUDGET_KB} KB) → ${path.relative(REPO_ROOT, OUTPUT_WOFF2)}`,
  );

  const sizeKb = subsetBuffer.byteLength / 1024;
  if (sizeKb > FONT_SIZE_BUDGET_KB) {
    console.error(
      `子集字型 ${sizeKb.toFixed(1)} KB 超出 BAL.perfFontKb=${FONT_SIZE_BUDGET_KB} KB 預算（01 §3.9.1）。`,
    );
  }

  return { status: 'generated', manifest };
}

function isDirectRun(): boolean {
  return process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
}

async function main(): Promise<void> {
  const result = await generateFontSubset();
  if (result.status === 'skipped-missing-source') {
    console.warn(result.message);
    return;
  }
  if (result.manifest.sizeBytes / 1024 > FONT_SIZE_BUDGET_KB) {
    process.exit(1);
  }
}

if (isDirectRun()) {
  void main();
}

// 統計檔案大小的輔助（測試用：驗證實際落盤檔案與 manifest 記錄的大小一致）。
export function statSizeBytes(filePath: string): number {
  return statSync(filePath).size;
}
