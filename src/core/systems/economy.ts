import { BAL } from '../balance';
import {
  castleFoodCap,
  castleHarvest,
  garrisonFoodMonthly,
  monthlyGoldIncome,
  monthlyGoldIncomeForCastles,
} from '../domestic';
import { POLICIES } from '../policies';
import type { Castle, Clan, GameState } from '../state/gameState';
import type { GameEvent } from '../state/events';
import { conscriptionSystem } from './conscription';
import { facilitiesDaily } from './facilities';
import { transportDaily } from './transport';
import { paySalaryForClan } from './officers';
import { overlordOf } from '../commands/diplomacyCommands';
import type { ClanId } from '../state/ids';
import { getDifficultyMods } from './ai/difficulty';
import { splitCorpsIncome } from './corps';
import type { ClanMonthOpeningSettlement, MonthOpeningSettlement } from './monthOpeningSettlement';

type MutableSettlement = {
  -readonly [Key in keyof ClanMonthOpeningSettlement]: ClanMonthOpeningSettlement[Key];
};

function garrisonFoodDaily(state: GameState, castle: Castle, events: GameEvent[]): void {
  castle.foodFrac += garrisonFoodMonthly(state, castle) / 30;
  const whole = Math.floor(castle.foodFrac);
  castle.foodFrac -= whole;
  if (whole === 0) return;
  const before = castle.food;
  if (castle.food >= whole) {
    castle.food -= whole;
    return;
  }
  castle.food = 0;
  if (Object.values(state.sieges).some((siege) => siege.castleId === castle.id)) return;
  castle.soldiers = Math.floor(castle.soldiers * (1 - BAL.starveDesertRate));
  castle.morale = Math.max(0, castle.morale - BAL.castleStarveMoraleDaily);
  if (before > 0 || state.time.dayOfMonth === 1) {
    events.push({
      type: 'economy.foodShortage',
      day: state.time.day,
      clanIds: [castle.ownerClanId],
      clanId: castle.ownerClanId,
      castleId: castle.id,
    });
  }
}

function monthlyIncomeAndUpkeep(
  state: GameState,
  events: GameEvent[],
  settlements?: ReadonlyMap<ClanId, MutableSettlement>,
): void {
  const incomes = new Map<ClanId, number>();
  for (const id of Object.keys(state.clans).sort()) {
    const clan: Clan | undefined = state.clans[id as keyof typeof state.clans];
    if (!clan?.alive) continue;
    const multiplier = getDifficultyMods(state, clan.id).incomeMult;
    const totalIncome = Math.floor(monthlyGoldIncome(state, clan.id) * multiplier);
    let income = totalIncome;
    const settlement = settlements?.get(clan.id);
    for (const corps of Object.values(state.corps)
      .filter((c) => c.clanId === clan.id)
      .sort((a, b) => a.id.localeCompare(b.id))) {
      const castles = Object.values(state.castles)
        .filter((c) => c.ownerClanId === clan.id && c.corpsId === corps.id)
        .map((c) => c.id);
      const gross = Math.floor(monthlyGoldIncomeForCastles(state, castles) * multiplier);
      const split = splitCorpsIncome(gross);
      corps.gold += split.corpsGold;
      income -= split.corpsGold;
      if (settlement) settlement.retainedCorpsGold += split.corpsGold;
    }
    incomes.set(clan.id, income);
    clan.gold += income;
    if (settlement) settlement.incomeGold = income;
    events.push({
      type: 'economy.income',
      day: state.time.day,
      clanIds: [clan.id],
      clanId: clan.id,
      gold: income,
      foodByCastle: {},
    });
  }
  // Actual clan-wallet income, excluding retained corps shares or incoming tribute.
  for (const [clanId, income] of incomes) {
    const overlord = overlordOf(state, clanId);
    if (overlord !== null && state.clans[overlord]?.alive) {
      const tribute = Math.floor(income * BAL.vassalTributeRate);
      state.clans[clanId]!.gold -= tribute;
      state.clans[overlord].gold += tribute;
      const payer = settlements?.get(clanId),
        receiver = settlements?.get(overlord);
      if (payer) payer.tributePaid += tribute;
      if (receiver) receiver.tributeReceived += tribute;
    }
  }
  for (const clanId of incomes.keys()) {
    const clan = state.clans[clanId]!;
    const settlement = settlements?.get(clanId);
    const beforeSalary = clan.gold;
    const salary = paySalaryForClan(state, clan.id);
    if (settlement) {
      settlement.salaryDue = salary.total;
      settlement.salaryPaid = beforeSalary - clan.gold;
    }
    if (!salary.paid) {
      events.push({
        type: 'economy.upkeepUnpaid',
        day: state.time.day,
        clanIds: [clan.id],
        clanId: clan.id,
        payeeIds: salary.payeeIds,
      });
    }
    const policyState = state.policies[clan.id];
    if (!policyState) continue;
    let upkeep = policyState.active.reduce(
      (sum, policyId) => sum + (POLICIES[policyId]?.upkeepGold ?? 0),
      0,
    );
    while (policyState.active.length > 0 && clan.gold < upkeep) {
      const policyId = policyState.active.pop();
      if (!policyId) break;
      upkeep -= POLICIES[policyId]?.upkeepGold ?? 0;
      events.push({
        type: 'policy.autoRevoked',
        day: state.time.day,
        clanIds: [clan.id],
        clanId: clan.id,
        policyId,
      });
    }
    const beforePolicy = clan.gold;
    clan.gold -= Math.min(clan.gold, upkeep);
    if (settlement) settlement.policyPaid = beforePolicy - clan.gold;
  }
}

function recoverCastleMoraleMonthly(state: GameState): void {
  const besieged = new Set(Object.values(state.sieges).map((siege) => siege.castleId));
  for (const castle of Object.values(state.castles)) {
    if (!besieged.has(castle.id)) {
      castle.morale = Math.min(100, castle.morale + BAL.castleMoraleRecoverMonthly);
    }
  }
}

/** Plan10 §5.5: current-year, clan-local fixed-point percentage; no producer behavior. */
export function eventHarvestMultiplier(state: Readonly<GameState>, clanId: ClanId): number {
  return (state.events.flags[`harvest.${state.time.year}.${clanId}`] ?? 100) / 100;
}

function autumnHarvest(state: GameState, events: GameEvent[]): void {
  const totals = new Map<string, number>();
  for (const id of Object.keys(state.castles).sort()) {
    const castle = state.castles[id as keyof typeof state.castles];
    if (!castle) continue;
    const harvest = Math.floor(
      castleHarvest(state, castle.id) *
        getDifficultyMods(state, castle.ownerClanId).incomeMult *
        eventHarvestMultiplier(state, castle.ownerClanId),
    );
    const cap = castleFoodCap(castle);
    const accepted = Math.min(harvest, Math.max(0, cap - castle.food));
    const overflow = harvest - accepted;
    castle.food += accepted;
    totals.set(castle.ownerClanId, (totals.get(castle.ownerClanId) ?? 0) + accepted);
    if (overflow > 0)
      events.push({
        type: 'economy.granaryOverflow',
        day: state.time.day,
        clanIds: [castle.ownerClanId],
        clanId: castle.ownerClanId,
        castleId: castle.id,
        food: overflow,
      });
  }
  for (const [clanId, totalFood] of totals) {
    events.push({
      type: 'economy.harvest',
      day: state.time.day,
      clanIds: [clanId as keyof typeof state.clans],
      clanId: clanId as keyof typeof state.clans,
      totalFood,
    });
  }
}

export function economySystem(
  state: GameState,
  onMonthlySettlement?: (settlement: MonthOpeningSettlement) => void,
): GameEvent[] {
  const events: GameEvent[] = [];
  // 03 §3.6/§5.3 owns internal settlement order: opening harvest precedes
  // income/upkeep and daily food. Keep daily construction/transport before
  // monthly wallets, and conscription after consumption (05 §5.2).
  if (state.time.month === 9 && state.time.dayOfMonth === 1) autumnHarvest(state, events);
  events.push(...facilitiesDaily(state));
  events.push(...transportDaily(state));
  if (state.time.dayOfMonth === 1) {
    for (const castle of Object.values<Castle>(state.castles)) castle.riceTradedThisMonth = 0;
    recoverCastleMoraleMonthly(state);
    const settlements = onMonthlySettlement
      ? new Map<ClanId, MutableSettlement>(
          Object.keys(state.clans)
            .sort()
            .map((id) => state.clans[id as ClanId]!)
            .filter((clan) => clan.alive)
            .map((clan) => [
              clan.id,
              {
                clanId: clan.id,
                goldBefore: clan.gold,
                goldAfter: clan.gold,
                incomeGold: 0,
                retainedCorpsGold: 0,
                tributePaid: 0,
                tributeReceived: 0,
                salaryDue: 0,
                salaryPaid: 0,
                policyPaid: 0,
              },
            ]),
        )
      : undefined;
    monthlyIncomeAndUpkeep(state, events, settlements);
    if (onMonthlySettlement && settlements) {
      const snapshot: MonthOpeningSettlement = {
        day: state.time.day,
        year: state.time.year,
        month: state.time.month,
        dayOfMonth: state.time.dayOfMonth,
        clans: [...settlements.values()].map((row) => ({
          ...row,
          goldAfter: state.clans[row.clanId]!.gold,
        })),
      };
      onMonthlySettlement(snapshot);
    }
  }
  for (const id of Object.keys(state.castles).sort()) {
    const castle = state.castles[id as keyof typeof state.castles];
    if (castle) garrisonFoodDaily(state, castle, events);
  }
  if (state.time.dayOfMonth === 1) events.push(...conscriptionSystem(state));
  return events;
}
