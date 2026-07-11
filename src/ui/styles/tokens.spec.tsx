// injectCssVariables() 的 DOM 整合測試（規格：plan/12-ui-components.md §3.1.1；驗收：12-T1）。
//
// 純邏輯（TOKENS 表、hexToNum、40 勢力色公式、對比驗算）見 tests/ui/tokens.spec.ts；
// 本檔只驗證「呼叫 injectCssVariables() 後，:root 上真的可檢得全部 §3.1 變數與 80 個勢力色」
// 這件事本身，故需要真實 DOM，依 17-testing.md §3.2 的 vitest.workspace.ts 規則，
// 需以 `.spec.tsx` 副檔名放在 src/ui/** 下才會落入 `ui`（jsdom）project（core/node project
// 沒有 `document` 全域）。
import { beforeEach, describe, expect, it } from 'vitest';
import { CLAN_COLOR_COUNT, TOKENS, clanColorHex, injectCssVariables } from './tokens';

function rootCustomProperties(): Map<string, string> {
  const style = document.documentElement.style;
  const props = new Map<string, string>();
  for (let i = 0; i < style.length; i += 1) {
    const name = style.item(i);
    if (name.startsWith('--')) {
      props.set(name, style.getPropertyValue(name).trim());
    }
  }
  return props;
}

describe('injectCssVariables — 12-T1 驗收：:root 可檢得全部 §3.1 變數＋80 勢力色', () => {
  beforeEach(() => {
    // 每個 it 前清空，避免前一個測試殘留的 custom properties 互相汙染。
    document.documentElement.removeAttribute('style');
  });

  it('注入後 :root 恰好有 140 個 custom properties（60 基礎 token ＋ 80 勢力色）', () => {
    injectCssVariables();
    const props = rootCustomProperties();
    expect(props.size).toBe(60 + 2 * CLAN_COLOR_COUNT);
  });

  it('§3.1 各節代表性變數皆可由 :root 讀回正確值', () => {
    injectCssVariables();
    const props = rootCustomProperties();
    expect(props.get('--ink-900')).toBe('#14120e');
    expect(props.get('--washi-100')).toBe('#f5efe0');
    expect(props.get('--font-family-serif')).toContain('Noto Serif TC');
    expect(props.get('--space-4')).toBe('16px');
    expect(props.get('--radius-md')).toBe('4px');
    expect(props.get('--shadow-focus')).toContain('var(--accent-gold)');
    expect(props.get('--border-strong')).toBe('2px solid var(--ink-700)');
    expect(props.get('--z-hud')).toBe('100');
    expect(props.get('--duration-focus')).toBe('400ms');
    expect(props.get('--ease-out')).toBe('cubic-bezier(0.22, 1, 0.36, 1)');
  });

  it('--clan-00..--clan-39 與 -bright 變體共 80 個，值與 clanColorHex 一致', () => {
    injectCssVariables();
    const props = rootCustomProperties();
    for (let index = 0; index < CLAN_COLOR_COUNT; index += 1) {
      const label = String(index).padStart(2, '0');
      expect(props.get(`--clan-${label}`)).toBe(clanColorHex(index));
      expect(props.get(`--clan-${label}-bright`)).toBe(clanColorHex(index, true));
    }
  });

  it('重複呼叫是冪等的（同一份值覆蓋，不累積出多餘的 custom properties）', () => {
    injectCssVariables();
    injectCssVariables();
    const props = rootCustomProperties();
    expect(props.size).toBe(60 + 2 * CLAN_COLOR_COUNT);
    expect(props.get('--ink-900')).toBe(TOKENS.color.ink900);
  });
});
