import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import {
  castleFoodCap,
  castleHarvest,
  castleMaxSoldiers,
  garrisonFoodMonthly,
  monthlyGoldIncome,
} from '../../src/core/domestic';
import { economySystem } from '../../src/core/systems/economy';
import { advanceDay } from '../../src/core/systems';
import { validateCommand } from '../../src/core/commands/validate';
import { rankIndex, salaryPayees } from '../../src/core/systems/officers';
import { POLICIES } from '../../src/core/policies';
import type { Command } from '../../src/core/commands/types';
import { validateState } from '../../src/core/state/invariants';
import type { MonthOpeningSettlement } from '../../src/core/systems/monthOpeningSettlement';
import type { FacilityTypeId, PolicyId } from '../../src/core/state/ids';
import { buildTinyState, CASTLE_A1, CASTLE_A2, CLAN_ALPHA } from '../fixtures/tiny';

function september() {
  const state = buildTinyState();
  state.time.day = 240;
  state.time.month = 9;
  state.time.dayOfMonth = 1;
  for (const castle of Object.values(state.castles)) {
    // Positive real garrisons at their population-derived cap: no recruitment
    // obscures the tested daily consumption/desertion boundary.
    castle.soldiers = castleMaxSoldiers(state, castle);
    castle.food = castleFoodCap(castle);
    castle.foodFrac = 0;
  }
  expect(validateState(state)).toEqual([]);
  return state;
}

describe('03 canonical harvest → income/upkeep → daily food ordering', () => {
  it('advances a real transport into same-day new storage before consumption and wallet upkeep', () => {
    const state = september();
    state.time.day = 238;
    state.time.month = 8;
    state.time.dayOfMonth = 29;
    for (const district of Object.values(state.districts)) {
      district.commerce = 0;
      district.developFocus = 'agri';
    }
    const policyId = 'pol.kenchi' as PolicyId;
    state.policies[CLAN_ALPHA]!.active = [policyId];
    const salary = salaryPayees(state, CLAN_ALPHA).reduce(
      (sum, officer) => sum + BAL.rankSalary[rankIndex(officer.rank)]!,
      0,
    );
    const policyCost = POLICIES[policyId]!.upkeepGold;
    const cargoGold = salary + policyCost;
    const cargoFood = 1000;
    state.clans[CLAN_ALPHA]!.gold = cargoGold;
    const castle = state.castles[CASTLE_A1]!;
    castle.buildQueue = [{ facilityTypeId: 'fac.kura' as FacilityTypeId, daysLeft: 2 }];
    const command: Command = {
      type: 'transport',
      clanId: CLAN_ALPHA,
      fromCastleId: CASTLE_A2,
      toCastleId: CASTLE_A1,
      soldiers: 0,
      food: cargoFood,
      gold: cargoGold,
    };
    expect(validateCommand(state, command)).toEqual({ ok: true });
    const first = advanceDay(state, [
      {
        seq: state.meta.lastAppliedCmdSeq + 1,
        issuedDay: state.time.day,
        command,
      },
    ]);
    expect(first.appliedCommands).toHaveLength(1);
    expect(state.time.dayOfMonth).toBe(30);
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(0);
    const order = Object.values(state.transports)[0]!;
    expect(order.edgeProgressDays).toBe(1);
    expect(order.edgeCostDays).toBe(2 / BAL.transportSpeedFactor);
    expect(validateState(state)).toEqual([]);
    const openingCap = castleFoodCap(castle);
    const openingSpace = openingCap - castle.food;
    const dailyFood = Math.floor(castle.foodFrac + garrisonFoodMonthly(state, castle) / 30);
    const final = advanceDay(state, []);
    const events = final.events;
    // Step 5 performs its real monthly development before Step 6 harvest;
    // the new storehouse changes only storage capacity, not this harvest formula.
    const expectedHarvestOverflow = castleHarvest(state, castle.id) - openingSpace;
    expect(state.time).toMatchObject({ month: 9, dayOfMonth: 1 });
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'economy.granaryOverflow',
        castleId: CASTLE_A1,
        food: expectedHarvestOverflow,
      }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'transport.arrived',
        toCastleId: CASTLE_A1,
        food: cargoFood,
        gold: cargoGold,
      }),
    );
    const harvestIndex = events.findIndex((e) => e.type === 'economy.harvest');
    const facilityIndex = events.findIndex((e) => e.type === 'facility.completed');
    const arrivalIndex = events.findIndex((e) => e.type === 'transport.arrived');
    const incomeIndex = events.findIndex((e) => e.type === 'economy.income');
    expect(harvestIndex).toBeLessThan(facilityIndex);
    expect(facilityIndex).toBeLessThan(arrivalIndex);
    expect(arrivalIndex).toBeLessThan(incomeIndex);
    expect(castleFoodCap(castle)).toBe(openingCap + BAL.facStorehouseCap);
    expect(castle.food).toBe(openingCap + cargoFood - dailyFood);
    expect(state.transports[order.id]).toBeUndefined();
    expect(state.policies[CLAN_ALPHA]!.active).toEqual([policyId]);
    expect(events.some((e) => e.type === 'economy.upkeepUnpaid' && e.clanId === CLAN_ALPHA)).toBe(
      false,
    );
    expect(
      final.monthOpeningSettlement!.clans.find((row) => row.clanId === CLAN_ALPHA),
    ).toMatchObject({
      goldBefore: cargoGold,
      incomeGold: 0,
      salaryDue: salary,
      salaryPaid: salary,
      policyPaid: policyCost,
      goldAfter: 0,
    });
    expect(validateState(state)).toEqual([]);
  });

  it('crosses actual 8/30 → 9/1 Tick steps with capacity clipping before daily consumption', () => {
    const state = september(),
      castle = state.castles[CASTLE_A1]!;
    state.time.day = 239;
    state.time.month = 8;
    state.time.dayOfMonth = 30;
    const cap = castleFoodCap(castle);
    const daily = Math.floor(garrisonFoodMonthly(state, castle) / 30);
    expect(validateState(state)).toEqual([]);
    const result = advanceDay(state, []);
    expect(state.time).toMatchObject({ day: 240, month: 9, dayOfMonth: 1 });
    expect(castle.food).toBe(cap - daily);
    expect(result.events.findIndex((e) => e.type === 'economy.harvest')).toBeLessThan(
      result.events.findIndex((e) => e.type === 'economy.income'),
    );
    expect(result.monthOpeningSettlement).toMatchObject({ day: 240, month: 9, dayOfMonth: 1 });
    expect(validateState(state)).toEqual([]);
  });
  it('clips a full granary before positive daily garrison consumption, not after it', () => {
    const state = september(),
      castle = state.castles[CASTLE_A1]!;
    const cap = castleFoodCap(castle),
      harvest = castleHarvest(state, castle.id);
    const daily = Math.floor(garrisonFoodMonthly(state, castle) / 30);
    expect(daily).toBeGreaterThan(0);
    const events = economySystem(state);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'economy.granaryOverflow',
        castleId: castle.id,
        food: harvest,
      }),
    );
    expect(castle.food).toBe(cap - daily);
    const harvestIndex = events.findIndex((e) => e.type === 'economy.harvest');
    expect(harvestIndex).toBeLessThan(events.findIndex((e) => e.type === 'economy.income'));
    expect(validateState(state)).toEqual([]);
  });

  it('harvest replenishes zero-stock positive garrisons before any starvation/desertion', () => {
    const state = september(),
      castle = state.castles[CASTLE_A1]!;
    castle.food = 0;
    castle.morale = 60;
    const troops = castle.soldiers,
      harvest = castleHarvest(state, castle.id);
    const daily = Math.floor(garrisonFoodMonthly(state, castle) / 30);
    const events = economySystem(state);
    expect(
      events.filter((e) => e.type === 'economy.foodShortage' && e.castleId === castle.id),
    ).toEqual([]);
    expect(castle.soldiers).toBe(troops);
    expect(castle.morale).toBe(Math.min(100, 60 + BAL.castleMoraleRecoverMonthly));
    expect(castle.food).toBe(harvest - daily);
    expect(validateState(state)).toEqual([]);
  });

  it('uses opening kenchi harvest even when actual monthly upkeep auto-revokes it afterward', () => {
    const state = september();
    for (const district of Object.values(state.districts)) district.commerce = 0;
    state.clans[CLAN_ALPHA]!.gold = 0;
    state.policies[CLAN_ALPHA]!.active = ['pol.kenchi' as PolicyId];
    const castles = Object.values(state.castles).filter((c) => c.ownerClanId === CLAN_ALPHA);
    for (const castle of castles) castle.food = 100;
    const gross = castles.reduce((sum, c) => sum + castleHarvest(state, c.id), 0);
    const events = economySystem(state);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'economy.harvest', clanId: CLAN_ALPHA, totalFood: gross }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'policy.autoRevoked', policyId: 'pol.kenchi' }),
    );
    expect(state.policies[CLAN_ALPHA]!.active).toEqual([]);
    expect(validateState(state)).toEqual([]);
  });

  it('harvest uses opening capacity but same-day facility completion still contributes monthly gold', () => {
    const state = september(),
      castle = state.castles[CASTLE_A1]!;
    castle.buildQueue = [{ facilityTypeId: 'fac.kura' as FacilityTypeId, daysLeft: 1 }];
    const harvest = castleHarvest(state, castle.id),
      openingCap = castleFoodCap(castle);
    const daily = Math.floor(garrisonFoodMonthly(state, castle) / 30);
    const events = economySystem(state);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'economy.granaryOverflow',
        castleId: castle.id,
        food: harvest,
      }),
    );
    expect(castleFoodCap(castle)).toBe(openingCap + BAL.facStorehouseCap);
    expect(castle.food).toBe(openingCap - daily);
    expect(events.findIndex((e) => e.type === 'economy.harvest')).toBeLessThan(
      events.findIndex((e) => e.type === 'facility.completed'),
    );
    expect(validateState(state)).toEqual([]);

    const goldState = september(),
      market = goldState.castles[CASTLE_A1]!;
    market.buildQueue = [{ facilityTypeId: 'fac.ichi' as FacilityTypeId, daysLeft: 1 }];
    const without = monthlyGoldIncome(goldState, CLAN_ALPHA);
    const goldEvents = economySystem(goldState);
    const withMarket = monthlyGoldIncome(goldState, CLAN_ALPHA);
    expect(withMarket).toBeGreaterThan(without);
    expect(goldEvents).toContainEqual(
      expect.objectContaining({ type: 'economy.income', clanId: CLAN_ALPHA, gold: withMarket }),
    );
    expect(validateState(goldState)).toEqual([]);
  });

  it('settlement observation is detached and changes neither state/events nor RNG at the new boundary', () => {
    const plain = september(),
      observed = structuredClone(plain);
    const snapshots: MonthOpeningSettlement[] = [];
    const rng = structuredClone(plain.rng);
    expect(economySystem(observed, (s) => snapshots.push(s))).toEqual(economySystem(plain));
    expect(observed).toEqual(plain);
    expect(observed.rng).toEqual(rng);
    expect(snapshots).toHaveLength(1);
    for (const row of snapshots[0]!.clans)
      expect(row.goldAfter).toBe(
        row.goldBefore +
          row.incomeGold +
          row.tributeReceived -
          row.tributePaid -
          row.salaryPaid -
          row.policyPaid,
      );
    const snapshot = structuredClone(snapshots[0]);
    observed.clans[CLAN_ALPHA]!.gold++;
    expect(snapshots[0]).toEqual(snapshot);
    expect(validateState(observed)).toEqual([]);
  });
});
