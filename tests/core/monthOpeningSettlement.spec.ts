import { describe, expect, it } from 'vitest';
import { economySystem } from '../../src/core/systems/economy';
import type { MonthOpeningSettlement } from '../../src/core/systems/monthOpeningSettlement';
import { monthlyGoldIncome, monthlyGoldIncomeForCastles } from '../../src/core/domestic';
import { splitCorpsIncome } from '../../src/core/systems/corps';
import { ensureDiplomacyRow } from '../../src/core/systems/diplomacyCommon';
import { canonicalStringify } from '../../src/core/state/serialize';
import { BAL } from '../../src/core/balance';
import { POLICIES } from '../../src/core/policies';
import { RANK_VALUES } from '../../src/core/state/enums';
import { salaryPayees } from '../../src/core/systems/officers';
import type { GameState } from '../../src/core/state/gameState';
import type { CorpsId, PolicyId } from '../../src/core/state/ids';
import {
  buildTinyState,
  CASTLE_A2,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_TAISHO,
} from '../fixtures/tiny';

function capture(state: GameState) {
  const snapshots: MonthOpeningSettlement[] = [];
  const events = economySystem(state, (settlement) => snapshots.push(settlement));
  return { events, settlement: snapshots[0]!, snapshots };
}
function zeroIncome(state: GameState) {
  for (const district of Object.values(state.districts)) district.commerce = 0;
}

/** Controlled monthly accounting fixtures; no claim to exercise historical/AI lifecycle rules. */
describe('actual month-opening gold settlement', () => {
  it('reports sorted living clans/calendar and reconciles actual wallet identity', () => {
    const state = buildTinyState();
    const { settlement } = capture(state);
    expect(settlement).toMatchObject({
      day: state.time.day,
      year: state.time.year,
      month: state.time.month,
      dayOfMonth: 1,
    });
    expect(settlement.clans.map((row) => row.clanId)).toEqual([CLAN_ALPHA, CLAN_BETA]);
    for (const row of settlement.clans) {
      expect(row.goldAfter).toBe(state.clans[row.clanId]!.gold);
      expect(row.goldAfter).toBe(
        row.goldBefore +
          row.incomeGold +
          row.tributeReceived -
          row.tributePaid -
          row.salaryPaid -
          row.policyPaid,
      );
    }
  });

  it('separates retained corps income from actual clan-wallet income', () => {
    const state = buildTinyState();
    const id = 'corps.settlement' as CorpsId;
    state.corps[id] = {
      id,
      clanId: CLAN_ALPHA,
      corpsLeaderId: OFF_ALPHA_TAISHO,
      directive: 'hold',
      targetNodeId: null,
      gold: 7,
      createdDay: state.time.day,
    };
    state.castles[CASTLE_A2]!.corpsId = id;
    const retained = splitCorpsIncome(monthlyGoldIncomeForCastles(state, [CASTLE_A2])).corpsGold;
    const total = monthlyGoldIncome(state, CLAN_ALPHA);
    const { events, settlement } = capture(state);
    const row = settlement.clans.find((row) => row.clanId === CLAN_ALPHA)!;
    expect(row.retainedCorpsGold).toBe(retained);
    expect(row.incomeGold).toBe(total - retained);
    expect(state.corps[id].gold).toBe(7 + retained);
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'economy.income',
        clanId: CLAN_ALPHA,
        gold: row.incomeGold,
      }),
    );
  });

  it('records actual tribute once after both incomes, not from treasury or received tribute', () => {
    const state = buildTinyState();
    ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA).pacts.push({
      kind: 'vassal',
      startDay: state.time.day,
      endDay: null,
      vassalClanId: CLAN_BETA,
    });
    const { settlement } = capture(state);
    const alpha = settlement.clans.find((row) => row.clanId === CLAN_ALPHA)!;
    const beta = settlement.clans.find((row) => row.clanId === CLAN_BETA)!;
    expect(beta.tributePaid).toBe(Math.floor(beta.incomeGold * BAL.vassalTributeRate));
    expect(alpha.tributeReceived).toBe(beta.tributePaid);
    expect(alpha.tributePaid).toBe(0);
    expect(beta.tributeReceived).toBe(0);
  });

  it('distinguishes salary due from the actual wallet wipe when funds are insufficient', () => {
    const state = buildTinyState();
    zeroIncome(state);
    state.clans[CLAN_ALPHA]!.gold = 2;
    for (const officer of Object.values(state.officers))
      if (officer.clanId === CLAN_ALPHA && officer.id !== state.clans[CLAN_ALPHA]!.leaderId)
        officer.rank = RANK_VALUES[0];
    const salaryDue = salaryPayees(state, CLAN_ALPHA).length * BAL.rankSalary[0];
    const { events, settlement } = capture(state);
    expect(settlement.clans.find((row) => row.clanId === CLAN_ALPHA)).toMatchObject({
      goldBefore: 2,
      goldAfter: 0,
      salaryDue,
      salaryPaid: 2,
      policyPaid: 0,
    });
    expect(
      events.some((event) => event.type === 'economy.upkeepUnpaid' && event.clanId === CLAN_ALPHA),
    ).toBe(true);
  });

  it('reports only policy gold actually charged after automatic last-in-first-out revocation', () => {
    const state = buildTinyState();
    zeroIncome(state);
    for (const officer of Object.values(state.officers)) officer.hasComeOfAge = false;
    const policyPaid =
      POLICIES['pol.tenmasei' as PolicyId]!.upkeepGold +
      POLICIES['pol.jishahogo' as PolicyId]!.upkeepGold;
    state.clans[CLAN_ALPHA]!.gold = policyPaid;
    state.policies[CLAN_ALPHA]!.active = [
      'pol.tenmasei',
      'pol.jishahogo',
      'pol.sekisho',
    ] as PolicyId[];
    const { settlement, events } = capture(state);
    expect(settlement.clans.find((row) => row.clanId === CLAN_ALPHA)).toMatchObject({
      goldBefore: policyPaid,
      goldAfter: 0,
      salaryDue: 0,
      salaryPaid: 0,
      policyPaid,
    });
    expect(state.policies[CLAN_ALPHA]!.active).toEqual(['pol.tenmasei', 'pol.jishahogo']);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'policy.autoRevoked', policyId: 'pol.sekisho' }),
    );
  });

  it('does not call the observer outside month opening or include dead clans', () => {
    const state = buildTinyState();
    state.time.dayOfMonth = 2;
    expect(capture(state).snapshots).toEqual([]);
    state.time.dayOfMonth = 1;
    state.clans[CLAN_BETA]!.alive = false;
    expect(capture(state).settlement.clans.map((row) => row.clanId)).toEqual([CLAN_ALPHA]);
  });

  it('includes flat policy grants in incomeGold, rather than claiming a commerce-only breakdown', () => {
    const state = buildTinyState();
    zeroIncome(state);
    state.policies[CLAN_ALPHA]!.active = ['pol.nanban'] as PolicyId[];
    const { settlement } = capture(state);
    expect(settlement.clans.find((row) => row.clanId === CLAN_ALPHA)!.incomeGold).toBe(
      BAL.polNanbanGold,
    );
  });

  it('preserves state/events/RNG with positive corps retention, tribute and flat grants', () => {
    const state = buildTinyState();
    const id = 'corps.settlement' as CorpsId;
    state.corps[id] = {
      id,
      clanId: CLAN_ALPHA,
      corpsLeaderId: OFF_ALPHA_TAISHO,
      directive: 'hold',
      targetNodeId: null,
      gold: 7,
      createdDay: state.time.day,
    };
    state.castles[CASTLE_A2]!.corpsId = id;
    ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA).pacts.push({
      kind: 'vassal',
      startDay: state.time.day,
      endDay: null,
      vassalClanId: CLAN_BETA,
    });
    state.policies[CLAN_ALPHA]!.active = ['pol.nanban', 'pol.sekisho'] as PolicyId[];
    const reference = structuredClone(state);
    const { events, settlement } = capture(state);
    expect(
      settlement.clans.find((row) => row.clanId === CLAN_ALPHA)!.retainedCorpsGold,
    ).toBeGreaterThan(0);
    expect(settlement.clans.find((row) => row.clanId === CLAN_BETA)!.tributePaid).toBeGreaterThan(
      0,
    );
    expect(events).toEqual(economySystem(reference));
    expect(canonicalStringify(state)).toBe(canonicalStringify(reference));
    for (const row of settlement.clans) {
      expect(row.goldAfter).toBe(
        row.goldBefore +
          row.incomeGold +
          row.tributeReceived -
          row.tributePaid -
          row.salaryPaid -
          row.policyPaid,
      );
    }
  });

  it('preserves state/events/RNG when salary exhausts funds and policies are revoked', () => {
    const state = buildTinyState();
    zeroIncome(state);
    state.clans[CLAN_ALPHA]!.gold = 2;
    state.policies[CLAN_ALPHA]!.active = ['pol.sekisho'] as PolicyId[];
    const reference = structuredClone(state);
    const { events, settlement } = capture(state);
    expect(events).toEqual(economySystem(reference));
    expect(canonicalStringify(state)).toBe(canonicalStringify(reference));
    const row = settlement.clans.find((row) => row.clanId === CLAN_ALPHA)!;
    expect(row.salaryDue).toBeGreaterThan(row.salaryPaid);
    expect(row.salaryPaid).toBe(2);
    expect(row.policyPaid).toBe(0);
    expect(state.policies[CLAN_ALPHA]!.active).toEqual([]);
  });

  it('keeps events/canonical state/RNG identical with or without detached observation', () => {
    const observed = buildTinyState(),
      reference = structuredClone(observed);
    const { events, settlement } = capture(observed);
    expect(events).toEqual(economySystem(reference));
    expect(canonicalStringify(observed)).toBe(canonicalStringify(reference));
    const before = canonicalStringify(observed);
    (settlement.clans[0] as unknown as { goldAfter: number }).goldAfter = -1;
    expect(canonicalStringify(observed)).toBe(before);
    observed.clans[CLAN_BETA]!.gold += 1;
    expect(settlement.clans[1]!.goldAfter).not.toBe(observed.clans[CLAN_BETA]!.gold);
  });
});
