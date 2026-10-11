import { describe, expect, it } from 'vitest';
import roster from '../../src/data/scenarios/s1560/batches/officers/chugoku.json';
import production from '../../src/data/scenarios/s1560/officers/chugoku.json';
import yamanaPatch from '../../src/data/scenarios/s1560/batches/chugoku-yamana.json';
import tokai from '../../src/data/scenarios/s1560/officers/tokai.json';
import kinki from '../../src/data/scenarios/s1560/officers/kinki.json';
import kanto from '../../src/data/scenarios/s1560/officers/kanto.json';
import koshinetsu from '../../src/data/scenarios/s1560/officers/koshinetsu.json';
import hokuriku from '../../src/data/scenarios/s1560/officers/hokuriku.json';
import { zOfficer, zOfficersFile } from '../../src/data/schemas/officer';
import { TRAITS } from '../../src/core/traits';
import type { TraitId } from '../../src/core/state/ids';

const parsed = () => zOfficersFile.parse(roster).officers;

describe('staged Chugoku named officers', () => {
  it('stages the prescribed Inaba retainer in Kinki without adding a duplicate Chugoku Yamana roster', () => {
    expect(yamanaPatch.rosterRegion).toBe('kinki');
    expect(yamanaPatch.relocations).toEqual([]);
    const added = yamanaPatch.newOfficers.map((officer) => zOfficer.parse(officer));
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      id: 'off.takeda-takanobu',
      clanId: 'clan.yamana',
      locationCastleId: 'castle.tottori',
      isKin: false,
    });
    expect(
      kinki.officers
        .filter((officer) => officer.id === added[0]!.id)
        .map((officer) => zOfficer.parse(officer)),
    ).toEqual(added);
    expect(parsed().some((officer) => officer.id === added[0]!.id)).toBe(false);
    expect(yamanaPatch._provenance['off.takeda-takanobu'].birthYear).toBe('authored');
    expect(yamanaPatch._provenance['off.takeda-takanobu'].deathYear).toBe('source-qualified');
    expect(yamanaPatch._authoring.chronologyBoundary).toContain(
      'not a conclusively established death date',
    );
  });
  it('provides the D22 sixty-nine named people without duplicating five loaded regions', () => {
    expect(zOfficersFile.parse(roster).region).toBe('chugoku');
    const officers = parsed();
    expect(zOfficersFile.parse(production)).toEqual(zOfficersFile.parse(roster));
    expect(officers).toHaveLength(69);
    expect(new Set(officers.map((officer) => officer.id)).size).toBe(69);
    const loaded = new Set(
      [tokai, kinki, kanto, koshinetsu, hokuriku].flatMap((file) =>
        file.officers.map((officer) => officer.id),
      ),
    );
    for (const officer of officers) expect(loaded.has(officer.id), officer.id).toBe(false);
    for (const [clan, count] of [
      ['mori', 35],
      ['amago', 18],
      ['uragami', 8],
      ['akamatsu', 8],
    ] as const)
      expect(officers.filter((officer) => officer.clanId === `clan.${clan}`)).toHaveLength(count);
    expect(officers.some((officer) => officer.clanId === 'clan.yamana')).toBe(false);
    expect(roster._authoring.status).toContain('not part of the production');
  });

  it('retains explicit identity, numeric uncertainty and source boundaries for every person', () => {
    const evidence = roster._provenance as Record<
      string,
      { birthYear: string; deathYear: string; sources: string[]; note: string }
    >;
    const sources = roster._authoring.sources as Record<string, string>;
    expect(Object.keys(evidence).sort()).toEqual(
      parsed()
        .map((officer) => officer.id)
        .sort(),
    );
    for (const officer of parsed()) {
      const record = evidence[officer.id]!;
      expect(record.sources.length, officer.id).toBeGreaterThan(0);
      for (const source of record.sources)
        expect(sources[source], `${officer.id}:${source}`).toMatch(/^https:\/\//);
      expect(['authored', 'verified', 'source-qualified']).toContain(record.birthYear);
      expect(['authored', 'verified', 'source-qualified']).toContain(record.deathYear);
      expect(record.note).toContain('設計');
      expect(officer.deathYear).toBeGreaterThan(officer.birthYear);
      expect(officer.deathYear).toBeGreaterThanOrEqual(1560);
    }
    expect(zOfficersFile.parse(roster)).not.toHaveProperty('_provenance');
    expect(roster._authoring.sourceBoundaries).toContain('not official primary');
    expect(roster._authoring.affiliationBoundaries).toContain(
      'not assertions of direct Okishio service',
    );
  });

  it('preserves canonical event IDs, main leaders, and the source-corrected Shiji identity', () => {
    const officers = parsed();
    for (const [clan, leader, castle] of [
      ['mori', 'mori-motonari', 'yoshida-koriyama'],
      ['amago', 'amago-haruhisa', 'gassan-toda'],
      ['uragami', 'uragami-munekage', 'tenjinyama'],
      ['akamatsu', 'akamatsu-harumasa', 'okishio'],
    ])
      expect(officers.find((officer) => officer.id === `off.${leader}`)).toMatchObject({
        clanId: `clan.${clan}`,
        locationCastleId: `castle.${castle}`,
      });
    expect(officers.find((officer) => officer.id === 'off.mori-takamoto')).toMatchObject({
      birthYear: 1523,
      deathYear: 1563,
    });
    expect(officers.find((officer) => officer.id === 'off.shiji-motoyasu')?.name).toBe('志道元保');
    expect(officers.some((officer) => officer.id === 'off.shiji-hiroyoshi')).toBe(false);
    expect(roster._authoring.identityExclusions[0]).toMatchObject({
      id: 'off.shiji-hiroyoshi',
      sources: ['moriLocalHouses', 'shijiDeathSecondary'],
    });
    expect(roster._authoring.identityExclusions[0]!.institutionalSupport).toContain(
      'does not itself verify1557 death',
    );
    expect(roster._authoring.identityExclusions[0]!.reason).toContain('birthYear>=1470');
  });

  it('defers juveniles and later-attested personnel without inventing initial service', () => {
    const officers = parsed();
    for (const [id, debutYear] of [
      ['mori-terumoto', 1568],
      ['amago-katsuhisa', 1568],
      ['amago-hidehisa', 1569],
      ['kuroda-yoshitaka', 1561],
      ['ihara-motonao', 1583],
    ] as const) {
      const officer = officers.find((candidate) => candidate.id === `off.${id}`)!;
      expect(officer.debutYear).toBe(debutYear);
      expect(debutYear).toBeGreaterThan(1560);
      expect(debutYear).toBeGreaterThanOrEqual(officer.birthYear + 15);
    }
    expect(officers.find((officer) => officer.id === 'off.amago-haruhisa')!.deathYear).toBe(1561);
    expect(roster._provenance['off.amago-haruhisa'].deathYear).toBe('source-qualified');
  });

  it('uses only explicit leader-family relations and canonical trait IDs without tactic bypasses', () => {
    const officers = parsed();
    expect(
      officers
        .filter((officer) => officer.isKin)
        .map((officer) => officer.id)
        .sort(),
    ).toEqual(
      [
        'off.mori-takamoto',
        'off.kikkawa-motoharu',
        'off.kobayakawa-takakage',
        'off.mori-terumoto',
        'off.amago-yoshihisa',
        'off.akamatsu-yoshisuke',
      ].sort(),
    );
    const evidence = roster._provenance as Record<
      string,
      { isKin?: { value: boolean; relation: string; sources: string[] } }
    >;
    for (const officer of officers) {
      if (officer.isKin) {
        expect(evidence[officer.id]?.isKin?.value).toBe(true);
        expect(evidence[officer.id]?.isKin?.relation.length).toBeGreaterThan(0);
        expect(evidence[officer.id]?.isKin?.sources.length).toBeGreaterThan(0);
      }
      for (const traitId of officer.traits)
        expect(TRAITS[traitId as TraitId], traitId).toBeDefined();
      expect(officer.tactics).toEqual([]);
    }
    expect(officers.find((officer) => officer.id === 'off.murakami-takeyoshi')!.traits).toContain(
      'trait.kaizoku',
    );
    expect(officers.find((officer) => officer.id === 'off.ukita-naoie')!.traits).toContain(
      'trait.boshin',
    );
  });
});
