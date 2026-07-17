// 道路／橋樑純繪製輔助（RoadsLayer 子容器）——[M6-V6] Slice C。
//
// 規格：M6-V6 技術設計文件 §4.1（本檔逐字實作）、§2 V6D1–V6D3/V6D7（道路分批＋casing/內線
// 兩趟 stroke、道級線型、per-stage 螢幕不變線寬、橋樑層序）、§3.3/§6.3（繪製幾何總表）、
// plan/04-map-and-movement.md §3.10.1（圖層 5「roads」內容）、§3.10.3（overview 不得整層隱藏）。
//
// 設計要點：
// - `buildRoadsLayer` 回傳單一 `RoadsLayer` 子容器（其內 5 個具名 tier `Graphics`，由下而上：
//   sea/path/bridge/minor/arterial），`MapRenderer` 只掛一個 `container` 至 `layers.roads`
//   （保 `layers.roads.children.length===1`，V6D2）。z-order 由 `addChild` 序決定，記為穩定契約。
// - build 時**只解析並存多段線幾何、不描繪**；首次 `setStage`（由 `MapRenderer` 於 build 後呼叫）
//   產生首描。`setStage` 依 `ROAD_STAGE_WIDTH_MULT` 乘 stage 倍率重描，使螢幕外觀跨 far/mid/near
//   三段近似恆定（避免固定世界線寬於 far 0.25 呈次像素，V6D3-B）；stage 未變則早退（零重描，
//   守 day-only tick dirty 契約）。
// - 每級 tier `Graphics` 內部**先畫全部 casing 再畫全部內線**（Pixi v8 依呼叫序繪製，casing 在下、
//   內線在上，交叉口自然連通；V6D1）。橋面置於陸路內線之下（bridgeGfx 於 minor/arterial 之下）。
// - 海路全走河色系（`waterRiver` 之外 halo＋長節線＋波節），形狀異於陸路；波節僅落海之弧節繪製
//   （由注入之 `SeaTest` 判定，陸段抑制，V6D3/§4.1）。
// - 決定論：邊依 `id` 字典序處理（與 `buildMapGraph`／舊 `drawRoads` 一致）。
// - 色彩一律取自 `MAP_PALETTE_NUM`（tokens.ts），render 常數取自 `mapViewConfig`（非 BAL）。

import { Container, Graphics } from 'pixi.js';
import type { MapGraph, MapRoadEdge } from '@core/state/mapGraph';
import type { LodStage } from '../lod';
import { MAP_PALETTE_NUM } from '@ui/styles/tokens';
import {
  ROAD_CASING_WIDTH,
  ROAD_INNER_WIDTH,
  ROAD_PATH_DASH,
  SEA_ROUTE_KNOT,
  SEA_ROUTE_WIDTH,
  SEA_ROUTE_OUTER_ALPHA,
  SEA_WAVE,
  BRIDGE,
  ROAD_STAGE_WIDTH_MULT,
} from '../mapViewConfig';

export interface Pt {
  x: number;
  y: number;
}

export interface RoadsLayer {
  readonly container: Container;
  /** 具名 tier 參考（測試 affordance；z-order 下→上：sea/path/bridge/minor/arterial，穩定契約）。 */
  readonly tiers: {
    readonly sea: Graphics;
    readonly path: Graphics;
    readonly bridge: Graphics;
    readonly minor: Graphics;
    readonly arterial: Graphics;
  };
  /** 切換 LOD 能見度；stage 改變時依 ROAD_STAGE_WIDTH_MULT 重描全 tier（快取 lastStage，未變則早退）。 */
  setStage(stage: LodStage): void;
  destroy(): void;
}

/** 海路波節「是否落海」判定；true=該點位於海（非任何 land polygon 內）。缺省時全繪。 */
export type SeaTest = (x: number, y: number) => boolean;

/** 邊的多段線頂點（[a.pos, ...waypoints, b.pos]）；端點缺失回 null。 */
export function edgePolyline(edge: MapRoadEdge, graph: MapGraph): Pt[] | null {
  const a = graph.nodes.get(edge.a);
  const b = graph.nodes.get(edge.b);
  if (a === undefined || b === undefined) return null;
  const pts: Pt[] = [{ x: a.pos.x, y: a.pos.y }];
  const wp = edge.waypoints;
  if (wp !== undefined) {
    for (let i = 0; i + 1 < wp.length; i += 2) {
      pts.push({ x: wp[i]!, y: wp[i + 1]! });
    }
  }
  pts.push({ x: b.pos.x, y: b.pos.y });
  return pts;
}

/** 多段線弧長中點座標＋該點所屬段角度（rad）；供道路名標籤定位。空/單點回 null。 */
export function polylineMidpoint(
  pts: readonly Pt[],
): { x: number; y: number; angle: number } | null {
  if (pts.length < 2) return null;
  const segLens: number[] = [];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const len = Math.hypot(pts[i + 1]!.x - pts[i]!.x, pts[i + 1]!.y - pts[i]!.y);
    segLens.push(len);
    total += len;
  }
  // 全零長度（所有頂點重合）：退回首點與首段角度（防禦；正常資料不會發生）。
  if (total === 0) {
    const a = pts[0]!;
    const b = pts[1]!;
    return { x: a.x, y: a.y, angle: Math.atan2(b.y - a.y, b.x - a.x) };
  }
  const half = total / 2;
  let acc = 0;
  for (let i = 0; i < segLens.length; i += 1) {
    const segLen = segLens[i]!;
    if (segLen > 0 && acc + segLen >= half) {
      const t = (half - acc) / segLen;
      const a = pts[i]!;
      const b = pts[i + 1]!;
      return {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
        angle: Math.atan2(b.y - a.y, b.x - a.x),
      };
    }
    acc += segLen;
  }
  // 浮點殘差 fallback：末段末點。
  const a = pts[pts.length - 2]!;
  const b = pts[pts.length - 1]!;
  return { x: b.x, y: b.y, angle: Math.atan2(b.y - a.y, b.x - a.x) };
}

/** 點到線段最短距離平方。 */
function distSqToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = ax + dx * t;
  const cy = ay + dy * t;
  return (px - cx) * (px - cx) + (py - cy) * (py - cy);
}

/** 在 pts 上找最接近 (px,py) 的段之方向角（rad）；供橋面方位。 */
export function segmentAngleAt(pts: readonly Pt[], px: number, py: number): number {
  if (pts.length < 2) return 0;
  let best = Infinity;
  let bestAngle = 0;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const d = distSqToSegment(px, py, a.x, a.y, b.x, b.y);
    if (d < best) {
      best = d;
      bestAngle = Math.atan2(b.y - a.y, b.x - a.x);
    }
  }
  return bestAngle;
}

/** 多段線 stroke（moveTo/lineTo 全點後單次 stroke，round cap/join）。export 供 Slice E 復用。 */
export function strokePolyline(
  g: Graphics,
  pts: readonly Pt[],
  width: number,
  color: number,
  alpha = 1,
): void {
  if (pts.length < 2) return;
  g.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i += 1) g.lineTo(pts[i]!.x, pts[i]!.y);
  g.stroke({ width, color, alpha, cap: 'round', join: 'round' });
}

/**
 * 沿多段線以 dash/gap 鋪節線（跨頂點連續：以整條多段線之累積弧長為相位基準），單次 stroke 收尾。
 */
function dashedPolyline(
  g: Graphics,
  pts: readonly Pt[],
  dash: number,
  gap: number,
  width: number,
  color: number,
): void {
  if (pts.length < 2 || dash <= 0) return;
  const period = dash + gap;
  let dist = 0; // 自多段線起點沿線累積之距離（相位基準）
  let drew = false;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (segLen === 0) continue;
    const ux = (b.x - a.x) / segLen;
    const uy = (b.y - a.y) / segLen;
    let s = 0;
    while (s < segLen) {
      const phase = (dist + s) % period;
      if (phase < dash) {
        const drawLen = Math.min(dash - phase, segLen - s);
        g.moveTo(a.x + ux * s, a.y + uy * s);
        g.lineTo(a.x + ux * (s + drawLen), a.y + uy * (s + drawLen));
        drew = true;
        s += drawLen;
      } else {
        s += Math.min(period - phase, segLen - s);
      }
    }
    dist += segLen;
  }
  if (drew) g.stroke({ width, color, cap: 'round', join: 'round' });
}

/** 海路：外 halo（低 alpha）＋長節線內線＋週期波節（波節僅落海之點繪製）。全走河色系 waterRiver。 */
function drawSeaRoute(g: Graphics, pts: readonly Pt[], m: number, seaTest?: SeaTest): void {
  const water = MAP_PALETTE_NUM.waterRiver;
  // (1) 外 halo（低 alpha 水暈）。
  strokePolyline(g, pts, SEA_ROUTE_WIDTH.outer * m, water, SEA_ROUTE_OUTER_ALPHA);
  // (2) 長節線內線（連續至端點，含岸邊落地段）。
  dashedPolyline(
    g,
    pts,
    SEA_ROUTE_KNOT.dash * m,
    SEA_ROUTE_KNOT.gap * m,
    SEA_ROUTE_WIDTH.inner * m,
    water,
  );
  // (3) 波節：沿多段線每 spacing 一枚半圓弧；seaTest 提供且該點落陸則抑制（陸段不鋪波節）。
  const spacing = SEA_WAVE.spacing * m;
  const radius = SEA_WAVE.radius * m;
  if (spacing <= 0) return;
  let nextAt = spacing; // 略過起點，第一枚落於 spacing 處
  let dist = 0;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    if (segLen === 0) continue;
    const ux = (b.x - a.x) / segLen;
    const uy = (b.y - a.y) / segLen;
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    while (nextAt <= dist + segLen) {
      const local = nextAt - dist;
      const cx = a.x + ux * local;
      const cy = a.y + uy * local;
      if (seaTest === undefined || seaTest(cx, cy)) {
        g.arc(cx, cy, radius, angle, angle + Math.PI);
        g.stroke({ width: 1 * m, color: water });
      }
      nextAt += spacing;
    }
    dist += segLen;
  }
}

/** 橋樑：橋面矩形（沿道路段方向）＋兩端橋頭（abutment）；方位由 angle 推導。 */
function drawBridge(g: Graphics, cx: number, cy: number, angle: number, m: number): void {
  const hl = (BRIDGE.deckLength * m) / 2;
  const hw = (BRIDGE.deckWidth * m) / 2;
  const ab = BRIDGE.abutment * m;
  const ux = Math.cos(angle); // 沿路方向
  const uy = Math.sin(angle);
  const nx = -Math.sin(angle); // 垂直路方向
  const ny = Math.cos(angle);
  // 橋面板四角。
  const deck = [
    cx - ux * hl - nx * hw,
    cy - uy * hl - ny * hw,
    cx + ux * hl - nx * hw,
    cy + uy * hl - ny * hw,
    cx + ux * hl + nx * hw,
    cy + uy * hl + ny * hw,
    cx - ux * hl + nx * hw,
    cy - uy * hl + ny * hw,
  ];
  g.poly(deck)
    .fill({ color: MAP_PALETTE_NUM.plainLight })
    .stroke({ width: 1 * m, color: MAP_PALETTE_NUM.roadCasing });
  // 兩端橋頭（沿路方向各外突 ab，寬同橋面）。
  for (const sign of [-1, 1] as const) {
    const ex = cx + ux * hl * sign;
    const ey = cy + uy * hl * sign;
    const abut = [
      ex - nx * hw,
      ey - ny * hw,
      ex + ux * ab * sign - nx * hw,
      ey + uy * ab * sign - ny * hw,
      ex + ux * ab * sign + nx * hw,
      ey + uy * ab * sign + ny * hw,
      ex + nx * hw,
      ey + ny * hw,
    ];
    g.poly(abut).fill({ color: MAP_PALETTE_NUM.roadCasing });
  }
}

interface ParsedEdge {
  readonly pts: Pt[];
  readonly grade: 1 | 2 | 3;
  readonly isSea: boolean;
  readonly bridges?: readonly number[];
}

/**
 * 建 roads 圖層：依道級/海路分批＋橋樑；build 時只解析並存多段線幾何、不描繪，
 * 首次 setStage 產生首描（依 stage 倍率）。seaTest 提供時，海路波節僅於落海之弧節繪製。
 */
export function buildRoadsLayer(graph: MapGraph, seaTest?: SeaTest): RoadsLayer {
  const container = new Container();
  const seaGfx = new Graphics();
  const pathGfx = new Graphics(); // grade1 小路
  const bridgeGfx = new Graphics();
  const minorGfx = new Graphics(); // grade2 次道
  const arterialGfx = new Graphics(); // grade3 主幹道
  // addChild 序（下→上）：sea → path → bridge → minor → arterial（z-order 穩定契約，V6D1）。
  container.addChild(seaGfx);
  container.addChild(pathGfx);
  container.addChild(bridgeGfx);
  container.addChild(minorGfx);
  container.addChild(arterialGfx);

  // build 時只解析多段線幾何（依 edge id 字典序，決定論），不描繪。
  const parsed: ParsedEdge[] = [];
  for (const edgeId of [...graph.edges.keys()].sort()) {
    const edge = graph.edges.get(edgeId);
    if (edge === undefined) continue;
    const pts = edgePolyline(edge, graph);
    if (pts === null) continue;
    parsed.push({
      pts,
      grade: edge.grade,
      isSea: edge.type === 'sea',
      ...(edge.bridges !== undefined ? { bridges: edge.bridges } : {}),
    });
  }

  const landOf = (grade: 1 | 2 | 3): ParsedEdge[] =>
    parsed.filter((p) => !p.isSea && p.grade === grade);

  /** 一級陸路 tier：先畫全部 casing，再畫全部內線（casing 在下、內線在上，V6D1）。 */
  function drawLandTier(g: Graphics, grade: 1 | 2 | 3, m: number): void {
    const edges = landOf(grade);
    for (const e of edges)
      strokePolyline(g, e.pts, ROAD_CASING_WIDTH[grade] * m, MAP_PALETTE_NUM.roadCasing);
    for (const e of edges) {
      if (grade === 1) {
        dashedPolyline(
          g,
          e.pts,
          ROAD_PATH_DASH.dash * m,
          ROAD_PATH_DASH.gap * m,
          ROAD_INNER_WIDTH[1] * m,
          MAP_PALETTE_NUM.roadMinor,
        );
      } else {
        strokePolyline(
          g,
          e.pts,
          ROAD_INNER_WIDTH[grade] * m,
          grade === 3 ? MAP_PALETTE_NUM.roadArterial : MAP_PALETTE_NUM.roadMinor,
        );
      }
    }
  }

  let lastStage: LodStage | null = null;

  function setStage(stage: LodStage): void {
    if (stage === lastStage) return; // 早退：stage 未變零重描（守 day-only tick 契約）
    lastStage = stage;
    const m = ROAD_STAGE_WIDTH_MULT[stage];
    seaGfx.clear();
    pathGfx.clear();
    bridgeGfx.clear();
    minorGfx.clear();
    arterialGfx.clear();
    // 陸路道級（arterial 最上、path 最下）。
    drawLandTier(arterialGfx, 3, m);
    drawLandTier(minorGfx, 2, m);
    drawLandTier(pathGfx, 1, m);
    // 海路。
    for (const e of parsed) {
      if (e.isSea) drawSeaRoute(seaGfx, e.pts, m, seaTest);
    }
    // 橋樑（方位由所屬邊多段線之段方向推導）。
    for (const e of parsed) {
      const bridges = e.bridges;
      if (bridges === undefined) continue;
      for (let i = 0; i + 1 < bridges.length; i += 2) {
        const bx = bridges[i]!;
        const by = bridges[i + 1]!;
        drawBridge(bridgeGfx, bx, by, segmentAngleAt(e.pts, bx, by), m);
      }
    }
    // 能見度矩陣（V6D3/V6D4/V6D7）：arterial/sea 恆顯；minor mid 起；path near；bridge mid 起。
    arterialGfx.visible = true;
    seaGfx.visible = true;
    minorGfx.visible = stage !== 'far';
    pathGfx.visible = stage === 'near';
    bridgeGfx.visible = stage !== 'far';
  }

  function destroy(): void {
    container.destroy({ children: true });
  }

  return {
    container,
    tiers: {
      sea: seaGfx,
      path: pathGfx,
      bridge: bridgeGfx,
      minor: minorGfx,
      arterial: arterialGfx,
    },
    setStage,
    destroy,
  };
}
