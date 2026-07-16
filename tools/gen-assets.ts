// 視覺素材決定性生成器（規格：plan/12-ui-components.md §3.7；M6-V3 設計文件 §7、§12；
// 補遺 AD1／AD6／AD7）。
//
// 產出（全部 project-original、純程序生成、無外部下載、無描摹）：
// - washi 母檔 512²（tools/assets/visual/source/texture-washi-base-master@2x.png）
//   → 盒式降採到 256² runtime texture（public/assets/textures/washi-base@1x.png）。
// - 3 個 atlas 來源 frame PNG（平城 64²、山城 64²、軍旗 48×64，純幾何 glyph，透明底 RGBA）
//   寫入 tools/assets/visual/source/frames/。
// - compass.svg（程序生成原創方位盤，補遺 AD1）寫入 public/assets/map/compass.svg。
//
// 決定性守則（比照架構鐵律）：全程不用 Math.random／Date.now；雜訊一律用本檔內固定種子 LCG；
// PNG 編碼固定用 tools/asset-paths.ts 的 DETERMINISTIC_PNG_OPTS。CLI 尾端印每筆真實素材的
// sha256（id → hash），供作者依補遺 AD7 直接填回 src/ui/assets/manifest.ts 的 contentHash。

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

import {
  ASSETS_PUBLIC_DIR,
  ASSETS_SOURCE_DIR,
  ASSETS_SOURCE_FRAMES_DIR,
  DETERMINISTIC_PNG_OPTS,
  REPO_ROOT,
} from './asset-paths';
import { MAP_PALETTE_HEX, TOKENS } from '../src/ui/styles/tokens';
import { zTerrainFile, type TerrainFile } from '../src/data/schemas/terrain';
import { zJapanOutlineFile, type JapanOutlineFile } from '../src/data/schemas/outline';

// ═══════════════════════════════════════════════════════════════════
// 共用像素緩衝工具
// ═══════════════════════════════════════════════════════════════════

/** RGBA 像素緩衝：長度固定為 width*height*4，逐 byte 對應 R/G/B/A。 */
export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

function clampByte(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

/** `#rrggbb` → `[r,g,b]`（0–255）。本管線色值一律取自 `src/ui/styles/tokens.ts`（單一真相來源）。 */
function hexToRgb(hex: string): readonly [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

function newTransparentBuffer(width: number, height: number): Uint8Array {
  return new Uint8Array(width * height * 4); // 全 0 → 完全透明黑
}

function setPixel(
  buf: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  r: number,
  g: number,
  b: number,
  a: number,
): void {
  if (x < 0 || y < 0 || x >= width || y >= height) return;
  const idx = (y * width + x) * 4;
  buf[idx] = r;
  buf[idx + 1] = g;
  buf[idx + 2] = b;
  buf[idx + 3] = a;
}

/** 純幾何矩形填色（含邊界，座標會裁切到畫布內）。 */
function fillRect(
  buf: Uint8Array,
  width: number,
  height: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: readonly [number, number, number],
  alpha = 255,
): void {
  const xs = Math.max(0, Math.min(x0, x1));
  const xe = Math.min(width - 1, Math.max(x0, x1));
  const ys = Math.max(0, Math.min(y0, y1));
  const ye = Math.min(height - 1, Math.max(y0, y1));
  for (let y = ys; y <= ye; y += 1) {
    for (let x = xs; x <= xe; x += 1) {
      setPixel(buf, width, height, x, y, color[0], color[1], color[2], alpha);
    }
  }
}

/**
 * 等腰三角形（頂點朝上，底邊水平）填色：純整數/線性內插逐列決定半寬，無需三角學函式，
 * 位元組級決定性（同輸入同輸出）。`apexX`／`topY` 為頂點；`baseY` 為底邊 y；`halfBaseWidth`
 * 為底邊半寬。
 */
function fillIsoscelesTriangleUp(
  buf: Uint8Array,
  width: number,
  height: number,
  apexX: number,
  topY: number,
  baseY: number,
  halfBaseWidth: number,
  color: readonly [number, number, number],
): void {
  const span = baseY - topY;
  for (let y = topY; y <= baseY; y += 1) {
    const t = span === 0 ? 1 : (y - topY) / span;
    const halfW = Math.round(t * halfBaseWidth);
    fillRect(buf, width, height, apexX - halfW, y, apexX + halfW, y, color);
  }
}

// ═══════════════════════════════════════════════════════════════════
// washi 材質：固定種子 LCG 低振幅雜訊，wrap 週期性（補遺 AD6）
// ═══════════════════════════════════════════════════════════════════

export const WASHI_MASTER_SIZE = 512;
export const WASHI_RUNTIME_SIZE = 256;

/** 固定種子常數（非 Math.random；純資料，任何人重跑皆得相同雜訊場）。 */
const WASHI_NOISE_SEED = 0x5ee1c0de;
/** 5% 等效低振幅雜訊（art-bible §4.1）：255 的 5% ≈ 12.75，取整數 13。 */
const WASHI_NOISE_AMPLITUDE = 13;

/** 固定線性同餘（LCG）雜湊一次疊代（Numerical Recipes 常數），純函式、非 `Math.random`。 */
function lcgMix(seed: number): number {
  let state = seed >>> 0;
  state = (Math.imul(1664525, state) + 1013904223) >>> 0;
  state = (Math.imul(1664525, state) + 1013904223) >>> 0;
  return state >>> 0;
}

/**
 * washi 雜訊取樣：輸出僅由 `(x mod width, y mod height)` 決定，因此天然可平鋪——
 * `washiNoiseValue(x+width, y, width, height) === washiNoiseValue(x, y, width, height)`、
 * y 方向同理精確相等（補遺 AD6，取代模糊影像容差比對）。回傳值域 `[0, 1)`。
 */
export function washiNoiseValue(x: number, y: number, width: number, height: number): number {
  const xi = ((x % width) + width) % width;
  const yi = ((y % height) + height) % height;
  const index = yi * width + xi;
  const mixed = lcgMix((index ^ WASHI_NOISE_SEED) >>> 0);
  return mixed / 0x100000000; // /2^32 → [0,1)
}

/** 產生 washi 母檔 RGBA（預設 512²）：washi300 底色＋低振幅雜訊，wrap 取樣故邊緣可平鋪。 */
export function generateWashiMasterRgba(size: number = WASHI_MASTER_SIZE): Uint8Array {
  const [baseR, baseG, baseB] = hexToRgb(TOKENS.color.washi300);
  const rgba = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const n = washiNoiseValue(x, y, size, size);
      const offset = (n - 0.5) * 2 * WASHI_NOISE_AMPLITUDE;
      const idx = (y * size + x) * 4;
      rgba[idx] = clampByte(baseR + offset);
      rgba[idx + 1] = clampByte(baseG + offset);
      rgba[idx + 2] = clampByte(baseB + offset);
      rgba[idx + 3] = 255;
    }
  }
  return rgba;
}

/** 2×2 盒式降採樣（RGBA，含 alpha 一併平均）；`srcSize` 須為偶數。 */
export function boxDownsample2x(src: Uint8Array, srcSize: number): Uint8Array {
  const dstSize = srcSize / 2;
  const dst = new Uint8Array(dstSize * dstSize * 4);
  for (let y = 0; y < dstSize; y += 1) {
    for (let x = 0; x < dstSize; x += 1) {
      const sx = x * 2;
      const sy = y * 2;
      for (let c = 0; c < 4; c += 1) {
        const a = src[(sy * srcSize + sx) * 4 + c]!;
        const b = src[(sy * srcSize + sx + 1) * 4 + c]!;
        const cc = src[((sy + 1) * srcSize + sx) * 4 + c]!;
        const d = src[((sy + 1) * srcSize + sx + 1) * 4 + c]!;
        dst[(y * dstSize + x) * 4 + c] = clampByte((a + b + cc + d) / 4);
      }
    }
  }
  return dst;
}

// ═══════════════════════════════════════════════════════════════════
// atlas 來源 frame：純幾何城／軍旗占位 glyph（透明底）
// ═══════════════════════════════════════════════════════════════════

const INK900 = hexToRgb(TOKENS.color.ink900);
const ACCENT_GOLD = hexToRgb(TOKENS.color.accentGold);
const ACCENT_VERMILION = hexToRgb(TOKENS.color.accentVermilion);

/** 平城占位標記（64²）：水平展開、矮郭——寬扁矩形郭體＋墨色描邊＋護城河短弧線意象。 */
export function generateCastlePlainFrame(): RgbaImage {
  const width = 64;
  const height = 64;
  const rgba = newTransparentBuffer(width, height);
  // 墨色外郭（寬、矮）。
  fillRect(rgba, width, height, 8, 30, 55, 53, INK900);
  // 金色郭內填色（描邊內縮 3px）。
  fillRect(rgba, width, height, 11, 33, 52, 50, ACCENT_GOLD);
  // 城門缺口（底邊中央，墨色）。
  fillRect(rgba, width, height, 28, 46, 35, 53, INK900);
  // 女牆節奏（頂緣三段短墨塊）。
  fillRect(rgba, width, height, 12, 27, 17, 30, INK900);
  fillRect(rgba, width, height, 29, 27, 34, 30, INK900);
  fillRect(rgba, width, height, 46, 27, 51, 30, INK900);
  return { width, height, rgba };
}

/** 山城占位標記（64²）：垂直堆疊、岩基三角與窄郭——三角岩基＋窄郭疊頂。 */
export function generateCastleMountainFrame(): RgbaImage {
  const width = 64;
  const height = 64;
  const rgba = newTransparentBuffer(width, height);
  // 岩基三角（墨色外框、金色內填）：頂點在上，象徵山勢。
  fillIsoscelesTriangleUp(rgba, width, height, 32, 12, 52, 22, INK900);
  fillIsoscelesTriangleUp(rgba, width, height, 32, 16, 49, 17, ACCENT_GOLD);
  // 窄郭（山頂窄矩形城郭）。
  fillRect(rgba, width, height, 24, 6, 40, 16, INK900);
  fillRect(rgba, width, height, 27, 8, 37, 14, ACCENT_GOLD);
  // 基座橫向岩壁（底部短寬矩形，強化「垂直堆疊」輪廓）。
  fillRect(rgba, width, height, 14, 52, 50, 58, INK900);
  return { width, height, rgba };
}

/** 軍隊旗型占位（48×64）：旗桿＋燕尾旗面——朱紅旗面、墨色旗桿，呼應 art-bible §6.5 燕尾旗母題。 */
export function generateArmyBannerFrame(): RgbaImage {
  const width = 48;
  const height = 64;
  const rgba = newTransparentBuffer(width, height);
  // 旗桿：貫穿全高的墨色細柱。
  fillRect(rgba, width, height, 20, 4, 24, 60, INK900);

  // 旗面：矩形主體＋自由邊（右側）依三角形「V」缺口收窄——缺口在中點最深、上下兩端最淺，
  // 使自由邊兩端形成尖角，呈現燕尾旗尾形（逐列直接算右邊界，無需疊色/挖洞，位元組級決定性）。
  const flagLeft = 24;
  const flagRight = 44;
  const flagTop = 8;
  const flagBottom = 28;
  const flagMidY = (flagTop + flagBottom) / 2;
  const halfSpan = (flagBottom - flagTop) / 2;
  const notchDepth = 10; // 缺口深度（px）
  for (let y = flagTop; y <= flagBottom; y += 1) {
    const distFromMid = Math.abs(y - flagMidY);
    const notch = Math.round(notchDepth * (1 - distFromMid / halfSpan));
    const rowRight = flagRight - notch;
    fillRect(rgba, width, height, flagLeft, y, rowRight, y, ACCENT_VERMILION);
  }

  // 旗座：旗桿底部短墨座。
  fillRect(rgba, width, height, 16, 58, 28, 62, INK900);
  return { width, height, rgba };
}

// ═══════════════════════════════════════════════════════════════════
// compass.svg：程序生成原創方位盤（補遺 AD1）
// ═══════════════════════════════════════════════════════════════════

/**
 * 決定性組裝原創方位盤 SVG 字串：外圈墨色描邊、中心金色圓點、4 主方位長刻度、4 次方位短刻度、
 * 頂端（北）金色三角指標。純幾何、無外部圖檔、無描摹既有羅盤圖樣（補遺 AD1）。
 */
export function generateCompassSvg(): string {
  const ink = TOKENS.color.ink900;
  const gold = TOKENS.color.accentGold;
  const size = 128;
  const cx = size / 2;
  const cy = size / 2;
  const outerR = 60;
  const tickInnerR = 44;
  const minorTickInnerR = 50;

  // 4 主方位（北/東/南/西）與 4 次方位（東北/東南/西南/西北）角度（度，0＝正北，順時針）。
  const majorAngles = [0, 90, 180, 270];
  const minorAngles = [45, 135, 225, 315];

  function tickLine(
    angleDeg: number,
    innerR: number,
    outerRr: number,
    strokeWidth: number,
  ): string {
    const rad = (angleDeg * Math.PI) / 180;
    // 0 度＝正北（往上，-y 方向），順時針遞增。
    const sinA = Math.sin(rad);
    const cosA = Math.cos(rad);
    const x1 = cx + innerR * sinA;
    const y1 = cy - innerR * cosA;
    const x2 = cx + outerRr * sinA;
    const y2 = cy - outerRr * cosA;
    return `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${ink}" stroke-width="${strokeWidth}" stroke-linecap="round"/>`;
  }

  const majorTicks = majorAngles.map((a) => tickLine(a, tickInnerR, outerR, 3)).join('');
  const minorTicks = minorAngles.map((a) => tickLine(a, minorTickInnerR, outerR, 1.5)).join('');

  // 北向指標三角形（金色，指向正北）。
  const northTip = { x: cx, y: cy - outerR + 4 };
  const northBaseY = cy - tickInnerR + 2;
  const northPoints = `${northTip.x.toFixed(2)},${northTip.y.toFixed(2)} ${(cx - 6).toFixed(2)},${northBaseY.toFixed(2)} ${(cx + 6).toFixed(2)},${northBaseY.toFixed(2)}`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-hidden="true">` +
    `<circle cx="${cx}" cy="${cy}" r="${outerR}" fill="none" stroke="${ink}" stroke-width="2"/>` +
    minorTicks +
    majorTicks +
    `<polygon points="${northPoints}" fill="${gold}"/>` +
    `<circle cx="${cx}" cy="${cy}" r="6" fill="${gold}"/>` +
    `<circle cx="${cx}" cy="${cy}" r="6" fill="none" stroke="${ink}" stroke-width="1.5"/>` +
    `</svg>\n`
  );
}

// ═══════════════════════════════════════════════════════════════════
// 地形烘焙紋理：relief（陸底＋平原＋分層山脈剪影＋短墨脊＋海岸內陰影）／forest（森林群塊）
// 規格：M6-V5 技術設計文件 §4.5、§6；art-bible §3.2／§6.2「紙雕分層山脈、無白邊、海透明」。
// 全程 seeded／整數／線性，色一律取自 MAP_PALETTE_HEX（tokens 單一真相來源）。
// ═══════════════════════════════════════════════════════════════════

/** relief／forest 紋理邊長（每邊 texel，≤2048 限制）；覆蓋 4096×4096 世界，Sprite scale=2。 */
export const TERRAIN_TEXTURE_SIZE = 2048;
const TERRAIN_WORLD = 4096; // 覆蓋世界邊長
const TERRAIN_TEXEL_PER_WORLD = TERRAIN_TEXTURE_SIZE / TERRAIN_WORLD; // 0.5

const MAP_LAND_BASE = hexToRgb(MAP_PALETTE_HEX.landBase);
const MAP_PLAIN_LIGHT = hexToRgb(MAP_PALETTE_HEX.plainLight);
const MAP_RELIEF_INK = hexToRgb(MAP_PALETTE_HEX.reliefInk);
const MAP_FOREST_MOSS = hexToRgb(MAP_PALETTE_HEX.forestMoss);

/** 世界座標 → texel 座標（決定論，四捨五入）。 */
function worldToTexel(v: number): number {
  return Math.round(v * TERRAIN_TEXEL_PER_WORLD);
}

/** 於 `(tx,ty)` 以 source-over 疊上一色（`alpha` 為 0..1）；越界即忽略。RGBA 非預乘。 */
function blendPixel(
  buf: Uint8Array,
  size: number,
  tx: number,
  ty: number,
  color: readonly [number, number, number],
  alpha: number,
): void {
  if (tx < 0 || ty < 0 || tx >= size || ty >= size || alpha <= 0) return;
  const idx = (ty * size + tx) * 4;
  const dstA = buf[idx + 3]! / 255;
  const outA = alpha + dstA * (1 - alpha);
  if (outA <= 0) return;
  for (let c = 0; c < 3; c += 1) {
    const src = color[c]!;
    const dst = buf[idx + c]!;
    buf[idx + c] = clampByte((src * alpha + dst * dstA * (1 - alpha)) / outA);
  }
  buf[idx + 3] = clampByte(outA * 255);
}

/** 水平線 y=py（世界座標）與多邊形（扁平世界座標）邊之交點 x（升冪）。even-odd 掃描線。 */
function scanlineIntersectionsWorld(flat: readonly number[], py: number): number[] {
  const xs: number[] = [];
  const n = flat.length / 2;
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    const yi = flat[i * 2 + 1]!;
    const yj = flat[j * 2 + 1]!;
    if (yi > py !== yj > py) {
      const xi = flat[i * 2]!;
      const xj = flat[j * 2]!;
      xs.push(xi + ((py - yi) / (yj - yi)) * (xj - xi));
    }
  }
  xs.sort((a, b) => a - b);
  return xs;
}

/** 陸地遮罩（texel 空間）：以 outline 多邊形逐列掃描線相交判定；1＝陸、0＝海。 */
function buildLandMask(outline: JapanOutlineFile, size: number): Uint8Array {
  const land = new Uint8Array(size * size);
  const polys = outline.polygons.map((p) => p.points);
  for (let ty = 0; ty < size; ty += 1) {
    const pyWorld = ty / TERRAIN_TEXEL_PER_WORLD; // texel → world（=ty×2）
    const raw: Array<[number, number]> = [];
    for (const poly of polys) {
      const xs = scanlineIntersectionsWorld(poly, pyWorld);
      for (let k = 0; k + 1 < xs.length; k += 2) raw.push([xs[k]!, xs[k + 1]!]);
    }
    for (const [x0, x1] of raw) {
      const tx0 = Math.max(0, worldToTexel(x0));
      const tx1 = Math.min(size - 1, worldToTexel(x1));
      const row = ty * size;
      for (let tx = tx0; tx <= tx1; tx += 1) land[row + tx] = 1;
    }
  }
  return land;
}

/** 世界座標多邊形（可帶 texel 位移）以掃描線填色，僅作用於陸地 texel（clip land）。 */
function fillPolygonOnLand(
  buf: Uint8Array,
  size: number,
  land: Uint8Array,
  flatWorld: readonly number[],
  offTx: number,
  offTy: number,
  color: readonly [number, number, number],
  alpha: number,
): void {
  // 轉為 texel 多邊形（含位移），求 y 範圍。
  const txPoly: number[] = [];
  let minTy = Infinity;
  let maxTy = -Infinity;
  for (let i = 0; i < flatWorld.length; i += 2) {
    const tx = worldToTexel(flatWorld[i]!) + offTx;
    const ty = worldToTexel(flatWorld[i + 1]!) + offTy;
    txPoly.push(tx, ty);
    if (ty < minTy) minTy = ty;
    if (ty > maxTy) maxTy = ty;
  }
  const yStart = Math.max(0, Math.floor(minTy));
  const yEnd = Math.min(size - 1, Math.ceil(maxTy));
  for (let ty = yStart; ty <= yEnd; ty += 1) {
    const xs = scanlineIntersectionsWorld(txPoly, ty);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, Math.round(xs[k]!));
      const xb = Math.min(size - 1, Math.round(xs[k + 1]!));
      const row = ty * size;
      for (let tx = xa; tx <= xb; tx += 1) {
        if (land[row + tx] === 1) blendPixel(buf, size, tx, ty, color, alpha);
      }
    }
  }
}

/** 折線（世界座標）以 1px 於陸地 texel 描線（Bresenham，決定論）。 */
function strokePolylineOnLand(
  buf: Uint8Array,
  size: number,
  land: Uint8Array,
  flatWorld: readonly number[],
  color: readonly [number, number, number],
  alpha: number,
): void {
  for (let i = 0; i + 3 < flatWorld.length; i += 2) {
    let x0 = worldToTexel(flatWorld[i]!);
    let y0 = worldToTexel(flatWorld[i + 1]!);
    const x1 = worldToTexel(flatWorld[i + 2]!);
    const y1 = worldToTexel(flatWorld[i + 3]!);
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    for (;;) {
      if (x0 >= 0 && y0 >= 0 && x0 < size && y0 < size && land[y0 * size + x0] === 1) {
        blendPixel(buf, size, x0, y0, color, alpha);
      }
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) {
        e += dy;
        x0 += sx;
      }
      if (e2 <= dx) {
        e += dx;
        y0 += sy;
      }
    }
  }
}

/** 山體世界座標 AABB（供平原提亮之距離粗篩）。 */
function massAabbWorld(flat: readonly number[]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < flat.length; i += 2) {
    const x = flat[i]!;
    const y = flat[i + 1]!;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, maxX, minY, maxY };
}

/**
 * relief 紙雕紋理（§4.5）：
 * 1) 陸地遮罩掃描線填 landBase（不透明）；海保持透明。
 * 2) 平原提亮：距任何山體 AABB > 200 世界單位之陸地 texel 混入 plainLight（0.4）。
 * 3) 山脈（依 id 序）：畫 min(2+tier,4) 層錯位剪影（第 k 層向左上平移 3k texel、reliefInk、
 *    alpha 0.20→0.12），再對 ridges 每條折線以 reliefInk alpha 0.5 描短脊。
 * 4) 海岸內陰影：距海 ≤4 texel 之陸地 texel 疊 reliefInk alpha 0.18（暖灰）；**無白／高亮邊**。
 */
export function generateReliefTexture(terrain: TerrainFile, outline: JapanOutlineFile): RgbaImage {
  const size = TERRAIN_TEXTURE_SIZE;
  const rgba = newTransparentBuffer(size, size);
  const land = buildLandMask(outline, size);

  // 1) 陸地底色（不透明）。
  for (let i = 0; i < land.length; i += 1) {
    if (land[i] === 1) {
      const idx = i * 4;
      rgba[idx] = MAP_LAND_BASE[0];
      rgba[idx + 1] = MAP_LAND_BASE[1];
      rgba[idx + 2] = MAP_LAND_BASE[2];
      rgba[idx + 3] = 255;
    }
  }

  // 2) 平原提亮（距山遠者）。
  const massAabbs = terrain.mountains.map((m) => massAabbWorld(m.mass));
  const PLAIN_DIST = 200; // 世界單位
  for (let ty = 0; ty < size; ty += 1) {
    const wy = ty / TERRAIN_TEXEL_PER_WORLD;
    const row = ty * size;
    for (let tx = 0; tx < size; tx += 1) {
      if (land[row + tx] !== 1) continue;
      const wx = tx / TERRAIN_TEXEL_PER_WORLD;
      let near = false;
      for (const a of massAabbs) {
        const ddx = Math.max(a.minX - wx, 0, wx - a.maxX);
        const ddy = Math.max(a.minY - wy, 0, wy - a.maxY);
        if (ddx * ddx + ddy * ddy <= PLAIN_DIST * PLAIN_DIST) {
          near = true;
          break;
        }
      }
      if (!near) blendPixel(rgba, size, tx, ty, MAP_PLAIN_LIGHT, 0.4);
    }
  }

  // 3) 山脈分層剪影＋短墨脊（依 id 字典序，快照穩定）。
  const mountains = [...terrain.mountains].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const m of mountains) {
    const layers = Math.min(2 + m.tier, 4);
    for (let k = 0; k < layers; k += 1) {
      const t = layers === 1 ? 0 : k / (layers - 1);
      const alpha = 0.2 - (0.2 - 0.12) * t;
      const off = -3 * k; // 向左上（-x,-y）平移，左上受光
      fillPolygonOnLand(rgba, size, land, m.mass, off, off, MAP_RELIEF_INK, alpha);
    }
    for (const r of m.ridges) {
      strokePolylineOnLand(rgba, size, land, r, MAP_RELIEF_INK, 0.5);
    }
  }

  // 4) 海岸內陰影（距海 ≤4 texel 之陸地 texel），無白邊。
  const SHADOW_R = 4;
  for (let ty = 0; ty < size; ty += 1) {
    const row = ty * size;
    for (let tx = 0; tx < size; tx += 1) {
      if (land[row + tx] !== 1) continue;
      let coastal = false;
      for (let d = 1; d <= SHADOW_R && !coastal; d += 1) {
        for (const [ox, oy] of [
          [d, 0],
          [-d, 0],
          [0, d],
          [0, -d],
          [d, d],
          [d, -d],
          [-d, d],
          [-d, -d],
        ] as const) {
          const nx = tx + ox;
          const ny = ty + oy;
          if (nx < 0 || ny < 0 || nx >= size || ny >= size || land[ny * size + nx] === 0) {
            coastal = true;
            break;
          }
        }
      }
      if (coastal) blendPixel(rgba, size, tx, ty, MAP_RELIEF_INK, 0.18);
    }
  }

  return { width: size, height: size, rgba };
}

/**
 * forest 森林冠幅紋理（§4.5）：透明底；每 forest.polygon 掃描線填 forestMoss（alpha≈0.82），
 * 邊緣以固定種子雜訊製造缺口（林緣節奏，外輪廓重於內部）；其餘保持透明。
 * 與 relief 一致以陸地遮罩 clip（`land[...]===1`）——森林多邊形可能於沿海突出海面，
 * 未 clip 會令苔綠越海（如 fo.hakone／fo.suzuka）；比照 `fillPolygonOnLand` 之陸地紀律。
 */
export function generateForestTexture(terrain: TerrainFile, outline: JapanOutlineFile): RgbaImage {
  const size = TERRAIN_TEXTURE_SIZE;
  const rgba = newTransparentBuffer(size, size);
  const land = buildLandMask(outline, size);
  const forests = [...terrain.forests].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const EDGE = 4; // 林緣節奏之邊帶寬（texel）
  for (const f of forests) {
    // 轉 texel 多邊形。
    const txPoly: number[] = [];
    let minTy = Infinity;
    let maxTy = -Infinity;
    for (let i = 0; i < f.polygon.length; i += 2) {
      const tx = worldToTexel(f.polygon[i]!);
      const ty = worldToTexel(f.polygon[i + 1]!);
      txPoly.push(tx, ty);
      if (ty < minTy) minTy = ty;
      if (ty > maxTy) maxTy = ty;
    }
    const yStart = Math.max(0, Math.floor(minTy));
    const yEnd = Math.min(size - 1, Math.ceil(maxTy));
    for (let ty = yStart; ty <= yEnd; ty += 1) {
      const xs = scanlineIntersectionsWorld(txPoly, ty);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const xa = Math.max(0, Math.round(xs[k]!));
        const xb = Math.min(size - 1, Math.round(xs[k + 1]!));
        const row = ty * size;
        for (let tx = xa; tx <= xb; tx += 1) {
          if (land[row + tx] !== 1) continue; // clip 陸地：森林不越海（比照 relief）
          const edgeDist = Math.min(tx - xa, xb - tx, ty - yStart, yEnd - ty);
          // 邊帶以雜訊挖缺口（外輪廓重）；內部滿填。
          if (edgeDist < EDGE) {
            const n = washiNoiseValue(tx, ty, size, size);
            if (n < 0.45) continue; // 缺口
          }
          blendPixel(rgba, size, tx, ty, MAP_FOREST_MOSS, 0.82);
        }
      }
    }
  }
  return { width: size, height: size, rgba };
}

// ═══════════════════════════════════════════════════════════════════
// PNG 編碼與雜湊
// ═══════════════════════════════════════════════════════════════════

/** 決定性 PNG 編碼：固定 `DETERMINISTIC_PNG_OPTS`（filterType:0／deflateLevel:9／strategy:3）。 */
export function encodeDeterministicPng(image: RgbaImage): Buffer {
  const png = new PNG({ width: image.width, height: image.height });
  png.data = Buffer.from(image.rgba);
  return PNG.sync.write(png, DETERMINISTIC_PNG_OPTS);
}

export function sha256Hex(buf: Buffer | Uint8Array): string {
  return createHash('sha256').update(buf).digest('hex');
}

// ═══════════════════════════════════════════════════════════════════
// CLI：落盤全部素材並印出 sha256
// ═══════════════════════════════════════════════════════════════════

interface GeneratedAsset {
  readonly id: string;
  readonly hashedPath: string; // 相對 REPO_ROOT，供人類辨識印出
  readonly sha256: string;
}

function writeAndHash(absPath: string, buf: Buffer): { sha256: string } {
  mkdirSync(path.dirname(absPath), { recursive: true });
  writeFileSync(absPath, buf);
  return { sha256: sha256Hex(buf) };
}

export function runGenAssets(): readonly GeneratedAsset[] {
  const results: GeneratedAsset[] = [];

  // ── washi 材質：母檔（source，committed 工作檔）＋ runtime（降採） ──
  const masterRgba = generateWashiMasterRgba();
  const masterPng = encodeDeterministicPng({
    width: WASHI_MASTER_SIZE,
    height: WASHI_MASTER_SIZE,
    rgba: masterRgba,
  });
  const masterPath = path.join(ASSETS_SOURCE_DIR, 'texture-washi-base-master@2x.png');
  writeAndHash(masterPath, masterPng); // source 工作檔本身不進 manifest hash（D4：texture 雜湊 runtime 檔）

  const runtimeRgba = boxDownsample2x(masterRgba, WASHI_MASTER_SIZE);
  const runtimePng = encodeDeterministicPng({
    width: WASHI_RUNTIME_SIZE,
    height: WASHI_RUNTIME_SIZE,
    rgba: runtimeRgba,
  });
  const washiRuntimePath = path.join(ASSETS_PUBLIC_DIR, 'textures/washi-base@1x.png');
  const washiResult = writeAndHash(washiRuntimePath, runtimePng);
  results.push({
    id: 'texture.washi.base@1x',
    hashedPath: path.relative(REPO_ROOT, washiRuntimePath),
    sha256: washiResult.sha256,
  });

  // ── 地形烘焙紋理 relief／forest（程序生成，直接即 runtime 檔，無 source 母檔；M6-V5 §4.5） ──
  const terrainFile = zTerrainFile.parse(
    JSON.parse(readFileSync(path.join(REPO_ROOT, 'src/data/map/terrain.json'), 'utf-8')),
  );
  const outlineFile = zJapanOutlineFile.parse(
    JSON.parse(readFileSync(path.join(REPO_ROOT, 'src/data/map/japan-outline.json'), 'utf-8')),
  );

  const reliefPng = encodeDeterministicPng(generateReliefTexture(terrainFile, outlineFile));
  const reliefPath = path.join(ASSETS_PUBLIC_DIR, 'textures/terrain-relief@1x.png');
  const reliefResult = writeAndHash(reliefPath, reliefPng);
  results.push({
    id: 'texture.terrain.relief@1x',
    hashedPath: path.relative(REPO_ROOT, reliefPath),
    sha256: reliefResult.sha256,
  });

  const forestPng = encodeDeterministicPng(generateForestTexture(terrainFile, outlineFile));
  const forestPath = path.join(ASSETS_PUBLIC_DIR, 'textures/terrain-forest@1x.png');
  const forestResult = writeAndHash(forestPath, forestPng);
  results.push({
    id: 'texture.terrain.forest@1x',
    hashedPath: path.relative(REPO_ROOT, forestPath),
    sha256: forestResult.sha256,
  });

  // ── compass.svg：程序生成，直接即 runtime 檔（無 source 母檔，補遺 AD1／設計 D3） ──
  const compassSvg = generateCompassSvg();
  const compassBuf = Buffer.from(compassSvg, 'utf-8');
  const compassPath = path.join(ASSETS_PUBLIC_DIR, 'map/compass.svg');
  const compassResult = writeAndHash(compassPath, compassBuf);
  results.push({
    id: 'map.decor.compass.normal',
    hashedPath: path.relative(REPO_ROOT, compassPath),
    sha256: compassResult.sha256,
  });

  // ── 3 個 atlas 來源 frame（僅落 source；atlas 分頁由 tools/build-atlas.ts 另行打包） ──
  const atlasFrames: {
    readonly id: string;
    readonly filename: string;
    readonly image: RgbaImage;
  }[] = [
    {
      id: 'map.marker.castle-plain.normal',
      filename: 'map-marker-castle-plain-normal.png',
      image: generateCastlePlainFrame(),
    },
    {
      id: 'map.marker.castle-mountain.normal',
      filename: 'map-marker-castle-mountain-normal.png',
      image: generateCastleMountainFrame(),
    },
    {
      id: 'map.marker.army-banner.normal',
      filename: 'map-marker-army-banner-normal.png',
      image: generateArmyBannerFrame(),
    },
  ];

  for (const frame of atlasFrames) {
    const framePng = encodeDeterministicPng(frame.image);
    const framePath = path.join(ASSETS_SOURCE_FRAMES_DIR, frame.filename);
    const frameResult = writeAndHash(framePath, framePng);
    results.push({
      id: frame.id,
      hashedPath: path.relative(REPO_ROOT, framePath),
      sha256: frameResult.sha256,
    });
  }

  return results;
}

function isDirectRun(): boolean {
  return process.argv[1] !== undefined && import.meta.url === `file://${process.argv[1]}`;
}

function main(): void {
  if (!existsSync(ASSETS_PUBLIC_DIR)) {
    mkdirSync(ASSETS_PUBLIC_DIR, { recursive: true });
  }
  const results = runGenAssets();
  console.log(
    '視覺素材生成完成（12 §3.7）。請將以下 sha256 貼回 src/ui/assets/manifest.ts 對應 contentHash：',
  );
  for (const r of results) {
    console.log(`  ${r.id} → ${r.sha256}（${r.hashedPath}）`);
  }
}

if (isDirectRun()) {
  main();
}
