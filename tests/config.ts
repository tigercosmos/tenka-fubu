// 測試設定常數（規格：plan/17-testing.md §4.1，原樣轉錄）。
// 測試門檻不是遊戲平衡值，不進 BAL.*（理由見 17 §8-1）；集中於 TESTCFG。
export const TESTCFG = {
  /** golden：全國劇本種子（任意固定值，取桶狹間 1560/05/19） */
  goldenSeedFull: 15600519,
  /** golden：mini 劇本種子 */
  goldenSeedMini: 42,
  /** golden：全國模擬遊戲年數 */
  goldenYearsFull: 5,
  /** golden：mini 模擬遊戲年數 */
  goldenYearsMini: 2,
  /** bitwise 重跑測試的模擬日數 */
  determinismDays: 360,
  /** 野戰公平性測試的固定種子數 */
  fieldFairnessSeeds: 1000,
  /** 野戰公平性勝率下限／上限（≈ p=0.5 的 3σ，見 §5.6） */
  fieldFairnessWinRateMin: 0.45,
  fieldFairnessWinRateMax: 0.55,
  /** advanceDay 平均毫秒上限（本機基準；00 效能目標） */
  advanceDayAvgMsMax: 8,
  /** CI 機器放寬係數 */
  ciPerfFactor: 2,
  /** 效能測試暖身／量測 tick 數 */
  perfWarmupDays: 60,
  perfMeasureDays: 360,
  /** s1560 開局存檔壓縮後大小上限（bytes） */
  maxSaveCompressedBytes: 2_000_000,
  /** command log 環形紀錄器容量（條） */
  commandLogCapacity: 50_000,
  /** core 覆蓋率門檻（%） */
  coreCoverageLinesMin: 80,
  coreCoverageBranchesMin: 70,
  /** 簡體字掃描豁免檔（相對 repo 根目錄；與 19 §4 掃描器豁免統一，E-73） */
  scanExemptFiles: [
    'plan/14-scenario-data.md',
    'plan/17-testing.md',
    'plan/19-glossary.md',
    'tools/simplified-chars.ts',
    'tools/glossary/forbiddenChars.ts',
  ],
} as const;
