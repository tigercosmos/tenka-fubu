import { describe, expect, it } from 'vitest';
import batchJson from '../../src/data/scenarios/s1560/batches/hokuriku-clans.json';
import existingJson from '../../src/data/scenarios/s1560/clans.json';
import personasJson from '../../src/data/scenarios/s1560/personas.json';
import { zClansFile, zPersonasFile } from '../../src/data/schemas';
import { HOKURIKU_GEOGRAPHY as geography } from '../../src/data/scenarios/s1560/batches/hokuriku-geography';
import { loadS1560Scenario } from '../../src/data/scenarios/s1560';

const batch = zClansFile.parse(batchJson);

describe('Hokuriku clan authoring batch', () => {
  it('integrates every reviewed clan and sentiment into production exactly once', async () => {
    const production = await loadS1560Scenario();
    for (const clan of batch.clans)
      expect(production.clans.filter(({ id }) => id === clan.id)).toEqual([clan]);
    for (const row of batch.diplomacy.sentiments)
      expect(
        production.diplomacy.sentiments.filter(({ a, b }) => a === row.a && b === row.b),
      ).toEqual([row]);
  });

  it('uses all three canonical identities, main castles, and palette indices', () => {
    expect(
      batch.clans.map(({ id, leaderId, homeCastleId, colorIndex }) => [
        id,
        leaderId,
        homeCastleId,
        colorIndex,
      ]),
    ).toEqual([
      ['clan.asakura', 'off.asakura-yoshikage', 'castle.ichijodani', 22],
      ['clan.hatakeyama', 'off.hatakeyama-yoshitsuna', 'castle.nanao', 14],
      ['clan.jinbo', 'off.jinbo-nagamoto', 'castle.toyama', 37],
    ]);
    const personas = new Set(zPersonasFile.parse(personasJson).personas.map(({ id }) => id));
    for (const clan of batch.clans) {
      expect(personas.has(clan.personaId)).toBe(true);
      expect(geography.castles.find(({ id }) => id === clan.homeCastleId)).toMatchObject({
        ownerClanId: clan.id,
        lordId: clan.leaderId,
        tier: 'main',
      });
    }
  });

  it('calibrates each new treasury from actual staged district resources', () => {
    for (const clan of batch.clans) {
      const castles = new Set(
        geography.castles.filter(({ ownerClanId }) => ownerClanId === clan.id).map(({ id }) => id),
      );
      const koku = geography.districts
        .filter(({ castleId }) => castles.has(castleId))
        .reduce((sum, district) => sum + district.kokudaka, 0);
      expect(clan.gold).toBe(Math.round(koku / 200 / 100) * 100);
    }
  });

  it('closes canonical sentiment links without inventing pacts or wars', () => {
    expect(batch.diplomacy.pacts).toEqual([]);
    expect(batch.diplomacy.wars).toEqual([]);
    expect(batch.diplomacy.sentiments).toEqual([
      { a: 'clan.asakura', b: 'clan.honganji', aToB: 35, bToA: 35 },
      { a: 'clan.azai', b: 'clan.asakura', aToB: 80, bToA: 80 },
    ]);
    const ids = new Set(
      [...zClansFile.parse(existingJson).clans, ...batch.clans].map(({ id }) => id),
    );
    for (const entry of batch.diplomacy.sentiments) {
      expect(ids.has(entry.a)).toBe(true);
      expect(ids.has(entry.b)).toBe(true);
    }
  });
});
