import { BAL } from '../balance';
import { castleFoodCap, castleHarvest, garrisonFoodMonthly, monthlyGoldIncome } from '../domestic';
import { POLICIES } from '../policies';
import type { Castle, Clan, GameState } from '../state/gameState';
import type { GameEvent } from '../state/events';
import { conscriptionSystem } from './conscription';
import { facilitiesDaily } from './facilities';
import { transportDaily } from './transport';
import { paySalaryForClan } from './officers';

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

function monthlyIncomeAndUpkeep(state: GameState, events: GameEvent[]): void {
  for (const id of Object.keys(state.clans).sort()) {
    const clan: Clan | undefined = state.clans[id as keyof typeof state.clans];
    if (!clan?.alive) continue;
    const income = monthlyGoldIncome(state, clan.id);
    clan.gold += income;
    events.push({
      type: 'economy.income',
      day: state.time.day,
      clanIds: [clan.id],
      clanId: clan.id,
      gold: income,
      foodByCastle: {},
    });
    const salary = paySalaryForClan(state, clan.id);
    if (!salary.paid) {
      events.push({
        type: 'economy.upkeepUnpaid',
        day: state.time.day,
        clanIds: [clan.id],
        clanId: clan.id,
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
    clan.gold -= Math.min(clan.gold, upkeep);
  }
}

function autumnHarvest(state: GameState, events: GameEvent[]): void {
  const totals = new Map<string, number>();
  for (const id of Object.keys(state.castles).sort()) {
    const castle = state.castles[id as keyof typeof state.castles];
    if (!castle) continue;
    const harvest = castleHarvest(state, castle.id);
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

export function economySystem(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  for (const id of Object.keys(state.castles).sort()) {
    const castle = state.castles[id as keyof typeof state.castles];
    if (castle) garrisonFoodDaily(state, castle, events);
  }
  events.push(...facilitiesDaily(state));
  events.push(...transportDaily(state));
  if (state.time.dayOfMonth === 1) {
    for (const castle of Object.values<Castle>(state.castles)) castle.riceTradedThisMonth = 0;
    monthlyIncomeAndUpkeep(state, events);
    events.push(...conscriptionSystem(state));
  }
  if (state.time.month === 9 && state.time.dayOfMonth === 1) autumnHarvest(state, events);
  return events;
}
