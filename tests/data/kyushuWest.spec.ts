import { describe, expect, it } from 'vitest';
import roster from '../../src/data/scenarios/s1560/batches/officers/kyushu-west.json';
import { zOfficersFile } from '../../src/data/schemas/officer';
import { loadS1560Scenario } from '../../src/data/scenarios/s1560/index';
import { buildGameStateFromScenario } from '../../src/core/state/builder';
import { BAL } from '../../src/core/balance';
import type { ClanId, OfficerId } from '../../src/core/state/ids';
import { SCENARIO_BUNDLE_FIXTURE } from '../fixtures/scenarioBundle';

const officers = zOfficersFile.parse(roster).officers;

describe('staged western Kyushu roster', () => {
  it('has 26 distinct identities and the exact three family counts without production duplicates', async () => {
    expect(officers).toHaveLength(26);
    expect(new Set(officers.map((officer) => officer.id)).size).toBe(26);
    expect(new Set(officers.map((officer) => officer.name)).size).toBe(26);
    for (const [clan, count] of [
      ['ryuzoji', 12],
      ['ito', 8],
      ['sagara', 6],
    ] as const)
      expect(officers.filter((officer) => officer.clanId === `clan.${clan}`)).toHaveLength(count);
    const loaded = await loadS1560Scenario();
    const productionOfficers = loaded.officers.flat();
    for (const officer of officers) {
      expect(
        productionOfficers.filter(({ id }) => id === officer.id),
        officer.id,
      ).toEqual([officer]);
      expect(
        productionOfficers.filter(({ name }) => name === officer.name),
        officer.name,
      ).toEqual([officer]);
    }
    expect(roster._authoring.status).toContain('not part of the production');
    expect(zOfficersFile.parse(roster)).not.toHaveProperty('_provenance');
  });

  it('records independently classified identity evidence and honest authored numeric boundaries', () => {
    const evidence = roster._provenance as Record<
      string,
      {
        birthYear: string;
        deathYear: string;
        sources: string[];
        support: string;
        note: string;
      }
    >;
    const sources = roster._authoring.sources as Record<string, string>;
    const classes = roster._authoring.sourceClasses as Record<string, string>;
    expect(Object.keys(evidence).sort()).toEqual(officers.map((officer) => officer.id).sort());
    expect(Object.keys(classes).sort()).toEqual(Object.keys(sources).sort());
    for (const officer of officers) {
      const entry = evidence[officer.id]!;
      expect(entry.sources.length, officer.id).toBeGreaterThan(0);
      for (const key of entry.sources) {
        expect(sources[key], key).toMatch(/^https:\/\//);
        expect(classes[key]?.length, key).toBeGreaterThan(0);
      }
      expect(['verified', 'source-qualified', 'authored']).toContain(entry.birthYear);
      expect(['verified', 'source-qualified', 'authored']).toContain(entry.deathYear);
      expect(entry.note.toLowerCase(), officer.id).toContain('design');
      expect(entry.support.length).toBeGreaterThan(20);
      expect(officer.birthYear).toBeLessThanOrEqual(1570);
      expect(officer.deathYear).toBeGreaterThanOrEqual(1560);
      expect(officer.deathYear).toBeGreaterThan(officer.birthYear);
      expect(officer.debutYear!).toBeGreaterThanOrEqual(officer.birthYear + BAL.comingOfAgeAge);
      expect(officer.traits).toEqual([]);
      expect(officer.tactics).toEqual([]);
    }
    expect(classes.ochiaiStudy).toBe('prefectural museum research paper');
    expect(classes.azumaDocument).toContain('primary-document');
    expect(classes.yamadaDictionary).toContain('secondary');
    expect(roster._provenance['off.sagara-yoshihi']).toMatchObject({
      birthYear: 'verified',
      deathYear: 'verified',
    });
    expect(officers.find((officer) => officer.id === 'off.sagara-yoshihi')!.birthYear).toBe(1544);
    expect(roster._provenance['off.akaike-nagato'].deathYear).toBe('authored');
  });

  it('preserves the prescribed living core and canonical capital placement', () => {
    for (const [id, clan, castle] of [
      ['ryuzoji-takanobu', 'ryuzoji', 'muranaka'],
      ['nabeshima-naoshige', 'ryuzoji', 'muranaka'],
      ['nodomi-nobukage', 'ryuzoji', 'muranaka'],
      ['ogawa-nobutoshi', 'ryuzoji', 'muranaka'],
      ['ryuzoji-naganobu', 'ryuzoji', 'hasuike'],
      ['hyakutake-tomokane', 'ryuzoji', 'muranaka'],
      ['ito-yoshisuke', 'ito', 'tonokori'],
      ['ito-yoshimasu', 'ito', 'tonokori'],
      ['ito-sukeyasu', 'ito', 'sadowara'],
      ['ochiai-kaneasa', 'ito', 'tonokori'],
      ['sagara-yoshihi', 'sagara', 'hitoyoshi'],
      ['akaike-nagato', 'sagara', 'hitoyoshi'],
      ['fukami-nagatomo', 'sagara', 'hitoyoshi'],
      ['indo-yoriyasu', 'sagara', 'hitoyoshi'],
    ])
      expect(officers.find((officer) => officer.id === `off.${id}`)).toMatchObject({
        clanId: `clan.${clan}`,
        locationCastleId: `castle.${castle}`,
      });
  });

  it('excludes the pre-start deceased person and does not double-count aliases or manufacture kin', () => {
    expect(officers.some((officer) => officer.id === 'off.ogawa-nobuyasu')).toBe(false);
    expect(roster._authoring.excludedIdentities[0]).toMatchObject({
      id: 'off.ogawa-nobuyasu',
      source: 'sagaHistory',
    });
    expect(roster._authoring.excludedIdentities[0]!.reason).toContain('1557');
    expect(roster._authoring.excludedIdentities[0]!.reason).toContain('1558');
    expect(roster._authoring.excludedIdentities[0]!.replacementBoundary).toContain('distinct');
    expect(roster._provenance['off.ogawa-nobutoshi'].support).toContain('Printed 578');
    expect(roster._authoring.aliasBoundaries.join(' ')).toContain('not automatically');
    expect(
      officers
        .filter((officer) => officer.isKin)
        .map((officer) => officer.id)
        .sort(),
    ).toEqual(
      [
        'off.ito-suketaka',
        'off.ito-yoshimasu',
        'off.nabeshima-naoshige',
        'off.ryuzoji-masaie',
        'off.ryuzoji-naganobu',
        'off.ryuzoji-nobukane',
      ].sort(),
    );
    for (const id of [
      'off.ogawa-takezumi',
      'off.ogawa-nobutomo',
      'off.yamada-masatoku',
      'off.ito-sukemasu',
      'off.ito-suketaka-alias',
    ])
      expect(officers.some((officer) => officer.id === id)).toBe(false);
  });

  it.each([
    ['off.ryuzoji-masaie', 1571],
    ['off.eriguchi-nobutsune', 1563],
    ['off.ito-yoshimasu', 1561],
    ['off.ochiai-kaneasa', 1569],
    ['off.yamada-munemasa', 1577],
    ['off.ito-suketaka', 1574],
    ['off.ito-mansho', 1584],
    ['off.fukami-nagatomo', 1567],
  ] as const)('keeps later or juvenile %s unavailable before debut %s', (id, year) => {
    const record = officers.find((officer) => officer.id === id)!;
    expect(record.debutYear).toBe(year);
    const bundle = structuredClone(SCENARIO_BUNDLE_FIXTURE);
    // Only the debut rule is tested against local fixture geography; this is not a joint-world claim.
    bundle.officers[0]!.push({ ...record, clanId: 'clan.alpha', locationCastleId: 'castle.a1' });
    const state = buildGameStateFromScenario(bundle, {
      appVersion: 'test',
      seed: 42,
      playerClanId: 'clan.alpha' as ClanId,
      difficulty: 'normal',
    });
    expect(state.officers[id as OfficerId]!.hasComeOfAge).toBe(false);
    expect(state.officers[id as OfficerId]!.debutYear).toBe(year);
  });
});
