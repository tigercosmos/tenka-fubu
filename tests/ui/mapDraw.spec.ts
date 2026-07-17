// 地圖靜態圖層繪製輔助函式（src/ui/map/mapDraw.ts）純函式測試。
// 規格：plan/04-map-and-movement.md §3.10.1（海陸背景／街道／城郡標記內容）、§3.4.2/§3.4.3
// （道級線寬、海路虛線）；18-roadmap.md M2-13（04-T8「outline 與街道繪製」）。
//
// 於 core（node）project 執行（tests/**/*.spec.ts）：mapDraw 對 pixi.js 僅 `import type`（執行期抹除），
// 故以「錄製用 mock Graphics」驗證繪製指令序列，無需 Pixi/WebGL 執行期（17 §3.2）。

import { describe, expect, it } from 'vitest';
import type { Graphics } from 'pixi.js';
import { MAPVIEW, WORLD_SIZE } from '@ui/map/mapViewConfig';
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
