// 基礎 selector：曆法／資源／反向索引（M1-10；純函式，UI／AI 共用）。
// 規格：plan/02-data-model.md §5.1（衍生值與快取策略：canonical 公式與「計算時機與快取」欄）；
//       plan/18-roadmap.md M1-10（本檔 M1 範圍：曆法/資源/反向索引子集——`castle→districts`／
//       `clan→castles` 等；02 §5.1 其餘列 castleMaxSoldiers／castleFoodCap／clanIncome／
//       availableTaimei／clanPowerScore 依賴尚未落地之系統（05/07/09/10），留待對應里程碑補上）。
//
// 快取慣例（見 state/derivedCache.ts 檔頭裁決）：02 §5.1 標「selector；tick 內 memo」者
// （`clanKokudaka`／`clanSoldiers`／`officerFiefs`／`officerRole`／`corpsCastles`）經由
// `DerivedCache`（M1-9）之 `getOrCompute(cache, key, compute)` 掛載，key = `<selector名>:<id>`；
// 標「載入時建立，永不失效」者（`provinceCastles`／`adjacency`）與純函式（`fiefCapOf`／`season`／
// `developmentPct`）及本檔另提供之 `castle→districts`／`clan→castles` 正/反向索引，M1 從簡不經
// cache（無跨 tick 失效疑慮、或計算成本低；見 derivedCache.ts 檔頭）。

import { BAL } from '../balance';
import {
  castleHarvest,
  garrisonFoodMonthly,
  monthlyGoldIncome,
  officerSalary,
  policyUpkeep,
} from '../domestic';
import {
  RANK_VALUES,
  type ArmyMission,
  type ArmyStatus,
  type CastleTier,
  type Rank,
  type Season,
  type SiegeMode,
} from './enums';
import type { DerivedCache } from './derivedCache';
import { getOrCompute } from './derivedCache';
import { buildMapGraph, type MapGraph } from './mapGraph';
import { DEBUG_VISUAL_ROAD_DISPLAY } from './debugVisualRoadDisplay';
import { DEBUG_VISUAL_CASTLE_TERRAIN } from './debugVisualCastleTerrain';
import type {
  Army,
  Castle,
  Clan,
  District,
  FieldCombat,
  GameState,
  Province,
  Siege,
} from './gameState';
import type {
  ArmyId,
  CastleId,
  ClanId,
  CorpsId,
  DistrictId,
  MapNodeId,
  OfficerId,
  ProvinceId,
  RoadEdgeId,
  SiegeId,
} from './ids';
import { seasonOf } from '../systems/time';
import outlineJson from '../../data/map/japan-outline.json';
import { zJapanOutlineFile } from '../../data/schemas/outline';
import roadsJson from '../../data/scenarios/s1560/roads.json';
import { zRoadsFile } from '../../data/schemas/road';
import castlesJson from '../../data/scenarios/s1560/castles.json';
import { zCastlesFile } from '../../data/schemas/castle';

// ═══════════════════════════════════════════════════════════════════
// 曆法（02 §5.1 `season(month)`）
// ═══════════════════════════════════════════════════════════════════

/** 目前季節（02 §5.1；純函式，包裝 `systems/time.ts` 之 `seasonOf`）。 */
export function season(state: GameState): Season {
  return seasonOf(state.time.month);
}

// ═══════════════════════════════════════════════════════════════════
// 資源（02 §5.1；selector；tick 內 memo）
// ═══════════════════════════════════════════════════════════════════

/** 勢力總石高＝Σ 該勢力所有郡 `kokudaka`（02 §5.1）。 */
export function clanKokudaka(state: GameState, cache: DerivedCache, clanId: ClanId): number {
  return getOrCompute(cache, `clanKokudaka:${clanId}`, () => {
    let total = 0;
    for (const district of Object.values<District>(state.districts)) {
      if (district.ownerClanId === clanId) total += district.kokudaka;
    }
    return total;
  });
}

/** 勢力總兵力＝Σ 自家城 `soldiers` ＋ Σ 自家部隊 `soldiers`（02 §5.1）。 */
export function clanSoldiers(state: GameState, cache: DerivedCache, clanId: ClanId): number {
  return getOrCompute(cache, `clanSoldiers:${clanId}`, () => {
    let total = 0;
    for (const castle of Object.values<Castle>(state.castles)) {
      if (castle.ownerClanId === clanId) total += castle.soldiers;
    }
    for (const army of Object.values(state.armies)) {
      if (army.clanId === clanId) total += army.soldiers;
    }
    return total;
  });
}

// ═══════════════════════════════════════════════════════════════════
// developmentPct（02 §5.1；純函式，UI 顯示用）
// ═══════════════════════════════════════════════════════════════════

/** 郡開發度 0..100（02 §5.1 公式逐字轉譯：石高與商業達成度之平均，商業分母下限 1）。 */
export function developmentPct(district: District): number {
  const kokudakaRatio = district.kokudaka / district.kokudakaCap;
  const commerceRatio = district.commerce / Math.max(1, district.commerceCap);
  return Math.round((100 * (kokudakaRatio + commerceRatio)) / 2);
}

// ═══════════════════════════════════════════════════════════════════
// fiefCapOf（02 §5.1；常數查表）
// ═══════════════════════════════════════════════════════════════════

/** 身分階級可受封知行郡數上限（02 §5.1；查 `BAL.fiefMaxByRank`，索引依 `RANK_VALUES` 序）。 */
export function fiefCapOf(rank: Rank): number {
  const idx = RANK_VALUES.indexOf(rank);
  const cap = BAL.fiefMaxByRank[idx];
  if (cap === undefined) {
    throw new Error(`fiefCapOf: 未知身分 ${rank}`);
  }
  return cap;
}

// ═══════════════════════════════════════════════════════════════════
// 反向索引：officerFiefs／officerRole／corpsCastles（02 §5.1；tick 內 memo）
// ═══════════════════════════════════════════════════════════════════

/** 武將受封知行郡（反查 `districts` 中 `stewardId = officerId` 者；02 §5.1）。 */
export function officerFiefs(
  state: GameState,
  cache: DerivedCache,
  officerId: OfficerId,
): DistrictId[] {
  return getOrCompute(cache, `officerFiefs:${officerId}`, () => {
    const result: DistrictId[] = [];
    for (const district of Object.values<District>(state.districts)) {
      if (district.stewardId === officerId) result.push(district.id);
    }
    return result;
  });
}

/** 武將現任役職（02 §5.1：反查城主/領主/軍團長三表，共用同一次反向索引建置）。 */
export interface OfficerRole {
  lordOfCastleId: CastleId | null; // 反查 castles.lordId
  stewardOfDistrictId: DistrictId | null; // 反查 districts.stewardId（首筆；上限見 fiefCapOf）
  corpsLeaderOfCorpsId: CorpsId | null; // 反查 corps.corpsLeaderId
}

export function officerRole(
  state: GameState,
  cache: DerivedCache,
  officerId: OfficerId,
): OfficerRole {
  return getOrCompute(cache, `officerRole:${officerId}`, () => {
    let lordOfCastleId: CastleId | null = null;
    for (const castle of Object.values<Castle>(state.castles)) {
      if (castle.lordId === officerId) {
        lordOfCastleId = castle.id;
        break;
      }
    }
    let stewardOfDistrictId: DistrictId | null = null;
    for (const district of Object.values<District>(state.districts)) {
      if (district.stewardId === officerId) {
        stewardOfDistrictId = district.id;
        break;
      }
    }
    let corpsLeaderOfCorpsId: CorpsId | null = null;
    for (const corps of Object.values(state.corps)) {
      if (corps.corpsLeaderId === officerId) {
        corpsLeaderOfCorpsId = corps.id;
        break;
      }
    }
    return { lordOfCastleId, stewardOfDistrictId, corpsLeaderOfCorpsId };
  });
}

/** 軍團轄下城（反查 `castles` 中 `corpsId = corpsId` 者；02 §5.1）。 */
export function corpsCastles(state: GameState, cache: DerivedCache, corpsId: CorpsId): CastleId[] {
  return getOrCompute(cache, `corpsCastles:${corpsId}`, () => {
    const result: CastleId[] = [];
    for (const castle of Object.values<Castle>(state.castles)) {
      if (castle.corpsId === corpsId) result.push(castle.id);
    }
    return result;
  });
}

// ═══════════════════════════════════════════════════════════════════
// 反向索引：載入時建立，永不失效（02 §5.1；M1 不經 cache，見檔頭裁決）
// ═══════════════════════════════════════════════════════════════════

/** 國轄下城（反查 `castles` 中 `provinceId = provinceId` 者；02 §5.1）。 */
export function provinceCastles(state: GameState, provinceId: ProvinceId): CastleId[] {
  const result: CastleId[] = [];
  for (const castle of Object.values<Castle>(state.castles)) {
    if (castle.provinceId === provinceId) result.push(castle.id);
  }
  return result;
}

/** 地圖節點鄰接表項（02 §5.1 `adjacency`：由 `roads` 建 `Map<MapNodeId, {edge,other}[]>`）。 */
export interface AdjacencyEntry {
  edge: RoadEdgeId;
  other: MapNodeId;
}

/** 節點鄰接表（02 §5.1；無向圖——每條 `RoadEdge` 對 a/b 雙向各記一筆）。供 04 尋路使用。 */
export function adjacency(state: GameState): Map<MapNodeId, AdjacencyEntry[]> {
  const map = new Map<MapNodeId, AdjacencyEntry[]>();
  const addEntry = (from: MapNodeId, to: MapNodeId, edge: RoadEdgeId): void => {
    const list = map.get(from) ?? [];
    list.push({ edge, other: to });
    map.set(from, list);
  };
  for (const road of Object.values(state.roads)) {
    addEntry(road.a, road.b, road.id);
    addEntry(road.b, road.a, road.id);
  }
  return map;
}

// ═══════════════════════════════════════════════════════════════════
// 18-roadmap M1-10 範例子集：castle→districts、clan→castles（不經 cache）
// ═══════════════════════════════════════════════════════════════════

/** 城轄下郡（解析 `Castle.districtIds` 為完整 `District[]`；不存在之城回傳空陣列）。 */
export function getCastleDistricts(state: GameState, castleId: CastleId): District[] {
  const castle = state.castles[castleId];
  if (!castle) return [];
  const result: District[] = [];
  for (const districtId of castle.districtIds) {
    const district = state.districts[districtId];
    if (district) result.push(district);
  }
  return result;
}

/** 勢力所有城（反查 `castles` 中 `ownerClanId = clanId` 者；`Clan` 本身不持有城清單）。 */
export function getClanCastles(state: GameState, clanId: ClanId): Castle[] {
  const result: Castle[] = [];
  for (const castle of Object.values<Castle>(state.castles)) {
    if (castle.ownerClanId === clanId) result.push(castle);
  }
  return result;
}

/** M3 收支預覽（05 §3.1.5）：純函式，不修改狀態。 */
export interface BudgetForecast {
  goldIncomeMonthly: number;
  goldUpkeepMonthly: number;
  goldNetMonthly: number;
  salaryMonthly: number;
  policyUpkeepMonthly: number;
  foodUpkeepMonthly: number;
  harvestForecast: number;
  foodStock: number;
  foodMonthsLeft: number;
}

export function selectBudgetForecast(state: Readonly<GameState>, clanId: ClanId): BudgetForecast {
  let salaryMonthly = 0;
  for (const officer of Object.values(state.officers)) {
    if (officer.clanId === clanId) salaryMonthly += officerSalary(state, officer);
  }
  const policyUpkeepMonthly = policyUpkeep(state, clanId);
  const goldIncomeMonthly = monthlyGoldIncome(state, clanId);
  let foodUpkeepMonthly = 0;
  let harvestForecast = 0;
  let foodStock = 0;
  for (const castle of Object.values(state.castles)) {
    if (castle.ownerClanId !== clanId) continue;
    foodUpkeepMonthly += garrisonFoodMonthly(state, castle);
    harvestForecast += castleHarvest(state, castle.id);
    foodStock += castle.food;
  }
  for (const army of Object.values(state.armies)) {
    if (army.clanId === clanId)
      foodUpkeepMonthly += army.soldiers * BAL.fieldFoodPerSoldierDaily * 30;
  }
  const goldUpkeepMonthly = salaryMonthly + policyUpkeepMonthly;
  return {
    goldIncomeMonthly,
    goldUpkeepMonthly,
    goldNetMonthly: goldIncomeMonthly - goldUpkeepMonthly,
    salaryMonthly,
    policyUpkeepMonthly,
    foodUpkeepMonthly,
    harvestForecast,
    foodStock,
    foodMonthsLeft: foodUpkeepMonthly > 0 ? Math.floor(foodStock / foodUpkeepMonthly) : Infinity,
  };
}

// ═══════════════════════════════════════════════════════════════════
// selectMiniMapModel（M2-18；12-ui-components.md §3.2.12／§4／§5.5；純函式）
// ═══════════════════════════════════════════════════════════════════
//
// 12 §4：「MiniMap 底圖模型——由 selectMiniMapModel(state) 產生（純函式，位於 core selector）」。
// 型別 `MiniMapModel` 依 12 §4 之說明本應收錄於 `src/ui/components/types.ts`，但該形狀由 core
// 產生，core 不得 import UI 層型別（eslint 邊界規則 1）；故型別亦定義於本檔（唯一真相來源），
// `types.ts` 僅 `export type { MiniMapModel }` 轉出，供 UI 元件從單一位置 import（與該檔既有
// 「遊戲實體型別一律 import 自 02」慣例同構——此處是「衍生模型一律 import 自本 selector」）。

/** MiniMap 底圖上的一個標記點：世界座標＋owner 勢力色索引（無主／查無勢力為 null）。 */
export interface MiniMapPoint {
  x: number;
  y: number;
  colorIndex: number | null;
}

/** MiniMap 底圖模型（12 §4）：日本輪廓＋城/部隊標記＋版本號。 */
export interface MiniMapModel {
  /** 日本陸地輪廓多邊形（世界座標，來源 `src/data/map/japan-outline.json`，04 §3.3）。 */
  outline: readonly (readonly { x: number; y: number }[])[];
  /** 每城：位置與現任 owner 之 colorIndex。 */
  castles: readonly MiniMapPoint[];
  /** 出陣中部隊：位置（沿行軍邊線性內插，04 §3.4.2）與 colorIndex。 */
  armies: readonly MiniMapPoint[];
  /** 狀態版本號：MiniMap 以此判斷底圖是否需重繪（以絕對日 `state.time.day` 充當——歸屬變動
   *  必發生於某日的 tick 處理內，故「日變動」為「歸屬變動」的保守超集，簡單且決定論；
   *  M1 從簡精神同本檔既有選擇，見檔頭裁決）。 */
  version: number;
}

let cachedMiniMapOutline: readonly (readonly { x: number; y: number }[])[] | null = null;

/** 解析並快取 `japan-outline.json`（04 §3.3.1 扁平座標陣列）為點物件陣列，供 MiniMap 底圖繪製。 */
function miniMapOutline(): readonly (readonly { x: number; y: number }[])[] {
  if (cachedMiniMapOutline === null) {
    const file = zJapanOutlineFile.parse(outlineJson);
    cachedMiniMapOutline = file.polygons.map((poly) => {
      const points: { x: number; y: number }[] = [];
      for (let i = 0; i < poly.points.length; i += 2) {
        const x = poly.points[i];
        const y = poly.points[i + 1];
        if (x === undefined || y === undefined) continue; // 不可能發生：zod 已保證偶數長度
        points.push({ x, y });
      }
      return points;
    });
  }
  return cachedMiniMapOutline;
}

/** owner 勢力色索引（無主／勢力不存在時 null；MiniMap 以中性色呈現）。 */
function miniMapColorIndex(state: GameState, clanId: ClanId | null | undefined): number | null {
  if (clanId == null) return null;
  return state.clans[clanId]?.colorIndex ?? null;
}

/** 節點世界座標（依 `MapNodeId` 前綴查城或郡；查無則 null，04 §4.1 `MapNodeId = CastleId | DistrictId`）。 */
function miniMapNodePos(state: GameState, nodeId: MapNodeId): { x: number; y: number } | null {
  const castle = state.castles[nodeId as CastleId];
  if (castle !== undefined) return castle.pos;
  const district = state.districts[nodeId as DistrictId];
  if (district !== undefined) return district.pos;
  return null;
}

/**
 * 部隊世界座標（04 §3.4.2：「渲染層以 edgeProgressDays/edgeCostDays 線性內插畫部隊位置」）。
 * 已抵終點（`pathCursor` 為 `path` 末項）或無法解析下一節點時，直接回傳 `posNodeId` 座標。
 */
function armyWorldPos(state: GameState, army: Army): { x: number; y: number } {
  const from = miniMapNodePos(state, army.posNodeId) ?? { x: 0, y: 0 };
  const nextId = army.path[army.pathCursor + 1];
  if (nextId === undefined || army.edgeCostDays <= 0) return from;
  const to = miniMapNodePos(state, nextId);
  if (to === null) return from;
  const t = Math.min(1, Math.max(0, army.edgeProgressDays / army.edgeCostDays));
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}

/**
 * MiniMap 底圖模型（12 §3.2.12／§4／§5.5；純函式，不經 `DerivedCache`——計算成本為
 * O(城數+部隊數)，M2 子集規模下可忽略，且結果本就每次呼叫皆需要新陣列供 UI 淺比較差異）。
 */
export function selectMiniMapModel(state: GameState): MiniMapModel {
  const castleIds = Object.keys(state.castles).sort() as CastleId[];
  const castles: MiniMapPoint[] = castleIds.map((id) => {
    const castle = state.castles[id] as Castle;
    return {
      x: castle.pos.x,
      y: castle.pos.y,
      colorIndex: miniMapColorIndex(state, castle.ownerClanId),
    };
  });

  const armyIds = Object.keys(state.armies).sort() as ArmyId[];
  const armies: MiniMapPoint[] = armyIds.map((id) => {
    const army = state.armies[id] as Army;
    const pos = armyWorldPos(state, army);
    return { x: pos.x, y: pos.y, colorIndex: miniMapColorIndex(state, army.clanId) };
  });

  return { outline: miniMapOutline(), castles, armies, version: state.time.day };
}

// ═══════════════════════════════════════════════════════════════════
// 地圖靜態／動態視圖（04 §4.6；M2-19 接線——MainScreen 掛 MapCanvasHost 顯示地圖；
// [M6-V4] 全量補齊至 04 §4.6 canonical——見 plan/18-roadmap.md M6-V4、
// plan/04-map-and-movement.md §8 2026-07-17 條目）
// ═══════════════════════════════════════════════════════════════════
//
// 型別刻意獨立於 `src/ui/map/mapViewTypes.ts`（core 不得 import UI 層，同 `MiniMapModel` 上方
// 檔頭裁決同一取捨）；兩者欄位形狀一致（UI 側以 `type` 別名複用本檔匯出型別，只在邊界補
// `selected`／`selection`，見 04 §8 [M6-V4] D7），呼叫端（`src/app/boot.ts`／`MainScreen.tsx`）
// 以結構相容直接指派給 `MapStaticData`/`MapViewState`。`outline` 欄位不在此提供——`MapRenderer`
// 未收到覆蓋值時自帶 `japan-outline.json`（`mapDraw.loadOutline`），故省略。
//
// 開局後城∪郡∪街道拓樸不變（僅 owner 會變動），`selectMapStaticModel` 呼叫端只需計算一次
// （見 `src/app/boot.ts` 建局處），不比照 `clanKokudaka` 等經 `DerivedCache` 逐 tick memo。
//
// [M6-V4] 新欄位一律「攜帶不消費」（硬約束①：視覺輸出不得改變）：`terrainKind`（V4 恆 'plain'，
// 真實資料 V7／14）、`warning`（V4 由圍城推導，語意完整依賴的 09 AI 威脅評估未實作）、
// `battles[]`（消費見 V8／V10）、`analysisMode`（V4 恆 'none'，消費見 V10）；`selection`／
// `armies[].selected` 刻意不在 core 契約內（D7：core selector 不吃 UI selection 型別，由 UI 邊界
// `composeMapViewState` 併入）。

/**
 * 道路顯示欄位查表（依 edge id；[M6-V4] D1，[M6-V6] 擴入 `bridges`＋scenario 分派）：回傳純顯示欄位
 * （`name`／`waypoints`／`bridges`）之表，只在 `selectMapStaticModel` 併入 transient `MapGraph.edges`
 * （`MapRoadEdge`），不寫回 `GameState`，不影響 golden hash。
 *
 * scenario 分派（設計 §4.2／V6D9）：
 *   - `debug-visual-map-01`（visual fixture）→ 回 `DEBUG_VISUAL_ROAD_DISPLAY`（純資料葉模組；
 *     不拉進 `debugVisual.ts` 整個建構器）。
 *   - 其餘（v1.0 唯一真實劇本 `s1560`）→ 直讀 `roads.json` 原始資料＋zod 解析。
 * 兩者皆以 scenarioId 為鍵做模組級快取（比照 `miniMapOutline()` 之 outline 直讀先例）。
 * `buildMapGraph` 只對呼叫端傳入之 `state.roads` 內存在的 edge id 查表，被 region 篩掉的
 * edge 天然不會命中，不會洩漏未載入地方的顯示資料。
 *
 * export（[M6-V6] 處置 spec-F6）：測試計畫直接以 scenarioId 呼叫驗證分派。
 */
type RoadDisplayTable = Readonly<
  Record<string, { name?: string; waypoints?: readonly number[]; bridges?: readonly number[] }>
>;

/** visual fixture scenario id（`debugVisual.ts` 之 `DEBUG_VISUAL_MAP_ID`；此處以字面量避免拉進重量級 fixture 建構器）。 */
const DEBUG_VISUAL_SCENARIO_ID = 'debug-visual-map-01';

const cachedRoadDisplay = new Map<string, RoadDisplayTable>();

export function roadDisplayLookup(scenarioId: string): RoadDisplayTable {
  const cached = cachedRoadDisplay.get(scenarioId);
  if (cached !== undefined) return cached;
  let table: RoadDisplayTable;
  if (scenarioId === DEBUG_VISUAL_SCENARIO_ID) {
    table = DEBUG_VISUAL_ROAD_DISPLAY;
  } else {
    const file = zRoadsFile.parse(roadsJson);
    const out: Record<
      string,
      { name?: string; waypoints?: readonly number[]; bridges?: readonly number[] }
    > = {};
    for (const r of file.edges) {
      if (r.name !== undefined || r.waypoints !== undefined || r.bridges !== undefined) {
        out[r.id] = {
          ...(r.name !== undefined ? { name: r.name } : {}),
          ...(r.waypoints !== undefined ? { waypoints: r.waypoints } : {}),
          ...(r.bridges !== undefined ? { bridges: r.bridges } : {}),
        };
      }
    }
    table = out;
  }
  cachedRoadDisplay.set(scenarioId, table);
  return table;
}

/**
 * 城型顯示欄位查表（依 castle id；[M6-V7] CD3）：回傳純顯示欄位 `terrainKind`（'plain'|'mountain'）之表，
 * 供 `selectMapViewModel` 之 `castles[].terrainKind` 取代 V4/V5 佔位，不寫回 `GameState`，不影響 golden hash
 * （builder.ts 刻意不搬 terrainKind，見該檔 castles.map 註解）。
 *
 * scenario 分派（比照 `roadDisplayLookup`）：
 *   - `debug-visual-map-01`（visual fixture）→ 回 `DEBUG_VISUAL_CASTLE_TERRAIN`（純資料葉模組；
 *     不拉進 `debugVisual.ts` 整個建構器）。
 *   - 其餘（v1.0 唯一真實劇本 `s1560`）→ 直讀 `castles.json` 原始資料＋zod 解析（terrainKind 有 `.default('plain')`）。
 * 兩者皆以 scenarioId 為鍵做模組級快取（比照 `roadDisplayLookup`／`miniMapOutline`）。查無城 id 之呼叫端
 * 於 `selectMapViewModel` 以 `?? 'plain'` 補平城（如 tiny/mini 測試劇本之城 id 不在 s1560 表中）。
 */
type CastleTerrainTable = Readonly<Record<string, 'plain' | 'mountain'>>;

const cachedCastleTerrain = new Map<string, CastleTerrainTable>();

export function castleTerrainLookup(scenarioId: string): CastleTerrainTable {
  const cached = cachedCastleTerrain.get(scenarioId);
  if (cached !== undefined) return cached;
  let table: CastleTerrainTable;
  if (scenarioId === DEBUG_VISUAL_SCENARIO_ID) {
    table = DEBUG_VISUAL_CASTLE_TERRAIN;
  } else {
    const file = zCastlesFile.parse(castlesJson);
    const out: Record<string, 'plain' | 'mountain'> = {};
    for (const c of file) {
      out[c.id] = c.terrainKind;
    }
    table = out;
  }
  cachedCastleTerrain.set(scenarioId, table);
  return table;
}

/** 地圖（04 §4.6 `MapStaticData`）靜態資料：城∪郡節點圖＋勢力色索引＋城格＋顯示名＋國名標籤位置。 */
export interface MapStaticModel {
  graph: MapGraph;
  clanColorIndex: Record<string, number>;
  /** 城格（保留：命中半徑等 UI 互動用；渲染另見 `castles[].tier`，[M6-V4] D2）。 */
  castleTier: Record<string, CastleTier>;
  /** nodeId／clanId／provinceId → 顯示名（04 §4.6；provinceId 為超集擴充，見 §8 [M6-V4]）。 */
  names: Record<string, string>;
  /** provinceId → 國名標籤渲染座標（04 §4.6；= `Province.labelPos`）。 */
  provinceLabelPos: Record<string, { x: number; y: number }>;
}

export function selectMapStaticModel(state: GameState): MapStaticModel {
  const graph = buildMapGraph(
    state.castles,
    state.districts,
    state.roads,
    roadDisplayLookup(state.meta.scenarioId),
  );
  const clanColorIndex: Record<string, number> = {};
  for (const clan of Object.values<Clan>(state.clans)) {
    clanColorIndex[clan.id] = clan.colorIndex;
  }
  const castleTier: Record<string, CastleTier> = {};
  const names: Record<string, string> = {};
  for (const castle of Object.values<Castle>(state.castles)) {
    castleTier[castle.id] = castle.tier;
    names[castle.id] = castle.name;
  }
  for (const district of Object.values<District>(state.districts)) {
    names[district.id] = district.name;
  }
  for (const clan of Object.values<Clan>(state.clans)) {
    names[clan.id] = clan.name; // 勢力名（V9/V10 消費）
  }
  const provinceLabelPos: Record<string, { x: number; y: number }> = {};
  for (const province of Object.values<Province>(state.provinces)) {
    names[province.id] = province.name;
    provinceLabelPos[province.id] = province.labelPos;
  }
  return { graph, clanColorIndex, castleTier, names, provinceLabelPos };
}

/** 地圖節點（城）動態視圖（04 §4.6 `MapViewState.castles[]`；[M6-V4]）。 */
export interface MapCastleViewModel {
  id: CastleId;
  ownerClanId: ClanId;
  durability: number;
  maxDurability: number;
  tier: CastleTier;
  /** 地形種類：V4 恆 `'plain'`（佔位，攜帶不消費）；真實資料見 M6-V7／14（[M6-V4] D3）。 */
  terrainKind: 'plain' | 'mountain';
  /** 圍城狀態：由 `state.sieges` 反查（一城至多一場進行中 Siege，02 §4.10）。 */
  siegeMode: 'none' | 'encircle' | 'assault';
  /** 警示：由 `siegeMode` 推導（[M6-V4] D4；`threatened` 完整語意依賴未實作的 09 AI 威脅評估）。 */
  warning: 'none' | 'threatened' | 'critical';
}

/**
 * 郡節點次級狀態動態視圖（[M6-V7] AD1）：`districtNode` 需知行／制壓／一揆次級狀態，而 `MapViewState`
 * 既有欄位僅有 `districtOwner`（單一 owner 真相）。本 view-model 只補次級狀態，郡填色仍取 `districtOwner`。
 * golden 安全（純 view-model；fixture／s1560 開局 steward/subjugation/uprising 多為 null → baseline 無差異）。
 */
export interface MapDistrictViewModel {
  id: DistrictId;
  /** 是否已置領主（知行受封）：= `District.stewardId !== null`。 */
  hasSteward: boolean;
  /** 制壓進度 0..100；無人制壓時 null：= `District.subjugation?.progress ?? null`。 */
  subjugationProgress: number | null;
  /** 是否一揆中：= `District.uprising !== null`。 */
  ikkiActive: boolean;
}

/** 出陣部隊動態視圖（04 §4.6 `MapViewState.armies[]`；[M6-V4]）。座標無關——內插參數交給 renderer（D6）。 */
export interface MapArmyViewModel {
  id: string;
  clanId: string;
  soldiers: number;
  status: ArmyStatus;
  morale: number;
  /** 存糧可維持天數（顯示值，V4 不消費）：公式與 `military.ts` autoReturn 判定同一式
   *  （`BAL.fieldFoodPerSoldierDaily`；不新增 BAL 常數，硬約束③）。 */
  foodDays: number;
  mission: ArmyMission;
  /** = `army.posNodeId`（最近抵達節點）。 */
  fromNode: MapNodeId;
  /** = `army.path[pathCursor+1]`；已抵終點為 `null`。 */
  toNode: MapNodeId | null;
  /** 邊上內插比例 0..1；`edgeCostDays<=0` 時為 0。 */
  edgeT: number;
  /** 軍團底線（UI 擴充）：`army.corpsId !== null`。 */
  corps: boolean;
}

/** 圍城動態視圖（擴充，驅動既有 `SiegeMarker` 視覺；[M6-V4] D5）。 */
export interface MapSiegeViewModel {
  id: string;
  /** 位置靜態（= 被圍城 `pos`），selector 直接給值（D6）。 */
  pos: { x: number; y: number };
  mode: SiegeMode;
}

/** 交戰動態視圖（04 §4.6 canonical `battles[]`；[M6-V4] D5：與擴充 `sieges[]` 並存，V4 不消費）。 */
export interface MapBattleViewModel {
  nodeOrEdgeId: string;
  kind: 'field' | 'siege';
}

/** 地圖（04 §4.6 `MapViewState`）每 tick 動態視圖：[M6-V4] 全量補齊至 canonical。 */
export interface MapViewModel {
  day: number;
  /** 04 canonical 放寬為 `| null`（[M6-V4] D2；s1560 資料值恆非 null）。 */
  districtOwner: Record<string, string | null>;
  castles: MapCastleViewModel[];
  /** 郡次級狀態（[M6-V7] AD1；依 id 字典序）。owner 仍取 `districtOwner`，本欄僅補知行／制壓／一揆。 */
  districts: MapDistrictViewModel[];
  armies: MapArmyViewModel[];
  /** 擴充：驅動現有 `SiegeMarker`（D5）。 */
  sieges: MapSiegeViewModel[];
  /** canonical 04 §4.6；V4 攜帶不消費（消費見 V8/V10）。 */
  battles: MapBattleViewModel[];
  /** V4 恆 `'none'`（消費見 V10）。 */
  analysisMode:
    'none' | 'faction' | 'supply' | 'roadCapacity' | 'terrainAdvantage' | 'castleDefense';
  // selection 與 armies[].selected 刻意不在此——由 UI 邊界 composeMapViewState 併入（D7）。
}

export function selectMapViewModel(state: GameState): MapViewModel {
  // 1. districtOwner（放寬 | null，[M6-V4] D2）。
  const districtOwner: Record<string, string | null> = {};
  for (const district of Object.values<District>(state.districts)) {
    districtOwner[district.id] = district.ownerClanId;
  }

  // 1b. 城型顯示查表（[M6-V7] CD3；scenario 分派，view 邊界注入，不進 GameState）。
  const terrain = castleTerrainLookup(state.meta.scenarioId);

  // 2. 圍城反查表：castleId → SiegeMode（一城至多一場進行中 Siege，02 §4.10 單勢力聯攻）。
  const siegeModeByCastle = new Map<CastleId, SiegeMode>();
  for (const siege of Object.values<Siege>(state.sieges)) {
    siegeModeByCastle.set(siege.castleId, siege.mode);
  }

  // 3. castles[]（依 id 字典序，決定論）。
  const castles: MapCastleViewModel[] = (Object.keys(state.castles).sort() as CastleId[]).map(
    (id) => {
      const c = state.castles[id] as Castle;
      const siegeMode: MapCastleViewModel['siegeMode'] = siegeModeByCastle.get(id) ?? 'none';
      const warning: MapCastleViewModel['warning'] =
        siegeMode === 'assault' ? 'critical' : siegeMode === 'encircle' ? 'threatened' : 'none';
      return {
        id: c.id,
        ownerClanId: c.ownerClanId,
        durability: c.durability,
        maxDurability: c.maxDurability,
        tier: c.tier,
        terrainKind: terrain[id] ?? 'plain', // [M6-V7] CD3：真值取自 castleTerrainLookup（取代 V4 佔位）
        siegeMode,
        warning,
      };
    },
  );

  // 3b. districts[]（次級狀態，依 id 字典序；[M6-V7] AD1）。owner 仍走 districtOwner。
  const districts: MapDistrictViewModel[] = (
    Object.keys(state.districts).sort() as DistrictId[]
  ).map((id) => {
    const d = state.districts[id] as District;
    return {
      id: d.id,
      hasSteward: d.stewardId !== null,
      subjugationProgress: d.subjugation?.progress ?? null,
      ikkiActive: d.uprising !== null,
    };
  });

  // 4. armies[]（依 id 字典序）——座標無關，只給 renderer 端內插參數（D6）。
  const armies: MapArmyViewModel[] = (Object.keys(state.armies).sort() as ArmyId[]).map((id) => {
    const a = state.armies[id] as Army;
    const toNode = a.path[a.pathCursor + 1] ?? null;
    const edgeT =
      a.edgeCostDays <= 0 ? 0 : Math.min(1, Math.max(0, a.edgeProgressDays / a.edgeCostDays));
    // foodDays：與 military.ts autoReturn 判定（L745-747）同一公式；BAL.fieldFoodPerSoldierDaily
    // 沿用既有常數，不新增 BAL（硬約束③）。此為顯示值，V4 不消費，不影響 golden。
    const foodDays =
      a.soldiers > 0
        ? a.food / Math.max(1, Math.ceil(a.soldiers * BAL.fieldFoodPerSoldierDaily))
        : 0;
    return {
      id: a.id,
      clanId: a.clanId,
      soldiers: a.soldiers,
      status: a.status,
      morale: a.morale,
      foodDays,
      mission: a.mission,
      fromNode: a.posNodeId,
      toNode,
      edgeT,
      corps: a.corpsId !== null,
    };
  });

  // 5. sieges[]（擴充，pos = castle.pos；D6）。
  const sieges: MapSiegeViewModel[] = (Object.keys(state.sieges).sort() as SiegeId[]).flatMap(
    (id) => {
      const s = state.sieges[id] as Siege;
      const castle = state.castles[s.castleId];
      return castle === undefined ? [] : [{ id: s.id, pos: castle.pos, mode: s.mode }];
    },
  );

  // 6. battles[]（canonical；FieldCombat + Siege 位置與種類，依 id 字典序；D5）。
  const battles: MapBattleViewModel[] = [
    ...Object.keys(state.fieldCombats)
      .sort()
      .map((id) => ({
        nodeOrEdgeId: (state.fieldCombats[id] as FieldCombat).nodeId,
        kind: 'field' as const,
      })),
    ...Object.keys(state.sieges)
      .sort()
      .map((id) => ({
        nodeOrEdgeId: (state.sieges[id as SiegeId] as Siege).castleId,
        kind: 'siege' as const,
      })),
  ];

  return {
    day: state.time.day,
    districtOwner,
    castles,
    districts,
    armies,
    sieges,
    battles,
    analysisMode: 'none',
  };
}
