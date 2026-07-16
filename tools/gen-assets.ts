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
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';

import {
  ASSETS_PUBLIC_DIR,
  ASSETS_SOURCE_DIR,
  ASSETS_SOURCE_FRAMES_DIR,
  DETERMINISTIC_PNG_OPTS,
  REPO_ROOT,
} from './asset-paths';
import { TOKENS } from '../src/ui/styles/tokens';

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
