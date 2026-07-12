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
import { RANK_VALUES, type CastleTier, type Rank, type Season } from './enums';
import type { DerivedCache } from './derivedCache';
import { getOrCompute } from './derivedCache';
import { buildMapGraph, type MapGraph } from './mapGraph';
import type { Army, Castle, Clan, District, GameState } from './gameState';
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
} from './ids';
import { seasonOf } from '../systems/time';
import outlineJson from '../../data/map/japan-outline.json';
import { zJapanOutlineFile } from '../../data/schemas/outline';

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
// 地圖靜態／動態視圖（04 §4.6；M2-19 接線——MainScreen 掛 MapCanvasHost 顯示地圖）
// ═══════════════════════════════════════════════════════════════════
//
// 型別刻意獨立於 `src/ui/map/mapViewTypes.ts`（core 不得 import UI 層，同 `MiniMapModel` 上方
// 檔頭裁決同一取捨）；兩者欄位形狀一致，呼叫端（`src/app/boot.ts`／`MainScreen.tsx`）以結構相容
// 直接指派給 `MapStaticData`/`MapViewState`。`outline` 欄位不在此提供——`MapRenderer` 未收到覆蓋值
// 時自帶 `japan-outline.json`（`mapDraw.loadOutline`），故省略。
//
// 開局後城∪郡∪街道拓樸不變（僅 owner 會變動），`selectMapStaticModel` 呼叫端只需計算一次
// （見 `src/app/boot.ts` 建局處），不比照 `clanKokudaka` 等經 `DerivedCache` 逐 tick memo。

/** 地圖（04 §4.6 `MapStaticData` M2-13 子集）靜態資料：城∪郡節點圖＋勢力色索引＋城格。 */
export interface MapStaticModel {
  graph: MapGraph;
  clanColorIndex: Record<string, number>;
  castleTier: Record<string, CastleTier>;
}

export function selectMapStaticModel(state: GameState): MapStaticModel {
  const graph = buildMapGraph(state.castles, state.districts, state.roads);
  const clanColorIndex: Record<string, number> = {};
  for (const clan of Object.values<Clan>(state.clans)) {
    clanColorIndex[clan.id] = clan.colorIndex;
  }
  const castleTier: Record<string, CastleTier> = {};
  for (const castle of Object.values<Castle>(state.castles)) {
    castleTier[castle.id] = castle.tier;
  }
  return { graph, clanColorIndex, castleTier };
}

/** 地圖（04 §4.6 `MapViewState` M2-13 子集）每 tick 動態視圖：城／郡現任 owner。 */
export interface MapViewModel {
  day: number;
  districtOwner: Record<string, string>;
  castleOwner: Record<string, string>;
  selection: null;
}

export function selectMapViewModel(state: GameState): MapViewModel {
  const districtOwner: Record<string, string> = {};
  for (const district of Object.values<District>(state.districts)) {
    districtOwner[district.id] = district.ownerClanId;
  }
  const castleOwner: Record<string, string> = {};
  for (const castle of Object.values<Castle>(state.castles)) {
    castleOwner[castle.id] = castle.ownerClanId;
  }
  return { day: state.time.day, districtOwner, castleOwner, selection: null };
}
