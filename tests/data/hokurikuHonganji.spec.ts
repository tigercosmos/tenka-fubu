import { describe, expect, it } from 'vitest';
import patch from '../../src/data/scenarios/s1560/batches/hokuriku-honganji.json';
import kinki from '../../src/data/scenarios/s1560/officers/kinki.json';
import hokuriku from '../../src/data/scenarios/s1560/batches/officers/hokuriku.json';
import { zOfficer } from '../../src/data/schemas/officer';

describe('staged Honganji Kaga authoring patch', () => {
  it('integrates fifteen Honganji officers in Kinki without duplicating Hokuriku', () => {
    expect(patch.rosterRegion).toBe('kinki');
    const original = structuredClone(kinki.officers);
    const newOfficers = patch.newOfficers.map((officer) => zOfficer.parse(officer));
    const officers = kinki.officers.map((officer) => zOfficer.parse(officer));
    for (const added of newOfficers)
      expect(officers.filter((officer) => officer.id === added.id)).toEqual([added]);
    for (const relocation of patch.relocations)
      expect(
        officers.find((officer) => officer.id === relocation.officerId)?.locationCastleId,
      ).toBe(relocation.toCastleId);
    expect(new Set(officers.map((officer) => officer.id)).size).toBe(officers.length);
    expect(officers.filter((officer) => officer.clanId === 'clan.honganji')).toHaveLength(15);
    expect(hokuriku.officers.some((officer) => officer.clanId === 'clan.honganji')).toBe(false);
    expect(kinki.officers).toEqual(original);
    expect(officers.find((officer) => officer.id === 'off.honganji-kennyo')?.locationCastleId).toBe(
      'castle.ishiyama',
    );
    expect(officers.find((officer) => officer.id === 'off.shichiri-yorichika')).toMatchObject({
      name: '七里賴周',
      clanId: 'clan.honganji',
      locationCastleId: 'castle.oyama-gobo',
      birthYear: 1517,
      deathYear: 1580,
    });
  });

  it('changes only Sugiura location and records contested chronology rather than false verification', () => {
    expect(patch.relocations).toEqual([
      {
        officerId: 'off.sugiura-gennin',
        fromCastleId: 'castle.ishiyama',
        toCastleId: 'castle.daishoji',
      },
    ]);
    expect(patch._authoring.chronologyBoundary).toContain('death1576 conflicts with1577');
    expect(patch._provenance['off.shichiri-yorichika'].deathYear).toBe('authored');
    expect(patch._provenance['off.shichiri-yorichika'].birthYear).toBe('source-qualified');
    expect(patch.newOfficers[0]!.deathYear).toBeGreaterThan(1577);
    expect(patch._provenance['off.sugiura-gennin'].note).toContain('僅改駐在');
    const sources = patch._authoring.sources as Record<string, string>;
    for (const evidence of Object.values(patch._provenance))
      for (const source of evidence.sources) expect(sources[source]).toMatch(/^https:\/\//);
  });
});
