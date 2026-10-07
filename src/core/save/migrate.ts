// 存檔版本遷移框架（16 §3.6／§4.5；MVP 先行實作 M8-12 子集）。
// MVP 階段只有 v1 格式，MIGRATIONS 為空鏈；框架先落地讓 codec 與測試自始走遷移路徑，
// M8-12 增補實際遷移條目時不需改呼叫端。

/** 目前存檔格式版本（寫入時蓋章；讀取時 version > 此值 → newerVersion 錯誤）。 */
export const SAVE_FORMAT_VERSION = 2;

/** 單一遷移步驟：把 `from` 版的 SaveFile 原地升級為 `from + 1` 版（16 §4.5）。 */
export interface SaveMigration {
  from: number;
  /** 就地修改傳入的 envelope（含 state），並負責把 version 設為 from + 1。 */
  migrate: (saveFile: { version: number; state: unknown }) => void;
}

/** 遷移鏈（依 from 升冪；v1 起點，目前為空）。 */
function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('存檔遷移需要物件');
  return value as Record<string, unknown>;
}
export const MIGRATIONS: readonly SaveMigration[] = [
  {
    from: 1,
    migrate(saveFile) {
      const state = record(saveFile.state);
      for (const value of Object.values(record(state.castles))) {
        const castle = record(value);
        castle.betrayalImmunityUntilDay = 0;
        castle.betrayalReadyTargetClanId = null;
        castle.betrayalReadyTargetLordId = null;
        // Legacy marks lack the original owner/lord snapshot and cannot safely survive migration.
        castle.betrayalReadyClanId = null;
        castle.betrayalReadyUntilDay = 0;
      }
      record(state.meta).saveVersion = 2;
      saveFile.version = 2;
    },
  },
];

/**
 * 執行遷移鏈：從 saveFile.version 逐步升級至 SAVE_FORMAT_VERSION。
 * 缺對應步驟（理論不可達：MIGRATIONS 必須連續覆蓋歷史版本）→ throw，由呼叫端轉 corrupt。
 */
export function runMigrationChain(saveFile: { version: number; state: unknown }): void {
  while (saveFile.version < SAVE_FORMAT_VERSION) {
    const step = MIGRATIONS.find((m) => m.from === saveFile.version);
    if (step === undefined) {
      throw new Error(`存檔遷移鏈缺少 v${String(saveFile.version)} 的遷移步驟`);
    }
    step.migrate(saveFile);
    if (saveFile.version !== step.from + 1) {
      throw new Error(`遷移步驟 v${String(step.from)} 未正確推進版本號`);
    }
  }
}
