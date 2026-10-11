import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UI_THEME } from '../../src/ui/styles/tokens';

const css = (name: string) =>
  readFileSync(new URL(`../../src/ui/screens/${name}.module.css`, import.meta.url), 'utf8');

function declarations(source: string, selector: string): string {
  return [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((match) =>
      match[1]!
        .split(',')
        .map((part) => part.trim())
        .includes(selector),
    )
    .map((match) => match[2])
    .join('\n');
}

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}

function contrast(first: string, second: string): number {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

// Static selector/token contracts only: not a native computed-style or layout proof.
describe('secondary command-surface focus contracts', () => {
  it('uses an inset ivory focus ring on the command monthly continue button', () => {
    const source = css('MonthSummaryModal');
    const block = declarations(source, '.continue:focus-visible');
    expect(block).toContain('var(--text-inverse)');
    expect(block).toContain('outline-offset: -2px');
    const button = declarations(source, '.continue');
    expect(button).toContain('background: var(--surface-command)');
    const hover = declarations(source, '.continue:hover');
    expect(hover).toContain('background: var(--surface-command-raised)');
    for (const background of ['--surface-command', '--surface-command-raised'] as const) {
      expect(contrast(UI_THEME['--text-inverse'], UI_THEME[background])).toBeGreaterThanOrEqual(3);
    }
  });

  it('anchors Taimei paper-detail focus above shared action selector specificity', () => {
    const source = css('TaimeiPanel');
    // Three classes/pseudo-classes outrank shared .action button:focus-visible (two).
    const block = declarations(source, '.anchor .detail button:focus-visible');
    expect(block).toContain('var(--brand-gold)');
    const detail = declarations(source, '.detail');
    expect(detail).toContain('background: var(--surface-raised)');
    expect(contrast(UI_THEME['--brand-gold'], UI_THEME['--surface-raised'])).toBeGreaterThanOrEqual(
      3,
    );
  });

  it.each(['--surface-command', '--surface-command-raised'] as const)(
    'provides at least 3:1 focus contrast against %s with actual theme tokens',
    (background) => {
      expect(contrast(UI_THEME['--command-gold'], UI_THEME[background])).toBeGreaterThanOrEqual(3);
      // Dark brass is intended for parchment, not the command background.
      expect(contrast(UI_THEME['--brand-gold'], UI_THEME[background])).toBeLessThan(3);
    },
  );
});
