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

  // ── 尋路 computePath 邊權／通行規則／制壓估算（15 §5.1；04 §3.4.2／§3.4.3／§3.8／§5.2／§5.8；
  //    08 §3.1；M2-7 src/core/systems/pathfinding.ts 所需） ──
  roadGradeSpeedMult: { 1: 1.0, 2: 1.3, 3: 1.6 }, // 15 §5.1：道級速度倍率；edgeCostDays = baseDays / 本表[grade]（04 §3.4.2）
  seaEmbarkDays: 1, // 15 §5.1：陸轉海登船延遲，日；連續海路不重複計（04 §3.4.3）
  subjugateDaysBase: 4, // 15 §5.1：制壓基礎日數（04 §3.8 公式）
  subjugateDaysMin: 3, // 15 §5.1：制壓日數下限夾限（04 §3.8）
  subjugateDaysMax: 10, // 15 §5.1：制壓日數上限夾限（04 §3.8）
  subjugateKokuPerExtraDay: 30_000, // 15 §5.1：郡石高每滿此值（石）制壓日數 +1（04 §3.8；規模修正）
  warStateMonths: 6, // 15 §5.1：交戰狀態判定窗，月；atWar(A,B) := lastHostileDay 在此窗內且無生效協定（08 §3.1）

  // ── 城下施設 slot 數（02 §5.7／15 §5.1；M2-2 tools/validate.ts V14 facilities.length 上限所需） ──
  facilitySlotsMain: 6, // 15 §5.1（mainCastleSlots，勘誤 E-39）：本城城下施設可用 slot 數（05 §3.4.1／02 §5.7）
  facilitySlotsBranch: 3, // 15 §5.1（branchCastleSlots，勘誤 E-39）：支城城下施設可用 slot 數（05 §3.4.1／02 §5.7）

  // ── 劇本資料驗證常數（14 §5.4 建議初值；15 §5.1 主表；M2-2 tools/validate.ts V6/V7/V12/V13/V15 所需） ──
  dataTotalKokudakaMin: 17_500_000, // 14 §3.2／§5.4：全國總石高下限（石）；基準 18,000,000
  dataTotalKokudakaMax: 18_500_000, // 14 §3.2／§5.4：全國總石高上限（石）
  dataCastleMin: 115, // 14 §3.2／§5.4：城數下限（基準 121）
  dataCastleMax: 125, // 14 §3.2／§5.4：城數上限
  dataDistrictMin: 330, // 14 §3.2／§5.4：郡數下限（基準 343）
  dataDistrictMax: 370, // 14 §3.2／§5.4：郡數上限
  dataOfficerMin: 550, // 14 §3.2／§5.4：具名武將數下限（基準 625）
  dataOfficerMax: 650, // 14 §3.2／§5.4：具名武將數上限
  dataClanMin: 38, // 14 §3.2／§5.4：勢力數下限（基準 41）
  dataClanMax: 42, // 14 §3.2／§5.4：勢力數上限
  dataProvinceCount: 60, // 14 §3.2／§5.4（§8-D4）：國數定值
  dataDistrictsPerCastleMin: 2, // 14 §3.2／§5.4：每城轄郡數下限
  dataDistrictsPerCastleMax: 4, // 14 §3.2／§5.4：每城轄郡數上限
  dataClanColorMinRing: 4, // 14 §5.4：相鄰勢力色盤環距下限（40 色環）
  dataAnchorTolerance: 16, // 14 §3.4／§5.4：20 錨點城座標容差（world unit）
  dataQuotaDeviationMax: 0.1, // 14 §3.2／§5.4：地方配額偏差合格上限（±10%；V15 WARN 門檻）

  // ── builder 資料側（15 §5.1；14 §3.8／§5.3；M2-8 src/core/state/builder.ts 所需） ──
  comingOfAgeAge: 15, // 14 §5.3／06 §3.10：元服年齡（debutYear=birthYear+此值，缺 debutYear 資料時之推導）
  durabilityMain: 3000, // 14 §5.3／02 §5.7：本城耐久上限基準值（缺 maxDurability 資料時之推導）
  durabilityBranch: 1000, // 14 §5.3／02 §5.7：支城耐久上限基準值
  roninPoolSize: 40, // 14 §3.8：開局由 builder 程序生成的無名浪人數量
  roninTraitChance: 0.35, // 14 §3.8：生成浪人持有 1 個普通特性的機率

  // ── 忠誠目標值公式（06 §3.6.1；builder 開局初始化用，M2-8。註：merit=0／stalledPromotionMonths=0
  //    於開局恆使升格延宕懲罰項不觸發，故未收錄 loyaltyStalledPromotion／stalledPromotionGraceMonths，
  //    待 M3-1 起 06 忠誠月結完整落地時一併補上） ──
  loyaltyBase: 50, // 06 §3.6.1：忠誠目標值基準
  loyaltyRankGapWeight: 6, // 06 §3.6.1：treatment() 之身分落差權重
  expectedRankAbilityThresholds: [55, 70, 80, 90, 100], // 06 §3.6.1：expectedRankIndex() 門檻表
  loyaltyFiefBonus: 10, // 06 §3.6.1：持有知行加成
  loyaltyKinBonus: 30, // 06 §3.6.1：一門加成
  loyaltyFudaiBonus: 10, // 06 §3.6.1：譜代加成
  loyaltyLeaderPolDivisor: 20, // 06 §3.6.1：當主政務代理除數（floor(leader.pol/此值)）
  loyaltyPrestigeDivisor: 400, // 06 §3.6.1：威信代理除數（floor(clan.prestige/此值)）
  traitChushin: 20, // 06 §3.3：trait.chushin 忠誠目標值加成
  traitYashinLoyalty: 10, // 06 §3.3：trait.yashin 忠誠目標值扣減
  traitJinbo: 3, // 06 §3.3：trait.jinbo 同城忠誠光環（不含自身）
  traitHitotarashiLoyalty: 5, // 06 §3.3：trait.hitotarashi 同城忠誠光環（不含自身）

  // ── UI／渲染效能（15 §5.1；01 §3.6.1；M2-13 MapRenderer Application.init 所需） ──
  uiDprMax: 2, // 15 §5.1：Pixi resolution／devicePixelRatio 取用上限（倍率，無量綱；01 §3.6.1）
} as const;

export type BalConfig = typeof BAL;
