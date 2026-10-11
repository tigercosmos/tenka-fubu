import { describe, expect, it } from 'vitest';
import roster from '../../src/data/scenarios/s1560/batches/officers/koshinetsu.json';
import { zOfficersFile } from '../../src/data/schemas/officer';
import { TACTICS } from '../../src/core/tactics';
import { TRAITS } from '../../src/core/traits';
import type { TacticId, TraitId } from '../../src/core/state/ids';

describe('staged Koshinetsu officers authoring evidence', () => {
  it('provides the canonical35+35 named roster without activating it', () => {
    const parsed = zOfficersFile.parse(roster);
    expect(parsed.officers).toHaveLength(70);
    expect(new Set(parsed.officers.map((officer) => officer.id)).size).toBe(70);
    for (const clanId of ['clan.takeda', 'clan.nagao']) {
      expect(parsed.officers.filter((officer) => officer.clanId === clanId)).toHaveLength(35);
    }
    expect(roster._authoring.status).toContain('not part of the production');
  });

  it('keeps per-record uncertainty in raw JSON even though the runtime schema strips it', () => {
    const provenance: Record<
      string,
      { birthYear: string; deathYear: string; sources: string[]; note: string }
    > = roster._provenance;
    const sources: Record<string, string> = roster._authoring.sources;
    expect(Object.keys(provenance).sort()).toEqual(
      roster.officers.map((officer) => officer.id).sort(),
    );
    for (const officer of roster.officers) {
      const evidence = provenance[officer.id]!;
      for (const field of ['birthYear', 'deathYear'] as const) {
        expect(['verified', 'source-qualified', 'authored']).toContain(evidence[field]);
        if (evidence[field] !== 'authored') expect(evidence.sources.length).toBeGreaterThan(0);
      }
      for (const source of evidence.sources) expect(sources[source]).toMatch(/^https:\/\//);
      expect(evidence.note.length).toBeGreaterThan(40);
      expect(officer.deathYear).toBeGreaterThan(officer.birthYear);
      expect(officer.deathYear).toBeGreaterThanOrEqual(1560);
    }
    expect(zOfficersFile.parse(roster)).not.toHaveProperty('_provenance');
    expect(roster._provenance['off.kamiizumi-nobutsuna'].deathYear).toBe('authored');
    expect(roster._provenance['off.honjo-shigenaga'].deathYear).toBe('source-qualified');
    expect(roster._provenance['off.baba-nobuharu'].birthYear).toBe('authored');
  });

  it('keeps every named identity traceable and respects dated activity constraints', () => {
    const provenance = roster._provenance as Record<
      string,
      {
        sources: string[];
        birthYear: string;
        deathYear: string;
        note: string;
      }
    >;
    for (const officer of roster.officers) {
      const evidence = provenance[officer.id]!;
      expect(evidence.sources.length, officer.id).toBeGreaterThan(0);
      for (const source of evidence.sources)
        expect(source in roster._authoring.sources, `${officer.id}: ${source}`).toBe(true);
    }
    const mochizuki = roster.officers.find((officer) => officer.id === 'off.mochizuki-nobumasa')!;
    expect(mochizuki.deathYear).toBeGreaterThanOrEqual(1567);
    expect(provenance[mochizuki.id]!.deathYear).toBe('authored');
    const komai = roster.officers.find((officer) => officer.id === 'off.komai-masatake')!;
    expect(komai.birthYear).toBeLessThan(1522);
    expect(komai.deathYear).toBe(1563);
    expect(provenance[komai.id]!.deathYear).toBe('source-qualified');
    expect(roster.officers.some((officer) => officer.id === 'off.tsuchiya-masatsune')).toBe(true);
    expect(roster.officers.some((officer) => officer.id === 'off.tsuchiya-masanao')).toBe(false);
  });

  it('uses legal authored traits and tactics without bypassing juvenile debut', () => {
    const officers = zOfficersFile.parse(roster).officers;
    for (const officer of officers) {
      for (const trait of officer.traits) expect(TRAITS[trait as TraitId]).toBeDefined();
      for (const tacticId of officer.tactics) {
        const tactic = TACTICS[tacticId as TacticId];
        expect(tactic).toBeDefined();
        if (!tactic) throw new Error(`Unknown authored tactic: ${tacticId}`);
        if (tactic.unlockTraitId) expect(officer.traits).toContain(tactic.unlockTraitId);
      }
      expect(officer.debutYear).toBeUndefined();
    }
    expect(officers.filter((officer) => officer.traits.includes('trait.gunshin'))).toHaveLength(2);
    for (const id of ['off.uesugi-kagekatsu', 'off.naoe-kanetsugu', 'off.nagano-narimori']) {
      expect(officers.find((officer) => officer.id === id)!.birthYear + 15).toBeGreaterThan(1560);
    }
  });

  it('closes existing historical event identities without duplicate aliases', () => {
    const ids = roster.officers.map((officer) => officer.id);
    for (const id of [
      'off.baba-nobuharu',
      'off.naito-masatoyo',
      'off.yamagata-masakage',
      'off.yamamoto-kansuke',
      'off.takeda-katsuyori',
      'off.takeda-nobushige',
      'off.takeda-shingen',
      'off.nagao-kagetora',
    ])
      expect(ids).toContain(id);
    expect(ids).not.toContain('off.baba-nobufusa');
    expect(ids).not.toContain('off.kuroda-hidetada');
    expect(ids).not.toContain('off.yoshie-munenobu');
  });
});
