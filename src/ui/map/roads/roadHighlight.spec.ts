// `roadHighlight.ts`（選取節點相鄰道路金色高亮）單元測試——[M6-V6] Slice E。
// 規格：M6-V6 技術設計文件 §8.1（roadHighlight.spec 列，處置 x4-m7）、§4.3（createRoadHighlight
// 行為）。涵蓋：選取節點 → adjacency 回邊 id → edges.get → 多段線 stroke gold（width 5／alpha
// 0.5／accentGold）；查無邊/端點缺失略過不炸；null／selectedNodeId===null → clear；未知節點
// （adjacency 查無）→ clear；重複同 id idempotent（不累積殘影）；destroy 級聯銷毀。
//
// 本檔自備 recording pixi mock（比照 `roadsDraw.spec.ts`／`terrainDraw.spec.ts` 模式）——共用
// `tests/helpers/pixiMock.ts` 之 Graphics 不記錄呼叫，無法斷言 stroke 引數（color/width/alpha）。

import { describe, expect, it, vi } from 'vitest';
import { TOKENS_NUM } from '@ui/styles/tokens';

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
    moveTo(...a: unknown[]): this {
      return this.rec('moveTo', a);
    }
    lineTo(...a: unknown[]): this {
      return this.rec('lineTo', a);
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

import { createRoadHighlight } from './roadHighlight';
import type { MapGraph, MapRoadEdge } from '@core/state/mapGraph';

type RecordingGraphics = InstanceType<typeof hoisted.RecordingGraphics>;

interface EdgeSpec {
  id: string;
  a: string;
  b: string;
  waypoints?: number[];
}

/** 建最小 MapGraph（nodes/edges/adjacency 依 a/b 雙向登記，比照 buildMapGraph 語意）。 */
function graphOf(nodes: Record<string, [number, number]>, edges: EdgeSpec[]): MapGraph {
  const nodeMap = new Map<string, unknown>();
  for (const [id, [x, y]] of Object.entries(nodes)) {
    nodeMap.set(id, { id, kind: 'castle', pos: { x, y }, isPort: false });
  }
  const edgeMap = new Map<string, MapRoadEdge>();
  const adjacency = new Map<string, string[]>();
  for (const id of nodeMap.keys()) adjacency.set(id, []);
  for (const e of edges) {
    edgeMap.set(e.id, {
      id: e.id as MapRoadEdge['id'],
      a: e.a as MapRoadEdge['a'],
      b: e.b as MapRoadEdge['b'],
      type: 'land',
      grade: 3,
      baseDays: 1,
      ...(e.waypoints !== undefined ? { waypoints: e.waypoints } : {}),
    });
    adjacency.get(e.a)?.push(e.id);
    adjacency.get(e.b)?.push(e.id);
  }
  return {
    nodes: nodeMap,
    edges: edgeMap,
    adjacency,
  } as unknown as MapGraph;
}

function gfx(highlight: ReturnType<typeof createRoadHighlight>): RecordingGraphics {
  return (highlight.container as unknown as { children: RecordingGraphics[] }).children[0]!;
}

describe('createRoadHighlight', () => {
  it('container 掛單一 Graphics 子節點', () => {
    const highlight = createRoadHighlight();
    const container = highlight.container as unknown as { children: unknown[] };
    expect(container.children).toHaveLength(1);
  });

  it('選取節點 → adjacency 回邊 id → edges.get → strokePolyline 金色（width 5, alpha 0.5）', () => {
    const graph = graphOf({ a: [0, 0], b: [100, 0] }, [{ id: 'road.a-b', a: 'a', b: 'b' }]);
    const highlight = createRoadHighlight();
    highlight.update({ graph, selectedNodeId: 'a' });
    const g = gfx(highlight);
    expect(g.countOf('stroke')).toBe(1);
    const args = g.argsOf('stroke')[0]![0] as {
      width: number;
      color: number;
      alpha: number;
      cap: string;
      join: string;
    };
    expect(args).toMatchObject({
      width: 5,
      color: TOKENS_NUM.accentGold,
      alpha: 0.5,
      cap: 'round',
      join: 'round',
    });
  });

  it('選取節點多條鄰接邊 → 每邊各一次 stroke（皆金色）', () => {
    const graph = graphOf({ hub: [0, 0], n1: [100, 0], n2: [0, 100], n3: [-100, 0] }, [
      { id: 'road.hub-n1', a: 'hub', b: 'n1' },
      { id: 'road.hub-n2', a: 'hub', b: 'n2' },
      { id: 'road.hub-n3', a: 'hub', b: 'n3' },
    ]);
    const highlight = createRoadHighlight();
    highlight.update({ graph, selectedNodeId: 'hub' });
    expect(gfx(highlight).countOf('stroke')).toBe(3);
  });

  it('多段線帶 waypoints：edgePolyline 展開後沿全點 stroke（moveTo 一次、lineTo 隨頂點數）', () => {
    const graph = graphOf({ a: [0, 0], b: [100, 0] }, [
      { id: 'road.a-b', a: 'a', b: 'b', waypoints: [30, 20, 60, 20] },
    ]);
    const highlight = createRoadHighlight();
    highlight.update({ graph, selectedNodeId: 'a' });
    const g = gfx(highlight);
    expect(g.countOf('moveTo')).toBe(1);
    expect(g.countOf('lineTo')).toBe(3); // 4 點多段線 → 3 段 lineTo
  });

  it('adjacency 含之邊 id 於 edges 查無 → 略過不炸（防禦性）', () => {
    const graph = graphOf({ a: [0, 0], b: [100, 0] }, []);
    (graph.adjacency as unknown as Map<string, string[]>).set('a', ['road.ghost']);
    const highlight = createRoadHighlight();
    expect(() => highlight.update({ graph, selectedNodeId: 'a' })).not.toThrow();
    expect(gfx(highlight).countOf('stroke')).toBe(0);
  });

  it('端點缺失（edgePolyline 回 null）之邊 → 略過不炸', () => {
    const graph = graphOf({ a: [0, 0] }, []);
    (graph.edges as unknown as Map<string, MapRoadEdge>).set('road.a-missing', {
      id: 'road.a-missing' as MapRoadEdge['id'],
      a: 'a' as MapRoadEdge['a'],
      b: 'missing' as MapRoadEdge['b'],
      type: 'land',
      grade: 3,
      baseDays: 1,
    });
    (graph.adjacency as unknown as Map<string, string[]>).set('a', ['road.a-missing']);
    const highlight = createRoadHighlight();
    expect(() => highlight.update({ graph, selectedNodeId: 'a' })).not.toThrow();
    expect(gfx(highlight).countOf('stroke')).toBe(0);
  });

  it('selectedNodeId===null → clear 且無 stroke', () => {
    const graph = graphOf({ a: [0, 0], b: [100, 0] }, [{ id: 'road.a-b', a: 'a', b: 'b' }]);
    const highlight = createRoadHighlight();
    highlight.update({ graph, selectedNodeId: null });
    const g = gfx(highlight);
    expect(g.countOf('clear')).toBe(1);
    expect(g.countOf('stroke')).toBe(0);
  });

  it('props===null → clear 且無 stroke', () => {
    const highlight = createRoadHighlight();
    highlight.update(null);
    const g = gfx(highlight);
    expect(g.countOf('clear')).toBe(1);
    expect(g.countOf('stroke')).toBe(0);
  });

  it('未知節點（adjacency 查無此 key）→ clear 且無 stroke', () => {
    const graph = graphOf({ a: [0, 0], b: [100, 0] }, [{ id: 'road.a-b', a: 'a', b: 'b' }]);
    const highlight = createRoadHighlight();
    highlight.update({ graph, selectedNodeId: 'no-such-node' });
    const g = gfx(highlight);
    expect(g.countOf('clear')).toBe(1);
    expect(g.countOf('stroke')).toBe(0);
  });

  it('先選取後清空：clear 疊加、無殘留 stroke', () => {
    const graph = graphOf({ a: [0, 0], b: [100, 0] }, [{ id: 'road.a-b', a: 'a', b: 'b' }]);
    const highlight = createRoadHighlight();
    highlight.update({ graph, selectedNodeId: 'a' });
    expect(gfx(highlight).countOf('stroke')).toBe(1);
    highlight.update(null);
    expect(gfx(highlight).countOf('stroke')).toBe(1); // clear() 不移除既有呼叫紀錄，但不再新增
    highlight.update({ graph, selectedNodeId: null });
    expect(gfx(highlight).countOf('clear')).toBe(3); // 三次 update 皆各 clear 一次
  });

  it('重複同一節點選取 idempotent：每次 update 結果一致（各一次 stroke）', () => {
    const graph = graphOf({ a: [0, 0], b: [100, 0] }, [{ id: 'road.a-b', a: 'a', b: 'b' }]);
    const highlight = createRoadHighlight();
    highlight.update({ graph, selectedNodeId: 'a' });
    const g = gfx(highlight);
    expect(g.countOf('stroke')).toBe(1);
    highlight.update({ graph, selectedNodeId: 'a' });
    expect(g.countOf('stroke')).toBe(2); // 各自一次，累計呼叫紀錄，但每次結果皆等價（idempotent 描繪內容）
    const strokes = g.argsOf('stroke').map((s) => s[0]);
    expect(strokes[0]).toEqual(strokes[1]);
  });

  it('destroy 級聯銷毀 container children', () => {
    const highlight = createRoadHighlight();
    const children = (highlight.container as unknown as { children: { destroy: () => void }[] })
      .children;
    const spies = children.map((c) => vi.spyOn(c, 'destroy'));
    highlight.destroy();
    for (const spy of spies) expect(spy).toHaveBeenCalled();
  });
});
