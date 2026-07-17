// `roadsDraw.ts`（RoadsLayer 純繪製）單元測試——[M6-V6] Slice C。
// 規格：M6-V6 技術設計文件 §8.1（roadsDraw.spec 列）、§4.1（buildRoadsLayer 行為）、§3.3/§6.3
// （繪製幾何總表）。涵蓋：edgePolyline（waypoints 展開／缺端點 null）；polylineMidpoint 弧長中點＋
// 角度；道路名法線 ⊥ 方向（含 a=45°）；grade→具名 tier、casing 先於內線、casing 寬>內線寬、
// casing 色=roadCasing；grade1 內線節線；海路 halo/內線/波節皆 waterRiver（無 reliefInk）；
// seaTest 回 false 之點不生波節；橋樑＝deck poly＋2 橋頭；setStage 能見度矩陣（以具名 tiers 斷言）；
// setStage('far') casing 寬＝base×5（per-stage 倍率）；setStage(same) 早退不重描；edge id 字典序決定論。
//
// 本檔自備 recording pixi mock（`vi.mock('pixi.js')`），錄製各繪製方法之呼叫序／引數——共用
// `tests/helpers/pixiMock.ts` 之 Graphics 不記錄呼叫，無法斷言「casing 先於內線」「per-stage 寬」等；
// 沿用 `terrainDraw.spec.ts` 之 hoisted recording-mock 模式（§8.3）。

import { describe, expect, it, vi } from 'vitest';
import type { LodStage } from '../lod';
import { MAP_PALETTE_NUM } from '@ui/styles/tokens';
import {
  ROAD_CASING_WIDTH,
  ROAD_INNER_WIDTH,
  SEA_ROUTE_WIDTH,
  SEA_ROUTE_OUTER_ALPHA,
  ROAD_STAGE_WIDTH_MULT,
} from '../mapViewConfig';

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
  type RoadsLayer,
} from './roadsDraw';
import type { MapGraph, MapRoadEdge } from '@core/state/mapGraph';

type RecordingGraphics = InstanceType<typeof hoisted.RecordingGraphics>;

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
  it('container 掛 5 個具名 tier（下→上 sea/path/bridge/minor/arterial）', () => {
    const layer = buildRoadsLayer(graphOf({ a: [0, 0], b: [1, 0] }, []));
    const container = layer.container as unknown as { children: unknown[] };
    expect(container.children).toHaveLength(5);
    expect(container.children[0]).toBe(layer.tiers.sea);
    expect(container.children[1]).toBe(layer.tiers.path);
    expect(container.children[2]).toBe(layer.tiers.bridge);
    expect(container.children[3]).toBe(layer.tiers.minor);
    expect(container.children[4]).toBe(layer.tiers.arterial);
  });

  it('build 時不描繪（首次 setStage 前 tier 無 stroke）', () => {
    const layer = buildRoadsLayer(
      graphOf({ a: [0, 0], b: [100, 0] }, [{ id: 'road.x', a: 'a', b: 'b', grade: 3 }]),
    );
    expect(tier(layer, 'arterial').countOf('stroke')).toBe(0);
  });
});

describe('buildRoadsLayer — 道級分派＋casing/內線', () => {
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
    // arterial tier 不含 grade2/1 幾何：僅一條邊 → casing+inner=2 strokes。
    expect(tier(layer, 'arterial').countOf('stroke')).toBe(2);
  });

  it('casing 先於內線；casing 寬>內線寬；casing 色=roadCasing、內線色=roadArterial（near m=1）', () => {
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
    expect(strokes).toHaveLength(2);
    // 呼叫序：先 casing 後內線。
    expect(strokes[0]!.color).toBe(MAP_PALETTE_NUM.roadCasing);
    expect(strokes[0]!.width).toBe(ROAD_CASING_WIDTH[3]); // m=1
    expect(strokes[1]!.color).toBe(MAP_PALETTE_NUM.roadArterial);
    expect(strokes[1]!.width).toBe(ROAD_INNER_WIDTH[3]);
    expect(strokes[0]!.width).toBeGreaterThan(strokes[1]!.width);
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
    // 2 邊 → [casing, casing, inner, inner]。
    expect(colors).toEqual([
      MAP_PALETTE_NUM.roadCasing,
      MAP_PALETTE_NUM.roadCasing,
      MAP_PALETTE_NUM.roadArterial,
      MAP_PALETTE_NUM.roadArterial,
    ]);
  });

  it('grade1 內線為節線（多段 moveTo/lineTo），casing 為單線', () => {
    const layer = buildRoadsLayer(
      graphOf({ a: [0, 0], b: [100, 0] }, [{ id: 'road.x', a: 'a', b: 'b', grade: 1 }]),
    );
    layer.setStage('near');
    const path = tier(layer, 'path');
    // casing（1 moveTo）＋內線節線（多 moveTo）→ 總 moveTo 明顯 >2；stroke=2（casing+dash）。
    expect(path.countOf('stroke')).toBe(2);
    expect(path.countOf('moveTo')).toBeGreaterThan(2);
    const innerColor = (path.argsOf('stroke')[1]![0] as { color: number }).color;
    expect(innerColor).toBe(MAP_PALETTE_NUM.roadMinor);
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
    expect(strokes[0]!.alpha).toBe(SEA_ROUTE_OUTER_ALPHA);
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
  it('每座橋＝deck poly（fill+stroke）＋2 橋頭（fill）；顏色 plainLight/roadCasing', () => {
    const layer = buildRoadsLayer(
      graphOf({ a: [0, 0], b: [100, 0] }, [
        { id: 'road.x', a: 'a', b: 'b', grade: 3, bridges: [50, 0] },
      ]),
    );
    layer.setStage('near');
    const bridge = tier(layer, 'bridge');
    expect(bridge.countOf('poly')).toBe(3); // deck + 2 橋頭
    expect(bridge.countOf('fill')).toBe(3);
    expect(bridge.countOf('stroke')).toBe(1); // 僅 deck 描邊
    const fills = bridge.argsOf('fill').map((f) => (f[0] as { color: number }).color);
    expect(fills[0]).toBe(MAP_PALETTE_NUM.plainLight); // deck 面
    expect(fills[1]).toBe(MAP_PALETTE_NUM.roadCasing); // 橋頭
    expect(fills[2]).toBe(MAP_PALETTE_NUM.roadCasing);
  });

  it('多對 bridges → 多座橋', () => {
    const layer = buildRoadsLayer(
      graphOf({ a: [0, 0], b: [200, 0] }, [
        { id: 'road.x', a: 'a', b: 'b', grade: 3, bridges: [50, 0, 150, 0] },
      ]),
    );
    layer.setStage('near');
    expect(tier(layer, 'bridge').countOf('poly')).toBe(6); // 2 橋 × 3 poly
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

  it("setStage('far') casing 寬＝ROAD_CASING_WIDTH[3]×5（per-stage 倍率，處置 x2-M1/x4-M1）", () => {
    const layer = buildRoadsLayer(
      graphOf({ a: [0, 0], b: [100, 0] }, [{ id: 'road.x', a: 'a', b: 'b', grade: 3 }]),
    );
    layer.setStage('far');
    const casing = tier(layer, 'arterial').argsOf('stroke')[0]![0] as { width: number };
    expect(casing.width).toBe(ROAD_CASING_WIDTH[3] * ROAD_STAGE_WIDTH_MULT.far);
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
