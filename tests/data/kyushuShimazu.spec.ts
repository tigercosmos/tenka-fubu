import { describe, expect, it } from 'vitest';
import roster from '../../src/data/scenarios/s1560/batches/officers/kyushu-shimazu.json';
import tokai from '../../src/data/scenarios/s1560/officers/tokai.json';
import kinki from '../../src/data/scenarios/s1560/officers/kinki.json';
import kanto from '../../src/data/scenarios/s1560/officers/kanto.json';
import koshinetsu from '../../src/data/scenarios/s1560/officers/koshinetsu.json';
import hokuriku from '../../src/data/scenarios/s1560/officers/hokuriku.json';
import chugoku from '../../src/data/scenarios/s1560/officers/chugoku.json';
import shikoku from '../../src/data/scenarios/s1560/officers/shikoku.json';
import { zOfficersFile } from '../../src/data/schemas/officer';
import { BAL } from '../../src/core/balance';

const officers = zOfficersFile.parse(roster).officers;
const evidence: Readonly<
  Record<
    string,
    {
      identity: string;
      sources: string[];
      birthYear: string;
      deathYear: string;
      affiliation: string;
      stats: string;
      traits: string;
      rank: string;
      initialPlacement: string;
      debutYear: string;
      note: string;
      isKin: { value: boolean; relation: string; sources: string[] };
    }
  >
> = roster._provenance;
const sources: Readonly<Record<string, string>> = roster._authoring.sources;

describe('staged Shimazu named roster, not production acceptance', () => {
  it('schema-parses twenty-five distinct identities including all twelve prescribed core people', () => {
    expect(officers).toHaveLength(25);
    expect(new Set(officers.map((officer) => officer.id)).size).toBe(25);
    expect(new Set(officers.map((officer) => officer.name)).size).toBe(25);
    const existing = new Set(
      [tokai, kinki, kanto, koshinetsu, hokuriku, chugoku, shikoku].flatMap((file) =>
        file.officers.map((officer) => officer.id),
      ),
    );
    for (const officer of officers) {
      expect(existing.has(officer.id), officer.id).toBe(false);
      expect(officer.clanId).toBe('clan.shimazu');
      expect(officer.locationCastleId).toBe('castle.uchijo');
    }
    for (const id of [
      'shimazu-takahisa',
      'shimazu-yoshihisa',
      'shimazu-yoshihiro',
      'shimazu-toshihisa',
      'shimazu-iehisa',
      'shimazu-tadayoshi',
      'ijuin-tadaaki',
      'ijuin-tadaao',
      'kabayama-yoshihisa',
      'tanegashima-tokitaka',
      'niiro-tadamoto',
      'kawakami-hisaaki',
    ])
      expect(
        officers.some((officer) => officer.id === `off.${id}`),
        id,
      ).toBe(true);
    expect(zOfficersFile.parse(roster)).not.toHaveProperty('_provenance');
    expect(roster._authoring.status).toContain('not part of production');
  });

  it('provides resolvable source keys and field-specific design boundaries for every identity', () => {
    expect(Object.keys(evidence).sort()).toEqual(officers.map((officer) => officer.id).sort());
    for (const officer of officers) {
      const row = evidence[officer.id]!;
      expect(row.sources.length, officer.id).toBeGreaterThan(0);
      for (const source of row.sources) expect(sources[source], source).toMatch(/^https:\/\//);
      for (const field of ['birthYear', 'deathYear'] as const)
        expect(['verified', 'source-qualified', 'authored']).toContain(row[field]);
      for (const field of [
        'affiliation',
        'stats',
        'traits',
        'rank',
        'initialPlacement',
        'debutYear',
      ] as const)
        expect(row[field], `${officer.id}:${field}`).toMatch(/^authored:/);
      expect(row.identity).toBe('source-qualified');
      expect(row.note).toContain('設計界線');
      expect(officer.deathYear).toBeGreaterThan(officer.birthYear);
      expect(officer.deathYear).toBeGreaterThanOrEqual(1561);
      expect(officer.tactics).toEqual([]);
    }
    expect(evidence['off.ijuin-tadaaki']!.birthYear).toBe('authored');
    expect(evidence['off.ijuin-tadaao']!.deathYear).toBe('authored');
    expect(evidence['off.kabayama-yoshihisa']!.deathYear).toBe('authored');
    expect(roster._authoring.sourceBoundaries).toContain('qualified secondary');
  });

  it('retains distinct Ijuin generations and excludes aliases and out-of-era namesakes', () => {
    for (const id of ['tadaaki', 'tadaao', 'tadamune', 'tadazane'])
      expect(officers.filter((officer) => officer.id === `off.ijuin-${id}`)).toHaveLength(1);
    for (const { id } of roster._authoring.identityExclusions)
      expect(officers.some((officer) => officer.id === id)).toBe(false);
    expect(officers.find((officer) => officer.id === 'off.tanegashima-hisatoki')).toMatchObject({
      birthYear: 1568,
      deathYear: 1611,
      debutYear: 1583,
    });
    expect(officers.find((officer) => officer.id === 'off.niiro-tadamoto')).toMatchObject({
      birthYear: 1526,
      deathYear: 1610,
    });
  });

  it('does not make juvenile or later-attested officers initially eligible', () => {
    const deferred = officers.filter(
      (officer) => (officer.debutYear ?? officer.birthYear + BAL.comingOfAgeAge) > 1560,
    );
    expect(deferred).toHaveLength(9);
    for (const officer of officers) {
      const debut = officer.debutYear ?? officer.birthYear + BAL.comingOfAgeAge;
      expect(debut).toBeGreaterThanOrEqual(officer.birthYear + BAL.comingOfAgeAge);
      expect(debut).toBeLessThanOrEqual(officer.deathYear);
      if (1560 - officer.birthYear < BAL.comingOfAgeAge) expect(debut).toBeGreaterThan(1560);
    }
    expect(roster._authoring.scope).toContain('not25 active1560');
  });

  it('marks only sourced close family kin and prescribed gameplay traits', () => {
    expect(
      officers
        .filter((officer) => officer.isKin)
        .map((officer) => officer.id)
        .sort(),
    ).toEqual(
      [
        'off.shimazu-yoshihisa',
        'off.shimazu-yoshihiro',
        'off.shimazu-toshihisa',
        'off.shimazu-iehisa',
        'off.shimazu-tadayoshi',
        'off.shimazu-tadamasa',
        'off.shimazu-mochihisa',
        'off.shimazu-tadanaga',
      ].sort(),
    );
    for (const officer of officers.filter((candidate) => candidate.isKin)) {
      const kin = evidence[officer.id]!.isKin;
      expect(kin.value).toBe(true);
      expect(kin.relation.length).toBeGreaterThan(0);
      expect(kin.sources.length).toBeGreaterThan(0);
      for (const source of kin.sources) expect(sources[source]).toMatch(/^https:\/\//);
    }
    expect(
      officers
        .filter((officer) => officer.traits.length > 0)
        .map((officer) => [officer.id, officer.traits]),
    ).toEqual([
      ['off.shimazu-yoshihiro', ['trait.gunshin']],
      ['off.tanegashima-tokitaka', ['trait.teppo']],
    ]);
    expect(officers.find((officer) => officer.id === 'off.shimazu-yoshitora')!.isKin).toBe(false);
  });
});
