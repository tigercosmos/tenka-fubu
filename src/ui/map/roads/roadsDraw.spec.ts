// `roadsDraw.ts`（RoadsLayer 純繪製）單元測試——[M6-V6] Slice C。
// 規格：M6-V6 技術設計文件 §8.1（roadsDraw.spec 列）、§4.1（buildRoadsLayer 行為）、§3.3/§6.3
// （繪製幾何總表）。涵蓋：edgePolyline（waypoints 展開／缺端點 null）；polylineMidpoint 弧長中點＋
// 角度；道路名法線 ⊥ 方向（含 a=45°）；grade→具名 tier、casing 先於內線、casing 寬>內線寬、
// casing 保留既有材質、mid/near 道級2/3使用土色內線與沿路磨耗；grade1 內線節線；
// 海路 halo/內線/波節皆 waterRiver（無 reliefInk）；
// seaTest 回 false 之點不生波節；橋樑＝deck poly＋2 橋頭；setStage 能見度矩陣（以具名 tiers 斷言）；
// setStage('far') casing 寬＝base×5（per-stage 倍率）；setStage(same) 早退不重描；edge id 字典序決定論。
//
// 本檔自備 recording pixi mock（`vi.mock('pixi.js')`），錄製各繪製方法之呼叫序／引數——共用
// `tests/helpers/pixiMock.ts` 之 Graphics 不記錄呼叫，無法斷言「casing 先於內線」「per-stage 寬」等；
// 沿用 `terrainDraw.spec.ts` 之 hoisted recording-mock 模式（§8.3）。

import { describe, expect, it, vi } from 'vitest';
import type { LodStage } from '../lod';
import { MAP_PALETTE_NUM } from '@ui/styles/tokens';
import castles from '@data/scenarios/s1560/castles.json';
import districts from '@data/scenarios/s1560/districts.json';
import roads from '@data/scenarios/s1560/roads.json';
import {
  ROAD_CASING_WIDTH,
  ROAD_INNER_WIDTH,
  SEA_ROUTE_WIDTH,
  ROAD_STAGE_WIDTH_MULT,
  ROAD_GROUND_STYLE,
  BRIDGE,
} from '../mapViewConfig';

import { BRIDGE_MATERIAL, ROAD_MATERIAL, ROAD_SOIL_MATERIAL } from './roadMaterial';

const hoisted = vi.hoisted(() => {
  class MockDisplayObject {
    children: MockDisplayObject[] = [];
    visible = true;
    parent: MockDisplayObject | null = null;
    addChild<T extends MockDisplayObject>(c: T): T {
      c.parent = this;
      this.children.push(c);
      return c;
    }
    removeChild<T extends MockDisplayObject>(c: T): T {
      this.children = this.children.filter((x) => x !== c);
      return c;
    }
    destroy(opts?: { children?: boolean }): void {
      if (opts?.children === true) for (const c of this.children) c.destroy(opts);
    }
  }
  class MockContainer extends MockDisplayObject {}
  class RecordingGraphics extends MockDisplayObject {
    readonly calls: unknown[][] = [];
    private rec(name: string, args: unknown[]): this {
      this.calls.push([name, ...args]);
      return this;
    }
    clear(...a: unknown[]): this {
      return this.rec('clear', a);
    }
    poly(...a: unknown[]): this {
      return this.rec('poly', a);
    }
    moveTo(...a: unknown[]): this {
      return this.rec('moveTo', a);
    }
    lineTo(...a: unknown[]): this {
      return this.rec('lineTo', a);
    }
    arc(...a: unknown[]): this {
      return this.rec('arc', a);
    }
    fill(...a: unknown[]): this {
      return this.rec('fill', a);
    }
    stroke(...a: unknown[]): this {
      return this.rec('stroke', a);
    }
    countOf(name: string): number {
      return this.calls.filter((c) => c[0] === name).length;
    }
    argsOf(name: string): unknown[][] {
      return this.calls.filter((c) => c[0] === name).map((c) => c.slice(1));
    }
  }
  return { MockDisplayObject, MockContainer, RecordingGraphics };
});

vi.mock('pixi.js', () => ({
  Container: hoisted.MockContainer,
  Graphics: hoisted.RecordingGraphics,
}));

import {
  buildRoadsLayer,
  edgePolyline,
  polylineMidpoint,
  segmentAngleAt,
  strokePolyline,
  drawBridge,
  ROAD_DEPTH_STYLE,
  type RoadsLayer,
} from './roadsDraw';
import type { MapGraph, MapRoadEdge } from '@core/state/mapGraph';

type RecordingGraphics = InstanceType<typeof hoisted.RecordingGraphics>;

describe('quiet road material contract', () => {
  it.each(['far', 'mid', 'near'] as const)(
    'paints grade one and two surfaces at the one-CSS reference floor inside unchanged casing at %s',
    (stage) => {
      const graph = graphOf(
        { a: [100, 100], b: [300, 100] },
        [1, 2, 3].map((grade) => ({
          id: `land${grade}`,
          a: 'a',
          b: 'b',
          grade: grade as 1 | 2 | 3,
        })),
      );
      const layer = buildRoadsLayer(graph);
      layer.setStage(stage);
      const m = { far: 5, mid: 2.5, near: 1 }[stage];
      const scale = { far: 0.25, mid: 0.5, near: 1.25 }[stage];
      for (const [grade, name] of [
        [1, 'path'],
        [2, 'minor'],
        [3, 'arterial'],
      ] as const) {
        const strokes = tier(layer, name)
          .argsOf('stroke')
          .map(([s]) => s as { width: number; color: number });
        // FAR and grade1 retain the original palette; only mid/near grade2/3 adopt soil.
        const material =
          stage === 'far' || grade === 1
            ? ROAD_MATERIAL
            : stage === 'mid'
              ? { arterial: 0xd1b17e, minor: 0xcbbb99 }
              : ROAD_SOIL_MATERIAL;
        const surface = strokes.find(
          (s) => s.color === (grade === 3 ? material.arterial : material.minor),
        )!;
        expect(surface.width).toBe((grade === 3 ? 1.2 : 0.8) * m);
        expect(surface.width * scale).toBeGreaterThanOrEqual(1);
        expect(surface.width).toBeLessThanOrEqual({ 1: 1.5, 2: 2.5, 3: 4 }[grade] * 0.6 * m);
      }
      layer.destroy();
    },
  );
  it.each(['near', 'mid', 'far'] as const)(
    'uses narrowed earth paint and quiet sea at %s without moving paths',
    (stage) => {
      const graph = graphOf({ a: [100, 100], b: [300, 100] }, [
        { id: 'land', a: 'a', b: 'b', grade: 2 },
        { id: 'sea', a: 'a', b: 'b', type: 'sea' },
      ]);
      const layer = buildRoadsLayer(graph);
      layer.setStage(stage);
      const m = ROAD_STAGE_WIDTH_MULT[stage];
      const land = tier(layer, 'minor')
        .argsOf('stroke')
        .map((a) => a[0] as { width: number; color: number; alpha?: number });
      const casing = land[1]!;
      expect(casing).toMatchObject({
        width: ROAD_CASING_WIDTH[2] * m * 0.6,
        color: stage === 'far' ? ROAD_MATERIAL.casing : ROAD_SOIL_MATERIAL.casing,
        alpha: 0.88,
      });
      const sea = tier(layer, 'sea')
        .argsOf('stroke')
        .map((a) => a[0] as { width: number; alpha?: number });
      expect(sea[0]).toMatchObject({ width: SEA_ROUTE_WIDTH.outer * m, alpha: 0.12 });
      expect(sea[1]!.width).toBe(0.8 * m);
      expect(tier(layer, 'minor').argsOf('moveTo')).toContainEqual([100, 100]);
      expect(tier(layer, 'minor').argsOf('lineTo')).toContainEqual([300, 100]);
      layer.destroy();
    },
  );
});

describe('bridge display scale independent of road LOD width', () => {
  it.each(['near', 'mid', 'far'] as const)(
    'keeps both real bridge callers at scale1 at %s',
    (stage) => {
      const nodes: Record<string, [number, number]> = {};
      for (const node of [...castles, ...districts]) nodes[node.id] = [node.pos.x, node.pos.y];
      const edges: EdgeSpec[] = roads.edges
        .filter((e) => e.bridges !== undefined)
        .map((e) => ({
          id: e.id,
          a: e.a,
          b: e.b,
          grade: 3,
          type: 'land',
          ...(e.waypoints === undefined ? {} : { waypoints: e.waypoints }),
          ...(e.bridges === undefined ? {} : { bridges: e.bridges }),
        }));
      expect(edges).toHaveLength(2);
      const layer = buildRoadsLayer(graphOf(nodes, edges));
      layer.setStage(stage);
      const expected = new hoisted.RecordingGraphics();
      // Independent original protected-road segment tangents, not the production angle helper.
      drawBridge(expected as never, 2275, 2958, Math.atan2(5, 54), 1);
      drawBridge(expected as never, 2375, 2795, 0, 1);
      expect(tier(layer, 'bridge').calls.filter((call) => call[0] !== 'clear')).toEqual(
        expected.calls,
      );
      expect(layer.tiers.bridge.visible).toBe(stage !== 'far');
      const clears = tier(layer, 'bridge').countOf('clear');
      layer.setStage(stage);
      expect(tier(layer, 'bridge').countOf('clear')).toBe(clears);
      layer.destroy();
    },
  );
});

interface EdgeSpec {
  id: string;
  a: string;
  b: string;
  grade?: 1 | 2 | 3;
  type?: 'land' | 'sea';
  waypoints?: number[];
  bridges?: number[];
  name?: string;
}

/** 建最小 MapGraph（僅 nodes/edges，adjacency 空——roadsDraw 不用）。 */
function graphOf(nodes: Record<string, [number, number]>, edges: EdgeSpec[]): MapGraph {
  const nodeMap = new Map<string, unknown>();
  for (const [id, [x, y]] of Object.entries(nodes)) {
    nodeMap.set(id, { id, kind: 'castle', pos: { x, y }, isPort: false });
  }
  const edgeMap = new Map<string, MapRoadEdge>();
  for (const e of edges) {
    edgeMap.set(e.id, {
      id: e.id as MapRoadEdge['id'],
      a: e.a as MapRoadEdge['a'],
      b: e.b as MapRoadEdge['b'],
      type: e.type ?? 'land',
      grade: e.grade ?? 3,
      baseDays: 1,
      ...(e.waypoints !== undefined ? { waypoints: e.waypoints } : {}),
      ...(e.bridges !== undefined ? { bridges: e.bridges } : {}),
      ...(e.name !== undefined ? { name: e.name } : {}),
    });
  }
  return {
    nodes: nodeMap,
    edges: edgeMap,
    adjacency: new Map(),
  } as unknown as MapGraph;
}

function tier(layer: RoadsLayer, name: keyof RoadsLayer['tiers']): RecordingGraphics {
  return layer.tiers[name] as unknown as RecordingGraphics;
}

describe('edgePolyline', () => {
  it('無 waypoints：回兩端點直線', () => {
    const g = graphOf({ a: [0, 0], b: [100, 0] }, [{ id: 'road.x', a: 'a', b: 'b' }]);
    const edge = g.edges.get('road.x' as MapRoadEdge['id'])!;
    expect(edgePolyline(edge, g)).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
  });

  it('有 waypoints：展開為 [a, ...waypoints, b]', () => {
    const g = graphOf({ a: [0, 0], b: [100, 0] }, [
      { id: 'road.x', a: 'a', b: 'b', waypoints: [30, 20, 60, 20] },
    ]);
    const edge = g.edges.get('road.x' as MapRoadEdge['id'])!;
    expect(edgePolyline(edge, g)).toEqual([
      { x: 0, y: 0 },
      { x: 30, y: 20 },
      { x: 60, y: 20 },
      { x: 100, y: 0 },
    ]);
  });

  it('端點缺失 → 回 null', () => {
    const g = graphOf({ a: [0, 0] }, [{ id: 'road.x', a: 'a', b: 'missing' }]);
    const edge = g.edges.get('road.x' as MapRoadEdge['id'])!;
    expect(edgePolyline(edge, g)).toBeNull();
  });
});

describe('polylineMidpoint', () => {
  it('直線水平段：中點居中、角度 0', () => {
    expect(
      polylineMidpoint([
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ]),
    ).toEqual({ x: 50, y: 0, angle: 0 });
  });

  it('多段線：以弧長中點定位（非頂點數中點）', () => {
    // (0,0)-(0,60)-(80,60)：總長 140、半長 70 落於第二段 t=0.125 → (10,60)，角度 0。
    const mid = polylineMidpoint([
      { x: 0, y: 0 },
      { x: 0, y: 60 },
      { x: 80, y: 60 },
    ])!;
    expect(mid.x).toBeCloseTo(10, 6);
    expect(mid.y).toBeCloseTo(60, 6);
    expect(mid.angle).toBeCloseTo(0, 6);
  });

  it('空／單點 → null', () => {
    expect(polylineMidpoint([])).toBeNull();
    expect(polylineMidpoint([{ x: 1, y: 1 }])).toBeNull();
  });
});

describe('道路名法線：真法線 ⊥ 段方向且偏上（處置 spec-F1/eng-F1）', () => {
  // MapRenderer（Slice F）以 polylineMidpoint 之 angle 推法線；此處驗證該 angle 能導出正確法線。
  function labelNormal(angle: number): { nx: number; ny: number } {
    let nx = -Math.sin(angle);
    let ny = Math.cos(angle);
    if (ny > 0) {
      nx = -nx;
      ny = -ny;
    }
    return { nx, ny };
  }

  it('a=45° 對角路：法線與段方向內積≈0（垂直）且 y 分量<0（偏上）', () => {
    const mid = polylineMidpoint([
      { x: 0, y: 0 },
      { x: 100, y: 100 },
    ])!;
    expect(mid.angle).toBeCloseTo(Math.PI / 4, 6);
    const { nx, ny } = labelNormal(mid.angle);
    const dir = { x: Math.cos(mid.angle), y: Math.sin(mid.angle) };
    expect(nx * dir.x + ny * dir.y).toBeCloseTo(0, 6);
    expect(ny).toBeLessThan(0);
  });

  it('水平路：法線垂直向上（0,-1）', () => {
    const { nx, ny } = labelNormal(0);
    expect(nx).toBeCloseTo(0, 6);
    expect(ny).toBeCloseTo(-1, 6);
  });
});

describe('segmentAngleAt', () => {
  it('回最接近點所屬段之方向角', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 0, y: 100 },
      { x: 100, y: 100 },
    ];
    expect(segmentAngleAt(pts, 0, 50)).toBeCloseTo(Math.PI / 2, 6); // 第一段（垂直）
    expect(segmentAngleAt(pts, 50, 100)).toBeCloseTo(0, 6); // 第二段（水平）
  });
});

describe('buildRoadsLayer — 結構與 z-order', () => {
  it.each(['mid', 'near'] as const)(
    'keeps a raised bridge above its grade-three ground strokes at %s',
    (stage) => {
      const layer = buildRoadsLayer(
        graphOf({ a: [0, 0], b: [100, 0] }, [
          { id: 'road.crossing', a: 'a', b: 'b', grade: 3, bridges: [50, 0] },
        ]),
      );
      layer.setStage(stage);
      const children = (layer.container as unknown as { children: unknown[] }).children;
      expect(tier(layer, 'bridge').countOf('poly')).toBeGreaterThan(0);
      expect(tier(layer, 'arterial').countOf('stroke')).toBeGreaterThan(0);
      expect(children.indexOf(layer.tiers.bridge)).toBeGreaterThan(
        children.indexOf(layer.tiers.arterial),
      );
      layer.destroy();
    },
  );

  it('container 掛 5 個具名 tier（下→上 sea/path/minor/arterial/bridge）', () => {
    const layer = buildRoadsLayer(graphOf({ a: [0, 0], b: [1, 0] }, []));
    const container = layer.container as unknown as { children: unknown[] };
    expect(container.children).toHaveLength(5);
    expect(container.children[0]).toBe(layer.tiers.sea);
    expect(container.children[1]).toBe(layer.tiers.path);
    expect(container.children[2]).toBe(layer.tiers.minor);
    expect(container.children[3]).toBe(layer.tiers.arterial);
    expect(container.children[4]).toBe(layer.tiers.bridge);
  });

  it('build 時不描繪（首次 setStage 前 tier 無 stroke）', () => {
    const layer = buildRoadsLayer(
      graphOf({ a: [0, 0], b: [100, 0] }, [{ id: 'road.x', a: 'a', b: 'b', grade: 3 }]),
    );
    expect(tier(layer, 'arterial').countOf('stroke')).toBe(0);
  });
});

describe('buildRoadsLayer — 道級分派＋casing/內線', () => {
  it('bounds longitudinal earth wear on very long edges without changing road widths or per-day redraw behavior', () => {
    const graph = graphOf({ a: [0, 0], b: [1_000_000, 0] }, [
      { id: 'long', a: 'a', b: 'b', grade: 3 },
    ]);
    const layer = buildRoadsLayer(graph);
    layer.setStage('near');
    const g = tier(layer, 'arterial');
    expect(g.countOf('moveTo')).toBe(3 + ROAD_GROUND_STYLE.grainMaxPerEdge);
    expect(g.countOf('lineTo')).toBe(3 + ROAD_GROUND_STYLE.grainMaxPerEdge);
    expect(g.countOf('stroke')).toBe(4);
    const before = structuredClone(g.calls);
    layer.setStage('near');
    expect(g.calls).toEqual(before);
    layer.destroy();
  });

  it('keeps earth-wear arc stations continuous across waypoints and duplicate vertices on the original route', () => {
    const graph = graphOf({ a: [0, 0], b: [10, 30] }, [
      { id: 'corner', a: 'a', b: 'b', grade: 3, waypoints: [10, 0, 10, 0] },
    ]);
    const before = structuredClone(graph);
    const layer = buildRoadsLayer(graph);
    layer.setStage('near');
    const g = tier(layer, 'arterial');
    // Three surface passes traverse every exact original vertex; wear is longitudinal.
    expect(g.argsOf('lineTo').slice(0, 3)).toEqual([
      [10, 0],
      [10, 0],
      [10, 30],
    ]);
    const starts = g.argsOf('moveTo').slice(3) as number[][];
    const ends = g.argsOf('lineTo').slice(9) as number[][];
    const centers = starts.map((a, i) => [(a[0]! + ends[i]![0]!) / 2, (a[1]! + ends[i]![1]!) / 2]);
    expect(centers).toEqual([
      [7, 0],
      [10, 8],
      [10, 19],
    ]);
    // Same old arc stations, but bounded spans now follow each source tangent.
    expect(starts).toEqual([
      [4, 0],
      [10, 4.7],
      [10, 15.7],
    ]);
    expect(ends).toEqual([
      [10, 0],
      [10, 11.3],
      [10, 22.3],
    ]);
    expect(g.argsOf('moveTo').flat().every(Number.isFinite)).toBe(true);
    expect(g.argsOf('lineTo').flat().every(Number.isFinite)).toBe(true);
    expect(graph).toEqual(before);
    layer.destroy();
  });

  it('retains the exact legacy far shadow, casing, surface and shoulder geometry', () => {
    const layer = buildRoadsLayer(
      graphOf({ a: [0, 0], b: [100, 0] }, [{ id: 'far', a: 'a', b: 'b', grade: 3 }]),
    );
    layer.setStage('far');
    const g = tier(layer, 'arterial');
    const m = ROAD_STAGE_WIDTH_MULT.far;
    expect(g.argsOf('moveTo')).toEqual([
      [1.2 * m, 1.2 * m],
      [0, 0],
      [0, 0],
      [-0.25 * m, -0.25 * m],
    ]);
    expect(g.argsOf('stroke').map(([style]) => (style as { color: number }).color)).toEqual([
      ROAD_MATERIAL.casing,
      ROAD_MATERIAL.casing,
      ROAD_MATERIAL.arterial,
      MAP_PALETTE_NUM.plainLight,
    ]);
    layer.destroy();
  });

  it.each([
    ['near', 2, 1],
    ['near', 3, 1],
    ['mid', 2, 2.5],
    ['mid', 3, 2.5],
  ] as const)(
    'grounds %s grade%s on the exact centerline without a raised shadow',
    (stage, grade, m) => {
      const graph = graphOf({ a: [0, 0], b: [100, 0] }, [{ id: 'soil', a: 'a', b: 'b', grade }]);
      const before = structuredClone(graph);
      const layer = buildRoadsLayer(graph);
      layer.setStage(stage);
      const g = tier(layer, grade === 3 ? 'arterial' : 'minor');
      expect(g.argsOf('moveTo').slice(0, 3)).toEqual([
        [0, 0],
        [0, 0],
        [0, 0],
      ]);
      const strokes = g
        .argsOf('stroke')
        .map(([style]) => style as { width: number; color: number; alpha: number });
      expect(strokes[0]).toMatchObject({
        width: (ROAD_CASING_WIDTH[grade] + 2) * m * ROAD_MATERIAL.landWidthFactor,
        color: ROAD_MATERIAL.casing,
        alpha: ROAD_MATERIAL.vergeAlpha,
      });
      expect(strokes[1]).toMatchObject({
        width: ROAD_CASING_WIDTH[grade] * m * ROAD_MATERIAL.landWidthFactor,
        alpha: ROAD_MATERIAL.casingAlpha,
      });
      expect(strokes[2]).toMatchObject({
        width: (grade === 3 ? 1.2 : 0.8) * m,
        color:
          stage === 'mid' ? (grade === 3 ? 0xd1b17e : 0xcbbb99) : grade === 3 ? 0xc6a675 : 0xba9e72,
        alpha: ROAD_MATERIAL.surfaceAlpha,
      });
      expect(strokes[3]).toMatchObject({
        width: ROAD_INNER_WIDTH[grade] * m * 0.3,
        color: 0x897858,
        alpha: 0.24,
      });
      expect(graph).toEqual(before);
      layer.destroy();
    },
  );

  it('grade3 → arterial tier；grade2→minor；grade1→path', () => {
    const layer = buildRoadsLayer(
      graphOf({ a: [0, 0], b: [100, 0], c: [0, 100], d: [100, 100], e: [0, 200], f: [100, 200] }, [
        { id: 'road.a3', a: 'a', b: 'b', grade: 3 },
        { id: 'road.b2', a: 'c', b: 'd', grade: 2 },
        { id: 'road.c1', a: 'e', b: 'f', grade: 1 },
      ]),
    );
    layer.setStage('near');
    expect(tier(layer, 'arterial').countOf('stroke')).toBeGreaterThan(0);
    expect(tier(layer, 'minor').countOf('stroke')).toBeGreaterThan(0);
    expect(tier(layer, 'path').countOf('stroke')).toBeGreaterThan(0);
    // One arterial edge: centered verge, casing, earth surface, longitudinal wear.
    expect(tier(layer, 'arterial').countOf('stroke')).toBe(4);
  });

  it('casing 先於內線；casing 寬>內線寬；casing 色=soil.casing、內線色=soil.arterial（near m=1）', () => {
    const layer = buildRoadsLayer(
      graphOf({ a: [0, 0], b: [100, 0] }, [{ id: 'road.x', a: 'a', b: 'b', grade: 3 }]),
    );
    layer.setStage('near');
    const strokes = tier(layer, 'arterial')
      .argsOf('stroke')
      .map(
        (s) =>
          s[0] as {
            width: number;
            color: number;
          },
      );
    expect(strokes).toHaveLength(4);
    expect(strokes[0]!.color).toBe(ROAD_MATERIAL.casing);
    expect(strokes[1]!.color).toBe(ROAD_SOIL_MATERIAL.casing);
    expect(strokes[1]!.width).toBe(ROAD_CASING_WIDTH[3] * ROAD_MATERIAL.landWidthFactor);
    expect(strokes[2]!.color).toBe(ROAD_SOIL_MATERIAL.arterial);
    expect(strokes[2]!.width).toBe(ROAD_INNER_WIDTH[3] * ROAD_MATERIAL.landWidthFactor);
    expect(strokes[1]!.width).toBeGreaterThan(strokes[2]!.width);
    expect(strokes[3]!.color).toBe(ROAD_SOIL_MATERIAL.wearColor);
  });

  it('多條同 tier 邊：先全部 casing 再全部內線（跨邊兩趟）', () => {
    const layer = buildRoadsLayer(
      graphOf({ a: [0, 0], b: [100, 0], c: [0, 50], d: [100, 50] }, [
        { id: 'road.a', a: 'a', b: 'b', grade: 3 },
        { id: 'road.b', a: 'c', b: 'd', grade: 3 },
      ]),
    );
    layer.setStage('near');
    const colors = tier(layer, 'arterial')
      .argsOf('stroke')
      .map((s) => (s[0] as { color: number }).color);
    // Shared passes keep crossing road surfaces above every verge and casing.
    expect(colors).toEqual([
      ROAD_MATERIAL.casing,
      ROAD_MATERIAL.casing,
      ROAD_SOIL_MATERIAL.casing,
      ROAD_SOIL_MATERIAL.casing,
      ROAD_SOIL_MATERIAL.arterial,
      ROAD_SOIL_MATERIAL.arterial,
      ROAD_SOIL_MATERIAL.wearColor,
      ROAD_SOIL_MATERIAL.wearColor,
    ]);
  });

  it('grade1 內線為節線（多段 moveTo/lineTo），casing 為單線', () => {
    const layer = buildRoadsLayer(
      graphOf({ a: [0, 0], b: [100, 0] }, [{ id: 'road.x', a: 'a', b: 'b', grade: 1 }]),
    );
    layer.setStage('near');
    const path = tier(layer, 'path');
    // casing（1 moveTo）＋內線節線（多 moveTo）→ 總 moveTo 明顯 >2；stroke=2（casing+dash）。
    expect(path.countOf('stroke')).toBe(3);
    expect(path.countOf('moveTo')).toBeGreaterThan(2);
    const innerColor = (path.argsOf('stroke')[2]![0] as { color: number }).color;
    expect(innerColor).toBe(ROAD_MATERIAL.minor);
  });
});

describe('buildRoadsLayer — 海路（全走 waterRiver、波節、seaTest 抑陸）', () => {
  it('halo/內線/波節皆 waterRiver（無 reliefInk）；halo 為低 alpha、outer 寬', () => {
    const layer = buildRoadsLayer(
      graphOf({ a: [0, 0], b: [400, 0] }, [
        { id: 'road.sea', a: 'a', b: 'b', type: 'sea', grade: 1 },
      ]),
    );
    layer.setStage('near');
    const sea = tier(layer, 'sea');
    const strokes = sea
      .argsOf('stroke')
      .map((s) => s[0] as { width: number; color: number; alpha?: number });
    expect(strokes.length).toBeGreaterThan(0);
    for (const s of strokes) expect(s.color).toBe(MAP_PALETTE_NUM.waterRiver);
    // 第一筆為外 halo：outer 寬（near m=1）、低 alpha。
    expect(strokes[0]!.width).toBe(SEA_ROUTE_WIDTH.outer);
    expect(strokes[0]!.alpha).toBe(ROAD_MATERIAL.seaOuterAlpha);
    // 有波節（arc）。
    expect(sea.countOf('arc')).toBeGreaterThan(0);
  });

  it('seaTest 全 false（皆落陸）→ 不生任何波節 arc（陸段抑制）', () => {
    const layer = buildRoadsLayer(
      graphOf({ a: [0, 0], b: [400, 0] }, [
        { id: 'road.sea', a: 'a', b: 'b', type: 'sea', grade: 1 },
      ]),
      () => false,
    );
    layer.setStage('near');
    expect(tier(layer, 'sea').countOf('arc')).toBe(0);
    // 仍有 halo＋節線內線（線型不受 seaTest 影響）。
    expect(tier(layer, 'sea').countOf('stroke')).toBeGreaterThan(0);
  });

  it('海路走 seaGfx，不落陸路 tier', () => {
    const layer = buildRoadsLayer(
      graphOf({ a: [0, 0], b: [400, 0] }, [
        { id: 'road.sea', a: 'a', b: 'b', type: 'sea', grade: 3 },
      ]),
    );
    layer.setStage('near');
    // type='sea' grade=3 不得畫進 arterial tier。
    expect(tier(layer, 'arterial').countOf('stroke')).toBe(0);
    expect(tier(layer, 'sea').countOf('stroke')).toBeGreaterThan(0);
  });
});

describe('buildRoadsLayer — 橋樑', () => {
  it.each([ROAD_STAGE_WIDTH_MULT.mid, ROAD_STAGE_WIDTH_MULT.near])(
    'keeps every wood board inside the original deck footprint at multiplier %s',
    (m) => {
      for (const angle of [0, Math.PI / 4, Math.PI / 2, Math.PI]) {
        const g = new hoisted.RecordingGraphics();
        drawBridge(g as never, 50, 30, angle, m);
        const hl = (BRIDGE.deckLength * m) / 2;
        const hw = (BRIDGE.deckWidth * m) / 2;
        const lift = ROAD_DEPTH_STYLE.bridgeLift * m;
        const ux = Math.cos(angle);
        const uy = Math.sin(angle);
        for (const [index, call] of g.calls.entries()) {
          if (call[0] !== 'stroke') continue;
          const stroke = call[1] as { cap?: string; width: number };
          if (stroke.cap !== 'butt') continue;
          const from = g.calls[index - 2]!;
          const to = g.calls[index - 1]!;
          expect(from[0]).toBe('moveTo');
          expect(to[0]).toBe('lineTo');
          for (const point of [from, to]) {
            const x = (point[1] as number) - 50;
            const y = (point[2] as number) - 30 + lift;
            const along = x * ux + y * uy;
            const across = -x * uy + y * ux;
            expect(Math.abs(across)).toBeCloseTo(hw);
            expect(Math.abs(along) + stroke.width / 2).toBeLessThanOrEqual(hl + 1e-10);
          }
        }
      }
    },
  );

  it.each([0, Math.PI / 4, Math.PI / 2, Math.PI])(
    'adds five low-contrast wood planks and bounded stone joints at angle %s',
    (angle) => {
      const g = new hoisted.RecordingGraphics();
      drawBridge(g as never, 50, 30, angle, 1);
      const strokes = g.argsOf('stroke').map(
        (args) =>
          args[0] as {
            color: number;
            width: number;
            alpha?: number;
            cap?: string;
          },
      );
      const wood = strokes.filter((stroke) => stroke.cap === 'butt');
      expect(wood).toHaveLength(5);
      expect(wood.map((stroke) => stroke.alpha)).toEqual([0.1, 0.16, 0.1, 0.16, 0.1]);
      for (const plank of wood) {
        expect(plank.color).toBe(BRIDGE_MATERIAL.woodDark);
        expect(plank.width).toBeCloseTo(BRIDGE.deckLength / 5);
      }
      expect(strokes.filter((stroke) => stroke.alpha === 0.45)).toHaveLength(4);
      expect(
        strokes.some(
          (stroke) => stroke.color === BRIDGE_MATERIAL.highlight && stroke.alpha === 0.7,
        ),
      ).toBe(true);
      const faces = g
        .argsOf('fill')
        .filter((args) => (args[0] as { alpha?: number }).alpha === 0.78);
      expect(faces.length).toBeGreaterThanOrEqual(1);
      expect(faces.length).toBeLessThanOrEqual(2);
      for (const face of faces)
        expect(face[0]).toMatchObject({ color: BRIDGE_MATERIAL.woodDark, alpha: 0.78 });
      expect(g.countOf('poly')).toBeLessThanOrEqual(6);
      expect(g.countOf('stroke')).toBeLessThanOrEqual(22);
      const second = new hoisted.RecordingGraphics();
      drawBridge(second as never, 50, 30, angle, 1);
      expect(second.calls).toEqual(g.calls);
    },
  );

  it.each([0, Math.PI / 4, Math.PI / 2, Math.PI])(
    'exposes only the south/east exterior bridge faces at angle %s',
    (angle) => {
      const g = new hoisted.RecordingGraphics();
      drawBridge(g as never, 50, 30, angle, 1);
      const polygons = g.argsOf('poly').map((args) => args[0] as number[]);
      const deckIndex = g
        .argsOf('fill')
        .findIndex((args) => (args[0] as { color: number }).color === BRIDGE_MATERIAL.deck);
      for (const face of polygons.slice(1, deckIndex)) {
        const dx = face[2]! - face[0]!;
        const dy = face[3]! - face[1]!;
        expect(dy - dx).toBeGreaterThan(0);
      }
      if (angle === 0) {
        const horizontal = polygons.slice(1, deckIndex).find((face) => face[1] === face[3])!;
        expect(horizontal[1]).toBeGreaterThan(30 - ROAD_DEPTH_STYLE.bridgeLift);
        const vertical = polygons.slice(1, deckIndex).find((face) => face[0] === face[2])!;
        expect(vertical[0]).toBeGreaterThan(50);
      }
    },
  );

  it.each([0, Math.PI / 4, Math.PI / 2, Math.PI])(
    'draws lifted deck and connected side faces at angle %s without moving the route anchor',
    (angle) => {
      const g = new hoisted.RecordingGraphics();
      drawBridge(g as never, 50, 30, angle, 1);
      const polygons = g.argsOf('poly').map((args) => args[0] as number[]);
      expect(polygons.length).toBeGreaterThanOrEqual(5);
      expect(polygons.length).toBeLessThanOrEqual(6);
      const deckIndex = g
        .argsOf('fill')
        .findIndex((args) => (args[0] as { color: number }).color === BRIDGE_MATERIAL.deck);
      const deck = polygons[deckIndex]!;
      const xs = deck.filter((_, index) => index % 2 === 0);
      const ys = deck.filter((_, index) => index % 2 === 1);
      expect(xs.reduce((sum, value) => sum + value, 0) / 4).toBeCloseTo(50);
      expect(ys.reduce((sum, value) => sum + value, 0) / 4).toBeCloseTo(
        30 - ROAD_DEPTH_STYLE.bridgeLift,
      );
      for (const face of polygons.slice(1, deckIndex)) {
        expect(face.every(Number.isFinite)).toBe(true);
        expect(face[5]! - face[3]!).toBeCloseTo(ROAD_DEPTH_STYLE.bridgeLift);
        expect(face[7]! - face[1]!).toBeCloseTo(ROAD_DEPTH_STYLE.bridgeLift);
      }
    },
  );

  it('depth cues are deterministic and do not mutate input graph vertices', () => {
    const graph = graphOf({ a: [0, 0], b: [100, 20] }, [
      { id: 'road.x', a: 'a', b: 'b', grade: 3 },
    ]);
    const before = structuredClone(graph);
    const layer = buildRoadsLayer(graph);
    layer.setStage('near');
    const first = structuredClone(tier(layer, 'arterial').calls);
    layer.setStage('far');
    layer.setStage('near');
    const calls = tier(layer, 'arterial').calls;
    let lastClear = calls.length - 1;
    while (lastClear >= 0 && calls[lastClear]![0] !== 'clear') lastClear -= 1;
    expect(calls.slice(lastClear)).toEqual(first);
    expect(graph).toEqual(before);
    const moves = tier(layer, 'arterial').argsOf('moveTo');
    expect(moves[0]).toEqual([0, 0]);
    expect(moves[1]).toEqual([0, 0]);
  });

  it('每座橋＝木色 deck poly（fill+stroke）＋2 石色橋頭（fill）', () => {
    const layer = buildRoadsLayer(
      graphOf({ a: [0, 0], b: [100, 0] }, [
        { id: 'road.x', a: 'a', b: 'b', grade: 3, bridges: [50, 0] },
      ]),
    );
    layer.setStage('near');
    const bridge = tier(layer, 'bridge');
    expect(bridge.countOf('poly')).toBe(6); // Shadow + two side faces + deck + two abutments.
    expect(bridge.countOf('fill')).toBe(6);
    expect(bridge.countOf('stroke')).toBe(22); // Existing 11 + five wood fills, four joints, two NW edges.
    const fills = bridge.argsOf('fill').map((f) => (f[0] as { color: number }).color);
    expect(fills[0]).toBe(MAP_PALETTE_NUM.reliefInk);
    expect(fills[1]).toBe(BRIDGE_MATERIAL.woodDark); // SE exposed wood faces.
    expect(fills[2]).toBe(BRIDGE_MATERIAL.woodDark);
    expect(fills[3]).toBe(BRIDGE_MATERIAL.deck);
    expect(fills.slice(4)).toEqual([BRIDGE_MATERIAL.stone, BRIDGE_MATERIAL.stone]);
  });

  it('多對 bridges → 多座橋', () => {
    const layer = buildRoadsLayer(
      graphOf({ a: [0, 0], b: [200, 0] }, [
        { id: 'road.x', a: 'a', b: 'b', grade: 3, bridges: [50, 0, 150, 0] },
      ]),
    );
    layer.setStage('near');
    expect(tier(layer, 'bridge').countOf('poly')).toBe(12);
  });
});

describe('buildRoadsLayer — setStage 能見度矩陣＋per-stage 倍率＋早退', () => {
  function layerWithAll(): RoadsLayer {
    return buildRoadsLayer(
      graphOf(
        {
          a: [0, 0],
          b: [100, 0],
          c: [0, 50],
          d: [100, 50],
          e: [0, 100],
          f: [400, 100],
          p: [0, 150],
          q: [400, 150],
        },
        [
          { id: 'road.a3', a: 'a', b: 'b', grade: 3, bridges: [50, 0] },
          { id: 'road.b2', a: 'c', b: 'd', grade: 2 },
          { id: 'road.c1', a: 'e', b: 'f', grade: 1 },
          { id: 'road.sea', a: 'p', b: 'q', type: 'sea', grade: 1 },
        ],
      ),
    );
  }

  function vis(layer: RoadsLayer): Record<keyof RoadsLayer['tiers'], boolean> {
    return {
      sea: layer.tiers.sea.visible,
      path: layer.tiers.path.visible,
      bridge: layer.tiers.bridge.visible,
      minor: layer.tiers.minor.visible,
      arterial: layer.tiers.arterial.visible,
    };
  }

  it('far：arterial+sea 顯；minor/bridge/path 隱', () => {
    const layer = layerWithAll();
    layer.setStage('far');
    expect(vis(layer)).toEqual({
      sea: true,
      arterial: true,
      minor: false,
      bridge: false,
      path: false,
    });
  });

  it('mid：+minor+bridge；path 仍隱', () => {
    const layer = layerWithAll();
    layer.setStage('mid');
    expect(vis(layer)).toEqual({
      sea: true,
      arterial: true,
      minor: true,
      bridge: true,
      path: false,
    });
  });

  it('near：全顯', () => {
    const layer = layerWithAll();
    layer.setStage('near');
    expect(vis(layer)).toEqual({
      sea: true,
      arterial: true,
      minor: true,
      bridge: true,
      path: true,
    });
  });

  it('連續切換 far→near→far 每次矩陣正確（非殘留）', () => {
    const layer = layerWithAll();
    layer.setStage('far');
    layer.setStage('near');
    layer.setStage('far');
    expect(vis(layer)).toEqual({
      sea: true,
      arterial: true,
      minor: false,
      bridge: false,
      path: false,
    });
  });

  it("setStage('far') casing 寬＝nominal×5×material.factor（per-stage 倍率，處置 x2-M1/x4-M1）", () => {
    const layer = buildRoadsLayer(
      graphOf({ a: [0, 0], b: [100, 0] }, [{ id: 'road.x', a: 'a', b: 'b', grade: 3 }]),
    );
    layer.setStage('far');
    const casing = tier(layer, 'arterial').argsOf('stroke')[1]![0] as { width: number };
    expect(casing.width).toBe(
      ROAD_CASING_WIDTH[3] * ROAD_STAGE_WIDTH_MULT.far * ROAD_MATERIAL.landWidthFactor,
    );
  });

  it('setStage(same) 早退：clear 呼叫數不增（守 day-only tick 契約）', () => {
    const layer = layerWithAll();
    layer.setStage('near');
    const clears = tier(layer, 'arterial').countOf('clear');
    layer.setStage('near'); // 重複同 stage
    layer.setStage('near');
    expect(tier(layer, 'arterial').countOf('clear')).toBe(clears);
  });

  it('stage 改變 → 重描（clear 呼叫數 +1）', () => {
    const layer = layerWithAll();
    layer.setStage('near');
    const clears = tier(layer, 'arterial').countOf('clear');
    layer.setStage('far');
    expect(tier(layer, 'arterial').countOf('clear')).toBe(clears + 1);
  });
});

describe('buildRoadsLayer — 決定論（edge id 字典序）', () => {
  it('arterial casing 依 edge id 字典序繪製（不依輸入序）', () => {
    const layer = buildRoadsLayer(
      graphOf({ a: [10, 0], b: [20, 0], c: [900, 0], d: [910, 0] }, [
        { id: 'road.zzz', a: 'c', b: 'd', grade: 3 }, // 輸入序在前
        { id: 'road.aaa', a: 'a', b: 'b', grade: 3 },
      ]),
    );
    layer.setStage('near');
    // casing 兩趟之首（road.aaa 起點 x=10）先於 road.zzz（x=900）。
    const moveXs = tier(layer, 'arterial')
      .argsOf('moveTo')
      .map((m) => m[0] as number);
    expect(moveXs[0]).toBe(10);
    expect(moveXs[2]).toBe(10); // First actual casing stays on the physical route.
  });
});

describe('strokePolyline（export，供 Slice E 復用）', () => {
  it('少於兩點不描繪', () => {
    const layer = buildRoadsLayer(graphOf({ a: [0, 0], b: [1, 0] }, []));
    const g = layer.tiers.arterial as unknown as RecordingGraphics;
    strokePolyline(g as never, [{ x: 0, y: 0 }], 5, 0xffffff);
    expect(g.countOf('stroke')).toBe(0);
  });

  it('依序 moveTo→lineTo…→單次 stroke（round cap/join）', () => {
    const layer = buildRoadsLayer(graphOf({ a: [0, 0], b: [1, 0] }, []));
    const g = layer.tiers.arterial as unknown as RecordingGraphics;
    strokePolyline(
      g as never,
      [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 5 },
      ],
      5,
      0x123456,
      0.5,
    );
    expect(g.countOf('moveTo')).toBe(1);
    expect(g.countOf('lineTo')).toBe(2);
    expect(g.countOf('stroke')).toBe(1);
    const s = g.argsOf('stroke')[0]![0] as {
      width: number;
      color: number;
      alpha: number;
      cap: string;
      join: string;
    };
    expect(s).toMatchObject({ width: 5, color: 0x123456, alpha: 0.5, cap: 'round', join: 'round' });
  });
});

describe('buildRoadsLayer — destroy', () => {
  it('destroy 級聯銷毀 container children', () => {
    const layer = buildRoadsLayer(
      graphOf({ a: [0, 0], b: [100, 0] }, [{ id: 'road.x', a: 'a', b: 'b', grade: 3 }]),
    );
    const children = (layer.container as unknown as { children: { destroy: () => void }[] })
      .children;
    const spies = children.map((c) => vi.spyOn(c, 'destroy'));
    layer.destroy();
    for (const spy of spies) expect(spy).toHaveBeenCalled();
  });

  it('setStage 接受任意 LodStage 型別（編譯 smoke）', () => {
    const layer = buildRoadsLayer(graphOf({ a: [0, 0], b: [1, 0] }, []));
    const stages: LodStage[] = ['far', 'mid', 'near'];
    for (const s of stages) layer.setStage(s);
    expect(layer.tiers.arterial.visible).toBe(true);
  });
});
