// tools/gen-assets.ts 地形紋理決定性生成測試（規格：M6-V5 技術設計文件 §8.1；補遺 AD6）。
// 驗純函式行為（不落盤）：generateReliefTexture／generateForestTexture 雙跑 rgba byte-identical、
// relief 海 texel 透明／陸 texel 不透明、forest 大量透明、色取自 MAP_PALETTE_HEX；並把 committed
// runtime PNG 之像素綁回「當前 terrain.json＋outline＋生成碼」（漏跑 gen:assets 即紅燈）。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';

import {
  TERRAIN_TEXTURE_SIZE,
  generateForestTexture,
  generateReliefTexture,
} from '../../tools/gen-assets';
import { zTerrainFile } from '../../src/data/schemas/terrain';
import { zJapanOutlineFile } from '../../src/data/schemas/outline';
import { MAP_PALETTE_HEX } from '../../src/ui/styles/tokens';
import terrainJson from '../../src/data/map/terrain.json';
import outlineJson from '../../src/data/map/japan-outline.json';

const terrain = zTerrainFile.parse(terrainJson);
const outline = zJapanOutlineFile.parse(outlineJson);

function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
}

/** 世界座標 → texel（同 gen-assets：round(world × 0.5)）。 */
function w2t(v: number): number {
  return Math.round((v * TERRAIN_TEXTURE_SIZE) / 4096);
}
function texelAt(rgba: Uint8Array, wx: number, wy: number): [number, number, number, number] {
  const tx = w2t(wx);
  const ty = w2t(wy);
  const i = (ty * TERRAIN_TEXTURE_SIZE + tx) * 4;
  return [rgba[i]!, rgba[i + 1]!, rgba[i + 2]!, rgba[i + 3]!];
}

describe('generateReliefTexture — 決定性與紙雕語意', () => {
  it('雙跑 rgba byte-identical（無 Math.random／Date.now）', () => {
    const a = generateReliefTexture(terrain, outline);
    const b = generateReliefTexture(terrain, outline);
    expect(a.width).toBe(TERRAIN_TEXTURE_SIZE);
    expect(a.height).toBe(TERRAIN_TEXTURE_SIZE);
    expect(a.rgba.length).toBe(b.rgba.length);
    expect(Buffer.from(a.rgba).equals(Buffer.from(b.rgba))).toBe(true);
  });

  it('海 texel 透明（alpha 0）、陸 texel 不透明', () => {
    const { rgba } = generateReliefTexture(terrain, outline);
    // 遠洋東南（世界 3500,3900）與西北外海（3800,600）為海。
    expect(texelAt(rgba, 3500, 3900)[3]).toBe(0);
    expect(texelAt(rgba, 3800, 600)[3]).toBe(0);
    // 尾張平原（2000,2900）、京都（1701,2889）為陸。
    expect(texelAt(rgba, 2000, 2900)[3]).toBe(255);
    expect(texelAt(rgba, 1701, 2889)[3]).toBe(255);
  });

  it('陸地底色取自 MAP_PALETTE_HEX.landBase；山脈核心較平原暗', () => {
    const { rgba } = generateReliefTexture(terrain, outline);
    const [lr, lg, lb] = hexToRgb(MAP_PALETTE_HEX.landBase);
    const [pr, pg, pb] = hexToRgb(MAP_PALETTE_HEX.plainLight);
    // 遠離山脈之平原 texel 為 landBase 與 plainLight（0.4 提亮）之混合——三通道皆落於
    // [landBase, plainLight] 之間（plainLight 每通道 ≥ landBase），藉此鎖定色源於 MAP_PALETTE_HEX、
    // 排除調色盤之外的魔術色（弱到只查 R≥landBase 會漏接任何淺米色）。
    const plain = texelAt(rgba, 1966, 2838);
    expect(plain[3]).toBe(255);
    expect(plain[0]).toBeGreaterThanOrEqual(lr);
    expect(plain[0]).toBeLessThanOrEqual(pr);
    expect(plain[1]).toBeGreaterThanOrEqual(lg);
    expect(plain[1]).toBeLessThanOrEqual(pg);
    expect(plain[2]).toBeGreaterThanOrEqual(lb);
    expect(plain[2]).toBeLessThanOrEqual(pb);
    // 山脈核心（飛驒 2130,2596）疊了 reliefInk，luminance 應低於平原。
    const mtn = texelAt(rgba, 2130, 2596);
    const lum = (p: number[]) => 0.3 * p[0]! + 0.59 * p[1]! + 0.11 * p[2]!;
    expect(lum(mtn)).toBeLessThan(lum(plain));
  });
});

describe('generateForestTexture — 決定性與透明度', () => {
  it('雙跑 rgba byte-identical', () => {
    const a = generateForestTexture(terrain, outline);
    const b = generateForestTexture(terrain, outline);
    expect(Buffer.from(a.rgba).equals(Buffer.from(b.rgba))).toBe(true);
  });

  it('大量透明（<5% 非透明）；森林 texel 取 forestMoss 色', () => {
    const { rgba } = generateForestTexture(terrain, outline);
    let nonZero = 0;
    for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 0) nonZero += 1;
    const frac = nonZero / (rgba.length / 4);
    expect(frac).toBeLessThan(0.05);
    expect(frac).toBeGreaterThan(0); // 確有森林被畫出（非全透明）
    // 紀伊森林核心（1742,3100）應為 forestMoss 色、alpha≈209。
    const [fr, fg, fb] = hexToRgb(MAP_PALETTE_HEX.forestMoss);
    const px = texelAt(rgba, 1742, 3100);
    expect(px[3]).toBeGreaterThan(0);
    expect(px[0]).toBe(fr);
    expect(px[1]).toBe(fg);
    expect(px[2]).toBe(fb);
  });

  it('海域 texel 透明（森林不越海）', () => {
    const { rgba } = generateForestTexture(terrain, outline);
    // 遠洋。
    expect(texelAt(rgba, 3500, 3900)[3]).toBe(0);
    // 沿海森林（fo.hakone／fo.suzuka）之多邊形突入海面之 texel 亦須透明——森林以 land mask
    // clip（比照 relief），否則苔綠會漫進駿河／相模灣、伊勢灣（回歸守門，M6-V5 修正）。
    // 下列點皆位於森林多邊形內、且明確落海（距海岸 >6 世界單位）。
    expect(texelAt(rgba, 2374, 2871)[3], 'fo.hakone 越海 texel').toBe(0);
    expect(texelAt(rgba, 1910, 2929)[3], 'fo.suzuka 越海 texel').toBe(0);
  });
});

/**
 * committed runtime PNG ↔ 生成碼＋terrain.json＋outline 綁定（M6-V5 修正）：
 * mountains/forests 幾何唯一的 runtime 消費者即這兩張烘焙紋理（terrainPack 丟棄 mountains/forests），
 * 故若編輯 terrain.json 而漏跑 `npm run gen:assets`，committed PNG 會與來源脫鉤而所有既有 gate
 * 仍全綠（A11／gen-assets.spec 僅「committed 檔 vs 其自錄 hash」自洽）。此處把 committed PNG 解碼回
 * 像素、與「當前來源重新生成」之 rgba 逐位元比對——與平台無關（不依賴 PNG 編碼位元決定性），
 * 只要幾何漂移即紅燈。
 */
describe('committed 地形 PNG 與生成碼同步（漏跑 gen:assets 守門）', () => {
  function decodePng(runtimePath: string): { width: number; height: number; rgba: Uint8Array } {
    const abs = fileURLToPath(new URL(`../../public/${runtimePath}`, import.meta.url));
    const png = PNG.sync.read(readFileSync(abs));
    return { width: png.width, height: png.height, rgba: new Uint8Array(png.data) };
  }

  it('terrain-relief@1x.png 像素 = generateReliefTexture(當前 terrain＋outline)', () => {
    const committed = decodePng('assets/textures/terrain-relief@1x.png');
    const fresh = generateReliefTexture(terrain, outline);
    expect(committed.width).toBe(fresh.width);
    expect(committed.height).toBe(fresh.height);
    expect(Buffer.from(committed.rgba).equals(Buffer.from(fresh.rgba))).toBe(true);
  });

  it('terrain-forest@1x.png 像素 = generateForestTexture(當前 terrain＋outline)', () => {
    const committed = decodePng('assets/textures/terrain-forest@1x.png');
    const fresh = generateForestTexture(terrain, outline);
    expect(committed.width).toBe(fresh.width);
    expect(committed.height).toBe(fresh.height);
    expect(Buffer.from(committed.rgba).equals(Buffer.from(fresh.rgba))).toBe(true);
  });
});
