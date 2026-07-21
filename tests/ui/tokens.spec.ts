// design tokens 純邏輯測試（規格：plan/12-ui-components.md §3.1、§3.5、§5.1；驗收：12-T1）。
//
// 本檔只測試不需要真實 DOM 的部分（TOKENS 表本身、hexToNum、40 勢力色公式、CSS 變數表生成、
// §3.5 對比配對的自動驗算）；`injectCssVariables()` 實際寫入 `:root` 的 DOM 整合測試見
// src/ui/styles/tokens.spec.tsx（同檔案位置＋`.spec.tsx` 副檔名才會落入 vitest.workspace.ts 的
// `ui`/jsdom project，見 17-testing.md §3.2 的 include glob；本檔不需要 jsdom，故留在 core/node
// project 下的 tests/ 目錄，兩檔互補覆蓋 12-T1 全部驗收點）。
import { describe, expect, it } from 'vitest';
import {
  CLAN_COLOR_COUNT,
  TOKENS,
  TOKENS_NUM,
  buildBaseCssVarEntries,
  buildClanCssVarEntries,
  clanColorHex,
  clanColorHsl,
  clanColorNum,
  hexToNum,
} from '../../src/ui/styles/tokens';

describe("hexToNum — 12-T1 驗收：hexToNum('#b23a28') === 0xb23a28", () => {
  it('轉換色票 hex 字串為 Pixi 數值色', () => {
    expect(hexToNum('#b23a28')).toBe(0xb23a28);
    expect(hexToNum('#14120e')).toBe(0x14120e);
    expect(hexToNum('#ffffff')).toBe(0xffffff);
    expect(hexToNum('#000000')).toBe(0);
  });

  it('也接受不含井字號的輸入', () => {
    expect(hexToNum('b23a28')).toBe(0xb23a28);
  });
});

describe('TOKENS_NUM — 與 TOKENS.color 一一對應的數值色快取', () => {
  it('每個 TOKENS.color 純色 token 都有對應的 TOKENS_NUM 數值色', () => {
    for (const [key, hex] of Object.entries(TOKENS.color)) {
      if (key === 'textureWashi') continue; // data URI，非純色，不進 TOKENS_NUM
      expect(TOKENS_NUM[key as keyof typeof TOKENS_NUM]).toBe(hexToNum(hex));
    }
  });
});

describe('clanColorHsl／clanColorHex／clanColorNum — §5.1 勢力色公式', () => {
  it('hue = index * 9，一般變體 s62/l42、亮變體 s58/l52', () => {
    expect(clanColorHsl(0, false)).toEqual({ h: 0, s: 62, l: 42 });
    expect(clanColorHsl(0, true)).toEqual({ h: 0, s: 58, l: 52 });
    expect(clanColorHsl(5, false)).toEqual({ h: 45, s: 62, l: 42 }); // 織田家 colorIndex=5（14 §3.1.3）
    expect(clanColorHsl(39, false)).toEqual({ h: 351, s: 62, l: 42 });
  });

  it('index 超出 0..39 範圍時拋錯（Clan.colorIndex 值域，plan/02）', () => {
    expect(() => clanColorHex(-1)).toThrow(RangeError);
    expect(() => clanColorHex(40)).toThrow(RangeError);
    expect(() => clanColorHex(1.5)).toThrow(RangeError);
  });

  it('40 個 index 的一般變體 hex 兩兩互異（地圖填色不得混淆）', () => {
    const hexes = new Set(Array.from({ length: CLAN_COLOR_COUNT }, (_, i) => clanColorHex(i)));
    expect(hexes.size).toBe(CLAN_COLOR_COUNT);
  });

  it('40 個 index 的亮變體 hex 兩兩互異', () => {
    const hexes = new Set(
      Array.from({ length: CLAN_COLOR_COUNT }, (_, i) => clanColorHex(i, true)),
    );
    expect(hexes.size).toBe(CLAN_COLOR_COUNT);
  });

  it('clanColorNum 等於 clanColorHex 轉數值色', () => {
    expect(clanColorNum(5)).toBe(hexToNum(clanColorHex(5)));
    expect(clanColorNum(5, true)).toBe(hexToNum(clanColorHex(5, true)));
  });

  it('index=0（赤）hue=0 應為飽和紅色系（武田家釘選色，14 §3.1.3）', () => {
    expect(clanColorHex(0)).toBe('#ae2929');
  });
});

describe('buildBaseCssVarEntries — §3.1 全表攤平為 CSS 變數（12-T1 驗收）', () => {
  const EXPECTED_NAMES = [
    // §3.1.2 色彩（19 純色 + 1 紋理 = 20）
    '--ink-900',
    '--ink-700',
    '--ink-500',
    '--ink-300',
    '--ink-100',
    '--washi-100',
    '--washi-200',
    '--washi-300',
    '--accent-vermilion',
    '--accent-vermilion-bright',
    '--accent-gold',
    '--accent-gold-text',
    '--accent-indigo',
    '--accent-moss',
    '--accent-moss-bright',
    '--neutral-clanless',
    '--trait-legendary',
    '--trait-rare',
    '--trait-common',
    '--texture-washi',
    // §3.1.4 字體（9）
    '--font-family-serif',
    '--font-size-xs',
    '--font-size-sm',
    '--font-size-md',
    '--font-size-lg',
    '--font-size-xl',
    '--font-size-xxl',
    '--line-height-tight',
    '--line-height-body',
    // §3.1.5 間距／圓角／陰影／邊框（8+3+3+2=16）
    '--space-1',
    '--space-2',
    '--space-3',
    '--space-4',
    '--space-6',
    '--space-8',
    '--space-12',
    '--space-16',
    '--radius-sm',
    '--radius-md',
    '--radius-round',
    '--shadow-1',
    '--shadow-2',
    '--shadow-focus',
    '--border-thin',
    '--border-strong',
    // §3.1.6 z-index（10；M6-V9 §5 補 --z-panel）
    '--z-map',
    '--z-map-overlay',
    '--z-hud',
    '--z-panel',
    '--z-dropdown',
    '--z-tooltip',
    '--z-modal-backdrop',
    '--z-modal',
    '--z-toast',
    '--z-dev',
    // §3.1.7 動效（6）
    '--duration-fast',
    '--duration-normal',
    '--duration-focus',
    '--duration-awe',
    '--ease-out',
    '--ease-in-out',
  ];

  it('恰好產生 §3.1 全表對應的 61 個 CSS 變數（M6-V9 補 --z-panel），一個不多一個不少', () => {
    const entries = buildBaseCssVarEntries();
    const names = entries.map(([name]) => name);
    expect(new Set(names).size).toBe(names.length); // 無重複
    expect(names.sort()).toEqual([...EXPECTED_NAMES].sort());
  });

  it('時長類補上 ms 單位，緩動類維持 cubic-bezier 字串', () => {
    const entries = new Map(buildBaseCssVarEntries());
    expect(entries.get('--duration-fast')).toBe('150ms');
    expect(entries.get('--duration-normal')).toBe('300ms');
    expect(entries.get('--duration-focus')).toBe('400ms');
    expect(entries.get('--duration-awe')).toBe('800ms');
    expect(entries.get('--ease-out')).toBe('cubic-bezier(0.22, 1, 0.36, 1)');
    expect(entries.get('--ease-in-out')).toBe('cubic-bezier(0.65, 0, 0.35, 1)');
  });

  it('z-index 類為不含單位的純數字字串（依 §3.1.6 表）', () => {
    const entries = new Map(buildBaseCssVarEntries());
    expect(entries.get('--z-map')).toBe('0');
    expect(entries.get('--z-map-overlay')).toBe('50');
    expect(entries.get('--z-hud')).toBe('100');
    expect(entries.get('--z-panel')).toBe('200');
    expect(entries.get('--z-dropdown')).toBe('500');
    expect(entries.get('--z-tooltip')).toBe('900');
    expect(entries.get('--z-modal-backdrop')).toBe('1000');
    expect(entries.get('--z-modal')).toBe('1010');
    expect(entries.get('--z-toast')).toBe('1100');
    expect(entries.get('--z-dev')).toBe('1200');
  });

  it('色彩值為 §3.1.2 表定案的 hex（逐一核對，不得被實作誤改）', () => {
    const entries = new Map(buildBaseCssVarEntries());
    expect(entries.get('--ink-900')).toBe('#14120e');
    expect(entries.get('--ink-700')).toBe('#2b2620');
    expect(entries.get('--ink-500')).toBe('#4a4238');
    expect(entries.get('--ink-300')).toBe('#716759'); // 12 §8-D14 修正值
    expect(entries.get('--ink-100')).toBe('#b3a893');
    expect(entries.get('--washi-100')).toBe('#f5efe0');
    expect(entries.get('--washi-200')).toBe('#ece3cd');
    expect(entries.get('--washi-300')).toBe('#e0d4b8');
    expect(entries.get('--accent-vermilion')).toBe('#b23a28');
    expect(entries.get('--accent-gold-text')).toBe('#8a6216');
  });
});

describe('buildClanCssVarEntries — §3.1.3／§5.1 驗收：80 個勢力色 CSS 變數', () => {
  it('恰好生成 --clan-00..39 與 -bright 共 80 個，名稱與值皆正確', () => {
    const entries = buildClanCssVarEntries();
    expect(entries.length).toBe(80);

    const map = new Map(entries);
    expect(map.get('--clan-00')).toBe(clanColorHex(0));
    expect(map.get('--clan-00-bright')).toBe(clanColorHex(0, true));
    expect(map.get('--clan-39')).toBe(clanColorHex(39));
    expect(map.get('--clan-39-bright')).toBe(clanColorHex(39, true));
    expect(map.has('--clan-5')).toBe(false); // 索引須兩位數補零
    expect(map.get('--clan-05')).toBe(clanColorHex(5));
  });
});

// ── §3.5 對比驗算（12-T1 驗收：「§3.5 對比表以程式驗算全數 ≥ 4.5」） ──
//
// WCAG 2.x relative luminance／contrast ratio 標準公式，本檔獨立實作（不依賴 tokens.ts 匯出，
// tokens.ts 的公開 API 依 12 §3.1.1 只到 TOKENS/TOKENS_NUM/hexToNum/clanColorHex/clanColorNum，
// 對比驗算屬測試專用工具，不擴大 tokens.ts 的對外介面）。
function srgbChannelToLinear(channel255: number): number {
  const c = channel255 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const n = hexToNum(hex);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return (
    0.2126 * srgbChannelToLinear(r) +
    0.7152 * srgbChannelToLinear(g) +
    0.0722 * srgbChannelToLinear(b)
  );
}

function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA);
  const lB = relativeLuminance(hexB);
  const lighter = Math.max(lA, lB);
  const darker = Math.min(lA, lB);
  return (lighter + 0.05) / (darker + 0.05);
}

describe('§3.5 無障礙基線：對比配對表全數 ≥ 4.5:1', () => {
  const WCAG_AA_TEXT_MIN = 4.5;

  const pairs: ReadonlyArray<readonly [string, string, string]> = [
    ['--ink-900 on --washi-100', TOKENS.color.ink900, TOKENS.color.washi100],
    ['--ink-500 on --washi-100', TOKENS.color.ink500, TOKENS.color.washi100],
    ['--ink-300 on --washi-100', TOKENS.color.ink300, TOKENS.color.washi100],
    ['--accent-vermilion on --washi-100', TOKENS.color.accentVermilion, TOKENS.color.washi100],
    ['--accent-moss on --washi-100', TOKENS.color.accentMoss, TOKENS.color.washi100],
    ['--accent-indigo on --washi-100', TOKENS.color.accentIndigo, TOKENS.color.washi100],
    ['--accent-gold-text on --washi-100', TOKENS.color.accentGoldText, TOKENS.color.washi100],
    ['--washi-100 on --ink-900', TOKENS.color.washi100, TOKENS.color.ink900],
  ];

  it.each(pairs)('%s 對比 ≥ 4.5:1', (_label, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(WCAG_AA_TEXT_MIN);
  });

  it('全部配對皆通過（彙總斷言，避免任一組被個別跳過）', () => {
    const results = pairs.map(([label, fg, bg]) => ({ label, ratio: contrastRatio(fg, bg) }));
    const failing = results.filter((r) => r.ratio < WCAG_AA_TEXT_MIN);
    expect(failing).toEqual([]);
  });

  it('--accent-gold／-bright 系列不在文字安全配對表內（12 §3.5 第 3 點：僅裝飾，不得作和紙底文字）', () => {
    const textSafeKeys = pairs.map(([label]) => label);
    expect(
      textSafeKeys.some(
        (label) => label.includes('accent-gold ') || label.includes('accent-gold-bright'),
      ),
    ).toBe(false);
  });
});
