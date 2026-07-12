// ScenarioData → 初始 GameState builder（M1-14 骨架 ＋ M2-8 資料側擴充）。
// 規格：plan/02-data-model.md §7（builder 驗收：建置後 validateState 零違規、reports=[]、
// nextSerials 全 1）／§5.5（pairKey 與預設外交列：稀疏 rows，缺列＝預設列，不需 materialize）／§5.6
// （曆法換算）；plan/01-architecture.md §3.3（core 公開 API 匯出名 `buildGameState`）；
// plan/18-roadmap.md M1-14（`buildGameState`：state 初始化）／M2-8（本檔擴充範圍：14-T4 補值規則＋
// 浪人程序生成＋`regions` 白名單載入，§8-D5）。
//
// 【M1 骨架】`buildGameState(input: ScenarioInput)` 只做「state 初始化」：陣列→Record 組裝＋rng 播種
// ＋AI/外交/朝廷/政策/事件等分支的預設骨架，輸入須已是 02 §4 完整合法實體（tests/fixtures/tiny.ts
// 沿用此形狀，不受 M2-8 擴充影響）。
//
// 【M2-8 擴充】新增「資料側」一層：`ScenarioBundleData`（14 zod 劇本，§4 精簡子集＋`.default()`
// 補值格式）→ `ScenarioInput`（02 §4 完整實體）之推導，具體職責：
//   1. `loadScenarioBundle`：zod 解析劇本原始 JSON（14-T4）。
//   2. `regions` 白名單載入（18 §8-D5）：只留白名單地方之國／城／郡；端點不在白名單節點集內的
//      街道邊剔除；勢力僅保留本城仍在白名單內者（未載入勢力連帶不建外交列，因其已不存在於
//      `state.clans`）。此模式僅供開發期子集建局，v1.0 出貨組態固定載入全部 9 地方（不傳
//      `regions` 即等同白名單＝全部）。
//   3. 14 §5.3 補值規則全表：`durability`／`facilities`／`buildQueue`（依 02 現行 E-39 佇列制，非 14
//      §5.3 原文所述已廢除之 `FacilitySlot[]`，見本檔 §8 決策）、`district.ownerClanId`、
//      `officer.status`／`hasComeOfAge`／`debutYear`／`debutClanId`／`debutCastleId`／`merit`／
//      `kinship`（14 資料僅給 `isKin` 布林，02 需要三態 `Kinship`，見本檔 §8 決策）／`loyalty`
//      （當主 100、其餘依 06 §3.6.1 忠誠目標值公式）／`scheduledDeath`（06 §3.9.1，`rng.event`
//      流）、`clan.colorIndex` 等、diplomacy pacts/wars/sentiments materialize。
//   4. `generateRonin`（14 §3.8）：`rng.misc` 流程序生成 `BAL.roninPoolSize` 名無名浪人，決定論。
//
// 規格衝突裁決回寫：plan/14-scenario-data.md §8（見 D17）。

import { createRngStream, initRng, type RngStream } from '../rng';
import { defaultDiplomacyRow, pairKey } from './serialize';
import { dayToCalendar, EPOCH_YEAR } from '../systems/time';
import { BAL } from '../balance';
import { RANK_VALUES, REGION_VALUES, type Difficulty, type Kinship, type Region } from './enums';
import type {
  AiClanState,
  AiPersona,
  Castle,
  Clan,
  ClanPolicyState,
  DiplomacyRow,
  District,
  GameState,
  Officer,
  Pact,
  Province,
  RoadEdge,
} from './gameState';
import type {
  AiPersonaId,
  CastleId,
  ClanId,
  ClanPairKey,
  DistrictId,
  FacilityTypeId,
  OfficerId,
  ProvinceId,
  RoadEdgeId,
  TraitId,
} from './ids';
import {
  zScenario,
  type CastleData,
  type ClanData,
  type DistrictData,
  type OfficerData,
  type PactInitData,
  type ProvinceData,
  type RoadEdgeData,
  type ScenarioBundleData,
  type SentimentEntryData,
  type WarEntryData,
} from '../../data/schemas';

/**
 * builder 輸入契約（M1 範圍；M2-8 由 `deriveScenarioInput` 從 14 zod 劇本推導出此形狀，§8-D4／§8-D5）。
 * 全部實體欄位必須已是 02 §4 完整合法值（builder 本身不補值、不驗證——建置後由呼叫端另跑
 * `validateState`，M1 骨架不強制內建，維持 core 分層單純）。
 */
export interface ScenarioInput {
  scenarioId: string; // → MetaState.scenarioId
  appVersion: string; // → MetaState.appVersion（建置版本字串；由呼叫端注入，builder 不硬編）
  seed: number; // → MetaState.seed，同時餵給 initRng()（uint32，02 §4.2）
  startDay: number; // 開局絕對日（02 §5.6 calendarToDay 產出）→ TimeState.day 與快取三欄之源
  playerClanId: ClanId;
  difficulty: Difficulty;
  clans: Clan[];
  officers: Officer[];
  castles: Castle[];
  districts: District[];
  provinces: Province[];
  roads: RoadEdge[];
  /** AI persona 登錄表（02 §4.20 AiState.personas；唯一真相，Clan 不持有 personaId，勘誤四輪 D-13）。 */
  personas: Record<AiPersonaId, AiPersona>;
  /** 各勢力採用之 personaId（14 §4.5 zClan.personaId 對應；builder 寫入 ai.clans[clanId].personaId）。 */
  clanPersonaIds: Record<ClanId, AiPersonaId>;
  /**
   * 稀疏外交列（M2-8 新增；02 §5.5：缺列＝預設列，不需 materialize）。省略＝`{}`
   * （M1 tiny 劇本與既有呼叫端不受影響——省略此欄與明式傳入 `{}` 等價）。
   */
  diplomacyRows?: Record<ClanPairKey, DiplomacyRow>;
}

/** JSON 深拷貝：core 純度（tsconfig.core.json 排除 DOM lib）不可用 `structuredClone`；
 * 02 §3.4 保證全樹為純 JSON 值，JSON 往返可安全深拷貝。用途：確保回傳的 GameState 與傳入的
 * `ScenarioInput`（常為跨測試共用的常數，如 tests/fixtures/tiny.ts）不共享任何物件參照——
 * 呼叫端可自由 mutate 建出的 state 而不污染共用 fixture 或其他次建置。 */
function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** 陣列（元素含 `id` 欄）→ `Record<id 型別, 元素>`；key 與 value.id 保證一致（INV-01 前提）。 */
function toRecord<K extends string, T extends { id: K }>(items: readonly T[]): Record<K, T> {
  const out = {} as Record<K, T>;
  for (const item of items) {
    out[item.id] = item;
  }
  return out;
}

/**
 * 由 `ScenarioInput` 建初始 `GameState`（02 §7 builder；01 §3.3 公開 API 匯出名 `buildGameState`）。
 * M1 骨架涵蓋：陣列組裝為 Record、`meta.nextSerials` 全 1、`reports=[]`、`rng` 由 `seed` 播種
 * （`initRng`，03 §3.5.2）、曆法三欄由 `startDay` 換算（02 §5.6）、`ai.clans` 逐勢力初始化並填入
 * `personaId`、`policies` 逐勢力建立空白 `ClanPolicyState`、外交/朝廷/事件採 02 §5.5／§4.12／§4.16
 * 定義的空白預設（稀疏 `diplomacy.rows`：缺列＝預設列，不 materialize；M2-8 起可經
 * `ScenarioInput.diplomacyRows` 傳入非預設列）。
 */
export function buildGameState(input: ScenarioInput): GameState {
  const scenario = cloneJson(input);
  const cal = dayToCalendar(scenario.startDay);

  const clans = toRecord<ClanId, Clan>(scenario.clans);
  const officers = toRecord<OfficerId, Officer>(scenario.officers);
  const castles = toRecord<CastleId, Castle>(scenario.castles);
  const districts = toRecord<DistrictId, District>(scenario.districts);
  const provinces = toRecord<ProvinceId, Province>(scenario.provinces);
  const roads = toRecord<RoadEdgeId, RoadEdge>(scenario.roads);

  const aiClans: Record<ClanId, AiClanState> = {};
  const policies: Record<ClanId, ClanPolicyState> = {};
  for (const clan of scenario.clans) {
    const personaId = scenario.clanPersonaIds[clan.id];
    if (personaId === undefined) {
      throw new Error(`buildGameState: clanPersonaIds 缺少勢力 ${clan.id} 的 personaId`);
    }
    aiClans[clan.id] = {
      clanId: clan.id,
      personaId,
      councilOffset: 0, // M1 骨架恆 0（fnv1a 錯開排程屬 M7-4 完整版，03 §8-D13；本欄僅需合法存在）
      pendingPhases: [],
      attackPlans: [],
      nextPlanSeq: 1,
      threatCache: null,
      lastCouncilDay: 0,
    };
    policies[clan.id] = { clanId: clan.id, active: [], cooldownUntil: {} };
  }

  return {
    meta: {
      saveVersion: 1,
      appVersion: scenario.appVersion,
      scenarioId: scenario.scenarioId,
      seed: scenario.seed,
      playerClanId: scenario.playerClanId,
      difficulty: scenario.difficulty,
      nextSerials: {
        army: 1,
        battle: 1,
        siege: 1,
        corps: 1,
        proposal: 1,
        report: 1,
        transport: 1,
        plot: 1,
      },
      gameOver: null,
      stateVersion: 0,
      lastAppliedCmdSeq: 0,
      debugMode: false,
      territoryChangedToday: false,
      deferredEvents: [],
    },
    time: { day: scenario.startDay, year: cal.year, month: cal.month, dayOfMonth: cal.dayOfMonth },
    rng: initRng(scenario.seed),
    clans,
    officers,
    castles,
    districts,
    provinces,
    roads,
    armies: {},
    fieldCombats: {},
    battles: {},
    sieges: {},
    corps: {},
    transports: {},
    diplomacy: {
      rows: scenario.diplomacyRows ?? {},
      missions: [],
      plots: [],
      pendingProposals: [],
    }, // 稀疏預設（02 §5.5）；M2-8 起可含 builder 由劇本 diplomacy 區塊 materialize 出的非預設列
    court: {
      courtFavor: {},
      shogunateFavor: {},
      shogunateExists: true,
      shogunClanId: null,
      patronClanId: null,
      mediationCooldownUntil: {},
    },
    policies,
    proposals: {},
    events: {
      fired: {},
      cooldownUntil: {},
      pendingChoiceEventId: null,
      flags: {},
      tenkabitoStreakMonths: 0,
      stats: { battlesFought: 0, battlesWon: 0, maxCastles: 0, maxKokudaka: 0 },
    },
    ai: { personas: scenario.personas, clans: aiClans, intentLog: [], deferredPhases: [] },
    reports: [],
  };
}

// ═══════════════════════════════════════════════════════════════════
// M2-8｜zod 劇本載入
// ═══════════════════════════════════════════════════════════════════

/** 由未知輸入（原始 JSON）zod 解析出 `ScenarioBundleData`（14-T4；14 §4 全部子 schema）。 */
export function loadScenarioBundle(raw: unknown): ScenarioBundleData {
  return zScenario.parse(raw);
}

// ═══════════════════════════════════════════════════════════════════
// M2-8｜regions 白名單載入（18 §8-D5）
// ═══════════════════════════════════════════════════════════════════

/** 白名單過濾後、仍為「14 資料層形狀」的劇本子集（供後續 §5.3 補值規則消費）。 */
interface FilteredScenario {
  provinces: ProvinceData[];
  castles: CastleData[];
  districts: DistrictData[];
  roads: RoadEdgeData[];
  clans: ClanData[];
  officers: OfficerData[];
  diplomacy: {
    pacts: PactInitData[];
    wars: WarEntryData[];
    sentiments: SentimentEntryData[];
  };
}

/**
 * `regions` 白名單載入（18 §8-D5）：
 * - 國／城依地方（`Province.region`）幾何過濾；郡依所轄城過濾。
 * - 勢力僅保留「本城仍在白名單地理範圍內」者——未載入勢力因此不出現在 `state.clans`，
 *   連帶其外交列不會被 materialize（§8-D5「未載入勢力不建外交列」）。
 * - 城再依「擁有者是否為已載入勢力」二次過濾（處理擁有者本城落於白名單外地方之孤兒城）。
 * - 街道邊：兩端點皆須在最終節點集合（城∪郡）內，否則剔除（§8-D5「端點不在白名單的邊剔除」）。
 * - 武將：依所屬 9 地方分檔（`bundle.officers[REGION_VALUES 索引]`）過濾檔案，
 *   再過濾掉 clanId 非 null 但所屬勢力未載入者、或駐在城未載入者（14 §3.1：武將寫入其所屬
 *   勢力本城地方之檔案／浪人寫入寄寓城地方之檔案——正常資料下此二次過濾為 no-op）。
 * - 外交 pacts/wars/sentiments：僅保留雙方皆為已載入勢力者。
 */
function filterScenarioByRegions(
  bundle: ScenarioBundleData,
  regions: readonly Region[],
): FilteredScenario {
  const regionSet = new Set(regions);

  const provinces = bundle.provinces.filter((p) => regionSet.has(p.region));
  const provinceIds = new Set(provinces.map((p) => p.id));

  const castlesGeo = bundle.castles.filter((c) => provinceIds.has(c.provinceId));
  const homeCastleIdsGeo = new Set(castlesGeo.map((c) => c.id));

  const clans = bundle.clans.filter((c) => homeCastleIdsGeo.has(c.homeCastleId));
  const clanIds = new Set(clans.map((c) => c.id));

  const castles = castlesGeo.filter((c) => clanIds.has(c.ownerClanId));
  const castleIds = new Set(castles.map((c) => c.id));

  const districts = bundle.districts.filter((d) => castleIds.has(d.castleId));
  const districtIds = new Set(districts.map((d) => d.id));

  const nodeIds = new Set<string>([...castleIds, ...districtIds]);
  const roads = bundle.roads.filter((r) => nodeIds.has(r.a) && nodeIds.has(r.b));

  const officers = REGION_VALUES.flatMap((region, idx) =>
    regionSet.has(region) ? (bundle.officers[idx] ?? []) : [],
  ).filter(
    (o) => (o.clanId === null || clanIds.has(o.clanId)) && castleIds.has(o.locationCastleId),
  );

  const diplomacy = {
    pacts: bundle.diplomacy.pacts.filter((p) => clanIds.has(p.a) && clanIds.has(p.b)),
    wars: bundle.diplomacy.wars.filter((w) => clanIds.has(w.a) && clanIds.has(w.b)),
    sentiments: bundle.diplomacy.sentiments.filter((s) => clanIds.has(s.a) && clanIds.has(s.b)),
  };

  return { provinces, castles, districts, roads, clans, officers, diplomacy };
}

// ═══════════════════════════════════════════════════════════════════
// M2-8｜14 §5.3 補值規則：小工具
// ═══════════════════════════════════════════════════════════════════

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** 06 §3.6.1 `expectedRankIndex(abilityScore)`：門檻表由高至低比對。 */
function expectedRankIndexOf(abilityScore: number): number {
  const thresholds = BAL.expectedRankAbilityThresholds;
  for (let i = thresholds.length - 1; i >= 0; i -= 1) {
    if (abilityScore >= (thresholds[i] as number)) return i + 1;
  }
  return 0;
}

/** 06 §3.6.1 `kinshipBonus(o)`：一門 30／譜代 10／外樣 0。 */
function kinshipBonusOf(k: Kinship): number {
  if (k === 'kin') return BAL.loyaltyKinBonus;
  if (k === 'fudai') return BAL.loyaltyFudaiBonus;
  return 0;
}

const TRAIT_CHUSHIN = 'trait.chushin' as TraitId;
const TRAIT_YASHIN = 'trait.yashin' as TraitId;
const TRAIT_JINBO = 'trait.jinbo' as TraitId;
const TRAIT_HITOTARASHI = 'trait.hitotarashi' as TraitId;

/**
 * 開局死亡排程（06 §3.9.1）：本檔僅實作「資料含卒年」分支——14 zod `zOfficer.deathYear`
 * 為必填欄位、`generateRonin` 亦自行生成卒年（§3.8），故呼叫本函式時 `deathYear` 恆為已知值，
 * 06 §3.9.1 之 `else`（無卒年時以 `BAL.defaultDeathAge±defaultDeathAgeSpread` 生成）分支在現行
 * 資料層契約下不可達，故未收錄 `BAL.defaultDeathAge`／`defaultDeathAgeSpread`（待該分支真正
 * 可達時──即 14 允許省略 `deathYear`──一併補上，避免孤兒常數）。
 */
function computeScheduledDeath(params: {
  rngEvent: RngStream;
  deathYear: number;
  scenarioStartYear: number;
}): { year: number; month: number } {
  const year0 = params.deathYear + params.rngEvent.nextInt(-2, 2);
  const month = params.rngEvent.nextInt(1, 12);
  const year = Math.max(year0, params.scenarioStartYear + 1);
  return { year, month };
}

/** 加權隨機（供浪人「依城轄郡商業總和」加權抽城，14 §3.8）；權重總和 ≤0 時退化為均勻抽樣。 */
function weightedPick<T>(rng: RngStream, items: readonly T[], weightOf: (item: T) => number): T {
  const weights = items.map(weightOf);
  const total = weights.reduce((sum, w) => sum + w, 0);
  if (total <= 0) {
    return items[rng.nextInt(0, items.length - 1)] as T;
  }
  let roll = rng.next() * total;
  for (let i = 0; i < items.length; i += 1) {
    roll -= weights[i] as number;
    if (roll < 0) return items[i] as T;
  }
  return items[items.length - 1] as T; // 浮點捨入邊界防護
}

// ═══════════════════════════════════════════════════════════════════
// M2-8｜浪人程序生成（14 §3.8）
// ═══════════════════════════════════════════════════════════════════

/** 24 姓（繁體字形；14 §3.8 逐字轉錄，固定順序＝抽樣索引）。 */
const RONIN_SURNAMES = [
  '佐藤',
  '鈴木',
  '高橋',
  '田中',
  '伊藤',
  '渡邊',
  '山本',
  '中村',
  '小林',
  '加藤',
  '吉田',
  '山田',
  '佐佐木',
  '山口',
  '松本',
  '井上',
  '木村',
  '林',
  '清水',
  '山崎',
  '森',
  '池田',
  '橋本',
  '石川',
] as const;

/** 16 名（繁體字形；14 §3.8 逐字轉錄，固定順序＝抽樣索引）。 */
const RONIN_GIVENS = [
  '太郎',
  '次郎',
  '三郎',
  '四郎',
  '五郎',
  '六郎',
  '七郎',
  '平八',
  '勘助',
  '新之丞',
  '忠介',
  '清兵衛',
  '彌太郎',
  '權之助',
  '源吾',
  '久藏',
] as const;

const RONIN_STAT_DIMS = ['ldr', 'val', 'int', 'pol'] as const;

/**
 * 開局程序生成 `count` 名無名浪人（14 §3.8；決定論：`rng.misc`／`rng.event` 兩流固定消費順序，
 * 同 seed 同輸入資料必產生完全相同結果）。
 *
 * `castles` 須為已完成 §5.3 補值、含 `districtIds` 的最終城陣列（供「城轄郡 commerce 總和」
 * 加權抽城）；`districtCommerceOf` 供查詢個別郡商業值。
 */
function generateRonin(params: {
  count: number;
  rngMisc: RngStream;
  rngEvent: RngStream;
  castles: readonly Castle[];
  districtCommerceOf: (districtId: DistrictId) => number;
  commonTraitIds: readonly TraitId[];
  scenarioStartYear: number;
}): Officer[] {
  const {
    count,
    rngMisc,
    rngEvent,
    castles,
    districtCommerceOf,
    commonTraitIds,
    scenarioStartYear,
  } = params;
  if (castles.length === 0 || count <= 0) return [];

  const weightOf = (c: Castle): number =>
    c.districtIds.reduce((sum, id) => sum + districtCommerceOf(id), 0);

  const usedNames = new Set<string>();
  const result: Officer[] = [];

  for (let i = 1; i <= count; i += 1) {
    const id = `off.ronin-${String(i).padStart(3, '0')}` as OfficerId;

    const surname = rngMisc.pick(RONIN_SURNAMES);
    let given: string = rngMisc.pick(RONIN_GIVENS);
    let name = surname + given;
    while (usedNames.has(name)) {
      given += '二'; // 14 §3.8：重名時 given 後綴「二」（重複碰撞時持續疊加，維持唯一）
      name = surname + given;
    }
    usedNames.add(name);

    const primary = rngMisc.pick(RONIN_STAT_DIMS);
    const stats: Record<(typeof RONIN_STAT_DIMS)[number], number> = {
      ldr: 0,
      val: 0,
      int: 0,
      pol: 0,
    };
    for (const dim of RONIN_STAT_DIMS) {
      stats[dim] = dim === primary ? rngMisc.nextInt(40, 84) : rngMisc.nextInt(20, 59);
    }

    const traits: TraitId[] =
      commonTraitIds.length > 0 && rngMisc.chance(BAL.roninTraitChance)
        ? [rngMisc.pick(commonTraitIds)]
        : [];

    const birthYear = EPOCH_YEAR - (18 + rngMisc.nextInt(0, 21)); // 1521..1542（14 §3.8）
    const deathYear = birthYear + 40 + rngMisc.nextInt(0, 24);
    const locationCastleId = weightedPick(rngMisc, castles, weightOf).id;

    result.push({
      id,
      name,
      clanId: null,
      status: 'ronin',
      ldr: stats.ldr,
      val: stats.val,
      int: stats.int,
      pol: stats.pol,
      statExp: { ldr: 0, val: 0, int: 0, pol: 0 },
      statGrowth: { ldr: 0, val: 0, int: 0, pol: 0 },
      traits,
      rank: 'kumigashira',
      merit: 0,
      loyalty: BAL.loyaltyBase, // 浪人無勢力/身分脈絡可代入 06 §3.6.1 公式，取基準值（14 §8 決策）
      kinship: 'tozama',
      spouseId: null,
      birthYear,
      deathYear,
      hasComeOfAge: scenarioStartYear - birthYear >= BAL.comingOfAgeAge,
      debutYear: birthYear + BAL.comingOfAgeAge,
      debutClanId: null, // 淪浪人：debut 即直接為浪人
      debutCastleId: locationCastleId,
      locationCastleId,
      armyId: null,
      capturedByClanId: null,
      scheduledDeath: computeScheduledDeath({ rngEvent, deathYear, scenarioStartYear }),
      captiveRetryOn: null,
      recruitRetryOn: null,
      rewardGiftsThisYear: 0,
      stalledPromotionMonths: 0,
    });
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════════
// M2-8｜由 14 zod 劇本推導 `ScenarioInput`（§5.3 補值規則全表）
// ═══════════════════════════════════════════════════════════════════

export interface BuildFromScenarioOptions {
  appVersion: string;
  seed: number;
  playerClanId: ClanId;
  difficulty: Difficulty;
  /** 開局絕對日（02 §5.6）；省略＝0（＝`EPOCH_YEAR` 年 1/1）。 */
  startDay?: number;
  /**
   * `regions` 白名單（18 §8-D5）；省略＝`REGION_VALUES`（全部 9 地方＝不過濾，v1.0 出貨組態）。
   * 開發期可傳子集（如 `['tokai','kinki']`）建 34 城子集局。
   */
  regions?: readonly Region[];
}

function buildDiplomacyRows(
  diplomacy: FilteredScenario['diplomacy'],
): Record<ClanPairKey, DiplomacyRow> {
  const rows = new Map<ClanPairKey, DiplomacyRow>();
  const rowOf = (a: ClanId, b: ClanId): DiplomacyRow => {
    const key = pairKey(a, b);
    let row = rows.get(key);
    if (!row) {
      row = defaultDiplomacyRow(a, b);
      rows.set(key, row);
    }
    return row;
  };

  for (const w of diplomacy.wars) {
    rowOf(w.a as ClanId, w.b as ClanId).lastHostileDay = 0; // 08 §3.1：開局交戰＝lastHostileDay 0
  }
  for (const s of diplomacy.sentiments) {
    const a = s.a as ClanId;
    const b = s.b as ClanId;
    const row = rowOf(a, b);
    if (row.a === a) {
      row.sentimentAtoB = s.aToB;
      row.sentimentBtoA = s.bToA;
    } else {
      row.sentimentAtoB = s.bToA;
      row.sentimentBtoA = s.aToB;
    }
  }
  for (const p of diplomacy.pacts) {
    const row = rowOf(p.a as ClanId, p.b as ClanId);
    const pact: Pact = {
      kind: p.kind,
      startDay: 0,
      endDay: p.months !== null ? p.months * 30 : null,
      vassalClanId: p.vassalClanId as ClanId | null,
    };
    row.pacts.push(pact);
  }

  return Object.fromEntries(rows);
}

/**
 * 由 14 zod 劇本＋建局選項推導出 `ScenarioInput`（純函式；不觸碰 `validateState`——呼叫端另跑）。
 * 涵蓋 14 §5.3 全表：castle durability／facilities／buildQueue、district.ownerClanId、
 * officer 全部衍生欄位（status／hasComeOfAge／debutYear／debutClanId／debutCastleId／merit／
 * kinship／loyalty／scheduledDeath）、clan 衍生欄位（alive／destroyedDay／taimei）、
 * diplomacy pacts/wars/sentiments materialize、`generateRonin`、`regions` 白名單過濾（§8-D5）。
 */
export function deriveScenarioInput(
  bundle: ScenarioBundleData,
  opts: BuildFromScenarioOptions,
): ScenarioInput {
  const regions = opts.regions ?? REGION_VALUES;
  const startDay = opts.startDay ?? 0;
  const scenarioStartYear = dayToCalendar(startDay).year;
  const filtered = filterScenarioByRegions(bundle, regions);

  // ── provinces：02 Province 欄位與 14 zProvince 逐一對應，無需補值 ──
  const provinces: Province[] = filtered.provinces.map((p) => ({
    id: p.id as ProvinceId,
    name: p.name,
    region: p.region,
    labelPos: p.labelPos,
  }));

  // ── roads：丟棄資料層純顯示欄位 name/waypoints（02 RoadEdge 無此二欄，勘誤 E-11／E-36） ──
  const roads: RoadEdge[] = filtered.roads.map((r) => ({
    id: r.id as RoadEdgeId,
    a: r.a,
    b: r.b,
    type: r.type,
    grade: r.grade,
    baseDays: r.baseDays,
  }));

  // ── clans：alive/destroyedDay/taimei 為開局固定預設（14 §5.3 未提及但屬 02 §4.3 必填欄位） ──
  const clans: Clan[] = filtered.clans.map((c) => ({
    id: c.id as ClanId,
    name: c.name,
    leaderId: c.leaderId as OfficerId,
    homeCastleId: c.homeCastleId as CastleId,
    gold: c.gold,
    prestige: c.prestige,
    courtRank: c.courtRank,
    shogunateTitle: c.shogunateTitle,
    colorIndex: c.colorIndex,
    alive: true,
    destroyedDay: null,
    taimei: { activeTaimeiId: null, activeUntilDay: 0, cooldownUntilDay: 0 },
  }));

  // ── castles：durability 依 maxDurability ?? tier 基準值（14 §5.3）；facilities 依 02 現行
  //    佇列制直接沿用資料值、buildQueue 開局空（見本檔 §8 決策：14 §5.3 原文之 FacilitySlot[]
  //    轉換敘述已被 02 E-39 取代）；corpsId/betrayal* 開局固定預設；districtIds 由下方反填 ──
  const castles: Castle[] = filtered.castles.map((c) => {
    const durability =
      c.maxDurability ?? (c.tier === 'main' ? BAL.durabilityMain : BAL.durabilityBranch);
    return {
      id: c.id as CastleId,
      name: c.name,
      tier: c.tier,
      provinceId: c.provinceId as ProvinceId,
      coastal: c.coastal,
      pos: c.pos,
      ownerClanId: c.ownerClanId as ClanId,
      lordId: c.lordId as OfficerId | null,
      directControl: c.directControl,
      corpsId: null,
      durability,
      maxDurability: durability,
      soldiers: c.soldiers,
      food: c.food,
      foodFrac: 0,
      riceTradedThisMonth: 0,
      morale: c.morale,
      conscriptPolicy: 'mid', // 14 未定義開局預設值（無資料欄位）；取方針中檔為開局中性值（14 §8 決策）
      facilities: c.facilities.map((f) => f as FacilityTypeId),
      buildQueue: [],
      betrayalReadyClanId: null,
      betrayalReadyUntilDay: 0,
      districtIds: [],
    };
  });
  const castleById = new Map(castles.map((c) => [c.id, c]));

  // ── districts：ownerClanId = 所轄城 ownerClanId（§8-D7）；subjugation/uprising 開局空 ──
  const districts: District[] = filtered.districts.map((d) => {
    const castleId = d.castleId as CastleId;
    const castle = castleById.get(castleId);
    if (!castle) {
      throw new Error(
        `deriveScenarioInput: 郡 ${d.id} 引用不存在（或已被 regions 過濾）的城 ${d.castleId}`,
      );
    }
    return {
      id: d.id as DistrictId,
      name: d.name,
      castleId,
      isPort: d.isPort,
      pos: d.pos,
      ownerClanId: castle.ownerClanId,
      stewardId: d.stewardId as OfficerId | null,
      kokudaka: d.kokudaka,
      kokudakaCap: d.kokudakaCap,
      commerce: d.commerce,
      commerceCap: d.commerceCap,
      population: d.population,
      populationCap: d.populationCap,
      publicOrder: d.publicOrder,
      developFocus: d.developFocus,
      subjugation: null,
      uprising: null,
    };
  });
  // 反填 castle.districtIds（依 districts 固定輸入順序 push，維持決定論）。
  for (const d of districts) {
    castleById.get(d.castleId)?.districtIds.push(d.id);
  }
  const commerceByDistrictId = new Map(districts.map((d) => [d.id, d.commerce]));
  const districtCommerceOf = (districtId: DistrictId): number =>
    commerceByDistrictId.get(districtId) ?? 0;

  // ── rng：M2-8 起 builder 需要 rng.event（scheduledDeath）／rng.misc（generateRonin）兩流，
  //    以 opts.seed 直接播種（與最終 buildGameState 之 initRng(seed) 完全一致，因兩者播種輸入
  //    相同——決定論：同 seed 兩次呼叫 deriveScenarioInput 得到位元相同的官員序列與 ronin）。 ──
  const rngState = initRng(opts.seed);
  const rngEvent = createRngStream(rngState, 'event');
  const rngMisc = createRngStream(rngState, 'misc');

  // ── 具名武將：§5.3 全部衍生欄位 ──
  const namedOfficers: Officer[] = filtered.officers.map((data) => {
    const clanId = data.clanId as ClanId | null;
    const status = clanId !== null ? ('serving' as const) : ('ronin' as const);
    const debutClanId: ClanId | null =
      'debutClanId' in data ? ((data.debutClanId as ClanId | null) ?? null) : clanId;
    const locationCastleId = data.locationCastleId as CastleId;
    return {
      id: data.id as OfficerId,
      name: data.name,
      clanId,
      status,
      ldr: data.ldr,
      val: data.val,
      int: data.int,
      pol: data.pol,
      statExp: { ldr: 0, val: 0, int: 0, pol: 0 },
      statGrowth: { ldr: 0, val: 0, int: 0, pol: 0 },
      traits: data.traits.map((t) => t as TraitId),
      rank: data.rank,
      merit: 0,
      loyalty: 0, // 佔位；serving 由第二階段依 06 §3.6.1 回填、當主回填 100（INV-08）
      kinship: data.isKin ? 'kin' : 'tozama', // 14 資料僅 isKin 布林（見本檔 §8 決策）
      spouseId: null,
      birthYear: data.birthYear,
      deathYear: data.deathYear,
      hasComeOfAge: scenarioStartYear - data.birthYear >= BAL.comingOfAgeAge,
      debutYear: data.debutYear ?? data.birthYear + BAL.comingOfAgeAge,
      debutClanId,
      debutCastleId: (data.debutCastleId as CastleId | undefined) ?? locationCastleId,
      locationCastleId,
      armyId: null,
      capturedByClanId: null,
      scheduledDeath: computeScheduledDeath({
        rngEvent,
        deathYear: data.deathYear,
        scenarioStartYear,
      }),
      captiveRetryOn: null,
      recruitRetryOn: null,
      rewardGiftsThisYear: 0,
      stalledPromotionMonths: 0,
    };
  });

  // ── 浪人程序生成（14 §3.8）──
  const commonTraitIds = bundle.catalogs.traits
    .filter((t) => t.rarity === 'common')
    .map((t) => t.id as TraitId);
  const ronin = generateRonin({
    count: BAL.roninPoolSize,
    rngMisc,
    rngEvent,
    castles,
    districtCommerceOf,
    commonTraitIds,
    scenarioStartYear,
  });

  const officers = [...namedOfficers, ...ronin];

  // ── 忠誠：當主固定 100（INV-08）；其餘 serving 依 06 §3.6.1 忠誠目標值公式初始化 ──
  applyInitialLoyalty(officers, clans, districts);

  // ── clanPersonaIds／personas：personaId 隨 clan 資料一併給出，personas 型錄不受 regions 過濾
  //    （小型全域型錄，保留全量不影響任何不變量；未使用之 persona 不產生任何 state 副作用）──
  const clanPersonaIds: Record<ClanId, AiPersonaId> = {};
  for (const c of clans) {
    const src = filtered.clans.find((d) => d.id === c.id);
    if (src) clanPersonaIds[c.id] = src.personaId as AiPersonaId;
  }
  const personas: Record<AiPersonaId, AiPersona> = {};
  for (const p of bundle.catalogs.personas) {
    personas[p.id as AiPersonaId] = {
      aggression: p.aggression,
      diplomacy: p.diplomacy,
      development: p.development,
      loyalty: p.loyalty,
      ambition: p.ambition,
    };
  }

  const diplomacyRows = buildDiplomacyRows(filtered.diplomacy);

  return {
    scenarioId: bundle.id,
    appVersion: opts.appVersion,
    seed: opts.seed,
    startDay,
    playerClanId: opts.playerClanId,
    difficulty: opts.difficulty,
    clans,
    officers,
    castles,
    districts,
    provinces,
    roads,
    personas,
    clanPersonaIds,
    diplomacyRows,
  };
}

/**
 * 06 §3.6.1 忠誠目標值公式，僅開局初始化用（省略「升格延宕懲罰」項——開局 merit=0、
 * `stalledPromotionMonths=0` 使該項恆為 0，見 balance.ts 註記）；就地回填 `officers` 之 `loyalty`。
 * 當主（`clan.leaderId`）固定 100（INV-08）；ronin 已在生成時給值，本函式略過（`status!=='serving'`）。
 */
function applyInitialLoyalty(
  officers: Officer[],
  clans: readonly Clan[],
  districts: readonly District[],
): void {
  const clanById = new Map(clans.map((c) => [c.id, c]));
  const leaderIdSet = new Set(clans.map((c) => c.leaderId));
  const officerById = new Map(officers.map((o) => [o.id, o]));

  const fiefCount = new Map<OfficerId, number>();
  for (const d of districts) {
    if (d.stewardId !== null) {
      fiefCount.set(d.stewardId, (fiefCount.get(d.stewardId) ?? 0) + 1);
    }
  }

  // 同城同勢力分組（僅 serving 需要，用於 trait.jinbo／trait.hitotarashi 忠誠光環，06 §3.3）。
  const groupKey = (o: Officer): string => `${o.locationCastleId ?? ''}|${o.clanId ?? ''}`;
  const groups = new Map<string, Officer[]>();
  for (const o of officers) {
    if (o.status !== 'serving') continue;
    const key = groupKey(o);
    const list = groups.get(key) ?? [];
    list.push(o);
    groups.set(key, list);
  }

  for (const o of officers) {
    if (o.status !== 'serving') continue;
    if (leaderIdSet.has(o.id)) {
      o.loyalty = 100; // INV-08：當主恆 100
      continue;
    }
    const clan = o.clanId !== null ? clanById.get(o.clanId) : undefined;
    if (!clan) continue; // 不應發生：serving 必屬存在的勢力
    const leader = officerById.get(clan.leaderId);
    const leaderPol = leader?.pol ?? 0;

    const abilityScore = Math.max(o.ldr, o.val, o.int, o.pol);
    const rankIndex = RANK_VALUES.indexOf(o.rank);
    const treatment = clamp(
      (rankIndex - expectedRankIndexOf(abilityScore)) * BAL.loyaltyRankGapWeight,
      -BAL.loyaltyTreatmentClampAbs,
      BAL.loyaltyTreatmentClampAbs,
    );

    let traitAdj = 0;
    if (o.traits.includes(TRAIT_CHUSHIN)) traitAdj += BAL.traitChushin;
    if (o.traits.includes(TRAIT_YASHIN)) traitAdj -= BAL.traitYashinLoyalty;
    const mates = groups.get(groupKey(o)) ?? [];
    for (const mate of mates) {
      if (mate.id === o.id) continue;
      if (mate.traits.includes(TRAIT_JINBO)) traitAdj += BAL.traitJinbo;
      if (mate.traits.includes(TRAIT_HITOTARASHI)) traitAdj += BAL.traitHitotarashiLoyalty;
    }

    const hasFief = (fiefCount.get(o.id) ?? 0) > 0;
    const raw =
      BAL.loyaltyBase +
      treatment +
      (hasFief ? BAL.loyaltyFiefBonus : 0) +
      kinshipBonusOf(o.kinship) +
      Math.floor(leaderPol / BAL.loyaltyLeaderPolDivisor) +
      Math.floor(clan.prestige / BAL.loyaltyPrestigeDivisor) +
      traitAdj;
    o.loyalty = clamp(raw, 0, 100);
  }
}

/**
 * 便利函式：`deriveScenarioInput` ＋ `buildGameState` 一次到位（M2-8；01 §3.3、18 M2-8 驗收：
 * 子集建局後 `validateState` 應零違規——呼叫端仍須自行執行 `validateState` 斷言，本函式不內建）。
 */
export function buildGameStateFromScenario(
  bundle: ScenarioBundleData,
  opts: BuildFromScenarioOptions,
): GameState {
  return buildGameState(deriveScenarioInput(bundle, opts));
}
