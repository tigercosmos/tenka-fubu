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
      add(): void {},
      remove(): void {},
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
      nodeLabels: { 'castle.solo': '試城' },
      provinceLabels: [{ id: 'province.test', text: '試國', pos: { x: 10, y: 20 } }],
    });
    expect(layers?.roads.children.length).toBe(1);
    expect(layers?.nodeMarkers.children.length).toBe(1);
    expect(layers?.labels.children.length).toBe(2);
    expect(layers?.labels.children[0]?.visible).toBe(false);
    expect(layers?.labels.children[1]?.visible).toBe(true);
    expect(layers?.nodeMarkers.children[0]?.scale.x).toBe(1.4); // initial fit is far LOD
    r.updateView({ day: 2, districtOwner: {}, castleOwner: {}, selection: null });
    r.destroy();
  });

  it('M4 掛載 ArmyChip/SiegeMarker，且同節點 5 隊只顯示 3 隊＋「+2」收合棋', async () => {
    const host = document.createElement('div');
    const r = new MapRenderer();
    await r.init(host, vi.fn());
    const armies = Array.from({ length: 5 }, (_, index) => ({
      id: `army.${String(index + 1).padStart(6, '0')}`,
      stackKey: 'castle.solo',
      pos: { x: 10, y: 20 },
      colorIndex: 0,
      soldiers: 1_000,
      morale: 80,
      corps: false,
    }));
    r.updateView({
      day: 1,
      districtOwner: {},
      castleOwner: {},
      selection: null,
      armies,
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
