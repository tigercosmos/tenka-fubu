// CI 里程碑門檻判定腳本（規格：plan/18-roadmap.md §4.1、plan/17-testing.md §3.11.2）。
//
// 讀取 repo 根目錄 milestone.json 的 current，對照 17 §3.11.2「里程碑品質門檻」表，
// 判定其中「先以 ○（僅報告）產出、之後才轉 ✓（阻斷）」的兩項門檻目前是否應以阻斷模式執行：
//   - golden-s1560（M8-28 以 ○ 產出、M9-6 轉 ✓ 阻斷）
//   - AI 合法性 A2／全國（M7-14 以 ○ 產出、M8-29 轉 ✓ 阻斷）
// 其餘檢查項（tsc/eslint/prettier、簡體字掃描、typecheck、基礎 unit、golden-mini、
// Playwright P1–P3/P5/P4、AI 合法性 A1、replay 回歸庫……）在各自產出的當個里程碑即恆為阻斷，
// 不受本腳本控制（其判斷方式＝檔案是否存在，由 .github/workflows/ci.yml 的存在性檢查處理）。
//
// 用法（GitHub Actions step）：
//   npx tsx tools/ci/milestone-gate.ts >> "$GITHUB_OUTPUT"
// 輸出格式：GitHub Actions step output（每行一筆 key=value）。
// 本地 dry-run：npx tsx tools/ci/milestone-gate.ts（直接印到 stdout 觀察）。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** 里程碑代號順序（對應 plan/18-roadmap.md §4.1 的 MilestoneId 型別）。 */
const MILESTONE_ORDER = [
  'M0',
  'M1',
  'M2',
  'M3',
  'M4',
  'M5',
  'M6',
  'M7',
  'M8',
  'M9',
  'DONE',
] as const;

type MilestoneId = (typeof MILESTONE_ORDER)[number];

/** repo 根目錄 milestone.json 的形狀（plan/18-roadmap.md §4.1）。 */
interface MilestoneConfig {
  readonly current: MilestoneId;
  readonly completed: readonly MilestoneId[];
  readonly completedAt: Readonly<Partial<Record<MilestoneId, string>>>;
}

/** 各階段性門檻「轉為阻斷」的最早里程碑（17 §3.11.2 表中 ○→✓ 的欄位）。 */
const BLOCKING_FROM = {
  goldenS1560Blocking: 'M9',
  aiLegalityA2Blocking: 'M8',
} as const satisfies Record<string, MilestoneId>;

function isMilestoneId(value: unknown): value is MilestoneId {
  return typeof value === 'string' && (MILESTONE_ORDER as readonly string[]).includes(value);
}

function milestoneIndex(id: MilestoneId): number {
  return MILESTONE_ORDER.indexOf(id);
}

/** 讀取並驗證 milestone.json；形狀或一致性不合法時拋出（腳本以非 0 結束，CI 紅燈）。 */
export function loadMilestoneConfig(repoRoot: string): MilestoneConfig {
  const filePath = path.join(repoRoot, 'milestone.json');
  const raw = readFileSync(filePath, 'utf-8');
  const parsed: unknown = JSON.parse(raw);

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('milestone.json 不是合法物件');
  }
  const config = parsed as Partial<MilestoneConfig>;

  if (!isMilestoneId(config.current)) {
    throw new Error(`milestone.json.current 不合法：${JSON.stringify(config.current)}`);
  }
  if (!Array.isArray(config.completed) || !config.completed.every(isMilestoneId)) {
    throw new Error(`milestone.json.completed 不合法：${JSON.stringify(config.completed)}`);
  }

  // 一致性檢查（18-roadmap §4.1）：completed 必為 current 之前里程碑的前綴序列。
  const currentIdx = milestoneIndex(config.current);
  const expectedCompleted = MILESTONE_ORDER.slice(0, currentIdx);
  const actualCompleted = config.completed;
  const consistent =
    actualCompleted.length === expectedCompleted.length &&
    actualCompleted.every((id, i) => id === expectedCompleted[i]);
  if (!consistent) {
    throw new Error(
      `milestone.json.completed 與 current 不一致：` +
        `completed=${JSON.stringify(actualCompleted)}，` +
        `current="${config.current}" 之前應為=${JSON.stringify(expectedCompleted)}`,
    );
  }

  return {
    current: config.current,
    completed: config.completed,
    completedAt: config.completedAt ?? {},
  };
}

/** 計算各階段性門檻是否應以阻斷模式執行（供 GitHub Actions job outputs 使用）。 */
export function computeGateOutputs(config: MilestoneConfig): Record<string, string> {
  const currentIdx = milestoneIndex(config.current);
  const outputs: Record<string, string> = { milestoneCurrent: config.current };
  for (const [gate, threshold] of Object.entries(BLOCKING_FROM)) {
    outputs[gate] = String(currentIdx >= milestoneIndex(threshold));
  }
  return outputs;
}

function main(): void {
  const repoRoot = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
  const config = loadMilestoneConfig(repoRoot);
  const outputs = computeGateOutputs(config);
  const lines = Object.entries(outputs).map(([key, value]) => `${key}=${value}`);
  process.stdout.write(lines.join('\n') + '\n');
}

const isDirectRun =
  process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
if (isDirectRun) {
  main();
}
