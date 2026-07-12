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

/** 建立一組最小可用的 pixi.js 替身類別（Application/Container/Graphics），供 `vi.mock('pixi.js', ...)` 回傳。 */
export function createPixiMockClasses(apps: PixiMockAppRecord[] = []): {
  Application: unknown;
  Container: unknown;
  Graphics: unknown;
} {
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
  return { Application, Container, Graphics };
}
