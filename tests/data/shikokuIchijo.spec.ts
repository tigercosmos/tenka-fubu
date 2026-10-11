import { describe, expect, it } from 'vitest';
import roster from '../../src/data/scenarios/s1560/batches/officers/shikoku-ichijo.json';
import { zOfficersFile } from '../../src/data/schemas/officer';
import { loadS1560Scenario } from '../../src/data/scenarios/s1560';

describe('staged Ichijo named roster and uncertainty', () => {
  it('closes eight distinct identities exactly once in production', async () => {
    const parsed = zOfficersFile.parse(roster);
    expect(parsed.region).toBe('shikoku');
    expect(parsed.officers).toHaveLength(8);
    expect(new Set(parsed.officers.map(({ id }) => id)).size).toBe(8);
    const production = new Set((await loadS1560Scenario()).officers.flat().map(({ id }) => id));
    for (const officer of parsed.officers) {
      expect(production.has(officer.id)).toBe(true);
      expect(officer.clanId).toBe('clan.ichijo');
      expect(officer.locationCastleId).toBe('castle.nakamura');
      expect(officer.isKin).toBe(false);
      expect(officer.traits).toEqual([]);
      expect(officer.tactics).toEqual([]);
      expect(officer.birthYear + 15).toBeLessThanOrEqual(1560);
      expect(officer.deathYear).toBeGreaterThan(1560);
    }
    expect(parsed).not.toHaveProperty('_provenance');
  });

  it('records independent evidence and exact authored-date classifications for every person', () => {
    const evidence: Record<
      string,
      { birthYear: string; deathYear: string; sources: string[]; note: string }
    > = roster._provenance;
    const sources: Record<string, string> = roster._authoring.sources;
    expect(Object.keys(evidence).sort()).toEqual(roster.officers.map(({ id }) => id).sort());
    for (const officer of roster.officers) {
      const record = evidence[officer.id]!;
      expect(record.sources.length).toBeGreaterThan(0);
      for (const source of record.sources) expect(sources[source]).toMatch(/^https:\/\//);
      expect(record.note).toContain('設計值');
      if (officer.id !== 'off.ichijo-kanesada') {
        expect(record.birthYear).toBe('authored');
        expect(record.deathYear).toBe('authored');
      }
    }
    expect(roster.officers[0]).toMatchObject({
      id: 'off.ichijo-kanesada',
      birthYear: 1543,
      deathYear: 1585,
    });
    expect(roster._provenance['off.ichijo-kanesada']).toMatchObject({
      birthYear: 'verified',
      deathYear: 'verified',
    });
  });

  it('preserves uncertain guardian identity and honorific-only names without fictitious kin', () => {
    expect(roster.officers.find(({ id }) => id === 'off.minamoto-yasumasa')).toMatchObject({
      name: '源康政',
      isKin: false,
    });
    expect(roster._provenance['off.minamoto-yasumasa'].identity).toBe('source-qualified');
    expect(roster._provenance['off.minamoto-yasumasa'].note).toContain('康政か');
    expect(roster._provenance['off.minamoto-yasumasa'].note).toContain(
      '全名、姓氏及血緣未獨立證實',
    );
    expect(roster.officers.slice(4).map(({ name }) => name)).toEqual([
      '為松若狹守',
      '安並和泉守',
      '加久見左衛門尉',
      '江口玄蕃',
    ]);
    expect(roster._authoring.affiliationBoundaries).toContain('does not establish1560');
    expect(roster.officers.some(({ id }) => /fusamoto|fusaie|fusafuyu|naomasa/.test(id))).toBe(
      false,
    );
  });
});
