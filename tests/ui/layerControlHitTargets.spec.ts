import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(
  new URL('../../src/ui/components/LayerControl.module.css', import.meta.url),
  'utf8',
);
const globalCss = readFileSync(new URL('../../src/ui/styles/global.css', import.meta.url), 'utf8');

function declarations(selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Missing CSS rule ${selector}`);
  return css.slice(start, css.indexOf('}', start));
}

function minimumHeightAtScale(selector: string, scale: number): number {
  const rule = declarations(selector);
  const value = /min-height:\s*([^;]+);/.exec(rule)?.[1]?.trim();
  if (value === '2rem') return 2 * 16 * scale;
  if (value === 'max(32px, 2rem)') return Math.max(32, 2 * 16 * scale);
  throw new Error(`Unsupported minimum-height source contract: ${String(value)}`);
}

describe('LayerControl hit-target source contract, not native geometry proof', () => {
  it.each(['.root summary', '.opacity input'])(
    '%s keeps a 32px height floor at supported 80%% scale',
    (selector) => {
      // Local selector specificity wins over the global native-input minimum.
      // Evaluate that declared minimum rather than claiming jsdom lays out CSS.
      expect(minimumHeightAtScale(selector, 0.8)).toBeGreaterThanOrEqual(32);
      expect(minimumHeightAtScale(selector, 1.5)).toBe(48);
    },
  );

  it('retains the global native-input width floor and full-width slider', () => {
    expect(globalCss).toMatch(/input:not\(\[type='hidden'\]\)\s*\{\s*min-width:\s*32px;/);
    expect(declarations('.opacity input')).toMatch(/width:\s*100%\s*;/);
    expect(declarations('.opacity input')).not.toMatch(/min-width:\s*(?!32px)/);
    expect(declarations('.root')).toMatch(/width:\s*15rem\s*;/);
  });
});
