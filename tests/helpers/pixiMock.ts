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

import { vi } from 'vitest';

// Borrow the installed CPU-only uniform value container, not an invented GPU
// implementation. Existing async mock factories await this module unchanged.
const { UniformGroup } = await vi.importActual<typeof import('pixi.js')>('pixi.js');

export interface PixiMockAppRecord {
  destroyed: boolean;
}

/** Installed SystemRunner semantics: dispatch an observer's same-named method. */
export class PixiMockRenderRunner {
  items: { prerender?: (options?: unknown) => void; postrender?: (options?: unknown) => void }[] =
    [];
  constructor(private readonly name: 'prerender' | 'postrender') {}
  add(item: (typeof this.items)[number]): this {
    if (item[this.name]) {
      this.remove(item);
      this.items.push(item);
    }
    return this;
  }
  remove(item: (typeof this.items)[number]): this {
    const index = this.items.indexOf(item);
    if (index !== -1) this.items.splice(index, 1);
    return this;
  }
  contains(item: (typeof this.items)[number]): boolean {
    return this.items.includes(item);
  }
  emit(options?: unknown): this {
    const items = this.items;
    for (let i = 0, length = items.length; i < length; i++) items[i]![this.name]?.(options);
    return this;
  }
  destroy(): void {
    this.items = [];
  }
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
  Mesh: unknown;
  MeshGeometry: unknown;
  Geometry: unknown;
  Buffer: unknown;
  BufferUsage: unknown;
  GlProgram: unknown;
  Shader: unknown;
  UniformGroup: typeof UniformGroup;
  BitmapText: unknown;
  TextStyle: unknown;
  Rectangle: unknown;
  Sprite: unknown;
  TilingSprite: unknown;
  Texture: unknown;
  BufferImageSource: unknown;
  Assets: unknown;
  RendererType: unknown;
  FillGradient: unknown;
  Matrix: unknown;
} {
  // Only public affine coefficients are needed by recording mocks. Real Pixi
  // matrix/UV behavior is covered separately by riverSurfaceMaterial.spec.ts.
  class Matrix {
    constructor(
      public a = 1,
      public b = 0,
      public c = 0,
      public d = 1,
      public tx = 0,
      public ty = 0,
    ) {}
  }
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
    addChild<T extends Container>(...children: T[]): T {
      for (const child of children) {
        child.parent?.removeChild(child);
        this.children.push(child);
        child.parent = this;
      }
      return children[0]!;
    }
    addChildAt<T extends Container>(child: T, index: number): T {
      if (index < 0 || index > this.children.length)
        throw new Error('addChildAt index out of bounds');
      child.parent?.removeChild(child);
      this.children.splice(index, 0, child);
      child.parent = this;
      return child;
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
    // M6-V8（§8.5）：兵數 washi100 底板（`plateGfx.roundRect`）於 mock 不 throw；比照既有 rect/poly。
    roundRect(): this {
      return this;
    }
    poly(): this {
      return this;
    }
    circle(): this {
      return this;
    }
    ellipse(): this {
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
  class TextStyle {
    constructor(options: object) {
      Object.assign(this, options);
    }
    off(): this {
      return this;
    }
  }
  class BitmapText extends Container {
    text: string;
    private _style: unknown;
    get style(): unknown {
      return this._style;
    }
    set style(value: unknown) {
      if (this._style instanceof TextStyle) this._style.off();
      this._style = value;
    }
    alpha = 1;
    // M6-V9（§2.1）：標籤 pixel-lock 之 `anchor.set(0.5, 0)`（頂-中）於 mock 不 throw；
    // 比照 Sprite.anchor（真 pixi v8 BitmapText 具 anchor ObservablePoint）。
    anchor = {
      x: 0,
      y: 0,
      set(x: number, y: number = x): void {
        this.x = x;
        this.y = y;
      },
    };
    constructor(options: { text: string; style?: unknown }) {
      super();
      this.text = options.text;
      this.style = options.style;
    }
    // M6-V8（§8.5）：以字元數 × 估寬回傳穩定 width（供任何讀 BitmapText.width 之底板尺寸斷言
    // 決定論；ArmyChip 本身改用 plateWidthForLabel 不讀此值，此為 mock 與真 pixi 之 API 對齊）。
    get width(): number {
      return this.text.length * 7;
    }
    get height(): number {
      return (this.style as { fontSize?: number } | undefined)?.fontSize ?? 12;
    }
    // API compatibility only. Native loaded-font geometry is verified headlessly.
    getLocalBounds(): { x: number; y: number; width: number; height: number } {
      const height = this.height;
      return {
        x: -this.anchor.x * this.width,
        y: -this.anchor.y * height,
        width: this.width,
        height,
      };
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
  class TilingSprite extends Sprite {
    tileScale = {
      x: 1,
      y: 1,
      set(x: number, y = x) {
        this.x = x;
        this.y = y;
      },
    };
    tilePosition = {
      x: 0,
      y: 0,
      set(x: number, y = x) {
        this.x = x;
        this.y = y;
      },
    };
    tileRotation = 0;
    constructor(options: {
      texture?: unknown;
      width?: number;
      height?: number;
      tileScale?: { x: number; y: number };
      tilePosition?: { x: number; y: number };
      tileRotation?: number;
    }) {
      super(options.texture);
      this.width = options.width ?? 256;
      this.height = options.height ?? 256;
      this.tileScale.set(options.tileScale?.x ?? 1, options.tileScale?.y ?? 1);
      this.tilePosition.set(options.tilePosition?.x ?? 0, options.tilePosition?.y ?? 0);
      this.tileRotation = options.tileRotation ?? 0;
    }
  }
  class BufferImageSource {
    width: number;
    height: number;
    resource: unknown;
    scaleMode = 'linear';
    updateCalls = 0;
    destroyed = false;
    style = {
      addressMode: 'clamp-to-edge',
      listeners: new Set<() => void>(),
      on(_event: string, listener: () => void) {
        this.listeners.add(listener);
      },
      off(_event: string, listener: () => void) {
        this.listeners.delete(listener);
      },
      update() {
        for (const listener of this.listeners) listener();
      },
    };
    constructor(options: { width?: number; height?: number; resource?: unknown } = {}) {
      this.width = options.width ?? 1;
      this.height = options.height ?? 1;
      this.resource = options.resource;
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
    width: number;
    height: number;
    frame: Rectangle;
    orig: Rectangle;
    rotate = 0;
    trim: Rectangle | undefined;
    source: {
      scaleMode: string;
      width: number;
      height: number;
      destroyed?: boolean;
      style: unknown;
      destroy?: () => void;
    };
    destroyed = false;
    constructor(options?: { source?: unknown; frame?: Rectangle }) {
      this.source = (options?.source as typeof this.source | undefined) ?? {
        scaleMode: 'linear',
        width: 1,
        height: 1,
        style: {},
      };
      this.frame = options?.frame ?? new Rectangle(0, 0, this.source.width, this.source.height);
      this.orig = this.frame;
      this.width = this.frame.width;
      this.height = this.frame.height;
      trackers.textures?.push(this);
    }
    destroy(destroySource = false): void {
      if (this.destroyed) return;
      this.destroyed = true;
      if (destroySource) (this.source as { destroy?: () => void }).destroy?.();
    }
  }
  const assetTextures = new Map<string, Texture>();
  const Assets = {
    setPreferences(): void {},
    add(): void {},
    load(alias: string): Promise<unknown> {
      let texture = assetTextures.get(alias);
      if (!texture) {
        texture = new Texture();
        assetTextures.set(alias, texture);
      }
      return Promise.resolve(texture);
    },
    get(alias: string): unknown {
      return assetTextures.get(alias);
    },
    unload(alias: string): Promise<void> {
      assetTextures.get(alias)?.destroy();
      assetTextures.delete(alias);
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
      runners: {
        prerender: new PixiMockRenderRunner('prerender'),
        postrender: new PixiMockRenderRunner('postrender'),
      },
      render: (options?: { container?: Container }): void => {
        if (options?.container?.visible === false) return;
        this.renderer.runners.prerender.emit(options);
        this.renderer.runners.postrender.emit(options);
      },
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
      tick: (): void => {
        for (const cb of this.ticker.callbacks) cb();
        this.render();
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
    render(): void {
      this.renderer.render({ container: this.stage });
    }
    destroy(): void {
      this.record.destroyed = true;
      this.ticker.callbacks = [];
      this.renderer.runners.prerender.destroy();
      this.renderer.runners.postrender.destroy();
    }
  }
  // Compatibility only: real allocation/lifetime is tested with actual Pixi.
  class FillGradient {
    constructor(public options: unknown) {}
    destroy(): void {}
  }
  // Structural CPU records only: retain arrays emitted by the actual factories.
  // No shader execution, GL allocation, projection or derived ideal geometry.
  class Buffer {
    destroyed = false;
    updateCalls = 0;
    data: Float32Array | Uint32Array | Uint16Array;
    constructor(
      public options: { data: Float32Array | Uint32Array | Uint16Array; usage?: number },
    ) {
      this.data = options.data;
    }
    update(): void {
      this.updateCalls += 1;
    }
    destroy(): void {
      this.destroyed = true;
    }
  }
  type Attribute = { buffer: Buffer; format?: string; stride?: number; offset?: number };
  class Geometry {
    destroyed = false;
    attributes: Record<string, Attribute>;
    indexBuffer: Buffer;
    buffers: Buffer[];
    constructor(options: { attributes: Record<string, Attribute>; indexBuffer: Buffer }) {
      this.attributes = options.attributes;
      this.indexBuffer = options.indexBuffer;
      this.buffers = [
        ...new Set([
          ...Object.values(options.attributes).map((a) => a.buffer),
          options.indexBuffer,
        ]),
      ];
    }
    getBuffer(name: string): Buffer {
      return this.attributes[name]!.buffer;
    }
    getAttribute(name: string): Attribute | undefined {
      return this.attributes[name];
    }
    getIndex(): Buffer {
      return this.indexBuffer;
    }
    destroy(destroyBuffers = false): void {
      if (this.destroyed) return;
      this.destroyed = true;
      if (destroyBuffers) for (const buffer of this.buffers) buffer.destroy();
      // Installed Geometry.destroy(false) still owns/destroys its index buffer.
      this.indexBuffer.destroy();
    }
  }
  class MeshGeometry extends Geometry {
    constructor(
      public options: { positions: Float32Array; uvs: Float32Array; indices?: Uint32Array },
    ) {
      super({
        attributes: {
          aPosition: {
            buffer: new Buffer({ data: options.positions }),
            format: 'float32x2',
            stride: 8,
            offset: 0,
          },
          aUV: {
            buffer: new Buffer({ data: options.uvs }),
            format: 'float32x2',
            stride: 8,
            offset: 0,
          },
        },
        indexBuffer: new Buffer({ data: options.indices ?? new Uint32Array([0, 1, 2, 0, 2, 3]) }),
      });
    }
    get positions(): Float32Array {
      return this.getBuffer('aPosition').data as Float32Array;
    }
    get uvs(): Float32Array {
      return this.getBuffer('aUV').data as Float32Array;
    }
  }
  class GlProgram {
    destroyed = false;
    constructor(public options: unknown) {}
    destroy(): void {
      this.destroyed = true;
    }
  }
  class Shader {
    destroyed = false;
    resources: unknown;
    glProgram: GlProgram;
    constructor(options: { glProgram: GlProgram; resources: unknown }) {
      this.glProgram = options.glProgram;
      this.resources = options.resources;
    }
    destroy(destroyPrograms = false): void {
      this.destroyed = true;
      if (destroyPrograms) this.glProgram.destroy();
    }
  }
  class Mesh extends Container {
    geometry: Geometry;
    texture: Texture;
    shader: Shader | undefined;
    constructor(options: { geometry: Geometry; texture: Texture; shader?: Shader }) {
      super();
      this.geometry = options.geometry;
      this.texture = options.texture;
      this.shader = options.shader;
    }
  }
  return {
    Matrix,
    Mesh,
    MeshGeometry,
    Geometry,
    Buffer,
    BufferUsage: { COPY_DST: 8, INDEX: 16, VERTEX: 32 },
    GlProgram,
    Shader,
    UniformGroup,
    Application,
    FillGradient,
    RendererType: { WEBGL: 1, WEBGPU: 2, CANVAS: 4 },
    Container,
    Graphics,
    BitmapText,
    TextStyle,
    Rectangle,
    Sprite,
    TilingSprite,
    Texture,
    BufferImageSource,
    Assets,
  };
}
