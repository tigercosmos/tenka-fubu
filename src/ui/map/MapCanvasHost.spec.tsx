// MapCanvasHost＋MapRenderer 生命週期測試（M2-13；01-A10）；末段另涵蓋 idle 模式命中測試與事件
// 協定（M2-17；04 §3.12，interaction.ts 之純邏輯測試見 tests/ui/interaction.spec.ts）。
// 驗收精神（01-A10）：StrictMode 掛載→卸載→再掛載無 WebGL context 洩漏——以 mock Pixi 驗證
// 每個建立的 Application 皆對稱 destroy（init/destroy 對稱、destroy 冪等、init 進行中卸載安全）。
// 實 60fps／截圖層序目視驗收留待 e2e／手動（04-T8）。
//
// pixi.js 於 jsdom 無 WebGL，故整包 mock（17 §3.2「以 @pixi/node 或 mock」）：Application 記錄
// 建立/銷毀，Container/Graphics 提供 MapRenderer 用到的最小 API（`on`/`off`/`emit` 泛型事件名，
// M2-17 新增之 `pointermove`/`rightclick` 監聽沿用同一 mock 無需擴充）。

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StrictMode } from 'react';
import { act, render } from '@testing-library/react';

const hoisted = vi.hoisted(() => {
  const apps: { destroyed: boolean }[] = [];
  return { apps };
});

vi.mock('pixi.js', () => {
  class Container {
    label = '';
    children: Container[] = [];
    visible = true;
    eventMode = 'auto';
    hitArea: unknown = null;
    scale = {
      x: 1,
      y: 1,
      set(x: number, y: number = x) {
        this.x = x;
        this.y = y;
      },
    };
    position = {
      x: 0,
      y: 0,
      set(x: number, y: number) {
        this.x = x;
        this.y = y;
      },
    };
    private handlers: Record<string, ((...a: unknown[]) => void)[]> = {};
    addChild<T extends Container>(c: T): T {
      this.children.push(c);
      return c;
    }
    removeChildren(): Container[] {
      const c = this.children;
      this.children = [];
      return c;
    }
    removeChild<T extends Container>(c: T): T {
      this.children = this.children.filter((x) => x !== c);
      return c;
    }
    on(e: string, cb: (...a: unknown[]) => void): this {
      (this.handlers[e] ??= []).push(cb);
      return this;
    }
    off(e: string, cb: (...a: unknown[]) => void): this {
      this.handlers[e] = (this.handlers[e] ?? []).filter((f) => f !== cb);
      return this;
    }
    emit(e: string, ...a: unknown[]): void {
      for (const f of this.handlers[e] ?? []) f(...a);
    }
    destroy(): void {}
  }
  class Graphics extends Container {
    clear(): this {
      return this;
    }
    rect(): this {
      return this;
    }
    poly(): this {
      return this;
    }
    circle(): this {
      return this;
    }
    arc(): this {
      return this;
    }
    moveTo(): this {
      return this;
    }
    lineTo(): this {
      return this;
    }
    fill(): this {
      return this;
    }
    stroke(): this {
      return this;
    }
  }
  class BitmapText extends Container {
    text: string;
    constructor(options: { text: string }) {
      super();
      this.text = options.text;
    }
  }
  class Rectangle {
    constructor(
      public x: number,
      public y: number,
      public width: number,
      public height: number,
    ) {}
  }
  class Application {
    canvas: HTMLCanvasElement = document.createElement('canvas');
    stage = new Container();
    screen = { width: 800, height: 600 };
    renderer = {
      width: 800,
      height: 600,
      on(): void {},
      off(): void {},
      resize(): void {},
    };
    ticker = {
      deltaMS: 16,
      callbacks: [] as (() => void)[],
      add(cb: () => void): void {
        this.callbacks.push(cb);
      },
      remove(cb: () => void): void {
        this.callbacks = this.callbacks.filter((f) => f !== cb);
      },
      /** 測試專用：手動推進一幀（M6-V2：`waitForIdleFrames` 驗證）。 */
      tick(): void {
        for (const cb of this.callbacks) cb();
      },
    };
    initOpts: unknown = null;
    private readonly record: { destroyed: boolean };
    constructor() {
      this.record = { destroyed: false };
      hoisted.apps.push(this.record);
    }
    init(opts: unknown): Promise<void> {
      this.initOpts = opts;
      return Promise.resolve();
    }
    destroy(): void {
      this.record.destroyed = true;
    }
  }
  return { Application, Container, Graphics, BitmapText, Rectangle };
});

// mock 生效後才 import 受測模組（vitest 會 hoist vi.mock 到 import 之上，但顯式順序更清楚）。
import { MapCanvasHost } from './MapCanvasHost';
import { MapRenderer } from './MapRenderer';
import { LAYER_ORDER } from './mapViewTypes';
import type { MapEventHandler } from './mapViewTypes';
import { buildMapGraph } from '@core/state/mapGraph';
import type { CastleId } from '@core/state/ids';
import { getDebugMapRenderer, resetDebugMapRendererForTests } from './debugMapBridge';

/** 沖掉 init 的 async 鏈（await app.init 之後的 .then 需再一輪 macrotask）。 */
async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

function soloGraph(): ReturnType<typeof buildMapGraph> {
  return buildMapGraph(
    { 'castle.solo': { id: 'castle.solo' as CastleId, pos: { x: 10, y: 20 } } } as never,
    {},
    {},
  );
}

const created = (): number => hoisted.apps.length;
const destroyed = (): number => hoisted.apps.filter((a) => a.destroyed).length;
const alive = (): number => hoisted.apps.filter((a) => !a.destroyed).length;

beforeEach(() => {
  hoisted.apps.length = 0;
  resetDebugMapRendererForTests();
});

describe('MapCanvasHost 生命週期（01-A10）', () => {
  it('mount→unmount：建立的 Application 全數 destroy（無洩漏）', async () => {
    const { unmount } = render(<MapCanvasHost onMapEvent={vi.fn()} />);
    await flush();
    expect(created()).toBe(1);
    expect(alive()).toBe(1);

    unmount();
    await flush();
    expect(destroyed()).toBe(created()); // 對稱
    expect(alive()).toBe(0);
  });

  it('StrictMode 掛載→卸載→再掛載：僅一個 Application 存活，卸載後全數銷毀', async () => {
    const { unmount } = render(
      <StrictMode>
        <MapCanvasHost onMapEvent={vi.fn()} />
      </StrictMode>,
    );
    await flush();
    // StrictMode 於 dev 雙掛載：建立 2 個渲染器，第一個於 cleanup 後被銷毀，僅 1 個存活。
    expect(created()).toBe(2);
    expect(alive()).toBe(1);

    unmount();
    await flush();
    expect(destroyed()).toBe(created()); // 2 = 2，無 WebGL context 洩漏
    expect(alive()).toBe(0);
  });
});

describe('debugMapBridge 登記／解除登記（M6-V2；17 §3.9.3）', () => {
  it('mount 完成後登記為活躍渲染器；unmount 後解除登記', async () => {
    expect(getDebugMapRenderer()).toBeNull();
    const { unmount } = render(<MapCanvasHost onMapEvent={vi.fn()} />);
    await flush();
    expect(getDebugMapRenderer()).not.toBeNull();

    unmount();
    await flush();
    expect(getDebugMapRenderer()).toBeNull();
  });
});

describe('MapRenderer 生命週期與圖層骨架（04 §3.10.1／04-T8）', () => {
  it('init 建立 world＋8 圖層（由下而上層序）並繪製 seaBackground', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const onEvent = vi.fn();
    const r = new MapRenderer();
    await r.init(host, onEvent);

    const app = r.getApp();
    expect(app).not.toBeNull();
    const layers = r.getLayers();
    expect(layers).not.toBeNull();
    // stage → world → 8 圖層。
    expect(app?.stage.children).toContain(layers?.world);
    expect(layers?.world.children.map((c) => c.label)).toEqual([...LAYER_ORDER]);
    // seaBackground 內有一個 Graphics（outline 繪製）。
    expect(layers?.seaBackground.children.length).toBe(1);
    // canvas 已掛入 host。
    expect(host.querySelector('canvas')).not.toBeNull();

    r.destroy();
  });

  it('事件管線：stage pointertap → onEvent({type:emptyClick})', async () => {
    const host = document.createElement('div');
    const onEvent = vi.fn();
    const r = new MapRenderer();
    await r.init(host, onEvent);
    const stage = r.getApp()?.stage as unknown as { emit: (e: string) => void };
    stage.emit('pointertap');
    expect(onEvent).toHaveBeenCalledWith({ type: 'emptyClick' });
    r.destroy();
  });

  it('destroy 冪等：重複呼叫安全、app 歸零、isReady=false', async () => {
    const host = document.createElement('div');
    const r = new MapRenderer();
    await r.init(host, vi.fn());
    expect(r.isReady()).toBe(true);
    r.destroy();
    r.destroy();
    expect(r.getApp()).toBeNull();
    expect(r.getLayers()).toBeNull();
    expect(r.isReady()).toBe(false);
  });

  it('init 進行中 destroy：完成後不掛入且剛建立的 Application 被銷毀（無洩漏）', async () => {
    const host = document.createElement('div');
    const r = new MapRenderer();
    const p = r.init(host, vi.fn()); // 不 await：模擬 init 進行中
    r.destroy(); // 卸載先於 init resolve
    await p;
    await flush();
    expect(r.getApp()).toBeNull();
    expect(created()).toBe(1);
    expect(destroyed()).toBe(1);
  });

  it('setMapData 為 roads/nodeMarkers 各建立一個 Graphics 並重繪；updateView 不 throw', async () => {
    const host = document.createElement('div');
    const r = new MapRenderer();
    await r.init(host, vi.fn());
    const layers = r.getLayers();
    r.setMapData({
      graph: soloGraph(),
      clanColorIndex: {},
      castleTier: { 'castle.solo': 'main' },
      names: { 'castle.solo': '試城', 'province.test': '試國' },
      provinceLabelPos: { 'province.test': { x: 10, y: 20 } },
    });
    expect(layers?.roads.children.length).toBe(1);
    expect(layers?.nodeMarkers.children.length).toBe(1);
    expect(layers?.labels.children.length).toBe(2);
    expect(layers?.labels.children[0]?.visible).toBe(false);
    expect(layers?.labels.children[1]?.visible).toBe(true);
    expect(layers?.nodeMarkers.children[0]?.scale.x).toBe(1.4); // initial fit is far LOD
    r.updateView({
      day: 2,
      districtOwner: {},
      castles: [],
      armies: [],
      battles: [],
      selection: null,
      analysisMode: 'none',
    });
    r.destroy();
  });

  it('M4 掛載 ArmyChip/SiegeMarker，且同節點 5 隊只顯示 3 隊＋「+2」收合棋', async () => {
    const host = document.createElement('div');
    const r = new MapRenderer();
    await r.init(host, vi.fn());
    const armies = Array.from({ length: 5 }, (_, index) => ({
      id: `army.${String(index + 1).padStart(6, '0')}`,
      clanId: 'clan.solo',
      soldiers: 1_000,
      status: 'holding' as const,
      morale: 80,
      foodDays: 10,
      mission: 'march' as const,
      fromNode: 'castle.solo' as never,
      toNode: null,
      edgeT: 0,
      corps: false,
      selected: false,
    }));
    r.updateView({
      day: 1,
      districtOwner: {},
      castles: [],
      armies,
      battles: [],
      selection: null,
      analysisMode: 'none',
      sieges: [{ id: 'siege.000001', pos: { x: 10, y: 20 }, mode: 'encircle' }],
    });

    const layers = r.getLayers()!;
    expect(layers.armies.children).toHaveLength(5);
    expect(layers.armies.children.filter((child) => child.visible)).toHaveLength(4);
    const collapseChip = layers.armies.children[3] as unknown as { children: { text?: string }[] };
    expect(collapseChip.children[1]?.text).toBe('+2');
    expect(layers.effects.children).toHaveLength(1);
    r.destroy();
  });
});

describe('idle 模式命中測試與事件協定（M2-17；04 §3.12）', () => {
  /** 固定 world 容器為單位變換（scale=1、position=0），使螢幕座標＝世界座標，斷言更直觀。 */
  async function initWithIdentityWorld(onEvent: MapEventHandler): Promise<MapRenderer> {
    const host = document.createElement('div');
    const r = new MapRenderer();
    await r.init(host, onEvent);
    const layers = r.getLayers();
    layers?.world.scale.set(1);
    layers?.world.position.set(0, 0);
    r.setMapData({ graph: soloGraph(), clanColorIndex: {} }); // castle.solo @ (10,20)
    return r;
  }

  it('pointermove 命中城 → onEvent(nodeHover) 含螢幕座標；移出 → nodeHover(id:null)', async () => {
    const onEvent = vi.fn();
    const r = await initWithIdentityWorld(onEvent);
    const stage = r.getApp()?.stage as unknown as { emit: (e: string, ...a: unknown[]) => void };

    onEvent.mockClear();
    stage.emit('pointermove', { global: { x: 10, y: 20 } }); // 命中城中心
    expect(onEvent).toHaveBeenCalledWith({
      type: 'nodeHover',
      nodeKind: 'castle',
      id: 'castle.solo',
      screenX: 10,
      screenY: 20,
    });

    onEvent.mockClear();
    stage.emit('pointermove', { global: { x: 500, y: 500 } }); // 遠離任何節點
    expect(onEvent).toHaveBeenCalledWith({
      type: 'nodeHover',
      nodeKind: null,
      id: null,
      screenX: 500,
      screenY: 500,
    });
    r.destroy();
  });

  it('pointertap 命中城 → onEvent(nodeClick)（驗收：點城開面板事件發出）', async () => {
    const onEvent = vi.fn();
    const r = await initWithIdentityWorld(onEvent);
    const stage = r.getApp()?.stage as unknown as { emit: (e: string, ...a: unknown[]) => void };

    onEvent.mockClear();
    stage.emit('pointertap', { global: { x: 10, y: 20 } });
    expect(onEvent).toHaveBeenCalledWith({
      type: 'nodeClick',
      nodeKind: 'castle',
      id: 'castle.solo',
    });
    r.destroy();
  });

  it('pointertap 未命中 → onEvent(emptyClick)（既有 M2-13 行為延續）', async () => {
    const onEvent = vi.fn();
    const r = await initWithIdentityWorld(onEvent);
    const stage = r.getApp()?.stage as unknown as { emit: (e: string, ...a: unknown[]) => void };

    onEvent.mockClear();
    stage.emit('pointertap', { global: { x: 9999, y: 9999 } });
    expect(onEvent).toHaveBeenCalledWith({ type: 'emptyClick' });
    r.destroy();
  });

  it('rightclick → onEvent(rightClick)', async () => {
    const onEvent = vi.fn();
    const host = document.createElement('div');
    const r = new MapRenderer();
    await r.init(host, onEvent);
    const stage = r.getApp()?.stage as unknown as { emit: (e: string, ...a: unknown[]) => void };

    onEvent.mockClear();
    stage.emit('rightclick');
    expect(onEvent).toHaveBeenCalledWith({ type: 'rightClick' });
    r.destroy();
  });
});

describe('setCameraPose／waitForIdleFrames（M6-V2；17 §3.9.3 決定論截圖 harness）', () => {
  function tickerOf(r: MapRenderer): { tick: () => void } {
    return r.getApp()?.ticker as unknown as { tick: () => void };
  }

  it('setCameraPose：瞬移（無補間）、scale 依 MAPVIEW.min/maxScale 夾限', async () => {
    const host = document.createElement('div');
    const r = new MapRenderer();
    await r.init(host, vi.fn());

    r.setCameraPose({ x: 123, y: 456 }, 2);
    const layers = r.getLayers()!;
    // world.scale 已即刻反映新 scale（非等待下一 tick 才生效，見 setCameraPose 內 applyCameraTransform）。
    expect(layers.world.scale.x).toBe(2);

    r.setCameraPose({ x: 0, y: 0 }, 999); // 超過 maxScale(4.0) 應夾限
    expect(layers.world.scale.x).toBe(4);

    r.setCameraPose({ x: 0, y: 0 }, 0.0001); // 低於 minScale(0.15) 應夾限
    expect(layers.world.scale.x).toBeCloseTo(0.15);

    r.destroy();
  });

  it('waitForIdleFrames(n)：滿 n 個 ticker frame 才 resolve；未滿不 resolve', async () => {
    const host = document.createElement('div');
    const r = new MapRenderer();
    await r.init(host, vi.fn());

    let resolved = false;
    const p = r.waitForIdleFrames(3).then(() => {
      resolved = true;
    });
    const ticker = tickerOf(r);

    ticker.tick();
    await Promise.resolve();
    expect(resolved).toBe(false);

    ticker.tick();
    await Promise.resolve();
    expect(resolved).toBe(false);

    ticker.tick();
    await p;
    expect(resolved).toBe(true);

    r.destroy();
  });

  it('waitForIdleFrames(0)：立即 resolve（不待任何 frame）', async () => {
    const host = document.createElement('div');
    const r = new MapRenderer();
    await r.init(host, vi.fn());
    await expect(r.waitForIdleFrames(0)).resolves.toBeUndefined();
    r.destroy();
  });

  it('destroy()：未決 waitForIdleFrames 立即 resolve（不懸掛）', async () => {
    const host = document.createElement('div');
    const r = new MapRenderer();
    await r.init(host, vi.fn());

    const p = r.waitForIdleFrames(100);
    r.destroy();
    await expect(p).resolves.toBeUndefined();
  });
});
