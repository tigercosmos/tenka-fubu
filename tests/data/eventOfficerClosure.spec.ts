import { describe, expect, it } from 'vitest';
import tokai from '../../src/data/scenarios/s1560/officers/tokai.json';
import kinki from '../../src/data/scenarios/s1560/officers/kinki.json';
import { loadS1560Scenario, loadS1560EventCatalog } from '../../src/data/scenarios/s1560';
import { zOfficersFile } from '../../src/data/schemas';
import { buildGameStateFromScenario } from '../../src/core/state/builder';
import type { ClanId, OfficerId } from '../../src/core/state/ids';
import { validateState } from '../../src/core/state/invariants';
import { comingOfAge, salaryPayees, appointClanSuccessor } from '../../src/core/systems/officers';
import { calendarToDay, dayToCalendar } from '../../src/core/systems/time';
import { applyEventEffects } from '../../src/core/systems/events/effects';
import { checkWorld, loadRawScenario, parseScenario } from '../../tools/validate';

const yoshiakiId = 'off.ashikaga-yoshiaki' as OfficerId;
const nobutadaId = 'off.oda-nobutada' as OfficerId;
const ashikagaId = 'clan.ashikaga' as ClanId;
const odaId = 'clan.oda' as ClanId;
async function boot() {
  return buildGameStateFromScenario(await loadS1560Scenario(), {
    appVersion: 'event-officer-closure',
    seed: 42,
    playerClanId: odaId,
    difficulty: 'normal',
  });
}
function setYear(state: Awaited<ReturnType<typeof boot>>, year: number) {
  const day = calendarToDay(year, 1, 1);
  state.time = { day, ...dayToCalendar(day) };
}

describe('production historical-event officer reference closure', () => {
  it('loads each source-qualified person exactly once in the clan-home roster', async () => {
    const bundle = await loadS1560Scenario();
    expect(bundle.officers.flat().filter(({ id }) => id === nobutadaId)).toHaveLength(1);
    expect(bundle.officers.flat().filter(({ id }) => id === yoshiakiId)).toHaveLength(1);
    expect(zOfficersFile.parse(tokai).officers.find(({ id }) => id === nobutadaId)).toMatchObject({
      name: '織田信忠',
      birthYear: 1557,
      deathYear: 1582,
      isKin: true,
      clanId: odaId,
      debutYear: 1572,
      debutClanId: odaId,
    });
    expect(zOfficersFile.parse(kinki).officers.find(({ id }) => id === yoshiakiId)).toMatchObject({
      name: '足利義昭',
      birthYear: 1537,
      deathYear: 1597,
      isKin: true,
      clanId: null,
      debutYear: 1566,
      debutClanId: ashikagaId,
    });
    expect(zOfficersFile.parse(tokai)).not.toHaveProperty('_eventOfficerAuthoring');
    expect(zOfficersFile.parse(kinki)).not.toHaveProperty('_eventOfficerAuthoring');
  });

  it('preserves sourced dates, kinship and disputed debut chronology outside runtime data', () => {
    expect(tokai._provenance['off.oda-nobutada']).toMatchObject({
      birthYear: 'verified',
      deathYear: 'verified',
      debutYear: 'source-qualified',
      isKin: 'verified',
    });
    expect(tokai._eventOfficerAuthoring.sourceBoundaries).toContain('1573');
    expect(tokai._eventOfficerAuthoring.sourceBoundaries).toContain('No early eligible heir');
    expect(kinki._provenance['off.ashikaga-yoshiaki']).toMatchObject({
      birthYear: 'verified',
      deathYear: 'verified',
      debutYear: 'source-qualified',
      isKin: 'verified',
    });
    expect(kinki._eventOfficerAuthoring.sourceBoundaries).toContain('inactive approximation');
    for (const file of [tokai, kinki])
      for (const source of Object.values(file._eventOfficerAuthoring.sources))
        expect(source).toMatch(/^https:\/\//);
  });

  it('closes all unfiltered catalog references and passes complete national validation', () => {
    const loaded = loadRawScenario('s1560');
    expect(loaded?.violations).toEqual([]);
    if (!loaded) throw new Error('Missing production scenario');
    const parsed = parseScenario(loaded.raw);
    expect(parsed.violations).toEqual([]);
    const violations = checkWorld(parsed.world);
    expect(violations.filter(({ check }) => check === 'V3')).toEqual([]);
    expect(violations).toEqual([]);
  });

  it('does not grant a juvenile or monk early availability, salary or Ashikaga succession', async () => {
    const state = await boot();
    expect(state.officers[nobutadaId]).toMatchObject({ hasComeOfAge: false, debutYear: 1572 });
    expect(state.officers[yoshiakiId]).toMatchObject({
      hasComeOfAge: false,
      status: 'ronin',
      clanId: null,
      debutYear: 1566,
    });
    expect(salaryPayees(state, odaId).some(({ id }) => id === nobutadaId)).toBe(false);
    expect(salaryPayees(state, ashikagaId).some(({ id }) => id === yoshiakiId)).toBe(false);
    const succession = structuredClone(state);
    succession.officers['off.ashikaga-yoshiteru' as OfficerId]!.status = 'dead';
    expect(
      appointClanSuccessor(succession, ashikagaId, 'off.ashikaga-yoshiteru' as OfficerId),
    ).toBeNull();
    expect(validateState(state)).toEqual([]);
  });

  it.each([
    [yoshiakiId, 1566, ashikagaId],
    [nobutadaId, 1572, odaId],
  ] as const)(
    '%s becomes available once at the selected %s debut year',
    async (id, year, clanId) => {
      const state = await boot();
      setYear(state, year - 1);
      expect(
        comingOfAge(state).filter((event) => 'officerId' in event && event.officerId === id),
      ).toEqual([]);
      expect(state.officers[id]!.hasComeOfAge).toBe(false);
      setYear(state, year);
      expect(
        comingOfAge(state).filter((event) => 'officerId' in event && event.officerId === id),
      ).toEqual([
        {
          type: 'officer.comingOfAge',
          day: state.time.day,
          clanIds: [clanId],
          officerId: id,
          clanId,
        },
      ]);
      expect(state.officers[id]).toMatchObject({ hasComeOfAge: true, status: 'serving', clanId });
      expect(
        comingOfAge(state).filter((event) => 'officerId' in event && event.officerId === id),
      ).toEqual([]);
      expect(validateState(state)).toEqual([]);
    },
  );

  it('resolves the actual Honnoji Nobutada effect against production without changing unrelated references', async () => {
    const state = await boot();
    setYear(state, 1572);
    comingOfAge(state);
    const effect = loadS1560EventCatalog()
      .find(({ id }) => id === 'evt.honnoji')!
      .choices[0]!.effects.find((op) => op.op === 'killOfficer' && op.officerId === nobutadaId)!;
    expect(effect).toBeDefined();
    const rng = structuredClone(state.rng);
    applyEventEffects(state, [effect], null, () => undefined);
    expect(state.officers[nobutadaId]!.status).toBe('dead');
    expect(state.officers['off.oda-nobunaga' as OfficerId]!.status).toBe('serving');
    expect(state.clans[odaId]!.alive).toBe(true);
    expect(state.rng).toEqual(rng);
    expect(validateState(state)).toEqual([]);
  });
});
