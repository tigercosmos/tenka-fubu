// atlas 打包器單元測試（規格：plan/12-ui-components.md §3.7；測試計畫見 M6-V3 設計文件 §9.3）。
//
// fixture 全部以記憶體資料建構（`makeFrame` 直接生成 RGBA `Uint8Array`），不依賴 Slice A 落地的
// 真實 manifest／source frame 檔案，故可獨立於其他 slice 平行開發與執行。
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { buildAtlas, type AtlasSourceFrame } from '../../tools/build-atlas';

/** 建立一筆假 frame：以固定填值產生決定性 RGBA 內容並算出其 sha256（模擬「來源檔雜湊」）。 */
function makeFrame(id: string, width: number, height: number, fill: number): AtlasSourceFrame {
  const rgba = new Uint8Array(width * height * 4).fill(fill);
  const sourceHash = createHash('sha256').update(Buffer.from(rgba)).digest('hex');
  return { id, width, height, rgba, sourceHash };
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// 對照設計文件 §3.5 範例：三筆 M6-V3 真實 marker 尺寸（army-banner 48x64、castle-mountain／
// castle-plain 各 64x64），id 二進位升冪本就是 army-banner < castle-mountain < castle-plain。
const ARMY_BANNER = makeFrame('map.marker.army-banner.normal', 48, 64, 10);
const CASTLE_MOUNTAIN = makeFrame('map.marker.castle-mountain.normal', 64, 64, 20);
const CASTLE_PLAIN = makeFrame('map.marker.castle-plain.normal', 64, 64, 30);
const MARKER_FRAMES: readonly AtlasSourceFrame[] = [ARMY_BANNER, CASTLE_MOUNTAIN, CASTLE_PLAIN];

describe('buildAtlas — 決定性（設計 §9.3 第1點）', () => {
  it('同一 frames 輸入連跑兩次：frame map 深相等、每頁 PNG buffer 相等', () => {
    const r1 = buildAtlas(MARKER_FRAMES);
    const r2 = buildAtlas(MARKER_FRAMES);

    expect(r1.frameMap).toEqual(r2.frameMap);
    expect(r1.pagePngs.length).toBe(r2.pagePngs.length);
    for (let i = 0; i < r1.pagePngs.length; i += 1) {
      expect(r1.pagePngs[i]!.png.equals(r2.pagePngs[i]!.png)).toBe(true);
    }
  });
});

describe('buildAtlas — 排序（設計 §9.3 第2點，裁決 D5）', () => {
  it('亂序輸入排序後，frame map key 順序為 id 二進位升冪（非 localeCompare）', () => {
    const shuffled = [CASTLE_PLAIN, ARMY_BANNER, CASTLE_MOUNTAIN];
    const result = buildAtlas(shuffled);

    const keys = Object.keys(result.frameMap.frames);
    const expected = MARKER_FRAMES.map((f) => f.id)
      .slice()
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(keys).toEqual(expected);
  });
});

describe('buildAtlas — shelf packing 正確性（設計 §9.3 第3、6點）', () => {
  it('任兩 frame rect 不相交，且皆在其所屬頁面界內', () => {
    const result = buildAtlas(MARKER_FRAMES);
    const entries = Object.entries(result.frameMap.frames).map(([id, f]) => ({ id, ...f }));

    for (const entry of entries) {
      const page = result.frameMap.pages[entry.page]!;
      expect(entry.x + entry.w).toBeLessThanOrEqual(page.width);
      expect(entry.y + entry.h).toBeLessThanOrEqual(page.height);
    }
    for (let i = 0; i < entries.length; i += 1) {
      for (let j = i + 1; j < entries.length; j += 1) {
        if (entries[i]!.page !== entries[j]!.page) continue;
        expect(rectsOverlap(entries[i]!, entries[j]!)).toBe(false);
      }
    }
  });

  it('小 frame 集合（三 marker）裁到最小 2 次方單頁（128²）', () => {
    const result = buildAtlas(MARKER_FRAMES);
    expect(result.frameMap.pages.length).toBe(1);
    expect(result.frameMap.pages[0]!.width).toBe(128);
    expect(result.frameMap.pages[0]!.height).toBe(128);

    // 與設計文件 §3.5 範例座標逐一對照（army-banner 左上、castle-mountain 右側、castle-plain 下方）。
    expect(result.frameMap.frames['map.marker.army-banner.normal']).toMatchObject({
      page: 0,
      x: 0,
      y: 0,
      w: 48,
      h: 64,
    });
    expect(result.frameMap.frames['map.marker.castle-mountain.normal']).toMatchObject({
      page: 0,
      x: 48,
      y: 0,
      w: 64,
      h: 64,
    });
    expect(result.frameMap.frames['map.marker.castle-plain.normal']).toMatchObject({
      page: 0,
      x: 0,
      y: 64,
      w: 64,
      h: 64,
    });
  });
});

describe('buildAtlas — 分頁（設計 §9.3 第4點）', () => {
  it('3 張 1600² frame（單頁 2048 容不下三張）→ 產生 ≥2 頁，每頁 ≤2048²', () => {
    const frames: AtlasSourceFrame[] = [
      makeFrame('page.frame.aaa', 1600, 1600, 1),
      makeFrame('page.frame.bbb', 1600, 1600, 2),
      makeFrame('page.frame.ccc', 1600, 1600, 3),
    ];
    const result = buildAtlas(frames);

    expect(result.frameMap.pages.length).toBeGreaterThanOrEqual(2);
    for (const page of result.frameMap.pages) {
      expect(page.width).toBeLessThanOrEqual(2048);
      expect(page.height).toBeLessThanOrEqual(2048);
    }
    // 全部輸入 frame 都必須被放置（無遺漏）。
    for (const frame of frames) {
      expect(result.frameMap.frames[frame.id]).toBeDefined();
    }
  });
});

describe('buildAtlas — 單 frame 超限（設計 §9.3 第5點）', () => {
  it('注入 3000² frame 會拋出錯誤', () => {
    const frames = [makeFrame('huge.frame.one', 3000, 3000, 1)];
    expect(() => buildAtlas(frames)).toThrow();
  });
});

describe('buildAtlas — frame map 形狀（設計 §9.3 第7點）', () => {
  it('version 為 1、頁 contentHash 為 64 字 hex、frame sourceHash 透傳輸入', () => {
    const result = buildAtlas(MARKER_FRAMES);

    expect(result.frameMap.version).toBe(1);
    expect(result.frameMap.generatedBy).toBe('tools/build-atlas.ts');
    for (const page of result.frameMap.pages) {
      expect(page.contentHash).toMatch(/^[0-9a-f]{64}$/);
    }
    for (const frame of MARKER_FRAMES) {
      expect(result.frameMap.frames[frame.id]!.sourceHash).toBe(frame.sourceHash);
    }
  });

  it('空輸入回傳空頁面與空 frame map（不崩潰）', () => {
    const result = buildAtlas([]);
    expect(result.frameMap).toEqual({
      version: 1,
      generatedBy: 'tools/build-atlas.ts',
      pages: [],
      frames: {},
    });
    expect(result.pagePngs).toEqual([]);
  });
});
