import { describe, expect, it } from 'vitest';
import roster from '../../src/data/scenarios/s1560/batches/officers/tohoku-date.json';
import personas from '../../src/data/scenarios/s1560/personas.json';
import { zOfficersFile } from '../../src/data/schemas/officer';
import { BAL } from '../../src/core/balance';
import { TOHOKU_GEOGRAPHY } from '../../src/data/scenarios/s1560/batches/tohoku-geography';
import { buildTohokuClans } from '../../src/data/scenarios/s1560/batches/tohoku-clans';
import { loadS1560Scenario } from '../../src/data/scenarios/s1560';

const officers = zOfficersFile.parse(roster).officers;
const evidence: Readonly<
  Record<
    string,
    {
      identity: string;
      birthYear: string;
      deathYear: string;
      sources: string[];
      support: string;
      affiliation: string;
      stats: string;
      traits: string;
      rank: string;
      initialPlacement: string;
      debutYear: string;
      isKin: { value: boolean; relation: string; sources: string[] };
    }
  >
> = roster._provenance;
const sources: Readonly<Record<string, string>> = roster._authoring.sources;
// Discover every currently available production/staged roster, including future B9 files.
const otherFiles = import.meta.glob<{ default: unknown }>(
  '../../src/data/scenarios/s1560/{officers,batches/officers}/*.json',
  { eager: true },
);

describe('staged Date25 identities, not national production acceptance', () => {
  it('matches every parsed production Date identity exactly once', async () => {
    const production = (await loadS1560Scenario()).officers.flat();
    for (const officer of officers) {
      expect(
        production.filter(({ id }) => id === officer.id),
        officer.id,
      ).toEqual([officer]);
      expect(
        production.filter(({ name }) => name === officer.name),
        officer.name,
      ).toEqual([officer]);
    }
  });
  it('parses25 distinct identities with all nine canonical people, never alias quota', () => {
    expect(officers).toHaveLength(25);
    expect(new Set(officers.map((o) => o.id)).size).toBe(25);
    expect(new Set(officers.map((o) => o.name)).size).toBe(25);
    for (const slug of [
      'date-harumune',
      'date-terumune',
      'date-sanemoto',
      'oniniwa-yoshinao',
      'endo-motonobu',
      'nakano-munetoki',
      'makino-hisanaka',
      'shiroishi-munetoshi',
      'date-masamune',
    ])
      expect(
        officers.some((o) => o.id === `off.${slug}`),
        slug,
      ).toBe(true);
    for (const id of [
      ...roster._authoring.aliasesNotSeparate,
      ...roster._authoring.excludedIdentities.map((row) => row.id),
    ])
      expect(
        officers.some((o) => o.id === id),
        id,
      ).toBe(false);
    for (const [path, file] of Object.entries(otherFiles)) {
      if (path.endsWith('/tohoku-date.json')) continue;
      const other = zOfficersFile.parse(file.default).officers;
      for (const officer of officers) {
        // A later production copy of this exact staged person is allowed, not another identity.
        const existing = other.find((o) => o.id === officer.id);
        if (existing) expect(existing, path).toEqual(officer);
        expect(
          other.some((o) => o.name === officer.name && o.id !== officer.id),
          path,
        ).toBe(false);
      }
    }
    expect(zOfficersFile.parse(roster)).not.toHaveProperty('_provenance');
  });

  it('separates real identity sources, qualified life dates and authored gameplay', () => {
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
        expect(row[field], officer.id).toMatch(/^authored:/);
      expect(officer.deathYear).toBeGreaterThanOrEqual(1560);
      expect(officer.deathYear).toBeGreaterThan(officer.birthYear);
    }
    expect(evidence['off.shiroishi-munetoshi']).toMatchObject({
      birthYear: 'authored',
      deathYear: 'authored',
      sources: ['shiroishi', 'shiroishiConflict'],
    });
    expect(evidence['off.shiroishi-munetoshi']!.support).toContain('1570');
    expect(roster._authoring.knownBoundaries.join(' ')).toContain('1553');
    expect(evidence['off.makino-hisanaka']!.deathYear).toBe('authored');
    expect(evidence['off.nitta-kagetsuna']!.birthYear).toBe('authored');
  });

  it('defers juveniles and later-attested adults without rewriting historical genpuku', () => {
    for (const officer of officers) {
      const debut = officer.debutYear ?? officer.birthYear + BAL.comingOfAgeAge;
      expect(debut, officer.id).toBeGreaterThanOrEqual(officer.birthYear + BAL.comingOfAgeAge);
      expect(debut, officer.id).toBeLessThanOrEqual(officer.deathYear);
      if (1560 - officer.birthYear < BAL.comingOfAgeAge) expect(debut).toBeGreaterThan(1560);
    }
    expect(officers.filter((o) => o.debutYear! > 1560)).toHaveLength(11);
    expect(officers.find((o) => o.id === 'off.date-masamune')).toMatchObject({
      birthYear: 1567,
      debutYear: 1582,
    });
    expect(officers.find((o) => o.id === 'off.awano-hidemochi')?.debutYear).toBe(1590);
    expect(officers.find((o) => o.id === 'off.nitta-kagetsuna')?.debutYear).toBe(1570);
    expect(officers.find((o) => o.id === 'off.date-tanemune')?.deathYear).toBe(1565);
  });

  it('uses sourced close kin only, no marriage or uncertain Harada lineage inference', () => {
    expect(officers.filter((o) => o.isKin).map((o) => o.id)).toEqual([
      'off.date-terumune',
      'off.date-sanemoto',
      'off.date-masamune',
      'off.date-tanemune',
      'off.date-shigezane',
      'off.rusu-masakage',
      'off.date-kojiro',
    ]);
    for (const officer of officers) {
      const kin = evidence[officer.id]!.isKin;
      expect(kin.value).toBe(officer.isKin);
      if (kin.value) {
        expect(kin.sources.length).toBeGreaterThan(0);
        for (const source of kin.sources) expect(sources[source]).toMatch(/^https:\/\//);
      }
      expect(officer.traits).toEqual([]);
      expect(officer.tactics).toEqual([]);
    }
    expect(officers.find((o) => o.id === 'off.harada-munetoki')?.isKin).toBe(false);
    expect(officers.find((o) => o.id === 'off.koyanagawa-morimune')?.isKin).toBe(false);
  });

  it('closes the real parsed staged Date capital/persona without claiming branch history', () => {
    const clan = buildTohokuClans(TOHOKU_GEOGRAPHY).clans.find((c) => c.id === 'clan.date')!;
    const capital = TOHOKU_GEOGRAPHY.castles.find((c) => c.id === clan.homeCastleId)!;
    expect(clan).toMatchObject({ leaderId: 'off.date-harumune', homeCastleId: 'castle.yonezawa' });
    expect(capital).toMatchObject({ ownerClanId: clan.id, lordId: clan.leaderId });
    expect(personas.personas.some((p) => p.id === clan.personaId)).toBe(true);
    expect(officers.find((o) => o.id === clan.leaderId)).toMatchObject({
      clanId: clan.id,
      locationCastleId: capital.id,
      rank: 'shukuro',
    });
    const owned = new Set(
      TOHOKU_GEOGRAPHY.castles.filter((c) => c.ownerClanId === clan.id).map((c) => c.id),
    );
    for (const officer of officers) {
      expect(officer.clanId).toBe(clan.id);
      expect(owned.has(officer.locationCastleId)).toBe(true);
    }
    expect(roster._authoring.placementBoundaries).toContain('No claimed1560');
  });
});
