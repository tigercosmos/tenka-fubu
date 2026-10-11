import { describe, expect, it } from 'vitest';
import catalog from '../../src/data/scenarios/s1560/events.json';
import {
  checkWorld,
  filterWorldByRegions,
  loadRawScenario,
  parseScenario,
} from '../../tools/validate';

function rawScenario() {
  const loaded = loadRawScenario('s1560');
  if (loaded === null) throw new Error('Expected real s1560 scenario files');
  expect(loaded.violations).toEqual([]);
  return loaded.raw;
}

describe('canonical event catalog in scenario data validation', () => {
  it('parses the authored catalog without treating it as the legacy event DSL', () => {
    const parsed = parseScenario(rawScenario());
    expect(parsed.violations).toEqual([]);
    expect(parsed.world.events).toHaveLength(21);
    expect(
      parsed.world.events.filter((event) => 'kind' in event && event.kind === 'historical'),
    ).toHaveLength(15);
    expect(
      parsed.world.events.filter((event) => 'kind' in event && event.kind === 'generic'),
    ).toHaveLength(6);
    expect(parsed.world.events.map((event) => event.id)).toEqual(
      catalog.events.map((event) => event.id),
    );
  });

  it('closes all catalog references and passes complete national validation', () => {
    const { world } = parseScenario(rawScenario());
    const violations = checkWorld(world);
    expect(
      violations.some(
        (entry) => entry.check === 'V3' && entry.message.includes('off.akechi-mitsuhide'),
      ),
    ).toBe(false);
    expect(
      violations.some((entry) => entry.check === 'V3' && entry.message.includes('clan.mori')),
    ).toBe(false);
    expect(
      violations.some(
        (entry) => entry.check === 'V3' && entry.message.includes('off.mori-takamoto'),
      ),
    ).toBe(false);
    for (const id of ['off.ashikaga-yoshiaki', 'off.oda-nobutada'])
      expect(violations.some((entry) => entry.check === 'V3' && entry.message.includes(id))).toBe(
        false,
      );
    expect(violations.filter((entry) => entry.check === 'V3')).toEqual([]);
    expect(violations).toEqual([]);
    expect(
      violations.some((entry) => entry.check === 'V3' && entry.message.includes('clan.takeda')),
    ).toBe(false);
    const regional = filterWorldByRegions(world, ['tokai', 'kinki']);
    expect(regional.events.length).toBeLessThan(world.events.length);
    expect(
      checkWorld(regional, { regions: ['tokai', 'kinki'] }).filter((entry) => entry.check === 'V3'),
    ).toEqual([]);
  });

  it('rejects malformed canonical effects and conditions rather than falling back to permissive parsing', () => {
    for (const field of ['effects', 'conditions'] as const) {
      const raw = rawScenario();
      const malformed = structuredClone(catalog);
      if (field === 'effects') malformed.events[0]!.effects = [{ op: 'unknown' }] as never;
      else malformed.events[0]!.trigger.conditions = [{ kind: 'unknown' }] as never;
      const result = parseScenario({ ...raw, events: malformed });
      expect(result.violations.some((entry) => entry.check === 'V1')).toBe(true);
      expect(result.world.events).toEqual([]);
    }
  });
});
