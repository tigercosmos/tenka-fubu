import { expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { monthlyGoldIncome } from '../../src/core/domestic';
import { CommandQueue } from '../../src/core/commands/queue';
import type { Command } from '../../src/core/commands/types';
import { validateCommand } from '../../src/core/commands/validate';
import { advanceDay } from '../../src/core/systems';
import { selectBudgetForecast } from '../../src/core/state/selectors';
import { validateState } from '../../src/core/state/invariants';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import type { ClanId, FacilityTypeId, PolicyId, RoadEdgeId } from '../../src/core/state/ids';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  DIST_A1X,
  DIST_B1X,
  OFF_ALPHA_BUSHO,
  OFF_ALPHA_LORD,
} from '../fixtures/tiny';

const rakuichi = 'pol.rakuichi' as PolicyId;
const market = 'fac.ichi' as FacilityTypeId;
const port = 'fac.minato' as FacilityTypeId;
function tick(state: ReturnType<typeof buildTinyState>, command?: Command) {
  const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  if (command) {
    expect(validateCommand(state, command)).toEqual({ ok: true });
    queue.enqueue(command, state.time.day);
  }
  const result = advanceDay(state, queue.drain());
  expect(result.events.filter((event) => event.type === 'command.rejected')).toEqual([]);
  expect(validateState(state)).toEqual([]);
  return result;
}
function conquered(policyClan: ClanId | null) {
  const state = buildTinyState();
  // Controlled pre-existing policy metadata, not a claim of earned adoption.
  if (policyClan !== null) {
    state.policies[policyClan]!.active = [rakuichi];
    state.clans[policyClan]!.gold = 10_000;
  }
  // Controlled valid land corridor and completed market prerequisites; actual
  // ownership changes below come only from queued march and daily subjugation.
  const road = 'road.rakuichi-a1-b1x' as RoadEdgeId;
  state.roads[road] = { id: road, a: CASTLE_A1, b: DIST_B1X, type: 'land', grade: 1, baseDays: 1 };
  state.castles[CASTLE_B1]!.facilities = [market];
  expect(validateState(state)).toEqual([]);
  tick(state, {
    type: 'grantFief',
    clanId: CLAN_ALPHA,
    districtId: DIST_A1X,
    officerId: OFF_ALPHA_BUSHO,
  });
  tick(state, {
    type: 'march',
    clanId: CLAN_ALPHA,
    originCastleId: CASTLE_A1,
    leaderId: OFF_ALPHA_LORD,
    deputyIds: [],
    soldiers: 100,
    food: 100,
    targetNodeId: DIST_B1X,
  });
  let subjugated = false;
  for (let day = 0; day < 12 && state.districts[DIST_B1X]!.ownerClanId !== CLAN_ALPHA; day++) {
    subjugated ||= tick(state).events.some(
      (event) => event.type === 'district.subjugated' && event.districtId === DIST_B1X,
    );
  }
  expect(subjugated).toBe(true);
  expect(state.districts[DIST_B1X]!.ownerClanId).toBe(CLAN_ALPHA);
  expect(state.castles[CASTLE_B1]!.ownerClanId).toBe(CLAN_BETA);
  return state;
}
function expectedIncome(state: ReturnType<typeof buildTinyState>, clanId: ClanId) {
  const policyFactor = state.policies[clanId]!.active.includes(rakuichi)
    ? BAL.polRakuichiIncomeMult
    : 1;
  let commerce = 0;
  for (const district of Object.values(state.districts)) {
    if (district.ownerClanId !== clanId || district.uprising !== null) continue;
    const castle = state.castles[district.castleId]!;
    const facilityFactor =
      (castle.facilities.includes(market) ? 1 + BAL.facMarketIncomeBonus : 1) *
      (castle.facilities.includes(port) ? 1 + BAL.facPortIncomeBonus : 1);
    commerce +=
      district.commerce *
      (district.stewardId === null ? 1 : BAL.fiefTaxRate) *
      facilityFactor *
      policyFactor;
  }
  return Math.floor(commerce * BAL.goldPerCommerce);
}

it.each([CLAN_ALPHA, CLAN_BETA, null])(
  'uses the earning clan policy after real district-only conquest (policy=%s)',
  (policyClan) => {
    const state = conquered(policyClan);
    const before = structuredClone(state);
    const expected = expectedIncome(state, CLAN_ALPHA);
    expect(monthlyGoldIncome(state, CLAN_ALPHA)).toBe(expected);
    expect(selectBudgetForecast(state, CLAN_ALPHA).goldIncomeMonthly).toBe(expected);
    expect(state).toEqual(before);
  },
);

it.each([CLAN_ALPHA, CLAN_BETA])(
  'settles real month income and native continuation with policy=%s',
  (policyClan) => {
    const state = conquered(policyClan);
    const decoded = decodeSave(encodeSave(state, 123));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.code);
    const restored = decoded.saveFile.state;
    expect(validateState(restored)).toEqual([]);
    while (state.time.dayOfMonth !== 30) {
      expect(tick(restored).events).toEqual(tick(state).events);
      expect(encodeSave(restored, 123)).toBe(encodeSave(state, 123));
    }
    const result = tick(state);
    const continued = tick(restored);
    expect(continued.events).toEqual(result.events);
    expect(continued.monthOpeningSettlement).toEqual(result.monthOpeningSettlement);
    expect(state.time.dayOfMonth).toBe(1);
    expect(state.districts[DIST_B1X]!.ownerClanId).toBe(CLAN_ALPHA);
    expect(state.castles[CASTLE_B1]!.ownerClanId).toBe(CLAN_BETA);
    const expected = expectedIncome(state, CLAN_ALPHA);
    const income = result.events.find(
      (event) => event.type === 'economy.income' && event.clanId === CLAN_ALPHA,
    );
    expect(income).toMatchObject({ type: 'economy.income', clanId: CLAN_ALPHA, gold: expected });
    const settlement = result.monthOpeningSettlement!.clans.find(
      (row) => row.clanId === CLAN_ALPHA,
    )!;
    expect(settlement.incomeGold).toBe(expected);
    expect(settlement.goldAfter).toBe(
      settlement.goldBefore +
        settlement.incomeGold +
        settlement.tributeReceived -
        settlement.tributePaid -
        settlement.salaryPaid -
        settlement.policyPaid,
    );
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(settlement.goldAfter);
    expect(encodeSave(restored, 123)).toBe(encodeSave(state, 123));
    expect(restored.rng).toEqual(state.rng);
  },
);
