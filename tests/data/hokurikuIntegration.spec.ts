import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HOKURIKU_GEOGRAPHY as geography } from '../../src/data/scenarios/s1560/batches/hokuriku-geography';
import clansJson from '../../src/data/scenarios/s1560/batches/hokuriku-clans.json';
import officersJson from '../../src/data/scenarios/s1560/batches/officers/hokuriku.json';
import honganji from '../../src/data/scenarios/s1560/batches/hokuriku-honganji.json';
import { loadS1560Scenario, loadS1560EventCatalog } from '../../src/data/scenarios/s1560';
import { zClansFile, zOfficersFile } from '../../src/data/schemas';
import { REGION_VALUES } from '../../src/core/state/enums';
import { buildGameStateFromScenario } from '../../src/core/state/builder';
import { validateState } from '../../src/core/state/invariants';
import { stateHash } from '../../src/core/state/serialize';
import { castleMaxSoldiers } from '../../src/core/domestic';
import { advanceDay } from '../../src/core/systems';
import { createRuntimeEventEngine } from '../../src/core/systems/events/runtime';
import { CommandQueue, enqueuePendingAiOrders } from '../../src/core/commands/queue';
import { encodeSave, decodeSave } from '../../src/core/save/serialize';
import type { ClanId, CastleId } from '../../src/core/state/ids';
import {
  checkWorld,
  filterWorldByRegions,
  loadRawScenario,
  parseScenario,
} from '../../tools/validate';

const regions = ['tokai', 'kinki', 'kanto', 'koshinetsu', 'hokuriku'] as const;
const clans = zClansFile.parse(clansJson);
const officers = zOfficersFile.parse(officersJson);

async function productionState() {
  return buildGameStateFromScenario(await loadS1560Scenario(), {
    appVersion: 'b5-production-acceptance',
    seed: 42,
    playerClanId: 'clan.oda' as ClanId,
    difficulty: 'normal',
    regions,
  });
}

describe('production Hokuriku joint five-region acceptance', () => {
  it('passes actual static catalog/reference checks and partial-region closure', () => {
    const loaded = loadRawScenario('s1560');
    expect(loaded?.violations).toEqual([]);
    if (!loaded) throw new Error('Missing production scenario');
    const parsed = parseScenario(loaded.raw);
    expect(parsed.violations).toEqual([]);
    expect(checkWorld(filterWorldByRegions(parsed.world, regions), { regions })).toEqual([]);
    for (const subset of [
      ['tokai', 'kinki'],
      ['tokai', 'kinki', 'kanto', 'koshinetsu'],
    ] as const) {
      const partial = filterWorldByRegions(parsed.world, subset);
      expect(checkWorld(partial, { regions: subset })).toEqual([]);
      const retainedIds = partial.officerGroups.flatMap((group) =>
        group.officers.map((officer) => officer.id),
      );
      expect(retainedIds).not.toContain('off.sugiura-gennin');
      expect(retainedIds).not.toContain('off.shichiri-yorichika');
    }
  });

  it('closes all new families, capitals and cross-region Honganji ownership exactly once', async () => {
    const state = await productionState();
    expect(validateState(state)).toEqual([]);
    expect(Object.keys(state.castles)).toHaveLength(69);
    expect(Object.keys(state.districts)).toHaveLength(198);
    expect(Object.keys(state.provinces)).toHaveLength(30);
    expect(Object.keys(state.clans)).toHaveLength(23);
    for (const clan of clans.clans) {
      expect(state.clans[clan.id as ClanId]?.leaderId).toBe(clan.leaderId);
      expect(state.castles[clan.homeCastleId as CastleId]?.ownerClanId).toBe(clan.id);
    }
    expect(
      Object.values(state.castles).filter((c) => c.ownerClanId === 'clan.honganji'),
    ).toHaveLength(5);
    expect(Object.values(state.clans).filter((c) => c.id === 'clan.honganji')).toHaveLength(1);
    const bundle = await loadS1560Scenario();
    for (const key of ['provinces', 'castles', 'districts', 'roads'] as const)
      for (const entry of geography[key])
        expect(bundle[key].filter((row) => row.id === entry.id)).toEqual([entry]);
    for (const clan of clans.clans)
      expect(bundle.clans.filter((row) => row.id === clan.id)).toEqual([clan]);
    expect(bundle.officers[REGION_VALUES.indexOf('hokuriku')]).toEqual(officers.officers);
    for (const region of regions) {
      const raw: unknown = JSON.parse(
        readFileSync(
          new URL(`../../src/data/scenarios/s1560/officers/${region}.json`, import.meta.url),
          'utf8',
        ),
      );
      expect(bundle.officers[REGION_VALUES.indexOf(region)]).toEqual(
        zOfficersFile.parse(raw).officers,
      );
    }
    const ids = bundle.officers.flat().map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
    const kinki = bundle.officers[REGION_VALUES.indexOf('kinki')]!;
    expect(kinki.find((officer) => officer.id === 'off.sugiura-gennin')?.locationCastleId).toBe(
      'castle.daishoji',
    );
    expect(kinki.find((officer) => officer.id === 'off.shichiri-yorichika')?.locationCastleId).toBe(
      'castle.oyama-gobo',
    );
    expect(
      bundle.officers[REGION_VALUES.indexOf('hokuriku')]!.some(
        (officer) => officer.clanId === 'clan.honganji',
      ),
    ).toBe(false);
    expect(kinki.filter((officer) => officer.clanId === 'clan.honganji')).toHaveLength(15);
    for (const newOfficer of zOfficersFile.parse({
      version: 1,
      region: 'kinki',
      officers: honganji.newOfficers,
    }).officers)
      expect(kinki.filter((officer) => officer.id === newOfficer.id)).toEqual([newOfficer]);
    const honganjiCastleIds = new Set(
      bundle.castles
        .filter((castle) => castle.ownerClanId === 'clan.honganji')
        .map((castle) => castle.id),
    );
    const koku = bundle.districts
      .filter((district) => honganjiCastleIds.has(district.castleId))
      .reduce((sum, district) => sum + district.kokudaka, 0);
    expect(bundle.clans.find((clan) => clan.id === 'clan.honganji')?.gold).toBe(
      Math.round(koku / 200 / 100) * 100,
    );
    for (const castle of Object.values(state.castles))
      expect(castle.soldiers, castle.id).toBeLessThanOrEqual(castleMaxSoldiers(state, castle));
  });

  it('executes actual AI and canonical events deterministically across midpoint save/load', async () => {
    async function run(reload: boolean) {
      let state = await productionState();
      const engine = createRuntimeEventEngine(loadS1560EventCatalog());
      const queue = new CommandQueue();
      const hashes: string[] = [];
      let applied = 0;
      for (let day = 1; day <= 60; day++) {
        const eventId = state.events.pendingChoiceEventId;
        if (eventId !== null) {
          const command = {
            type: 'resolveEventChoice' as const,
            clanId: state.meta.playerClanId,
            eventId,
            choiceIndex: 0,
          };
          expect(engine.validateChoice(state, command)).toEqual({ ok: true });
          queue.enqueue(command, state.time.day);
        }
        enqueuePendingAiOrders(state, queue);
        const result = advanceDay(state, queue.drain(), { eventEngine: engine });
        applied += result.appliedCommands.length;
        expect(
          result.events.filter((e) => e.type === 'command.rejected'),
          `day ${day}`,
        ).toEqual([]);
        expect(validateState(state), `day ${day}`).toEqual([]);
        expect(
          state.ai.intentLog.filter(
            (i) => i.day === state.time.day && i.kind === 'error.invalidCommand',
          ),
          `day ${day}`,
        ).toEqual([]);
        hashes.push(stateHash(state));
        if (reload && day === 30) {
          const decoded = decodeSave(encodeSave(state, 0));
          expect(decoded.ok).toBe(true);
          if (!decoded.ok) throw new Error('Production Hokuriku save rejected');
          state = decoded.saveFile.state;
          expect(stateHash(state)).toBe(hashes.at(-1));
        }
      }
      expect(applied).toBeGreaterThan(0);
      return hashes;
    }
    const expected = await run(false);
    expect(await run(false)).toEqual(expected);
    expect(await run(true)).toEqual(expected);
  });
});
