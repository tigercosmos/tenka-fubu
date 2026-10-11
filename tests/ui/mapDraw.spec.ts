// 地圖靜態圖層繪製輔助函式（src/ui/map/mapDraw.ts）純函式測試。
// 規格：plan/04-map-and-movement.md §3.10.1（海陸背景／街道／城郡標記內容）、§3.4.2/§3.4.3
// （道級線寬、海路虛線）；18-roadmap.md M2-13（04-T8「outline 與街道繪製」）。
//
// 於 core（node）project 執行（tests/**/*.spec.ts）：mapDraw 對 pixi.js 僅 `import type`（執行期抹除），
// 以錄製指令與真實 public Graphics 驗證靜態幾何；不建立 WebGL renderer（17 §3.2）。

import { describe, expect, it, vi } from 'vitest';
import { Graphics } from 'pixi.js';
import { MAPVIEW, SEA_SURFACE, WORLD_SIZE } from '@ui/map/mapViewConfig';
import { drawSeaBackground, loadOutline } from '@ui/map/mapDraw';

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
  it('omits hidden legacy bands and swells when the owned opaque sea material supplies detail', () => {
    const { rec, g } = makeRec();
    drawSeaBackground(g, loadOutline(), { coast: false, land: false, detail: false });
    expect(rec.calls).toEqual([
      ['clear'],
      ['rect', 0, 0, WORLD_SIZE, WORLD_SIZE],
      ['fill', { color: MAPVIEW.colors.sea }],
    ]);
  });
  it('uses a bounded deterministic water surface with shallow coast layers on actual public Graphics', () => {
    const outline = loadOutline();
    const before = JSON.stringify(outline);
    const a = new Graphics();
    const b = new Graphics();
    const strokeA = vi.spyOn(a, 'stroke');
    const strokeB = vi.spyOn(b, 'stroke');
    const rect = vi.spyOn(a, 'rect');
    const moveA = vi.spyOn(a, 'moveTo');
    const moveB = vi.spyOn(b, 'moveTo');
    const line = vi.spyOn(a, 'lineTo');
    const random = vi.spyOn(Math, 'random');
    random.mockClear();
    drawSeaBackground(a, outline);
    drawSeaBackground(b, outline);
    expect(rect).toHaveBeenCalledTimes(33);
    expect(SEA_SURFACE.coast).toHaveLength(16);
    expect(strokeA).toHaveBeenCalledTimes(96 + outline.polygons.length * 16);
    expect(moveA).toHaveBeenCalledTimes(96);
    expect(line).toHaveBeenCalledTimes(96 * 4);
    expect(moveA.mock.calls).toEqual(moveB.mock.calls);
    expect(strokeA.mock.calls).toEqual(strokeB.mock.calls);
    expect(moveA.mock.calls.flat().every(Number.isFinite)).toBe(true);
    expect(line.mock.calls.flat().every(Number.isFinite)).toBe(true);
    expect(random).not.toHaveBeenCalled();
    expect(JSON.stringify(outline)).toBe(before);
    a.destroy();
    b.destroy();
    random.mockRestore();
  });

  it('draws bounded soft coast layers on exact polygons before all opaque original land fills', () => {
    const { rec, g } = makeRec();
    const outline = loadOutline(),
      before = structuredClone(outline);
    drawSeaBackground(g, outline);
    expect(rec.countOf('stroke')).toBe(96 + outline.polygons.length * 16);
    const lastStroke = rec.calls.map((c) => c[0]).lastIndexOf('stroke');
    const landFills = rec.calls
      .map((c, i) => ({ c, i }))
      .filter(
        ({ c }) => c[0] === 'fill' && (c[1] as { color: number }).color === MAPVIEW.colors.land,
      );
    expect(landFills).toHaveLength(outline.polygons.length);
    expect(
      landFills.every(
        ({ c, i }) => i > lastStroke && (c[1] as { alpha?: number }).alpha === undefined,
      ),
    ).toBe(true);
    const polys = rec.argsOf('poly');
    for (const [index, poly] of outline.polygons.entries()) {
      for (let tone = 0; tone < SEA_SURFACE.coast.length; tone++)
        expect(polys[index * SEA_SURFACE.coast.length + tone]?.[0]).toEqual(poly.points);
      expect(polys[outline.polygons.length * SEA_SURFACE.coast.length + index]?.[0]).toEqual(
        poly.points,
      );
    }
    expect(outline).toEqual(before);
  });

  it('先 clear，鋪滿 4096² 海色矩形，各島一個填色多邊形', () => {
    const { rec, g } = makeRec();
    const outline = loadOutline();
    drawSeaBackground(g, outline);

    expect(rec.calls[0]?.[0]).toBe('clear');
    const rects = rec.argsOf('rect');
    expect(rects).toHaveLength(33);
    expect(rects[0]).toEqual([0, 0, WORLD_SIZE, WORLD_SIZE]);
    // 每島 16 個原始輪廓水深描邊，最後一個不透明陸地填色。
    expect(rec.countOf('poly')).toBe(outline.polygons.length * 17);
    // 海底色與 32 個靜態光照色帶，最後各島陸色填色。
    expect(rec.countOf('fill')).toBe(33 + outline.polygons.length);
    const fills = rec.argsOf('fill').map((a) => (a[0] as { color: number }).color);
    expect(fills[0]).toBe(MAPVIEW.colors.sea);
    expect(fills.slice(33).every((c) => c === MAPVIEW.colors.land)).toBe(true);
  });
});

// M6-V6（V6D10）：`drawRoads` 已汰除、由 `roads/roadsDraw.ts` 之 `buildRoadsLayer` 承接。
// M6-V7（DoD 硬項）：占位 `drawNodeMarker`／`drawNodeMarkers` 已移除，nodeMarkers 改由
// `sceneParts/castleNode`／`districtNode` 元件繪製（測試見 tests/ui/sceneParts/*.spec.ts、
// src/ui/map/mapRendererDirty.spec.ts）。本檔僅保留 seaBackground。

describe('mapDraw 不再匯出占位節點標記（M6-V7 DoD）', () => {
  it('drawNodeMarker／drawNodeMarkers 已自 mapDraw 移除', async () => {
    const mod = (await import('@ui/map/mapDraw')) as Record<string, unknown>;
    expect(mod.drawNodeMarker).toBeUndefined();
    expect(mod.drawNodeMarkers).toBeUndefined();
    expect(typeof mod.drawSeaBackground).toBe('function');
    expect(typeof mod.loadOutline).toBe('function');
  });
});
