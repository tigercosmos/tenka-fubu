import { describe, expect, it } from 'vitest';
import roster from '../../src/data/scenarios/s1560/batches/officers/kyushu-otomo.json';
import shimazu from '../../src/data/scenarios/s1560/batches/officers/kyushu-shimazu.json';
import tokai from '../../src/data/scenarios/s1560/officers/tokai.json';
import kinki from '../../src/data/scenarios/s1560/officers/kinki.json';
import kanto from '../../src/data/scenarios/s1560/officers/kanto.json';
import koshinetsu from '../../src/data/scenarios/s1560/officers/koshinetsu.json';
import hokuriku from '../../src/data/scenarios/s1560/officers/hokuriku.json';
import chugoku from '../../src/data/scenarios/s1560/officers/chugoku.json';
import shikoku from '../../src/data/scenarios/s1560/officers/shikoku.json';
import { zOfficersFile } from '../../src/data/schemas/officer';
import { BAL } from '../../src/core/balance';
import { KYUSHU_GEOGRAPHY } from '../../src/data/scenarios/s1560/batches/kyushu-geography';
import { KYUSHU_CLANS } from '../../src/data/scenarios/s1560/batches/kyushu-clans';

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

describe('staged Ōtomo named roster, not production acceptance', () => {
  it('schema-parses25 distinct people and every prescribed core identity without aliases', () => {
    expect(officers).toHaveLength(25);
    expect(new Set(officers.map((o) => o.id)).size).toBe(25);
    expect(new Set(officers.map((o) => o.name)).size).toBe(25);
    for (const id of [
      'otomo-yoshishige',
      'bekki-akitsura',
      'usuki-akihaya',
      'yoshihiro-akitada',
      'yoshioka-nagamasu',
      'shiga-chikamori',
      'tawara-chikakata',
      'saiki-korenori',
      'takahashi-akitane',
      'ichimanda-akizane',
      'tsunokuma-sekiso',
      'yoshihiro-shigenobu',
    ])
      expect(
        officers.some((o) => o.id === `off.${id}`),
        id,
      ).toBe(true);
    for (const alias of [
      'tachibana-dosetsu',
      'yoshioka-sokan',
      'tawara-shonin',
      'saiki-soten',
      'kutami-soreki',
      'shiga-chikayoshi',
    ])
      expect(
        officers.some((o) => o.id === `off.${alias}`),
        alias,
      ).toBe(false);
    const otherIds = new Set(
      [tokai, kinki, kanto, koshinetsu, hokuriku, chugoku, shikoku, shimazu].flatMap((file) =>
        file.officers.map((o) => o.id),
      ),
    );
    for (const officer of officers) expect(otherIds.has(officer.id), officer.id).toBe(false);
    expect(zOfficersFile.parse(roster)).not.toHaveProperty('_provenance');
    expect(roster._authoring.status).toContain('not part of production');
  });

  it('records resolvable identity sources separately from every authored gameplay field', () => {
    expect(Object.keys(evidence).sort()).toEqual(officers.map((o) => o.id).sort());
    for (const officer of officers) {
      const row = evidence[officer.id]!;
      expect(row.identity).toBe('source-qualified');
      expect(row.sources.length).toBeGreaterThan(0);
      for (const key of row.sources) expect(sources[key], key).toMatch(/^https:\/\//);
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
      expect(row.note).toContain('設計界線');
      expect(officer.deathYear).toBeGreaterThan(officer.birthYear);
      expect(officer.deathYear).toBeGreaterThanOrEqual(1561);
      expect(officer.tactics).toEqual([]);
    }
    expect(evidence['off.bekki-akitsura']!.birthYear).toBe('source-qualified');
    expect(evidence['off.yoshihiro-shigenobu']!.birthYear).toBe('authored');
    expect(evidence['off.otomo-yoshimune']!.deathYear).toBe('authored');
    expect(roster._authoring.sourceBoundaries).toContain('not primary');
  });

  it('keeps juveniles, future births and later service unavailable in1560', () => {
    for (const officer of officers) {
      const debut = officer.debutYear ?? officer.birthYear + BAL.comingOfAgeAge;
      expect(debut, officer.id).toBeGreaterThanOrEqual(officer.birthYear + BAL.comingOfAgeAge);
      expect(debut, officer.id).toBeLessThanOrEqual(officer.deathYear);
      if (1560 - officer.birthYear < BAL.comingOfAgeAge) expect(debut).toBeGreaterThan(1560);
    }
    for (const [id, debutYear] of [
      ['otomo-yoshimune', 1573],
      ['yoshihiro-muneyuki', 1579],
      ['takahashi-joun', 1563],
      ['tachibana-muneshige', 1582],
      ['shiga-chikatsugu', 1581],
      ['saiki-korenori', 1569],
      ['tawara-chikakata', 1571],
      ['yoshioka-akioki', 1571],
      ['shiga-chikanori', 1571],
      ['kutami-akiyasu', 1571],
      ['ono-shigeyuki', 1561],
    ] as const)
      expect(officers.find((o) => o.id === `off.${id}`)?.debutYear).toBe(debutYear);
    expect(officers.filter((o) => o.debutYear! > 1560)).toHaveLength(11);
    expect(evidence['off.saiki-korenori']!.note).toContain('1569');
  });

  it('limits one-clan kinship to sourced direct family and the prescribed trait', () => {
    expect(officers.filter((o) => o.isKin).map((o) => o.id)).toEqual(['off.otomo-yoshimune']);
    expect(evidence['off.otomo-yoshimune']!.isKin.sources).toEqual(['retainers']);
    for (const officer of officers) expect(evidence[officer.id]!.isKin.value).toBe(officer.isKin);
    expect(officers.filter((o) => o.traits.length).map((o) => [o.id, o.traits])).toEqual([
      ['off.bekki-akitsura', ['trait.gunshin']],
    ]);
  });

  it('closes parsed staged clan capital and lord references without activating a loader', () => {
    const otomo = KYUSHU_CLANS.clans.find((c) => c.id === 'clan.otomo')!;
    const capital = KYUSHU_GEOGRAPHY.castles.find((c) => c.id === 'castle.funai')!;
    expect(otomo).toMatchObject({ leaderId: 'off.otomo-yoshishige', homeCastleId: 'castle.funai' });
    expect(capital).toMatchObject({ ownerClanId: 'clan.otomo', lordId: 'off.otomo-yoshishige' });
    expect(officers.find((o) => o.id === otomo.leaderId)).toMatchObject({
      clanId: otomo.id,
      locationCastleId: capital.id,
      rank: 'shukuro',
      birthYear: 1530,
      deathYear: 1587,
    });
    for (const officer of officers) {
      expect(officer.clanId).toBe(otomo.id);
      expect(officer.locationCastleId).toBe(capital.id);
    }
  });
});
