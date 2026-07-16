// `createTerrainSprite`／`createWaterFeatures`（src/ui/map/terrain/terrainDraw.ts）純繪製函式測試。
// 規格：M6-V5 技術設計文件 §4.4、§8.1（terrainDraw.spec 列）：河 class 分派（far 僅 g3、mid g3+g2、
// near 全）、taper 首段線寬≈0.4×末段、id 字典序；湖 fill＋stroke 指令；`setStage` visible 矩陣。
//
// 本檔為 Slice C 自有檔，`terrainDraw.ts` 對 pixi.js 為**值**匯入（`Container`/`Graphics`/`Sprite`
// 皆於函式內 `new`），不像 `mapDraw.ts` 只有 `import type`。共用 `tests/helpers/pixiMock.ts`
// 尚未提供 `Sprite`（留待 Slice D 補齊，見 M6-V5 §5.4／§7 Slice D 擁有檔），故本檔改採**本檔自有**
// `vi.mock('pixi.js', ...)`：以「錄製用 mock Graphics」（沿用 tests/ui/mapDraw.spec.ts 的
// RecordingGraphics 慣例）取代真正的 Pixi 繪製指令，驗證呼叫序列而非像素輸出（17 §3.2）。
// mock 類別置於 `vi.hoisted(...)`（沿用 mapRendererDirty.spec.ts 之 hoisted-apps 慣例）：
// `vi.mock` 工廠函式由 vitest 轉譯階段提升至檔案最頂端執行，若直接參照模組作用域的一般
// class 宣告會落入 TDZ（尚未初始化）；`vi.hoisted` 的回呼與 `vi.mock` 同步提升、依原始碼序
// 執行，故其回傳值在 `vi.mock` 工廠執行當下已可用。

import { describe, expect, it, vi } from 'vitest';
import type { LodStage } from '../lod';
import { MAP_PALETTE_NUM } from '@ui/styles/tokens';
import { RIVER_TAPER_HEAD, RIVER_WIDTH, TERRAIN_SPRITE_WORLD } from '../mapViewConfig';

const hoisted = vi.hoisted(() => {
  // 沿用 tests/ui/mapDraw.spec.ts 的 RecordingGraphics 慣例：每個繪製指令記錄
  // (method, ...args)，供斷言呼叫序列；Container/Sprite 為建構 waterFeatures/terrainBase
  // 所需的最小容器語意。
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
  class MockSprite extends MockDisplayObject {
    texture: unknown;
    width = 0;
    height = 0;
    alpha = 1;
    position = {
      x: 0,
      y: 0,
      set(x: number, y: number = x): void {
        this.x = x;
        this.y = y;
      },
    };
    constructor(t?: unknown) {
      super();
      this.texture = t ?? null;
    }
    setSize(w: number, h: number = w): void {
      this.width = w;
      this.height = h;
    }
  }
  class MockTexture {
    constructor(public source?: unknown) {}
  }
  return { MockDisplayObject, MockContainer, RecordingGraphics, MockSprite, MockTexture };
});

vi.mock('pixi.js', () => ({
  Container: hoisted.MockContainer,
  Graphics: hoisted.RecordingGraphics,
  Sprite: hoisted.MockSprite,
  Texture: hoisted.MockTexture,
}));

import { createTerrainSprite, createWaterFeatures } from './terrainDraw';

type RecordingGraphics = InstanceType<typeof hoisted.RecordingGraphics>;
type MockDisplayObject = InstanceType<typeof hoisted.MockDisplayObject>;
type MockSprite = InstanceType<typeof hoisted.MockSprite>;

type River = { id: string; points: { x: number; y: number }[]; widthClass: 1 | 2 | 3 };
type Lake = { id: string; polygon: { x: number; y: number }[] };

function river(id: string, widthClass: 1 | 2 | 3, points: { x: number; y: number }[]): River {
  return { id, widthClass, points };
}

function lake(id: string, polygon: { x: number; y: number }[]): Lake {
  return { id, polygon };
}

/** 建立一個小型合成湖泊（三角形，最小合法多邊形）。 */
function triLake(id: string, x: number, y: number): Lake {
  return lake(id, [
    { x, y },
    { x: x + 10, y },
    { x: x + 5, y: y + 10 },
  ]);
}

describe('createTerrainSprite（§4.4）', () => {
  it('以傳入 texture 建 Sprite，置左上角原點，setSize 鋪滿 TERRAIN_SPRITE_WORLD', () => {
    const texture = new hoisted.MockTexture();
    const sprite = createTerrainSprite(texture as never);
    const mock = sprite as unknown as MockSprite;
    expect(mock.texture).toBe(texture);
    expect(mock.position.x).toBe(0);
    expect(mock.position.y).toBe(0);
    expect(mock.width).toBe(TERRAIN_SPRITE_WORLD);
    expect(mock.height).toBe(TERRAIN_SPRITE_WORLD);
  });
});

describe('createWaterFeatures — 湖（恆顯，多邊形 fill＋stroke）', () => {
  it('每湖一次 poly+fill、一次 poly+stroke；色取 MAP_PALETTE_NUM', () => {
    const lakes = [triLake('lk.a', 0, 0), triLake('lk.b', 100, 100)];
    const wf = createWaterFeatures([], lakes);
    const lakeGfx = wf.container.children[0] as unknown as RecordingGraphics;
    expect(lakeGfx.countOf('poly')).toBe(2 * lakes.length); // fill 一次 poly + stroke 一次 poly
    expect(lakeGfx.countOf('fill')).toBe(lakes.length);
    expect(lakeGfx.countOf('stroke')).toBe(lakes.length);
    const fillColors = lakeGfx.argsOf('fill').map((a) => (a[0] as { color: number }).color);
    expect(fillColors.every((c) => c === MAP_PALETTE_NUM.waterRiver)).toBe(true);
    const strokeArgs = lakeGfx
      .argsOf('stroke')
      .map((a) => a[0] as { width: number; color: number; alpha: number });
    for (const s of strokeArgs) {
      expect(s.width).toBe(1);
      expect(s.color).toBe(MAP_PALETTE_NUM.reliefInk);
      expect(s.alpha).toBe(0.4);
    }
  });

  it('lakeGfx 恆為 visible（setStage 前後皆為 true）', () => {
    const wf = createWaterFeatures([], [triLake('lk.a', 0, 0)]);
    const lakeGfx = wf.container.children[0] as unknown as RecordingGraphics;
    expect(lakeGfx.visible).toBe(true);
    wf.setStage('far');
    expect(lakeGfx.visible).toBe(true);
  });
});

describe('createWaterFeatures — 河（widthClass 分派＋taper）', () => {
  it('依 widthClass 分派到對應 Graphics（3/2/1），互不混雜', () => {
    const r3 = river('rv.c3', 3, [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
    const r2 = river('rv.c2', 2, [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
    const r1 = river('rv.c1', 1, [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
    const wf = createWaterFeatures([r3, r2, r1], []);
    const [, gfx3, gfx2, gfx1] = wf.container.children as unknown as RecordingGraphics[];
    expect(gfx3!.countOf('stroke')).toBe(1);
    expect(gfx2!.countOf('stroke')).toBe(1);
    expect(gfx1!.countOf('stroke')).toBe(1);
    const w3 = (gfx3!.argsOf('stroke')[0]![0] as { width: number }).width;
    const w2 = (gfx2!.argsOf('stroke')[0]![0] as { width: number }).width;
    const w1 = (gfx1!.argsOf('stroke')[0]![0] as { width: number }).width;
    // 單段河流（僅 2 點）無比例可插，退回 1.0×＝RIVER_WIDTH[class] 原值。
    expect(w3).toBe(RIVER_WIDTH[3]);
    expect(w2).toBe(RIVER_WIDTH[2]);
    expect(w1).toBe(RIVER_WIDTH[1]);
  });

  it('taper：首段線寬＝RIVER_TAPER_HEAD×末段（末段恰為 1.0×，上游 0.4×→下游 1.0×）', () => {
    const r = river('rv.taper', 3, [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
      { x: 30, y: 0 },
    ]); // 3 段
    const wf = createWaterFeatures([r], []);
    const gfx3 = wf.container.children[1] as unknown as RecordingGraphics;
    const widths = gfx3.argsOf('stroke').map((a) => (a[0] as { width: number }).width);
    expect(widths).toHaveLength(3);
    const [first, mid, last] = widths;
    expect(first).toBeCloseTo(RIVER_WIDTH[3] * RIVER_TAPER_HEAD, 6);
    expect(last).toBeCloseTo(RIVER_WIDTH[3] * 1, 6);
    expect(mid).toBeCloseTo(RIVER_WIDTH[3] * ((RIVER_TAPER_HEAD + 1) / 2), 6);
    expect(first! / last!).toBeCloseTo(RIVER_TAPER_HEAD, 6);
    // cap/join：圓頭圓角（04 §3.10.1 水系視覺要求）。
    const strokeOpts = gfx3.argsOf('stroke')[0]![0] as { cap: string; join: string };
    expect(strokeOpts.cap).toBe('round');
    expect(strokeOpts.join).toBe('round');
  });

  it('同一 widthClass 內多條河依 id 字典序繪製（決定論）', () => {
    const rb = river('rv.b', 3, [
      { x: 999, y: 999 },
      { x: 998, y: 998 },
    ]);
    const ra = river('rv.a', 3, [
      { x: 111, y: 111 },
      { x: 112, y: 112 },
    ]);
    const wf = createWaterFeatures([rb, ra], []); // 傳入序：b 先於 a（測試不依賴輸入序）
    const gfx3 = wf.container.children[1] as unknown as RecordingGraphics;
    const moveToXs = gfx3.argsOf('moveTo').map((a) => a[0] as number);
    // id 字典序：rv.a 先於 rv.b → moveTo(111,...) 先於 moveTo(999,...)。
    expect(moveToXs).toEqual([111, 999]);
  });

  it('河色取 MAP_PALETTE_NUM.waterRiver', () => {
    const r = river('rv.color', 2, [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
    const wf = createWaterFeatures([r], []);
    const gfx2 = wf.container.children[2] as unknown as RecordingGraphics;
    const color = (gfx2.argsOf('stroke')[0]![0] as { color: number }).color;
    expect(color).toBe(MAP_PALETTE_NUM.waterRiver);
  });
});

describe('createWaterFeatures — setStage 顯隱矩陣（§3.3：far 僅 3／mid 3+2／near 全；湖恆顯）', () => {
  function stages(
    wf: ReturnType<typeof createWaterFeatures>,
    stage: LodStage,
  ): { lake: boolean; g3: boolean; g2: boolean; g1: boolean } {
    wf.setStage(stage);
    const [lakeGfx, gfx3, gfx2, gfx1] = wf.container.children as unknown as RecordingGraphics[];
    return {
      lake: lakeGfx!.visible,
      g3: gfx3!.visible,
      g2: gfx2!.visible,
      g1: gfx1!.visible,
    };
  }

  it('far：僅 class 3 可見（class 2/1 隱藏）', () => {
    const wf = createWaterFeatures([], [triLake('lk.a', 0, 0)]);
    expect(stages(wf, 'far')).toEqual({ lake: true, g3: true, g2: false, g1: false });
  });

  it('mid：class 3,2 可見（class 1 隱藏）', () => {
    const wf = createWaterFeatures([], [triLake('lk.a', 0, 0)]);
    expect(stages(wf, 'mid')).toEqual({ lake: true, g3: true, g2: true, g1: false });
  });

  it('near：全部可見', () => {
    const wf = createWaterFeatures([], [triLake('lk.a', 0, 0)]);
    expect(stages(wf, 'near')).toEqual({ lake: true, g3: true, g2: true, g1: true });
  });

  it('連續切換 far→near→far 每次矩陣皆正確（非一次性初始化殘留）', () => {
    const wf = createWaterFeatures([], [triLake('lk.a', 0, 0)]);
    expect(stages(wf, 'far')).toEqual({ lake: true, g3: true, g2: false, g1: false });
    expect(stages(wf, 'near')).toEqual({ lake: true, g3: true, g2: true, g1: true });
    expect(stages(wf, 'far')).toEqual({ lake: true, g3: true, g2: false, g1: false });
  });
});

describe('createWaterFeatures — destroy', () => {
  it('destroy 級聯銷毀 container 之 children', () => {
    const wf = createWaterFeatures(
      [
        river('rv.a', 3, [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ]),
      ],
      [triLake('lk.a', 0, 0)],
    );
    const children = wf.container.children as unknown as MockDisplayObject[];
    const destroySpies = children.map((c) => vi.spyOn(c, 'destroy'));
    wf.destroy();
    for (const spy of destroySpies) expect(spy).toHaveBeenCalled();
  });
});
