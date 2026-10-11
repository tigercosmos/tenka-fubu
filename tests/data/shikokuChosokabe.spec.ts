import { describe, expect, it } from 'vitest';
import roster from '../../src/data/scenarios/s1560/batches/officers/shikoku-chosokabe.json';
import tokai from '../../src/data/scenarios/s1560/officers/tokai.json';
import kinki from '../../src/data/scenarios/s1560/officers/kinki.json';
import kanto from '../../src/data/scenarios/s1560/officers/kanto.json';
import koshinetsu from '../../src/data/scenarios/s1560/officers/koshinetsu.json';
import hokuriku from '../../src/data/scenarios/s1560/officers/hokuriku.json';
import chugoku from '../../src/data/scenarios/s1560/officers/chugoku.json';
import { zOfficersFile } from '../../src/data/schemas/officer';
import { BAL } from '../../src/core/balance';

const officers = zOfficersFile.parse(roster).officers;
type Evidence = {
  birthYear: string;
  deathYear: string;
  sources: string[];
  identity: string;
  affiliation: string;
  stats: string;
  traits: string;
  rank: string;
  initialPlacement: string;
  debutYear: string;
  note: string;
  isKin?: { value: boolean; relation: string; sources: string[] };
};
const evidence: Readonly<Record<string, Evidence>> = roster._provenance;
const sources: Readonly<Record<string, string>> = roster._authoring.sources;

describe('staged Chosokabe named roster (not production closure)', () => {
  it('has fifteen distinct identities and the exact eight canonical core people', () => {
    expect(officers).toHaveLength(15);
    expect(new Set(officers.map((officer) => officer.id)).size).toBe(officers.length);
    const loaded = new Set(
      [tokai, kinki, kanto, koshinetsu, hokuriku, chugoku].flatMap((file) =>
        file.officers.map((officer) => officer.id),
      ),
    );
    for (const officer of officers) {
      expect(loaded.has(officer.id), officer.id).toBe(false);
      expect(officer.clanId).toBe('clan.chosokabe');
      expect(officer.locationCastleId).toBe('castle.oko');
    }
    for (const id of [
      'chosokabe-kunichika',
      'chosokabe-motochika',
      'kira-chikasada',
      'kosokabe-chikayasu',
      'yoshida-takayori',
      'yoshida-shigetoshi',
      'fukudome-chikamasa',
      'hisatake-chikanobu',
    ])
      expect(
        officers.some((officer) => officer.id === `off.${id}`),
        id,
      ).toBe(true);
    expect(zOfficersFile.parse(roster)).not.toHaveProperty('_provenance');
    expect(roster._authoring.status).toContain('not part of production');
  });

  it('records the narrow D27 decision without padding death1560 or claiming activation', () => {
    expect(officers.find((officer) => officer.id === 'off.chosokabe-kunichika')).toMatchObject({
      birthYear: 1504,
      deathYear: 1560,
      rank: 'shukuro',
    });
    expect(roster._authoring.activationDecisions[0]).toMatchObject({
      decision: 'plan14 §8-D27',
      id: 'off.chosokabe-kunichika',
      deathYear: 1560,
    });
    expect(roster._authoring.activationDecisions[0]!.scope).toContain('V8 permits only s1560');
    expect(roster._authoring.activationDecisions[0]!.scope).toContain(
      'Metadata does not grant this exception',
    );
    expect(roster._authoring.activationDecisions[0]!.runtimeBoundary).toContain(
      'does not change death scheduling',
    );
    expect(roster._authoring.activationDecisions[0]!.runtimeBoundary).toContain(
      'does not add an exact June death event or approve production activation',
    );
    expect(roster._authoring.status).toContain('Other integration gates remain unverified');
    expect(roster._authoring).not.toHaveProperty('activationBlockers');
    expect(evidence['off.chosokabe-kunichika']!.deathYear).toBe('verified');
    expect(officers.find((officer) => officer.id === 'off.chosokabe-motochika')).toMatchObject({
      birthYear: 1539,
      deathYear: 1599,
    });
  });

  it('records field-specific uncertainty, source keys and gameplay boundaries for every row', () => {
    expect(Object.keys(evidence).sort()).toEqual(officers.map((officer) => officer.id).sort());
    for (const officer of officers) {
      const record = evidence[officer.id]!;
      for (const field of ['birthYear', 'deathYear'] as const)
        expect(['verified', 'source-qualified', 'authored']).toContain(record[field]);
      expect(record.sources.length, officer.id).toBeGreaterThan(0);
      for (const key of record.sources) expect(sources[key], key).toMatch(/^https:\/\//);
      for (const field of [
        'identity',
        'affiliation',
        'stats',
        'traits',
        'rank',
        'initialPlacement',
        'debutYear',
      ] as const)
        expect(record[field].length, `${officer.id}:${field}`).toBeGreaterThan(0);
      expect(record.note).toContain('設計');
      expect(officer.deathYear).toBeGreaterThan(officer.birthYear);
      expect(officer.deathYear).toBeGreaterThanOrEqual(1560);
      expect(officer.traits).toEqual([]);
      expect(officer.tactics).toEqual([]);
    }
    expect(roster._authoring.sourceBoundaries).toContain('discovery-only');
    expect(roster._authoring.sourceBoundaries).toContain('not official primary');
    expect(evidence['off.fukudome-chikamasa']!.birthYear).toBe('authored');
  });

  it('does not duplicate tentative Takayori/Shuko identity or out-of-schema future sons', () => {
    expect(officers.filter((officer) => officer.id === 'off.yoshida-takayori')).toHaveLength(1);
    expect(officers.some((officer) => officer.id === 'off.yoshida-shuko')).toBe(false);
    expect(officers.some((officer) => officer.id === 'off.chosokabe-morichika')).toBe(false);
    expect(roster._authoring.identityExclusions.map((record) => record.id)).toEqual([
      'off.yoshida-shuko',
      'off.chosokabe-morichika',
    ]);
    expect(evidence['off.yoshida-takayori']!.note).toContain('cautiously');
  });

  it('defers juveniles and explicitly later-attested service, without initial adulthood eligibility', () => {
    for (const [id, debutYear] of [
      ['hisatake-chikanao', 1579],
      ['tani-tadasumi', 1578],
      ['fukudome-norishige', 1564],
      ['chosokabe-nobuchika', 1580],
      ['kira-chikazane', 1578],
    ] as const) {
      const officer = officers.find((candidate) => candidate.id === `off.${id}`)!;
      expect(officer.debutYear).toBe(debutYear);
      expect(debutYear).toBeGreaterThanOrEqual(officer.birthYear + BAL.comingOfAgeAge);
      expect(debutYear).toBeGreaterThan(1560);
    }
    for (const officer of officers) {
      const debut = officer.debutYear ?? officer.birthYear + BAL.comingOfAgeAge;
      if (1560 - officer.birthYear < BAL.comingOfAgeAge) expect(debut).toBeGreaterThan(1560);
      expect(debut).toBeLessThanOrEqual(officer.deathYear);
    }
    expect(roster._authoring.scope).toContain('not15 active1560');
  });

  it('marks only sourced clan-leader family kin, not retainer-family speculation', () => {
    expect(
      officers
        .filter((officer) => officer.isKin)
        .map((officer) => officer.id)
        .sort(),
    ).toEqual(
      [
        'off.chosokabe-motochika',
        'off.kira-chikasada',
        'off.kosokabe-chikayasu',
        'off.chosokabe-nobuchika',
        'off.kira-chikazane',
      ].sort(),
    );
    for (const officer of officers.filter((candidate) => candidate.isKin)) {
      const kin = evidence[officer.id]!.isKin!;
      expect(kin.value).toBe(true);
      expect(kin.relation.length).toBeGreaterThan(0);
      expect(kin.sources.length).toBeGreaterThan(0);
      for (const key of kin.sources) expect(sources[key], key).toMatch(/^https:\/\//);
    }
    expect(officers.find((officer) => officer.id === 'off.yoshida-takayori')!.isKin).toBe(false);
    expect(officers.find((officer) => officer.id === 'off.emura-chikaie')!.isKin).toBe(false);
    expect(officers.find((officer) => officer.id === 'off.hisatake-chikanao')!.isKin).toBe(false);
  });
});
