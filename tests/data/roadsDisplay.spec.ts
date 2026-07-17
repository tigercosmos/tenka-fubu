// s1560 道路顯示資料（waypoints／bridges）＋schema／validate／selector 分派單元測試。
// 規格：plan/18-roadmap.md M6-V6；設計文件 §3.2／§3.4／§6.2／§8.1（Slice A 驗收）。
//
// 幾何 gate（處置 x2-M2／x4-M2）：對 s1560 grade-3 arterial（帶 waypoints）之多段線，
// 斷言「內部 waypoint 頂點落陸且不落任何 terrain.json 山系 mass」＋「非端點逼近段沿段密取樣不穿海／
// 不穿 mass」——使「道路不穿山越海」有自動檢核（不只眼驗）。端點逼近段豁免：僅當該端點本身
// 落於某 mass（如駿府／安倍郡位於山區）時，其相接段之 mass 檢核豁免（設計 §6.1／§8.1）。
import { describe, expect, it } from 'vitest';

import { zRoadEdge, zRoadsFile, type RoadEdgeData } from '../../src/data/schemas/road';
import { pointInPolygon } from '../../src/data/map/outlineGeometry';
import {
  buildMapGraph,
  type CastleNodeInput,
  type DistrictNodeInput,
} from '../../src/core/state/mapGraph';
import type { RoadEdge } from '../../src/core/state/gameState';
import type { CastleId, DistrictId, RoadEdgeId } from '../../src/core/state/ids';
import { roadDisplayLookup } from '../../src/core/state/selectors';
import { DEBUG_VISUAL_ROAD_DISPLAY } from '../../src/core/state/debugVisualRoadDisplay';
import { DEBUG_VISUAL_MAP_ID } from '../../src/core/debugVisual';
import {
  checkWorld,
  loadRawScenario,
  parseScenario,
  type ScenarioWorld,
} from '../../tools/validate';
import roadsJson from '../../src/data/scenarios/s1560/roads.json';
import castlesJson from '../../src/data/scenarios/s1560/castles.json';
import districtsJson from '../../src/data/scenarios/s1560/districts.json';
import outlineJson from '../../src/data/map/japan-outline.json';
import terrainJson from '../../src/data/map/terrain.json';

// ── 地理判定小工具（皆用 outlineGeometry.pointInPolygon 之奇偶規則） ──
const LAND_POLYS: readonly (readonly number[])[] = outlineJson.polygons.map((p) => p.points);
const MOUNTAIN_MASSES: readonly { id: string; mass: readonly number[] }[] =
  terrainJson.mountains.map((m) => ({ id: m.id, mass: m.mass }));

function onLand(x: number, y: number): boolean {
  return LAND_POLYS.some((poly) => pointInPolygon(x, y, poly));
}
function massAt(x: number, y: number): string | null {
  for (const m of MOUNTAIN_MASSES) if (pointInPolygon(x, y, m.mass)) return m.id;
  return null;
}

// ── 節點座標查表（s1560 城∪郡） ──
const NODE_POS = new Map<string, { x: number; y: number }>();
for (const c of castlesJson as { id: string; pos: { x: number; y: number } }[]) {
  NODE_POS.set(c.id, c.pos);
}
for (const d of districtsJson as { id: string; pos: { x: number; y: number } }[]) {
  NODE_POS.set(d.id, d.pos);
}

interface Pt {
  x: number;
  y: number;
}
/** 邊多段線頂點：[a.pos, ...waypoints, b.pos]。 */
function edgePolyline(edge: RoadEdgeData): Pt[] {
  const a = NODE_POS.get(edge.a);
  const b = NODE_POS.get(edge.b);
  if (a === undefined || b === undefined) throw new Error(`node pos 缺失 ${edge.a}/${edge.b}`);
  const mid: Pt[] = [];
  const wp = edge.waypoints ?? [];
  for (let i = 0; i + 1 < wp.length; i += 2) mid.push({ x: wp[i]!, y: wp[i + 1]! });
  return [a, ...mid, b];
}
/** 點到線段最短距離（供橋樑鄰邊檢核）。 */
function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  const cx = a.x + t * dx;
  const cy = a.y + t * dy;
  return Math.hypot(p.x - cx, p.y - cy);
}
function distToPolyline(p: Pt, pts: readonly Pt[]): number {
  let min = Infinity;
  for (let i = 0; i + 1 < pts.length; i++)
    min = Math.min(min, distToSegment(p, pts[i]!, pts[i + 1]!));
  return min;
}

const SAMPLE_STEP = 4; // 沿段密取樣間距（world unit）
const BRIDGE_NEAR_MAX = 24; // 橋面中心點須落多段線 ≤24wu（設計 §4.2）

/** grade-3 且帶 waypoints 的 arterial 邊（本階段對其加地形順應多段線）。 */
const arterialWithWaypoints = zRoadsFile
  .parse(roadsJson)
  .edges.filter((e) => e.grade === 3 && e.waypoints !== undefined);

describe('road.ts schema：bridges 欄位', () => {
  it('bridges optional：省略時仍解析成功', () => {
    const parsed = zRoadEdge.parse({
      id: 'road.x-y-01',
      a: 'castle.x',
      b: 'castle.y',
      type: 'land',
      grade: 2,
      baseDays: 1,
    });
    expect(parsed.bridges).toBeUndefined();
  });
  it('bridges 偶數陣列：解析為 number[]', () => {
    const parsed = zRoadEdge.parse({
      id: 'road.x-y-01',
      a: 'castle.x',
      b: 'castle.y',
      type: 'land',
      grade: 3,
      baseDays: 1,
      bridges: [10, 20, 30, 40],
    });
    expect(parsed.bridges).toEqual([10, 20, 30, 40]);
  });
});

describe('validate.ts：bridges 長度必為偶數（V5）', () => {
  const loaded = loadRawScenario('s1560');
  const { world } = parseScenario(loaded!.raw);

  it('基準 s1560 無 bridges 長度 V5 違規（真實 bridges 皆偶數）', () => {
    const hits = checkWorld(world).filter((v) => v.check === 'V5' && v.message.includes('bridges'));
    expect(hits).toEqual([]);
  });

  it('注入奇數長度 bridges → V5 違規並指出該邊 id', () => {
    const target = world.roads.find((r) => r.grade === 3)!;
    const mutated: ScenarioWorld = {
      ...world,
      roads: world.roads.map((r) => (r.id === target.id ? { ...r, bridges: [1, 2, 3] } : r)),
    };
    const hits = checkWorld(mutated).filter(
      (v) => v.check === 'V5' && v.message.includes('bridges'),
    );
    expect(hits.length).toBe(1);
    expect(hits[0]!.ids).toContain(target.id);
  });
});

describe('roadDisplayLookup（scenario 分派）', () => {
  it("'s1560' 表含 waypoints 與 bridges（arterial）", () => {
    const table = roadDisplayLookup('s1560');
    const withWp = Object.values(table).filter((e) => e.waypoints !== undefined);
    const withBridges = Object.values(table).filter((e) => e.bridges !== undefined);
    expect(withWp.length).toBeGreaterThan(0);
    expect(withBridges.length).toBeGreaterThan(0);
  });
  it('debug-visual scenario → 回 DEBUG_VISUAL_ROAD_DISPLAY（同參考）', () => {
    expect(roadDisplayLookup(DEBUG_VISUAL_MAP_ID)).toBe(DEBUG_VISUAL_ROAD_DISPLAY);
  });
  it('相同 scenarioId 重複呼叫回同一快取物件', () => {
    expect(roadDisplayLookup('s1560')).toBe(roadDisplayLookup('s1560'));
  });
});

describe('buildMapGraph 併入 bridges（transient MapRoadEdge）', () => {
  it('roadDisplay 之 bridges 併入對應 edge', () => {
    const CA = 'castle.a' as CastleId;
    const CB = 'castle.b' as CastleId;
    const RAB = 'road.ab' as RoadEdgeId;
    const castles: Record<CastleId, CastleNodeInput> = {
      [CA]: { id: CA, pos: { x: 0, y: 0 } },
      [CB]: { id: CB, pos: { x: 100, y: 0 } },
    };
    const districts: Record<DistrictId, DistrictNodeInput> = {};
    const roads: Record<RoadEdgeId, RoadEdge> = {
      [RAB]: { id: RAB, a: CA, b: CB, type: 'land', grade: 3, baseDays: 1 },
    };
    const graph = buildMapGraph(castles, districts, roads, {
      [RAB]: { bridges: [100, 200], waypoints: [50, 50], name: '測試道' },
    });
    const edge = graph.edges.get(RAB);
    expect(edge?.bridges).toEqual([100, 200]);
    expect(edge?.waypoints).toEqual([50, 50]);
    expect(edge?.name).toBe('測試道');
  });
});

describe('s1560 arterial 多段線地形順應（waypoints／bridges 幾何 gate）', () => {
  it('有帶 waypoints 的 grade-3 arterial 存在（≥1）', () => {
    expect(arterialWithWaypoints.length).toBeGreaterThan(0);
  });

  for (const edge of arterialWithWaypoints) {
    describe(edge.id, () => {
      it('waypoints 長度為偶數', () => {
        expect(edge.waypoints!.length % 2).toBe(0);
      });

      it('內部 waypoint 頂點落陸且不落任何山系 mass', () => {
        const wp = edge.waypoints!;
        for (let i = 0; i + 1 < wp.length; i += 2) {
          const x = wp[i]!;
          const y = wp[i + 1]!;
          expect(onLand(x, y), `waypoint (${x},${y}) 應落陸`).toBe(true);
          expect(massAt(x, y), `waypoint (${x},${y}) 不應落 mass`).toBeNull();
        }
      });

      it('沿段密取樣：非端點逼近段不穿海／不穿 mass（端點落 mass 時其相接段豁免 mass）', () => {
        const pts = edgePolyline(edge);
        const last = pts.length - 1;
        const startInMass = massAt(pts[0]!.x, pts[0]!.y) !== null;
        const endInMass = massAt(pts[last]!.x, pts[last]!.y) !== null;
        for (let s = 0; s < last; s++) {
          const a = pts[s]!;
          const b = pts[s + 1]!;
          // 端點逼近段：僅當該端點本身落 mass 時，豁免此段之 mass 檢核。
          const massExempt = (s === 0 && startInMass) || (s === last - 1 && endInMass);
          const d = Math.hypot(b.x - a.x, b.y - a.y);
          const steps = Math.max(2, Math.ceil(d / SAMPLE_STEP));
          for (let k = 0; k <= steps; k++) {
            const t = k / steps;
            const x = a.x + (b.x - a.x) * t;
            const y = a.y + (b.y - a.y) * t;
            expect(onLand(x, y), `seg${s} 取樣 (${Math.round(x)},${Math.round(y)}) 應落陸`).toBe(
              true,
            );
            if (!massExempt) {
              expect(
                massAt(x, y),
                `seg${s} 取樣 (${Math.round(x)},${Math.round(y)}) 不應穿 mass`,
              ).toBeNull();
            }
          }
        }
      });

      if (edge.bridges !== undefined) {
        it('bridges 每個中心點鄰其多段線（≤24wu）', () => {
          const pts = edgePolyline(edge);
          const br = edge.bridges!;
          expect(br.length % 2).toBe(0);
          for (let i = 0; i + 1 < br.length; i += 2) {
            const p = { x: br[i]!, y: br[i + 1]! };
            expect(distToPolyline(p, pts)).toBeLessThanOrEqual(BRIDGE_NEAR_MAX);
          }
        });
      }
    });
  }
});
