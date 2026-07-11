// tiny 測試劇本（M1-13；TS 常數，不經 zod——18-roadmap.md §8-D4：M2 前單元測試與 determinism 用；
// mini fixture（17 §3.3.1，zod 驗證版）就緒後，tiny 僅保留給最小單元測試，golden 一律用 mini/s1560）。
// 規格：plan/18-roadmap.md M1-13（2 勢力／3 城／6 郡／6 武將）、17 §3.3.1（對稱設計精神：
// 兩勢力鏡像同值、街道連通、直轄郡）。
//
// 形狀：2 勢力（clan.alpha 玩家／clan.beta AI）；3 城——castle.a1（alpha 本城）、
// castle.a2（alpha 支城）、castle.b1（beta 本城）；6 郡——每城轄 2 郡，全部直轄
// （stewardId=null，同 17 §3.3.1「全部直轄」）；6 武將——每勢力 3 名（當主／城主格／一般武將）；
// 街道成一棵生成樹（9 節點、8 邊）確保 INV-11 全圖連通；開局 1560 年 4 月 1 日。

import { buildGameState, type ScenarioInput } from '../../src/core/state/builder';
import type {
  Castle,
  Clan,
  District,
  Officer,
  Province,
  RoadEdge,
} from '../../src/core/state/gameState';
import type {
  AiPersonaId,
  CastleId,
  ClanId,
  DistrictId,
  MapNodeId,
  OfficerId,
  ProvinceId,
  RoadEdgeId,
} from '../../src/core/state/ids';
import { calendarToDay } from '../../src/core/systems/time';

// ── ID 常數（供測試直接引用） ──
export const CLAN_ALPHA = 'clan.alpha' as ClanId;
export const CLAN_BETA = 'clan.beta' as ClanId;

export const CASTLE_A1 = 'castle.a1' as CastleId; // alpha 本城
export const CASTLE_A2 = 'castle.a2' as CastleId; // alpha 支城
export const CASTLE_B1 = 'castle.b1' as CastleId; // beta 本城

export const DIST_A1X = 'dist.a1x' as DistrictId;
export const DIST_A1Y = 'dist.a1y' as DistrictId;
export const DIST_A2X = 'dist.a2x' as DistrictId;
export const DIST_A2Y = 'dist.a2y' as DistrictId;
export const DIST_B1X = 'dist.b1x' as DistrictId;
export const DIST_B1Y = 'dist.b1y' as DistrictId;

export const PROV_OWARI = 'prov.owari' as ProvinceId; // castle.a1／a2 所屬
export const PROV_SURUGA = 'prov.suruga' as ProvinceId; // castle.b1 所屬

export const OFF_ALPHA_LORD = 'off.alpha-lord' as OfficerId; // alpha 當主／castle.a1 城主
export const OFF_ALPHA_TAISHO = 'off.alpha-taisho' as OfficerId; // castle.a2 城主
export const OFF_ALPHA_BUSHO = 'off.alpha-busho' as OfficerId; // 一般武將（無役職）
export const OFF_BETA_LORD = 'off.beta-lord' as OfficerId; // beta 當主／castle.b1 城主
export const OFF_BETA_TAISHO = 'off.beta-taisho' as OfficerId; // 一般武將（無役職）
export const OFF_BETA_BUSHO = 'off.beta-busho' as OfficerId; // 一般武將（無役職）

export const PERSONA_DEFAULT = 'persona.default' as AiPersonaId;

/** 開局絕對日：1560 年 4 月 1 日（02 §5.6 calendarToDay）。 */
export const TINY_START_DAY = calendarToDay(1560, 4, 1);
/** 預設種子（與 tests/fixtures/rng-mulberry32-seed42.json 一致，便於交叉核對）。 */
export const TINY_SEED = 42;

const clans: Clan[] = [
  {
    id: CLAN_ALPHA,
    name: '甲家',
    leaderId: OFF_ALPHA_LORD,
    homeCastleId: CASTLE_A1,
    gold: 1000,
    prestige: 100,
    courtRank: 'none',
    shogunateTitle: 'none',
    colorIndex: 0,
    alive: true,
    destroyedDay: null,
    taimei: { activeTaimeiId: null, activeUntilDay: 0, cooldownUntilDay: 0 },
  },
  {
    id: CLAN_BETA,
    name: '乙家',
    leaderId: OFF_BETA_LORD,
    homeCastleId: CASTLE_B1,
    gold: 1000,
    prestige: 100,
    courtRank: 'none',
    shogunateTitle: 'none',
    colorIndex: 1,
    alive: true,
    destroyedDay: null,
    taimei: { activeTaimeiId: null, activeUntilDay: 0, cooldownUntilDay: 0 },
  },
];

function makeOfficer(params: {
  id: OfficerId;
  name: string;
  clanId: ClanId;
  ldr: number;
  val: number;
  int: number;
  pol: number;
  rank: Officer['rank'];
  merit: number;
  loyalty: number;
  kinship: Officer['kinship'];
  birthYear: number;
  deathYear: number;
  locationCastleId: CastleId;
}): Officer {
  return {
    id: params.id,
    name: params.name,
    clanId: params.clanId,
    status: 'serving',
    ldr: params.ldr,
    val: params.val,
    int: params.int,
    pol: params.pol,
    statExp: { ldr: 0, val: 0, int: 0, pol: 0 },
    statGrowth: { ldr: 0, val: 0, int: 0, pol: 0 },
    traits: [],
    rank: params.rank,
    merit: params.merit,
    loyalty: params.loyalty,
    kinship: params.kinship,
    spouseId: null,
    birthYear: params.birthYear,
    deathYear: params.deathYear,
    hasComeOfAge: true,
    debutYear: params.birthYear + 15,
    debutClanId: params.clanId,
    debutCastleId: params.locationCastleId,
    locationCastleId: params.locationCastleId,
    armyId: null,
    capturedByClanId: null,
    scheduledDeath: { year: params.deathYear, month: 1 },
    captiveRetryOn: null,
    recruitRetryOn: null,
    rewardGiftsThisYear: 0,
    stalledPromotionMonths: 0,
  };
}

const officers: Officer[] = [
  makeOfficer({
    id: OFF_ALPHA_LORD,
    name: '甲家當主',
    clanId: CLAN_ALPHA,
    ldr: 80,
    val: 70,
    int: 75,
    pol: 85,
    rank: 'shukuro',
    merit: 1000,
    loyalty: 100,
    kinship: 'kin',
    birthYear: 1520,
    deathYear: 1590,
    locationCastleId: CASTLE_A1,
  }),
  makeOfficer({
    id: OFF_ALPHA_TAISHO,
    name: '甲家重臣',
    clanId: CLAN_ALPHA,
    ldr: 70,
    val: 65,
    int: 60,
    pol: 55,
    rank: 'samurai-taisho',
    merit: 500,
    loyalty: 80,
    kinship: 'fudai',
    birthYear: 1530,
    deathYear: 1595,
    locationCastleId: CASTLE_A2,
  }),
  makeOfficer({
    id: OFF_ALPHA_BUSHO,
    name: '甲家武士',
    clanId: CLAN_ALPHA,
    ldr: 55,
    val: 60,
    int: 65,
    pol: 50,
    rank: 'busho',
    merit: 200,
    loyalty: 70,
    kinship: 'tozama',
    birthYear: 1535,
    deathYear: 1600,
    locationCastleId: CASTLE_A1,
  }),
  makeOfficer({
    id: OFF_BETA_LORD,
    name: '乙家當主',
    clanId: CLAN_BETA,
    ldr: 80,
    val: 70,
    int: 75,
    pol: 85,
    rank: 'shukuro',
    merit: 1000,
    loyalty: 100,
    kinship: 'kin',
    birthYear: 1518,
    deathYear: 1588,
    locationCastleId: CASTLE_B1,
  }),
  makeOfficer({
    id: OFF_BETA_TAISHO,
    name: '乙家重臣',
    clanId: CLAN_BETA,
    ldr: 70,
    val: 65,
    int: 60,
    pol: 55,
    rank: 'samurai-taisho',
    merit: 500,
    loyalty: 80,
    kinship: 'fudai',
    birthYear: 1528,
    deathYear: 1593,
    locationCastleId: CASTLE_B1,
  }),
  makeOfficer({
    id: OFF_BETA_BUSHO,
    name: '乙家武士',
    clanId: CLAN_BETA,
    ldr: 55,
    val: 60,
    int: 65,
    pol: 50,
    rank: 'busho',
    merit: 200,
    loyalty: 70,
    kinship: 'tozama',
    birthYear: 1533,
    deathYear: 1598,
    locationCastleId: CASTLE_B1,
  }),
];

function makeCastle(params: {
  id: CastleId;
  name: string;
  tier: Castle['tier'];
  provinceId: ProvinceId;
  pos: { x: number; y: number };
  ownerClanId: ClanId;
  lordId: OfficerId | null;
  durability: number;
  soldiers: number;
  food: number;
  districtIds: DistrictId[];
}): Castle {
  return {
    id: params.id,
    name: params.name,
    tier: params.tier,
    provinceId: params.provinceId,
    coastal: false,
    pos: params.pos,
    ownerClanId: params.ownerClanId,
    lordId: params.lordId,
    directControl: true,
    corpsId: null,
    durability: params.durability,
    maxDurability: params.durability,
    soldiers: params.soldiers,
    food: params.food,
    foodFrac: 0,
    riceTradedThisMonth: 0,
    morale: 80,
    conscriptPolicy: 'mid',
    facilities: [],
    buildQueue: [],
    betrayalReadyClanId: null,
    betrayalReadyUntilDay: 0,
    districtIds: params.districtIds,
  };
}

const castles: Castle[] = [
  makeCastle({
    id: CASTLE_A1,
    name: '甲本城',
    tier: 'main',
    provinceId: PROV_OWARI,
    pos: { x: 1000, y: 1000 },
    ownerClanId: CLAN_ALPHA,
    lordId: OFF_ALPHA_LORD,
    durability: 1000,
    soldiers: 2000,
    food: 5000,
    districtIds: [DIST_A1X, DIST_A1Y],
  }),
  makeCastle({
    id: CASTLE_A2,
    name: '甲支城',
    tier: 'branch',
    provinceId: PROV_OWARI,
    pos: { x: 1200, y: 1100 },
    ownerClanId: CLAN_ALPHA,
    lordId: OFF_ALPHA_TAISHO,
    durability: 500,
    soldiers: 800,
    food: 1500,
    districtIds: [DIST_A2X, DIST_A2Y],
  }),
  makeCastle({
    id: CASTLE_B1,
    name: '乙本城',
    tier: 'main',
    provinceId: PROV_SURUGA,
    pos: { x: 1600, y: 1300 },
    ownerClanId: CLAN_BETA,
    lordId: OFF_BETA_LORD,
    durability: 1000,
    soldiers: 2000,
    food: 5000,
    districtIds: [DIST_B1X, DIST_B1Y],
  }),
];

function makeDistrict(params: {
  id: DistrictId;
  name: string;
  castleId: CastleId;
  pos: { x: number; y: number };
  ownerClanId: ClanId;
}): District {
  return {
    id: params.id,
    name: params.name,
    castleId: params.castleId,
    isPort: false,
    pos: params.pos,
    ownerClanId: params.ownerClanId,
    stewardId: null, // 全部直轄（17 §3.3.1 精神）
    kokudaka: 20000,
    kokudakaCap: 40000,
    commerce: 300,
    commerceCap: 600,
    population: 15000,
    populationCap: 30000,
    publicOrder: 70,
    developFocus: 'agri',
    subjugation: null,
    uprising: null,
  };
}

const districts: District[] = [
  makeDistrict({
    id: DIST_A1X,
    name: '甲東郡',
    castleId: CASTLE_A1,
    pos: { x: 950, y: 950 },
    ownerClanId: CLAN_ALPHA,
  }),
  makeDistrict({
    id: DIST_A1Y,
    name: '甲西郡',
    castleId: CASTLE_A1,
    pos: { x: 1050, y: 950 },
    ownerClanId: CLAN_ALPHA,
  }),
  makeDistrict({
    id: DIST_A2X,
    name: '甲南郡',
    castleId: CASTLE_A2,
    pos: { x: 1150, y: 1150 },
    ownerClanId: CLAN_ALPHA,
  }),
  makeDistrict({
    id: DIST_A2Y,
    name: '甲北郡',
    castleId: CASTLE_A2,
    pos: { x: 1250, y: 1150 },
    ownerClanId: CLAN_ALPHA,
  }),
  makeDistrict({
    id: DIST_B1X,
    name: '乙東郡',
    castleId: CASTLE_B1,
    pos: { x: 1550, y: 1350 },
    ownerClanId: CLAN_BETA,
  }),
  makeDistrict({
    id: DIST_B1Y,
    name: '乙西郡',
    castleId: CASTLE_B1,
    pos: { x: 1650, y: 1350 },
    ownerClanId: CLAN_BETA,
  }),
];

const provinces: Province[] = [
  { id: PROV_OWARI, name: '尾張', region: 'tokai', labelPos: { x: 1050, y: 1000 } },
  { id: PROV_SURUGA, name: '駿河', region: 'tokai', labelPos: { x: 1600, y: 1300 } },
];

function makeRoad(id: string, a: MapNodeId, b: MapNodeId, baseDays: number): RoadEdge {
  return {
    id: id as RoadEdgeId,
    a,
    b,
    type: 'land',
    grade: 1,
    baseDays,
  };
}

// 生成樹（9 節點：3 城＋6 郡、8 邊）：INV-11 全圖連通（無多餘邊、無環）。
const roads: RoadEdge[] = [
  makeRoad('road.a1-a1x', CASTLE_A1, DIST_A1X, 1),
  makeRoad('road.a1-a1y', CASTLE_A1, DIST_A1Y, 1),
  makeRoad('road.a1-a2', CASTLE_A1, CASTLE_A2, 2),
  makeRoad('road.a2-a2x', CASTLE_A2, DIST_A2X, 1),
  makeRoad('road.a2-a2y', CASTLE_A2, DIST_A2Y, 1),
  makeRoad('road.a2-b1', CASTLE_A2, CASTLE_B1, 3), // 前線街道（跨勢力接縫）
  makeRoad('road.b1-b1x', CASTLE_B1, DIST_B1X, 1),
  makeRoad('road.b1-b1y', CASTLE_B1, DIST_B1Y, 1),
];

/** builder 輸入（M1-14 `buildGameState` 消費此形狀；02 §7）。 */
export const TINY_SCENARIO: ScenarioInput = {
  scenarioId: 'tiny',
  appVersion: '0.0.0-tiny',
  seed: TINY_SEED,
  startDay: TINY_START_DAY,
  playerClanId: CLAN_ALPHA,
  difficulty: 'normal',
  clans,
  officers,
  castles,
  districts,
  provinces,
  roads,
  personas: {
    [PERSONA_DEFAULT]: {
      aggression: 50,
      diplomacy: 50,
      development: 50,
      loyalty: 50,
      ambition: 50,
    },
  },
  clanPersonaIds: {
    [CLAN_ALPHA]: PERSONA_DEFAULT,
    [CLAN_BETA]: PERSONA_DEFAULT,
  },
};

/** 便利函式：建 tiny 劇本初始狀態（每次呼叫回傳全新獨立物件；`buildGameState` 內部已深拷貝）。 */
export function buildTinyState(overrides?: Partial<ScenarioInput>) {
  return buildGameState({ ...TINY_SCENARIO, ...overrides });
}
