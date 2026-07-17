// `settlementsDraw.ts`（城下聚落）純繪製函式＋工廠測試 —— M6-V7 Slice C。
// 規格：docs/design/m6-v7-castles.md §8.1（settlementsDraw.spec 列）、CD4、§3.4、§4.1。
//
// 本檔自備 recording pixi mock（`vi.mock('pixi.js')`，沿用 `roadsDraw.spec.ts`／`terrainDraw.spec.ts`
// 之 hoisted recording-mock 模式，§8.3）：共用 `tests/helpers/pixiMock.ts` 之 Graphics 不記錄呼叫，
// 無法斷言 poly/fill/stroke 引數與呼叫序。

import { describe, expect, it, vi } from 'vitest';
import type { CastleTier } from '@core/state/enums';
import { MAP_PALETTE_NUM, TOKENS_NUM } from '@ui/styles/tokens';

const hoisted = vi.hoisted(() => {
  class MockDisplayObject {
    children: MockDisplayObject[] = [];
    visible = true;
    parent: MockDisplayObject | null = null;
    label = '';
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
  buildSettlements,
  drawSettlementCluster,
  settlementSeed,
  SETTLEMENT,
  type Settlements,
} from './settlementsDraw';
import type { MapGraph } from '@core/state/mapGraph';

type RecordingGraphics = InstanceType<typeof hoisted.RecordingGraphics>;

function newRec(): RecordingGraphics {
  return new hoisted.RecordingGraphics();
}

/** 建最小 MapGraph（僅 nodes——buildSettlements 不用 edges/adjacency）。 */
function graphOf(
  nodes: Record<string, { x: number; y: number; kind?: 'castle' | 'district' }>,
): MapGraph {
  const nodeMap = new Map<string, unknown>();
  for (const [id, spec] of Object.entries(nodes)) {
    nodeMap.set(id, {
      id,
      kind: spec.kind ?? 'castle',
      pos: { x: spec.x, y: spec.y },
      isPort: false,
    });
  }
  return { nodes: nodeMap, edges: new Map(), adjacency: new Map() } as unknown as MapGraph;
}

/** 由記錄的 poly 頂點反推平均中心點（對稱平行四邊形之頂點平均值＝繪製時的散佈中心）。 */
function polyCenter(pts: number[]): { x: number; y: number } {
  const xs = pts.filter((_, i) => i % 2 === 0);
  const ys = pts.filter((_, i) => i % 2 === 1);
  const avg = (arr: number[]): number => arr.reduce((a, b) => a + b, 0) / arr.length;
  return { x: avg(xs), y: avg(ys) };
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

describe('settlementSeed（CD4：城 id 純字串 hash → seed，決定論）', () => {
  it('同一 id 兩次呼叫回傳相同 seed', () => {
    expect(settlementSeed('castle.sunpu')).toBe(settlementSeed('castle.sunpu'));
  });

  it('不同 id 回傳不同 seed（測試用 id 集合下）', () => {
    const ids = ['castle.sunpu', 'castle.kiyosu', 'castle.gifu', 'castle.kakegawa'];
    const seeds = new Set(ids.map(settlementSeed));
    expect(seeds.size).toBe(ids.length);
  });

  it('回傳非負 32-bit 整數', () => {
    const s = settlementSeed('castle.sunpu');
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThan(2 ** 32);
  });
});

describe('drawSettlementCluster（CD4／§4.1：seeded 屋頂群＋田畦）', () => {
  it('雙跑指令序 byte-identical（同 seed 兩次呼叫）', () => {
    const g1 = newRec();
    const g2 = newRec();
    drawSettlementCluster(g1 as never, { x: 0, y: 0 }, 12345);
    drawSettlementCluster(g2 as never, { x: 0, y: 0 }, 12345);
    expect(g2.calls).toEqual(g1.calls);
  });

  it('不同 seed 產生不同指令序', () => {
    const g1 = newRec();
    const g2 = newRec();
    drawSettlementCluster(g1 as never, { x: 0, y: 0 }, 1);
    drawSettlementCluster(g2 as never, { x: 0, y: 0 }, 2);
    expect(g2.calls).not.toEqual(g1.calls);
  });

  it('屋頂數＝SETTLEMENT.roofCount（poly 呼叫數）；田畦數＝furrowCount（moveTo/lineTo 對數）', () => {
    const g = newRec();
    drawSettlementCluster(g as never, { x: 0, y: 0 }, 999);
    expect(g.countOf('poly')).toBe(SETTLEMENT.roofCount);
    expect(g.countOf('moveTo')).toBe(SETTLEMENT.furrowCount);
    expect(g.countOf('lineTo')).toBe(SETTLEMENT.furrowCount);
  });

  it('全部屋頂中心距 center ∈[innerR,outerR]（不侵入耐久環/城體，審查 #6）', () => {
    const g = newRec();
    const center = { x: 100, y: 200 };
    drawSettlementCluster(g as never, center, 42);
    const polys = g.argsOf('poly').map((a) => a[0] as number[]);
    expect(polys).toHaveLength(SETTLEMENT.roofCount);
    for (const pts of polys) {
      const r = dist(polyCenter(pts), center);
      expect(r).toBeGreaterThanOrEqual(SETTLEMENT.innerR);
      expect(r).toBeLessThan(SETTLEMENT.outerR);
    }
  });

  it('全部田畦中點距 center ∈[innerR,outerR]', () => {
    const g = newRec();
    const center = { x: 100, y: 200 };
    drawSettlementCluster(g as never, center, 42);
    const froms = g.argsOf('moveTo').map((a) => ({ x: a[0] as number, y: a[1] as number }));
    const tos = g.argsOf('lineTo').map((a) => ({ x: a[0] as number, y: a[1] as number }));
    expect(froms).toHaveLength(SETTLEMENT.furrowCount);
    for (let i = 0; i < froms.length; i += 1) {
      const from = froms[i]!;
      const to = tos[i]!;
      const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
      const r = dist(mid, center);
      expect(r).toBeGreaterThanOrEqual(SETTLEMENT.innerR);
      expect(r).toBeLessThan(SETTLEMENT.outerR);
    }
  });

  it('屋頂填 plainLight／α=roofAlpha，描 ink700／w=roofStrokeWidth／α=roofStrokeAlpha', () => {
    const g = newRec();
    drawSettlementCluster(g as never, { x: 0, y: 0 }, 7);
    const fill = g.argsOf('fill')[0]?.[0] as { color: number; alpha: number };
    expect(fill.color).toBe(MAP_PALETTE_NUM.plainLight);
    expect(fill.alpha).toBe(SETTLEMENT.roofAlpha);
    const stroke = g.argsOf('stroke')[0]?.[0] as { width: number; color: number; alpha: number };
    expect(stroke.width).toBe(SETTLEMENT.roofStrokeWidth);
    expect(stroke.color).toBe(TOKENS_NUM.ink700);
    expect(stroke.alpha).toBe(SETTLEMENT.roofStrokeAlpha);
  });

  it('田畦描 reliefInk／w=furrowWidth／α=furrowAlpha', () => {
    const g = newRec();
    drawSettlementCluster(g as never, { x: 0, y: 0 }, 7);
    const furrowStroke = g.argsOf('stroke').at(-1)?.[0] as {
      width: number;
      color: number;
      alpha: number;
    };
    expect(furrowStroke.width).toBe(SETTLEMENT.furrowWidth);
    expect(furrowStroke.color).toBe(MAP_PALETTE_NUM.reliefInk);
    expect(furrowStroke.alpha).toBe(SETTLEMENT.furrowAlpha);
  });

  it('不呼叫 g.clear()（呼叫端只建一次，不重繪）', () => {
    const g = newRec();
    drawSettlementCluster(g as never, { x: 0, y: 0 }, 7);
    expect(g.countOf('clear')).toBe(0);
  });
});

describe('buildSettlements（CD4：只繞本城，id 字典序，靜態一次建）', () => {
  it('只對本城（castleTier===main）建聚落；支城/郡不建', () => {
    const graph = graphOf({
      'castle.main1': { x: 0, y: 0 },
      'castle.branch1': { x: 500, y: 0 },
      'district.d1': { x: 1000, y: 0, kind: 'district' },
    });
    const tiers: Readonly<Record<string, CastleTier>> = {
      'castle.main1': 'main',
      'castle.branch1': 'branch',
    };
    const settlements = buildSettlements(graph, tiers);
    const gfx = settlements.container.children[0] as unknown as RecordingGraphics;
    expect(gfx.countOf('poly')).toBe(SETTLEMENT.roofCount); // 僅 1 座本城
  });

  it('container 內含單一 Graphics 子物件', () => {
    const graph = graphOf({ 'castle.main1': { x: 0, y: 0 } });
    const settlements = buildSettlements(graph, { 'castle.main1': 'main' });
    expect(settlements.container.children).toHaveLength(1);
  });

  it('無本城時不建任何聚落（container 仍存在但無繪製指令）', () => {
    const graph = graphOf({ 'castle.branch1': { x: 0, y: 0 } });
    const settlements = buildSettlements(graph, { 'castle.branch1': 'branch' });
    const gfx = settlements.container.children[0] as unknown as RecordingGraphics;
    expect(gfx.calls).toHaveLength(0);
  });

  it('多座本城依 id 字典序處理（與 Map 插入序無關）', () => {
    // 插入序刻意與字典序相反（'z' 先於 'a'）。
    const graph = graphOf({
      'castle.zzz': { x: 10, y: 10 },
      'castle.aaa': { x: 20, y: 20 },
    });
    const tiers: Readonly<Record<string, CastleTier>> = {
      'castle.zzz': 'main',
      'castle.aaa': 'main',
    };
    const settlements = buildSettlements(graph, tiers);
    const actual = (settlements.container.children[0] as unknown as RecordingGraphics).calls;

    const expectedGfx = newRec();
    drawSettlementCluster(expectedGfx as never, { x: 20, y: 20 }, settlementSeed('castle.aaa'));
    drawSettlementCluster(expectedGfx as never, { x: 10, y: 10 }, settlementSeed('castle.zzz'));

    expect(actual).toEqual(expectedGfx.calls);
  });

  it('destroy()：container.destroy({children:true}) 且不 throw', () => {
    const graph = graphOf({ 'castle.main1': { x: 0, y: 0 } });
    const settlements: Settlements = buildSettlements(graph, { 'castle.main1': 'main' });
    const spy = vi.spyOn(settlements.container, 'destroy');
    expect(() => settlements.destroy()).not.toThrow();
    expect(spy).toHaveBeenCalledWith({ children: true });
  });
});
