// MapGraph：城∪郡節點圖＋街道鄰接表（載入時建立的唯讀 transient 結構，整局不變）。
// 規格：plan/04-map-and-movement.md §4.1（MapGraph/MapGraphNode 型別）、§5.1（buildMapGraph 演算法：
// 依 edgeId 字典序處理邊以確保鄰接表決定論、BFS 全圖連通性驗證）；02 §4.7（RoadEdge 型別最終歸屬）、
// §5.1（「adjacency 為載入時建立的 transient 衍生結構，永不失效」——本結構不進 GameState，
// 不可 JSON 序列化，不影響 golden hash／存檔，02 §3.4 純度原則）；18-roadmap.md M2-6（04-T3；
// 驗收：連通性違規報錯並指出邊 id）。
//
// 依賴投影：本檔只消費 Castle/District 的地圖相關欄位（id/pos，郡另需 isPort/castleId），
// 以 `Pick<>` narrow 型別宣告輸入，與完整 02 §4.5/§4.6 實體解耦——呼叫端可直接傳入
// `GameState.castles`/`districts`/`roads`（結構相容），測試亦可用最小 fixture 而不必構造完整實體。

import type { Castle, District, RoadEdge } from './gameState';
import type { CastleId, DistrictId, MapNodeId, RoadEdgeId } from './ids';

/** buildMapGraph 所需的城最小欄位投影（M2-6：MapGraphNode 只取 pos，城節點恆 isPort=false）。 */
export type CastleNodeInput = Pick<Castle, 'id' | 'pos'>;

/** buildMapGraph 所需的郡最小欄位投影（M2-6：另需 isPort/castleId 供 MapGraphNode 收錄）。 */
export type DistrictNodeInput = Pick<District, 'id' | 'pos' | 'isPort' | 'castleId'>;

/** 地圖節點（04 §4.1，逐字對照）。 */
export interface MapGraphNode {
  id: MapNodeId;
  kind: 'castle' | 'district';
  /** 世界座標（world unit，整數）。 */
  pos: { x: number; y: number };
  /** 郡節點限定：是否港郡（海路端點資格）。城節點恆 false。 */
  isPort: boolean;
  /** 郡節點限定：所屬城。 */
  castleId?: CastleId;
}

/**
 * `MapGraph.edges` 專用的 runtime 邊型別（transient；只在 `MapGraph` 內存在，不進 `GameState`／
 * canonical `RoadEdge`——canonical 型別刻意不含純顯示欄位以避免進 `stateHash` 造成 golden 漂移，
 * [M6-V4] 裁決見 `plan/02-data-model.md` §8 2026-07-17）。
 */
export interface MapRoadEdge extends RoadEdge {
  /** 道路顯示名（'東海道' 等）；模擬/尋路不使用。來源：scenario roads 原始資料。V6 起 RoadsLayer 消費。 */
  readonly name?: string;
  /** 多段線 waypoints（偶數長度 x,y 交錯世界座標）；未提供時回退兩端點直線。V6 起 RoadsLayer 消費。 */
  readonly waypoints?: readonly number[];
  /** 橋面中心點（扁平 x,y,...；世界座標）；模擬不使用，roads 層繪製橋樑。來源：roadDisplay。V6 起 RoadsLayer 消費。 */
  readonly bridges?: readonly number[];
}

/** 載入劇本後建立的唯讀圖結構（04 §4.1），整局不變；transient，不進入 GameState。 */
export interface MapGraph {
  /** 節點查表。 */
  nodes: ReadonlyMap<MapNodeId, MapGraphNode>;
  /** 邊查表（含 name/waypoints 顯示欄位，見 `MapRoadEdge`；[M6-V4]）。 */
  edges: ReadonlyMap<RoadEdgeId, MapRoadEdge>;
  /** 鄰接表：nodeId → 與其相連的 RoadEdge id 陣列（依 edgeId 字典序，確保決定論；04 §4.1）。 */
  adjacency: ReadonlyMap<MapNodeId, readonly RoadEdgeId[]>;
}

/**
 * 由城／郡／街道資料建構 `MapGraph`（04 §5.1 `buildMapGraph` 演算法）。
 *
 * 違規（資料錯誤，非模擬期正常狀況）一律 throw，訊息含出錯的邊 id／未連通節點 id，
 * 便於資料除錯（M2-6 驗收：「連通性違規報錯並指出邊 id」）：
 * - 街道端點不存在於城／郡節點集合 → 指出該邊 id 與缺失的端點 id。
 * - 街道 `a === b`（自環）→ 指出該邊 id。
 * - 全圖（含海路）非單一連通分量 → 指出全部未連通節點 id，並列出這些節點所牽涉的邊 id
 *   （若某未連通節點完全無邊，則邊清單為空——代表該節點連一條街道都沒有）。
 *
 * 決定論：邊依 `id` 字典序處理，鄰接表內每個節點的邊 id 陣列因而保持字典序（04 §4.1／§5.1）。
 *
 * `roadDisplay`（[M6-V4] 新增，optional；[M6-V6] 擴入 `bridges`）：依 edge id 查表的純顯示欄位
 * （`name`／`waypoints`／`bridges`），缺省時 `edges` 的 value 與現況（純 `RoadEdge`）完全一致——
 * 連通性驗證、字典序鄰接表、錯誤訊息皆不受影響，只是 value 型別擴為 `MapRoadEdge`（多帶 optional 顯示欄位）。
 */
export function buildMapGraph(
  castles: Readonly<Record<CastleId, CastleNodeInput>>,
  districts: Readonly<Record<DistrictId, DistrictNodeInput>>,
  roads: Readonly<Record<RoadEdgeId, RoadEdge>>,
  roadDisplay?: Readonly<
    Record<string, { name?: string; waypoints?: readonly number[]; bridges?: readonly number[] }>
  >,
): MapGraph {
  const nodes = new Map<MapNodeId, MapGraphNode>();
  for (const castle of Object.values<CastleNodeInput>(castles)) {
    nodes.set(castle.id, { id: castle.id, kind: 'castle', pos: castle.pos, isPort: false });
  }
  for (const district of Object.values<DistrictNodeInput>(districts)) {
    nodes.set(district.id, {
      id: district.id,
      kind: 'district',
      pos: district.pos,
      isPort: district.isPort,
      castleId: district.castleId,
    });
  }

  // 依 edgeId 字典序處理（04 §5.1：「for e in roads.edges（依 e.id 字典序）」）。
  const sortedEdgeIds = (Object.keys(roads) as RoadEdgeId[]).sort();
  const edges = new Map<RoadEdgeId, MapRoadEdge>();
  const adjacencyBuild = new Map<MapNodeId, RoadEdgeId[]>();
  for (const nodeId of nodes.keys()) adjacencyBuild.set(nodeId, []);

  for (const edgeId of sortedEdgeIds) {
    const edge = roads[edgeId];
    if (edge === undefined) continue; // 不可能發生：edgeId 取自 Object.keys(roads)，僅滿足 noUncheckedIndexedAccess
    if (edge.a === edge.b) {
      throw new Error(`buildMapGraph: 街道 ${edgeId} 的端點 a/b 相同（${edge.a}）`);
    }
    if (!nodes.has(edge.a)) {
      throw new Error(`buildMapGraph: 街道 ${edgeId} 的端點 a=${edge.a} 不存在於城/郡節點`);
    }
    if (!nodes.has(edge.b)) {
      throw new Error(`buildMapGraph: 街道 ${edgeId} 的端點 b=${edge.b} 不存在於城/郡節點`);
    }
    // 併入純顯示欄位（[M6-V4]；缺表或該邊無顯示欄位時 disp 為 undefined，edge 原樣存入，
    // 與「不傳 roadDisplay」行為完全一致）。
    const disp = roadDisplay?.[edgeId];
    const merged: MapRoadEdge =
      disp === undefined
        ? edge
        : {
            ...edge,
            ...(disp.name !== undefined ? { name: disp.name } : {}),
            ...(disp.waypoints !== undefined ? { waypoints: disp.waypoints } : {}),
            ...(disp.bridges !== undefined ? { bridges: disp.bridges } : {}),
          };
    edges.set(edgeId, merged);
    adjacencyBuild.get(edge.a)?.push(edgeId);
    adjacencyBuild.get(edge.b)?.push(edgeId);
  }

  // 連通性驗證（04 §5.1：「驗證連通（BFS 自任一節點需達全部節點）」）；起點取字典序最小節點以求決定論。
  const nodeIds = [...nodes.keys()].sort();
  const startNode = nodeIds[0];
  if (startNode !== undefined) {
    const visited = new Set<MapNodeId>([startNode]);
    const stack: MapNodeId[] = [startNode];
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined) break;
      for (const edgeId of adjacencyBuild.get(current) ?? []) {
        const edge = edges.get(edgeId);
        if (!edge) continue;
        const other = edge.a === current ? edge.b : edge.a;
        if (!visited.has(other)) {
          visited.add(other);
          stack.push(other);
        }
      }
    }
    if (visited.size !== nodeIds.length) {
      const unreached = nodeIds.filter((id) => !visited.has(id));
      const unreachedSet = new Set(unreached);
      const involvedEdgeIds = sortedEdgeIds.filter((edgeId) => {
        const edge = edges.get(edgeId);
        return edge !== undefined && (unreachedSet.has(edge.a) || unreachedSet.has(edge.b));
      });
      const edgesNote =
        involvedEdgeIds.length > 0
          ? `涉及邊：${involvedEdgeIds.join(', ')}`
          : '未連通節點無任何街道邊相連';
      throw new Error(
        `buildMapGraph: 地圖節點圖不連通，未連通節點：${unreached.join(', ')}；${edgesNote}`,
      );
    }
  }

  const adjacency = new Map<MapNodeId, readonly RoadEdgeId[]>();
  for (const [nodeId, edgeIds] of adjacencyBuild) adjacency.set(nodeId, edgeIds);

  return { nodes, edges, adjacency };
}
