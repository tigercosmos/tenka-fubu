// GameState 樹與全部實體型別（欄位註解含單位/範圍＋出處）。
// 規格：plan/02-data-model.md §4.1~§4.17／§4.20（逐字轉錄）。
// 慣例（§4／§3.4）：所有欄位皆必填，可缺者明示 `| null`；全樹須 JSON 可序列化（無 Map/Set/Date/RegExp/函式/undefined）。
//
// 【M1 型別實作裁決｜02 §8「2026-07-11 M1 型別基座」】§4.11 DiplomacyRow 之 4 個 optional `?` 欄位
// （三輪裁決 1）與 02 §7「無 optional（?:）欄位」、§3.4 第 1 點「可缺欄位一律 X | null 並存 null」相牴觸
// （02 內部不一致）。依 00 > 02 與 §7/§3.4 規範裁定：改為非 optional——scalar → `| null`（null=未設）、
// cooldown 映射 → 必填 `Partial<Record<...>>`（比照 §4.14 cooldownUntil；缺鍵=預設）。語意（未設=預設）不變。

import type {
  AiPersonaId,
  ArmyId,
  BattleId,
  CastleId,
  ClanId,
  ClanPairKey,
  CorpsId,
  DistrictId,
  EventId,
  FacilityTypeId,
  MapNodeId,
  OfficerId,
  PlotId,
  PolicyId,
  ProposalId,
  ProvinceId,
  ReportId,
  RoadEdgeId,
  SiegeId,
  TacticId,
  TaimeiId,
  TransportId,
  TraitId,
} from './ids';
import type {
  ArmyMission,
  ArmyStatus,
  AweLevel,
  CastleTier,
  ConscriptPolicy,
  CorpsDirective,
  CourtRank,
  DevelopFocus,
  Difficulty,
  Kinship,
  OfficerStatus,
  PactKind,
  PlotKind,
  ProposalKind,
  ProposalStatus,
  Rank,
  Region,
  RoadKind,
  ShogunateTitle,
  SiegeMode,
} from './enums';
import type { Command } from '../commands/types';
import type { GameEvent } from './events';

// ═══════════════════════════════════════════════════════════════════
// 4.1 GameState 樹
// ═══════════════════════════════════════════════════════════════════
export interface GameState {
  meta: MetaState; // 劇本/種子/版本/流水號
  time: TimeState; // 曆法
  rng: RngState; // 多流亂數內部狀態
  clans: Record<ClanId, Clan>;
  officers: Record<OfficerId, Officer>;
  castles: Record<CastleId, Castle>;
  districts: Record<DistrictId, District>;
  provinces: Record<ProvinceId, Province>;
  roads: Record<RoadEdgeId, RoadEdge>; // 邊集合（載入後不變）
  armies: Record<ArmyId, Army>;
  fieldCombats: Record<string, FieldCombat>; // 進行中野戰（每節點一場；key = FieldCombat.id 'fc.*'；勘誤 E-18）
  battles: Record<BattleId, BattleState>; // 進行中合戰（戰術戰場；同時至多一場，勘誤 E-18）
  sieges: Record<SiegeId, Siege>; // 進行中攻城戰
  corps: Record<CorpsId, Corps>; // 軍團
  transports: Record<TransportId, TransportOrder>; // 進行中輸送隊（勘誤 E-41）
  diplomacy: DiplomacyState; // 外交列＋進行中外交工作＋調略＋提案
  court: CourtState; // 朝廷與幕府
  policies: Record<ClanId, ClanPolicyState>; // 各勢力政策狀態
  proposals: Record<ProposalId, Proposal>; // 具申
  events: EventsState; // 事件引擎狀態
  ai: AiState; // AI 狀態分支（09；intentLog 為 transient，勘誤 E-60）
  reports: Report[]; // 通知（新→舊，長度 ≤ BAL.reportMaxKept）
}

// ═══════════════════════════════════════════════════════════════════
// 4.2 MetaState / TimeState / RngState
// ═══════════════════════════════════════════════════════════════════
export interface MetaState {
  saveVersion: number; // 存檔格式版本，整數 ≥1；遷移規則見 16
  appVersion: string; // 建置版本字串（如 '1.0.3'），僅供顯示與除錯
  scenarioId: string; // 劇本 id：v1.0 恆為 's1560'
  seed: number; // 初始種子，uint32（0..2^32-1）；重放重現用
  playerClanId: ClanId; // 玩家勢力
  difficulty: Difficulty; // 難易度（僅影響 AI 修正，00 §11）
  nextSerials: {
    // 執行期 ID 流水號（§5.3），各為整數 ≥1，只增不減
    army: number;
    battle: number;
    siege: number;
    corps: number;
    proposal: number;
    report: number;
    transport: number; // 勘誤 E-41
    plot: number; // 勘誤 E-28
  };
  gameOver: GameOverState | null; // 結局狀態；null=遊戲進行中（10 §4.3 canonical，勘誤 E-55）
  // ── 迴圈機制欄位（03 §4.5 LoopMeta；M1-6／M1-7 落地時併入 MetaState，見 03 §8-D14）──
  stateVersion: number; // 每 tick +1（advanceDay 結尾）；UI 訂閱重繪依據（03 §3.1／§4.5；M1-7）
  lastAppliedCmdSeq: number; // 冪等防線：Step 1 跳過 seq ≤ 此值之 envelope（03 §3.3.3／§5.1；初始 0；M1-6）
  debugMode: boolean; // debug 指令閘門（?debug=1 設定，見 01）；false 時 debugSkipDays/debugGrant 被拒（03 §3.9；M1-6）
  territoryChangedToday: boolean; // Step 12 勝敗檢查髒標記；Step 13 後由 advanceDay 重置為 false（03 §3.2.4／§4.5；M1-7）
  deferredEvents: GameEvent[]; // 合戰寫回暫存（§3.7.2）；下一 tick Step 2 併入事件流後清空（03 §4.5；M1-7 骨架恆空、M1-26 合戰 stub 起填入）
}

/** 結局狀態（10 §3.8／§4.3；gameOver≠null 時一切 Command 被拒，見 10 §5；02 §4.2） */
export interface GameOverState {
  kind: 'victory' | 'defeat'; // 勝利／敗北
  endingId: string; // 結局條件 id：'unification'/'tenkabito'/'no-heir'/'no-castle'（10 定義）
}

export interface TimeState {
  day: number; // 絕對日（單一真相）：0 = 1560年1月1日，整數 ≥0；1年=360日
  year: number; // 快取：西曆年（=1560+floor(day/360)）；INV-24 驗證
  month: number; // 快取：1..12
  dayOfMonth: number; // 快取：1..30
}
// season 為衍生值（§5.6）：month∈{3,4,5}→spring、{6,7,8}→summer、{9,10,11}→autumn、{12,1,2}→winter

export interface RngState {
  // mulberry32 各流內部狀態，uint32（0..2^32-1）；分流用途見 00 §5.5，演算法見 03
  battle: number; // 戰鬥（野戰/合戰/攻城）
  dev: number; // 內政開發
  ai: number; // AI 決策
  event: number; // 事件引擎
  misc: number; // 其他（壽命、忠誠抖動等）
}

// ═══════════════════════════════════════════════════════════════════
// 4.3 Clan（勢力）與 TaimeiState
// ═══════════════════════════════════════════════════════════════════
export interface Clan {
  id: ClanId;
  name: string; // 顯示名（繁中，如「織田家」）；專有名詞不進 i18n（00 §8）
  leaderId: OfficerId; // 當主；INV-08：必為本家 serving 武將
  homeCastleId: CastleId; // 本城（居城）；INV-09：須為本家 tier='main' 之城
  gold: number; // 金錢（貫），整數 ≥0（勢力層級資源，00 §4）
  prestige: number; // 威信，整數 0..BAL.prestigeMax（2000）
  courtRank: CourtRank; // 當主現任朝廷官位（v1.0 官位掛在勢力當主，見 §8 DDR-6）
  shogunateTitle: ShogunateTitle; // 幕府役職
  // persona 唯一真相為 AiClanState.personaId（§4.20）；Clan.personaId 已刪（四輪裁決 D-13，消除雙重真相）。
  colorIndex: number; // 勢力色索引，整數 0..39（40 色相環；渲染層由公式導出 hex，見 12 D5；劇本資料指定，勘誤 E-35）
  alive: boolean; // 滅亡狀態：false = 已滅亡（所有城被奪）；滅亡勢力保留於 state 供史錄
  destroyedDay: number | null; // 滅亡絕對日；alive=true 時為 null
  taimei: TaimeiState; // 大命狀態（可發動清單為衍生值，見 §5.1；語意見 10）
}

export interface TaimeiState {
  activeTaimeiId: TaimeiId | null; // 進行中大命；同時至多一個
  activeUntilDay: number; // 效果結束絕對日；無進行中大命時為 0
  cooldownUntilDay: number; // 此日（含）之前不可再發動；初始 0
}

// ═══════════════════════════════════════════════════════════════════
// 4.4 Officer（武將）
// ═══════════════════════════════════════════════════════════════════
export interface Officer {
  id: OfficerId;
  name: string; // 顯示名（繁中，如「織田信長」）
  clanId: ClanId | null; // 所屬勢力：serving=現屬；captive=原屬勢力（可能已滅亡，四輪裁決 A-c）；ronin/dead=null（INV-08；捕獲方另存 capturedByClanId）
  status: OfficerStatus; // 仕官 serving / 浪人 ronin / 捕虜 captive / 死亡 dead
  ldr: number; // 統率「基礎值」，整數 1..BAL.abilityMax（120）；有效值見 statGrowth
  val: number; // 武勇基礎值，整數 1..120
  int: number; // 知略基礎值，整數 1..120
  pol: number; // 政務基礎值，整數 1..120
  statExp: StatBlock; // 各維累積經驗（點；每 BAL.statExpPerPoint→成長 +1，勘誤 E-59；06 §3.2）
  statGrowth: StatBlock; // 各維已獲成長，整數 0..BAL.statGrowthCap；effectiveStat = min(120, 基礎值 + statGrowth)
  traits: TraitId[]; // 特性（被動技），0..BAL.maxTraitsPerOfficer（4）個，不重複
  rank: Rank; // 身分六階；升格規則見 06
  merit: number; // 功績，整數 ≥0（累積值，升格門檻見 06）
  loyalty: number; // 忠誠，整數 0..100；當主恆 100（INV-08）；<30 有出奔/被引拔風險
  kinship: Kinship; // 出身：一門/譜代/外樣；影響忠誠與繼承（勘誤 E-34；06 §4）
  spouseId: OfficerId | null; // 婚姻同盟成婚對象；無為 null（勘誤 E-44；08 §3.4.1）
  birthYear: number; // 生年（西曆），如 1534
  deathYear: number; // 卒年基準（西曆）：史實或生成卒年（＝06 historicalDeathYear）；開局據此排定 scheduledDeath，執行期不再另計抖動
  hasComeOfAge: boolean; // 已元服（年滿 15）；false 者不可被任何系統引用（INV-06）
  debutYear: number; // 元服登場年（06 §3.10；14 未給時 builder 以 birthYear + BAL.comingOfAgeAge 生成）
  debutClanId: ClanId | null; // 元服時加入的勢力（null=直接為浪人，06 §3.10）；14 未給時 builder 預設 = clanId
  debutCastleId: CastleId; // 元服/淪為浪人時的所在城（06 §3.10）；14 未給時 builder 預設 = locationCastleId
  locationCastleId: CastleId | null; // 所在城：serving 未出陣=駐在城；ronin=寄寓城；captive=關押城；出陣中/dead=null
  armyId: ArmyId | null; // 出陣中所屬部隊；未出陣為 null（與 locationCastleId 互斥，INV-07）
  capturedByClanId: ClanId | null; // status='captive' 時的捕獲勢力（俘方）；否則 null（原屬勢力見 clanId）
  // ── 06 機制持久欄位（四輪裁決 A；日期一律絕對日 number）──
  scheduledDeath: { year: number; month: number }; // 開局以 rng.event 決定論排定之壽命死亡年月（06 §3.9.1）；每月 1 日與 time 比對觸發自然死亡（06 §3.9.2）；戰死/事件死優先時排程作廢
  captiveRetryOn: number | null; // captive 登用失敗後之下次可嘗試絕對日（06 §3.7.2）；否則 null
  recruitRetryOn: number | null; // ronin 登用失敗後、其寄寓城所屬勢力之下次可嘗試絕對日（單一勢力冷卻，06 §3.7.1）；否則 null
  rewardGiftsThisYear: number; // 年內已受金錢賞賜次數，整數 ≥0（每年 1/1 歸零；06 §3.8.1）
  stalledPromotionMonths: number; // 功績達下一階門檻但未獲升格的連續月數，整數 ≥0（升格具申生成參考，06 §3.4.1／§5.1）
}

/** 四維數值組（統率/武勇/知略/政務），單位：點（勘誤 E-59；06 §4 OfficerStats；02 §4.4） */
export interface StatBlock {
  ldr: number;
  val: number;
  int: number;
  pol: number;
}
// 武將「役職」（城主/領主/軍團長）不存於 Officer，由 Castle.lordId / District.stewardId / Corps.corpsLeaderId 反查（§5.1，DDR-2）。

// ═══════════════════════════════════════════════════════════════════
// 4.5 Castle（城）與 BuildOrder
// ═══════════════════════════════════════════════════════════════════
export interface Castle {
  id: CastleId;
  name: string; // 顯示名（繁中，如「清洲城」）
  tier: CastleTier; // 城格：'main' 本城 / 'branch' 支城
  provinceId: ProvinceId; // 所屬國（顯示分組）
  coastal: boolean; // 臨海（湊/南蠻寺建設前置；劇本靜態，載入後不變；語意見 05 §3.4.2；勘誤 E-44/E-61）
  pos: { x: number; y: number }; // 地圖世界座標，0..4096（投影公式見 00 §8；載入後不變）
  ownerClanId: ClanId; // 所屬勢力；INV-02：必存在且 alive
  lordId: OfficerId | null; // 城主；null=空缺；INV-04：serving＋同勢力＋rank ≥ 'samurai-taisho'
  directControl: boolean; // true=大名直轄；false=委任（城主AI代管，語意見 09）
  corpsId: CorpsId | null; // 所屬軍團；null=不屬任何軍團（大名直轄方面）
  durability: number; // 耐久，整數 0..maxDurability；攻城目標（07）
  maxDurability: number; // 耐久上限，整數；建議初值 BAL.durabilityMain（3000）/ durabilityBranch（1000）
  soldiers: number; // 駐留兵力（人），整數 ≥0；上限為衍生值 castleMaxSoldiers（§5.1）
  food: number; // 兵糧（石），整數 ≥0；上限為衍生值 castleFoodCap（05）
  foodFrac: number; // 兵糧日消耗小數累加器，0..1（存檔保留以維持決定論；food 恆整數，05 §3.1.3／§5.2；四輪裁決 D-12）
  riceTradedThisMonth: number; // 本月米問屋買賣累計量（石），整數 ≥0；每月 1 日重置為 0（05 §5.5；四輪裁決 D-10）
  morale: number; // 城士氣，整數 0..100；受威風/圍城影響（07）
  conscriptPolicy: ConscriptPolicy; // 徵兵方針 low/mid/high（每月自動回復；勘誤 E-42；05 §3.5）
  facilities: FacilityTypeId[]; // 已建成城下施設（每種至多一個；佇列制，勘誤 E-39；05 §3.4）
  buildQueue: BuildOrder[]; // 建造佇列（[0]=施工中；長度 ≤ BAL.buildQueueSize；同時施工 1 件，勘誤 E-39）
  betrayalReadyClanId: ClanId | null; // 內應成果持有勢力；圍攻該城時可發動內應（勘誤 E-44；08 §3.7.3）
  betrayalReadyUntilDay: number; // 內應標記到期絕對日；無標記時為 0
  districtIds: DistrictId[]; // 所轄郡，2..4 個；與 District.castleId 互為鏡像（INV-03）
}

/** 建造佇列項（勘誤 E-39；05 §3.4；02 §4.5） */
export interface BuildOrder {
  facilityTypeId: FacilityTypeId; // 目標施設種類
  daysLeft: number; // 剩餘工期（日），整數 ≥0；下單時 = 該施設 buildDays（05 型錄）
}

// ═══════════════════════════════════════════════════════════════════
// 4.6 District（郡）
// ═══════════════════════════════════════════════════════════════════
export interface District {
  id: DistrictId;
  name: string; // 顯示名（繁中，如「春日井郡」）
  castleId: CastleId; // 所轄城（載入後不變；城易主時郡隨城，制壓為暫時例外）
  isPort: boolean; // 港郡（海路端點資格；劇本靜態，載入後不變；語意見 04 §3.4.3；勘誤 E-44）
  pos: { x: number; y: number }; // 地圖世界座標 0..4096（節點圖節點；載入後不變）
  ownerClanId: ClanId; // 歸屬勢力；平時=castleId 之 ownerClanId，制壓/威風後可暫時不同（04/07）
  stewardId: OfficerId | null; // 領主（知行受封者）；null=直轄；INV-05：serving＋同勢力；知行數上限見 §5.1
  kokudaka: number; // 石高（石/年，農業產出年額），≥0，≤ kokudakaCap（內部浮點儲存、顯示 floor，05 §3.2.1；四輪 D-12）
  kokudakaCap: number; // 石高開發潛力上限（石/年），整數；劇本資料指定，遊戲中不變
  commerce: number; // 商業，0..commerceCap（內部浮點儲存、顯示 floor，05 §3.2.1）
  commerceCap: number; // 商業潛力上限，整數 ≤ BAL.commerceMaxAbs（2000，00 §6）
  population: number; // 人口（人），≥0，≤ populationCap（內部浮點儲存、顯示 floor，05 §3.2.1）
  populationCap: number; // 人口上限（人），整數；劇本資料指定
  publicOrder: number; // 治安，整數 0..100；低於 BAL.uprisingOrderThreshold 有一揆風險（05）
  developFocus: DevelopFocus; // 開發重點（直轄郡由玩家指令設定；受封郡由領主AI自設，05/09）
  subjugation: {
    // 制壓進度；無人制壓時為 null（進度為郡的事實，DDR-9）
    clanId: ClanId; // 制壓方勢力；INV-20：≠ ownerClanId
    progress: number; // 進度 0..100（每日推進量見 04）；達 100 翻轉 ownerClanId
    daysRequired: number; // 制壓所需日數快取，整數 ≥1（抵達時依 04 §3.8 算定；同勢力接力換將以新部隊大將重算，四輪 D-14／DDR-9）
  } | null;
  uprising: UprisingState | null; // 一揆狀態；null=無（勘誤 E-43；語意見 05 §3.8）
}

/** 一揆狀態（勘誤 E-43；05 §3.8；02 §4.6） */
export interface UprisingState {
  startedOnDay: number; // 爆發絕對日
  armySoldiers: number; // 一揆軍現存兵力（人），整數 ≥0
}
// 「開發度」為衍生值 developmentPct（§5.1），不另存欄位。

// ═══════════════════════════════════════════════════════════════════
// 4.7 Province（國）與 RoadEdge（街道邊）
// ═══════════════════════════════════════════════════════════════════
export interface Province {
  id: ProvinceId;
  name: string; // 顯示名（繁中，如「尾張」）
  region: Region; // 9 地方分區（資料製作批次與 UI 篩選用）
  labelPos: { x: number; y: number }; // 國名標籤渲染座標 0..4096
}
// Province 轄下城清單為衍生值（以 castle.provinceId 反查）；Province 無任何可變欄位。

export interface RoadEdge {
  id: RoadEdgeId;
  a: MapNodeId; // 端點甲（城或郡節點）
  b: MapNodeId; // 端點乙；INV-11：a ≠ b、皆存在；(a,b) 無向對全域唯一
  type: RoadKind; // 'land' 陸路 / 'sea' 海路（勘誤 E-36；海路行軍規則見 04 §3.4.3）
  grade: 1 | 2 | 3; // 道級（道路品質）；速度倍率 BAL.roadGradeSpeedMult（海路固定 1，勘誤 E-36；04 §3.4.2）
  baseDays: number; // 基礎行軍日數（道級 1、無修正時走完此邊；0.5 為最小刻度，∈[0.5,8]）；有效日數 = baseDays / roadGradeSpeedMult[grade]（04）
}
// RoadEdge 載入後全欄位不變；鄰接表為載入時建立的 transient 衍生結構（§5.1）。

// ═══════════════════════════════════════════════════════════════════
// 4.8 Army（出陣中部隊）
// ═══════════════════════════════════════════════════════════════════
export interface Army {
  id: ArmyId;
  clanId: ClanId; // 所屬勢力
  leaderId: OfficerId; // 大將；INV-06：serving＋同勢力＋officer.armyId 回指本部隊
  deputyIds: OfficerId[]; // 副將 0..BAL.maxDeputies（2）人；約束同大將
  soldiers: number; // 兵數（人），整數 ≥0；歸 0 時部隊潰散消滅（07）
  initialTroops: number; // 出陣時兵數（人），整數 ≥0；潰走判定基準 soldiers < initialTroops × BAL.routTroopRatio（07 §3.2／§3.4）；途中補兵時同步上調（二輪裁決 B）
  food: number; // 攜帶兵糧（石），整數 ≥0；每日消耗，歸 0 士氣崩落（07）
  morale: number; // 部隊士氣，整數 0..100；≤ BAL.moraleBreakThreshold 潰走（07）
  status: ArmyStatus; // 活動層狀態機：marching / engaged / sieging / subjugating / returning / routed / holding
  mission: ArmyMission; // 意圖層任務目標（march/conquer/return，§3.3）；與 status 正交（二輪裁決 B；07 §3.1／§3.11／§3.13）
  originCastleId: CastleId; // 出陣城（歸還目的地；兵員兵糧歸還入庫）
  targetNodeId: MapNodeId | null; // 最終目標節點；returning 時為 originCastleId 所在節點、可為 null（原地解散待命不允許，見 04）
  path: MapNodeId[]; // 尋路結果節點序列（含起點與終點）；重尋路時整條替換
  pathCursor: number; // 已抵達之 path 索引（＝04 §4.2 MarchState.nodeIndex 語意），整數 0..path.length-1
  posNodeId: MapNodeId; // 最近抵達節點（= path[pathCursor]）
  edgeProgressDays: number; // 往 path[pathCursor+1] 之當前邊已累積行軍日數（日，浮點 ≥0）；位於節點上／已抵終點為 0（勘誤 E-11；04 §5）
  edgeCostDays: number; // 當前邊有效日數（日）＝edge.baseDays / BAL.roadGradeSpeedMult[grade]（海路固定＝baseDays）；抵達判定 edgeProgressDays ≥ edgeCostDays（勘誤 E-11；04 §3.4.2／§5）
  battleId: BattleId | null; // 進入合戰（BattleState）時所屬合戰；否則 null。野戰 engaged 歸屬由 FieldCombat.sideX.armyIds 反查（勘誤 E-18，INV-13）
  siegeId: SiegeId | null; // status='sieging' 時所屬攻城戰；否則 null（INV-13）
  autoReturn: boolean; // 自動歸還開關（預設 true）；糧將盡／任務完成時自動轉 returning（CmdSetAutoReturn 切換，勘誤 E-32；07 §3.13）
  corpsId: CorpsId | null; // 所屬軍團；null=大名直轄。非衍生：出陣時快照，軍團解散／收回城時顯式改 null（07 §3.12；二輪裁決 B）
  /** 最近野戰勝利所直接擊潰的部隊；後續追擊資格精確到 ArmyId，不得擴及同勢力其他部隊。 */
  pursuitEligibleArmyIds: ArmyId[];
}
// 狀態機合法轉移詳細觸發條件見 04/07（§4.8 圖示）。

// ═══════════════════════════════════════════════════════════════════
// 4.9 野戰（FieldCombat）與合戰（BattleState）進行中狀態（勘誤 E-18／DDR-12：陣 Jin 節點圖模型）
// ═══════════════════════════════════════════════════════════════════

/** 野戰交戰狀態（一節點一場；欄位語意與規則見 07 §3.3／§5.2；02 §4.9） */
export interface FieldCombat {
  id: string; // 'fc.<nodeId去前綴>-<開始日絕對tick>'（內部 id：不入 nextSerials、隨所屬狀態序列化，§3.2）
  nodeId: MapNodeId; // 交戰節點
  startedDay: number; // 開始絕對日
  sideA: FieldCombatSide; // 先到方
  sideB: FieldCombatSide;
  kassenUsed: boolean; // 本遭遇是否已發動過合戰
  interrupted: boolean; // 有進行中合戰（BattleState）或援軍流程時暫停每日解算（勘誤 E-64）
}

export interface FieldCombatSide {
  clanIds: ClanId[]; // 同側勢力（含同盟援軍）
  armyIds: ArmyId[]; // 同側部隊
  initialTroops: number; // 交戰開始時總兵數（威風判定用）
  cumulativeLosses: number; // 累計損失兵數
}

/** 合戰（戰術戰場）——策略時間暫停期間的獨立狀態機（07 §3.5～§3.9；02 §4.9） */
export interface BattleState {
  id: BattleId; // 六位流水（勘誤 E-12：id 格式依 02 §5.3）
  fieldCombatId: string; // 來源野戰遭遇（FieldCombat.id）
  nodeId: MapNodeId;
  terrain: string; // 遭遇節點地形（terrain 枚舉見 04）
  attackerClanId: ClanId; // 發動側
  defenderClanId: ClanId;
  jins: Jin[]; // 陣（戰場節點，建議 5×3）
  edges: JinEdge[]; // 陣間連線
  units: BattleUnit[]; // 合戰部隊（1 Army = 1 BattleUnit）
  tick: number; // 目前 battle tick（0 起）；達 BAL.kassenMaxTicks（120）強制結束
  saihai: { attacker: number; defender: number }; // 各側共用采配值 0..BAL.saihaiMax
  honjinFallenTick: number | null; // 本陣陷落 tick（威風判定用）
  result: BattleResult | null; // 進行中為 null
}

export type BattleSide = 'attacker' | 'defender';

/** 陣（合戰戰場節點，07 §3.6；02 §4.9） */
export interface Jin {
  id: string; // 'jin.<col>-<row>'（內部 id：不入 nextSerials、隨所屬狀態序列化，§3.2）
  col: number; // 0..4
  row: number; // 0..2
  owner: BattleSide | 'neutral';
  isHonjin: boolean; // 本陣（陷落＝立即敗北）
  flagPower: number; // 現有旗力
  flagPowerMax: number; // 旗力上限
  defenseBonus: number; // 防禦加成 0..1（僅對歸屬側部隊生效）
}

export interface JinEdge {
  a: string; // Jin id
  b: string; // Jin id
  moveCost: number; // 移動所需 tick（1 或 2）
}

/** 合戰部隊（勘誤 E-18：取代舊 BattleUnit 方格模型；02 §4.9） */
export interface BattleUnit {
  id: string; // 'bu.<armyId去前綴>'（內部 id：不入 nextSerials、隨所屬狀態序列化，§3.2）
  armyId: ArmyId; // 對應出陣部隊
  side: BattleSide;
  generalId: OfficerId; // 沿用 Army 大將
  troops: number; // 現有兵數（人），整數 ≥0
  battleInitialTroops: number; // 合戰開始時兵數（潰走與治療基準）
  morale: number; // 0..100
  jinId: string; // 所在陣
  moveTargetJinId: string | null; // 移動中的目標陣（沿單一邊）
  moveProgress: number; // 已累積移動 tick
  attackTargetUnitId: string | null; // 玩家指定攻擊目標
  activeTactics: ActiveTactic[];
  tacticCooldowns: Record<string, number>; // tacticId → 剩餘冷卻 tick
  delegated: boolean; // 是否委任 AI
  routed: boolean; // 已潰走（撤離中或已離場）
}

export interface ActiveTactic {
  tacticId: TacticId; // 'tac.*'
  remainingTicks: number; // 即時型不入列
  targetUnitId: string | null; // 減益型的目標
}

export interface BattleResult {
  winnerSide: BattleSide;
  endTick: number;
  attackerLosses: number; // 攻方累計損兵
  defenderLosses: number;
  aweLevel: AweLevel; // 勝方獲得的威風（'none'=無）
}
// 合戰結束由 07 結算函式算 AweLevel 填入 BattleResult.aweLevel 並發 battle.ended／awe.triggered；威風擴散直接改寫周邊 District.ownerClanId 與 Castle.morale。

// ═══════════════════════════════════════════════════════════════════
// 4.10 Siege（攻城戰進行中狀態）
// ═══════════════════════════════════════════════════════════════════
export interface Siege {
  id: SiegeId;
  castleId: CastleId; // 被圍之城
  attackerClanId: ClanId; // 攻方勢力（多部隊同勢力聯攻；跨勢力聯攻 v1.0 不支援）
  attackerArmyIds: ArmyId[]; // 攻方部隊（≥1，status 皆 'sieging'）
  mode: SiegeMode; // 'encircle' 包圍（斷糧耗士氣）/ 'assault' 強攻（削耐久、傷兵）
  startDay: number; // 開圍絕對日
  interrupted: boolean; // 援軍交戰中，圍城每日效果暫停（07 §3.11；與 E-18/E-64 同構）
  betrayalUsed: boolean; // 本場圍城是否已發動過內應（CmdUseBetrayal，勘誤 E-32）
}
// 城方兵力/兵糧/耐久/士氣直接使用 Castle 欄位演進（07），Siege 不重複儲存。

// ═══════════════════════════════════════════════════════════════════
// 4.11 DiplomacyState（外交）
// ═══════════════════════════════════════════════════════════════════
export interface DiplomacyState {
  rows: Record<ClanPairKey, DiplomacyRow>; // 稀疏：僅存偏離預設值的 pair；缺列視同預設列（§5.5）
  missions: DiploMission[]; // 進行中外交／獻金工作（同一 (fromClanId, target) 至多一件，INV-14；勘誤 E-27／三輪裁決 2）
  plots: Plot[]; // 進行中調略（引拔/流言/內應；勘誤 E-28；語意見 08 §3.7）
  pendingProposals: DiplomacyProposal[]; // 送達待回應的外交提案（勘誤 E-28；語意見 08 §3.4）
}

/** 每對勢力一列（無向 key；方向性數值以 a/b 兩欄表示，a = pairKey 字典序小者；02 §4.11） */
export interface DiplomacyRow {
  key: ClanPairKey; // = pairKey(a,b)
  a: ClanId; // 字典序小的勢力
  b: ClanId; // 字典序大的勢力
  trustAtoB: number; // a 對 b 累積的信用，0..100（允許小數累積、顯示 floor，08 §5.2.1；四輪裁決 D-16）
  trustBtoA: number; // b 對 a 累積的信用，0..100（允許小數累積、顯示 floor）
  sentimentAtoB: number; // a 對 b 的感情，−100..100（0=中立，允許小數累積；勘誤 E-24；預設 0）
  sentimentBtoA: number; // b 對 a 的感情，−100..100（0=中立，允許小數累積）
  pacts: Pact[]; // 進行中協定（同 kind 至多一件）
  // ── 08 機制之每對狀態欄位（語意擁有者 08、結構在此；三輪裁決 1）──
  // 【M1 型別實作裁決】原三輪裁決 1 以 optional `?` 宣告此四欄，與 §7「無 optional 欄位」／§3.4「可缺欄位 X | null」牴觸；
  // 依 00>02 與 §7/§3.4 改為非 optional：scalar → `| null`（null=未設）、映射 → 必填 Partial<Record>（比照 §4.14）。
  lastHostileDay: number | null; // 最近敵對行為絕對日（無向、單一值）；null=從未交戰（≠0：0 為第0日敵對，劇本開局交戰即設 0，見 14）；atWar 由此值在 BAL.warStateMonths 內推導、07 回寫（08 §3.1）
  refusalCooldownUntilDay: Partial<Record<DiplomacyActionKind, number>>; // 各外交行動被拒後之冷卻到期絕對日（pair 共用、依 kind 索引；缺鍵=0=無冷卻）；08 §5.3.2 寫、§5.3.1 讀
  lastReinforceRequestDayAtoB: number | null; // a 向 b 上次請求援軍之絕對日（有向；null=從未請求=冷卻已過，首次恆允許）；08 §5.3.2 寫、§5.3.5 讀
  lastReinforceRequestDayBtoA: number | null; // b 向 a 上次請求援軍之絕對日（有向，同上）；有向存取語糖見 08 §3.1／§4.11
}

/** 調略（勘誤 E-28；08 §3.7；02 §4.11） */
export interface Plot {
  id: PlotId; // 'plot.*'（§3.2）
  kind: PlotKind; // poach 引拔 / rumor 流言 / betrayal 內應
  ownerClanId: ClanId; // 發動方
  officerId: OfficerId; // 執行武將（佔用：不可出陣、不可另任外交工作/調略）
  targetClanId: ClanId; // 目標勢力
  targetOfficerId: OfficerId | null; // poach／rumor(武將模式) 必填；betrayal=目標城城主快照；否則 null
  targetCastleId: CastleId | null; // rumor(城模式)／betrayal 必填；否則 null
  investGold: number; // 一次性投入（貫），整數 ≥0；下達時已扣款
  progress: number; // 進度 0..100
  startedDay: number; // 開始絕對日
}

/** 外交提案種類（勘誤 E-28；08 §3.4）。'proposeNonAggression' 依 E-23 降級 v1.1，v1.0 不收錄（02 §4.11）。 */
export type DiplomacyActionKind =
  | 'proposeAlliance' // 同盟
  | 'proposeCeasefire' // 停戰
  | 'proposeMarriage' // 婚姻同盟
  | 'demandVassal' // 從屬勸告（強→弱）
  | 'offerVassal' // 從屬提案（弱→強）
  | 'requestReinforce'; // 援軍請求

/** 送達待回應的外交提案（勘誤 E-28；08 §3.4；02 §4.11） */
export interface DiplomacyProposal {
  id: ProposalId; // 與具申共用 prop. 流水（§5.3 nextSerials.proposal，全域唯一，勘誤 E-28）
  kind: DiplomacyActionKind;
  fromClanId: ClanId; // 發起方
  toClanId: ClanId; // 對象方
  createdDay: number; // 建立絕對日
  expiresDay: number; // 逾期絕對日（逾期視同拒絕）
  marriageOfficerIds: [OfficerId, OfficerId] | null; // 婚姻：〔from 方一門, to 方一門〕；否則 null
  reinforceAgainstClanId: ClanId | null; // 援軍請求：對抗的敵勢力；否則 null
}

export interface Pact {
  kind: PactKind; // alliance / marriage / ceasefire / vassal
  startDay: number; // 生效絕對日
  endDay: number | null; // 到期絕對日（含）；null=無期限（marriage、vassal）
  vassalClanId: ClanId | null; // kind='vassal' 時的從屬方（必為 a 或 b）；其他 kind 為 null
}

export interface DiploMission {
  fromClanId: ClanId; // 發起方
  target: ClanId | 'court' | 'shogunate'; // 對象：勢力（累積信用）／'court' 朝廷獻金（→courtFavor）／'shogunate' 幕府獻金（→shogunateFavor）；勘誤 E-27／三輪裁決 2
  officerId: OfficerId; // 執行武將（serving、屬 from 方；執行期間不可出陣，08）
  startDay: number; // 開始絕對日
  // 月費為固定 BAL 常數（對勢力 diplomacyWorkMonthlyCost／'court' courtWorkMonthlyCost），非玩家自訂（勘誤 E-27 尾）。
}

// ═══════════════════════════════════════════════════════════════════
// 4.12 CourtState（朝廷與幕府）
// ═══════════════════════════════════════════════════════════════════
export interface CourtState {
  courtFavor: Record<ClanId, number>; // 各勢力朝廷友好度，0..100（允許小數累積、顯示 floor，08 §5.2.2；四輪 D-16）；由 DiploMission target='court' 累積；官位敘任門檻（不消耗）與停戰斡旋消耗（08 §3.5）
  shogunateFavor: Record<ClanId, number>; // 各勢力幕府友好度，0..100（允許小數累積、顯示 floor，08 §5.2.2）；由 DiploMission target='shogunate' 累積；役職敘任門檻（08 §3.6.2）
  shogunateExists: boolean; // 幕府存續；歷史事件可使其滅亡（10）
  shogunClanId: ClanId | null; // 將軍家勢力（s1560 = 'clan.ashikaga'）；幕府滅亡後為 null
  patronClanId: ClanId | null; // 擁立將軍的勢力（全域至多一個）；未擁立或幕府滅亡為 null（三輪裁決 2；08 §3.6.3）
  mediationCooldownUntil: Record<ClanId, number>; // 各勢力下次可請朝廷斡旋停戰的絕對日；缺 key 視同 0
}
// 官位/幕府役職「持有狀態」存於 Clan.courtRank / Clan.shogunateTitle（單一真相，DDR-6）；本結構為朝廷/幕府之全域事實。CourtState 採扁平結構（不巢狀 ShogunateState；三輪裁決 2）。

// ═══════════════════════════════════════════════════════════════════
// 4.13 Corps（軍團）與 TransportOrder（輸送隊）
// ═══════════════════════════════════════════════════════════════════
export interface Corps {
  id: CorpsId;
  clanId: ClanId; // 所屬勢力
  corpsLeaderId: OfficerId; // 軍團長；INV-10：serving＋同勢力＋rank ≥ 'karo'
  directive: CorpsDirective; // 方針：advance 攻略 / hold 固守 / develop 開發（AI 行為見 09）
  targetNodeId: MapNodeId | null; // directive='advance' 時的攻略目標；其他方針為 null
  gold: number; // 軍團金庫（貫），整數 ≥0；轄城收入上繳 BAL.corpsTithe（07 §3.12；勘誤 E-22）
  createdDay: number; // 成立絕對日
}
// 軍團轄下城清單為衍生值（以 castle.corpsId 反查，§5.1）。

/** 輸送隊（GameState.transports；勘誤 E-41；語意見 05 §3.6；02 §4.13） */
export interface TransportOrder {
  id: TransportId; // 'trans.*'（§3.2）
  clanId: ClanId; // 所屬勢力
  fromCastleId: CastleId; // 出發城
  toCastleId: CastleId; // 目的城
  soldiers: number; // 押運兵力（人），整數 ≥0
  gold: number; // 押運金錢（貫），整數 ≥0
  food: number; // 押運兵糧（石），整數 ≥0（三者不得同時為 0）
  path: MapNodeId[]; // 全路徑節點序列（04 尋路產出，含起訖）
  pathCursor: number; // 目前所在節點在 path 的索引（與 Army 同語意＝04 MarchState.nodeIndex；勘誤 E-11）
  edgeProgressDays: number; // 往 path[pathCursor+1] 之當前邊已累積行軍日數（日，浮點 ≥0）；位於節點上為 0（勘誤 E-11；04 §5）
  edgeCostDays: number; // 當前邊（輸送隊調整後）有效日數（日）；完整公式歸 05 §3.6／§5.4（速度係數採除以慣例，四輪 D-15）；抵達判定 edgeProgressDays ≥ edgeCostDays
  returning: boolean; // 是否已被撤回折返中
}
// 輸送隊為非戰鬥單位，不需武將帶隊、不佔兵力（05 §3.6）。

// ═══════════════════════════════════════════════════════════════════
// 4.14 ClanPolicyState（政策狀態）
// ═══════════════════════════════════════════════════════════════════
export interface ClanPolicyState {
  clanId: ClanId;
  active: PolicyId[]; // 已施行政策（不重複；同時上限＝動態政策格 min(BAL.policySlotMax=6, 1+floor(威信/300))，勘誤 E-38；05 §3.7）
  cooldownUntil: Partial<Record<PolicyId, number>>; // 各政策廢止後可再採用之絕對日（缺鍵=無冷卻=0；BAL.policyReadoptCooldownMonths=6，05 §3.7.1；四輪 D-11）
}
// 政策採「即刻生效」（無施行期，四輪 D-11）；本結構只存「誰、已施行什麼、各政策再採用冷卻」。政策型錄見 05。

// ═══════════════════════════════════════════════════════════════════
// 4.15 Proposal（具申）
// ═══════════════════════════════════════════════════════════════════
export interface Proposal {
  id: ProposalId;
  clanId: ClanId; // 受理勢力（v1.0 僅玩家勢力會收到具申；AI 內部決策不走此表）
  officerId: OfficerId; // 具申武將（serving、屬同勢力，INV-15）
  kind: ProposalKind; // 種類（顯示分類）
  command: Command; // 採納時原樣入佇列執行的指令（單一真相：具申內容=指令 payload，DDR-7）
  createdDay: number; // 提出絕對日
  expiresDay: number; // 逾期絕對日 = createdDay + BAL.proposalExpireDays（60）
  status: ProposalStatus; // pending / accepted / rejected / expired
  meritReward: number; // 採納時具申者獲得的功績，整數 ≥0（生成時算定，06/09）
  estimatedCostGold: number; // 預估執行成本（貫；僅 UI 顯示，實際扣款由 command 執行，勘誤 E-48；06 §3.11）
  summaryKey: string; // 具申內容一句話的 i18n key（09 生成時指定，勘誤 E-48）
  summaryParams: Record<string, string | number>; // summaryKey 的插值參數（人名/地名等）
}

// ═══════════════════════════════════════════════════════════════════
// 4.16 EventsState（事件引擎狀態）
// ═══════════════════════════════════════════════════════════════════
export interface EventsState {
  fired: Record<EventId, number>; // 已觸發史實/條件事件 → 觸發絕對日（每事件一生一次）
  cooldownUntil: Record<string, number>; // 汎用事件群組 key → 冷卻到期絕對日（群組定義見 10）
  pendingChoiceEventId: EventId | null; // 等待玩家選擇的事件（modal 開啟中）；核心暫停推進（03）
  flags: Record<string, number>; // 事件旗標（布林以 0/1；含 unlock.* / harvest.* / defeat.*，勘誤 E-55；10 §4.3）
  tenkabitoStreakMonths: number; // 天下人條件連續成立月數，整數 ≥0（勘誤 E-55）
  stats: VictoryStats; // 結局統計（供 EndingScreen；勘誤 E-55；10 §3.8.5）
}

/** 結局統計（勘誤 E-55；10 §4.3；02 §4.16） */
export interface VictoryStats {
  battlesFought: number; // 玩家參戰場數，整數 ≥0
  battlesWon: number; // 玩家獲勝場數，整數 ≥0
  maxCastles: number; // 玩家歷史最大持城數，整數 ≥0
  maxKokudaka: number; // 玩家歷史最大石高（石），整數 ≥0
}

// ═══════════════════════════════════════════════════════════════════
// 4.17 Report（通知）
// ═══════════════════════════════════════════════════════════════════
export interface Report {
  id: ReportId;
  day: number; // 產生絕對日
  event: GameEvent; // 原始事件（單一真相；core 只存原始 event，不存 key/params，03 §3.4.3）。顯示 key/params 導出契約見 13 §3.7：UI 層 renderReport(report, state, playerClanId) 於渲染時導出（五輪裁決 A）
  read: boolean; // 已讀
}
// reports 陣列新→舊排列；超過 BAL.reportMaxKept（500，勘誤 E-31）時自尾端捨棄已讀舊報告。

// ═══════════════════════════════════════════════════════════════════
// 4.20 AiState（AI 狀態分支）（勘誤 E-60；型別語意與行為見 09）
// ═══════════════════════════════════════════════════════════════════
export interface AiState {
  personas: Record<AiPersonaId, AiPersona>; // persona 登錄表（持久化）；有效 persona = personas[clan 的 AiClanState.personaId]（勘誤 E-60；09 §4）
  clans: Record<ClanId, AiClanState>; // 以 clanId 為 key（AI 與玩家勢力皆持有）
  intentLog: AiIntent[]; // 環形緩衝決策紀錄（容量 BAL.aiIntentLogSize；transient，不序列化亦不入雜湊，剔除機制見 §3.4 第 6 點）
  deferredPhases: Array<{ clanId: ClanId; phase: CouncilPhase }>; // 本 tick 溢出而順延的評定階段
}

/** AI 性格參數。所有軸 0..100 整數（09 §3.2；02 §4.20）。 */
export interface AiPersona {
  aggression: number; // 侵攻性：開戰門檻與擴張積極度
  diplomacy: number; // 外交傾向：外交工作預算與求和/結盟意願
  development: number; // 內政傾向：資源分配偏向內政的程度
  loyalty: number; // 義理：守約傾向；低者傾向調略與背盟
  ambition: number; // 野心：從屬意願（反向）與擴張規模
}

export type CouncilPhase = 'threat' | 'military' | 'domestic' | 'diplomacy'; // 評定階段
export type AttackPlanStage = 'muster' | 'advance' | 'siege' | 'consolidate'; // 攻略計畫階段

/** 攻略計畫（大名 AI 與軍團 AI 共用；02 §4.20）。 */
export interface AttackPlan {
  id: string; // 'plan.{clanId去前綴}-{遞增序號}'（序號存於 AiClanState.nextPlanSeq）
  ownerCorpsId: CorpsId | null; // 發起者：null=大名評定；否則軍團
  targetCastleId: CastleId; // 目標敵城
  stagingCastleId: CastleId; // 集結城
  sourceCastleIds: CastleId[]; // 協同出兵城（含集結城），長度 ≤ BAL.diffAiCoopMaxCastles
  stage: AttackPlanStage;
  armyIds: ArmyId[]; // 本計畫指揮的部隊
  startedDay: number; // 建立絕對日
  stageEnteredDay: number; // 進入當前階段的絕對日（timeout 判定用）
  plannedTroops: number; // 集結目標總兵力（人）
}

/** 對單一敵勢力的威脅評估項（02 §4.20）。 */
export interface ThreatEntry {
  enemyClanId: ClanId;
  borderPowerEnemy: number; // 敵方在接壤地帶可投入戰力（估算兵力，人）
  borderPowerOurs: number; // 我方在接壤地帶的戰力
  relationFactor: number; // 關係係數：交戰 1.5 / 無協定 1.0 / 停戰 0.6 / 同盟或從屬 0.2
  threat: number; // 威脅分 = borderPowerEnemy / max(borderPowerOurs,1) × relationFactor
  threatenedCastleIds: CastleId[]; // 受該勢力威脅的我方城
}

/** 威脅評估快取（02 §4.20）。 */
export interface ThreatCache {
  computedDay: number; // 計算絕對日；超過 BAL.aiThreatCacheDays 或失效事件時重算
  entries: ThreatEntry[];
  totalThreat: number; // entries.threat 之總和
}

/** 單一勢力的 AI 狀態（玩家勢力亦持有一份供委任 AI/具申，但 pendingPhases 恆空；02 §4.20）。 */
export interface AiClanState {
  clanId: ClanId;
  personaId: AiPersonaId; // AI 性格參照（未解析），使用處解析為 state.ai.personas[personaId]（勘誤 E-60；09 §4）
  councilOffset: number; // 評定排程偏移 0..29（= fnv1a(clanId) % BAL.aiCouncilSpreadTicks）
  pendingPhases: CouncilPhase[]; // 本月尚未執行的評定階段（依 CouncilPhase 順序 pop）
  attackPlans: AttackPlan[]; // 進行中攻略計畫
  nextPlanSeq: number; // 攻略計畫序號產生器
  threatCache: ThreatCache | null;
  lastCouncilDay: number; // 最近一次完成評定的絕對日
}

/** AI 決策紀錄（debug 與測試用；transient，不序列化進存檔；02 §4.20）。 */
export interface AiIntent {
  day: number; // 決策絕對日
  clanId: ClanId;
  layer: 'council' | 'reactive' | 'corps' | 'steward' | 'castle' | 'proposal'; // 決策層
  kind: string; // 點分語意字串，如 'expand.select' / 'defense.hold'
  detail: Record<string, string | number | boolean>; // 決策相關實體與數值
  scores: { label: string; value: number }[] | null; // 分數分解（無則 null；02 不用 optional，勘誤 E-60）
  commands: Command[]; // 實際下達的 Command（空陣列 = 評估後不行動）
}
