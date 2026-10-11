import { describe, expect, it } from 'vitest';
import {
  buildTohokuClans,
  TOHOKU_CLAN_IDENTITIES,
  TOHOKU_CLAN_PROVENANCE,
  TOHOKU_CLANS,
} from '../../src/data/scenarios/s1560/batches/tohoku-clans';
import { TOHOKU_GEOGRAPHY } from '../../src/data/scenarios/s1560/batches/tohoku-geography';
import production from '../../src/data/scenarios/s1560/clans.json';
import personas from '../../src/data/scenarios/s1560/personas.json';
import { zClansFile, zPersonasFile } from '../../src/data/schemas';

// Synthetic factory input only: actual staged geography and national closure have separate gates.
function fixture() {
  return {
    castles: TOHOKU_CLAN_IDENTITIES.map(([slug, , leader, home]) => ({
      id: `castle.${home}`,
      ownerClanId: `clan.${slug}`,
      tier: 'main',
      lordId: `off.${leader}` as string | null,
    })),
    districts: TOHOKU_CLAN_IDENTITIES.map(([, , , home], i) => ({
      castleId: `castle.${home}`,
      kokudaka: 203_100 + i * 20_000,
    })),
  };
}

describe('staged Tohoku clan factory, not national acceptance', () => {
  it('closes the actual staged territory and derives treasuries from all fourteen castles', () => {
    const geography = TOHOKU_GEOGRAPHY;
    expect(geography.castles).toHaveLength(14);
    expect(geography.districts).toHaveLength(40);
    expect(geography.districts.reduce((sum, district) => sum + district.kokudaka, 0)).toBe(
      2_100_000,
    );
    expect(TOHOKU_CLANS).toEqual(buildTohokuClans(geography));
    for (const clan of TOHOKU_CLANS.clans) {
      expect(geography.castles.find(({ id }) => id === clan.homeCastleId)).toMatchObject({
        ownerClanId: clan.id,
        lordId: clan.leaderId,
        tier: 'main',
      });
      const owned = new Set(
        geography.castles.filter(({ ownerClanId }) => ownerClanId === clan.id).map(({ id }) => id),
      );
      const koku = geography.districts
        .filter(({ castleId }) => owned.has(castleId))
        .reduce((sum, district) => sum + district.kokudaka, 0);
      expect(clan.gold).toBe(Math.round(koku / 200 / 100) * 100);
    }
    expect(
      TOHOKU_CLANS.clans.map(
        ({ id }) => geography.castles.filter(({ ownerClanId }) => ownerClanId === id).length,
      ),
    ).toEqual([3, 3, 2, 4, 2]);
  });

  it('preserves all five canonical leaders, capitals, colors and existing personas', () => {
    const batch = buildTohokuClans(fixture());
    expect(
      batch.clans.map(({ id, leaderId, homeCastleId, colorIndex }) => [
        id,
        leaderId,
        homeCastleId,
        colorIndex,
      ]),
    ).toEqual([
      ['clan.date', 'off.date-harumune', 'castle.yonezawa', 38],
      ['clan.ashina', 'off.ashina-moriuji', 'castle.kurokawa', 11],
      ['clan.mogami', 'off.mogami-yoshimori', 'castle.yamagata', 19],
      ['clan.nanbu', 'off.nanbu-harumasa', 'castle.sannohe', 25],
      ['clan.ando', 'off.ando-chikasue', 'castle.hiyama', 33],
    ]);
    const installed = zClansFile.parse(production).clans;
    const personalities = new Set(zPersonasFile.parse(personas).personas.map(({ id }) => id));
    for (const clan of batch.clans) {
      expect(installed.filter(({ id }) => id === clan.id)).toEqual([
        TOHOKU_CLANS.clans.find(({ id }) => id === clan.id),
      ]);
      expect(personalities.has(clan.personaId)).toBe(true);
      expect(clan.courtRank).toBe('none');
      expect(clan.shogunateTitle).toBe('none');
    }
    expect(TOHOKU_CLAN_PROVENANCE.boundary).toContain('not national closure evidence');
  });

  it('uses every supplied owned district, including branches, without mutating geography', () => {
    const geography = fixture();
    geography.castles.push({
      id: 'castle.test-branch',
      ownerClanId: 'clan.date',
      tier: 'branch',
      lordId: null,
    });
    geography.districts.push({ castleId: 'castle.test-branch', kokudaka: 63_000 });
    const before = structuredClone(geography);
    const batch = buildTohokuClans(geography);
    expect(batch.clans[0]!.gold).toBe(Math.round((203_100 + 63_000) / 200 / 100) * 100);
    expect(batch.clans[1]!.gold).toBe(Math.round(223_100 / 200 / 100) * 100);
    expect(batch).toEqual(buildTohokuClans(geography));
    expect(geography).toEqual(before);
  });

  it('rejects dangling districts, duplicate castles, wrong capitals and invalid koku', () => {
    const dangling = fixture();
    dangling.districts[0]!.castleId = 'castle.missing';
    expect(() => buildTohokuClans(dangling)).toThrow('district references missing castle');
    const duplicate = fixture();
    duplicate.castles.push({ ...duplicate.castles[0]! });
    expect(() => buildTohokuClans(duplicate)).toThrow('duplicate castle ID');
    for (const change of ['ownerClanId', 'tier', 'lordId'] as const) {
      const wrong = fixture();
      wrong.castles[0]![change] = 'wrong';
      expect(() => buildTohokuClans(wrong)).toThrow('matching capital and leader');
    }
    for (const kokudaka of [0, -1, NaN, Infinity]) {
      const invalid = fixture();
      invalid.districts[0]!.kokudaka = kokudaka;
      expect(() => buildTohokuClans(invalid)).toThrow('positive district koku');
    }
    const absent = fixture();
    absent.districts.shift();
    expect(() => buildTohokuClans(absent)).toThrow('owned territory');
  });

  it('adds only prescribed relations without inferring an officer kinship or title', () => {
    const batch = buildTohokuClans(fixture());
    expect(batch.diplomacy).toEqual({
      pacts: [
        { a: 'clan.date', b: 'clan.mogami', kind: 'marriage', months: null, vassalClanId: null },
      ],
      wars: [{ a: 'clan.ando', b: 'clan.nanbu' }],
      sentiments: [{ a: 'clan.ashina', b: 'clan.date', aToB: 65, bToA: 65 }],
    });
  });
});
