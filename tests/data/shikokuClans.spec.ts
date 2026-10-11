import { describe, expect, it } from 'vitest';
import {
  SHIKOKU_CLANS as batch,
  SHIKOKU_EXISTING_CLAN_UPDATES as updates,
  SHIKOKU_CLAN_PROVENANCE as provenance,
} from '../../src/data/scenarios/s1560/batches/shikoku-clans';
import { SHIKOKU_GEOGRAPHY as geography } from '../../src/data/scenarios/s1560/batches/shikoku-geography';
import existing from '../../src/data/scenarios/s1560/clans.json';
import existingCastles from '../../src/data/scenarios/s1560/castles.json';
import existingDistricts from '../../src/data/scenarios/s1560/districts.json';
import personas from '../../src/data/scenarios/s1560/personas.json';
import { zClansFile, zPersonasFile } from '../../src/data/schemas';

describe('production Shikoku clan closure', () => {
  it('preserves the prescribed identities, palette and real main-castle references', () => {
    expect(
      batch.clans.map(({ id, leaderId, homeCastleId, colorIndex }) => [
        id,
        leaderId,
        homeCastleId,
        colorIndex,
      ]),
    ).toEqual([
      ['clan.chosokabe', 'off.chosokabe-kunichika', 'castle.oko', 6],
      ['clan.ichijo', 'off.ichijo-kanesada', 'castle.nakamura', 36],
      ['clan.kono', 'off.kono-michinobu', 'castle.yuzuki', 21],
      ['clan.saionji', 'off.saionji-sanemitsu', 'castle.kurose', 32],
    ]);
    const current = zClansFile.parse(existing).clans;
    const personalities = zPersonasFile.parse(personas).personas;
    for (const clan of batch.clans) {
      expect(current.find(({ id }) => id === clan.id)).toEqual(clan);
      expect(personalities.filter(({ id }) => id === clan.personaId)).toHaveLength(1);
      expect(geography.castles.find(({ id }) => id === clan.homeCastleId)).toMatchObject({
        tier: 'main',
        ownerClanId: clan.id,
        lordId: clan.leaderId,
      });
      expect(clan.courtRank).toBe('none');
      expect(clan.shogunateTitle).toBe('none');
    }
    const municipalHosts = new Set([
      'www.town.sakawa.lg.jp',
      'www.city.shimanto.lg.jp',
      'www.city.matsuyama.ehime.jp',
      'www.city.uwajima.ehime.jp',
    ]);
    for (const source of Object.values(provenance.sources))
      expect(municipalHosts.has(new URL(source.url).hostname)).toBe(true);
  });

  it('calibrates gold from actual joint territory and preserves all Miyoshi identity fields', () => {
    const ids = new Set(geography.castles.map(({ id }) => id));
    const districtIds = new Set(geography.districts.map(({ id }) => id));
    const castles = [...existingCastles.filter(({ id }) => !ids.has(id)), ...geography.castles];
    const districts = [
      ...existingDistricts.filter(({ id }) => !districtIds.has(id)),
      ...geography.districts,
    ];
    for (const clan of [...batch.clans, ...updates]) {
      const owned = new Set(
        castles.filter(({ ownerClanId }) => ownerClanId === clan.id).map(({ id }) => id),
      );
      const koku = districts
        .filter(({ castleId }) => owned.has(castleId))
        .reduce((sum, district) => sum + district.kokudaka, 0);
      expect(koku).toBeGreaterThan(0);
      expect(clan.gold).toBe(
        Math.round(((koku / 200) * (clan.id === 'clan.miyoshi' ? 1.3 : 1)) / 100) * 100,
      );
    }
    const old = zClansFile.parse(existing).clans.find(({ id }) => id === 'clan.miyoshi')!;
    expect(updates).toEqual([{ ...old, gold: updates[0]!.gold }]);
    expect(castles.filter(({ ownerClanId }) => ownerClanId === old.id)).toHaveLength(9);
    expect(geography.castles.filter(({ ownerClanId }) => ownerClanId === old.id)).toHaveLength(3);
  });

  it('adds only prescribed sentiments with closed staged endpoints', () => {
    expect(batch.diplomacy.pacts).toEqual([]);
    expect(batch.diplomacy.wars).toEqual([]);
    expect(batch.diplomacy.sentiments).toEqual([
      { a: 'clan.chosokabe', b: 'clan.ichijo', aToB: 75, bToA: 75 },
      { a: 'clan.kono', b: 'clan.mori', aToB: 70, bToA: 70 },
    ]);
    const ids = new Set([...zClansFile.parse(existing).clans, ...batch.clans].map(({ id }) => id));
    for (const { a, b } of batch.diplomacy.sentiments) {
      expect(ids.has(a)).toBe(true);
      expect(ids.has(b)).toBe(true);
    }
  });
});
