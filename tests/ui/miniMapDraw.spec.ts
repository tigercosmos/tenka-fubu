// MiniMap 純繪製輔助函式（src/ui/components/miniMapDraw.ts）測試。
// 規格：plan/12-ui-components.md §3.2.12／§5.5（繪製順序、座標換算）。
//
// 於 core（node）project 執行（tests/**/*.spec.ts）：本檔零 DOM／canvas 相依（僅呼叫傳入的
// context 介面方法），故以「錄製用 mock context」驗證繪製指令序列與座標換算，無需真的
// canvas 2D 實作（jsdom 預設不含，同 tests/ui/mapDraw.spec.ts 對 Pixi Graphics 的手法）。

import { describe, expect, it } from 'vitest';
import type { MiniMapModel } from '@core/state/selectors';
import { clanColorHex, MAP_PALETTE_HEX, TOKENS } from '@ui/styles/tokens';
import { WORLD_SIZE } from '@ui/map/mapViewConfig';
import {
  drawMiniMapBase,
  drawMiniMapViewportFrame,
  miniToWorld,
  worldToMini,
  type MiniMapDrawCtx,
} from '@ui/components/miniMapDraw';

/** 錄製每個 2D context 指令（method + 參數）以斷言繪製序列；fillStyle/strokeStyle/lineWidth 可讀寫。 */
class RecordingCtx implements MiniMapDrawCtx {
  readonly calls: unknown[][] = [];
  fillStyle = '';
  strokeStyle = '';
  lineWidth = 0;

  private rec(name: string, args: unknown[]): void {
    this.calls.push([name, ...args]);
  }
  clearRect(...a: unknown[]): void {
    this.rec('clearRect', a);
  }
  fillRect(...a: unknown[]): void {
    this.rec('fillRect', a);
  }
  strokeRect(...a: unknown[]): void {
    this.rec('strokeRect', a);
  }
  beginPath(): void {
    this.rec('beginPath', []);
  }
  moveTo(...a: unknown[]): void {
    this.rec('moveTo', a);
  }
  lineTo(...a: unknown[]): void {
    this.rec('lineTo', a);
  }
  closePath(): void {
    this.rec('closePath', []);
  }
  arc(...a: unknown[]): void {
    this.rec('arc', a);
  }
  fill(): void {
    this.rec('fill', []);
  }
  stroke(): void {
    this.rec('stroke', []);
  }
  countOf(name: string): number {
    return this.calls.filter((c) => c[0] === name).length;
  }
  argsOf(name: string): unknown[][] {
    return this.calls.filter((c) => c[0] === name).map((c) => c.slice(1));
  }
}

const SIZE = 224; // UI.minimapSizePx（12 §3.1.8）；本檔獨立驗證換算公式，不依賴 uiConstants。

function fixtureModel(overrides?: Partial<MiniMapModel>): MiniMapModel {
  return {
    outline: [
      [
        { x: 0, y: 0 },
        { x: WORLD_SIZE, y: 0 },
        { x: WORLD_SIZE, y: WORLD_SIZE },
      ],
    ],
    castles: [{ x: 1000, y: 2000, colorIndex: 0 }],
    armies: [{ x: 3000, y: 1000, colorIndex: 1 }],
    version: 1,
    ...overrides,
  };
}

describe('worldToMini／miniToWorld（12 §5.5：s = size/4096）', () => {
  it('worldToMini：世界座標等比縮放至 [0,size]', () => {
    expect(worldToMini({ x: 0, y: 0 }, SIZE)).toEqual({ x: 0, y: 0 });
    expect(worldToMini({ x: WORLD_SIZE, y: WORLD_SIZE }, SIZE)).toEqual({ x: SIZE, y: SIZE });
    expect(worldToMini({ x: 2048, y: 1024 }, SIZE)).toEqual({ x: SIZE / 2, y: SIZE / 4 });
  });

  it('miniToWorld：worldToMini 之逆換算（互為反函式）', () => {
    const world = { x: 1337, y: 2600 };
    const mini = worldToMini(world, SIZE);
    expect(miniToWorld(mini, SIZE)).toEqual(world);
  });

  it('往返換算誤差 < 1 世界px（12-T9 驗收：「點擊拖曳導航正確（世界座標誤差 < 1 世界px）」）', () => {
    const world = { x: 512.3, y: 4095.7 };
    const back = miniToWorld(worldToMini(world, SIZE), SIZE);
    expect(Math.abs(back.x - world.x)).toBeLessThan(1);
    expect(Math.abs(back.y - world.y)).toBeLessThan(1);
  });
});

describe('drawMiniMapBase（§5.5 繪製順序：輪廓→城點→部隊點）', () => {
  it('paints an opaque atlas sea before land, including an empty model', () => {
    const rec = new RecordingCtx();
    let sea = '';
    const original = rec.fillRect.bind(rec);
    rec.fillRect = (...args: [number, number, number, number]): void => {
      sea = rec.fillStyle;
      original(...args);
    };
    drawMiniMapBase(rec, fixtureModel({ outline: [], castles: [], armies: [] }), SIZE);
    expect(rec.calls).toEqual([
      ['clearRect', 0, 0, SIZE, SIZE],
      ['fillRect', 0, 0, SIZE, SIZE],
    ]);
    expect(sea).toBe(MAP_PALETTE_HEX.seaDeep);
  });
  it('先清畫布，再依序畫輪廓、城點（clanColor）、部隊點（clanColorBright）', () => {
    const rec = new RecordingCtx();
    drawMiniMapBase(rec, fixtureModel(), SIZE);

    expect(rec.calls[0]).toEqual(['clearRect', 0, 0, SIZE, SIZE]);
    // 輪廓：beginPath→moveTo→lineTo*(n-1)→closePath→fill→stroke，先於任何 fillRect/arc。
    const firstFillRectIdx = rec.calls.findIndex((c) => c[0] === 'fillRect' && c[3] === 3);
    const firstArcIdx = rec.calls.findIndex((c) => c[0] === 'arc');
    const firstClosePathIdx = rec.calls.findIndex((c) => c[0] === 'closePath');
    expect(firstClosePathIdx).toBeGreaterThan(-1);
    expect(firstFillRectIdx).toBeGreaterThan(firstClosePathIdx);
    expect(firstArcIdx).toBeGreaterThan(firstFillRectIdx);

    // 城點：3px 方點置中於世界座標換算後的小地圖座標。
    const castleMini = worldToMini({ x: 1000, y: 2000 }, SIZE);
    expect(rec.argsOf('fillRect')).toContainEqual([castleMini.x - 1.5, castleMini.y - 1.5, 3, 3]);

    // 部隊點：以 arc 畫圓，半徑 1（直徑 2px）。
    const armyMini = worldToMini({ x: 3000, y: 1000 }, SIZE);
    expect(rec.argsOf('arc')).toContainEqual([armyMini.x, armyMini.y, 1, 0, Math.PI * 2]);
  });

  it('城點填色＝clanColorHex(colorIndex)；部隊點填色＝clanColorHex(colorIndex, true)（亮變體）', () => {
    const rec = new RecordingCtx();
    const fillStyleHistory: string[] = [];
    const originalFillRect = rec.fillRect.bind(rec);
    rec.fillRect = (...a: unknown[]): void => {
      fillStyleHistory.push(rec.fillStyle);
      originalFillRect(...(a as [number, number, number, number]));
    };
    const originalArc = rec.arc.bind(rec);
    let armyFillStyle = '';
    rec.arc = (...a: unknown[]): void => {
      armyFillStyle = rec.fillStyle;
      originalArc(...(a as [number, number, number, number, number]));
    };

    drawMiniMapBase(rec, fixtureModel(), SIZE);

    expect(fillStyleHistory).toContain(clanColorHex(0, false));
    expect(armyFillStyle).toBe(clanColorHex(1, true));
  });

  it('colorIndex=null（無主／查無勢力）時填色＝TOKENS.color.neutralClanless', () => {
    const rec = new RecordingCtx();
    const capturedFillStyles: string[] = [];
    const originalFillRect = rec.fillRect.bind(rec);
    rec.fillRect = (...a: unknown[]): void => {
      capturedFillStyles.push(rec.fillStyle);
      originalFillRect(...(a as [number, number, number, number]));
    };

    drawMiniMapBase(rec, fixtureModel({ castles: [{ x: 0, y: 0, colorIndex: null }] }), SIZE);
    expect(capturedFillStyles).toContain(TOKENS.color.neutralClanless);
  });

  it('輪廓使用地圖陸色、保留 ink300 描邊寬 0.5px', () => {
    const rec = new RecordingCtx();
    drawMiniMapBase(rec, fixtureModel({ castles: [], armies: [] }), SIZE);
    expect(rec.fillStyle).toBe(MAP_PALETTE_HEX.landBase);
    expect(rec.strokeStyle).toBe(TOKENS.color.ink300);
    expect(rec.lineWidth).toBe(0.5);
  });

  it('空多邊形（無點）不呼叫 moveTo（防禦）', () => {
    const rec = new RecordingCtx();
    drawMiniMapBase(rec, fixtureModel({ outline: [[]], castles: [], armies: [] }), SIZE);
    expect(rec.countOf('moveTo')).toBe(0);
  });
});

describe('drawMiniMapViewportFrame（§5.5：viewport 矩形，gold 1.5px）', () => {
  it('keeps a readable locator on both sea and land without moving its rectangle', () => {
    const rec = new RecordingCtx();
    const styles: { color: string; width: number }[] = [];
    rec.strokeRect = (): void => {
      styles.push({ color: rec.strokeStyle, width: rec.lineWidth });
    };
    drawMiniMapViewportFrame(rec, { x: 100, y: 200, width: 300, height: 400 }, SIZE);
    expect(styles).toEqual([
      { color: TOKENS.color.ink900, width: 3.5 },
      { color: TOKENS.color.accentGold, width: 1.5 },
    ]);
    const luminance = (hex: string): number => {
      const channels = [1, 3, 5].map((start) => {
        const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
    };
    const contrast = (a: string, b: string): number => {
      const first = luminance(a);
      const second = luminance(b);
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    };
    expect(contrast(TOKENS.color.accentGold, MAP_PALETTE_HEX.seaDeep)).toBeGreaterThan(3);
    expect(contrast(TOKENS.color.ink900, MAP_PALETTE_HEX.landBase)).toBeGreaterThan(3);
    expect(contrast(TOKENS.color.accentGold, TOKENS.color.ink900)).toBeGreaterThan(3);
  });
  it('清框後以 strokeRect 畫出換算後的世界可視範圍矩形', () => {
    const rec = new RecordingCtx();
    const viewport = { x: 1024, y: 512, width: 2048, height: 1024 };
    drawMiniMapViewportFrame(rec, viewport, SIZE);

    expect(rec.calls[0]).toEqual(['clearRect', 0, 0, SIZE, SIZE]);
    const topLeft = worldToMini({ x: viewport.x, y: viewport.y }, SIZE);
    const s = SIZE / WORLD_SIZE;
    expect(rec.argsOf('strokeRect')).toEqual([
      [topLeft.x, topLeft.y, viewport.width * s, viewport.height * s],
      [topLeft.x, topLeft.y, viewport.width * s, viewport.height * s],
    ]);
    expect(rec.strokeStyle).toBe(TOKENS.color.accentGold);
    expect(rec.lineWidth).toBe(1.5);
  });
});
