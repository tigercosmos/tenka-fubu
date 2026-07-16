// 共用 pixi.js 測試替身（沿用 src/ui/map/MapCanvasHost.spec.tsx，M2-13，17 §3.2「以 @pixi/node 或
// mock」）：pixi.js 於 jsdom 無 WebGL/Canvas context，任何會掛載 `MapCanvasHost`／`MapRenderer` 的
// 元件測試（不只地圖本身，M2-19 起 `MainScreen` 亦掛載）皆須整包 mock，否則 `Application.init()`
// 內部呼叫 `canvas.getContext()` 得到 `null` 而丟出未攔截例外（unhandled rejection）。
//
// 用法（各呼叫端各自獨立的 `apps` 追蹤陣列，互不干擾）：
//   const hoisted = vi.hoisted(() => ({ apps: [] as { destroyed: boolean }[] }));
//   vi.mock('pixi.js', async () => {
//     const { createPixiMockClasses } = await import('../../../tests/helpers/pixiMock');
//     return createPixiMockClasses(hoisted.apps);
//   });
// 只需要「不 throw」、不關心建立/銷毀計數時，`apps` 參數可省略（內部退回一次性陣列）。

export interface PixiMockAppRecord {
  destroyed: boolean;
}

/** territory 自持 `BufferImageSource` 之追蹤記錄（M6-V5，§5.4）：`update()` 次數與是否 `destroy`。 */
export interface PixiMockBufferSourceRecord {
  updateCalls: number;
  destroyed: boolean;
}

/** `Texture` 之追蹤記錄（M6-V5，§5.4）：是否 `destroy`（重掛洩漏對稱斷言用）。 */
export interface PixiMockTextureRecord {
  destroyed: boolean;
}

/**
 * 選用之實例追蹤陣列（M6-V5，§5.4）：測試傳入後，每個建立的 `BufferImageSource`／`Texture`
 * 會 push 進對應陣列（陣列元素即實例本身，含 `updateCalls`/`destroyed`），供 territory 首幀著色／
 * owner 翻轉 recolor 次數與 StrictMode 重掛對稱 destroy 斷言。省略時不追蹤。
 */
export interface PixiMockTrackers {
  bufferSources?: PixiMockBufferSourceRecord[];
  textures?: PixiMockTextureRecord[];
}

/**
 * 建立一組最小可用的 pixi.js 替身類別，供 `vi.mock('pixi.js', ...)` 回傳。
 * M6-V5（§5.4）新增 `Sprite`/`Texture`/`BufferImageSource`/`Assets`（territory 與 relief/forest
 * 之 texture 路徑於 jsdom 不 throw）；`trackers` 選填以追蹤 territory source/texture 生命週期。
 */
export function createPixiMockClasses(
  apps: PixiMockAppRecord[] = [],
  trackers: PixiMockTrackers = {},
): {
  Application: unknown;
  Container: unknown;
  Graphics: unknown;
  BitmapText: unknown;
  Rectangle: unknown;
  Sprite: unknown;
  Texture: unknown;
  BufferImageSource: unknown;
  Assets: unknown;
} {
  class Container {
    label = '';
    children: Container[] = [];
    // parent 追蹤（比照真實 Pixi 與 terrainDraw.spec mock）：relief/forest sprite 以
    // `s.parent?.removeChild(s)` detach，若不設 parent 則 detach 於 mock 恆為 no-op（重掛/清空漏測）。
    parent: Container | null = null;
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
      c.parent = this;
      return c;
    }
    removeChildren(): Container[] {
      const c = this.children;
      for (const child of c) child.parent = null;
      this.children = [];
      return c;
    }
    removeChild<T extends Container>(c: T): T {
      this.children = this.children.filter((x) => x !== c);
      c.parent = null;
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
  class Sprite extends Container {
    texture: unknown;
    alpha = 1;
    width = 0;
    height = 0;
    anchor = {
      x: 0,
      y: 0,
      set(x: number, y: number = x): void {
        this.x = x;
        this.y = y;
      },
    };
    constructor(texture?: unknown) {
      super();
      this.texture = texture ?? null;
    }
    setSize(w: number, h: number = w): void {
      this.width = w;
      this.height = h;
    }
    // 呼叫端傳入之 options（如 `{ texture: false }`）於 mock 忽略；JS 允許多傳實參。
    override destroy(): void {}
  }
  class BufferImageSource {
    scaleMode = 'linear';
    updateCalls = 0;
    destroyed = false;
    constructor() {
      trackers.bufferSources?.push(this);
    }
    update(): void {
      this.updateCalls += 1;
    }
    destroy(): void {
      this.destroyed = true;
    }
  }
  class Texture {
    source: { scaleMode: string };
    destroyed = false;
    constructor(options?: { source?: unknown }) {
      this.source = (options?.source as { scaleMode: string }) ?? { scaleMode: 'linear' };
      trackers.textures?.push(this);
    }
    // 呼叫端 `destroy(true)` 之布林實參於 mock 忽略。
    destroy(): void {
      this.destroyed = true;
    }
  }
  const Assets = {
    add(): void {},
    load(): Promise<unknown> {
      return Promise.resolve(new Texture());
    },
    get(): unknown {
      return new Texture();
    },
    unload(): Promise<void> {
      return Promise.resolve();
    },
  };
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
      /** 測試專用：手動推進一幀（M6-V2：`waitForIdleFrames`／M6-V5：terrain 載入失敗後 idle
       *  gate 重置驗證）。 */
      tick(): void {
        for (const cb of this.callbacks) cb();
      },
    };
    initOpts: unknown = null;
    private readonly record: PixiMockAppRecord;
    constructor() {
      this.record = { destroyed: false };
      apps.push(this.record);
    }
    init(opts: unknown): Promise<void> {
      this.initOpts = opts;
      return Promise.resolve();
    }
    destroy(): void {
      this.record.destroyed = true;
    }
  }
  return {
    Application,
    Container,
    Graphics,
    BitmapText,
    Rectangle,
    Sprite,
    Texture,
    BufferImageSource,
    Assets,
  };
}
