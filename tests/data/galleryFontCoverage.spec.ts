import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { collectRequiredChars, extractStringLiteralTexts } from '../../tools/font-charset';

it('includes developer gallery JSX text and fixture labels in the font subset', () => {
  const required = collectRequiredChars();
  for (const file of ['ComponentGallery.tsx', 'galleryFixture.ts']) {
    const source = readFileSync(`src/ui/dev/${file}`, 'utf8');
    for (const text of extractStringLiteralTexts(source, file))
      for (const char of text) expect(required.chars.has(char), `${file}: ${char}`).toBe(true);
  }
  expect(extractStringLiteralTexts('<p>開發展示</p>', 'example.tsx')).toContain('開發展示');
});
