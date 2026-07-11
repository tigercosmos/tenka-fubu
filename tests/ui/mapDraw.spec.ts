// 地圖靜態圖層繪製輔助函式（src/ui/map/mapDraw.ts）純函式測試。
// 規格：plan/04-map-and-movement.md §3.10.1（海陸背景／街道／城郡標記內容）、§3.4.2/§3.4.3
// （道級線寬、海路虛線）；18-roadmap.md M2-13（04-T8「outline 與街道繪製」）。
//
// 於 core（node）project 執行（tests/**/*.spec.ts）：mapDraw 對 pixi.js 僅 `import type`（執行期抹除），
// 故以「錄製用 mock Graphics」驗證繪製指令序列，無需 Pixi/WebGL 執行期（17 §3.2）。

import { describe, expect, it } from 'vitest';
import type { Graphics } from 'pixi.js';
import { buildMapGraph } from '@core/state/mapGraph';
import type { CastleId, DistrictId, RoadEdgeId } from '@core/state/ids';
import type { RoadEdge } from '@core/state/gameState';
import { clanColorNum } from '@ui/styles/tokens';
import { MAPVIEW, ROAD_GRADE_WIDTH, WORLD_SIZE } from '@ui/map/mapViewConfig';
import type { MapViewState } from '@ui/map/mapViewTypes';
import { drawNodeMarkers, drawRoads, drawSeaBackground, loadOutline } from '@ui/map/mapDraw';

/** 錄製每個 Graphics 指令（method + 參數）以斷言繪製序列。 */
class RecordingGraphics {
  readonly calls: unknown[][] = [];
  private rec(name: string, args: unknown[]): this {
    this.calls.push([name, ...args]);
    return this;
  }
  clear(): this {
    return this.rec('clear', []);
  }
  rect(...a: unknown[]): this {
    return this.rec('rect', a);
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

function makeRec(): { rec: RecordingGraphics; g: Graphics } {
  const rec = new RecordingGraphics();
  return { rec, g: rec as unknown as Graphics };
}

function fixtureGraph(): ReturnType<typeof buildMapGraph> {
  const castles = {
    'castle.aa': { id: 'castle.aa' as CastleId, pos: { x: 100, y: 100 } },
    'castle.bb': { id: 'castle.bb' as CastleId, pos: { x: 300, y: 300 } },
  } as unknown as Parameters<typeof buildMapGraph>[0];
  const districts = {
    'dist.xx': {
      id: 'dist.xx' as DistrictId,
      pos: { x: 200, y: 200 },
      isPort: false,
      castleId: 'castle.aa' as CastleId,
    },
    'dist.yy': {
      id: 'dist.yy' as DistrictId,
      pos: { x: 400, y: 100 },
      isPort: true,
      castleId: 'castle.bb' as CastleId,
    },
  } as unknown as Parameters<typeof buildMapGraph>[1];
  const road = (
    id: string,
    a: string,
    b: string,
    type: 'land' | 'sea',
    grade: 1 | 2 | 3,
  ): RoadEdge => ({
    id: id as RoadEdgeId,
    a: a as CastleId,
    b: b as CastleId,
    type,
    grade,
    baseDays: 2,
  });
  const roads = {
    'road.aa-xx': road('road.aa-xx', 'castle.aa', 'dist.xx', 'land', 2),
    'road.xx-bb': road('road.xx-bb', 'dist.xx', 'castle.bb', 'land', 1),
    'road.bb-yy': road('road.bb-yy', 'castle.bb', 'dist.yy', 'sea', 1),
  } as unknown as Parameters<typeof buildMapGraph>[2];
  return buildMapGraph(castles, districts, roads);
}

describe('loadOutline（內建 japan-outline.json，04 §3.3）', () => {
  it('回傳 version 1、含 honshu/shikoku/kyushu 三 polygon 的已驗證 outline', () => {
    const outline = loadOutline();
    expect(outline.version).toBe(1);
    const ids = outline.polygons.map((p) => p.id);
    expect(ids).toContain('honshu');
    expect(ids).toContain('shikoku');
    expect(ids).toContain('kyushu');
  });
  it('重複呼叫回傳同一快取實例', () => {
    expect(loadOutline()).toBe(loadOutline());
  });
});

describe('drawSeaBackground（圖層 0；04 §3.10.1）', () => {
  it('先 clear，鋪滿 4096² 海色矩形，各島一個填色多邊形', () => {
    const { rec, g } = makeRec();
    const outline = loadOutline();
    drawSeaBackground(g, outline);

    expect(rec.calls[0]?.[0]).toBe('clear');
    const rects = rec.argsOf('rect');
    expect(rects).toHaveLength(1);
    expect(rects[0]).toEqual([0, 0, WORLD_SIZE, WORLD_SIZE]);
    // 每島一個 poly（陸地）。
    expect(rec.countOf('poly')).toBe(outline.polygons.length);
    // 海色矩形填色 + 陸色多邊形填色 = 1 + polygons。
    expect(rec.countOf('fill')).toBe(1 + outline.polygons.length);
    const fills = rec.argsOf('fill').map((a) => (a[0] as { color: number }).color);
    expect(fills[0]).toBe(MAPVIEW.colors.sea);
    expect(fills.slice(1).every((c) => c === MAPVIEW.colors.land)).toBe(true);
  });
});

describe('drawRoads（圖層 2；04 §3.10.1／§3.4.2/§3.4.3）', () => {
  it('先 clear；每邊一次 stroke；道級決定線寬；海路以多段虛線', () => {
    const { rec, g } = makeRec();
    const graph = fixtureGraph();
    drawRoads(g, graph);

    expect(rec.calls[0]?.[0]).toBe('clear');
    // 3 條邊 → 3 次 stroke（陸路各一段、海路一次收尾）。
    expect(rec.countOf('stroke')).toBe(3);
    const widths = rec.argsOf('stroke').map((a) => (a[0] as { width: number }).width);
    expect(widths).toContain(ROAD_GRADE_WIDTH[2]); // 陸路 grade 2 = 2.5
    expect(widths).toContain(ROAD_GRADE_WIDTH[1]); // 陸路 grade 1／海路 = 1.5
    // 海路虛線：lineTo 總數應遠多於邊數（單一海路即拆成多段 dash）。
    expect(rec.countOf('lineTo')).toBeGreaterThan(3);
  });

  it('無邊圖不 throw、無 stroke（防禦）', () => {
    const { rec, g } = makeRec();
    const empty = buildMapGraph(
      { 'castle.solo': { id: 'castle.solo' as CastleId, pos: { x: 0, y: 0 } } } as never,
      {},
      {},
    );
    drawRoads(g, empty);
    expect(rec.countOf('stroke')).toBe(0);
  });
});

describe('drawNodeMarkers（圖層 3 骨架占位；04 §3.10.1）', () => {
  it('每節點 fill+stroke 各一次；owner→勢力色、無主→中性灰', () => {
    const { rec, g } = makeRec();
    const graph = fixtureGraph();
    const view: MapViewState = {
      day: 1,
      districtOwner: { 'dist.xx': 'clan.oda', 'dist.yy': null },
      castleOwner: { 'castle.aa': 'clan.oda', 'castle.bb': 'clan.imagawa' },
      selection: null,
    };
    const clanColorIndex = { 'clan.oda': 5, 'clan.imagawa': 10 };
    drawNodeMarkers(g, graph, view, clanColorIndex);

    expect(rec.calls[0]?.[0]).toBe('clear');
    // 4 節點 × (填色 poly + 描邊 poly) = 8 poly；fill/stroke 各 4。
    expect(rec.countOf('poly')).toBe(8);
    expect(rec.countOf('fill')).toBe(4);
    expect(rec.countOf('stroke')).toBe(4);
    const fillColors = rec.argsOf('fill').map((a) => (a[0] as { color: number }).color);
    expect(fillColors).toContain(clanColorNum(5)); // 織田領（castle.aa / dist.xx）
    expect(fillColors).toContain(clanColorNum(10)); // 今川領（castle.bb）
    expect(fillColors).toContain(MAPVIEW.colors.neutral); // 無主 dist.yy
  });

  it('clanColorIndex 缺 owner 對照時退回中性灰（不 throw）', () => {
    const { rec, g } = makeRec();
    const graph = fixtureGraph();
    const view: MapViewState = {
      day: 1,
      districtOwner: {},
      castleOwner: { 'castle.aa': 'clan.unknown' },
      selection: null,
    };
    drawNodeMarkers(g, graph, view, {});
    const fillColors = rec.argsOf('fill').map((a) => (a[0] as { color: number }).color);
    expect(fillColors.every((c) => c === MAPVIEW.colors.neutral)).toBe(true);
  });
});
