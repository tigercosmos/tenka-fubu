import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import type { GameState } from '../../src/core/state/gameState';
import type { GameEvent } from '../../src/core/state/events';
import { applyMarch } from '../../src/core/commands/march';
import { beginSiege, siegeSystem } from '../../src/core/systems/siege';
import { militaryMovementSystem } from '../../src/core/systems/military';
import { dieOfficer } from '../../src/core/systems/officers';
import { destroyClanRemnants } from '../../src/core/systems/victory';
import { collapseExtinctClanCourt } from '../../src/core/systems/clanExtinction';
import { validateState } from '../../src/core/state/invariants';
import {
  buildTinyState,
  CLAN_ALPHA,
  CLAN_BETA,
  CASTLE_A1,
  CASTLE_B1,
  OFF_ALPHA_BUSHO,
  OFF_BETA_BUSHO,
  OFF_BETA_LORD,
} from '../fixtures/tiny';

function setup(): GameState {
  const state = buildTinyState();
  // The tiny fixture's beta represents the current shogun house; production IDs are not a mechanic.
  state.court.shogunateExists = true;
  state.court.shogunClanId = CLAN_BETA;
  state.court.patronClanId = CLAN_ALPHA;
  state.clans[CLAN_BETA]!.shogunateTitle = 'shogun';
  state.clans[CLAN_ALPHA]!.shogunateTitle = 'otomoshu';
  state.diplomacy.missions = [
    { fromClanId: CLAN_ALPHA, target: 'shogunate', officerId: OFF_ALPHA_BUSHO, startDay: 0 },
  ];
  return state;
}

function assertCollapse(state: GameState, events: GameEvent[], originalPrestige: number) {
  expect(state.court).toMatchObject({
    shogunateExists: false,
    shogunClanId: null,
    patronClanId: null,
  });
  expect(Object.values(state.clans).every((clan) => clan.shogunateTitle === 'none')).toBe(true);
  const bonus = BAL.shogunateTitleTable
    .filter(({ order }) => order <= 2)
    .reduce((sum, def) => sum + def.prestigeBonus, 0);
  expect(state.clans[CLAN_ALPHA]!.prestige).toBe(Math.max(0, originalPrestige - bonus));
  expect(state.diplomacy.missions).toEqual([]);
  expect(events.filter(({ type }) => type === 'shogunate.collapsed')).toHaveLength(1);
  const stopped = events.findIndex(({ type }) => type === 'diplo.workStopped');
  const collapsed = events.findIndex(({ type }) => type === 'shogunate.collapsed');
  const destroyed = events.findIndex(({ type }) => type === 'clan.destroyed');
  expect(stopped).toBeGreaterThanOrEqual(0);
  expect(collapsed).toBeGreaterThan(stopped);
  expect(destroyed).toBeGreaterThan(collapsed);
  const before = structuredClone(state);
  collapseExtinctClanCourt(state, CLAN_BETA, (event) => events.push(event));
  expect(state).toEqual(before);
  expect(events.filter(({ type }) => type === 'shogunate.collapsed')).toHaveLength(1);
}

function stripHoldings(state: GameState) {
  for (const castle of Object.values(state.castles))
    if (castle.ownerClanId === CLAN_BETA) {
      castle.ownerClanId = CLAN_ALPHA;
      castle.lordId = null;
      castle.tier = 'branch';
    }
  for (const district of Object.values(state.districts))
    if (district.ownerClanId === CLAN_BETA) {
      district.ownerClanId = CLAN_ALPHA;
      district.stewardId = null;
    }
}

describe('shogun house extinction uses canonical endShogunate effects', () => {
  it('other clan extinction does not touch the existing court, titles, prestige or donations', () => {
    const state = setup();
    const before = structuredClone(state);
    const events: GameEvent[] = [];
    collapseExtinctClanCourt(state, CLAN_ALPHA, (event) => events.push(event));
    expect(state).toEqual(before);
    expect(events).toEqual([]);
  });
  it('collapses through actual siege fall before clan destruction without additional RNG', () => {
    const state = setup();
    // Use another adult for the donation, keeping the siege leader unassigned to diplomacy.
    state.diplomacy.missions[0]!.officerId = state.clans[CLAN_ALPHA]!.leaderId;
    applyMarch(
      state,
      {
        type: 'march',
        clanId: CLAN_ALPHA,
        originCastleId: CASTLE_A1,
        targetNodeId: CASTLE_B1,
        leaderId: OFF_ALPHA_BUSHO,
        deputyIds: [],
        soldiers: 200,
        food: 100,
      },
      () => {},
    );
    const army = Object.values(state.armies)[0]!;
    army.posNodeId = CASTLE_B1;
    army.path = [CASTLE_B1];
    army.pathCursor = 0;
    army.edgeProgressDays = army.edgeCostDays = 0;
    army.status = 'holding';
    beginSiege(state, CASTLE_B1, army.id);
    state.castles[CASTLE_B1]!.soldiers = 0;
    const control = structuredClone(state);
    control.court.shogunClanId = null;
    const prestige = state.clans[CLAN_ALPHA]!.prestige;
    const events = siegeSystem(state);
    siegeSystem(control);
    expect(state.rng).toEqual(control.rng);
    expect(state.clans[CLAN_BETA]!.alive).toBe(false);
    assertCollapse(state, events, prestige);
    expect(validateState(state)).toEqual([]);
  });

  it('collapses through military no-castle disband without additional RNG', () => {
    const state = setup();
    applyMarch(
      state,
      {
        type: 'march',
        clanId: CLAN_BETA,
        originCastleId: CASTLE_B1,
        targetNodeId: CASTLE_A1,
        leaderId: OFF_BETA_BUSHO,
        deputyIds: [],
        soldiers: 100,
        food: 100,
      },
      () => {},
    );
    const army = Object.values(state.armies)[0]!;
    stripHoldings(state);
    army.soldiers = 0;
    const rng = structuredClone(state.rng),
      prestige = state.clans[CLAN_ALPHA]!.prestige;
    const events = militaryMovementSystem(state);
    expect(state.rng).toEqual(rng);
    expect(state.armies[army.id]).toBeUndefined();
    assertCollapse(state, events, prestige);
    expect(validateState(state)).toEqual([]);
  });

  it('collapses through ordinary no-heir death without changing territory or death RNG', () => {
    const state = setup();
    for (const officer of Object.values(state.officers))
      if (officer.clanId === CLAN_BETA && officer.id !== OFF_BETA_LORD) officer.kinship = 'fudai';
    const owners = Object.values(state.castles).map(({ id, ownerClanId }) => [id, ownerClanId]);
    const rng = structuredClone(state.rng),
      flags = structuredClone(state.events.flags),
      prestige = state.clans[CLAN_ALPHA]!.prestige;
    const events = dieOfficer(state, OFF_BETA_LORD, CASTLE_B1, false, 'age');
    expect(events[0]?.type).toBe('officer.died');
    expect(state.rng).toEqual(rng);
    expect(state.events.flags).toEqual(flags);
    expect(Object.values(state.castles).map(({ id, ownerClanId }) => [id, ownerClanId])).toEqual(
      owners,
    );
    assertCollapse(state, events, prestige);
  });

  it('victory cleanup also applies title prestige removal and stops donations exactly once', () => {
    const state = setup();
    stripHoldings(state);
    const events: GameEvent[] = [];
    const rng = structuredClone(state.rng),
      prestige = state.clans[CLAN_ALPHA]!.prestige;
    expect(destroyClanRemnants(state, state.clans[CLAN_BETA]!, events)).toBe(true);
    expect(state.rng).toEqual(rng);
    assertCollapse(state, events, prestige);
    expect(validateState(state)).toEqual([]);
  });
});
