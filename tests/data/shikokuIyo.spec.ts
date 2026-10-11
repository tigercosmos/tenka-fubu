import { describe, expect, it } from 'vitest';
import roster from '../../src/data/scenarios/s1560/batches/officers/shikoku-iyo.json';
import tokai from '../../src/data/scenarios/s1560/officers/tokai.json';
import kinki from '../../src/data/scenarios/s1560/officers/kinki.json';
import kanto from '../../src/data/scenarios/s1560/officers/kanto.json';
import koshinetsu from '../../src/data/scenarios/s1560/officers/koshinetsu.json';
import hokuriku from '../../src/data/scenarios/s1560/officers/hokuriku.json';
import chugoku from '../../src/data/scenarios/s1560/officers/chugoku.json';
import { zOfficersFile } from '../../src/data/schemas/officer';
import { buildGameStateFromScenario } from '../../src/core/state/builder';
import type { ClanId, OfficerId, TraitId } from '../../src/core/state/ids';
import { TRAITS } from '../../src/core/traits';
import { SCENARIO_BUNDLE_FIXTURE } from '../fixtures/scenarioBundle';

const officers = zOfficersFile.parse(roster).officers;

describe('staged Shikoku Iyo officers', () => {
  it('provides eight Kono and six Saionji real named identities without loaded duplicates', () => {
    expect(officers).toHaveLength(14);
    expect(new Set(officers.map((officer) => officer.id)).size).toBe(14);
    expect(new Set(officers.map((officer) => officer.name)).size).toBe(14);
    expect(officers.filter((officer) => officer.clanId === 'clan.kono')).toHaveLength(8);
    expect(officers.filter((officer) => officer.clanId === 'clan.saionji')).toHaveLength(6);
    const loaded = new Set(
      [tokai, kinki, kanto, koshinetsu, hokuriku, chugoku].flatMap((region) =>
        region.officers.map((officer) => officer.id),
      ),
    );
    for (const officer of officers) expect(loaded.has(officer.id), officer.id).toBe(false);
    expect(roster._authoring.status).toContain('not part of the production');
    expect(zOfficersFile.parse(roster)).not.toHaveProperty('_provenance');
  });

  it('records source classifications and explicit lifespan/placement uncertainty for every record', () => {
    const evidence = roster._provenance as Record<
      string,
      { birthYear: string; deathYear: string; sources: string[]; support: string; note: string }
    >;
    const sources = roster._authoring.sources as Record<string, string>;
    const classes = roster._authoring.sourceClasses as Record<string, string>;
    expect(Object.keys(evidence).sort()).toEqual(officers.map((officer) => officer.id).sort());
    expect(Object.keys(sources).sort()).toEqual(Object.keys(classes).sort());
    for (const officer of officers) {
      const entry = evidence[officer.id]!;
      expect(entry.sources.length, officer.id).toBeGreaterThan(0);
      for (const source of entry.sources) {
        expect(sources[source], source).toMatch(/^https:\/\//);
        expect(classes[source]?.length, source).toBeGreaterThan(0);
      }
      expect(['verified', 'source-qualified', 'authored']).toContain(entry.birthYear);
      expect(['verified', 'source-qualified', 'authored']).toContain(entry.deathYear);
      expect(entry.support.length).toBeGreaterThan(10);
      expect(entry.note).toContain('design');
      expect(officer.deathYear).toBeGreaterThan(officer.birthYear);
      expect(officer.deathYear).toBeGreaterThanOrEqual(1560);
      expect(officer.isKin).toBe(false);
      expect(officer.tactics).toEqual([]);
      for (const id of officer.traits) expect(TRAITS[id as TraitId], id).toBeDefined();
    }
    expect(roster._authoring.kinBoundary).toContain('not a historical assertion');
    expect(classes.murakamiDictionary).toContain('secondary');
    expect(classes.iyoChronology).toContain('later military chronicle');
  });

  it('preserves canonical core IDs, home stations and naval traits', () => {
    for (const [id, clan, castle] of [
      ['kono-michinobu', 'kono', 'yuzuki'],
      ['murakami-michiyasu', 'kono', 'kurushima'],
      ['hiraoka-fusazane', 'kono', 'yuzuki'],
      ['saionji-sanemitsu', 'saionji', 'kurose'],
      ['utsunomiya-noritsuna', 'saionji', 'kurose'],
      ['hoketsu-sakinobu', 'saionji', 'kurose'],
    ])
      expect(officers.find((officer) => officer.id === `off.${id}`)).toMatchObject({
        clanId: `clan.${clan}`,
        locationCastleId: `castle.${castle}`,
      });
    expect(officers.find((officer) => officer.id === 'off.murakami-michiyasu')!.traits).toContain(
      'trait.kaizoku',
    );
    expect(officers.find((officer) => officer.id === 'off.hoketsu-sakinobu')!.traits).toContain(
      'trait.kaizoku',
    );
    expect(officers.find((officer) => officer.id === 'off.imajo-yoshinobu')!.name).toBe('今城能信');
    expect(officers.find((officer) => officer.id === 'off.kurokawa-michitaka')!.name).toBe(
      '黑川通堯',
    );
  });

  it('does not substitute an earlier namesake, retired lord, duplicate naval lord or juvenile filler', () => {
    const exclusions = roster._authoring.excludedIdentities.join(' ');
    expect(exclusions).toContain('died1519');
    expect(exclusions).toContain('retired1553');
    expect(exclusions).toContain('born1546');
    for (const id of [
      'off.ono-toshinao',
      'off.murakami-takeyoshi',
      'off.doi-kiyoyoshi',
      'off.hoketsu-akinobu',
    ])
      expect(officers.some((officer) => officer.id === id)).toBe(false);
    expect(roster._provenance['off.hoketsu-sakinobu'].birthYear).toBe('authored');
    expect(roster._provenance['off.hoketsu-sakinobu'].deathYear).toBe('authored');
    expect(roster._provenance['off.hoketsu-sakinobu'].note).toContain('Do not borrow');
    expect(roster._provenance['off.kitanokawa-chikayasu'].support).toContain('1581/1583');
  });

  it.each([
    ['off.hiraoka-michisuke', 1569],
    ['off.kaino-michimori', 1567],
    ['off.saionji-kinhiro', 1565],
    ['off.imajo-yoshinobu', 1566],
  ] as const)(
    'keeps later-attested %s unavailable until its explicit debut %s',
    (id, debutYear) => {
      const record = officers.find((officer) => officer.id === id)!;
      expect(record.debutYear).toBe(debutYear);
      const bundle = structuredClone(SCENARIO_BUNDLE_FIXTURE);
      // Remap only this presentation-independent debut test to existing fixture geography.
      // This is not a claim that the staged regional world is production-integrated.
      bundle.officers[0]!.push({ ...record, clanId: 'clan.alpha', locationCastleId: 'castle.a1' });
      const state = buildGameStateFromScenario(bundle, {
        appVersion: 'test',
        seed: 42,
        playerClanId: 'clan.alpha' as ClanId,
        difficulty: 'normal',
      });
      expect(state.officers[id as OfficerId]!.hasComeOfAge).toBe(false);
      expect(record.debutYear).toBeGreaterThan(state.time.year);
    },
  );
});
