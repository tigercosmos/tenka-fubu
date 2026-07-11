// 劇本資料驗證工具（規格：plan/14-scenario-data.md；整合方式：plan/17-testing.md §3.6.1）。
//
// M0 階段尚無劇本資料與 zod schema（兩者皆為 M2 產出），本檔為 M0-7 佔位 stub：
// - 純函式庫 validateScenario(scenarioId) 不呼叫 process.exit、不印東西，供 Vitest 直接 import
//   （tests/data/validate.spec.ts，17 §3.6.1）；偵測不到劇本資料時回傳「尚無劇本資料」提示。
// - CLI 包裝（本檔 main()）負責印報告與決定 exit code；無劇本資料時印提示並 exit 0（不視為失敗）。
// - 完整驗證規則（V1–V15：zod schema、ID 唯一、參照完整、街道圖連通、總石高範圍等）
//   於 M2-2 依 plan/14-scenario-data.md 接上，屆時 errors 陣列開始有內容、exit code 隨之改變。
import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** 單一劇本驗證結果。errors 非空即代表資料不合法（CLI 以此決定 exit code）。 */
export interface ValidationResult {
  readonly errors: readonly string[];
  /** 非驗證錯誤的提示訊息（如「尚無劇本資料」）；有值時不影響 exit code。 */
  readonly notice: string | null;
}

const SCENARIOS_ROOT = path.resolve(
  fileURLToPath(new URL('../src/data/scenarios', import.meta.url)),
);

/** 純函式：驗證劇本資料。不呼叫 process.exit、不印東西（17 §3.6.1 的「純函式庫」半部）。 */
export function validateScenario(scenarioId: string): ValidationResult {
  const scenarioDir = path.join(SCENARIOS_ROOT, scenarioId);
  const hasData = existsSync(scenarioDir) && readdirSync(scenarioDir).length > 0;
  if (!hasData) {
    return { errors: [], notice: '尚無劇本資料' };
  }
  // M2 起於此串接 14-scenario-data.md 的 V1–V15 完整規則，errors 開始可能非空。
  return { errors: [], notice: null };
}

/** CLI 包裝：印報告、決定 exit code（17 §3.6.1 的「CLI 包裝」半部）。 */
function main(): void {
  const scenarioId = process.argv[2] ?? 's1560';
  const result = validateScenario(scenarioId);
  if (result.notice !== null) {
    console.log(result.notice);
  }
  for (const err of result.errors) {
    console.error(err);
  }
  process.exit(result.errors.length > 0 ? 1 : 0);
}

// 僅在直接以 CLI 執行本檔時才呼叫 main()；被其他模組 import 時（如測試）不觸發 process.exit。
const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  main();
}
