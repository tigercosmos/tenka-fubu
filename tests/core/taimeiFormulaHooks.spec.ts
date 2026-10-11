import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { castleMaxSoldiers } from '../../src/core/domestic';
import { conscriptionSystem } from '../../src/core/systems/conscription';
import { developmentSystem } from '../../src/core/systems/development';
import { facilitiesDaily } from '../../src/core/systems/facilities';
import { diplomacySystem } from '../../src/core/systems/diplomacy';
import { siegeSystem, beginSiege } from '../../src/core/systems/siege';
import { militaryMovementSystem } from '../../src/core/systems/military';
import { computeArmyPower } from '../../src/core/systems/fieldCombat';
import { taimeiEffects } from '../../src/core/systems/events/taimei';
import { applyMarch } from '../../src/core/commands/march';
import {
  applyStartDiploWork,
  validateStartDiploWork,
} from '../../src/core/commands/diplomacyCommands';
import {
  applyBuildFacility,
  validateBuildFacility,
} from '../../src/core/commands/domesticCommands';
import { ensureDiplomacyRow } from '../../src/core/systems/diplomacyCommon';
import { validateState } from '../../src/core/state/invariants';
import { advanceDay } from '../../src/core/systems';
import type { Army, GameState } from '../../src/core/state/gameState';
import type { ClanId, FacilityTypeId, RoadEdgeId, TaimeiId } from '../../src/core/state/ids';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  DIST_A1X,
  DIST_A2X,
  OFF_ALPHA_BUSHO,
  OFF_ALPHA_LORD,
} from '../fixtures/tiny';

function activate(state: GameState, id: string, clanId: ClanId = CLAN_ALPHA) {
  state.clans[clanId]!.taimei = {
    activeTaimeiId: id as TaimeiId,
    activeUntilDay: state.time.day,
    cooldownUntilDay: state.time.day + 180,
  };
}
function deploy(state: GameState, target = CASTLE_A2): Army {
  applyMarch(
    state,
    {
      type: 'march',
      clanId: CLAN_ALPHA,
      originCastleId: CASTLE_A1,
      leaderId: OFF_ALPHA_LORD,
      deputyIds: [],
      soldiers: 600,
      food: 1000,
      targetNodeId: target,
    },
    () => {},
  );
  return Object.values(state.armies)[0]!;
}
function besieged(mode: 'assault' | 'encircle') {
  const state = buildTinyState(),
    army = deploy(state, CASTLE_B1);
  state.castles[CASTLE_B1]!.soldiers = 100;
  army.posNodeId = CASTLE_B1;
  army.path = [CASTLE_B1];
  army.pathCursor = 0;
  beginSiege(state, CASTLE_B1, army.id);
  Object.values(state.sieges)[0]!.mode = mode;
  expect(validateState(state)).toEqual([]);
  return state;
}

describe('canonical taimei modifiers in actual formula consumers', () => {
  it('sodoin multiplies monthly recruitment before flooring, respects permanent cap and invents no gold charge', () => {
    const state = buildTinyState();
    state.castles[CASTLE_A1]!.soldiers = 0;
    state.castles[CASTLE_A2]!.soldiers = 0;
    state.castles[CASTLE_B1]!.soldiers = 0;
    const neutral = structuredClone(state),
      gold = state.clans[CLAN_ALPHA]!.gold;
    activate(state, 'taimei.sodoin');
    const cap = castleMaxSoldiers(state, state.castles[CASTLE_A1]!);
    conscriptionSystem(state);
    conscriptionSystem(neutral);
    expect(state.castles[CASTLE_A1]!.soldiers).toBe(Math.floor(150 * 1.25));
    expect(neutral.castles[CASTLE_A1]!.soldiers).toBe(150);
    expect(state.castles[CASTLE_B1]).toEqual(neutral.castles[CASTLE_B1]);
    expect(castleMaxSoldiers(state, state.castles[CASTLE_A1]!)).toBe(cap);
    expect(taimeiEffects(state, CLAN_ALPHA).conscriptCostMult).toBe(0.5);
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(gold);
    expect(neutral.clans[CLAN_ALPHA]!.gold).toBe(gold);
    state.castles[CASTLE_A1]!.soldiers = cap - 1;
    conscriptionSystem(state);
    expect(state.castles[CASTLE_A1]!.soldiers).toBe(cap);
    state.castles[CASTLE_A1]!.soldiers = cap + 1;
    conscriptionSystem(state);
    expect(state.castles[CASTLE_A1]!.soldiers).toBe(cap + 1);
    expect(state.rng).toEqual(neutral.rng);
    expect(validateState(state)).toEqual([]);
  });

  it('rakuichi doubles only commerce growth for the receiver and still clamps development caps', () => {
    const state = buildTinyState(),
      neutral = structuredClone(state),
      before = structuredClone(state);
    activate(state, 'taimei.rakuichi-shinko');
    developmentSystem(state);
    developmentSystem(neutral);
    for (const district of Object.values(state.districts)) {
      const old = before.districts[district.id]!,
        normal = neutral.districts[district.id]!;
      expect(district.commerce - old.commerce).toBeCloseTo(
        (normal.commerce - old.commerce) * (district.ownerClanId === CLAN_ALPHA ? 2 : 1),
        10,
      );
      expect(district.kokudaka).toBe(normal.kokudaka);
      expect(district.population).toBe(normal.population);
    }
    const district = state.districts[DIST_A1X]!;
    district.commerce = district.commerceCap - 0.001;
    developmentSystem(state);
    expect(district.commerce).toBeLessThanOrEqual(district.commerceCap);
    expect(state.rng).toEqual(neutral.rng);
    expect(validateState(state)).toEqual([]);
  });

  it('gaiko doubles monthly directed trust after traits/sentiment/rank without changing costs or court favor', () => {
    const state = buildTinyState();
    const work = {
      type: 'startDiploWork' as const,
      clanId: CLAN_ALPHA,
      target: CLAN_BETA,
      executorId: OFF_ALPHA_BUSHO,
    };
    expect(validateStartDiploWork(state, work)).toEqual({ ok: true });
    applyStartDiploWork(state, work);
    const neutral = structuredClone(state);
    activate(state, 'taimei.gaiko-kosei');
    diplomacySystem(state);
    diplomacySystem(neutral);
    const row = ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA);
    const normal = ensureDiplomacyRow(neutral, CLAN_ALPHA, CLAN_BETA);
    expect(row.trustAtoB).toBe(normal.trustAtoB * 2);
    expect(row.trustBtoA).toBe(normal.trustBtoA);
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(neutral.clans[CLAN_ALPHA]!.gold);
    expect(state.court).toEqual(neutral.court);
    expect(state.rng).toEqual(neutral.rng);
    expect(validateState(state)).toEqual([]);
  });

  it('bushin advances only the active construction by two days with no overflow into the next order', () => {
    const state = buildTinyState();
    for (const id of ['fac.ichi', 'fac.heisha']) {
      const cmd = {
        type: 'buildFacility' as const,
        clanId: CLAN_ALPHA,
        castleId: CASTLE_A1,
        facilityTypeId: id as FacilityTypeId,
      };
      expect(validateBuildFacility(state, cmd)).toEqual({ ok: true });
      applyBuildFacility(state, cmd);
    }
    state.castles[CASTLE_A1]!.buildQueue[0]!.daysLeft = 3;
    applyBuildFacility(state, {
      type: 'buildFacility',
      clanId: CLAN_BETA,
      castleId: CASTLE_B1,
      facilityTypeId: 'fac.ichi' as FacilityTypeId,
    });
    state.castles[CASTLE_B1]!.buildQueue[0]!.daysLeft = 3;
    const neutral = structuredClone(state);
    activate(state, 'taimei.tenka-bushin');
    facilitiesDaily(state);
    facilitiesDaily(neutral);
    expect(state.castles[CASTLE_A1]!.buildQueue[0]!.daysLeft).toBe(1);
    expect(neutral.castles[CASTLE_A1]!.buildQueue[0]!.daysLeft).toBe(2);
    expect(state.castles[CASTLE_B1]!.buildQueue[0]!.daysLeft).toBe(2);
    const nextDays = state.castles[CASTLE_A1]!.buildQueue[1]!.daysLeft;
    const events = facilitiesDaily(state);
    expect(events).toMatchObject([{ type: 'facility.completed', facilityTypeId: 'fac.ichi' }]);
    expect(state.castles[CASTLE_A1]!.buildQueue[0]!.daysLeft).toBe(nextDays);
    expect(state.castles[CASTLE_A1]!.facilities).toContain('fac.ichi');
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(neutral.clans[CLAN_ALPHA]!.gold);
    expect(state.rng).toEqual(neutral.rng);
    expect(validateState(state)).toEqual([]);
  });

  it.each(['assault', 'encircle'] as const)(
    'teppeki boosts the defending castle in %s, not the attacker',
    (mode) => {
      const state = besieged(mode),
        neutral = structuredClone(state);
      const army = Object.values(state.armies)[0]!,
        troops = army.soldiers;
      const castle = state.castles[CASTLE_B1]!,
        durability = castle.durability;
      const lord = state.officers[castle.lordId!]!;
      const defense =
        castle.soldiers *
        (1 + (lord.ldr + lord.statGrowth.ldr) * BAL.ldrCombatFactor) *
        (1 + BAL.siegeMitigationMain);
      const attack = computeArmyPower(state, army);
      activate(state, 'taimei.teppeki', CLAN_BETA);
      const effects = taimeiEffects(state, CLAN_BETA);
      siegeSystem(state);
      siegeSystem(neutral);
      const rate = mode === 'assault' ? BAL.assaultAttackerLossRate : BAL.encircleAttackerLossRate;
      expect(army.soldiers).toBe(troops - Math.round(defense * effects.castleDefenseMult * rate));
      if (mode === 'assault') {
        expect(castle.durability).toBe(
          Math.round(
            Math.max(
              0,
              durability -
                attack *
                  BAL.assaultDurabilityRate *
                  (1 - BAL.siegeMitigationMain) *
                  effects.siegeDamageTakenMult,
            ),
          ),
        );
        expect(castle.soldiers).toBe(neutral.castles[CASTLE_B1]!.soldiers);
      } else expect(castle.durability).toBe(durability);
      expect(state.rng).toEqual(neutral.rng);
      expect(validateState(state)).toEqual([]);
    },
  );

  it('shippu increases actual land progress within the existing speed clamp, never sea progress', () => {
    const state = buildTinyState();
    const edge = Object.values(state.roads).find(
      (road) => road.a === CASTLE_A1 && road.b === CASTLE_A2,
    )!;
    edge.baseDays = 4;
    const army = deploy(state),
      neutral = structuredClone(state);
    activate(state, 'taimei.shippu-jinrai');
    militaryMovementSystem(state);
    militaryMovementSystem(neutral);
    expect(army.edgeProgressDays).toBe(1.3);
    expect(Object.values(neutral.armies)[0]!.edgeProgressDays).toBe(1);
    expect(state.rng).toEqual(neutral.rng);
    expect(validateState(state)).toEqual([]);
    const sea = buildTinyState(),
      seaArmy = deploy(sea);
    sea.districts[DIST_A1X]!.isPort = true;
    sea.districts[DIST_A2X]!.isPort = true;
    const seaId = 'road.taimei-sea' as RoadEdgeId;
    sea.roads[seaId] = { id: seaId, a: DIST_A1X, b: DIST_A2X, type: 'sea', grade: 1, baseDays: 4 };
    seaArmy.posNodeId = DIST_A1X;
    seaArmy.path = [DIST_A1X, DIST_A2X];
    seaArmy.pathCursor = 0;
    seaArmy.targetNodeId = DIST_A2X;
    const normalSea = structuredClone(sea);
    activate(sea, 'taimei.shippu-jinrai');
    militaryMovementSystem(sea);
    militaryMovementSystem(normalSea);
    expect(seaArmy).toEqual(Object.values(normalSea.armies)[0]);
    expect(validateState(sea)).toEqual([]);
  });

  it('an attacking clan cannot apply its teppeki to an enemy castle', () => {
    const state = besieged('assault'),
      neutral = structuredClone(state);
    activate(state, 'taimei.teppeki', CLAN_ALPHA);
    expect(siegeSystem(state)).toEqual(siegeSystem(neutral));
    expect(state.castles).toEqual(neutral.castles);
    expect(state.armies).toEqual(neutral.armies);
    expect(state.rng).toEqual(neutral.rng);
    expect(validateState(state)).toEqual([]);
  });

  it('all consumer pipelines preserve expired/inactive gameplay and RNG exactly', () => {
    const cases = [
      ['taimei.sodoin', conscriptionSystem],
      ['taimei.rakuichi-shinko', developmentSystem],
      ['taimei.gaiko-kosei', diplomacySystem],
      ['taimei.tenka-bushin', facilitiesDaily],
      ['taimei.shippu-jinrai', militaryMovementSystem],
      ['taimei.teppeki', siegeSystem],
    ] as const;
    for (const [id, run] of cases) {
      const state = id === 'taimei.teppeki' ? besieged('assault') : buildTinyState();
      if (id === 'taimei.sodoin') state.castles[CASTLE_A1]!.soldiers = 0;
      if (id === 'taimei.gaiko-kosei')
        applyStartDiploWork(state, {
          type: 'startDiploWork',
          clanId: CLAN_ALPHA,
          target: CLAN_BETA,
          executorId: OFF_ALPHA_BUSHO,
        });
      if (id === 'taimei.tenka-bushin')
        applyBuildFacility(state, {
          type: 'buildFacility',
          clanId: CLAN_ALPHA,
          castleId: CASTLE_A1,
          facilityTypeId: 'fac.ichi' as FacilityTypeId,
        });
      if (id === 'taimei.shippu-jinrai') {
        const edge = Object.values(state.roads).find(
          (road) => road.a === CASTLE_A1 && road.b === CASTLE_A2,
        )!;
        edge.baseDays = 4;
        deploy(state);
      }
      const neutral = structuredClone(state);
      const clanId = id === 'taimei.teppeki' ? CLAN_BETA : CLAN_ALPHA;
      activate(state, id, clanId);
      state.clans[clanId]!.taimei.activeUntilDay = state.time.day - 1;
      expect(run(state)).toEqual(run(neutral));
      state.clans[clanId]!.taimei = structuredClone(neutral.clans[clanId]!.taimei);
      expect(state).toEqual(neutral);
      expect(validateState(state)).toEqual([]);
    }
  });

  it('real Tick applies commerce on the inclusive final day and stops the boost afterward', () => {
    const state = buildTinyState();
    state.ai.clans = {};
    activate(state, 'taimei.rakuichi-shinko');
    state.clans[CLAN_ALPHA]!.taimei.activeUntilDay = state.time.day + 1;
    const neutral = structuredClone(state);
    neutral.clans[CLAN_ALPHA]!.taimei.activeTaimeiId = null;
    const before = state.districts[DIST_A1X]!.commerce;
    advanceDay(state, []);
    advanceDay(neutral, []);
    expect(state.districts[DIST_A1X]!.commerce - before).toBeCloseTo(
      (neutral.districts[DIST_A1X]!.commerce - before) * 2,
      10,
    );
    const expected = structuredClone(state);
    expected.clans[CLAN_ALPHA]!.taimei.activeTaimeiId = null;
    advanceDay(state, []);
    advanceDay(expected, []);
    expect(state.clans[CLAN_ALPHA]!.taimei.activeTaimeiId).toBeNull();
    expect(state.districts).toEqual(expected.districts);
    expect(validateState(state)).toEqual([]);
  });
});
