import { expect, it } from 'vitest';
import { TAIMEI_CATALOG } from '../../src/core/systems/events/taimeiCatalog';
import { collectCatalogChars, collectRequiredChars } from '../../tools/font-charset';

it('includes every Taimei name and description outside the i18n and JSON-name scanners', () => {
  const catalog = collectCatalogChars();
  const required = collectRequiredChars();
  expect(TAIMEI_CATALOG).toHaveLength(8);
  expect(required.breakdown.catalogs).toBe(catalog.size);
  for (const def of TAIMEI_CATALOG)
    for (const text of [def.name, def.description])
      for (const char of text) {
        expect(catalog.has(char), `${def.id}: catalog ${char}`).toBe(true);
        expect(required.chars.has(char), `${def.id}: required ${char}`).toBe(true);
      }
});
