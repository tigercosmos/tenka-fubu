import { describe, expect, it } from 'vitest';
import { buildGameStateFromScenario } from '../../src/core/state/builder';
import { validateState } from '../../src/core/state/invariants';
import type { ClanId, OfficerId } from '../../src/core/state/ids';
import { appointClanSuccessor, comingOfAge, salaryPayees } from '../../src/core/systems/officers';
import { calendarToDay, dayToCalendar } from '../../src/core/systems/time';
import { loadS1560Scenario } from '../../src/data/scenarios/s1560';
import { SCENARIO_BUNDLE_FIXTURE } from '../fixtures/scenarioBundle';

const options = {
  appVersion: 'test',
  seed: 42,
  playerClanId: 'clan.alpha' as ClanId,
  difficulty: 'normal' as const,
};
const retainerId = 'off.alpha-retainer' as OfficerId;

function fixture(birthYear: number, debutYear?: number, debutClanId?: string | null) {
  const bundle = structuredClone(SCENARIO_BUNDLE_FIXTURE);
  const officer = bundle.officers.flat().find((row) => row.id === retainerId)!;
  officer.birthYear = birthYear;
  officer.debutYear = debutYear;
  if (debutClanId !== undefined) officer.debutClanId = debutClanId;
  for (const district of bundle.districts.flat())
    if (district.stewardId === retainerId) district.stewardId = null;
  return bundle;
}

describe('scenario debut availability', () => {
  it.each([
    [1530, undefined, true, 1545],
    [1546, undefined, false, 1561],
    [1545, undefined, true, 1560],
    [1530, 1559, true, 1559],
    [1530, 1560, true, 1560],
    [1530, 1567, false, 1567],
    [1550, 1559, false, 1559],
  ] as const)(
    'birth %s / debut %s requires both age and debut date',
    (birth, debut, available, expectedDebut) => {
      const state = buildGameStateFromScenario(fixture(birth, debut), options);
      expect(state.officers[retainerId]!.hasComeOfAge).toBe(available);
      expect(state.officers[retainerId]!.debutYear).toBe(expectedDebut);
    },
  );

  it('keeps all five real delayed-adult Hokuriku officers unavailable at production boot', async () => {
    const state = buildGameStateFromScenario(await loadS1560Scenario(), {
      ...options,
      playerClanId: 'clan.oda' as ClanId,
    });
    const ids = [
      'torii-kagechika',
      'yusa-morimitsu',
      'nukui-kagetaka',
      'nukui-mitsumune',
      'toujin-chikahiro',
    ];
    for (const name of ids) {
      const officer = state.officers[`off.${name}` as OfficerId]!;
      expect(state.time.year - officer.birthYear).toBeGreaterThanOrEqual(15);
      expect(officer.debutYear).toBeGreaterThan(state.time.year);
      expect(officer.hasComeOfAge, officer.id).toBe(false);
      expect(salaryPayees(state, officer.clanId!).some((row) => row.id === officer.id)).toBe(false);
    }
    expect(validateState(state)).toEqual([]);
  });

  it.each([
    ['torii-kagechika', 1567],
    ['yusa-morimitsu', 1566],
    ['nukui-kagetaka', 1570],
    ['nukui-mitsumune', 1570],
    ['toujin-chikahiro', 1582],
  ] as const)('actual B5 %s appears once in %s', async (name, year) => {
    const state = buildGameStateFromScenario(await loadS1560Scenario(), {
      ...options,
      playerClanId: 'clan.oda' as ClanId,
    });
    const id = `off.${name}` as OfficerId;
    const officer = state.officers[id]!;
    state.time = {
      day: calendarToDay(year - 1, 1, 1),
      ...dayToCalendar(calendarToDay(year - 1, 1, 1)),
    };
    expect(
      comingOfAge(state).filter((event) => 'officerId' in event && event.officerId === id),
    ).toEqual([]);
    expect(officer.hasComeOfAge).toBe(false);
    state.time = { day: calendarToDay(year, 1, 1), ...dayToCalendar(calendarToDay(year, 1, 1)) };
    expect(
      comingOfAge(state).filter((event) => 'officerId' in event && event.officerId === id),
    ).toEqual([
      {
        type: 'officer.comingOfAge',
        day: state.time.day,
        clanIds: [officer.debutClanId],
        officerId: id,
        clanId: officer.debutClanId,
      },
    ]);
    expect(officer).toMatchObject({
      hasComeOfAge: true,
      status: 'serving',
      clanId: officer.debutClanId,
      locationCastleId: officer.debutCastleId,
      rank: 'kumigashira',
      merit: 0,
    });
    expect(
      comingOfAge(state).filter((event) => 'officerId' in event && event.officerId === id),
    ).toEqual([]);
  });

  it('enters once in the specified year with debut affiliation, location, rank and report', () => {
    const bundle = fixture(1530, 1567, 'clan.beta');
    const data = bundle.officers.flat().find((row) => row.id === retainerId)!;
    data.debutCastleId = 'castle.b1';
    data.isKin = true;
    const state = buildGameStateFromScenario(bundle, options);
    const officer = state.officers[retainerId]!;
    expect(salaryPayees(state, options.playerClanId).some((row) => row.id === retainerId)).toBe(
      false,
    );
    const succession = structuredClone(state);
    succession.officers['off.alpha-lord' as OfficerId]!.status = 'dead';
    expect(
      appointClanSuccessor(succession, options.playerClanId, 'off.alpha-lord' as OfficerId),
    ).toBeNull();
    state.time = { day: calendarToDay(1566, 1, 1), ...dayToCalendar(calendarToDay(1566, 1, 1)) };
    expect(comingOfAge(state)).toEqual([]);
    state.time = { day: calendarToDay(1567, 1, 1), ...dayToCalendar(calendarToDay(1567, 1, 1)) };
    expect(comingOfAge(state)).toEqual([
      {
        type: 'officer.comingOfAge',
        day: state.time.day,
        clanIds: ['clan.beta'],
        officerId: retainerId,
        clanId: 'clan.beta',
      },
    ]);
    expect(officer).toMatchObject({
      hasComeOfAge: true,
      status: 'serving',
      clanId: 'clan.beta',
      locationCastleId: 'castle.b1',
      rank: 'kumigashira',
      merit: 0,
    });
    expect(comingOfAge(state)).toEqual([]);
  });

  it('preserves explicit null debut affiliation and death scheduling RNG', () => {
    const future = buildGameStateFromScenario(fixture(1530, 1567, null), options);
    const past = buildGameStateFromScenario(fixture(1530, 1559, null), options);
    expect(future.rng).toEqual(past.rng);
    expect(future.officers[retainerId]!.scheduledDeath).toEqual(
      past.officers[retainerId]!.scheduledDeath,
    );
    expect(future.officers[retainerId]!.debutClanId).toBeNull();
    future.time = { day: calendarToDay(1567, 1, 1), ...dayToCalendar(calendarToDay(1567, 1, 1)) };
    expect(comingOfAge(future)).toHaveLength(1);
    expect(future.officers[retainerId]).toMatchObject({
      hasComeOfAge: true,
      clanId: null,
      status: 'ronin',
      locationCastleId: 'castle.a1',
    });
    expect(comingOfAge(future)).toEqual([]);
  });
});
