import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import {
  applyMarch,
  applyRecallArmy,
  applySetArmyTarget,
  policyMoraleBonus,
  validateSetAutoReturn,
  validateSetSiegeMode,
  validateMarch,
  validateRecallArmy,
} from '../../src/core/commands/march';
import { applyUnpaidSalaryPenalty, dieOfficer } from '../../src/core/systems/officers';
import { economySystem } from '../../src/core/systems/economy';
import { garrisonFoodMonthly } from '../../src/core/domestic';
import { militaryMovementSystem } from '../../src/core/systems/military';
import { fieldCombatSystem, startFieldCombat } from '../../src/core/systems/fieldCombat';
import { applyAwe } from '../../src/core/systems/awe';
import {
  beginSiege,
  combinedSiegeMitigation,
  facilitySiegeMitigation,
  siegeSystem,
} from '../../src/core/systems/siege';
import {
  nearestOwnedCastleByHops,
  nearestOwnedCastleByTravelTime,
} from '../../src/core/systems/castleSelection';
import { validateState } from '../../src/core/state/invariants';
import { defaultDiplomacyRow, pairKey } from '../../src/core/state/serialize';
import { mulberry32Next } from '../../src/core/rng';
import type { Army, GameState } from '../../src/core/state/gameState';
import type {
  ArmyId,
  CastleId,
  ClanId,
  MapNodeId,
  OfficerId,
  RoadEdgeId,
} from '../../src/core/state/ids';
import type { GameEvent } from '../../src/core/state/events';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  DIST_A1X,
  DIST_B1X,
  OFF_ALPHA_BUSHO,
  OFF_ALPHA_LORD,
  OFF_ALPHA_TAISHO,
  OFF_BETA_BUSHO,
  OFF_BETA_LORD,
  OFF_BETA_TAISHO,
} from '../fixtures/tiny';

function deploy(
  state: GameState,
  clanId: ClanId,
  originCastleId: CastleId,
  leaderId: OfficerId,
  targetNodeId: MapNodeId,
  soldiers = 200,
): Army {
  const events: GameEvent[] = [];
  const before = new Set(Object.keys(state.armies));
  applyMarch(
    state,
    {
      type: 'march',
      clanId,
      originCastleId,
      leaderId,
      deputyIds: [],
      soldiers,
      food: Math.ceil(soldiers * BAL.fieldFoodPerSoldierDaily * 30),
      targetNodeId,
    },
    (event) => events.push(event),
  );
  const id = Object.keys(state.armies).find((candidate) => !before.has(candidate)) as ArmyId;
  expect(events.some((event) => event.type === 'army.departed')).toBe(true);
  return state.armies[id]!;
}

function place(army: Army, nodeId: MapNodeId, status: Army['status'] = 'holding'): void {
  army.posNodeId = nodeId;
  army.path = [nodeId];
  army.pathCursor = 0;
  army.edgeProgressDays = 0;
  army.edgeCostDays = 0;
  army.status = status;
}

function rngSeedWhere(predicate: (first: number, second: number) => boolean): number {
  for (let seed = 0; seed < 100_000; seed += 1) {
    const [first, next] = mulberry32Next(seed);
    const [second] = mulberry32Next(next);
    if (predicate(first, second)) return seed;
  }
  throw new Error('test RNG seed not found');
}

type SiegeOfficerOutcome = 'escape' | 'death' | 'capture';

function rngSeedForSiegeOutcomes(expected: readonly SiegeOfficerOutcome[]): number {
  for (let seed = 0; seed < 100_000; seed += 1) {
    let stream = seed;
    const actual: SiegeOfficerOutcome[] = [];
    for (let index = 0; index < expected.length; index += 1) {
      const [escape, afterEscape] = mulberry32Next(stream);
      stream = afterEscape;
      if (escape < BAL.siegeEscapeChance) {
        actual.push('escape');
        continue;
      }
      const [death, afterDeath] = mulberry32Next(stream);
      stream = afterDeath;
      actual.push(death < BAL.siegeDeathChanceEscapeFail ? 'death' : 'capture');
    }
    if (actual.every((outcome, index) => outcome === expected[index])) return seed;
  }
  throw new Error('test siege outcome seed not found');
}

function setWar(state: GameState, a: ClanId, b: ClanId): void {
  const row = defaultDiplomacyRow(a, b);
  row.lastHostileDay = state.time.day;
  state.diplomacy.rows[pairKey(a, b)] = row;
}

/** A1 is two fast hops from B1; A2 is one deliberately slow hop. */
function configureTravelTimeVsHopCount(state: GameState): void {
  state.roads['road.a2-b1' as RoadEdgeId]!.baseDays = 10;
  state.roads['road.a1-a2' as RoadEdgeId]!.baseDays = 100;
  state.roads['road.a1-a1x' as RoadEdgeId]!.baseDays = 0.5;
  const id = 'road.b1-a1x-fast' as RoadEdgeId;
  state.roads[id] = {
    id,
    a: CASTLE_B1,
    b: DIST_A1X,
    type: 'land',
    grade: 1,
    baseDays: 0.5,
  };
}

function makeA2BetaRefuge(state: GameState): void {
  const refuge = state.castles[CASTLE_A2]!;
  refuge.ownerClanId = CLAN_BETA;
  refuge.lordId = null;
  for (const districtId of refuge.districtIds) {
    state.districts[districtId]!.ownerClanId = CLAN_BETA;
  }
  state.officers[OFF_BETA_TAISHO]!.locationCastleId = CASTLE_A2;
  state.officers[OFF_BETA_BUSHO]!.locationCastleId = CASTLE_A2;
}

describe('M4 軍事 core', () => {
  it('keeps future policy/facility hooks neutral with current content', () => {
    const state = buildTinyState();
    expect(policyMoraleBonus(state, CLAN_ALPHA)).toBe(0);
    expect(facilitySiegeMitigation(state, state.castles[CASTLE_A1]!)).toBe(0);
    expect(combinedSiegeMitigation(0.5, 0.4)).toBe(0.7);
    expect(combinedSiegeMitigation(0.3, -0.5)).toBe(0);
  });

  it('keeps M5 kassen offers disabled until the feature gate is enabled', () => {
    const state = buildTinyState();
    const alpha = deploy(state, CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, CASTLE_B1, 2_000);
    const beta = deploy(state, CLAN_BETA, CASTLE_B1, OFF_BETA_TAISHO, CASTLE_A2, 2_000);
    place(alpha, CASTLE_A2);
    place(beta, CASTLE_A2);

    const events = startFieldCombat(state, CASTLE_A2, [alpha.id], [beta.id]);

    expect(BAL.featureKassenEnabled).toBe(false);
    expect(events.some((event) => event.type === 'battle.kassenAvailable')).toBe(false);
  });

  it('M4-1 validates officer availability and classifies an allied castle as march, not conquer', () => {
    const state = buildTinyState();
    const row = defaultDiplomacyRow(CLAN_ALPHA, CLAN_BETA);
    row.pacts.push({
      kind: 'alliance',
      startDay: state.time.day,
      endDay: state.time.day + 360,
      vassalClanId: null,
    });
    state.diplomacy.rows[pairKey(CLAN_ALPHA, CLAN_BETA)] = row;
    const cmd = {
      type: 'march' as const,
      clanId: CLAN_ALPHA,
      originCastleId: CASTLE_A2,
      leaderId: OFF_ALPHA_TAISHO,
      deputyIds: [],
      soldiers: 200,
      food: 120,
      targetNodeId: CASTLE_B1,
    };
    expect(validateMarch(state, cmd)).toEqual({ ok: true });
    const army = deploy(state, CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, CASTLE_B1);
    expect(army.mission).toBe('march');
    expect(validateState(state)).toEqual([]);
  });

  it('M4-2 carries surplus movement across multiple short edges in one tick', () => {
    const state = buildTinyState();
    state.roads['road.a1-a2' as RoadEdgeId]!.baseDays = 0.4;
    state.roads['road.a2-b1' as RoadEdgeId]!.baseDays = 0.4;
    const army = deploy(state, CLAN_ALPHA, CASTLE_A1, OFF_ALPHA_BUSHO, CASTLE_B1);
    const events = militaryMovementSystem(state);
    expect(army.posNodeId).toBe(CASTLE_B1);
    expect(army.status).toBe('sieging');
    expect(events.map((event) => event.type)).toContain('siege.started');
    expect(validateState(state)).toEqual([]);
  });

  it('M4-3 applies starvation once, uses ceil desertion, and routes at the morale threshold', () => {
    const state = buildTinyState();
    const army = deploy(state, CLAN_ALPHA, CASTLE_A1, OFF_ALPHA_BUSHO, CASTLE_A2, 101);
    place(army, DIST_A1X, 'marching');
    army.food = 0;
    army.morale = BAL.moraleBreakThreshold + BAL.noFoodMoraleDaily;
    const events = militaryMovementSystem(state);
    expect(army.soldiers).toBe(87); // 5% starvation desertion, then that day's 8% routed loss
    expect(army.status).toBe('routed');
    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining(['army.routed']));
  });

  it('M4-4 advances established subjugation exactly once per day and preserves invariants', () => {
    const state = buildTinyState();
    const army = deploy(state, CLAN_ALPHA, CASTLE_A1, OFF_ALPHA_BUSHO, DIST_B1X);
    place(army, DIST_B1X, 'subjugating');
    state.districts[DIST_B1X]!.subjugation = { clanId: CLAN_ALPHA, progress: 0, daysRequired: 4 };
    militaryMovementSystem(state);
    expect(state.districts[DIST_B1X]!.subjugation?.progress).toBe(25);
    expect(validateState(state)).toEqual([]);
  });

  it('M4-5 detects opposite-edge crossings deterministically without breaking path invariants', () => {
    const state = buildTinyState();
    state.roads['road.a2-b1' as RoadEdgeId]!.baseDays = 1;
    const alpha = deploy(state, CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, CASTLE_B1);
    const beta = deploy(state, CLAN_BETA, CASTLE_B1, OFF_BETA_TAISHO, CASTLE_A2);
    const events = militaryMovementSystem(state);
    expect(events.some((event) => event.type === 'battle.started')).toBe(true);
    expect(alpha.status).toBe('engaged');
    expect(beta.status).toBe('engaged');
    expect(validateState(state)).toEqual([]);
  });

  it('M4-5 engages opposing armies halfway along a cost-2 edge when progress sums to its cost', () => {
    const state = buildTinyState();
    setWar(state, CLAN_ALPHA, CLAN_BETA);
    state.roads['road.a2-b1' as RoadEdgeId]!.baseDays = 2;
    const alpha = deploy(state, CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, CASTLE_B1);
    const beta = deploy(state, CLAN_BETA, CASTLE_B1, OFF_BETA_TAISHO, CASTLE_A2);
    militaryMovementSystem(state);
    expect(alpha.status).toBe('engaged');
    expect(beta.status).toBe('engaged');
    expect(Object.values(state.fieldCombats)).toHaveLength(1);
  });

  it('M4-5 detects same-direction pursuit when a faster rear army catches the front army', () => {
    const state = buildTinyState();
    setWar(state, CLAN_ALPHA, CLAN_BETA);
    state.roads['road.a2-b1' as RoadEdgeId]!.baseDays = 2;
    const rear = deploy(state, CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, CASTLE_B1);
    const front = deploy(state, CLAN_BETA, CASTLE_B1, OFF_BETA_TAISHO, CASTLE_A2);
    rear.path = [CASTLE_A2, CASTLE_B1];
    rear.posNodeId = CASTLE_A2;
    rear.pathCursor = 0;
    front.path = [CASTLE_A2, CASTLE_B1];
    front.targetNodeId = CASTLE_B1;
    front.posNodeId = CASTLE_A2;
    front.pathCursor = 0;
    rear.edgeProgressDays = 0.4;
    front.edgeProgressDays = 0.5;
    front.morale = BAL.marchLowMoraleThreshold - 1;
    const events = militaryMovementSystem(state);
    expect(rear.status).toBe('engaged');
    expect(front.status).toBe('engaged');
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'battle.started',
        defenderClanId: CLAN_BETA,
        attackerClanId: CLAN_ALPHA,
      }),
    );
  });

  it('M4-5 leaves neutral armies alone until territorial invasion materializes hostility', () => {
    const state = buildTinyState();
    const alpha = deploy(state, CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, CASTLE_B1);
    const beta = deploy(state, CLAN_BETA, CASTLE_B1, OFF_BETA_TAISHO, CASTLE_A2);
    place(alpha, CASTLE_A2);
    place(beta, CASTLE_A2);
    expect(militaryMovementSystem(state).some((event) => event.type === 'battle.started')).toBe(
      false,
    );

    place(alpha, DIST_B1X, 'marching');
    alpha.path = [DIST_B1X];
    militaryMovementSystem(state);
    expect(state.diplomacy.rows[pairKey(CLAN_ALPHA, CLAN_BETA)]?.lastHostileDay).toBe(
      state.time.day,
    );
  });

  it('M4-5 selects the two largest hostile clan troop groups at a multi-party node', () => {
    const state = buildTinyState();
    const gammaClan = 'clan.gamma' as ClanId;
    const gammaOfficer = 'off.gamma' as OfficerId;
    const gammaArmyId = 'army.999999' as ArmyId;
    const alpha = deploy(state, CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, CASTLE_B1, 100);
    const beta = deploy(state, CLAN_BETA, CASTLE_B1, OFF_BETA_TAISHO, CASTLE_A2, 200);
    state.clans[gammaClan] = {
      ...state.clans[CLAN_BETA]!,
      id: gammaClan,
      leaderId: gammaOfficer,
      name: '丙家',
    };
    state.officers[gammaOfficer] = {
      ...state.officers[OFF_BETA_TAISHO]!,
      id: gammaOfficer,
      clanId: gammaClan,
      armyId: gammaArmyId,
      locationCastleId: null,
      name: '丙將',
      loyalty: 100,
    };
    state.armies[gammaArmyId] = {
      ...beta,
      id: gammaArmyId,
      clanId: gammaClan,
      leaderId: gammaOfficer,
      soldiers: 300,
      initialTroops: 300,
    };
    place(alpha, CASTLE_A2);
    place(beta, CASTLE_A2);
    place(state.armies[gammaArmyId], CASTLE_A2);
    setWar(state, CLAN_BETA, gammaClan);
    militaryMovementSystem(state);
    const combat = Object.values(state.fieldCombats)[0]!;
    expect([...combat.sideA.clanIds, ...combat.sideB.clanIds].sort()).toEqual(
      [CLAN_BETA, gammaClan].sort(),
    );
    expect(alpha.status).toBe('holding');
  });

  it('M4-6 resolves simultaneous rout as no winner instead of inventing an empty winning side', () => {
    const state = buildTinyState();
    const alpha = deploy(state, CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, CASTLE_B1);
    const beta = deploy(state, CLAN_BETA, CASTLE_B1, OFF_BETA_TAISHO, CASTLE_A2);
    place(alpha, CASTLE_A2);
    place(beta, CASTLE_A2);
    startFieldCombat(state, CASTLE_A2, [alpha.id], [beta.id]);
    alpha.morale = BAL.moraleBreakThreshold;
    beta.morale = BAL.moraleBreakThreshold;
    const ended = fieldCombatSystem(state).find((event) => event.type === 'battle.ended');
    expect(ended?.type === 'battle.ended' ? ended.winnerClanId : 'missing').toBeNull();
  });

  it('M4-7 rolls pursuit deaths on rng.misc and cleans up an army whose leader dies', () => {
    const state = buildTinyState();
    const winner = deploy(state, CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, CASTLE_B1, 700);
    const loser = deploy(state, CLAN_BETA, CASTLE_B1, OFF_BETA_TAISHO, CASTLE_A2, 100);
    place(winner, CASTLE_A2);
    place(loser, CASTLE_A2);
    startFieldCombat(state, CASTLE_A2, [winner.id], [loser.id]);
    winner.morale = 100;
    loser.morale = BAL.moraleBreakThreshold;
    state.rng.misc = rngSeedWhere((first) => first < BAL.battleDeathChanceRout);
    const events = fieldCombatSystem(state);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'officer.died',
        officerId: OFF_BETA_TAISHO,
        cause: 'battle',
        nodeId: CASTLE_A2,
      }),
    );
    expect(state.officers[OFF_BETA_TAISHO]!.status).toBe('dead');
    expect(state.armies[loser.id]).toBeUndefined();
  });

  it('M4-7 resets defeated subjugation progress while the winner preserves the contested district', () => {
    const state = buildTinyState();
    const attacker = deploy(state, CLAN_ALPHA, CASTLE_A1, OFF_ALPHA_BUSHO, DIST_B1X);
    const defender = deploy(state, CLAN_BETA, CASTLE_B1, OFF_BETA_TAISHO, DIST_B1X);
    place(attacker, DIST_B1X);
    place(defender, DIST_B1X);
    state.districts[DIST_B1X]!.subjugation = { clanId: CLAN_ALPHA, progress: 50, daysRequired: 4 };
    startFieldCombat(state, DIST_B1X, [attacker.id], [defender.id]);
    attacker.morale = BAL.moraleBreakThreshold;
    defender.morale = 100;
    fieldCombatSystem(state);
    expect(state.districts[DIST_B1X]!.subjugation?.progress).toBe(0);
  });

  it('M4-8 flips only loser districts, clears subjugation, and resets subjugating armies', () => {
    const state = buildTinyState();
    state.districts[DIST_A1X]!.ownerClanId = CLAN_BETA;
    const army = deploy(state, CLAN_ALPHA, CASTLE_A1, OFF_ALPHA_BUSHO, DIST_A1X);
    place(army, DIST_A1X, 'subjugating');
    state.districts[DIST_A1X]!.subjugation = { clanId: CLAN_ALPHA, progress: 50, daysRequired: 4 };
    applyAwe(state, 'small', DIST_A1X, CLAN_ALPHA, CLAN_BETA, 'fc.test');
    expect(state.districts[DIST_A1X]!.ownerClanId).toBe(CLAN_ALPHA);
    expect(state.districts[DIST_A1X]!.subjugation).toBeNull();
    expect(army.status).not.toBe('subjugating');
  });

  it('M4-9 retarget and recall detach siege membership atomically', () => {
    const state = buildTinyState();
    const army = deploy(state, CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, CASTLE_B1);
    place(army, CASTLE_B1);
    beginSiege(state, CASTLE_B1, army.id);
    const emitted: GameEvent[] = [];
    applySetArmyTarget(
      state,
      { type: 'setArmyTarget', clanId: CLAN_ALPHA, armyId: army.id, targetNodeId: CASTLE_A1 },
      (event) => emitted.push(event),
    );
    expect(army.siegeId).toBeNull();
    expect(Object.keys(state.sieges)).toHaveLength(0);
    expect(emitted.some((event) => event.type === 'siege.ended')).toBe(true);
    expect(validateState(state)).toEqual([]);
  });

  it('M4-9 encirclement consumes morale/food without damaging durability', () => {
    const state = buildTinyState();
    const army = deploy(state, CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, CASTLE_B1, 700);
    place(army, CASTLE_B1);
    const [started] = beginSiege(state, CASTLE_B1, army.id);
    expect(started?.type).toBe('siege.started');
    const siege = Object.values(state.sieges)[0]!;
    state.castles[CASTLE_B1]!.soldiers = 100;
    siege.mode = 'encircle';
    const durability = state.castles[CASTLE_B1]!.durability;
    const food = state.castles[CASTLE_B1]!.food;
    siegeSystem(state);
    expect(state.castles[CASTLE_B1]!.durability).toBe(durability);
    expect(state.castles[CASTLE_B1]!.food).toBe(food);
    expect(state.castles[CASTLE_B1]!.foodFrac).toBeGreaterThan(0);
  });

  it('M4-9 makes normal plus encirclement consumption exactly 2x with one fractional accumulator', () => {
    const state = buildTinyState();
    const attacker = deploy(state, CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, CASTLE_B1, 700);
    place(attacker, CASTLE_B1);
    const castle = state.castles[CASTLE_B1]!;
    castle.soldiers = 100;
    beginSiege(state, CASTLE_B1, attacker.id);
    Object.values(state.sieges)[0]!.mode = 'encircle';
    const food = castle.food;
    const expected = Math.floor(
      (garrisonFoodMonthly(state, castle) / 30) * BAL.encircleFoodMult * 3,
    );

    for (let day = 0; day < 3; day += 1) {
      economySystem(state);
      siegeSystem(state);
      state.time.day += 1;
    }

    expect(food - castle.food).toBe(expected);
  });

  it('M4-9 takes 12–20 assault days for a representative branch castle and transfers its districts', () => {
    const state = buildTinyState();
    const army = deploy(state, CLAN_BETA, CASTLE_B1, OFF_BETA_TAISHO, CASTLE_A2, 200);
    army.soldiers = 8_000;
    army.initialTroops = 8_000;
    place(army, CASTLE_A2);
    const castle = state.castles[CASTLE_A2]!;
    castle.soldiers = 2_000;
    beginSiege(state, CASTLE_A2, army.id);
    let days = 0;
    while (Object.keys(state.sieges).length > 0 && days < 30) {
      siegeSystem(state);
      state.time.day += 1;
      days += 1;
    }
    expect(days).toBeGreaterThanOrEqual(12);
    expect(days).toBeLessThanOrEqual(20);
    expect(castle.ownerClanId).toBe(CLAN_BETA);
    for (const districtId of castle.districtIds) {
      expect(state.districts[districtId]!.ownerClanId).toBe(CLAN_BETA);
    }
  });

  it.each([
    ['escape', rngSeedWhere((first) => first < BAL.siegeEscapeChance), 'ronin'],
    [
      'capture',
      rngSeedWhere(
        (first, second) =>
          first >= BAL.siegeEscapeChance && second >= BAL.siegeDeathChanceEscapeFail,
      ),
      'captive',
    ],
    [
      'death',
      rngSeedWhere(
        (first, second) =>
          first >= BAL.siegeEscapeChance && second < BAL.siegeDeathChanceEscapeFail,
      ),
      'dead',
    ],
  ] as const)('M4-9 resolves siege defender %s outcome', (_label, miscSeed, expectedStatus) => {
    const state = buildTinyState();
    const attacker = deploy(state, CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, CASTLE_B1);
    place(attacker, CASTLE_B1);
    for (const officer of Object.values(state.officers)) {
      if (officer.clanId === CLAN_BETA && officer.id !== OFF_BETA_TAISHO)
        officer.locationCastleId = CASTLE_A1;
    }
    state.rng.misc = miscSeed;
    state.castles[CASTLE_B1]!.soldiers = 0;
    beginSiege(state, CASTLE_B1, attacker.id);
    const events = siegeSystem(state);
    expect(state.officers[OFF_BETA_TAISHO]!.status).toBe(expectedStatus);
    if (expectedStatus === 'captive') {
      expect(events).toContainEqual(
        expect.objectContaining({ type: 'officer.captured', officerId: OFF_BETA_TAISHO }),
      );
    }
    if (expectedStatus === 'dead') {
      expect(events).toContainEqual(
        expect.objectContaining({ type: 'officer.died', officerId: OFF_BETA_TAISHO }),
      );
    }
  });

  it.each([
    ['eligible kin heir', 'kin', OFF_BETA_TAISHO, 100, 60],
    ['emergency adult fallback', 'fudai', OFF_BETA_BUSHO, 75, 100],
  ] as const)(
    'M4-9 replaces a captured surviving leader via %s',
    (_label, heirKinship, expectedHeir, taishoLoyalty, bushoLoyalty) => {
      const state = buildTinyState();
      const attacker = deploy(state, CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, CASTLE_B1);
      makeA2BetaRefuge(state);
      place(attacker, CASTLE_B1);
      state.officers[OFF_BETA_TAISHO]!.kinship = heirKinship;
      state.rng.misc = rngSeedWhere(
        (first, second) =>
          first >= BAL.siegeEscapeChance && second >= BAL.siegeDeathChanceEscapeFail,
      );
      state.castles[CASTLE_B1]!.soldiers = 0;
      beginSiege(state, CASTLE_B1, attacker.id);

      const events = siegeSystem(state);

      expect(state.officers[OFF_BETA_LORD]).toMatchObject({
        status: 'captive',
        clanId: CLAN_BETA,
        capturedByClanId: CLAN_ALPHA,
      });
      expect(state.clans[CLAN_BETA]!.leaderId).toBe(expectedHeir);
      expect(state.officers[OFF_BETA_TAISHO]!.loyalty).toBe(taishoLoyalty);
      expect(state.officers[OFF_BETA_BUSHO]!.loyalty).toBe(bushoLoyalty);
      expect(events).toContainEqual(
        expect.objectContaining({
          type: 'clan.succession',
          deceasedId: OFF_BETA_LORD,
          heirId: expectedHeir,
        }),
      );
      expect(validateState(state)).toEqual([]);
    },
  );

  it('M4-9 selects a captured leader successor only after every defender outcome resolves', () => {
    const state = buildTinyState();
    const attacker = deploy(state, CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, CASTLE_B1);
    makeA2BetaRefuge(state);
    place(attacker, CASTLE_B1);
    state.officers[OFF_BETA_BUSHO]!.locationCastleId = CASTLE_B1;
    state.officers[OFF_BETA_LORD]!.locationCastleId = CASTLE_B1;
    state.officers[OFF_BETA_TAISHO]!.locationCastleId = CASTLE_B1;
    state.officers[OFF_BETA_TAISHO]!.kinship = 'kin';
    state.rng.misc = rngSeedForSiegeOutcomes(['escape', 'capture', 'capture']);
    state.castles[CASTLE_B1]!.soldiers = 0;
    beginSiege(state, CASTLE_B1, attacker.id);

    const events = siegeSystem(state);
    const successions = events.filter((event) => event.type === 'clan.succession');

    expect(state.officers[OFF_BETA_TAISHO]!.status).toBe('captive');
    expect(state.officers[OFF_BETA_BUSHO]).toMatchObject({
      status: 'serving',
      locationCastleId: CASTLE_A2,
    });
    expect(state.clans[CLAN_BETA]!.leaderId).toBe(OFF_BETA_BUSHO);
    expect(successions).toEqual([
      expect.objectContaining({ deceasedId: OFF_BETA_LORD, heirId: OFF_BETA_BUSHO }),
    ]);
    expect(validateState(state)).toEqual([]);
  });

  it('M4-9 atomically absorbs all remaining territory when seed 10 captures every defender', () => {
    const state = buildTinyState();
    const attacker = deploy(state, CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, CASTLE_B1);
    makeA2BetaRefuge(state);
    place(attacker, CASTLE_B1);
    for (const officer of Object.values(state.officers)) {
      if (officer.clanId === CLAN_BETA) officer.locationCastleId = CASTLE_B1;
    }
    state.rng.misc = 10;
    state.castles[CASTLE_B1]!.soldiers = 0;
    beginSiege(state, CASTLE_B1, attacker.id);

    const events = siegeSystem(state);

    expect(
      [OFF_BETA_BUSHO, OFF_BETA_LORD, OFF_BETA_TAISHO].map(
        (officerId) => state.officers[officerId]!.status,
      ),
    ).toEqual(['captive', 'captive', 'captive']);
    expect(state.clans[CLAN_BETA]!.alive).toBe(false);
    expect(
      Object.values(state.castles).some((candidate) => candidate.ownerClanId === CLAN_BETA),
    ).toBe(false);
    expect(
      Object.values(state.districts).some((candidate) => candidate.ownerClanId === CLAN_BETA),
    ).toBe(false);
    expect(events.filter((event) => event.type === 'clan.destroyed')).toEqual([
      expect.objectContaining({ clanId: CLAN_BETA, byClanId: null }),
    ]);
    expect(validateState(state)).toEqual([]);
  });

  it('M4-9 rejects recall when no owned castle is reachable instead of succeeding as a no-op', () => {
    const state = buildTinyState();
    const army = deploy(state, CLAN_ALPHA, CASTLE_A1, OFF_ALPHA_BUSHO, CASTLE_A2);
    state.castles[CASTLE_A1]!.ownerClanId = CLAN_BETA;
    state.castles[CASTLE_A2]!.ownerClanId = CLAN_BETA;
    expect(
      validateRecallArmy(state, { type: 'recallArmy', clanId: CLAN_ALPHA, armyId: army.id }),
    ).toEqual({ ok: false, reasonKey: 'cmd.reject.pathBlocked' });
  });

  it('M4-10 interrupts a siege for relief and keeps the dual combat/siege linkage invariant-valid', () => {
    const state = buildTinyState();
    const attacker = deploy(state, CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, CASTLE_B1);
    const relief = deploy(state, CLAN_BETA, CASTLE_B1, OFF_BETA_TAISHO, CASTLE_A2);
    place(attacker, CASTLE_B1);
    place(relief, CASTLE_B1);
    beginSiege(state, CASTLE_B1, attacker.id);
    const events = militaryMovementSystem(state);
    expect(events.some((event) => event.type === 'siege.relief')).toBe(true);
    expect(Object.values(state.sieges)[0]?.interrupted).toBe(true);
    expect(validateState(state)).toEqual([]);
  });

  it('M4-11 suppresses an uprising on arrival and applies the canonical security floor', () => {
    const state = buildTinyState();
    const army = deploy(state, CLAN_ALPHA, CASTLE_A1, OFF_ALPHA_BUSHO, DIST_A1X);
    place(army, DIST_A1X, 'marching');
    state.districts[DIST_A1X]!.uprising = { startedOnDay: state.time.day, armySoldiers: 100 };
    state.districts[DIST_A1X]!.publicOrder = 10;
    const events = militaryMovementSystem(state);
    expect(state.districts[DIST_A1X]!.uprising).toBeNull();
    expect(state.districts[DIST_A1X]!.publicOrder).toBe(BAL.securityAfterSuppress);
    expect(events.some((event) => event.type === 'uprising.ended')).toBe(true);
  });

  it('auto-returns after mission completion but does not abandon a final-stage siege for low food', () => {
    const completed = buildTinyState();
    completed.roads['road.a1-a2' as RoadEdgeId]!.baseDays = 0.5;
    const returning = deploy(completed, CLAN_ALPHA, CASTLE_A1, OFF_ALPHA_BUSHO, CASTLE_A2);
    militaryMovementSystem(completed);
    expect(completed.armies[returning.id]).toBeUndefined();

    const districtComplete = buildTinyState();
    const subjugator = deploy(districtComplete, CLAN_ALPHA, CASTLE_A1, OFF_ALPHA_BUSHO, DIST_A1X);
    place(subjugator, DIST_A1X, 'holding');
    militaryMovementSystem(districtComplete);
    expect(districtComplete.armies[subjugator.id]).toBeUndefined();

    const finalSiege = buildTinyState();
    const besieger = deploy(finalSiege, CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, CASTLE_B1);
    place(besieger, CASTLE_B1);
    beginSiege(finalSiege, CASTLE_B1, besieger.id);
    const castle = finalSiege.castles[CASTLE_B1]!;
    castle.morale = 20;
    castle.durability = castle.maxDurability * 0.2;
    besieger.food = Math.ceil(besieger.soldiers * BAL.fieldFoodPerSoldierDaily * 2);
    militaryMovementSystem(finalSiege);
    expect(besieger.status).toBe('sieging');
    expect(besieger.siegeId).not.toBeNull();
  });

  it('captures Step-6 unpaid payees so a Step-8 status change cannot remove the penalty target', () => {
    const state = buildTinyState();
    state.time.dayOfMonth = 1;
    for (const district of Object.values(state.districts)) district.commerce = 0;
    state.clans[CLAN_ALPHA]!.gold = 0;
    const payee = state.officers[OFF_ALPHA_BUSHO]!;
    const event = economySystem(state).find(
      (candidate) => candidate.type === 'economy.upkeepUnpaid' && candidate.clanId === CLAN_ALPHA,
    );
    expect(event?.type).toBe('economy.upkeepUnpaid');
    const before = payee.loyalty;
    payee.status = 'captive';
    payee.capturedByClanId = CLAN_BETA;
    applyUnpaidSalaryPenalty(
      state,
      new Set(event?.type === 'economy.upkeepUnpaid' ? event.payeeIds : []),
    );
    expect(payee.loyalty).toBe(before - BAL.unpaidSalaryLoyaltyPenalty);
  });

  it('does not apply normal garrison starvation penalties on top of siege starvation', () => {
    const state = buildTinyState();
    const attacker = deploy(state, CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, CASTLE_B1);
    place(attacker, CASTLE_B1);
    beginSiege(state, CASTLE_B1, attacker.id);
    const castle = state.castles[CASTLE_B1]!;
    castle.food = 0;
    const soldiers = castle.soldiers;
    const morale = castle.morale;
    const economyEvents = economySystem(state);
    expect(castle.soldiers).toBe(soldiers);
    expect(castle.morale).toBe(morale);
    expect(
      economyEvents.some(
        (event) => event.type === 'economy.foodShortage' && event.castleId === castle.id,
      ),
    ).toBe(false);
    siegeSystem(state);
    expect(castle.morale).toBeLessThan(morale);
  });

  it('uses travel time for refuge selection, hop count for routed retreat, and preserves origin-first return', () => {
    const state = buildTinyState();
    configureTravelTimeVsHopCount(state);

    expect(nearestOwnedCastleByTravelTime(state, CLAN_ALPHA, CASTLE_B1)?.castle.id).toBe(CASTLE_A1);
    expect(nearestOwnedCastleByHops(state, CLAN_ALPHA, CASTLE_B1)?.castle.id).toBe(CASTLE_A2);
    expect(nearestOwnedCastleByTravelTime(state, CLAN_ALPHA, CASTLE_B1, CASTLE_A2)?.castle.id).toBe(
      CASTLE_A2,
    );
  });

  it('returns a genuinely hop-minimal routed path even when a longer route is faster', () => {
    const state = buildTinyState();
    state.castles[CASTLE_A2]!.ownerClanId = CLAN_BETA;
    const directId = 'road.b1-a1-direct-slow' as RoadEdgeId;
    state.roads[directId] = {
      id: directId,
      a: CASTLE_B1,
      b: CASTLE_A1,
      type: 'land',
      grade: 1,
      baseDays: 100,
    };
    const detourId = 'road.b1-a1x-fast' as RoadEdgeId;
    state.roads[detourId] = {
      id: detourId,
      a: CASTLE_B1,
      b: DIST_A1X,
      type: 'land',
      grade: 1,
      baseDays: 0.5,
    };
    state.roads['road.a1-a1x' as RoadEdgeId]!.baseDays = 0.5;

    const choice = nearestOwnedCastleByHops(state, CLAN_ALPHA, CASTLE_B1);

    expect(choice?.castle.id).toBe(CASTLE_A1);
    expect(choice?.path.nodes).toEqual([CASTLE_B1, CASTLE_A1]);
  });

  it('applies enemy-land morale loss only during an active war', () => {
    const neutral = buildTinyState();
    const neutralArmy = deploy(neutral, CLAN_ALPHA, CASTLE_A1, OFF_ALPHA_BUSHO, DIST_B1X);
    place(neutralArmy, DIST_B1X);
    neutralArmy.autoReturn = false;
    const neutralMorale = neutralArmy.morale;
    militaryMovementSystem(neutral);
    expect(neutralArmy.morale).toBe(neutralMorale);

    const war = buildTinyState();
    setWar(war, CLAN_ALPHA, CLAN_BETA);
    const warArmy = deploy(war, CLAN_ALPHA, CASTLE_A1, OFF_ALPHA_BUSHO, DIST_B1X);
    place(warArmy, DIST_B1X);
    warArmy.autoReturn = false;
    const warMorale = warArmy.morale;
    militaryMovementSystem(war);
    expect(warArmy.morale).toBe(warMorale - BAL.moraleEnemyLandDaily);
  });

  it('recovers castle morale monthly only outside an active siege', () => {
    const state = buildTinyState();
    const attacker = deploy(state, CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, CASTLE_B1);
    place(attacker, CASTLE_B1);
    beginSiege(state, CASTLE_B1, attacker.id);
    state.time.dayOfMonth = 1;
    state.castles[CASTLE_A1]!.morale = 50;
    state.castles[CASTLE_B1]!.morale = 50;

    economySystem(state);

    expect(state.castles[CASTLE_A1]!.morale).toBe(50 + BAL.castleMoraleRecoverMonthly);
    expect(state.castles[CASTLE_B1]!.morale).toBe(50);
  });

  it('registers every canonical awe threshold, radius, and prestige constant', () => {
    expect({
      fastTicks: BAL.aweLargeFastTicks,
      largeRatio: BAL.aweLargeKillRatio,
      medRatio: BAL.aweMedKillRatio,
      ranges: [BAL.aweRangeSmall, BAL.aweRangeMed, BAL.aweRangeLarge],
      prestige: [BAL.awePrestigeSmall, BAL.awePrestigeMed, BAL.awePrestigeLarge],
    }).toEqual({
      fastTicks: 40,
      largeRatio: 0.7,
      medRatio: 0.5,
      ranges: [1, 2, 3],
      prestige: [10, 25, 50],
    });
  });

  it('recalls to the shortest travel-time castle after the origin is lost', () => {
    const state = buildTinyState();
    configureTravelTimeVsHopCount(state);
    const army = deploy(state, CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, CASTLE_B1);
    place(army, CASTLE_B1);
    army.originCastleId = CASTLE_B1;

    applyRecallArmy(
      state,
      {
        type: 'recallArmy',
        clanId: CLAN_ALPHA,
        armyId: army.id,
      },
      () => undefined,
    );

    expect(army.targetNodeId).toBe(CASTLE_A1);
    expect(army.path).toEqual([CASTLE_B1, DIST_A1X, CASTLE_A1]);
  });

  it('keeps routed retreat on the plan-defined fewest-hop castle', () => {
    const state = buildTinyState();
    configureTravelTimeVsHopCount(state);
    const routed = deploy(state, CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, CASTLE_B1, 700);
    const winner = deploy(state, CLAN_BETA, CASTLE_B1, OFF_BETA_TAISHO, CASTLE_A2, 700);
    place(routed, CASTLE_B1);
    place(winner, CASTLE_B1);
    startFieldCombat(state, CASTLE_B1, [routed.id], [winner.id]);
    routed.morale = BAL.moraleBreakThreshold;
    winner.morale = 100;
    state.rng.misc = rngSeedWhere((first) => first >= BAL.battleDeathChanceRout);

    fieldCombatSystem(state);

    expect(state.armies[routed.id]?.status).toBe('routed');
    expect(state.armies[routed.id]?.targetNodeId).toBe(CASTLE_A2);
    expect(winner.pursuitEligibleArmyIds).toContain(routed.id);
  });

  it('moves escaping siege defenders to the shortest travel-time refuge', () => {
    const state = buildTinyState();
    configureTravelTimeVsHopCount(state);
    const attacker = deploy(state, CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, CASTLE_B1);
    place(attacker, CASTLE_B1);
    state.castles[CASTLE_A1]!.ownerClanId = CLAN_BETA;
    state.castles[CASTLE_A2]!.ownerClanId = CLAN_BETA;
    state.districts[DIST_A1X]!.ownerClanId = CLAN_BETA;
    for (const officer of Object.values(state.officers)) {
      if (officer.clanId === CLAN_BETA && officer.id !== OFF_BETA_TAISHO) {
        officer.locationCastleId = CASTLE_A2;
      }
    }
    state.rng.misc = rngSeedWhere((first) => first < BAL.siegeEscapeChance);
    state.castles[CASTLE_B1]!.soldiers = 0;
    beginSiege(state, CASTLE_B1, attacker.id);

    siegeSystem(state);

    expect(state.officers[OFF_BETA_TAISHO]!.status).toBe('serving');
    expect(state.officers[OFF_BETA_TAISHO]!.locationCastleId).toBe(CASTLE_A1);
  });

  it('records the no-heir flag when battle death removes a clan leader', () => {
    const state = buildTinyState();
    for (const officerId of [OFF_ALPHA_TAISHO, OFF_ALPHA_BUSHO]) {
      const officer = state.officers[officerId]!;
      officer.status = 'ronin';
      officer.clanId = null;
    }

    const events = dieOfficer(state, OFF_ALPHA_LORD, CASTLE_A1);

    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'officer.died',
        officerId: OFF_ALPHA_LORD,
        cause: 'battle',
      }),
    );
    expect(state.events.flags['defeat.no-heir']).toBe(1);
    expect(state.clans[CLAN_ALPHA]!.alive).toBe(true);
  });

  it('blocks on an invalid stored next hop instead of silently rerouting', () => {
    const state = buildTinyState();
    const army = deploy(state, CLAN_ALPHA, CASTLE_A1, OFF_ALPHA_BUSHO, CASTLE_B1);
    const id = 'road.a1x-b1-reroute' as RoadEdgeId;
    state.roads[id] = { id, a: DIST_A1X, b: CASTLE_B1, type: 'land', grade: 1, baseDays: 10 };
    state.castles[CASTLE_B1]!.ownerClanId = CLAN_ALPHA;
    state.castles[CASTLE_A2]!.ownerClanId = CLAN_BETA;

    const events = militaryMovementSystem(state);

    expect(army.status).toBe('holding');
    expect(army.posNodeId).toBe(CASTLE_A1);
    expect(army.path[1]).toBe(CASTLE_A2);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'army.blocked', armyId: army.id }),
    );
  });

  it('keeps a legal stored next hop when a newly added alternate route is merely shorter', () => {
    const state = buildTinyState();
    const army = deploy(state, CLAN_ALPHA, CASTLE_A1, OFF_ALPHA_BUSHO, CASTLE_B1);
    state.roads['road.a1-a2' as RoadEdgeId]!.baseDays = 10;
    const id = 'road.a1x-b1-shorter' as RoadEdgeId;
    state.roads[id] = { id, a: DIST_A1X, b: CASTLE_B1, type: 'land', grade: 1, baseDays: 0.5 };
    state.roads['road.a1-a1x' as RoadEdgeId]!.baseDays = 0.5;

    const events = militaryMovementSystem(state);

    expect(army.status).toBe('marching');
    expect(army.path[1]).toBe(CASTLE_A2);
    expect(army.edgeProgressDays).toBeGreaterThan(0);
    expect(events.some((event) => event.type === 'army.blocked')).toBe(false);
  });

  it('advances shared same-clan subjugation only once per day', () => {
    const state = buildTinyState();
    const first = deploy(state, CLAN_ALPHA, CASTLE_A1, OFF_ALPHA_BUSHO, DIST_B1X);
    const second = deploy(state, CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, DIST_B1X);
    place(first, DIST_B1X, 'subjugating');
    place(second, DIST_B1X, 'subjugating');

    militaryMovementSystem(state);

    const subjugation = state.districts[DIST_B1X]!.subjugation!;
    expect(subjugation.progress).toBeCloseTo(100 / subjugation.daysRequired);
  });

  it('deducts routed food and emits first starvation while locking morale and non-rout attrition', () => {
    const state = buildTinyState();
    state.roads['road.a1-a1x' as RoadEdgeId]!.baseDays = 10;
    const army = deploy(state, CLAN_ALPHA, CASTLE_A1, OFF_ALPHA_BUSHO, DIST_A1X, 200);
    place(army, DIST_A1X, 'routed');
    army.path = [DIST_A1X, CASTLE_A1];
    army.targetNodeId = CASTLE_A1;
    army.food = 1;
    const { morale, soldiers } = army;

    const events = militaryMovementSystem(state);

    expect(army.food).toBe(0);
    expect(army.morale).toBe(morale);
    expect(army.soldiers).toBe(soldiers - Math.ceil(soldiers * BAL.routDailyLossRate));
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'army.starving', armyId: army.id }),
    );
  });

  it('charges land-to-sea embark delay in actual movement', () => {
    const state = buildTinyState();
    const army = deploy(state, CLAN_ALPHA, CASTLE_A1, OFF_ALPHA_BUSHO, CASTLE_A2);
    const edge = state.roads['road.a1-a2' as RoadEdgeId]!;
    edge.type = 'sea';
    edge.baseDays = 1;

    militaryMovementSystem(state);

    expect(army.posNodeId).toBe(CASTLE_A1);
    expect(army.edgeCostDays).toBe(1 + BAL.seaEmbarkDays);
  });

  it('clears a captured castle corps and its orphaned army references', () => {
    const state = buildTinyState();
    const betaArmy = deploy(state, CLAN_BETA, CASTLE_B1, OFF_BETA_TAISHO, CASTLE_A2);
    const attacker = deploy(state, CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, CASTLE_B1);
    const corpsId = 'corps.test' as NonNullable<typeof betaArmy.corpsId>;
    state.officers[state.clans[CLAN_BETA]!.leaderId]!.rank = 'karo';
    state.corps[corpsId] = {
      id: corpsId,
      clanId: CLAN_BETA,
      corpsLeaderId: state.clans[CLAN_BETA]!.leaderId,
      directive: 'hold',
      targetNodeId: null,
      gold: 123,
      createdDay: state.time.day,
    };
    state.castles[CASTLE_B1]!.corpsId = corpsId;
    state.castles[CASTLE_A2]!.ownerClanId = CLAN_BETA;
    betaArmy.corpsId = corpsId;
    place(attacker, CASTLE_B1);
    state.castles[CASTLE_B1]!.soldiers = 0;
    beginSiege(state, CASTLE_B1, attacker.id);
    const betaGold = state.clans[CLAN_BETA]!.gold;

    siegeSystem(state);

    expect(state.castles[CASTLE_B1]!.corpsId).toBeNull();
    expect(state.castles[CASTLE_B1]!.directControl).toBe(true);
    expect(state.corps[corpsId]).toBeUndefined();
    expect(betaArmy.corpsId).toBeNull();
    expect(state.clans[CLAN_BETA]!.gold).toBe(betaGold + 123);
  });

  it('purges every defeated-clan corps and stale army corps reference on clan death', () => {
    const state = buildTinyState();
    const attacker = deploy(state, CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, CASTLE_B1);
    const trappedId = 'corps.trapped' as NonNullable<typeof attacker.corpsId>;
    const remoteId = 'corps.remote' as NonNullable<typeof attacker.corpsId>;
    state.officers[OFF_BETA_LORD]!.rank = 'karo';
    for (const id of [trappedId, remoteId]) {
      state.corps[id] = {
        id,
        clanId: CLAN_BETA,
        corpsLeaderId: OFF_BETA_LORD,
        directive: 'hold',
        targetNodeId: null,
        gold: 50,
        createdDay: state.time.day,
      };
    }
    state.castles[CASTLE_B1]!.corpsId = trappedId;
    attacker.corpsId = remoteId;
    place(attacker, CASTLE_B1);
    state.castles[CASTLE_B1]!.soldiers = 0;
    beginSiege(state, CASTLE_B1, attacker.id);

    siegeSystem(state);

    expect(state.clans[CLAN_BETA]!.alive).toBe(false);
    expect(state.corps[trappedId]).toBeUndefined();
    expect(state.corps[remoteId]).toBeUndefined();
    expect(attacker.corpsId).toBeNull();
  });

  it('keeps the resident as defender and the same-day arrival as challenger', () => {
    const state = buildTinyState();
    setWar(state, CLAN_ALPHA, CLAN_BETA);
    const resident = deploy(state, CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, CASTLE_B1, 100);
    const challenger = deploy(state, CLAN_BETA, CASTLE_B1, OFF_BETA_TAISHO, CASTLE_A2, 200);
    place(resident, CASTLE_A2, 'holding');
    state.roads['road.a2-b1' as RoadEdgeId]!.baseDays = 0.5;

    const started = militaryMovementSystem(state).find((event) => event.type === 'battle.started');

    expect(started).toEqual(
      expect.objectContaining({
        type: 'battle.started',
        defenderClanId: CLAN_ALPHA,
        attackerClanId: CLAN_BETA,
      }),
    );
    expect(challenger.status).toBe('engaged');
  });

  it('keeps a resident side as defender when a same-clan reinforcement also arrives that phase', () => {
    const state = buildTinyState();
    setWar(state, CLAN_ALPHA, CLAN_BETA);
    const roadId = 'road.b1-a1x-mixed-side' as RoadEdgeId;
    state.roads[roadId] = {
      id: roadId,
      a: CASTLE_B1,
      b: DIST_A1X,
      type: 'land',
      grade: 1,
      baseDays: 0.5,
    };
    state.roads['road.a1-a1x' as RoadEdgeId]!.baseDays = 0.5;
    const challenger = deploy(state, CLAN_ALPHA, CASTLE_A1, OFF_ALPHA_BUSHO, DIST_A1X, 200);
    const resident = deploy(state, CLAN_BETA, CASTLE_B1, OFF_BETA_TAISHO, DIST_A1X, 200);
    const reinforcement = deploy(state, CLAN_BETA, CASTLE_B1, OFF_BETA_BUSHO, DIST_A1X, 100);
    place(resident, DIST_A1X, 'holding');

    const started = militaryMovementSystem(state).find((event) => event.type === 'battle.started');

    expect(challenger.id < resident.id).toBe(true);
    expect(reinforcement.status).toBe('engaged');
    expect(started).toEqual(
      expect.objectContaining({
        type: 'battle.started',
        defenderClanId: CLAN_BETA,
        attackerClanId: CLAN_ALPHA,
      }),
    );
  });

  it('uses army-id movement order when both primary sides arrive in the same phase', () => {
    const state = buildTinyState();
    setWar(state, CLAN_ALPHA, CLAN_BETA);
    state.roads['road.a1-a1x' as RoadEdgeId]!.baseDays = 0.5;
    const id = 'road.b1-a1x-arrival' as RoadEdgeId;
    state.roads[id] = { id, a: CASTLE_B1, b: DIST_A1X, type: 'land', grade: 1, baseDays: 0.5 };
    const alpha = deploy(state, CLAN_ALPHA, CASTLE_A1, OFF_ALPHA_BUSHO, DIST_A1X);
    const beta = deploy(state, CLAN_BETA, CASTLE_B1, OFF_BETA_TAISHO, DIST_A1X);

    const started = militaryMovementSystem(state).find((event) => event.type === 'battle.started');

    expect(alpha.id < beta.id).toBe(true);
    expect(started).toEqual(
      expect.objectContaining({
        type: 'battle.started',
        defenderClanId: CLAN_ALPHA,
        attackerClanId: CLAN_BETA,
      }),
    );
  });

  it('merges a same-day allied arrival after establishing the primary sides', () => {
    const state = buildTinyState();
    setWar(state, CLAN_ALPHA, CLAN_BETA);
    const gamma = 'clan.gamma-same-day' as ClanId;
    const gammaOfficer = 'off.gamma-same-day' as OfficerId;
    const gammaArmyId = 'army.999997' as ArmyId;
    state.roads['road.a1-a1x' as RoadEdgeId]!.baseDays = 0.5;
    const id = 'road.b1-a1x-allies' as RoadEdgeId;
    state.roads[id] = { id, a: CASTLE_B1, b: DIST_A1X, type: 'land', grade: 1, baseDays: 0.5 };
    const alpha = deploy(state, CLAN_ALPHA, CASTLE_A1, OFF_ALPHA_BUSHO, DIST_A1X, 300);
    const beta = deploy(state, CLAN_BETA, CASTLE_B1, OFF_BETA_TAISHO, DIST_A1X, 300);
    state.clans[gamma] = {
      ...state.clans[CLAN_ALPHA]!,
      id: gamma,
      leaderId: gammaOfficer,
      name: '丙家',
    };
    state.officers[gammaOfficer] = {
      ...state.officers[OFF_BETA_BUSHO]!,
      id: gammaOfficer,
      clanId: gamma,
      armyId: gammaArmyId,
      locationCastleId: null,
      name: '丙將',
      loyalty: 100,
    };
    state.armies[gammaArmyId] = {
      ...beta,
      id: gammaArmyId,
      clanId: gamma,
      leaderId: gammaOfficer,
      soldiers: 100,
      initialTroops: 100,
    };
    const alliance = defaultDiplomacyRow(CLAN_ALPHA, gamma);
    alliance.pacts.push({
      kind: 'alliance',
      startDay: state.time.day,
      endDay: state.time.day + 30,
      vassalClanId: null,
    });
    state.diplomacy.rows[pairKey(CLAN_ALPHA, gamma)] = alliance;
    setWar(state, gamma, CLAN_BETA);
    state.armies[gammaArmyId].path = [CASTLE_B1, DIST_A1X];
    state.armies[gammaArmyId].pathCursor = 0;
    state.armies[gammaArmyId].posNodeId = CASTLE_B1;
    state.armies[gammaArmyId].targetNodeId = DIST_A1X;
    state.armies[gammaArmyId].status = 'marching';
    state.armies[gammaArmyId].autoReturn = false;

    militaryMovementSystem(state);

    const combat = Object.values(state.fieldCombats)[0]!;
    expect(combat.sideA.armyIds).toEqual(expect.arrayContaining([alpha.id, gammaArmyId]));
    expect(combat.sideA.clanIds).toEqual(expect.arrayContaining([CLAN_ALPHA, gamma]));
  });

  it('merges an allied reinforcement into an existing field combat side', () => {
    const state = buildTinyState();
    setWar(state, CLAN_ALPHA, CLAN_BETA);
    const gamma = 'clan.gamma-reinforcement' as ClanId;
    const alpha = deploy(state, CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, CASTLE_B1);
    const reinforcement = deploy(state, CLAN_ALPHA, CASTLE_A1, OFF_ALPHA_BUSHO, CASTLE_B1);
    const beta = deploy(state, CLAN_BETA, CASTLE_B1, OFF_BETA_TAISHO, CASTLE_A2);
    state.clans[gamma] = {
      ...state.clans[CLAN_ALPHA]!,
      id: gamma,
      leaderId: OFF_ALPHA_BUSHO,
      name: '丙家',
    };
    state.officers[OFF_ALPHA_BUSHO]!.clanId = gamma;
    reinforcement.clanId = gamma;
    const alliance = defaultDiplomacyRow(CLAN_ALPHA, gamma);
    alliance.pacts.push({
      kind: 'alliance',
      startDay: state.time.day,
      endDay: state.time.day + 30,
      vassalClanId: null,
    });
    state.diplomacy.rows[pairKey(CLAN_ALPHA, gamma)] = alliance;
    setWar(state, gamma, CLAN_BETA);
    place(alpha, CASTLE_A2);
    place(beta, CASTLE_A2);
    place(reinforcement, CASTLE_A2, 'holding');
    startFieldCombat(state, CASTLE_A2, [alpha.id], [beta.id]);

    militaryMovementSystem(state);

    const combat = Object.values(state.fieldCombats)[0]!;
    expect(combat.sideA.armyIds).toContain(reinforcement.id);
    expect(combat.sideA.clanIds).toContain(gamma);
    expect(reinforcement.status).toBe('engaged');
  });

  it('lets a friendly defender reinforcement trigger siege relief and hostility', () => {
    const state = buildTinyState();
    const gamma = 'clan.gamma' as ClanId;
    const gammaOfficer = 'off.gamma-relief' as OfficerId;
    const gammaArmyId = 'army.999998' as ArmyId;
    const attacker = deploy(state, CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, CASTLE_B1);
    const template = deploy(state, CLAN_BETA, CASTLE_B1, OFF_BETA_TAISHO, CASTLE_A2);
    state.clans[gamma] = {
      ...state.clans[CLAN_BETA]!,
      id: gamma,
      leaderId: gammaOfficer,
      name: '丙家',
    };
    state.officers[gammaOfficer] = {
      ...state.officers[OFF_BETA_TAISHO]!,
      id: gammaOfficer,
      clanId: gamma,
      armyId: gammaArmyId,
      name: '丙將',
    };
    state.armies[gammaArmyId] = {
      ...template,
      id: gammaArmyId,
      clanId: gamma,
      leaderId: gammaOfficer,
    };
    const alliance = defaultDiplomacyRow(gamma, CLAN_BETA);
    alliance.pacts.push({
      kind: 'alliance',
      startDay: state.time.day,
      endDay: state.time.day + 30,
      vassalClanId: null,
    });
    state.diplomacy.rows[pairKey(gamma, CLAN_BETA)] = alliance;
    place(attacker, CASTLE_B1);
    place(template, CASTLE_A2);
    place(state.armies[gammaArmyId], CASTLE_B1, 'holding');
    beginSiege(state, CASTLE_B1, attacker.id);

    const events = militaryMovementSystem(state);

    expect(events.some((event) => event.type === 'siege.relief')).toBe(true);
    expect(state.diplomacy.rows[pairKey(CLAN_ALPHA, gamma)]?.lastHostileDay).toBe(state.time.day);
  });

  it('applies later-day pursuit when a winner meets a routed army', () => {
    const state = buildTinyState();
    setWar(state, CLAN_ALPHA, CLAN_BETA);
    const routed = deploy(state, CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, CASTLE_A1, 700);
    const winner = deploy(state, CLAN_BETA, CASTLE_B1, OFF_BETA_TAISHO, CASTLE_A2, 700);
    winner.pursuitEligibleArmyIds = [routed.id];
    place(routed, CASTLE_A2, 'routed');
    routed.path = [CASTLE_A2, CASTLE_A1];
    routed.targetNodeId = CASTLE_A1;
    state.roads['road.a1-a2' as RoadEdgeId]!.baseDays = 10;
    state.roads['road.a2-b1' as RoadEdgeId]!.baseDays = 0.5;
    state.rng.misc = rngSeedWhere((first) => first >= BAL.battleDeathChanceRout);
    const afterRoutLoss = routed.soldiers - Math.ceil(routed.soldiers * BAL.routDailyLossRate);

    militaryMovementSystem(state);

    expect(state.armies[routed.id]?.soldiers).toBeLessThan(afterRoutLoss);
  });

  it('does not apply later pursuit from a stationary hostile sharing the routed node', () => {
    const state = buildTinyState();
    setWar(state, CLAN_ALPHA, CLAN_BETA);
    const routed = deploy(state, CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, CASTLE_A1, 700);
    const stationary = deploy(state, CLAN_BETA, CASTLE_B1, OFF_BETA_TAISHO, CASTLE_A2, 700);
    stationary.pursuitEligibleArmyIds = [routed.id];
    place(routed, CASTLE_A2, 'routed');
    place(stationary, CASTLE_A2, 'holding');
    routed.path = [CASTLE_A2, CASTLE_A1];
    routed.targetNodeId = CASTLE_A1;
    state.roads['road.a1-a2' as RoadEdgeId]!.baseDays = 10;
    const afterRoutLoss = routed.soldiers - Math.ceil(routed.soldiers * BAL.routDailyLossRate);

    militaryMovementSystem(state);

    expect(state.armies[routed.id]?.soldiers).toBe(afterRoutLoss);
  });

  it('does not let an arriving third-party victor pursue a newly starvation-routed clan', () => {
    const state = buildTinyState();
    setWar(state, CLAN_ALPHA, CLAN_BETA);
    const roadId = 'road.b1-a1x-third-party' as RoadEdgeId;
    state.roads[roadId] = {
      id: roadId,
      a: CASTLE_B1,
      b: DIST_A1X,
      type: 'land',
      grade: 1,
      baseDays: 0.5,
    };
    const priorSameClan = deploy(state, CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, DIST_A1X, 100);
    delete state.armies[priorSameClan.id];
    state.officers[OFF_ALPHA_TAISHO]!.armyId = null;
    const starving = deploy(state, CLAN_ALPHA, CASTLE_A1, OFF_ALPHA_BUSHO, DIST_A1X, 700);
    const arriving = deploy(state, CLAN_BETA, CASTLE_B1, OFF_BETA_TAISHO, DIST_A1X, 700);
    arriving.pursuitEligibleArmyIds = [priorSameClan.id];
    place(starving, DIST_A1X, 'marching');
    starving.path = [DIST_A1X, CASTLE_A1];
    starving.targetNodeId = CASTLE_A1;
    starving.food = 1;
    starving.morale = BAL.moraleBreakThreshold + BAL.noFoodMoraleDaily;
    state.roads['road.a1-a1x' as RoadEdgeId]!.baseDays = 10;
    const afterStarvation =
      starving.soldiers - Math.ceil(starving.soldiers * BAL.noFoodDesertionRate);
    const afterRout = afterStarvation - Math.ceil(afterStarvation * BAL.routDailyLossRate);

    militaryMovementSystem(state);

    expect(starving.status).toBe('routed');
    expect(starving.soldiers).toBe(afterRout);
  });

  it('damages only the exact eligible routed army in a mixed same-clan bucket', () => {
    const state = buildTinyState();
    setWar(state, CLAN_ALPHA, CLAN_BETA);
    const eligible = deploy(state, CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, CASTLE_A1, 700);
    const unrelated = deploy(state, CLAN_ALPHA, CASTLE_A1, OFF_ALPHA_BUSHO, CASTLE_A2, 700);
    const winner = deploy(state, CLAN_BETA, CASTLE_B1, OFF_BETA_TAISHO, CASTLE_A2, 700);
    place(eligible, CASTLE_A2, 'routed');
    place(unrelated, CASTLE_A2, 'routed');
    eligible.path = [CASTLE_A2, CASTLE_A1];
    eligible.targetNodeId = CASTLE_A1;
    unrelated.path = [CASTLE_A2, CASTLE_A1];
    unrelated.targetNodeId = CASTLE_A1;
    winner.pursuitEligibleArmyIds = [eligible.id];
    state.roads['road.a1-a2' as RoadEdgeId]!.baseDays = 10;
    state.roads['road.a2-b1' as RoadEdgeId]!.baseDays = 0.5;
    state.rng.misc = rngSeedWhere((first) => first >= BAL.battleDeathChanceRout);
    const eligibleAfterRout =
      eligible.soldiers - Math.ceil(eligible.soldiers * BAL.routDailyLossRate);
    const unrelatedAfterRout =
      unrelated.soldiers - Math.ceil(unrelated.soldiers * BAL.routDailyLossRate);

    militaryMovementSystem(state);

    expect(state.armies[eligible.id]?.soldiers).toBeLessThan(eligibleAfterRout);
    expect(state.armies[unrelated.id]?.soldiers).toBe(unrelatedAfterRout);
  });

  it('uses hop-count ordering when starvation newly routes an army', () => {
    const state = buildTinyState();
    configureTravelTimeVsHopCount(state);
    const army = deploy(state, CLAN_ALPHA, CASTLE_A1, OFF_ALPHA_BUSHO, CASTLE_B1, 200);
    place(army, CASTLE_B1, 'marching');
    army.food = 1;
    army.morale = BAL.moraleBreakThreshold + BAL.noFoodMoraleDaily;

    militaryMovementSystem(state);

    expect(army.status).toBe('routed');
    expect(army.targetNodeId).toBe(CASTLE_A2);
  });

  it('destroys a foreign no-heir clan without setting the player defeat flag', () => {
    const state = buildTinyState();

    const events = dieOfficer(state, OFF_BETA_LORD, CASTLE_B1);

    expect(state.clans[CLAN_BETA]!.alive).toBe(false);
    expect(state.events.flags['defeat.no-heir']).toBeUndefined();
    expect(state.officers[OFF_BETA_TAISHO]!.status).toBe('ronin');
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'clan.destroyed', clanId: CLAN_BETA }),
    );
  });

  it('applies fudai and tozama loyalty shocks immediately after succession', () => {
    const state = buildTinyState();
    state.officers[OFF_ALPHA_TAISHO]!.kinship = 'kin';
    state.officers[OFF_BETA_BUSHO]!.clanId = CLAN_ALPHA;
    state.officers[OFF_BETA_BUSHO]!.kinship = 'fudai';
    state.officers[OFF_BETA_BUSHO]!.loyalty = 70;
    const tozamaBefore = state.officers[OFF_ALPHA_BUSHO]!.loyalty;

    dieOfficer(state, OFF_ALPHA_LORD, CASTLE_A1);

    expect(state.clans[CLAN_ALPHA]!.leaderId).toBe(OFF_ALPHA_TAISHO);
    expect(state.officers[OFF_ALPHA_TAISHO]!.loyalty).toBe(100);
    expect(state.officers[OFF_BETA_BUSHO]!.loyalty).toBe(70 - BAL.successionLoyaltyShockFudai);
    expect(state.officers[OFF_ALPHA_BUSHO]!.loyalty).toBe(
      tozamaBefore - BAL.successionLoyaltyShockTozama,
    );
  });

  it('emits arrival before enemy-district state change and own-castle cleanup', () => {
    const districtState = buildTinyState();
    const invader = deploy(districtState, CLAN_ALPHA, CASTLE_A1, OFF_ALPHA_BUSHO, DIST_B1X);
    place(invader, DIST_B1X, 'marching');
    const districtEvents = militaryMovementSystem(districtState);
    expect(districtEvents[0]).toEqual(
      expect.objectContaining({ type: 'army.arrived', armyId: invader.id }),
    );
    expect(invader.status).toBe('subjugating');

    const castleState = buildTinyState();
    const returning = deploy(castleState, CLAN_ALPHA, CASTLE_A1, OFF_ALPHA_BUSHO, CASTLE_A2);
    place(returning, CASTLE_A2, 'marching');
    const castleEvents = militaryMovementSystem(castleState);
    expect(castleEvents.map((event) => event.type).slice(0, 2)).toEqual([
      'army.arrived',
      'army.returned',
    ]);
  });

  it('rejects routed auto-return toggles and understrength encirclement switches', () => {
    const state = buildTinyState();
    const army = deploy(state, CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, CASTLE_B1, 200);
    place(army, CASTLE_B1, 'routed');
    expect(
      validateSetAutoReturn(state, {
        type: 'setAutoReturn',
        clanId: CLAN_ALPHA,
        armyId: army.id,
        enabled: false,
      }),
    ).toEqual({ ok: false, reasonKey: 'cmd.reject.officerBusy' });
    army.status = 'holding';
    beginSiege(state, CASTLE_B1, army.id);
    const siege = Object.values(state.sieges)[0]!;
    state.castles[CASTLE_B1]!.soldiers = 100;
    expect(
      validateSetSiegeMode(state, {
        type: 'setSiegeMode',
        clanId: CLAN_ALPHA,
        siegeId: siege.id,
        mode: 'encircle',
      }),
    ).toEqual({ ok: false, reasonKey: 'cmd.reject.insufficientTroops' });
  });
});
