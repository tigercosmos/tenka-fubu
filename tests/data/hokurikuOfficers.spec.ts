import { describe, expect, it } from 'vitest';
import roster from '../../src/data/scenarios/s1560/batches/officers/hokuriku.json';
import production from '../../src/data/scenarios/s1560/officers/hokuriku.json';
import tokai from '../../src/data/scenarios/s1560/officers/tokai.json';
import kinki from '../../src/data/scenarios/s1560/officers/kinki.json';
import kanto from '../../src/data/scenarios/s1560/officers/kanto.json';
import koshinetsu from '../../src/data/scenarios/s1560/officers/koshinetsu.json';
import { zOfficersFile } from '../../src/data/schemas/officer';
import { TRAITS } from '../../src/core/traits';
import { TACTICS } from '../../src/core/tactics';
import type { TraitId, TacticId } from '../../src/core/state/ids';

describe('staged Hokuriku named officers', () => {
  it('preserves independently sourced leader kin without inferring it from surnames', () => {
    const parsed = zOfficersFile.parse(roster);
    expect(zOfficersFile.parse(production)).toEqual(parsed);
    const kinIds = [
      'off.asakura-kageakira',
      'off.asakura-kagenori',
      'off.hatakeyama-yoshitsugu',
      'off.hatakeyama-yoshinori',
      'off.jinbo-nagazumi',
    ];
    expect(
      parsed.officers
        .filter((officer) => officer.isKin)
        .map((officer) => officer.id)
        .sort(),
    ).toEqual(kinIds.sort());
    const evidence = roster._provenance as Record<
      string,
      { isKin?: { value: boolean; relation: string; sources: string[] } }
    >;
    const sources = roster._authoring.sources as Record<string, string>;
    for (const id of kinIds) {
      expect(evidence[id]?.isKin?.value).toBe(true);
      expect(evidence[id]?.isKin?.relation.length).toBeGreaterThan(0);
      for (const source of evidence[id]!.isKin!.sources)
        expect(sources[source]).toMatch(/^https:\/\//);
    }
    for (const id of ['off.jinbo-ujishige', 'off.jinbo-ujiharu', 'off.asakura-kagetake'])
      expect(parsed.officers.find((officer) => officer.id === id)?.isKin).not.toBe(true);
  });
  it('provides forty distinct people without duplicating loaded regional rosters', () => {
    const parsed = zOfficersFile.parse(roster);
    expect(parsed.region).toBe('hokuriku');
    expect(parsed.officers).toHaveLength(40);
    const ids = parsed.officers.map((officer) => officer.id);
    expect(new Set(ids).size).toBe(40);
    const loaded = new Set(
      [tokai, kinki, kanto, koshinetsu].flatMap((file) =>
        file.officers.map((officer) => officer.id),
      ),
    );
    for (const id of ids) expect(loaded.has(id), id).toBe(false);
    expect(roster._authoring.status).toContain('not part of the production');
    for (const [clan, count] of [
      ['asakura', 20],
      ['hatakeyama', 11],
      ['jinbo', 8],
    ] as const)
      expect(parsed.officers.filter((officer) => officer.clanId === `clan.${clan}`)).toHaveLength(
        count,
      );
    expect(parsed.officers.some((officer) => officer.clanId === 'clan.honganji')).toBe(false);
  });

  it('retains a source and explicit evidence boundary for every person', () => {
    const evidence = roster._provenance as Record<
      string,
      { birthYear: string; deathYear: string; sources: string[]; note: string }
    >;
    const sources = roster._authoring.sources as Record<string, string>;
    expect(Object.keys(evidence).sort()).toEqual(
      roster.officers.map((officer) => officer.id).sort(),
    );
    for (const officer of roster.officers) {
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
      'not proven Nagamoto direct retainers',
    );
  });

  it('keeps prescribed names, leaders at homes, and Mitsuhide a named ronin', () => {
    const officers = zOfficersFile.parse(roster).officers;
    for (const [clan, leader, castle] of [
      ['asakura', 'asakura-yoshikage', 'ichijodani'],
      ['hatakeyama', 'hatakeyama-yoshitsuna', 'nanao'],
      ['jinbo', 'jinbo-nagamoto', 'toyama'],
    ]) {
      expect(officers.find((officer) => officer.id === `off.${leader}`)).toMatchObject({
        clanId: `clan.${clan}`,
        locationCastleId: `castle.${castle}`,
      });
    }
    expect(officers.find((officer) => officer.id === 'off.akechi-mitsuhide')).toMatchObject({
      clanId: null,
      locationCastleId: 'castle.ichijodani',
    });
    expect(officers.find((officer) => officer.name === '印牧能信')?.id).toBe(
      'off.kanemaki-yoshinobu',
    );
    expect(officers.some((officer) => officer.id === 'off.magara-naozumi')).toBe(false);
    expect(officers.some((officer) => officer.id === 'off.jinbo-nagashiro')).toBe(false);
  });

  it('does not bypass juvenile or later-attested debut and rare tactic requirements', () => {
    const officers = zOfficersFile.parse(roster).officers;
    expect(officers.find((officer) => officer.id === 'off.cho-tsuratatsu')!.birthYear).toBe(1546);
    expect(
      officers.find((officer) => officer.id === 'off.hatakeyama-yoshinori')!.birthYear + 15,
    ).toBeGreaterThan(1560);
    for (const id of [
      'off.torii-kagechika',
      'off.toujin-chikahiro',
      'off.nukui-kagetaka',
      'off.nukui-mitsumune',
    ])
      expect(officers.find((officer) => officer.id === id)!.debutYear).toBeGreaterThan(1560);
    for (const officer of officers) {
      for (const traitId of officer.traits) {
        const trait = TRAITS[traitId as TraitId];
        expect(trait).toBeDefined();
        if (!trait) throw new Error(`Unknown authored trait: ${traitId}`);
        expect(trait.rarity).toBe('common');
      }
      for (const tacticId of officer.tactics) {
        const tactic = TACTICS[tacticId as TacticId];
        expect(tactic).toBeDefined();
        if (!tactic) throw new Error(`Unknown authored tactic: ${tacticId}`);
        if (tactic.unlockTraitId) expect(officer.traits).toContain(tactic.unlockTraitId);
      }
    }
  });
});
