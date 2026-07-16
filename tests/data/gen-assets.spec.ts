// tools/gen-assets.ts 決定性生成測試（規格：M6-V3 設計文件 §9.2；補遺 AD6）。
// 只驗證純函式行為（不落盤、不讀寫真實 public/assets／tools/assets），落盤產物與 manifest hash
// 相符由 tools/validate-assets.ts（Slice C）與本檔案末尾「對目前 repo 實際成品」健康檢查覆蓋。
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from '../../tools/asset-paths';
import {
  WASHI_MASTER_SIZE,
  WASHI_RUNTIME_SIZE,
  boxDownsample2x,
  encodeDeterministicPng,
  generateArmyBannerFrame,
  generateCastleMountainFrame,
  generateCastlePlainFrame,
  generateCompassSvg,
  generateWashiMasterRgba,
  sha256Hex,
  washiNoiseValue,
} from '../../tools/gen-assets';
import { VISUAL_ASSET_MANIFEST } from '../../src/ui/assets/manifest';

describe('washiNoiseValue — wrap 週期性（補遺 AD6：測函式而非影像模糊比對）', () => {
  it('x 方向恰好平移一個 width 得到精確相同值', () => {
    const width = 64;
    const height = 64;
    for (const [x, y] of [
      [0, 0],
      [5, 10],
      [63, 30],
      [17, 63],
    ] as const) {
      expect(washiNoiseValue(x + width, y, width, height)).toBe(
        washiNoiseValue(x, y, width, height),
      );
    }
  });

  it('y 方向恰好平移一個 height 得到精確相同值', () => {
    const width = 64;
    const height = 64;
    for (const [x, y] of [
      [0, 0],
      [5, 10],
      [63, 30],
      [17, 63],
    ] as const) {
      expect(washiNoiseValue(x, y + height, width, height)).toBe(
        washiNoiseValue(x, y, width, height),
      );
    }
  });

  it('負座標依 wrap 規則等價於正座標（純數學一致性，非邊界特例）', () => {
    const width = 32;
    const height = 32;
    expect(washiNoiseValue(-1, -1, width, height)).toBe(
      washiNoiseValue(width - 1, height - 1, width, height),
    );
  });

  it('回傳值恆落在 [0,1) 值域', () => {
    for (let i = 0; i < 50; i += 1) {
      const v = washiNoiseValue(i * 7, i * 13, 128, 128);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('generateWashiMasterRgba／boxDownsample2x — 決定性與尺寸', () => {
  it('同參數連跑兩次，母檔 RGBA buffer 完全相等', () => {
    const a = generateWashiMasterRgba(64);
    const b = generateWashiMasterRgba(64);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it('輸出尺寸符合宣告（size² × 4 bytes）', () => {
    const size = 64;
    const rgba = generateWashiMasterRgba(size);
    expect(rgba.length).toBe(size * size * 4);
  });

  it('降採樣後尺寸為母檔一半，且連跑兩次結果相等', () => {
    const master = generateWashiMasterRgba(64);
    const a = boxDownsample2x(master, 64);
    const b = boxDownsample2x(master, 64);
    expect(a.length).toBe(32 * 32 * 4);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it('alpha 全通道皆為 255（不透明材質）', () => {
    const rgba = generateWashiMasterRgba(32);
    for (let i = 3; i < rgba.length; i += 4) {
      expect(rgba[i]).toBe(255);
    }
  });
});

describe('atlas 來源 frame 產生器 — 決定性與宣告尺寸相符', () => {
  it('castle-plain：64×64，連跑兩次 buffer 相等', () => {
    const a = generateCastlePlainFrame();
    const b = generateCastlePlainFrame();
    expect(a.width).toBe(64);
    expect(a.height).toBe(64);
    expect(Buffer.from(a.rgba).equals(Buffer.from(b.rgba))).toBe(true);
  });

  it('castle-mountain：64×64，連跑兩次 buffer 相等', () => {
    const a = generateCastleMountainFrame();
    const b = generateCastleMountainFrame();
    expect(a.width).toBe(64);
    expect(a.height).toBe(64);
    expect(Buffer.from(a.rgba).equals(Buffer.from(b.rgba))).toBe(true);
  });

  it('army-banner：48×64，連跑兩次 buffer 相等', () => {
    const a = generateArmyBannerFrame();
    const b = generateArmyBannerFrame();
    expect(a.width).toBe(48);
    expect(a.height).toBe(64);
    expect(Buffer.from(a.rgba).equals(Buffer.from(b.rgba))).toBe(true);
  });

  it('三個 glyph 皆含非透明像素（不是空白畫布）', () => {
    for (const frame of [
      generateCastlePlainFrame(),
      generateCastleMountainFrame(),
      generateArmyBannerFrame(),
    ]) {
      let hasOpaque = false;
      for (let i = 3; i < frame.rgba.length; i += 4) {
        if (frame.rgba[i]! > 0) {
          hasOpaque = true;
          break;
        }
      }
      expect(hasOpaque).toBe(true);
    }
  });
});

describe('generateCompassSvg — 決定性 SVG 字串組裝（補遺 AD1）', () => {
  it('連跑兩次得到完全相同字串', () => {
    expect(generateCompassSvg()).toBe(generateCompassSvg());
  });

  it('含 4 方位刻度（4 條 stroke-width="3" 主刻度線）與中心圓（補遺 AD1 最低要求）', () => {
    const svg = generateCompassSvg();
    const majorTickCount = (svg.match(/stroke-width="3"/g) ?? []).length;
    expect(majorTickCount).toBe(4);
    expect(svg).toContain('<circle');
    expect(svg.startsWith('<svg')).toBe(true);
  });

  it('不含外部圖片參照或 data URI（純向量幾何組裝；xmlns 命名空間宣告不算外部依賴）', () => {
    const svg = generateCompassSvg();
    expect(svg).not.toContain('<image');
    expect(svg).not.toContain('xlink:href');
    expect(svg).not.toMatch(/data:/);
  });
});

describe('encodeDeterministicPng／sha256Hex — 決定性編碼（同進程雙跑一致，設計 §5.3）', () => {
  it('同一張圖連跑兩次編碼，PNG bytes 完全相等', () => {
    const frame = generateArmyBannerFrame();
    const a = encodeDeterministicPng(frame);
    const b = encodeDeterministicPng(frame);
    expect(a.equals(b)).toBe(true);
  });

  it('sha256Hex 回傳 64 字小寫 hex', () => {
    const h = sha256Hex(Buffer.from('test'));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('對目前 repo 實際落盤成品的健康檢查（gen:assets 已跑過時）', () => {
  it('WASHI_MASTER_SIZE／WASHI_RUNTIME_SIZE 為 512／256（manifest pixelSize 依賴此關係：2 倍降採）', () => {
    expect(WASHI_MASTER_SIZE).toBe(512);
    expect(WASHI_RUNTIME_SIZE).toBe(256);
    expect(WASHI_MASTER_SIZE).toBe(WASHI_RUNTIME_SIZE * 2);
  });

  it('manifest 五筆 contentHash 與目前已落盤檔案之 sha256 相符（AD7：hash 已由 Slice A 直接填入）', () => {
    for (const entry of VISUAL_ASSET_MANIFEST) {
      const relPath = entry.kind === 'atlas' ? entry.sourcePath! : `public/${entry.runtimePath}`;
      const buf = readFileSync(path.join(REPO_ROOT, relPath));
      expect(sha256Hex(buf)).toBe(entry.contentHash);
    }
  });
});
