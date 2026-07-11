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
import { RANK_VALUES, type Rank, type Season } from './enums';
import type { DerivedCache } from './derivedCache';
import { getOrCompute } from './derivedCache';
import type { Castle, District, GameState } from './gameState';
import type {
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
