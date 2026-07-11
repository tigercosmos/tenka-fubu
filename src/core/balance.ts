// 全部 BAL.* 平衡數值常數（唯一定義處）。
// 規格：plan/15-balance.md（主表，§4.1 程式結構、§5.1 主表）。
// M1 僅放實際用到的常數（本檔逐步成長）；M9-1 與 15 主表全量對齊。

export const BAL = {
  // ── 遊戲迴圈・tick・報告（03）──
  rngWarmupDraws: 12, // 次；各亂數流播種後空轉抽取次數，去除低熵種子相關性（15 §5.1；03 §3.5.2）
  maxCommandsPerTick: 200, // 個/tick；Step 1 applyCommands 單 tick 套用 Command 數上限（15 §5.1；03 §3.3.1／§5.1；M1-6）
  debugSkipMaxDays: 3600, // 日；debug 時間跳轉單次上限（15 §5.1；03 §3.9.2；M1-6 debugSkipDays 驗證用）
  debugGrantGoldAmount: 10_000, // 貫；除錯面板「金錢作弊」鈕之 debugGrant 金額（15 §5.1 主表新增列，出處 01 §3.11.2／§3.11.3「建議 10000」；M1-22，見 15 §8 D20）

  // ── 02 §5.7／15 §5.1（02 引入之型別上限常數；M1-11 validateState INV-16 數值範圍所需） ──
  abilityMax: 120, // 15 §5.1：武將四維能力（統率/武勇/知略/政務）上限（02 §5.7；INV-16）
  prestigeMax: 2000, // 15 §5.1：勢力威信上限（02 §5.7；INV-16）
  maxDeputies: 2, // 15 §5.1：每支部隊副將數上限（02 §5.7；INV-06）
  fiefMaxByRank: [0, 1, 1, 2, 3, 4], // 15 §5.1：各身分（06 身分六階序）可受封知行郡數上限（02 §5.7，勘誤 E-03；INV-05 fiefCapOf(rank)）

  // ── 05 §3.4.1／15 §5.1（城下施設佇列；M1-11 INV-21 所需） ──
  buildQueueSize: 3, // 15 §5.1：每城建造佇列容量（05 §3.4.1；INV-21）

  // ── 02 §5.7／15 §5.1（報告保留上限；M1-11 INV-25 所需） ──
  reportMaxKept: 500, // 15 §5.1：報告（通知）保留數量上限（02 §5.7，勘誤 E-31；INV-25）

  // ── 03 §3.4.3／15 §5.1（reports 修剪；M1-8 所需） ──
  reportRetentionDays: 360, // 15 §5.1：報告保留期，超過此日數即修剪（03 §3.4.3／§5.4）

  // ── AI 排程器骨架（15 §5.1；03 §3.8.2／§7-T10／§8-D8；M1-24） ──
  // 注意：與 09 §3.10「aiCouncilMaxPerTick＝4（階段/tick）」為不同機制、不同單位的兩個常數
  // （15 §5.1 分列兩表，皆定案值 4，數值巧合相同）：本項 aiCouncilsPerTick 供 M1 骨架的
  // 「整家評定」攤平消化用；aiCouncilMaxPerTick 留待 M7-4 導入逐階段（09 §3.3 四階段）
  // 攤平＋削峰時再加入 balance.ts（M1 僅放實際用到的常數）。見 03 §3.8.2 附註與 §8-D13。
  aiCouncilsPerTick: 4, // 15 §5.1：AI 月度評定每 tick 消化的勢力家數（03 §3.8.2；40 家於 10 tick 內評定完畢）

  // ── 合戰子迴圈契約（15 §5.1；07 §3.9／§5.4；03 §3.7.2；M1-26 假解算器所需） ──
  kassenMaxTicks: 120, // 15 §5.1：合戰時限（tick 上限），達此值強制勝敗判定（07 §3.9／§5.4 step 8）
  kassenTiebreakMult: 1.05, // 15 §5.1：時限到期時攻方判勝所需的殘存戰力倍率（攻方 ≥ 守方×此值才判攻方勝，07 §3.9，§8 D9：無平手）
} as const;

export type BalConfig = typeof BAL;
