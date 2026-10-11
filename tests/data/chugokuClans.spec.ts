import { describe, expect, it } from 'vitest';
import {
  CHUGOKU_CLANS as batch,
  CHUGOKU_EXISTING_CLAN_UPDATES as updates,
} from '../../src/data/scenarios/s1560/batches/chugoku-clans';
import { CHUGOKU_GEOGRAPHY as geography } from '../../src/data/scenarios/s1560/batches/chugoku-geography';
import existing from '../../src/data/scenarios/s1560/clans.json';
import existingCastles from '../../src/data/scenarios/s1560/castles.json';
import existingDistricts from '../../src/data/scenarios/s1560/districts.json';
import personas from '../../src/data/scenarios/s1560/personas.json';
import { zClansFile, zPersonasFile } from '../../src/data/schemas';

describe('staged Chugoku clan payload', () => {
  it('has the four prescribed new identities and no duplicate Yamana clan', () => {
    expect(
      batch.clans.map(({ id, leaderId, homeCastleId, colorIndex }) => [
        id,
        leaderId,
        homeCastleId,
        colorIndex,
      ]),
    ).toEqual([
      ['clan.mori', 'off.mori-motonari', 'castle.yoshida-koriyama', 15],
      ['clan.amago', 'off.amago-haruhisa', 'castle.gassan-toda', 23],
      ['clan.uragami', 'off.uragami-munekage', 'castle.tenjinyama', 29],
      ['clan.akamatsu', 'off.akamatsu-harumasa', 'castle.okishio', 12],
    ]);
    const known = new Set(zClansFile.parse(existing).clans.map(({ id }) => id));
    const personalityIds = new Set(zPersonasFile.parse(personas).personas.map(({ id }) => id));
    for (const clan of batch.clans) {
      expect(known.has(clan.id)).toBe(true);
      expect(zClansFile.parse(existing).clans.filter(({ id }) => id === clan.id)).toEqual([clan]);
      expect(personalityIds.has(clan.personaId)).toBe(true);
      expect(geography.castles.find(({ id }) => id === clan.homeCastleId)).toMatchObject({
        ownerClanId: clan.id,
        lordId: clan.leaderId,
        tier: 'main',
      });
    }
  });

  it('calibrates actual joint resources, including existing Yamana territory', () => {
    const castleIds = new Set(geography.castles.map(({ id }) => id));
    const districtIds = new Set(geography.districts.map(({ id }) => id));
    const castles = [
      ...existingCastles.filter(({ id }) => !castleIds.has(id)),
      ...geography.castles,
    ];
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
      expect(clan.gold).toBe(Math.round(koku / 200 / 100) * 100);
    }
    const oldYamana = zClansFile.parse(existing).clans.find(({ id }) => id === 'clan.yamana')!;
    expect(updates).toHaveLength(1);
    expect(updates[0]).toEqual({ ...oldYamana, gold: updates[0]!.gold });
    expect(
      geography.castles.filter(({ ownerClanId }) => ownerClanId === oldYamana.id),
    ).toHaveLength(1);
  });

  it('adds only canonical diplomacy with actually loaded endpoints', () => {
    expect(batch.diplomacy.pacts).toEqual([]);
    expect(batch.diplomacy.wars).toEqual([{ a: 'clan.mori', b: 'clan.amago' }]);
    expect(batch.diplomacy.sentiments).toEqual([
      { a: 'clan.amago', b: 'clan.yamana', aToB: 40, bToA: 40 },
    ]);
    const ids = new Set([...zClansFile.parse(existing).clans, ...batch.clans].map(({ id }) => id));
    for (const row of [...batch.diplomacy.wars, ...batch.diplomacy.sentiments]) {
      expect(ids.has(row.a)).toBe(true);
      expect(ids.has(row.b)).toBe(true);
    }
  });
});
