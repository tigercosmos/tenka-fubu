// M6-V2 固定視覺 fixture：`buildVisualMapState()` 產出一個自包含、決定論的 GameState，
// 供 e2e 截圖 harness（M6-V2）與後續 M6-V3+ 地圖渲染里程碑重複使用同一份「地圖有內容」基準。
// 規格：plan/18-roadmap.md M6-V2 列；plan/17-testing.md §3.9.3（場景清單，逐字對照——地形/橋樑
// 因 core 尚無資料模型而豁免，見 M6-V2 orchestrator 裁決，本檔不發明地形欄位）。
//
// 慣例比照 src/core/debugBattle.ts（唯一既有 debug fixture 前例）：
//   - inline 常數劇本（不經 zod，亦不 import tests/ 下任何東西——本檔須自包含於 src/core/）；
//   - 用真實 core 機制（`applyMarch`／`beginSiege`）部署軍隊與圍城，只在「模擬已完成移動」時
//     才直接覆寫 Army 的位置欄位（path/pathCursor/posNodeId/edgeProgressDays/edgeCostDays），
//     手法與 debugBattle.ts 的 `deployDebugArmy` 完全一致。
// 與 debugBattle.ts 的差異：`startDebugBattle` 是「指令」（要求 state.meta.debugMode 已為 true、
// 且僅可套用至全新 state），`buildVisualMapState` 是「建構器」（自己從零生產一個全新 state，
// 呼叫端不需先備妥空白 state）——故本檔不做 debugMode 入口 guard，改於回傳前將
// `state.meta.debugMode` 設為 true（讓後續 app/測試端讀到的就是除錯模式狀態）。
//
// 世界地理：城／郡之 pos 座標對齊 `src/data/map/japan-outline.json` 之真實日本海岸線
// （東海道尾張／駿河沿岸一帶，皆已用 point-in-polygon 驗證落於陸地 cell）；凡 s1560 劇本已有
// 同名城（清洲城／駿府城［s1560 駿府館］／掛川城／稻葉山城→本檔化名岐阜城）逕取該劇本
// `castles.json` 之 pos，郡座標則置於所屬城周邊陸地。鳴海城為 s1560 未收錄之補城，取清洲東南、
// 真實鳴海位置附近之陸地點。街道連法（尤其掛川－岐阜海路）與勢力配置仍為求道級/海路型別
// 覆蓋率而簡化之測試佈局，不代表史實地理／史實外交關係。

import { BAL } from './balance';
import { CoreError } from './errors';
import { applyMarch } from './commands/march';
import { beginSiege } from './systems/siege';
import { buildGameState, type ScenarioInput } from './state/builder';
import { calendarToDay } from './systems/time';
import { nextId } from './state/serialize';
import { validateState } from './state/invariants';
import type { Kinship, Rank, RoadKind } from './state/enums';
import type {
  Castle,
  Clan,
  District,
  GameState,
  Officer,
  Province,
  RoadEdge,
} from './state/gameState';
import type {
  AiPersonaId,
  ArmyId,
  CastleId,
  ClanId,
  DistrictId,
  MapNodeId,
  OfficerId,
  ProvinceId,
  RoadEdgeId,
} from './state/ids';

/** 固定劇本 id（app 端 `/?debug=visual-map` 與 e2e/visual.spec.ts 用此值比對，17 §3.9.3）。 */
export const DEBUG_VISUAL_MAP_ID = 'debug-visual-map-01';

/** 固定種子（決定論建置；同輸入重複呼叫 `buildVisualMapState()` 必須 hashState 相同）。 */
const DEBUG_VISUAL_SEED = 20260716;

/** 固定開局絕對日：1561 年 3 月 1 日（02 §5.6 calendarToDay；晚於 tiny 劇本一年，純粹避免與其撞期）。 */
const DEBUG_VISUAL_START_DAY = calendarToDay(1561, 3, 1);

// ── 勢力 id（3 勢力：攻方織田／守方今川／第三方齋藤，增加 territory 層次，17 §3.9.3） ──
const CLAN_ODA = 'clan.oda' as ClanId;
const CLAN_IMAGAWA = 'clan.imagawa' as ClanId;
const CLAN_SAITO = 'clan.saito' as ClanId;

// ── 城 id（2 本城＋2 支城為下限；織田/今川各一本一支，齋藤僅一本城） ──
const CASTLE_KIYOSU = 'castle.kiyosu' as CastleId; // 織田本城
const CASTLE_NARUMI = 'castle.narumi' as CastleId; // 織田支城（前線）
const CASTLE_SUNPU = 'castle.sunpu' as CastleId; // 今川本城——本 fixture 的圍城目標
const CASTLE_KAKEGAWA = 'castle.kakegawa' as CastleId; // 今川支城
const CASTLE_GIFU = 'castle.gifu' as CastleId; // 齋藤本城

/** 視覺錨點城：operational／close 鏡頭對準的城＝本 fixture 中被圍的今川本城。 */
export const VISUAL_ANCHOR_CASTLE_ID = CASTLE_SUNPU;

// ── 郡 id（每城 2 郡，INV-03 合法範圍） ──
const DIST_KIYOSU_E = 'dist.kiyosu-higashi' as DistrictId;
const DIST_KIYOSU_W = 'dist.kiyosu-nishi' as DistrictId;
const DIST_NARUMI_E = 'dist.narumi-higashi' as DistrictId;
const DIST_NARUMI_W = 'dist.narumi-nishi' as DistrictId;
const DIST_SUNPU_E = 'dist.sunpu-higashi' as DistrictId;
const DIST_SUNPU_W = 'dist.sunpu-nishi' as DistrictId;
const DIST_KAKEGAWA_E = 'dist.kakegawa-higashi' as DistrictId;
const DIST_KAKEGAWA_W = 'dist.kakegawa-nishi' as DistrictId;
const DIST_GIFU_E = 'dist.gifu-higashi' as DistrictId;
const DIST_GIFU_W = 'dist.gifu-nishi' as DistrictId;

// ── 國 id ──
const PROV_OWARI = 'prov.owari' as ProvinceId;
const PROV_SURUGA = 'prov.suruga' as ProvinceId;
const PROV_MINO = 'prov.mino' as ProvinceId;

// ── 武將 id ──
const OFF_ODA_NOBUNAGA = 'off.oda-nobunaga' as OfficerId; // 織田家當主／清洲城主
const OFF_ODA_NOBUMORI = 'off.oda-nobumori' as OfficerId; // 鳴海城主
const OFF_ODA_KATSUIE = 'off.oda-katsuie' as OfficerId; // 圍城攻方大將
const OFF_ODA_NAGAHIDE = 'off.oda-nagahide' as OfficerId; // 行軍中（多節點）
const OFF_ODA_TOSHIIE = 'off.oda-toshiie' as OfficerId; // 固守
const OFF_ODA_HIDEYOSHI = 'off.oda-hideyoshi' as OfficerId; // 固守＋補給警告

const OFF_IMAGAWA_YOSHIMOTO = 'off.imagawa-yoshimoto' as OfficerId; // 今川家當主／駿府城主
const OFF_IMAGAWA_UJIZANE = 'off.imagawa-ujizane' as OfficerId; // 掛川城主
const OFF_IMAGAWA_SESSAI = 'off.imagawa-sessai' as OfficerId; // 固守（駿府城下）
const OFF_IMAGAWA_MOTOYASU = 'off.imagawa-motoyasu' as OfficerId; // 行軍中（多節點，馳援駿府）
const OFF_IMAGAWA_MOTONOBU = 'off.imagawa-motonobu' as OfficerId; // 固守（掛川）

const OFF_SAITO_DOSAN = 'off.saito-dosan' as OfficerId; // 齋藤家當主，固守
const OFF_SAITO_YOSHITATSU = 'off.saito-yoshitatsu' as OfficerId; // 行軍中

const PERSONA_DEFAULT = 'persona.default' as AiPersonaId;

// ═══════════════════════════════════════════════════════════════════
// 實體建構小工具（比照 tests/fixtures/tiny.ts 的 make* 慣例；本檔不可 import 該檔，故就地重寫）
// ═══════════════════════════════════════════════════════════════════

function makeOfficer(p: {
  id: OfficerId;
  name: string;
  clanId: ClanId;
  rank: Rank;
  ldr: number;
  val: number;
  int: number;
  pol: number;
  loyalty: number;
  kinship: Kinship;
  birthYear: number;
  deathYear: number;
  locationCastleId: CastleId;
}): Officer {
  return {
    id: p.id,
    name: p.name,
    clanId: p.clanId,
    status: 'serving',
    ldr: p.ldr,
    val: p.val,
    int: p.int,
    pol: p.pol,
    statExp: { ldr: 0, val: 0, int: 0, pol: 0 },
    statGrowth: { ldr: 0, val: 0, int: 0, pol: 0 },
    traits: [],
    rank: p.rank,
    merit: 100,
    loyalty: p.loyalty,
    kinship: p.kinship,
    spouseId: null,
    birthYear: p.birthYear,
    deathYear: p.deathYear,
    hasComeOfAge: true,
    debutYear: p.birthYear + 15,
    debutClanId: p.clanId,
    debutCastleId: p.locationCastleId,
    locationCastleId: p.locationCastleId,
    armyId: null,
    capturedByClanId: null,
    scheduledDeath: { year: p.deathYear, month: 1 },
    captiveRetryOn: null,
    recruitRetryOn: null,
    rewardGiftsThisYear: 0,
    stalledPromotionMonths: 0,
  };
}

function makeCastle(p: {
  id: CastleId;
  name: string;
  tier: Castle['tier'];
  provinceId: ProvinceId;
  pos: { x: number; y: number };
  ownerClanId: ClanId;
  lordId: OfficerId | null;
  coastal: boolean;
  durability: number;
  soldiers: number;
  food: number;
  districtIds: DistrictId[];
}): Castle {
  return {
    id: p.id,
    name: p.name,
    tier: p.tier,
    provinceId: p.provinceId,
    coastal: p.coastal,
    pos: p.pos,
    ownerClanId: p.ownerClanId,
    lordId: p.lordId,
    directControl: true,
    corpsId: null,
    durability: p.durability,
    maxDurability: p.durability,
    soldiers: p.soldiers,
    food: p.food,
    foodFrac: 0,
    riceTradedThisMonth: 0,
    morale: 80,
    conscriptPolicy: 'mid',
    facilities: [],
    buildQueue: [],
    betrayalReadyClanId: null,
    betrayalReadyUntilDay: 0,
    districtIds: p.districtIds,
  };
}

function makeDistrict(p: {
  id: DistrictId;
  name: string;
  castleId: CastleId;
  pos: { x: number; y: number };
  ownerClanId: ClanId;
}): District {
  return {
    id: p.id,
    name: p.name,
    castleId: p.castleId,
    isPort: false,
    pos: p.pos,
    ownerClanId: p.ownerClanId,
    stewardId: null,
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

function makeRoad(
  id: string,
  a: MapNodeId,
  b: MapNodeId,
  type: RoadKind,
  grade: 1 | 2 | 3,
  baseDays: number,
): RoadEdge {
  return { id: id as RoadEdgeId, a, b, type, grade, baseDays };
}

// ═══════════════════════════════════════════════════════════════════
// 劇本資料（inline，自包含；世界座標 0..4096，見檔頭「世界地理」註解）
// ═══════════════════════════════════════════════════════════════════

const clans: Clan[] = [
  {
    id: CLAN_ODA,
    name: '織田家',
    leaderId: OFF_ODA_NOBUNAGA,
    homeCastleId: CASTLE_KIYOSU,
    gold: 3000,
    prestige: 300,
    courtRank: 'none',
    shogunateTitle: 'none',
    colorIndex: 0,
    alive: true,
    destroyedDay: null,
    taimei: { activeTaimeiId: null, activeUntilDay: 0, cooldownUntilDay: 0 },
  },
  {
    id: CLAN_IMAGAWA,
    name: '今川家',
    leaderId: OFF_IMAGAWA_YOSHIMOTO,
    homeCastleId: CASTLE_SUNPU,
    gold: 3500,
    prestige: 400,
    courtRank: 'none',
    shogunateTitle: 'none',
    colorIndex: 1,
    alive: true,
    destroyedDay: null,
    taimei: { activeTaimeiId: null, activeUntilDay: 0, cooldownUntilDay: 0 },
  },
  {
    id: CLAN_SAITO,
    name: '齋藤家',
    leaderId: OFF_SAITO_DOSAN,
    homeCastleId: CASTLE_GIFU,
    gold: 1500,
    prestige: 200,
    courtRank: 'none',
    shogunateTitle: 'none',
    colorIndex: 2,
    alive: true,
    destroyedDay: null,
    taimei: { activeTaimeiId: null, activeUntilDay: 0, cooldownUntilDay: 0 },
  },
];

const officers: Officer[] = [
  makeOfficer({
    id: OFF_ODA_NOBUNAGA,
    name: '織田信長',
    clanId: CLAN_ODA,
    rank: 'shukuro',
    ldr: 95,
    val: 80,
    int: 90,
    pol: 85,
    loyalty: 100,
    kinship: 'kin',
    birthYear: 1534,
    deathYear: 1600,
    locationCastleId: CASTLE_KIYOSU,
  }),
  makeOfficer({
    id: OFF_ODA_NOBUMORI,
    name: '佐久間信盛',
    clanId: CLAN_ODA,
    rank: 'samurai-taisho',
    ldr: 65,
    val: 60,
    int: 55,
    pol: 50,
    loyalty: 78,
    kinship: 'fudai',
    birthYear: 1528,
    deathYear: 1590,
    locationCastleId: CASTLE_NARUMI,
  }),
  makeOfficer({
    id: OFF_ODA_KATSUIE,
    name: '柴田勝家',
    clanId: CLAN_ODA,
    rank: 'busho',
    ldr: 82,
    val: 88,
    int: 55,
    pol: 45,
    loyalty: 80,
    kinship: 'fudai',
    birthYear: 1522,
    deathYear: 1590,
    locationCastleId: CASTLE_NARUMI,
  }),
  makeOfficer({
    id: OFF_ODA_NAGAHIDE,
    name: '丹羽長秀',
    clanId: CLAN_ODA,
    rank: 'busho',
    ldr: 75,
    val: 65,
    int: 65,
    pol: 60,
    loyalty: 80,
    kinship: 'fudai',
    birthYear: 1535,
    deathYear: 1590,
    locationCastleId: CASTLE_KIYOSU,
  }),
  makeOfficer({
    id: OFF_ODA_TOSHIIE,
    name: '前田利家',
    clanId: CLAN_ODA,
    rank: 'busho',
    ldr: 70,
    val: 85,
    int: 50,
    pol: 45,
    loyalty: 75,
    kinship: 'tozama',
    birthYear: 1539,
    deathYear: 1600,
    locationCastleId: CASTLE_KIYOSU,
  }),
  makeOfficer({
    id: OFF_ODA_HIDEYOSHI,
    name: '羽柴秀吉',
    clanId: CLAN_ODA,
    rank: 'busho',
    ldr: 78,
    val: 55,
    int: 85,
    pol: 80,
    loyalty: 75,
    kinship: 'tozama',
    birthYear: 1537,
    deathYear: 1598,
    locationCastleId: CASTLE_NARUMI,
  }),
  makeOfficer({
    id: OFF_IMAGAWA_YOSHIMOTO,
    name: '今川義元',
    clanId: CLAN_IMAGAWA,
    rank: 'shukuro',
    ldr: 88,
    val: 60,
    int: 82,
    pol: 88,
    loyalty: 100,
    kinship: 'kin',
    birthYear: 1519,
    deathYear: 1590,
    locationCastleId: CASTLE_SUNPU,
  }),
  makeOfficer({
    id: OFF_IMAGAWA_UJIZANE,
    name: '今川氏真',
    clanId: CLAN_IMAGAWA,
    rank: 'samurai-taisho',
    ldr: 55,
    val: 50,
    int: 60,
    pol: 60,
    loyalty: 90,
    kinship: 'kin',
    birthYear: 1538,
    deathYear: 1615,
    locationCastleId: CASTLE_KAKEGAWA,
  }),
  makeOfficer({
    id: OFF_IMAGAWA_SESSAI,
    name: '太原雪齋',
    clanId: CLAN_IMAGAWA,
    rank: 'karo',
    ldr: 80,
    val: 55,
    int: 92,
    pol: 85,
    loyalty: 85,
    kinship: 'fudai',
    birthYear: 1496,
    deathYear: 1590,
    locationCastleId: CASTLE_SUNPU,
  }),
  makeOfficer({
    id: OFF_IMAGAWA_MOTOYASU,
    name: '松平元康',
    clanId: CLAN_IMAGAWA,
    rank: 'busho',
    ldr: 72,
    val: 68,
    int: 70,
    pol: 65,
    loyalty: 70,
    kinship: 'tozama',
    birthYear: 1543,
    deathYear: 1600,
    locationCastleId: CASTLE_KAKEGAWA,
  }),
  makeOfficer({
    id: OFF_IMAGAWA_MOTONOBU,
    name: '岡部元信',
    clanId: CLAN_IMAGAWA,
    rank: 'busho',
    ldr: 68,
    val: 70,
    int: 55,
    pol: 45,
    loyalty: 75,
    kinship: 'fudai',
    birthYear: 1530,
    deathYear: 1590,
    locationCastleId: CASTLE_KAKEGAWA,
  }),
  makeOfficer({
    id: OFF_SAITO_DOSAN,
    name: '齋藤道三',
    clanId: CLAN_SAITO,
    rank: 'shukuro',
    ldr: 85,
    val: 70,
    int: 88,
    pol: 80,
    loyalty: 100,
    kinship: 'kin',
    birthYear: 1494,
    deathYear: 1590,
    locationCastleId: CASTLE_GIFU,
  }),
  makeOfficer({
    id: OFF_SAITO_YOSHITATSU,
    name: '齋藤義龍',
    clanId: CLAN_SAITO,
    rank: 'busho',
    ldr: 70,
    val: 75,
    int: 55,
    pol: 50,
    loyalty: 70,
    kinship: 'kin',
    birthYear: 1527,
    deathYear: 1590,
    locationCastleId: CASTLE_GIFU,
  }),
];

const castles: Castle[] = [
  makeCastle({
    id: CASTLE_KIYOSU,
    name: '清洲城',
    tier: 'main',
    provinceId: PROV_OWARI,
    pos: { x: 1966, y: 2838 }, // s1560 castles.json castle.kiyosu 逐字
    ownerClanId: CLAN_ODA,
    lordId: OFF_ODA_NOBUNAGA,
    coastal: false,
    durability: BAL.durabilityMain,
    soldiers: 6000,
    food: 20000,
    districtIds: [DIST_KIYOSU_E, DIST_KIYOSU_W],
  }),
  makeCastle({
    id: CASTLE_NARUMI,
    name: '鳴海城',
    tier: 'branch',
    provinceId: PROV_OWARI,
    pos: { x: 1995, y: 2865 }, // s1560 未收錄；取清洲東南、真實鳴海位置附近之陸地點
    ownerClanId: CLAN_ODA,
    lordId: OFF_ODA_NOBUMORI,
    coastal: false,
    durability: BAL.durabilityBranch,
    soldiers: 4200,
    food: 8000,
    districtIds: [DIST_NARUMI_E, DIST_NARUMI_W],
  }),
  makeCastle({
    id: CASTLE_SUNPU,
    name: '駿府城',
    tier: 'main',
    provinceId: PROV_SURUGA,
    pos: { x: 2312, y: 2897 }, // s1560 castles.json castle.sunpu（駿府館）逐字
    ownerClanId: CLAN_IMAGAWA,
    lordId: OFF_IMAGAWA_YOSHIMOTO,
    coastal: false,
    durability: BAL.durabilityMain,
    soldiers: 5000,
    food: 18000,
    districtIds: [DIST_SUNPU_E, DIST_SUNPU_W],
  }),
  makeCastle({
    id: CASTLE_KAKEGAWA,
    name: '掛川城',
    tier: 'branch',
    provinceId: PROV_SURUGA,
    pos: { x: 2226, y: 2953 }, // s1560 castles.json castle.kakegawa 逐字
    ownerClanId: CLAN_IMAGAWA,
    lordId: OFF_IMAGAWA_UJIZANE,
    coastal: true,
    durability: BAL.durabilityBranch,
    soldiers: 2500,
    food: 7000,
    districtIds: [DIST_KAKEGAWA_E, DIST_KAKEGAWA_W],
  }),
  makeCastle({
    id: CASTLE_GIFU,
    name: '岐阜城',
    tier: 'main',
    provinceId: PROV_MINO,
    pos: { x: 1938, y: 2774 }, // s1560 castles.json castle.inabayama（稻葉山城，本檔化名岐阜城）逐字
    ownerClanId: CLAN_SAITO,
    lordId: null, // 城主出缺（示範 lordId=null 之合法變異）
    coastal: true,
    durability: BAL.durabilityMain,
    soldiers: 2000,
    food: 6000,
    districtIds: [DIST_GIFU_E, DIST_GIFU_W],
  }),
];

const districts: District[] = [
  makeDistrict({
    id: DIST_KIYOSU_E,
    name: '清洲東郡',
    castleId: CASTLE_KIYOSU,
    pos: { x: 1996, y: 2848 },
    ownerClanId: CLAN_ODA,
  }),
  makeDistrict({
    id: DIST_KIYOSU_W,
    name: '清洲西郡',
    castleId: CASTLE_KIYOSU,
    pos: { x: 1936, y: 2848 },
    ownerClanId: CLAN_ODA,
  }),
  makeDistrict({
    id: DIST_NARUMI_E,
    name: '鳴海東郡',
    castleId: CASTLE_NARUMI,
    pos: { x: 2025, y: 2885 },
    ownerClanId: CLAN_ODA,
  }),
  makeDistrict({
    id: DIST_NARUMI_W,
    name: '鳴海西郡',
    castleId: CASTLE_NARUMI,
    pos: { x: 1965, y: 2885 },
    ownerClanId: CLAN_ODA,
  }),
  makeDistrict({
    id: DIST_SUNPU_E,
    name: '駿府東郡',
    castleId: CASTLE_SUNPU,
    pos: { x: 2337, y: 2877 },
    ownerClanId: CLAN_IMAGAWA,
  }),
  makeDistrict({
    id: DIST_SUNPU_W,
    name: '駿府西郡',
    castleId: CASTLE_SUNPU,
    pos: { x: 2282, y: 2917 },
    ownerClanId: CLAN_IMAGAWA,
  }),
  makeDistrict({
    id: DIST_KAKEGAWA_E,
    name: '掛川東郡',
    castleId: CASTLE_KAKEGAWA,
    pos: { x: 2256, y: 2973 },
    ownerClanId: CLAN_IMAGAWA,
  }),
  makeDistrict({
    id: DIST_KAKEGAWA_W,
    name: '掛川西郡',
    castleId: CASTLE_KAKEGAWA,
    pos: { x: 2196, y: 2973 },
    ownerClanId: CLAN_IMAGAWA,
  }),
  makeDistrict({
    id: DIST_GIFU_E,
    name: '岐阜東郡',
    castleId: CASTLE_GIFU,
    pos: { x: 1968, y: 2794 },
    ownerClanId: CLAN_SAITO,
  }),
  makeDistrict({
    id: DIST_GIFU_W,
    name: '岐阜西郡',
    castleId: CASTLE_GIFU,
    pos: { x: 1908, y: 2794 },
    ownerClanId: CLAN_SAITO,
  }),
];

const provinces: Province[] = [
  { id: PROV_OWARI, name: '尾張', region: 'tokai', labelPos: { x: 1980, y: 2818 } },
  { id: PROV_SURUGA, name: '駿河', region: 'tokai', labelPos: { x: 2269, y: 2925 } },
  { id: PROV_MINO, name: '美濃', region: 'tokai', labelPos: { x: 1920, y: 2750 } },
];

/**
 * 街道（14 邊：15 節點生成樹，INV-11 全圖連通）。道級涵蓋 1／2／3（17 §3.9.3 要求）；
 * 掛川－岐阜為海路（type='sea'），涵蓋海路型別要求。街道連法為測試佈局，非史實地理（見檔頭）。
 */
const roads: RoadEdge[] = [
  makeRoad('road.kiyosu-higashi', CASTLE_KIYOSU, DIST_KIYOSU_E, 'land', 1, 1),
  makeRoad('road.kiyosu-nishi', CASTLE_KIYOSU, DIST_KIYOSU_W, 'land', 1, 1),
  makeRoad('road.kiyosu-narumi', CASTLE_KIYOSU, CASTLE_NARUMI, 'land', 2, 3), // 尾張幹道
  makeRoad('road.narumi-higashi', CASTLE_NARUMI, DIST_NARUMI_E, 'land', 1, 1),
  makeRoad('road.narumi-nishi', CASTLE_NARUMI, DIST_NARUMI_W, 'land', 1, 1),
  makeRoad('road.narumi-sunpu', CASTLE_NARUMI, CASTLE_SUNPU, 'land', 3, 4), // 前線幹道（東海道）
  makeRoad('road.sunpu-higashi', CASTLE_SUNPU, DIST_SUNPU_E, 'land', 1, 1),
  makeRoad('road.sunpu-nishi', CASTLE_SUNPU, DIST_SUNPU_W, 'land', 1, 1),
  makeRoad('road.sunpu-kakegawa', CASTLE_SUNPU, CASTLE_KAKEGAWA, 'land', 2, 3),
  makeRoad('road.kakegawa-higashi', CASTLE_KAKEGAWA, DIST_KAKEGAWA_E, 'land', 1, 1),
  makeRoad('road.kakegawa-nishi', CASTLE_KAKEGAWA, DIST_KAKEGAWA_W, 'land', 1, 1),
  makeRoad('road.kakegawa-gifu', CASTLE_KAKEGAWA, CASTLE_GIFU, 'sea', 1, 2), // 海路
  makeRoad('road.gifu-higashi', CASTLE_GIFU, DIST_GIFU_E, 'land', 1, 1),
  makeRoad('road.gifu-nishi', CASTLE_GIFU, DIST_GIFU_W, 'land', 1, 1),
];

const SCENARIO: ScenarioInput = {
  scenarioId: DEBUG_VISUAL_MAP_ID,
  appVersion: '0.0.0-debug-visual',
  seed: DEBUG_VISUAL_SEED,
  startDay: DEBUG_VISUAL_START_DAY,
  playerClanId: CLAN_ODA,
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
    [CLAN_ODA]: PERSONA_DEFAULT,
    [CLAN_IMAGAWA]: PERSONA_DEFAULT,
    [CLAN_SAITO]: PERSONA_DEFAULT,
  },
};

// ═══════════════════════════════════════════════════════════════════
// 部署工具（比照 debugBattle.ts `deployDebugArmy`：真實 `applyMarch` 出陣，
// 必要時直接覆寫位置欄位以模擬「已行軍到指定進度」）
// ═══════════════════════════════════════════════════════════════════

interface DeploySpec {
  clanId: ClanId;
  originCastleId: CastleId;
  leaderId: OfficerId;
  soldiers: number;
  /** 攜帶兵糧以「日」表示（→ food = soldiers × BAL.fieldFoodPerSoldierDaily × foodDays，向上取整）。 */
  foodDays: number;
  targetNodeId: MapNodeId;
}

/** 用真實 `applyMarch` 出陣並回傳新生 ArmyId（找出部署前後 state.armies 新增的 key）。 */
function deployArmy(state: GameState, spec: DeploySpec): ArmyId {
  const before = new Set(Object.keys(state.armies));
  applyMarch(
    state,
    {
      type: 'march',
      clanId: spec.clanId,
      originCastleId: spec.originCastleId,
      leaderId: spec.leaderId,
      deputyIds: [],
      soldiers: spec.soldiers,
      food: Math.ceil(spec.soldiers * BAL.fieldFoodPerSoldierDaily * spec.foodDays),
      targetNodeId: spec.targetNodeId,
    },
    () => undefined,
  );
  const armyId = Object.keys(state.armies).find((candidate) => !before.has(candidate)) as
    ArmyId | undefined;
  if (armyId === undefined) {
    throw new CoreError('DATA_INTEGRITY', 'debugVisual：部署部隊失敗（applyMarch 未建立新軍）');
  }
  return armyId;
}

/** 兩節點間有效行軍日數（比照 src/core/commands/march.ts 之私有 `edgeCost`，公式來源 04 §3.4.2）。 */
function edgeCostBetween(state: Readonly<GameState>, a: MapNodeId, b: MapNodeId): number {
  const edge = Object.values(state.roads).find(
    (candidate) =>
      (candidate.a === a && candidate.b === b) || (candidate.a === b && candidate.b === a),
  );
  if (!edge) {
    throw new CoreError('DATA_INTEGRITY', `debugVisual：找不到街道 ${a}↔${b}`);
  }
  return edge.type === 'sea' ? edge.baseDays : edge.baseDays / BAL.roadGradeSpeedMult[edge.grade];
}

/** 將剛出陣的部隊收斂為「已抵達、固守待命」（path 收斂為單節點，比照 debugBattle.ts 手法）。 */
function collapseToHolding(state: GameState, armyId: ArmyId, atNodeId: MapNodeId): void {
  const army = state.armies[armyId]!;
  army.posNodeId = atNodeId;
  army.targetNodeId = atNodeId;
  army.path = [atNodeId];
  army.pathCursor = 0;
  army.edgeProgressDays = 0;
  army.edgeCostDays = 0;
  army.status = 'holding';
}

/**
 * 將剛出陣的部隊收斂為「行軍中途」：已抵達 path[cursorNodeIndex]、正走向下一節點、
 * 進度為該邊 edgeCostDays 的 `progressFraction`（0..1，不含 1，確保未抵達）。
 */
function collapseToMidTransit(
  state: GameState,
  armyId: ArmyId,
  cursorNodeIndex: number,
  progressFraction: number,
): void {
  const army = state.armies[armyId]!;
  const cursorNode = army.path[cursorNodeIndex];
  const nextNode = army.path[cursorNodeIndex + 1];
  if (cursorNode === undefined || nextNode === undefined) {
    throw new CoreError(
      'DATA_INTEGRITY',
      `debugVisual：部隊 ${armyId} 的 path 索引不足以收斂中途進度`,
    );
  }
  const edgeCostDays = edgeCostBetween(state, cursorNode, nextNode);
  army.pathCursor = cursorNodeIndex;
  army.posNodeId = cursorNode;
  army.edgeCostDays = edgeCostDays;
  army.edgeProgressDays = edgeCostDays * progressFraction;
}

// ═══════════════════════════════════════════════════════════════════
// buildVisualMapState
// ═══════════════════════════════════════════════════════════════════

/**
 * 建立 M6-V2 固定視覺 fixture（17 §3.9.3）：織田（攻方）／今川（守方，本城遭圍）／齋藤（第三方）
 * 三勢力、5 城（2 本城＋2 支城為下限，齋藤另補 1 本城）、10 郡、14 條街道（涵蓋道級 1/2/3 與海路），
 * 9 支軍隊（sieging／marching［≥2 多節點中途］／holding，含 1 支補給警告），
 * 1 場對 `VISUAL_ANCHOR_CASTLE_ID` 的進行中圍城，1 筆合法 Report。
 *
 * 決定論：全程不讀 Math.random/Date.now；純由本檔常數與 `applyMarch`／`beginSiege`（皆為決定論
 * core 函式）推導，故同一呼叫序列重複呼叫本函式產生的 state 必然 hashState 相同。
 *
 * 回傳前執行 `validateState`；有違規即 throw `CoreError('INVARIANT_VIOLATION', ...)`
 * （讓呼叫端與測試都拿到乾淨 state，不必自行再驗一次）。
 */
export function buildVisualMapState(): GameState {
  const state = buildGameState(SCENARIO);
  state.meta.debugMode = true; // 本函式是建構器非指令，不做 debugMode 入口 guard；回傳前直接標記除錯狀態。

  // ── 攻方：柴田勝家自鳴海出陣圍駿府（今川本城，即 VISUAL_ANCHOR_CASTLE_ID）──
  const katsuieArmy = deployArmy(state, {
    clanId: CLAN_ODA,
    originCastleId: CASTLE_NARUMI,
    leaderId: OFF_ODA_KATSUIE,
    soldiers: 2200,
    foodDays: 20,
    targetNodeId: CASTLE_SUNPU,
  });
  collapseToHolding(state, katsuieArmy, CASTLE_SUNPU);
  const siegeEvents = beginSiege(state, CASTLE_SUNPU, katsuieArmy);
  const siegeStarted = siegeEvents.find((event) => event.type === 'siege.started');
  if (siegeStarted === undefined) {
    throw new CoreError('DATA_INTEGRITY', 'debugVisual：圍城未能正確開始（beginSiege 未發事件）');
  }
  // 至少 1 筆合法 Report（供 UI ReportStack 顯示；02 §4.17；用真實圍城事件，非捏造型別）。
  state.reports.unshift({
    id: nextId(state, 'report'),
    day: state.time.day,
    event: siegeStarted,
    read: false,
  });

  // ── 攻方：丹羽長秀自清洲行軍中，途經鳴海往鳴海西郡（多節點 path，中途，非跨勢力）──
  const nagahideArmy = deployArmy(state, {
    clanId: CLAN_ODA,
    originCastleId: CASTLE_KIYOSU,
    leaderId: OFF_ODA_NAGAHIDE,
    soldiers: 900,
    foodDays: 30,
    targetNodeId: DIST_NARUMI_W,
  });
  collapseToMidTransit(state, nagahideArmy, 1, 0.4);

  // ── 攻方：前田利家自清洲行軍抵達清洲東郡後固守 ──
  const toshiieArmy = deployArmy(state, {
    clanId: CLAN_ODA,
    originCastleId: CASTLE_KIYOSU,
    leaderId: OFF_ODA_TOSHIIE,
    soldiers: 700,
    foodDays: 15,
    targetNodeId: DIST_KIYOSU_E,
  });
  collapseToHolding(state, toshiieArmy, DIST_KIYOSU_E);

  // ── 攻方：羽柴秀吉自鳴海行軍抵達鳴海東郡後固守，且刻意攜帶低糧（補給警告門檻） ──
  const hideyoshiArmy = deployArmy(state, {
    clanId: CLAN_ODA,
    originCastleId: CASTLE_NARUMI,
    leaderId: OFF_ODA_HIDEYOSHI,
    soldiers: 600,
    foodDays: 5, // < BAL.autoReturnFoodDays(7)：刻意觸發補給警告門檻
    targetNodeId: DIST_NARUMI_E,
  });
  collapseToHolding(state, hideyoshiArmy, DIST_NARUMI_E);

  // ── 守方：太原雪齋自駿府行軍抵達駿府西郡後固守（城下守備）──
  const sessaiArmy = deployArmy(state, {
    clanId: CLAN_IMAGAWA,
    originCastleId: CASTLE_SUNPU,
    leaderId: OFF_IMAGAWA_SESSAI,
    soldiers: 1600,
    foodDays: 20,
    targetNodeId: DIST_SUNPU_W,
  });
  collapseToHolding(state, sessaiArmy, DIST_SUNPU_W);

  // ── 守方：松平元康自掛川馳援駿府，途經駿府往駿府東郡（多節點 path，中途）──
  const motoyasuArmy = deployArmy(state, {
    clanId: CLAN_IMAGAWA,
    originCastleId: CASTLE_KAKEGAWA,
    leaderId: OFF_IMAGAWA_MOTOYASU,
    soldiers: 1100,
    foodDays: 25,
    targetNodeId: DIST_SUNPU_E,
  });
  collapseToMidTransit(state, motoyasuArmy, 1, 0.6);

  // ── 守方：岡部元信自掛川行軍抵達掛川東郡後固守 ──
  const motonobuArmy = deployArmy(state, {
    clanId: CLAN_IMAGAWA,
    originCastleId: CASTLE_KAKEGAWA,
    leaderId: OFF_IMAGAWA_MOTONOBU,
    soldiers: 800,
    foodDays: 15,
    targetNodeId: DIST_KAKEGAWA_E,
  });
  collapseToHolding(state, motonobuArmy, DIST_KAKEGAWA_E);

  // ── 第三方：齋藤道三自岐阜行軍抵達岐阜西郡後固守 ──
  const dosanArmy = deployArmy(state, {
    clanId: CLAN_SAITO,
    originCastleId: CASTLE_GIFU,
    leaderId: OFF_SAITO_DOSAN,
    soldiers: 1200,
    foodDays: 20,
    targetNodeId: DIST_GIFU_W,
  });
  collapseToHolding(state, dosanArmy, DIST_GIFU_W);

  // ── 第三方：齋藤義龍自岐阜行軍往岐阜東郡，中途（單邊 path，非收斂固守，增添行軍多樣性）──
  const yoshitatsuArmy = deployArmy(state, {
    clanId: CLAN_SAITO,
    originCastleId: CASTLE_GIFU,
    leaderId: OFF_SAITO_YOSHITATSU,
    soldiers: 650,
    foodDays: 18,
    targetNodeId: DIST_GIFU_E,
  });
  {
    const army = state.armies[yoshitatsuArmy]!;
    army.edgeProgressDays = army.edgeCostDays * 0.5;
  }

  const violations = validateState(state);
  if (violations.length > 0) {
    throw new CoreError(
      'INVARIANT_VIOLATION',
      `debugVisual：buildVisualMapState 產出的 state 違反 ${String(violations.length)} 條不變量`,
      violations,
    );
  }

  return state;
}
