// 測試用 `ScenarioBundleData`（14 zod 劇本形狀）小型雙地方（tokai／kinki）夾具。
// 規格：plan/18-roadmap.md M2-8（builder 資料側：補值規則＋浪人生成＋regions 白名單載入）。
//
// 本檔不經 `zScenario.parse()`（保持夾具精簡，免於 37 特性／12 戰法／13 政策／41 persona 等
// zod 長度限制——那些限制屬 M2-9 起實際劇本資料的驗收範圍，非本檔測試 `deriveScenarioInput`
// 補值邏輯所需）；`loadScenarioBundle`（zod 解析本身）另有獨立最小樣本測試涵蓋。
//
// 形狀：2 地方（tokai／kinki）；每地方 1 勢力／1 本城／1 郡／1 當主＋1 部將；
// 街道：地方內各 1 邊＋跨地方接縫 1 邊（全載時圖連通；僅載 tokai 時接縫邊須被剔除，
// 且剩餘子圖仍自成連通分量）；外交：alpha/beta 交戰 1 筆（僅載 tokai 時因 beta 未載入而不 materialize）。

import type {
  CastleData,
  ClanData,
  DistrictData,
  OfficerData,
  PersonaEntryData,
  ProvinceData,
  RoadEdgeData,
  ScenarioBundleData,
  TraitEntryData,
} from '../../src/data/schemas';
import type { CastleId, DistrictId } from '../../src/core/state/ids';
import { REGION_VALUES } from '../../src/core/state/enums';

const provinces: ProvinceData[] = [
  { id: 'prov.owari', name: '尾張', region: 'tokai', labelPos: { x: 100, y: 100 } },
  { id: 'prov.yamashiro', name: '山城', region: 'kinki', labelPos: { x: 200, y: 200 } },
];

const castles: CastleData[] = [
  {
    id: 'castle.a1',
    name: '甲本城',
    tier: 'main',
    provinceId: 'prov.owari',
    pos: { x: 100, y: 100 },
    coastal: false,
    ownerClanId: 'clan.alpha',
    lordId: 'off.alpha-lord',
    directControl: true,
    maxDurability: null,
    soldiers: 2000,
    food: 5000,
    morale: 80,
    facilities: [],
    terrainKind: 'plain', // [M6-V7] zCastle 新增顯示欄位（builder 不搬入 GameState）
  },
  {
    id: 'castle.b1',
    name: '乙本城',
    tier: 'main',
    provinceId: 'prov.yamashiro',
    pos: { x: 200, y: 200 },
    coastal: false,
    ownerClanId: 'clan.beta',
    lordId: 'off.beta-lord',
    directControl: true,
    maxDurability: null,
    soldiers: 1800,
    food: 4500,
    morale: 75,
    facilities: [],
    terrainKind: 'plain', // [M6-V7] zCastle 新增顯示欄位（builder 不搬入 GameState）
  },
];

const districts: DistrictData[] = [
  {
    id: 'dist.a1x',
    name: '甲東郡',
    castleId: 'castle.a1',
    pos: { x: 95, y: 95 },
    isPort: false,
    stewardId: 'off.alpha-retainer',
    kokudaka: 20000,
    kokudakaCap: 40000,
    commerce: 300,
    commerceCap: 600,
    population: 15000,
    populationCap: 30000,
    publicOrder: 60,
    developFocus: 'agri',
  },
  {
    id: 'dist.b1x',
    name: '乙東郡',
    castleId: 'castle.b1',
    pos: { x: 195, y: 195 },
    isPort: false,
    stewardId: null,
    kokudaka: 18000,
    kokudakaCap: 36000,
    commerce: 250,
    commerceCap: 500,
    population: 13000,
    populationCap: 26000,
    publicOrder: 60,
    developFocus: 'agri',
  },
];

const roads: RoadEdgeData[] = [
  {
    id: 'road.a1-a1x-01',
    a: 'castle.a1' as CastleId,
    b: 'dist.a1x' as DistrictId,
    type: 'land',
    grade: 2,
    baseDays: 1,
  },
  {
    id: 'road.b1-b1x-01',
    a: 'castle.b1' as CastleId,
    b: 'dist.b1x' as DistrictId,
    type: 'land',
    grade: 2,
    baseDays: 1,
  },
  {
    // 跨地方接縫邊：僅載 tokai 時因 castle.b1 不在白名單節點集內而須被剔除（18 §8-D5）。
    id: 'road.a1-b1-01',
    a: 'castle.a1' as CastleId,
    b: 'castle.b1' as CastleId,
    type: 'land',
    grade: 2,
    baseDays: 3,
  },
];

const clans: ClanData[] = [
  {
    id: 'clan.alpha',
    name: '甲家',
    leaderId: 'off.alpha-lord',
    homeCastleId: 'castle.a1',
    gold: 1000,
    prestige: 200,
    courtRank: 'none',
    shogunateTitle: 'none',
    personaId: 'persona.default',
    colorIndex: 0,
  },
  {
    id: 'clan.beta',
    name: '乙家',
    leaderId: 'off.beta-lord',
    homeCastleId: 'castle.b1',
    gold: 900,
    prestige: 150,
    courtRank: 'none',
    shogunateTitle: 'none',
    personaId: 'persona.default',
    colorIndex: 1,
  },
];

const tokaiOfficers: OfficerData[] = [
  {
    id: 'off.alpha-lord',
    name: '甲家當主',
    clanId: 'clan.alpha',
    locationCastleId: 'castle.a1',
    ldr: 90,
    val: 80,
    int: 85,
    pol: 88,
    traits: [],
    tactics: [],
    rank: 'shukuro',
    isKin: true,
    birthYear: 1520,
    deathYear: 1590,
  },
  {
    id: 'off.alpha-retainer',
    name: '甲家重臣',
    clanId: 'clan.alpha',
    locationCastleId: 'castle.a1',
    ldr: 65,
    val: 60,
    int: 55,
    pol: 58,
    traits: [],
    tactics: [],
    rank: 'busho',
    isKin: false,
    birthYear: 1530,
    deathYear: 1595,
  },
];

const kinkiOfficers: OfficerData[] = [
  {
    id: 'off.beta-lord',
    name: '乙家當主',
    clanId: 'clan.beta',
    locationCastleId: 'castle.b1',
    ldr: 85,
    val: 78,
    int: 80,
    pol: 82,
    traits: [],
    tactics: [],
    rank: 'shukuro',
    isKin: true,
    birthYear: 1522,
    deathYear: 1588,
  },
];

/** 9 地方分檔（順序＝`REGION_VALUES`）：僅 tokai/kinki 有內容，其餘 7 檔為空。 */
const officersByRegion: OfficerData[][] = REGION_VALUES.map((region) => {
  if (region === 'tokai') return tokaiOfficers;
  if (region === 'kinki') return kinkiOfficers;
  return [];
});

const traits: TraitEntryData[] = [
  { id: 'trait.common-a', name: '測試特性甲', rarity: 'common' },
  { id: 'trait.rare-a', name: '測試特性乙', rarity: 'rare' },
];

const personas: PersonaEntryData[] = [
  {
    id: 'persona.default',
    aggression: 50,
    diplomacy: 50,
    development: 50,
    loyalty: 50,
    ambition: 50,
  },
];

/** 測試用小型雙地方劇本束（非經 zod `.parse()`；純 TS 常數，見檔頭說明）。 */
export const SCENARIO_BUNDLE_FIXTURE: ScenarioBundleData = {
  id: 's-test',
  provinces,
  castles,
  districts,
  roads,
  clans,
  diplomacy: {
    pacts: [],
    wars: [{ a: 'clan.alpha', b: 'clan.beta' }],
    sentiments: [{ a: 'clan.alpha', b: 'clan.beta', aToB: 20, bToA: 25 }],
  },
  events: [],
  officers: officersByRegion,
  catalogs: {
    traits,
    policies: [],
    tactics: [],
    personas,
  },
};
