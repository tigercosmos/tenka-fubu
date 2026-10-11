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
import type { MapGraph } from '@core/state/mapGraph';
import type { LodStage } from '../lod';
import { MAP_PALETTE_NUM } from '@ui/styles/tokens';
import {
  ROAD_CASING_WIDTH,
  ROAD_INNER_WIDTH,
  ROAD_PATH_DASH,
  ROAD_GROUND_STYLE,
  SEA_ROUTE_KNOT,
  SEA_ROUTE_WIDTH,
  SEA_WAVE,
  BRIDGE,
  ROAD_STAGE_WIDTH_MULT,
  ROAD_DEPTH_STYLE,
} from '../mapViewConfig';

import {
  BRIDGE_DISPLAY_SCALE,
  BRIDGE_MATERIAL,
  ROAD_MATERIAL,
  ROAD_SOIL_MATERIAL,
  landRoadMaterial,
  landRoadSurfaceMaterial,
} from './roadMaterial';
import { edgeVisualPolyline, type RoadPoint } from './roadGeometry';
import {
  flatProjectionRecord,
  projectPolyline,
  assertProjectedStationBudget,
  type PointProjection,
  type RoadProjectionRecord,
} from './projectPolyline';
export { edgePolyline } from './roadGeometry';
export { ROAD_DEPTH_STYLE } from '../mapViewConfig';
export type Pt = RoadPoint;

/** Screen-scaled depth cues; visual only, never alter the routing graph. */
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
  getProjectionDiagnostics(): readonly RoadProjectionRecord[];
  destroy(): void;
}

/** 海路波節「是否落海」判定；true=該點位於海（非任何 land polygon 內）。缺省時全繪。 */
export type SeaTest = (x: number, y: number) => boolean;

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
  alpha?: number,
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
  if (drew)
    g.stroke({
      width,
      color,
      ...(alpha === undefined ? {} : { alpha }),
      cap: 'round',
      join: 'round',
    });
}

/** 海路：外 halo（低 alpha）＋長節線內線＋週期波節（波節僅落海之點繪製）。全走河色系 waterRiver。 */
function drawSeaRoute(g: Graphics, pts: readonly Pt[], m: number, seaTest?: SeaTest): void {
  const water = MAP_PALETTE_NUM.waterRiver;
  // (1) 外 halo（低 alpha 水暈）。
  strokePolyline(g, pts, SEA_ROUTE_WIDTH.outer * m, water, ROAD_MATERIAL.seaOuterAlpha);
  // (2) 長節線內線（連續至端點，含岸邊落地段）。
  dashedPolyline(
    g,
    pts,
    SEA_ROUTE_KNOT.dash * m,
    SEA_ROUTE_KNOT.gap * m,
    ROAD_MATERIAL.seaInnerWidth * m,
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
export function drawBridge(g: Graphics, cx: number, cy: number, angle: number, m: number): void {
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
  const lift = ROAD_DEPTH_STYLE.bridgeLift * m;
  const raised = deck.map((value, index) => (index % 2 === 1 ? value - lift : value));
  // Ground shadow, then the exposed front/right extrusion, then the lifted deck.
  g.poly(deck.map((value) => value + ROAD_DEPTH_STYLE.shadowOffset * m)).fill({
    color: MAP_PALETTE_NUM.reliefInk,
    alpha: ROAD_DEPTH_STYLE.shadowAlpha,
  });
  for (let i = 0; i < 4; i += 1) {
    const j = (i + 1) % 4;
    // The outward normal selects south/east-facing edges in screen space.
    const dx = deck[j * 2]! - deck[i * 2]!;
    const dy = deck[j * 2 + 1]! - deck[i * 2 + 1]!;
    if (dy - dx <= 0) continue;
    g.poly([
      raised[i * 2]!,
      raised[i * 2 + 1]!,
      raised[j * 2]!,
      raised[j * 2 + 1]!,
      deck[j * 2]!,
      deck[j * 2 + 1]!,
      deck[i * 2]!,
      deck[i * 2 + 1]!,
    ]).fill({ color: BRIDGE_MATERIAL.woodDark, alpha: 0.78 });
  }
  g.poly(raised)
    .fill({ color: BRIDGE_MATERIAL.deck })
    .stroke({ width: 1 * m, color: BRIDGE_MATERIAL.woodDark });
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
    g.poly(abut).fill({ color: BRIDGE_MATERIAL.stone });
    // Two broad stone joints per abutment: readable at mid LOD, no stippled noise.
    for (let joint = 1; joint <= 2; joint += 1) {
      const x = ex + (ux * ab * sign * joint) / 3;
      const y = ey + (uy * ab * sign * joint) / 3;
      g.moveTo(x - nx * hw, y - ny * hw)
        .lineTo(x + nx * hw, y + ny * hw)
        .stroke({ width: 0.35 * m, color: BRIDGE_MATERIAL.highlight, alpha: 0.45 });
    }
  }
  // Butt-capped broad strokes tile the exact raised deck: five quiet wood boards,
  // with no extra polygons or extension beyond its existing footprint.
  const plankLength = (2 * hl) / ROAD_DEPTH_STYLE.bridgePlanks;
  for (let i = 0; i < ROAD_DEPTH_STYLE.bridgePlanks; i += 1) {
    const along = -hl + plankLength * (i + 0.5);
    g.moveTo(cx + ux * along - nx * hw, cy + uy * along - ny * hw - lift)
      .lineTo(cx + ux * along + nx * hw, cy + uy * along + ny * hw - lift)
      .stroke({
        width: plankLength,
        cap: 'butt',
        color: BRIDGE_MATERIAL.woodDark,
        alpha: i % 2 === 0 ? 0.1 : 0.16,
      });
  }
  // Fixed NW illumination, not a rotated highlight baked into the bridge axis.
  for (let i = 0; i < 4; i += 1) {
    const j = (i + 1) % 4;
    const dx = deck[j * 2]! - deck[i * 2]!;
    const dy = deck[j * 2 + 1]! - deck[i * 2 + 1]!;
    if (dy - dx >= 0) continue;
    g.moveTo(raised[i * 2]!, raised[i * 2 + 1]!)
      .lineTo(raised[j * 2]!, raised[j * 2 + 1]!)
      .stroke({ width: 0.35 * m, color: BRIDGE_MATERIAL.highlight, alpha: 0.7 });
  }
  // Wooden cross-planks and raised handrails make bridges objects, not map icons.
  for (let i = 1; i < ROAD_DEPTH_STYLE.bridgePlanks; i += 1) {
    const along = -hl + (2 * hl * i) / ROAD_DEPTH_STYLE.bridgePlanks;
    g.moveTo(cx + ux * along - nx * hw, cy + uy * along - ny * hw - lift)
      .lineTo(cx + ux * along + nx * hw, cy + uy * along + ny * hw - lift)
      .stroke({ width: 0.5 * m, color: BRIDGE_MATERIAL.woodDark, alpha: 0.6 });
  }
  for (const side of [-1, 1] as const) {
    const railY = lift + ROAD_DEPTH_STYLE.bridgeRailHeight * m;
    g.moveTo(cx - ux * hl + nx * hw * side, cy - uy * hl + ny * hw * side - railY)
      .lineTo(cx + ux * hl + nx * hw * side, cy + uy * hl + ny * hw * side - railY)
      .stroke({ width: 0.8 * m, color: BRIDGE_MATERIAL.woodDark });
    for (const end of [-1, 1] as const) {
      const x = cx + ux * hl * end + nx * hw * side;
      const y = cy + uy * hl * end + ny * hw * side;
      g.moveTo(x, y - lift)
        .lineTo(x, y - railY)
        .stroke({ width: 0.8 * m, color: BRIDGE_MATERIAL.woodDark });
    }
  }
}

interface ParsedEdge {
  readonly pts: readonly Pt[];
  readonly grade: 1 | 2 | 3;
  readonly isSea: boolean;
  readonly bridges?: readonly number[];
}

function landStrokePolyline(
  g: Graphics,
  pts: readonly Pt[],
  width: number,
  color: number,
  alpha = 1,
  colorOverride?: number,
): void {
  const paint = landRoadMaterial(width, color, alpha);
  strokePolyline(g, pts, paint.width, colorOverride ?? paint.color, paint.alpha);
}

function landSurfacePolyline(
  g: Graphics,
  pts: readonly Pt[],
  grade: 1 | 2 | 3,
  m: number,
  alpha = 1,
  soil: false | 'mid' | 'near' = false,
): void {
  const paint = landRoadSurfaceMaterial(
    ROAD_INNER_WIDTH[grade],
    m,
    grade === 3 ? MAP_PALETTE_NUM.roadArterial : MAP_PALETTE_NUM.roadMinor,
    alpha,
  );
  strokePolyline(
    g,
    pts,
    paint.width,
    soil === 'mid'
      ? grade === 3
        ? ROAD_SOIL_MATERIAL.midArterial
        : ROAD_SOIL_MATERIAL.midMinor
      : soil === 'near'
        ? grade === 3
          ? ROAD_SOIL_MATERIAL.arterial
          : ROAD_SOIL_MATERIAL.minor
        : paint.color,
    paint.alpha,
  );
}

/** Longitudinal packed-earth spans: original arc stations/cap, one cached-stage batched stroke. */
function drawGroundGrain(g: Graphics, pts: readonly Pt[], grade: 2 | 3, m: number): void {
  let distance = 0;
  let next = ROAD_GROUND_STYLE.grainFirst * m;
  let marks = 0;
  for (let i = 1; i < pts.length && marks < ROAD_GROUND_STYLE.grainMaxPerEdge; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length === 0) continue;
    const ux = (b.x - a.x) / length;
    const uy = (b.y - a.y) / length;
    while (next < distance + length && marks < ROAD_GROUND_STYLE.grainMaxPerEdge) {
      const s = next - distance;
      const x = a.x + ux * s;
      const y = a.y + uy * s;
      // Stay on this exact source segment, even next to bends/duplicate vertices.
      // Round caps have radius <= the unchanged casing radius, so their full
      // footprints remain inside the original route's stroke capsules.
      const half = Math.min(
        ROAD_GROUND_STYLE.grainSpacing * m * ROAD_SOIL_MATERIAL.wearLengthFactor,
        s,
        length - s,
      );
      g.moveTo(x - ux * half, y - uy * half).lineTo(x + ux * half, y + uy * half);
      marks++;
      next += ROAD_GROUND_STYLE.grainSpacing * m;
    }
    distance += length;
  }
  if (marks > 0)
    g.stroke({
      width: ROAD_INNER_WIDTH[grade] * m * ROAD_SOIL_MATERIAL.wearWidthFactor,
      color: ROAD_SOIL_MATERIAL.wearColor,
      alpha: ROAD_SOIL_MATERIAL.wearAlpha,
      cap: 'round',
      join: 'round',
    });
}

/**
 * 建 roads 圖層：依道級/海路分批＋橋樑；build 時只解析並存多段線幾何、不描繪，
 * 首次 setStage 產生首描（依 stage 倍率）。seaTest 提供時，海路波節僅於落海之弧節繪製。
 */
export function buildRoadsLayer(
  graph: MapGraph,
  seaTest?: SeaTest,
  project?: PointProjection,
): RoadsLayer {
  const sources = [...graph.edges.keys()].sort().flatMap((edgeId) => {
    const edge = graph.edges.get(edgeId);
    const pts = edge === undefined ? null : edgeVisualPolyline(edge, graph);
    return edge === undefined || pts === null ? [] : [{ edge, pts }];
  });
  if (project !== undefined) {
    function* projectionSources() {
      for (const { edge, pts } of sources) {
        yield pts;
        const bridges = edge.bridges;
        if (bridges !== undefined)
          for (let index = 0; index + 1 < bridges.length; index += 2) {
            yield [{ x: bridges[index]!, y: bridges[index + 1]! }];
          }
      }
    }
    assertProjectedStationBudget(projectionSources());
  }
  // Complete preflight before allocating Graphics or projecting a partial layer.
  const parsed: ParsedEdge[] = [];
  let diagnostics: readonly RoadProjectionRecord[] = Object.freeze(
    sources.map(({ edge, pts }) => {
      const projected = project === undefined ? null : projectPolyline(pts, project);
      const bridges =
        project === undefined
          ? edge.bridges
          : edge.bridges?.flatMap((value, index, array) => {
              if (index % 2 !== 0 || index + 1 >= array.length) return [];
              const point = projectPolyline([{ x: value, y: array[index + 1]! }], project)
                .points[0]!;
              return [point.x, point.y];
            });
      parsed.push({
        pts: projected?.points ?? pts,
        grade: edge.grade,
        isSea: edge.type === 'sea',
        ...(bridges !== undefined ? { bridges } : {}),
      });
      return projected === null
        ? flatProjectionRecord(edge.id, pts)
        : Object.freeze({ roadId: edge.id, stations: projected.stations });
    }),
  );
  const container = new Container();
  const seaGfx = new Graphics();
  const pathGfx = new Graphics(); // grade1 小路
  const bridgeGfx = new Graphics();
  const minorGfx = new Graphics(); // grade2 次道
  const arterialGfx = new Graphics(); // grade3 主幹道
  // Raised timber is above ground road paint; the same bridge batch remains hidden at far.
  // No geometry or resource change: only the existing crossing's compositing order changes.
  container.addChild(seaGfx);
  container.addChild(pathGfx);
  container.addChild(minorGfx);
  container.addChild(arterialGfx);
  container.addChild(bridgeGfx);

  const landOf = (grade: 1 | 2 | 3): ParsedEdge[] =>
    parsed.filter((p) => !p.isSea && p.grade === grade);

  /** 一級陸路 tier：先畫全部 casing，再畫全部內線（casing 在下、內線在上，V6D1）。 */
  function drawLandTier(g: Graphics, grade: 1 | 2 | 3, m: number, stage: LodStage): void {
    const edges = landOf(grade);
    if (stage !== 'far' && grade !== 1) {
      // Centered soil bed replaces a displaced drop shadow: grounded rather than raised wire.
      for (const e of edges)
        landStrokePolyline(
          g,
          e.pts,
          (ROAD_CASING_WIDTH[grade] + ROAD_GROUND_STYLE.vergeExtraWidth) * m,
          MAP_PALETTE_NUM.roadCasing,
          ROAD_GROUND_STYLE.vergeAlpha,
        );
      for (const e of edges)
        landStrokePolyline(
          g,
          e.pts,
          ROAD_CASING_WIDTH[grade] * m,
          MAP_PALETTE_NUM.roadCasing,
          ROAD_GROUND_STYLE.casingAlpha,
          ROAD_SOIL_MATERIAL.casing,
        );
      for (const e of edges)
        landSurfacePolyline(g, e.pts, grade, m, ROAD_GROUND_STYLE.surfaceAlpha, stage);
      for (const e of edges) drawGroundGrain(g, e.pts, grade, m);
      return;
    }
    for (const e of edges) {
      const offset = ROAD_DEPTH_STYLE.shadowOffset * m;
      landStrokePolyline(
        g,
        e.pts.map((point) => ({ x: point.x + offset, y: point.y + offset })),
        ROAD_CASING_WIDTH[grade] * m,
        MAP_PALETTE_NUM.reliefInk,
        ROAD_DEPTH_STYLE.shadowAlpha,
      );
    }
    for (const e of edges)
      landStrokePolyline(g, e.pts, ROAD_CASING_WIDTH[grade] * m, MAP_PALETTE_NUM.roadCasing);
    for (const e of edges) {
      if (grade === 1) {
        dashedPolyline(
          g,
          e.pts,
          ROAD_PATH_DASH.dash * m,
          ROAD_PATH_DASH.gap * m,
          landRoadSurfaceMaterial(ROAD_INNER_WIDTH[1], m, MAP_PALETTE_NUM.roadMinor).width,
          ROAD_MATERIAL.minor,
          ROAD_MATERIAL.surfaceAlpha,
        );
      } else {
        landSurfacePolyline(g, e.pts, grade, m);
      }
    }
    if (grade > 1) {
      for (const e of edges) {
        landStrokePolyline(
          g,
          e.pts.map((point) => ({ x: point.x - 0.25 * m, y: point.y - 0.25 * m })),
          0.45 * m,
          MAP_PALETTE_NUM.plainLight,
          ROAD_DEPTH_STYLE.highlightAlpha,
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
    drawLandTier(arterialGfx, 3, m, stage);
    drawLandTier(minorGfx, 2, m, stage);
    drawLandTier(pathGfx, 1, m, stage);
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
        drawBridge(bridgeGfx, bx, by, segmentAngleAt(e.pts, bx, by), BRIDGE_DISPLAY_SCALE[stage]);
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
    diagnostics = Object.freeze([]);
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
    getProjectionDiagnostics: () => diagnostics,
    destroy,
  };
}
