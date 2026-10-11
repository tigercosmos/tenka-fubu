import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const titleCss = readFileSync(
  new URL('../../src/ui/screens/TitleScreen.module.css', import.meta.url),
  'utf8',
);

function declarations(selector: string): string {
  const start = titleCss.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Missing CSS rule ${selector}`);
  const end = titleCss.indexOf('}', start);
  return titleCss.slice(start, end);
}

it('source contract: the title hero row retains its intrinsic minimum at enlarged UI scale, not native geometry proof', () => {
  // At supported 1.5 scale, 28rem is 672px. The 720px screen has less than
  // 618px after vertical padding even before its footer, so a zero-minimum
  // 1fr track can put that footer within the overflowing hero's minimum box.
  const heroMinimum = 28 * 16 * 1.5;
  const viewportAfterPadding = 720 - 2 * (1280 * 0.04);
  expect(heroMinimum).toBeGreaterThan(viewportAfterPadding);
  expect(declarations('.identity')).toMatch(/min-height:\s*28rem\s*;/);
  expect(declarations('.screen')).toMatch(
    /grid-template-rows:\s*minmax\(min-content,\s*1fr\)\s+auto\s*;/,
  );
});

it('source contract: title overflow remains scrollable and the footer stays in normal grid flow', () => {
  expect(declarations('.screen')).toMatch(/overflow:\s*auto\s*;/);
  expect(declarations('.footer')).toMatch(/grid-column:\s*1\s*\/\s*-1\s*;/);
  expect(declarations('.footer')).not.toMatch(/position:\s*(absolute|fixed)\s*;/);
});
