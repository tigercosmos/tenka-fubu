import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('war-room HUD source presentation contract (not native geometry)', () => {
  it('uses a restrained token-backed command frame instead of a raised gradient', () => {
    const css = readFileSync('src/ui/screens/MainScreen.module.css', 'utf8');
    expect(css).toContain('background: var(--surface-command);');
    expect(css).not.toContain('linear-gradient(');
    expect(css).toContain('height: max(40px, 3rem)');
    expect(css).toContain('min-height: 32px');
    expect(css).toContain('overflow-y: auto');
  });
  it('separates resource headings from tabular values without suppressing information', () => {
    const css = readFileSync('src/ui/components/ResourceBar/ResourceBar.module.css', 'utf8');
    expect(css).toContain('letter-spacing: 0.055em');
    expect(css).toContain('font-variant-numeric: tabular-nums');
    expect(css).toContain('color: var(--text-inverse)');
    expect(css).toContain('font-size: max(12px, var(--font-size-xs))');
  });
  it('gives the castle fact register a paper surface and a separate action register', () => {
    const css = readFileSync('src/ui/components/ContextPanel/ContextPanel.module.css', 'utf8');
    expect(css).toContain('background: var(--surface-base)');
    expect(css).toContain('grid-template-columns: minmax(0, 1fr) minmax(15rem, 35%)');
    expect(css).toContain('min-height: 32px');
    expect(css).toContain('overflow-y: auto');
  });
  it('fits the castle command sheet to content while preserving viewport scrolling', () => {
    const css = readFileSync('src/ui/screens/panels/CastlePanel.module.css', 'utf8');
    expect(css).not.toContain('height: 52.5rem');
    expect(css).toContain('height: auto');
    expect(css).toContain('max-height: calc(100dvh - 4.5rem)');
    expect(css).toContain('overflow: auto');
    expect(css).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
    expect(css).toContain('min-height: max(48px, 3rem)');
  });
});
