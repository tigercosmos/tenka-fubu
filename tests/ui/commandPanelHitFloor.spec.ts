import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { applySettings } from '../../src/app/settings/apply';
import { DEFAULT_SETTINGS } from '../../src/app/settings/schema';
import { UI } from '../../src/ui/uiConstants';

const css = readFileSync(
  new URL('../../src/ui/screens/M6Panel.module.css', import.meta.url),
  'utf8',
);
const controls = css.match(/\.panel button,\s*\.panel select,\s*\.panel input\s*\{([^}]+)\}/)?.[1];
const height = controls?.match(/min-height:\s*([^;]+);/)?.[1]?.trim();

/** Bounded source-contract evaluation, not a browser layout or painted hit-area assertion. */
function pixels(expression: string, rootPixels: number): number {
  const rem = expression.match(/^(\d+(?:\.\d+)?)rem$/);
  if (rem) return Number(rem[1]) * rootPixels;
  const floor = expression.match(/^max\(32px,\s*(\d+(?:\.\d+)?)rem\)$/);
  if (floor) return Math.max(32, Number(floor[1]) * rootPixels);
  throw new Error(`Unexpected control min-height contract: ${expression}`);
}

describe('command panel preserves the physical control floor under settings scale', () => {
  it.each([UI.uiScaleMin, 1, UI.uiScaleMax])(
    'retains at least32 CSS pixels at scale%s',
    (uiScale) => {
      const properties = new Map<string, string>();
      applySettings(
        { ...DEFAULT_SETTINGS, uiScale },
        {
          rootStyle: {
            setProperty: (name, value) => {
              if (value === null) properties.delete(name);
              else properties.set(name, value);
            },
          },
        },
      );
      expect(properties.get('font-size')).toBe(`calc(16px * ${uiScale})`);
      expect(controls).toBeDefined();
      expect(height).toBeDefined();
      const actualMinimum = pixels(height!, 16 * uiScale);
      expect(actualMinimum).toBeGreaterThanOrEqual(32);
      expect(actualMinimum).toBe(Math.max(32, 2 * 16 * uiScale));
    },
  );
});
