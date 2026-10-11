import { describe, expect, it } from 'vitest';
import roster from '../../src/data/scenarios/s1560/batches/officers/tohoku-other.json';
import date from '../../src/data/scenarios/s1560/batches/officers/tohoku-date.json';
import west from '../../src/data/scenarios/s1560/batches/officers/kyushu-west.json';
import otomo from '../../src/data/scenarios/s1560/batches/officers/kyushu-otomo.json';
import shimazu from '../../src/data/scenarios/s1560/batches/officers/kyushu-shimazu.json';
import { TOHOKU_GEOGRAPHY } from '../../src/data/scenarios/s1560/batches/tohoku-geography';
import { buildTohokuClans } from '../../src/data/scenarios/s1560/batches/tohoku-clans';
import { zOfficersFile } from '../../src/data/schemas/officer';
import { loadS1560Scenario } from '../../src/data/scenarios/s1560/index';
import { buildGameStateFromScenario } from '../../src/core/state/builder';
import { BAL } from '../../src/core/balance';
import type { ClanId, OfficerId } from '../../src/core/state/ids';
import { SCENARIO_BUNDLE_FIXTURE } from '../fixtures/scenarioBundle';

const officers = zOfficersFile.parse(roster).officers;

describe('staged other Tohoku roster', () => {
  it('contains exactly 40 distinct named identities and all four family quotas', () => {
    expect(officers).toHaveLength(40);
    expect(new Set(officers.map(({ id }) => id)).size).toBe(40);
    expect(new Set(officers.map(({ name }) => name)).size).toBe(40);
    for (const [clan, count, home] of [
      ['ashina', 12, 'kurokawa'],
      ['mogami', 10, 'yamagata'],
      ['nanbu', 10, 'sannohe'],
      ['ando', 8, 'hiyama'],
    ] as const) {
      const family = officers.filter(({ clanId }) => clanId === `clan.${clan}`);
      expect(family).toHaveLength(count);
      expect(family.every(({ locationCastleId }) => locationCastleId === `castle.${home}`)).toBe(
        true,
      );
      expect(
        family.filter(
          ({ birthYear, debutYear }) =>
            birthYear + BAL.comingOfAgeAge <= 1560 && debutYear! <= 1560,
        ).length,
      ).toBeGreaterThanOrEqual(5);
    }
    expect(zOfficersFile.parse(roster)).not.toHaveProperty('_provenance');
    expect(roster._authoring.status).toContain('not part of the production');
  });

  it('closes actual staged geography stations and factory leader references', () => {
    const clans = buildTohokuClans(TOHOKU_GEOGRAPHY).clans;
    for (const officer of officers) {
      const clan = clans.find(({ id }) => id === officer.clanId);
      const station = TOHOKU_GEOGRAPHY.castles.find(({ id }) => id === officer.locationCastleId);
      expect(clan, officer.id).toBeDefined();
      expect(station?.ownerClanId, officer.id).toBe(officer.clanId);
    }
    for (const clan of clans.filter(({ id }) => id !== 'clan.date')) {
      const leader = officers.find(({ id }) => id === clan.leaderId);
      expect(leader).toMatchObject({ clanId: clan.id, locationCastleId: clan.homeCastleId });
      expect(leader!.debutYear).toBeLessThanOrEqual(1560);
      expect(leader!.deathYear).toBeGreaterThanOrEqual(1560);
      expect(TOHOKU_GEOGRAPHY.castles.find(({ id }) => id === clan.homeCastleId)?.lordId).toBe(
        leader!.id,
      );
    }
    expect(
      TOHOKU_GEOGRAPHY.castles
        .filter(({ tier }) => tier === 'branch')
        .every(({ lordId }) => lordId === null),
    ).toBe(true);
    const father = officers.find(({ id }) => id === 'off.sase-tanetsune')!;
    const son = officers.find(({ id }) => id === 'off.sase-tsuneo')!;
    expect(son.birthYear - father.birthYear).toBe(25);
    expect(roster._provenance['off.sase-tanetsune'].birthYear).toBe('authored');
    expect(roster._provenance['off.sase-tanetsune'].note).toContain(
      'does not supply either birth year',
    );
    expect(roster._authoring.sources.inawashiroMemorial).toContain('pref.fukushima.lg.jp');
  });

  it('has no distinct-ID or same-name duplicates against production and other staged regions', async () => {
    const production = (await loadS1560Scenario()).officers.flat();
    const siblings = [date, west, otomo, shimazu].flatMap(
      (file) => zOfficersFile.parse(file).officers,
    );
    for (const officer of officers) {
      const installed = production.filter(({ id }) => id === officer.id);
      expect(installed, officer.id).toEqual([officer]);
      expect(
        production.filter(({ name }) => name === officer.name).every(({ id }) => id === officer.id),
        officer.name,
      ).toBe(true);
      expect(
        siblings.some(({ id, name }) => id === officer.id || name === officer.name),
        officer.id,
      ).toBe(false);
    }
  });

  it('traces every identity and explicitly classifies numeric and affiliation uncertainty', () => {
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
    expect(Object.keys(evidence).sort()).toEqual(officers.map(({ id }) => id).sort());
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
      expect(entry.support.length, officer.id).toBeGreaterThan(20);
      expect(entry.note, officer.id).toContain('design');
      expect(officer.birthYear).toBeLessThanOrEqual(1570);
      expect(officer.deathYear).toBeGreaterThanOrEqual(1560);
      expect(officer.deathYear).toBeGreaterThan(officer.birthYear);
      expect(officer.debutYear!).toBeGreaterThanOrEqual(officer.birthYear + BAL.comingOfAgeAge);
      expect(officer.debutYear!).toBeLessThan(officer.deathYear);
      expect(officer.traits).toEqual([]);
      expect(officer.tactics).toEqual([]);
    }
    expect(classes.otaka).toContain('secondary');
    expect(evidence['off.otaka-yasuzumi']!.support).toContain('does not prove');
    expect(evidence['off.ando-shigesue']!.deathYear).toBe('authored');
    expect(evidence['off.nikaido-moriyoshi']!.note).toContain(
      'not evidence of direct 1560 service',
    );
    expect(evidence['off.kunohe-masazane']!.note).toContain('independent');
  });

  it('includes the exact prescribed core without surname-based kin or alias padding', () => {
    for (const id of [
      'ashina-moriuji',
      'ashina-morioki',
      'kanagami-moriharu',
      'matsumoto-ujisuke',
      'tomita-ujizane',
      'mogami-yoshimori',
      'mogami-yoshiaki',
      'ujiie-sadanao',
      'ujiie-morimune',
      'nanbu-harumasa',
      'ishikawa-takanobu',
      'kita-nobuchika',
      'kunohe-masazane',
      'hachinohe-masaie',
      'ando-chikasue',
      'ando-shigesue',
      'otaka-yasuzumi',
    ])
      expect(
        officers.some((officer) => officer.id === `off.${id}`),
        id,
      ).toBe(true);
    expect(
      officers
        .filter(({ isKin }) => isKin)
        .map(({ id }) => id)
        .sort(),
    ).toEqual(
      [
        'off.ashina-morioki',
        'off.mogami-yoshiaki',
        'off.ishikawa-takanobu',
        'off.nanbu-nobunao',
        'off.ando-suetaka',
      ].sort(),
    );
    expect(roster._provenance['off.ando-suetaka'].support).toContain('younger brother');
    expect(roster._provenance['off.nanbu-nobunao'].support).toContain('cousin');
    expect(officers.find(({ id }) => id === 'off.ando-shigesue')!.isKin).toBe(false);
    for (const alias of [
      'off.tateoka-mitsushige',
      'off.eguchi-gohei',
      'off.oura-tamenobu',
      'off.ando-chikasue-akita',
      'off.otaka-chikuzen',
    ])
      expect(officers.some(({ id }) => id === alias)).toBe(false);
  });

  it('keeps lifespan conflicts and unavailable children explicit rather than creating early heirs', () => {
    expect(roster._provenance['off.ashina-morioki'].note).toContain('1575');
    expect(roster._provenance['off.ashina-morioki'].deathYear).toBe('source-qualified');
    expect(officers.find(({ id }) => id === 'off.mogami-yoshimori')!.birthYear).toBe(1519);
    expect(roster._provenance['off.mogami-yoshiaki'].note).toContain('1558');
    expect(roster._provenance['off.ujiie-morimune'].deathYear).toBe('authored');
    expect(roster._provenance['off.ando-shigesue'].note).toContain('1589');
    expect(officers.some(({ id }) => id === 'off.nanbu-harutsugu')).toBe(false);
    expect(roster._authoring.excludedIdentities[0]).toMatchObject({
      id: 'off.nanbu-harutsugu',
      source: 'nanbuChronology',
    });
  });

  it.each([
    ['off.ashina-morioki', 1562],
    ['off.mogami-yoshiaki', 1561],
    ['off.honjo-mitsushige', 1571],
    ['off.sakenobe-hidetsuna', 1581],
    ['off.kitadate-toshinaga', 1563],
    ['off.nobesawa-mitsunobu', 1582],
    ['off.nanbu-nobunao', 1561],
    ['off.tsugaru-tamenobu', 1565],
  ] as const)('keeps %s unavailable until the explicit adult/service debut %s', (id, year) => {
    const record = officers.find((officer) => officer.id === id)!;
    const bundle = structuredClone(SCENARIO_BUNDLE_FIXTURE);
    // The local fixture tests availability only, not a joint Tohoku world.
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
