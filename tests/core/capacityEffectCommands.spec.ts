import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { castleMaxSoldiers } from '../../src/core/domestic';
import { validateCommand } from '../../src/core/commands/validate';
import { applyCommand } from '../../src/core/commands/apply';
import { applyScalarEffects } from '../../src/core/systems/events/scalarEffects';
import { attackPlansDailyTick } from '../../src/core/systems/ai/attackPlan';
import { militaryMovementSystem } from '../../src/core/systems/military';
import { siegeSystem } from '../../src/core/systems/siege';
import { dayToCalendar } from '../../src/core/systems/time';
import { encodeSave, decodeSave } from '../../src/core/save/serialize';
import { validateState } from '../../src/core/state/invariants';
import { buildGameStateFromScenario } from '../../src/core/state/builder';
import { loadS1560Scenario } from '../../src/data/scenarios/s1560';
import { DEBUG_M6_FLOW_IDS, DEBUG_M6_FLOW_SEED, prepareM6FlowState } from '../../src/core/debugM6';
import type { GameState } from '../../src/core/state/gameState';
import type { CastleId, PolicyId, TaimeiId } from '../../src/core/state/ids';
import type { Command } from '../../src/core/commands/types';
import { validatingSink } from '../helpers/aiScenario';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_TAISHO,
} from '../fixtures/tiny';

function fractionalCap(state: GameState, castleId: CastleId): void {
  const castle = state.castles[castleId]!;
  castle.tier = 'main';
  state.policies[castle.ownerClanId]!.active = ['pol.jokashuju' as PolicyId];
  const districts = castle.districtIds.map((id) => state.districts[id]!);
  districts.forEach((district, index) => {
    district.population =
      Math.floor(25000 / districts.length) + (index < 25000 % districts.length ? 1 : 0);
  });
  expect(castleMaxSoldiers(state, castle)).toBe(1687.5);
}
function roundtrip(state: GameState): void {
  expect(validateState(state)).toEqual([]);
  const loaded = decodeSave(encodeSave(state, 123));
  expect(loaded.ok).toBe(true);
  if (loaded.ok) {
    // Canonical saves intentionally discard the transient AI intent ring (02 E-60).
    const persisted = structuredClone(state);
    persisted.ai.intentLog = [];
    expect(loaded.saveFile.state).toEqual(persisted);
  }
}
function applyValidated(state: GameState, command: Command): void {
  expect(validateCommand(state, command)).toEqual({ ok: true });
  applyCommand(state, command, () => {});
}

describe('integer capacity writes from actual commands/effects/AI', () => {
  it('instant levy apportions its actual integer gain, not fractional capacity, without RNG', () => {
    const state = buildTinyState();
    fractionalCap(state, CASTLE_A1);
    const castle = state.castles[CASTLE_A1]!;
    castle.soldiers = 1680;
    state.clans[CLAN_ALPHA]!.prestige = BAL.prestigeMax;
    state.clans[CLAN_ALPHA]!.gold = 10000;
    const beforePopulation = castle.districtIds.reduce(
      (sum, id) => sum + state.districts[id]!.population,
      0,
    );
    const rng = structuredClone(state.rng);
    applyValidated(state, {
      type: 'invokeTaimei',
      clanId: CLAN_ALPHA,
      taimeiId: 'taimei.sokuji-chohei' as TaimeiId,
    });
    expect(castle.soldiers).toBe(1688);
    expect(
      beforePopulation -
        castle.districtIds.reduce((sum, id) => sum + state.districts[id]!.population, 0),
    ).toBe(8);
    expect(castleMaxSoldiers(state, castle)).toBeCloseTo(1686.4);
    expect(castle.soldiers).toBeGreaterThan(castleMaxSoldiers(state, castle));
    expect(state.rng).toEqual(rng);
    roundtrip(state);
  });
  it('instant levy does not withdraw population when its rounded gain is nonpositive', () => {
    const state = buildTinyState();
    fractionalCap(state, CASTLE_A1);
    state.castles[CASTLE_A1]!.soldiers = 1688;
    state.clans[CLAN_ALPHA]!.prestige = BAL.prestigeMax;
    const populations = state.castles[CASTLE_A1]!.districtIds.map(
      (id) => state.districts[id]!.population,
    );
    applyValidated(state, {
      type: 'invokeTaimei',
      clanId: CLAN_ALPHA,
      taimeiId: 'taimei.sokuji-chohei' as TaimeiId,
    });
    expect(state.castles[CASTLE_A1]!.soldiers).toBe(1688);
    expect(
      state.castles[CASTLE_A1]!.districtIds.map((id) => state.districts[id]!.population),
    ).toEqual(populations);
    roundtrip(state);
  });
  it.each([
    [1680, 100, 1688],
    [1680, -1.5, 1679],
    [1700, 0, 1688],
    [3, -100, 0],
  ])(
    'scalar addSoldiers(%s,%s) retains amount-round/clamp order and writes %s',
    (initial, amount, expected) => {
      const state = buildTinyState();
      fractionalCap(state, CASTLE_A1);
      state.castles[CASTLE_A1]!.soldiers = initial;
      const rng = structuredClone(state.rng);
      applyScalarEffects(
        state,
        [{ op: 'addSoldiers', castleId: CASTLE_A1, amount }],
        null,
        () => {},
      );
      expect(state.castles[CASTLE_A1]!.soldiers).toBe(expected);
      expect(state.rng).toEqual(rng);
      roundtrip(state);
    },
  );
  it('real AI consolidation leaves the floor-fitting garrison through canonical validators/appliers', () => {
    const state = buildTinyState();
    state.castles[CASTLE_A2]!.soldiers = 2000;
    state.castles[CASTLE_A2]!.food = 10000;
    applyValidated(state, {
      type: 'march',
      clanId: CLAN_ALPHA,
      originCastleId: CASTLE_A2,
      leaderId: OFF_ALPHA_TAISHO,
      deputyIds: [],
      soldiers: 600,
      food: 1000,
      targetNodeId: CASTLE_B1,
    });
    const army = Object.values(state.armies)[0]!;
    applyValidated(state, {
      type: 'setAutoReturn',
      clanId: CLAN_ALPHA,
      armyId: army.id,
      enabled: false,
    });
    for (let day = 0; day < 30 && army.siegeId === null; day++) {
      state.time.day++;
      Object.assign(state.time, dayToCalendar(state.time.day));
      militaryMovementSystem(state);
    }
    expect(army.status).toBe('sieging');
    state.castles[CASTLE_B1]!.morale = 0;
    siegeSystem(state);
    expect(state.castles[CASTLE_B1]!.ownerClanId).toBe(CLAN_ALPHA);
    expect(army.status).toBe('holding');
    expect(army.posNodeId).toBe(CASTLE_B1);
    fractionalCap(state, CASTLE_B1);
    state.castles[CASTLE_B1]!.soldiers = 1680;
    state.meta.playerClanId = CLAN_BETA;
    const ai = state.ai.clans[CLAN_ALPHA]!;
    ai.nextPlanSeq = 2;
    ai.attackPlans = [
      {
        id: 'plan.alpha-1',
        ownerCorpsId: null,
        targetCastleId: CASTLE_B1,
        targetClanId: CLAN_BETA,
        sourceLeaderIds: { [CASTLE_A2]: army.leaderId },
        stagingRetainedTroops: 0,
        stagingCastleId: CASTLE_A2,
        sourceCastleIds: [CASTLE_A2],
        stage: 'advance',
        armyIds: [army.id],
        startedDay: state.time.day,
        stageEnteredDay: state.time.day,
        plannedTroops: 600,
        abortReason: null,
      },
    ];
    roundtrip(state);
    const q = validatingSink(state),
      rng = structuredClone(state.rng);
    attackPlansDailyTick(
      state,
      {
        clanId: CLAN_ALPHA,
        corpsId: null,
        castleIds: [CASTLE_A1, CASTLE_A2, CASTLE_B1],
        targetNodeId: null,
      },
      q.sink,
    );
    const deposit = q.orders.find((order) => order.command.type === 'depositGarrison')?.command;
    expect(deposit).toMatchObject({ type: 'depositGarrison', soldiers: 7 });
    expect(state.castles[CASTLE_B1]!.soldiers).toBe(1680);
    q.flush();
    expect(state.castles[CASTLE_B1]!.soldiers).toBe(1687);
    expect(state.rng).toEqual(rng);
    roundtrip(state);
  });
  it('debug flow fills a fractional-cap production castle with integer troops on its detached clone', async () => {
    const state = buildGameStateFromScenario(await loadS1560Scenario(), {
      appVersion: 'capacity-test',
      seed: DEBUG_M6_FLOW_SEED,
      playerClanId: DEBUG_M6_FLOW_IDS.actor,
      difficulty: 'normal',
    });
    fractionalCap(state, DEBUG_M6_FLOW_IDS.allyCastle);
    roundtrip(state);
    const before = structuredClone(state);
    const output = prepareM6FlowState(state);
    expect(output.castles[DEBUG_M6_FLOW_IDS.allyCastle]!.soldiers).toBe(1688);
    expect(state).toEqual(before);
    expect(output.rng).toEqual(before.rng);
    roundtrip(output);
  });
});
