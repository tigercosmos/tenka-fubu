// MapAssetLoader 生命週期測試（規格：plan/12-ui-components.md §3.7；測試計畫見 M6-V3 設計文件
// §9.5；補遺 AD9）。
//
// mock 策略比照 src/ui/map/MapCanvasHost.spec.tsx：整包 mock `pixi.js`（`Assets.add/load/unload/
// get`、`Texture`、`Rectangle`），以 `vi.hoisted` 記錄呼叫次數／已載入內容；另 mock 同目錄的
// `./manifest`、`./generated`，提供與生產資料無關的最小固定測試資料，聚焦驗證 loader 本身的
// refcount／dispose／StrictMode 穩態機制（不依賴 Slice A/B 真實素材是否就緒）。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => {
  const manifestEntries: Record<
    string,
    { kind: 'texture' | 'svg' | 'atlas'; runtimePath: string }
  > = {
    'tex.a': { kind: 'texture', runtimePath: 'assets/textures/a.png' },
    'atlas.a': { kind: 'atlas', runtimePath: 'atlas.a' },
    'atlas.b': { kind: 'atlas', runtimePath: 'atlas.b' },
  };
  const frameMap = {
    version: 1 as const,
    generatedBy: 'test-fixture',
    pages: [
      { file: 'assets/map/atlas-map-0.png', width: 128, height: 128, contentHash: 'x'.repeat(64) },
    ],
    frames: {
      'atlas.a': { page: 0, x: 0, y: 0, w: 10, h: 10, sourceHash: 'a'.repeat(64) },
      'atlas.b': { page: 0, x: 10, y: 0, w: 10, h: 10, sourceHash: 'b'.repeat(64) },
    },
  };
  const loadCalls: string[] = [];
  const unloadCalls: string[] = [];
  const loadedTextures = new Map<string, unknown>();
  return { manifestEntries, frameMap, loadCalls, unloadCalls, loadedTextures };
});

vi.mock('pixi.js', () => {
  class Rectangle {
    constructor(
      public x: number,
      public y: number,
      public width: number,
      public height: number,
    ) {}
  }
  class Texture {
    destroyed = false;
    destroySourceCalls: (boolean | undefined)[] = [];
    source: unknown;
    frame: Rectangle | undefined;
    constructor(opts?: { source?: unknown; frame?: Rectangle }) {
      this.source = opts?.source;
      this.frame = opts?.frame;
    }
    destroy(destroySource?: boolean): void {
      this.destroyed = true;
      this.destroySourceCalls.push(destroySource);
    }
  }
  const Assets = {
    add: vi.fn((): void => {}),
    load: vi.fn((alias: string) => {
      hoisted.loadCalls.push(alias);
      const tex = new Texture({ source: { name: alias } });
      hoisted.loadedTextures.set(alias, tex);
      return Promise.resolve(tex);
    }),
    unload: vi.fn((alias: string) => {
      hoisted.unloadCalls.push(alias);
      hoisted.loadedTextures.delete(alias);
      return Promise.resolve();
    }),
    get: vi.fn((alias: string) => hoisted.loadedTextures.get(alias)),
  };
  return { Assets, Texture, Rectangle };
});

vi.mock('./manifest', () => ({
  getManifestEntry: (id: string) => hoisted.manifestEntries[id],
}));

vi.mock('./generated', () => ({
  ATLAS_FRAME_MAP: hoisted.frameMap,
}));

// mock 生效後才 import 受測模組（vitest 會 hoist vi.mock 到 import 之上；顯式順序更清楚，比照
// MapCanvasHost.spec.tsx 慣例）。`Assets` 僅取其（已被 mock 取代的）執行期物件供 `vi.mocked()`
// 操作 mockImplementationOnce；不 import 真實 `Texture` 型別以免與 mock 內部類別的型別衝突。
import { Assets } from 'pixi.js';
import { MapAssetLoader, getAssetLoaderStats, resolveRuntimeUrl } from './loader';

interface MockTexture {
  destroyed: boolean;
  destroySourceCalls: (boolean | undefined)[];
}

beforeEach(() => {
  hoisted.loadCalls.length = 0;
  hoisted.unloadCalls.length = 0;
  hoisted.loadedTextures.clear();
  // `Assets.add`／`Assets.get` 是 `vi.mock('pixi.js')` 換掉的 `vi.fn()`，不涉及 `this` 綁定；
  // eslint 對「物件屬性存取後傳給 vi.mocked()」的通用啟發式在此為假警報。
  // eslint-disable-next-line @typescript-eslint/unbound-method
  vi.mocked(Assets.add).mockClear();
  // eslint-disable-next-line @typescript-eslint/unbound-method
  vi.mocked(Assets.get).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  // 安全網：確保每個測試案例結束時全域 refcount／loadedKeys 皆已歸零（不遺留跨測試污染）。
  const stats = getAssetLoaderStats();
  expect(stats.globalRefcounts).toEqual({});
  expect(stats.loadedKeys).toEqual([]);
});

describe('MapAssetLoader — acquire texture（設計 §9.5 第1點）', () => {
  it('Assets.load 一次、回 Texture、isHeld true、refcount=1', async () => {
    const loader = new MapAssetLoader();
    const tex = await loader.acquire('tex.a');
    expect(tex).toBeDefined();
    expect(hoisted.loadCalls).toEqual(['tex.a']);
    expect(loader.isHeld('tex.a')).toBe(true);
    expect(getAssetLoaderStats().globalRefcounts['tex.a']).toBe(1);
    loader.dispose();
  });
});

describe('MapAssetLoader — 共享（設計 §9.5 第2點）', () => {
  it('兩個 loader 各 acquire 同 texture → Assets.load 僅一次；unload 0', async () => {
    const l1 = new MapAssetLoader();
    const l2 = new MapAssetLoader();
    await l1.acquire('tex.a');
    await l2.acquire('tex.a');
    expect(hoisted.loadCalls).toEqual(['tex.a']);
    expect(hoisted.unloadCalls).toEqual([]);
    l1.dispose();
    l2.dispose();
  });
});

describe('MapAssetLoader — release 歸零才 unload（設計 §9.5 第3點）', () => {
  it('兩 instance 各 acquire → dispose1 不 unload（共享存活）→ dispose2 才 unload', async () => {
    const l1 = new MapAssetLoader();
    const l2 = new MapAssetLoader();
    await l1.acquire('tex.a');
    await l2.acquire('tex.a');

    l1.dispose();
    expect(hoisted.unloadCalls).toEqual([]);

    l2.dispose();
    expect(hoisted.unloadCalls).toEqual(['tex.a']);
  });
});

describe('MapAssetLoader — atlas frame（設計 §9.5 第4點）', () => {
  it('兩個同頁 frame → 頁 Assets.load 一次、建兩個 sub-Texture；分別 release 才卸頁、皆 destroy(false)', async () => {
    const loader = new MapAssetLoader();
    const texA = await loader.acquire('atlas.a');
    const texB = await loader.acquire('atlas.b');

    expect(hoisted.loadCalls).toEqual(['__atlas_page_0']);
    expect(texA).not.toBe(texB);

    loader.release('atlas.a');
    expect(hoisted.unloadCalls).toEqual([]);
    expect((texA as unknown as MockTexture).destroyed).toBe(false);

    loader.release('atlas.b');
    expect(hoisted.unloadCalls).toEqual(['__atlas_page_0']);
    expect((texA as unknown as MockTexture).destroyed).toBe(true);
    expect((texB as unknown as MockTexture).destroyed).toBe(true);
    expect((texA as unknown as MockTexture).destroySourceCalls).toEqual([false]);
    expect((texB as unknown as MockTexture).destroySourceCalls).toEqual([false]);
  });
});

describe('MapAssetLoader — StrictMode 穩態（設計 §9.5 第5點）', () => {
  it('mount1→mount2→dispose1→dispose2 後全域狀態歸零', async () => {
    const m1 = new MapAssetLoader();
    const m2 = new MapAssetLoader();
    await m1.acquireMany(['tex.a', 'atlas.a']);
    await m2.acquireMany(['tex.a', 'atlas.a']);

    m1.dispose();
    m2.dispose();

    const stats = getAssetLoaderStats();
    expect(stats.globalRefcounts).toEqual({});
    expect(stats.loadedKeys).toEqual([]);
  });
});

describe('MapAssetLoader — dispose 冪等（設計 §9.5 第6點）', () => {
  it('連呼兩次無 double-unload', async () => {
    const loader = new MapAssetLoader();
    await loader.acquire('tex.a');
    loader.dispose();
    const unloadCountAfterFirst = hoisted.unloadCalls.length;
    loader.dispose();
    expect(hoisted.unloadCalls.length).toBe(unloadCountAfterFirst);
  });
});

describe('MapAssetLoader — acquire 進行中 dispose（StrictMode race；設計 §9.5 第7點）', () => {
  it('await load 後檢查 disposed，正確清理、不遺留 refcount', async () => {
    let resolveLoad: (() => void) | undefined;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- 見上方 beforeEach 說明。
    vi.mocked(Assets.load).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveLoad = () => {
            hoisted.loadCalls.push('tex.a');
            const tex = { destroyed: false };
            hoisted.loadedTextures.set('tex.a', tex);
            resolve(tex);
          };
        }),
    );

    const loader = new MapAssetLoader();
    const pending = loader.acquire('tex.a');
    loader.dispose(); // dispose 先於 load resolve（模擬 StrictMode 卸載先於非同步完成）
    resolveLoad?.();

    await expect(pending).rejects.toThrow();
    expect(loader.isHeld('tex.a')).toBe(false);
  });
});

describe('resolveRuntimeUrl（補遺 AD9）', () => {
  it('以 BASE_URL 前綴組出 URL，無雙斜線', () => {
    vi.stubEnv('BASE_URL', '/sub/');
    expect(resolveRuntimeUrl('assets/textures/a.png')).toBe('/sub/assets/textures/a.png');
  });
});
