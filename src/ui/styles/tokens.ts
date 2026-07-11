// design tokens 單一真相來源（規格：plan/12-ui-components.md §3.1、§5.1；驗收：12-T1）。
//
// TOKENS 為 TS 常數：CSS 由 injectCssVariables() 在啟動時展平成 `:root` custom properties，
// PixiJS 端一律讀 TOKENS_NUM（預先轉換好的 0xRRGGBB 數值色，見 §3.1.1）。
// 40 個勢力色（Clan.colorIndex 0..39，欄位定義見 plan/02-data-model.md）不進 TOKENS.color，
// 而是由 clanColorHex()/clanColorNum() 依 §5.1 公式即時生成（40 色 × 2 變體 = 80 個 CSS 變數）。
//
// 本檔為 UI 呈現用途，允許使用 DOM 全域（`document`）；core/data 純度規則不適用於 src/ui/**
// （見 eslint.config.js 邊界規則 1，僅限 src/core、src/data）。

/** §3.1.2 和紙質感紋理：feTurbulence 雜訊（baseFrequency=0.9、numOctaves=2、128×128 鋪磚、
 *  已用 feColorMatrix 把灰階雜訊映成 --ink-900 色調並預先乘好 0.05 透明度），
 *  以 base64 內嵌 data URI 避免執行期字串跳脫與外部圖片資產（12 §3.1.2「禁止外部圖片資產」）。 */
const TEXTURE_WASHI_BASE64 =
  'PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjgiIGhlaWdodD0iMTI4Ij48ZmlsdGVyIGlkPSJuIj48ZmVUdXJidWxlbmNlIHR5cGU9ImZyYWN0YWxOb2lzZSIgYmFzZUZyZXF1ZW5jeT0iMC45IiBudW1PY3RhdmVzPSIyIiBzdGl0Y2hUaWxlcz0ic3RpdGNoIi8+PGZlQ29sb3JNYXRyaXggdHlwZT0ibWF0cml4IiB2YWx1ZXM9IjAgMCAwIDAgMC4wNzggIDAgMCAwIDAgMC4wNzEgIDAgMCAwIDAgMC4wNTUgIDAgMCAwIDAuMDUgMCIvPjwvZmlsdGVyPjxyZWN0IHdpZHRoPSIxMjgiIGhlaWdodD0iMTI4IiBmaWx0ZXI9InVybCgjbikiLz48L3N2Zz4=';

export const TOKENS = {
  /** §3.1.2 墨黑階、和紙階、功能色；§3.1.3 特性稀有度色（06 §6.2 語意，值定案於此，D11）。
   *  `--ink-300` 值見 §8-D14（原文 `#7a6f60` 對比不足 4.5:1，已更正為 `#716759`）。 */
  color: {
    ink900: '#14120e',
    ink700: '#2b2620',
    ink500: '#4a4238',
    ink300: '#716759',
    ink100: '#b3a893',
    washi100: '#f5efe0',
    washi200: '#ece3cd',
    washi300: '#e0d4b8',
    accentVermilion: '#b23a28',
    accentVermilionBright: '#d9503a',
    accentGold: '#b8862d',
    accentGoldText: '#8a6216',
    accentIndigo: '#2e5c8a',
    accentMoss: '#3f6b35',
    accentMossBright: '#5c9450',
    neutralClanless: '#8c8c84',
    traitLegendary: '#b8862d',
    traitRare: '#6a4a86',
    traitCommon: '#5f6f7c',
    textureWashi: `url("data:image/svg+xml;base64,${TEXTURE_WASHI_BASE64}")`,
  },
  /** §3.1.4 字體與字級階（Noto Serif TC 現況僅 400 一檔，見 §8-D13）。 */
  font: {
    familySerif: `'Noto Serif TC', 'Songti TC', 'PMingLiU', serif`,
    sizeXs: '12px',
    sizeSm: '14px',
    sizeMd: '16px',
    sizeLg: '20px',
    sizeXl: '24px',
    sizeXxl: '32px',
    lineHeightTight: '1.3',
    lineHeightBody: '1.6',
  },
  /** §3.1.5 間距階（4 基數）。 */
  space: {
    space1: '4px',
    space2: '8px',
    space3: '12px',
    space4: '16px',
    space6: '24px',
    space8: '32px',
    space12: '48px',
    space16: '64px',
  },
  /** §3.1.5 圓角（和風偏方正，圓角刻意小）。 */
  radius: {
    sm: '2px',
    md: '4px',
    round: '999px',
  },
  /** §3.1.5 陰影（墨色、低擴散）。 */
  shadow: {
    shadow1: '0 1px 3px rgba(20, 18, 14, 0.25)',
    shadow2: '0 4px 16px rgba(20, 18, 14, 0.35)',
    shadowFocus: '0 0 0 2px var(--washi-100), 0 0 0 4px var(--accent-gold)',
  },
  /** §3.1.5 邊框（和風細線＋角飾）。 */
  border: {
    thin: '1px solid var(--ink-300)',
    strong: '2px solid var(--ink-700)',
  },
  /** §3.1.6 z-index 層級表。 */
  zIndex: {
    map: 0,
    mapOverlay: 50,
    hud: 100,
    dropdown: 500,
    tooltip: 900,
    modalBackdrop: 1000,
    modal: 1010,
    toast: 1100,
    dev: 1200,
  },
  /** §3.1.7 動效 tokens：時長為純數字 ms（Pixi 端以 `TOKENS.duration.focus` 等直接引用），
   *  緩動為 CSS `cubic-bezier` 字串。CSS 端由 injectCssVariables() 補 `ms` 單位。 */
  duration: {
    fast: 150,
    normal: 300,
    focus: 400,
    awe: 800,
    easeOut: 'cubic-bezier(0.22, 1, 0.36, 1)',
    easeInOut: 'cubic-bezier(0.65, 0, 0.35, 1)',
  },
} as const;

/** 給 PixiJS 用：`'#b23a28'` → `0xb23a28`。 */
export function hexToNum(hex: string): number {
  const clean = hex.startsWith('#') ? hex.slice(1) : hex;
  return parseInt(clean, 16);
}

/** TOKENS.color 純色彩 token（不含 textureWashi data URI）的數值色快取，供 Pixi 繪製程式引用
 *  （`TOKENS_NUM.inkNine00` 等，§3.1.1：「Pixi 繪製程式一律以 TOKENS_NUM.xxx 引用」）。 */
export const TOKENS_NUM = {
  ink900: hexToNum(TOKENS.color.ink900),
  ink700: hexToNum(TOKENS.color.ink700),
  ink500: hexToNum(TOKENS.color.ink500),
  ink300: hexToNum(TOKENS.color.ink300),
  ink100: hexToNum(TOKENS.color.ink100),
  washi100: hexToNum(TOKENS.color.washi100),
  washi200: hexToNum(TOKENS.color.washi200),
  washi300: hexToNum(TOKENS.color.washi300),
  accentVermilion: hexToNum(TOKENS.color.accentVermilion),
  accentVermilionBright: hexToNum(TOKENS.color.accentVermilionBright),
  accentGold: hexToNum(TOKENS.color.accentGold),
  accentGoldText: hexToNum(TOKENS.color.accentGoldText),
  accentIndigo: hexToNum(TOKENS.color.accentIndigo),
  accentMoss: hexToNum(TOKENS.color.accentMoss),
  accentMossBright: hexToNum(TOKENS.color.accentMossBright),
  neutralClanless: hexToNum(TOKENS.color.neutralClanless),
  traitLegendary: hexToNum(TOKENS.color.traitLegendary),
  traitRare: hexToNum(TOKENS.color.traitRare),
  traitCommon: hexToNum(TOKENS.color.traitCommon),
} as const;

/** 勢力色數量（0..39，Clan.colorIndex 值域，欄位定義見 plan/02-data-model.md）。 */
export const CLAN_COLOR_COUNT = 40;

function assertClanColorIndex(index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= CLAN_COLOR_COUNT) {
    throw new RangeError(`clan colorIndex 必須是 0..${CLAN_COLOR_COUNT - 1} 的整數，收到 ${index}`);
  }
}

/** §5.1 勢力色公式：`hue = index * 9`；一般變體 hsl(hue,62%,42%)、亮變體 hsl(hue,58%,52%)。 */
export function clanColorHsl(
  index: number,
  bright: boolean,
): { readonly h: number; readonly s: number; readonly l: number } {
  assertClanColorIndex(index);
  const hue = (index * 9) % 360;
  return bright ? { h: hue, s: 58, l: 52 } : { h: hue, s: 62, l: 42 };
}

/** 標準 HSL→RGB 轉換，四捨五入到整數通道（§5.1：「HSL→RGB 用標準轉換，四捨五入到整數通道」）。 */
function hslToHex(h: number, s: number, l: number): string {
  const sNorm = s / 100;
  const lNorm = l / 100;
  const k = (n: number): number => (n + h / 30) % 12;
  const a = sNorm * Math.min(lNorm, 1 - lNorm);
  const f = (n: number): number =>
    lNorm - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const toByte = (n: number): number => Math.round(f(n) * 255);
  const channels = [toByte(0), toByte(8), toByte(4)];
  return `#${channels.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/** 勢力色 hex（執行期生成，§5.1）：`clanColorHex(5)` → 織田家地圖填色；`clanColorHex(5, true)` → 亮變體。 */
export function clanColorHex(index: number, bright = false): string {
  const { h, s, l } = clanColorHsl(index, bright);
  return hslToHex(h, s, l);
}

/** 勢力色數值色（供 Pixi 引用）。 */
export function clanColorNum(index: number, bright = false): number {
  return hexToNum(clanColorHex(index, bright));
}

/** `--clan-00`..`--clan-39` 的兩位數索引字串（`0` → `'00'`）。 */
function clanIndexLabel(index: number): string {
  return String(index).padStart(2, '0');
}

/** TOKENS 全表攤平成 `[cssVarName, value]`（§3.1.1：CSS 需要 custom properties）。
 *  逐一手寫對應而非自動 camelCase→kebab-case 轉換，因多個鍵含數字（如 `ink900`→`--ink-900`）
 *  或字首與屬性群組不同（如 `duration.easeOut`→`--ease-out`，非 `--duration-ease-out`），
 *  自動轉換規則無法無歧義涵蓋全部情形；顯式表可逐條對照 §3.1 各小節表格核對正確性。 */
function buildBaseCssVarEntries(): ReadonlyArray<readonly [string, string]> {
  const {
    color: c,
    font: f,
    space: s,
    radius: r,
    shadow: sh,
    border: b,
    zIndex: z,
    duration: d,
  } = TOKENS;
  return [
    // §3.1.2 色彩
    ['--ink-900', c.ink900],
    ['--ink-700', c.ink700],
    ['--ink-500', c.ink500],
    ['--ink-300', c.ink300],
    ['--ink-100', c.ink100],
    ['--washi-100', c.washi100],
    ['--washi-200', c.washi200],
    ['--washi-300', c.washi300],
    ['--accent-vermilion', c.accentVermilion],
    ['--accent-vermilion-bright', c.accentVermilionBright],
    ['--accent-gold', c.accentGold],
    ['--accent-gold-text', c.accentGoldText],
    ['--accent-indigo', c.accentIndigo],
    ['--accent-moss', c.accentMoss],
    ['--accent-moss-bright', c.accentMossBright],
    ['--neutral-clanless', c.neutralClanless],
    ['--trait-legendary', c.traitLegendary],
    ['--trait-rare', c.traitRare],
    ['--trait-common', c.traitCommon],
    ['--texture-washi', c.textureWashi],
    // §3.1.4 字體
    ['--font-family-serif', f.familySerif],
    ['--font-size-xs', f.sizeXs],
    ['--font-size-sm', f.sizeSm],
    ['--font-size-md', f.sizeMd],
    ['--font-size-lg', f.sizeLg],
    ['--font-size-xl', f.sizeXl],
    ['--font-size-xxl', f.sizeXxl],
    ['--line-height-tight', f.lineHeightTight],
    ['--line-height-body', f.lineHeightBody],
    // §3.1.5 間距、圓角、陰影、邊框
    ['--space-1', s.space1],
    ['--space-2', s.space2],
    ['--space-3', s.space3],
    ['--space-4', s.space4],
    ['--space-6', s.space6],
    ['--space-8', s.space8],
    ['--space-12', s.space12],
    ['--space-16', s.space16],
    ['--radius-sm', r.sm],
    ['--radius-md', r.md],
    ['--radius-round', r.round],
    ['--shadow-1', sh.shadow1],
    ['--shadow-2', sh.shadow2],
    ['--shadow-focus', sh.shadowFocus],
    ['--border-thin', b.thin],
    ['--border-strong', b.strong],
    // §3.1.6 z-index
    ['--z-map', String(z.map)],
    ['--z-map-overlay', String(z.mapOverlay)],
    ['--z-hud', String(z.hud)],
    ['--z-dropdown', String(z.dropdown)],
    ['--z-tooltip', String(z.tooltip)],
    ['--z-modal-backdrop', String(z.modalBackdrop)],
    ['--z-modal', String(z.modal)],
    ['--z-toast', String(z.toast)],
    ['--z-dev', String(z.dev)],
    // §3.1.7 動效
    ['--duration-fast', `${d.fast}ms`],
    ['--duration-normal', `${d.normal}ms`],
    ['--duration-focus', `${d.focus}ms`],
    ['--duration-awe', `${d.awe}ms`],
    ['--ease-out', d.easeOut],
    ['--ease-in-out', d.easeInOut],
  ];
}

/** §5.1：40 勢力色 × 2 變體（一般／亮）＝ 80 個 `--clan-00`..`--clan-39`／`-bright` CSS 變數。 */
function buildClanCssVarEntries(): ReadonlyArray<readonly [string, string]> {
  const entries: Array<readonly [string, string]> = [];
  for (let index = 0; index < CLAN_COLOR_COUNT; index += 1) {
    const label = clanIndexLabel(index);
    entries.push([`--clan-${label}`, clanColorHex(index, false)]);
    entries.push([`--clan-${label}-bright`, clanColorHex(index, true)]);
  }
  return entries;
}

/** 啟動時（main.tsx，React mount 前）呼叫一次：將 TOKENS 全部展平成 `:root` 的 CSS custom
 *  properties，並生成 40 個勢力色 `--clan-00`..`--clan-39`（含 `-bright` 變體，共 80 個，公式見 §5.1）。 */
export function injectCssVariables(): void {
  const root = document.documentElement;
  for (const [name, value] of buildBaseCssVarEntries()) {
    root.style.setProperty(name, value);
  }
  for (const [name, value] of buildClanCssVarEntries()) {
    root.style.setProperty(name, value);
  }
}

// 測試用（tests/ui/tokens.spec.ts）：不對外做為 public API 的一部分匯出於 barrel，
// 但同檔內其餘模組可直接 import 具名函式驗證 CSS 變數表的完整性與生成邏輯。
export { buildBaseCssVarEntries, buildClanCssVarEntries };
