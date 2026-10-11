import { describe, expect, it } from 'vitest';
import {
  KYUSHU_CLANS as batch,
  buildKyushuClans,
  KYUSHU_CLAN_PROVENANCE as provenance,
} from '../../src/data/scenarios/s1560/batches/kyushu-clans';
import { KYUSHU_GEOGRAPHY as geography } from '../../src/data/scenarios/s1560/batches/kyushu-geography';
import production from '../../src/data/scenarios/s1560/clans.json';
import personas from '../../src/data/scenarios/s1560/personas.json';
import { zClansFile, zPersonasFile } from '../../src/data/schemas';

describe('staged Kyushu clan payload, not production closure', () => {
  it('closes prescribed identities, capitals, palette indices and existing personas', () => {
    expect(
      batch.clans.map(({ id, leaderId, homeCastleId, colorIndex }) => [
        id,
        leaderId,
        homeCastleId,
        colorIndex,
      ]),
    ).toEqual([
      ['clan.shimazu', 'off.shimazu-takahisa', 'castle.uchijo', 27],
      ['clan.otomo', 'off.otomo-yoshishige', 'castle.funai', 28],
      ['clan.ryuzoji', 'off.ryuzoji-takanobu', 'castle.muranaka', 10],
      ['clan.ito', 'off.ito-yoshisuke', 'castle.tonokori', 39],
      ['clan.sagara', 'off.sagara-yoshihi', 'castle.hitoyoshi', 2],
    ]);
    const known = new Set(zClansFile.parse(production).clans.map(({ id }) => id));
    const personalities = new Set(zPersonasFile.parse(personas).personas.map(({ id }) => id));
    for (const clan of batch.clans) {
      expect(known.has(clan.id)).toBe(true);
      expect(zClansFile.parse(production).clans.find(({ id }) => id === clan.id)).toEqual(clan);
      expect(personalities.has(clan.personaId)).toBe(true);
      expect(geography.castles.find(({ id }) => id === clan.homeCastleId)).toMatchObject({
        ownerClanId: clan.id,
        lordId: clan.leaderId,
        tier: 'main',
      });
      expect(clan.courtRank).toBe('none');
      expect(clan.shogunateTitle).toBe('none');
    }
    expect(Object.keys(provenance.sources).sort()).toEqual(
      ['shimazu', 'otomo', 'ryuzoji', 'ito', 'sagara'].sort(),
    );
    expect(provenance.personas).toContain('gameplay design');
  });

  it('uses actual owned territory, applying Otomo’s canonical1.3 before rounding', () => {
    expect(geography.districts.reduce((sum, district) => sum + district.kokudaka, 0)).toBe(
      1_800_000,
    );
    for (const clan of batch.clans) {
      const owned = new Set(
        geography.castles.filter(({ ownerClanId }) => ownerClanId === clan.id).map(({ id }) => id),
      );
      const koku = geography.districts
        .filter(({ castleId }) => owned.has(castleId))
        .reduce((sum, district) => sum + district.kokudaka, 0);
      expect(clan.gold).toBe(
        Math.round(((koku / 200) * (clan.id === 'clan.otomo' ? 1.3 : 1)) / 100) * 100,
      );
      if (clan.id === 'clan.otomo')
        expect(clan.gold).toBeGreaterThan(Math.round(koku / 200 / 100) * 100);
    }
    expect(batch).toEqual(buildKyushuClans(geography));
    expect(() => buildKyushuClans({ castles: [], districts: [] })).toThrow(
      'B8 requires owned territory',
    );
    for (const [clanId, count] of [
      ['clan.shimazu', 3],
      ['clan.otomo', 6],
      ['clan.ryuzoji', 2],
      ['clan.ito', 2],
      ['clan.sagara', 1],
    ] as const)
      expect(geography.castles.filter(({ ownerClanId }) => ownerClanId === clanId)).toHaveLength(
        count,
      );
  });

  it('adds only all prescribed Kyushu relations with existing or staged endpoints', () => {
    expect(batch.diplomacy).toEqual({
      pacts: [],
      wars: [
        { a: 'clan.mori', b: 'clan.otomo' },
        { a: 'clan.ryuzoji', b: 'clan.otomo' },
        { a: 'clan.ito', b: 'clan.shimazu' },
      ],
      sentiments: [
        { a: 'clan.sagara', b: 'clan.shimazu', aToB: 45, bToA: 45 },
        { a: 'clan.otomo', b: 'clan.mori', aToB: 25, bToA: 25 },
      ],
    });
    const ids = new Set(
      [...zClansFile.parse(production).clans, ...batch.clans].map(({ id }) => id),
    );
    for (const { a, b } of [...batch.diplomacy.wars, ...batch.diplomacy.sentiments]) {
      expect(ids.has(a)).toBe(true);
      expect(ids.has(b)).toBe(true);
    }
  });
});
