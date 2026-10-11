import { describe, expect, it } from 'vitest';
import batchJson from '../../src/data/scenarios/s1560/batches/kanto-koshinetsu-clans.json';
import existingJson from '../../src/data/scenarios/s1560/clans.json';
import personasJson from '../../src/data/scenarios/s1560/personas.json';
import { zClansFile, zPersonasFile } from '../../src/data/schemas';
import { KANTO_KOSHINETSU_GEOGRAPHY as geography } from '../../src/data/scenarios/s1560/batches/kanto-koshinetsu-geography';

const batch = zClansFile.parse(batchJson);
const existing = zClansFile.parse(existingJson);

describe('s1560 joint Kanto/Koshinetsu clan batch (14 §3.3)', () => {
  it('calibrates all seven treasuries from actual joint district resources', () => {
    const owners = new Map(geography.castles.map(({ id, ownerClanId }) => [id, ownerClanId]));
    for (const clan of batch.clans) {
      const kokudaka = geography.districts
        .filter(({ castleId }) => owners.get(castleId) === clan.id)
        .reduce((sum, district) => sum + district.kokudaka, 0);
      expect(clan.gold, clan.id).toBe(Math.round(kokudaka / 200 / 100) * 100);
    }
  });
  it('contains the seven canonical leaders, homes, and palette indices', () => {
    expect(
      batch.clans.map(({ id, leaderId, homeCastleId, colorIndex }) => [
        id,
        leaderId,
        homeCastleId,
        colorIndex,
      ]),
    ).toEqual([
      ['clan.hojo', 'off.hojo-ujiyasu', 'castle.odawara', 20],
      ['clan.satomi', 'off.satomi-yoshitaka', 'castle.kururi', 8],
      ['clan.satake', 'off.satake-yoshiaki', 'castle.ota', 16],
      ['clan.utsunomiya', 'off.utsunomiya-hirotsuna', 'castle.utsunomiya', 4],
      ['clan.yuki', 'off.yuki-harutomo', 'castle.yuki', 34],
      ['clan.takeda', 'off.takeda-shingen', 'castle.tsutsujigasaki', 0],
      ['clan.nagao', 'off.nagao-kagetora', 'castle.kasugayama', 24],
    ]);
  });

  it('uses existing personas and integrates each production clan exactly once', () => {
    const personas = new Set(zPersonasFile.parse(personasJson).personas.map(({ id }) => id));
    for (const clan of batch.clans) {
      expect(
        existing.clans.filter(({ id }) => id === clan.id),
        clan.id,
      ).toEqual([clan]);
      expect(personas.has(clan.personaId), clan.id).toBe(true);
    }
  });

  it('closes all diplomacy references against the joint four-region clan set', () => {
    const ids = new Set([...existing.clans, ...batch.clans].map(({ id }) => id));
    for (const entry of Object.values(batch.diplomacy).flat()) {
      expect(ids.has(entry.a), entry.a).toBe(true);
      expect(ids.has(entry.b), entry.b).toBe(true);
      expect(entry.a).not.toBe(entry.b);
    }
  });

  it('preserves all three 48-month alliances and permanent marriage links', () => {
    const pairs = [
      ['clan.takeda', 'clan.imagawa'],
      ['clan.takeda', 'clan.hojo'],
      ['clan.imagawa', 'clan.hojo'],
    ];
    for (const [a, b] of pairs) {
      const pacts = batch.diplomacy.pacts.filter((pact) => pact.a === a && pact.b === b);
      expect(pacts.map(({ kind, months }) => ({ kind, months }))).toEqual([
        { kind: 'alliance', months: 48 },
        { kind: 'marriage', months: null },
      ]);
    }
    expect(batch.diplomacy.pacts).toContainEqual({
      a: 'clan.takeda',
      b: 'clan.honganji',
      kind: 'marriage',
      months: null,
      vassalClanId: null,
    });
  });

  it('preserves canonical hostile pairs and reciprocal Takeda/Nagao sentiment', () => {
    expect(batch.diplomacy.wars).toEqual([
      { a: 'clan.nagao', b: 'clan.takeda' },
      { a: 'clan.nagao', b: 'clan.hojo' },
      { a: 'clan.satomi', b: 'clan.hojo' },
    ]);
    expect(batch.diplomacy.sentiments).toEqual([
      { a: 'clan.takeda', b: 'clan.nagao', aToB: 15, bToA: 15 },
    ]);
    const keys = batch.diplomacy.pacts.map(
      ({ a, b, kind }) => `${[a, b].sort().join('|')}|${kind}`,
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});
