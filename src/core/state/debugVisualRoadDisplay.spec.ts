// visual fixture 道路顯示資料（DEBUG_VISUAL_ROAD_DISPLAY）單元測試。
// 規格：plan/18-roadmap.md M6-V6；設計文件 §4.2／§6.1／§8.1（Slice A 驗收）。
//
// 覆蓋：每 key ∈ fixture 街道集；waypoints／bridges 偶數；陸路內部 waypoint 落陸且不落山系 mass
// （端點落 mass 之逼近段豁免）；海路（kakegawa-gifu）中段 waypoints 落海；bridges 鄰其多段線；
// 每個 name ∈ s1560 roads.json name 集（font-subset 安全，處置 spec-F7／eng-F3——本 .ts 未受
// font-charset 掃描，此斷言確保無新字漏入子集）。
//
// kakegawa-gifu 為 **demo-only 例外**（處置 x4-m6）：端點為城、gifu 非真沿海港郡，係承襲既有
// fixture 僅供海路線型 demo，不代表真實地理、不擴散至 s1560——故其 waypoints 刻意落海。
import { describe, expect, it } from 'vitest';

import { DEBUG_VISUAL_ROAD_DISPLAY } from './debugVisualRoadDisplay';
import { buildVisualMapState } from '../debugVisual';
import { pointInPolygon } from '../../data/map/outlineGeometry';
import { zRoadsFile } from '../../data/schemas/road';
import outlineJson from '../../data/map/japan-outline.json';
import terrainJson from '../../data/map/terrain.json';
import roadsJson from '../../data/scenarios/s1560/roads.json';

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

const SAMPLE_STEP = 4;
const BRIDGE_NEAR_MAX = 24;

// fixture state（決定論建構；提供街道集、節點座標、type=sea 判定）。
const state = buildVisualMapState();
const ROAD_BY_ID = new Map(Object.entries(state.roads));
const NODE_POS = new Map<string, { x: number; y: number }>();
for (const c of Object.values(state.castles)) NODE_POS.set(c.id, c.pos);
for (const d of Object.values(state.districts)) NODE_POS.set(d.id, d.pos);

interface Pt {
  x: number;
  y: number;
}
function polylineOf(edgeId: string, waypoints: readonly number[] | undefined): Pt[] {
  const edge = ROAD_BY_ID.get(edgeId)!;
  const a = NODE_POS.get(edge.a)!;
  const b = NODE_POS.get(edge.b)!;
  const mid: Pt[] = [];
  const wp = waypoints ?? [];
  for (let i = 0; i + 1 < wp.length; i += 2) mid.push({ x: wp[i]!, y: wp[i + 1]! });
  return [a, ...mid, b];
}
function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
function distToPolyline(p: Pt, pts: readonly Pt[]): number {
  let min = Infinity;
  for (let i = 0; i + 1 < pts.length; i++)
    min = Math.min(min, distToSegment(p, pts[i]!, pts[i + 1]!));
  return min;
}

const S1560_NAMES = new Set(
  zRoadsFile
    .parse(roadsJson)
    .edges.map((e) => e.name)
    .filter((n): n is string => n !== undefined),
);

const displayIds = Object.keys(DEBUG_VISUAL_ROAD_DISPLAY);

describe('DEBUG_VISUAL_ROAD_DISPLAY', () => {
  it('每個 key 皆為 fixture 之真實街道 id', () => {
    const roadIds = new Set(Object.keys(state.roads));
    for (const id of displayIds) expect(roadIds.has(id), `${id} 應為 fixture 街道`).toBe(true);
  });

  it('waypoints／bridges 長度皆為偶數', () => {
    for (const [id, disp] of Object.entries(DEBUG_VISUAL_ROAD_DISPLAY)) {
      if (disp.waypoints !== undefined) {
        expect(disp.waypoints.length % 2, `${id} waypoints`).toBe(0);
      }
      if (disp.bridges !== undefined) {
        expect(disp.bridges.length % 2, `${id} bridges`).toBe(0);
      }
    }
  });

  it('每個 name 皆 ∈ s1560 roads.json name 集（font-subset 安全）', () => {
    for (const [id, disp] of Object.entries(DEBUG_VISUAL_ROAD_DISPLAY)) {
      if (disp.name !== undefined) {
        expect(S1560_NAMES.has(disp.name), `${id} name「${disp.name}」須 ∈ s1560 names`).toBe(true);
      }
    }
  });

  it('唯一帶 name 者為 road.narumi-sunpu（避免相鄰重複標籤，x1-MINOR4）', () => {
    const named = displayIds.filter((id) => DEBUG_VISUAL_ROAD_DISPLAY[id]!.name !== undefined);
    expect(named).toEqual(['road.narumi-sunpu']);
  });

  it('bridges 每個中心點鄰其多段線（≤24wu）', () => {
    for (const [id, disp] of Object.entries(DEBUG_VISUAL_ROAD_DISPLAY)) {
      if (disp.bridges === undefined) continue;
      const pts = polylineOf(id, disp.waypoints);
      for (let i = 0; i + 1 < disp.bridges.length; i += 2) {
        const p = { x: disp.bridges[i]!, y: disp.bridges[i + 1]! };
        expect(distToPolyline(p, pts), `${id} bridge (${p.x},${p.y})`).toBeLessThanOrEqual(
          BRIDGE_NEAR_MAX,
        );
      }
    }
  });

  describe('陸路多段線地形順應（端點落 mass 之逼近段豁免）', () => {
    for (const id of displayIds) {
      const edge = ROAD_BY_ID.get(id)!;
      if (edge.type === 'sea') continue;
      const disp = DEBUG_VISUAL_ROAD_DISPLAY[id]!;
      it(`${id}：內部 waypoint 落陸且不落 mass`, () => {
        const wp = disp.waypoints ?? [];
        for (let i = 0; i + 1 < wp.length; i += 2) {
          const x = wp[i]!;
          const y = wp[i + 1]!;
          expect(onLand(x, y), `waypoint (${x},${y}) 落陸`).toBe(true);
          expect(massAt(x, y), `waypoint (${x},${y}) 不落 mass`).toBeNull();
        }
      });
      it(`${id}：非端點逼近段沿段密取樣不穿海／不穿 mass`, () => {
        const pts = polylineOf(id, disp.waypoints);
        const last = pts.length - 1;
        const startInMass = massAt(pts[0]!.x, pts[0]!.y) !== null;
        const endInMass = massAt(pts[last]!.x, pts[last]!.y) !== null;
        for (let s = 0; s < last; s++) {
          const a = pts[s]!;
          const b = pts[s + 1]!;
          const massExempt = (s === 0 && startInMass) || (s === last - 1 && endInMass);
          const d = Math.hypot(b.x - a.x, b.y - a.y);
          const steps = Math.max(2, Math.ceil(d / SAMPLE_STEP));
          for (let k = 0; k <= steps; k++) {
            const t = k / steps;
            const x = a.x + (b.x - a.x) * t;
            const y = a.y + (b.y - a.y) * t;
            expect(onLand(x, y), `${id} seg${s} (${Math.round(x)},${Math.round(y)}) 落陸`).toBe(
              true,
            );
            if (!massExempt) {
              expect(
                massAt(x, y),
                `${id} seg${s} (${Math.round(x)},${Math.round(y)}) 不穿 mass`,
              ).toBeNull();
            }
          }
        }
      });
    }
  });

  describe('海路 demo（road.kakegawa-gifu）', () => {
    const SEA_ID = 'road.kakegawa-gifu';
    it('為 type=sea（承襲既有 fixture 之 demo-only 例外）', () => {
      expect(ROAD_BY_ID.get(SEA_ID)!.type).toBe('sea');
    });
    it('中段 waypoints 皆落海（pointInPolygon 為 false）', () => {
      const wp = DEBUG_VISUAL_ROAD_DISPLAY[SEA_ID]!.waypoints!;
      // 中段＝第一與最後 waypoint 之間（含頭尾 waypoint 亦落海，設計 §6.1）。
      for (let i = 0; i + 1 < wp.length; i += 2) {
        const x = wp[i]!;
        const y = wp[i + 1]!;
        expect(onLand(x, y), `海路 waypoint (${x},${y}) 應落海`).toBe(false);
      }
    });
    it('無 name（海路不標名）', () => {
      expect(DEBUG_VISUAL_ROAD_DISPLAY[SEA_ID]!.name).toBeUndefined();
    });
  });
});
