// 尋路 computePath：單源 Dijkstra，決定論 tie-break（M2-7）。
// 規格：plan/04-map-and-movement.md §4.3（PathQuery/PathResult API，逐字對照）、
//   §5.2（computePath 演算法：邊權/雙態節點登船成本/決定論 tie-break）、
//   §3.5（通行規則 canonical 表）、§3.6（Dijkstra 決策摘要）、§3.8（制壓日數公式）、
//   §5.8（本檔用到之 BAL 常數建議值，定案見 plan/15-balance.md §5.1）；
//   18-roadmap.md M2-7（04-T4，提前至 M2，見 04 §8-D2／roadmap §8-D2）。
//
// 【依賴缺口與實作決策（已回寫 plan/04-map-and-movement.md §8 D12）】
// 04 §3.5／§5.2 的通行規則依賴 `getStance(mover, owner)`（文中標注「參見 plan/08-diplomacy.md」），
// 但 08 的系統模組（`src/core/systems/diplomacy.ts`）明文「留待 M6 實作」；而本檔（M2-7）與日後
// 07 行軍每日通行重驗（M4，§3.5「每日在移動前重新驗證」）皆早於 M6 即需要此判定，且 04-T4
// 驗收明文要求「敵城僅可為終點；停戰領不可入」。08 §3.1（atWar 衍生定義）／§5.3.4
// （canAttack/canPass 純謂詞）已完整指定判定邏輯，且僅需讀取 02 §4.11 GameState.diplomacy
// （M1 已完成之型別基座），不需要 08 的月結算／提案／信用系統。故本檔就地實作最小 `getStance`
// （見下），依 08 §3.1／§3.5.4 逐字對照，不 import 尚未實作的 `systems/diplomacy.ts`。
// M6 08 落地時應將本檔判定與 08 收斂為單一實作（08 re-export 本檔，或反之），避免邏輯分裂。
//
// 【型別投影】比照 `state/mapGraph.ts` 慣例：computePath 只讀 GameState 的
// castles／districts／diplomacy／time 四個子樹，以 `PathfindingState = Pick<GameState, ...>`
// narrow 宣告，測試可用最小 fixture、呼叫端可直接傳入完整 GameState（結構相容）。
//
// 【制壓日數估算簡化】§3.8 公式含「大將統率 ≥ threshold ? −1 : 0」之名將加速項；`PathQuery`
// 未帶任何武將資訊（路徑預覽當下尚未指派/確定實際帶隊大將），故 `estimateSubjugateDays` 略去
// 此項（等同保守估計，不预支未定的加速）；日後 07 制壓實際開始時另以真實大將重算並快取
// 於 `District.subjugation.daysRequired`（04 §3.8，Army 側不存）。

import { BAL } from '../balance';
import type { RoadKind } from '../state/enums';
import type { DiplomacyRow, GameState, RoadEdge } from '../state/gameState';
import type {
  CastleId,
  ClanId,
  ClanPairKey,
  DistrictId,
  MapNodeId,
  RoadEdgeId,
} from '../state/ids';
import type { MapGraph, MapGraphNode } from '../state/mapGraph';
import { DAYS_PER_MONTH } from './time';

/** computePath 所需的最小 GameState 投影（見檔頭「型別投影」）。 */
export type PathfindingState = Pick<GameState, 'castles' | 'districts' | 'diplomacy' | 'time'>;

/** 尋路查詢（04 §4.3，逐字對照）。 */
export interface PathQuery {
  /** 行軍勢力（決定通行規則）。 */
  clanId: ClanId;
  from: MapNodeId;
  to: MapNodeId;
  /** 部隊速度係數（04 §5.3；預覽時可用 1.0 估算或傳入實際部隊值）。 */
  speedFactor: number;
}

/** 尋路結果（04 §4.3，逐字對照）。 */
export interface PathResult {
  found: boolean;
  /** 節點序列（含首尾）；found=false 時為空陣列。 */
  nodes: MapNodeId[];
  /** 對應的邊 id 序列（長度 = nodes.length - 1）。 */
  edgeIds: RoadEdgeId[];
  /** 純行軍日數（不含制壓）。 */
  travelDays: number;
  /** 預估制壓總日數。 */
  subjugateDays: number;
  /** travelDays + subjugateDays，四捨五入至 0.5 日。 */
  totalDays: number;
  /** 逐節點明細：抵達該節點的累計日數（含此前沿途制壓延遲）與是否需制壓。 */
  steps: { nodeId: MapNodeId; etaDays: number; needsSubjugate: boolean }[];
}

// ═══════════════════════════════════════════════════════════════════
// 外交立場判定（見檔頭「依賴缺口與實作決策」；08 §3.1／§3.5.4 對照）
// ═══════════════════════════════════════════════════════════════════

/** 通行規則用之外交立場（04 §3.5 canonical 表；'friendly' 合併同盟/婚姻/從屬——三者對
 * 通行規則效果相同，見該表列）。 */
export type Stance = 'own' | 'friendly' | 'war' | 'ceasefire' | 'neutral';

/** 無向勢力對 key（08 §5.5 pairKey；02 §4.11）。 */
function pairKey(a: ClanId, b: ClanId): ClanPairKey {
  return (a < b ? `${a}|${b}` : `${b}|${a}`) as ClanPairKey;
}

function getDiplomacyRow(state: PathfindingState, a: ClanId, b: ClanId): DiplomacyRow | undefined {
  return state.diplomacy.rows[pairKey(a, b)];
}

/** atWar 衍生判定（08 §3.1）：近期有敵對行為，且雙方目前無任何生效中協定。 */
function isAtWar(row: DiplomacyRow, today: number): boolean {
  if (row.lastHostileDay === null) return false;
  if (row.pacts.length > 0) return false;
  return today - row.lastHostileDay < BAL.warStateMonths * DAYS_PER_MONTH;
}

/**
 * `mover` 對節點擁有者 `owner` 的外交立場（04 §3.5 canonical 表）。
 * 缺列＝預設列（02 §4.11 DiplomacyState 稀疏慣例）：無協定、從未交戰 ⇒ 'neutral'。
 */
export function getStance(state: PathfindingState, mover: ClanId, owner: ClanId): Stance {
  if (mover === owner) return 'own';
  const row = getDiplomacyRow(state, mover, owner);
  if (!row) return 'neutral';
  if (row.pacts.some((p) => p.kind === 'ceasefire')) return 'ceasefire';
  if (
    row.pacts.some((p) => p.kind === 'alliance' || p.kind === 'marriage' || p.kind === 'vassal')
  ) {
    return 'friendly';
  }
  return isAtWar(row, state.time.day) ? 'war' : 'neutral';
}

function ownerClanIdOf(state: PathfindingState, node: MapGraphNode): ClanId {
  if (node.kind === 'castle') {
    const castle = state.castles[node.id as CastleId];
    if (!castle) throw new Error(`computePath: 找不到城 ${node.id}`);
    return castle.ownerClanId;
  }
  const district = state.districts[node.id as DistrictId];
  if (!district) throw new Error(`computePath: 找不到郡 ${node.id}`);
  return district.ownerClanId;
}

/** 節點是否可通行（04 §3.5）；`isDestination` 為交戰/中立城之終點例外（D3：只能為終點）。 */
function isPassable(node: MapGraphNode, stance: Stance, isDestination: boolean): boolean {
  if (stance === 'ceasefire') return false; // 04 §3.5：停戰不可進入，無終點例外（D4）
  if (node.kind === 'district') return true; // 郡節點恆可進入（敵/中立需制壓，見 needsSubjugateNode）
  if (stance === 'own' || stance === 'friendly') return true;
  return isDestination; // 交戰/中立城：只能為路徑終點（攻城，07）
}

/** 是否需制壓（僅郡節點；城節點走攻城，不計入本檔之路徑成本估算）。 */
function needsSubjugateNode(node: MapGraphNode, stance: Stance): boolean {
  return node.kind === 'district' && (stance === 'war' || stance === 'neutral');
}

/** 估算制壓所需日數（04 §3.8 公式；略去名將加速項，見檔頭「制壓日數估算簡化」）。 */
function estimateSubjugateDays(state: PathfindingState, districtId: DistrictId): number {
  const district = state.districts[districtId];
  if (!district) throw new Error(`computePath: 找不到郡 ${districtId}`);
  const raw = BAL.subjugateDaysBase + Math.floor(district.kokudaka / BAL.subjugateKokuPerExtraDay);
  return Math.min(BAL.subjugateDaysMax, Math.max(BAL.subjugateDaysMin, raw));
}

// ═══════════════════════════════════════════════════════════════════
// 邊權計算（雙態節點登船成本，04 §5.2 附註／§8-D10）
// ═══════════════════════════════════════════════════════════════════

/** 節點的「進入模式」：由陸路或海路抵達（起點視同陸路抵達，04 §5.2 附註）。 */
type Mode = RoadKind;

interface TraversalCost {
  moveDays: number;
  needsSubjugateFlag: boolean;
  subjugateDaysAtNode: number;
}

/**
 * 沿 `edge` 從模式 `fromMode` 的節點走向 `otherNode` 的成本分解（04 §5.2／§3.4.2／§3.4.3／§3.8）。
 * 供 Dijkstra 鬆弛與最終路徑回算共用同一實作，避免兩處公式漂移。
 */
function traversalCost(
  state: PathfindingState,
  q: PathQuery,
  fromMode: Mode,
  edge: RoadEdge,
  otherNode: MapGraphNode,
  stance: Stance,
): TraversalCost {
  let moveDays = edge.baseDays / (edge.type === 'sea' ? 1 : BAL.roadGradeSpeedMult[edge.grade]);
  if (edge.type !== 'sea') {
    moveDays = moveDays / q.speedFactor; // 海路不吃行軍速度修正（04 §3.4.3／§5.3）
  }
  if (edge.type === 'sea' && fromMode === 'land') {
    moveDays += BAL.seaEmbarkDays; // 陸轉海登船延遲；連續海路不重複計（04 §3.4.3）
  }
  const needsSubjugateFlag = needsSubjugateNode(otherNode, stance);
  const subjugateDaysAtNode = needsSubjugateFlag
    ? estimateSubjugateDays(state, otherNode.id as DistrictId)
    : 0;
  return { moveDays, needsSubjugateFlag, subjugateDaysAtNode };
}

// ═══════════════════════════════════════════════════════════════════
// Dijkstra 主體
// ═══════════════════════════════════════════════════════════════════

interface DistEntry {
  nodeId: MapNodeId;
  mode: Mode;
  cost: number;
}

function stateKey(nodeId: MapNodeId, mode: Mode): string {
  return `${nodeId}#${mode}`;
}

/** 決定論最小項選擇：cost 升冪；相同 cost 依 nodeId 字典序（04 §3.6／§5.2 canonical tie-break）；
 * 再相同依 mode（'land' < 'sea'）以求全序決定論（規格未明定雙態節點間之次序，此處補一致順序）。 */
function isBetter(a: DistEntry, b: DistEntry): boolean {
  if (a.cost !== b.cost) return a.cost < b.cost;
  if (a.nodeId !== b.nodeId) return a.nodeId < b.nodeId;
  return a.mode < b.mode;
}

/**
 * computePath（04 §4.3／§5.2）：純函式，UI 路徑預覽與 AI 共用。
 * 單源 Dijkstra，邊權 = edgeCostDays（＝baseDays / BAL.roadGradeSpeedMult[grade]，海路固定
 * ＝baseDays）/ speedFactor（陸路）＋ 登船延遲（雙態節點）＋ 進入敵/中立郡之估計制壓日數；
 * 決定論 tie-break 依 nodeId 字典序（見 `isBetter`）；同輸入重複呼叫結果 bit 相同
 * （無任何隨機性讀取、無外部可變狀態）。
 */
export function computePath(state: PathfindingState, graph: MapGraph, q: PathQuery): PathResult {
  const dist = new Map<string, DistEntry>();
  const prev = new Map<string, { prevKey: string; edgeId: RoadEdgeId }>();
  const visited = new Set<string>();

  const startKey = stateKey(q.from, 'land');
  dist.set(startKey, { nodeId: q.from, mode: 'land', cost: 0 });

  let goalKey: string | null = null;

  for (;;) {
    let bestKey: string | null = null;
    let best: DistEntry | null = null;
    for (const [key, entry] of dist) {
      if (visited.has(key)) continue;
      if (best === null || isBetter(entry, best)) {
        best = entry;
        bestKey = key;
      }
    }
    if (bestKey === null || best === null) break; // pq 空
    visited.add(bestKey);
    if (best.nodeId === q.to) {
      goalKey = bestKey;
      break;
    }

    const edgeIds = graph.adjacency.get(best.nodeId) ?? [];
    for (const edgeId of edgeIds) {
      const edge = graph.edges.get(edgeId);
      if (!edge) continue;
      const otherId = edge.a === best.nodeId ? edge.b : edge.a;
      const otherNode = graph.nodes.get(otherId);
      if (!otherNode) continue;

      const stance = getStance(state, q.clanId, ownerClanIdOf(state, otherNode));
      const isDestination = otherId === q.to;
      if (!isPassable(otherNode, stance, isDestination)) continue;

      const { moveDays, subjugateDaysAtNode } = traversalCost(
        state,
        q,
        best.mode,
        edge,
        otherNode,
        stance,
      );
      const newCost = best.cost + moveDays + subjugateDaysAtNode;
      const nextMode: Mode = edge.type;
      const nextKey = stateKey(otherId, nextMode);
      const existing = dist.get(nextKey);
      if (existing === undefined || newCost < existing.cost) {
        dist.set(nextKey, { nodeId: otherId, mode: nextMode, cost: newCost });
        prev.set(nextKey, { prevKey: bestKey, edgeId });
      }
    }
  }

  if (goalKey === null) {
    return {
      found: false,
      nodes: [],
      edgeIds: [],
      travelDays: 0,
      subjugateDays: 0,
      totalDays: 0,
      steps: [],
    };
  }

  // 回溯組出節點/邊序列（起點 prev 查無記錄，自然終止）。
  const revNodes: MapNodeId[] = [];
  const revEdgeIds: RoadEdgeId[] = [];
  let curKey: string | undefined = goalKey;
  while (curKey !== undefined) {
    const entry = dist.get(curKey);
    if (!entry) break;
    revNodes.push(entry.nodeId);
    const p = prev.get(curKey);
    if (!p) break;
    revEdgeIds.push(p.edgeId);
    curKey = p.prevKey;
  }
  const nodes = revNodes.reverse();
  const edgeIdsPath = revEdgeIds.reverse();

  // 沿已確定路徑重算逐段成本，拆分 travelDays／subjugateDays／逐節點 etaDays
  // （與 Dijkstra 鬆弛共用 `traversalCost`，確保與 dist[q.to] 完全一致）。
  const firstNode = nodes[0];
  if (firstNode === undefined) {
    // 不可能發生：goalKey 非 null 時 dist 至少有起點一筆。
    return {
      found: false,
      nodes: [],
      edgeIds: [],
      travelDays: 0,
      subjugateDays: 0,
      totalDays: 0,
      steps: [],
    };
  }
  const steps: PathResult['steps'] = [{ nodeId: firstNode, etaDays: 0, needsSubjugate: false }];
  let travelDays = 0;
  let subjugateDays = 0;
  let cumulative = 0;

  for (let i = 0; i < edgeIdsPath.length; i += 1) {
    const edgeId = edgeIdsPath[i];
    if (edgeId === undefined) continue; // 不可能發生：i < edgeIdsPath.length
    const edge = graph.edges.get(edgeId);
    if (!edge) throw new Error(`computePath: 內部錯誤，回溯路徑含未知邊 ${edgeId}`);

    const prevEdgeId = i === 0 ? undefined : edgeIdsPath[i - 1];
    const fromMode: Mode =
      prevEdgeId === undefined ? 'land' : (graph.edges.get(prevEdgeId)?.type ?? 'land');

    const nextNodeId = nodes[i + 1];
    if (nextNodeId === undefined)
      throw new Error('computePath: 內部錯誤，nodes/edgeIds 長度不一致');
    const nextNode = graph.nodes.get(nextNodeId);
    if (!nextNode) throw new Error(`computePath: 內部錯誤，回溯路徑含未知節點 ${nextNodeId}`);

    const stance = getStance(state, q.clanId, ownerClanIdOf(state, nextNode));
    const { moveDays, needsSubjugateFlag, subjugateDaysAtNode } = traversalCost(
      state,
      q,
      fromMode,
      edge,
      nextNode,
      stance,
    );

    travelDays += moveDays;
    cumulative += moveDays;
    if (needsSubjugateFlag) {
      subjugateDays += subjugateDaysAtNode;
      cumulative += subjugateDaysAtNode;
    }
    steps.push({ nodeId: nextNodeId, etaDays: cumulative, needsSubjugate: needsSubjugateFlag });
  }

  const totalDays = Math.round((travelDays + subjugateDays) * 2) / 2;

  return { found: true, nodes, edgeIds: edgeIdsPath, travelDays, subjugateDays, totalDays, steps };
}
