// 地圖靜態圖層的純繪製輔助函式（seaBackground／roads／nodeMarkers）。
//
// 規格：plan/04-map-and-movement.md §3.10.1（圖層 0 海陸背景、圖層 2 街道、圖層 3 城/郡標記之內容）、
// §3.2（世界座標）、§3.4.2/§3.4.3（道級線寬、海路虛線）。M2-13（04-T8「outline 與街道繪製」）。
//
// 設計要點：
// - 本檔為**純函式**：只對傳入的 Pixi `Graphics` 呼叫繪製指令，不持有狀態、不建立 Application、
//   不碰 DOM。`Graphics` 僅以 `import type` 引入（verbatimModuleSyntax 下於執行期抹除），故本檔可在
//   node 測試環境以「錄製用 mock」直接驗證繪製指令序列，無需 Pixi 執行期（17 §3.2；jsdom 外亦可跑）。
// - 決定論：邊／節點一律依 id 字典序處理（雖對繪製結果無影響，仍與 core 慣例一致、利於快照）。
// - 數值：線寬／dash／標記幾何走 mapViewConfig（非 BAL，04 §4.5/§8-D8）；勢力色走 tokens.clanColorNum
//   （12 §5.1 公式）；描邊墨色走 TOKENS_NUM（12）。

import type { Graphics } from 'pixi.js';
import type { MapGraph, MapGraphNode } from '@core/state/mapGraph';
import outlineJson from '@data/map/japan-outline.json';
import { zJapanOutlineFile, type JapanOutlineFile } from '@data/schemas/outline';
import { clanColorNum, TOKENS_NUM } from '@ui/styles/tokens';
import {
  MAPVIEW,
  NODE_MARKER,
  ROAD_GRADE_WIDTH,
  SEA_ROUTE_DASH,
  WORLD_SIZE,
} from './mapViewConfig';
import type { MapViewState } from './mapViewTypes';

let cachedOutline: JapanOutlineFile | null = null;

/**
 * 內建日本海岸線 outline（`@data/map/japan-outline.json`，04 §3.3）；經 zod 驗證後快取。
 * 渲染器 init 時繪製 seaBackground 用；亦供無 outline 覆蓋的測試共用。
 */
export function loadOutline(): JapanOutlineFile {
  if (cachedOutline === null) {
    cachedOutline = zJapanOutlineFile.parse(outlineJson);
  }
  return cachedOutline;
}

/**
 * 圖層 0「seaBackground」：全世界海色矩形＋各島陸地多邊形填色（04 §3.10.1）。
 * 靜態一次建立（整局不變）。座標為世界座標（world unit）。
 */
export function drawSeaBackground(g: Graphics, outline: JapanOutlineFile): void {
  g.clear();
  // 海：鋪滿整個 4096×4096 世界空間。
  g.rect(0, 0, WORLD_SIZE, WORLD_SIZE).fill({ color: MAPVIEW.colors.sea });
  // 陸：各島多邊形（points 為扁平世界座標，逆時針纏繞，渲染時自動閉合）。
  for (const poly of outline.polygons) {
    if (poly.points.length >= 6) {
      g.poly(poly.points).fill({ color: MAPVIEW.colors.land });
    }
  }
}

interface EdgeEndpoints {
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

function endpointsOf(graph: MapGraph, aId: string, bId: string): EdgeEndpoints | null {
  const a = graph.nodes.get(aId as MapGraphNode['id']);
  const b = graph.nodes.get(bId as MapGraphNode['id']);
  if (a === undefined || b === undefined) return null;
  return { ax: a.pos.x, ay: a.pos.y, bx: b.pos.x, by: b.pos.y };
}

/** 沿線段以 dash/gap 疊繪虛線子路徑（不呼叫 stroke；由呼叫端統一收尾）。 */
function addDashedPath(g: Graphics, e: EdgeEndpoints, dash: number, gap: number): void {
  const dx = e.bx - e.ax;
  const dy = e.by - e.ay;
  const len = Math.hypot(dx, dy);
  if (len === 0) return;
  const ux = dx / len;
  const uy = dy / len;
  const step = dash + gap;
  for (let start = 0; start < len; start += step) {
    const end = Math.min(start + dash, len);
    g.moveTo(e.ax + ux * start, e.ay + uy * start);
    g.lineTo(e.ax + ux * end, e.ay + uy * end);
  }
}

/**
 * 圖層 2「roads」：街道線（04 §3.10.1）。陸路實線、依 grade 線寬 1.5/2.5/3.5（ROAD_GRADE_WIDTH）；
 * 海路（`type==='sea'`）以 dash 12/8 虛線（SEA_ROUTE_DASH），線寬取 grade 1（海路 grade 固定，02 §4.7）。
 * 邊依 id 字典序繪製（決定論）。端點缺失的邊略過（防禦；正常資料不會發生）。
 */
export function drawRoads(g: Graphics, graph: MapGraph): void {
  g.clear();
  const edgeIds = [...graph.edges.keys()].sort();
  const strokeColor = TOKENS_NUM.ink700;
  for (const edgeId of edgeIds) {
    const edge = graph.edges.get(edgeId);
    if (edge === undefined) continue;
    const ep = endpointsOf(graph, edge.a, edge.b);
    if (ep === null) continue;
    if (edge.type === 'sea') {
      addDashedPath(g, ep, SEA_ROUTE_DASH.dash, SEA_ROUTE_DASH.gap);
      g.stroke({ width: ROAD_GRADE_WIDTH[1], color: strokeColor, alpha: 0.85, cap: 'round' });
    } else {
      g.moveTo(ep.ax, ep.ay);
      g.lineTo(ep.bx, ep.by);
      g.stroke({ width: ROAD_GRADE_WIDTH[edge.grade], color: strokeColor, cap: 'round' });
    }
  }
}

/** 以 (cx,cy) 為心、半徑 r 的正 n 邊形頂點（扁平陣列）；`startAngle` 弧度（預設頂點朝上 -90°）。 */
function regularPolygon(
  cx: number,
  cy: number,
  r: number,
  n: number,
  startAngle: number,
): number[] {
  const pts: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = startAngle + (i * 2 * Math.PI) / n;
    pts.push(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  return pts;
}

/** owner 勢力色（有主＝clanColorNum；無主／索引非法＝中性灰 MAPVIEW.colors.neutral）。 */
function ownerColor(
  clanId: string | null | undefined,
  clanColorIndex: Readonly<Record<string, number>>,
): number {
  if (clanId == null) return MAPVIEW.colors.neutral;
  const idx = clanColorIndex[clanId];
  if (idx === undefined || !Number.isInteger(idx) || idx < 0 || idx >= 40) {
    return MAPVIEW.colors.neutral;
  }
  return clanColorNum(idx);
}

/**
 * 圖層 3「nodeMarkers」：城＝五角天守形、郡＝菱形（04 §3.10.1）——**M2-13 骨架占位**。
 * 填色＝owner 勢力色，描邊墨色。M2-16（sceneParts CastleNode/DistrictNode/SelectionRing，12-T10）
 * 以正式繪製參數（含本城/支城區分、LOD 縮放、命中區）取代之。節點依 id 字典序繪製（決定論）。
 */
export function drawNodeMarkers(
  g: Graphics,
  graph: MapGraph,
  view: MapViewState,
  clanColorIndex: Readonly<Record<string, number>>,
): void {
  g.clear();
  const nodeIds = [...graph.nodes.keys()].sort();
  const up = -Math.PI / 2;
  for (const nodeId of nodeIds) {
    const node = graph.nodes.get(nodeId);
    if (node === undefined) continue;
    const { x, y } = node.pos;
    if (node.kind === 'castle') {
      const owner = view.castleOwner[nodeId];
      const color = ownerColor(owner, clanColorIndex);
      const pts = regularPolygon(x, y, NODE_MARKER.castleRadius, 5, up);
      g.poly(pts).fill({ color });
      g.poly(pts).stroke({ width: NODE_MARKER.strokeWidth, color: TOKENS_NUM.ink700 });
    } else {
      const owner = view.districtOwner[nodeId] ?? null;
      const color = ownerColor(owner, clanColorIndex);
      const r = NODE_MARKER.districtRadius;
      const pts = [x, y - r, x + r, y, x, y + r, x - r, y]; // 菱形（上右下左）
      g.poly(pts).fill({ color });
      g.poly(pts).stroke({ width: NODE_MARKER.strokeWidth, color: TOKENS_NUM.ink700 });
    }
  }
}
