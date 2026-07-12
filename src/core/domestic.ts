import { BAL } from './balance';
import { FACILITIES } from './facilities';
import { POLICIES } from './policies';
import type { Castle, District, GameState, Officer } from './state/gameState';
import type { CastleId, ClanId, FacilityTypeId, PolicyId } from './state/ids';
import { RANK_VALUES } from './state/enums';

export function hasPolicy(
  state: Readonly<GameState>,
  clanId: ClanId,
  policyId: PolicyId | string,
): boolean {
  return state.policies[clanId]?.active.includes(policyId as PolicyId) ?? false;
}

export function hasFacility(
  castle: Readonly<Castle>,
  facilityId: FacilityTypeId | string,
): boolean {
  return castle.facilities.includes(facilityId as FacilityTypeId);
}

export function castleFoodCap(castle: Readonly<Castle>): number {
  const base = castle.tier === 'main' ? BAL.castleFoodCapMain : BAL.castleFoodCapBranch;
  return base + (hasFacility(castle, 'fac.kura') ? BAL.facStorehouseCap : 0);
}

export function castleMaxSoldiers(state: Readonly<GameState>, castle: Readonly<Castle>): number {
  let population = 0;
  for (const districtId of castle.districtIds) {
    const district = state.districts[districtId];
    if (district && district.ownerClanId === castle.ownerClanId) population += district.population;
  }
  const policyMult = hasPolicy(state, castle.ownerClanId, 'pol.jokashuju') ? 1.1 : 1;
  const base = castle.tier === 'main' ? BAL.castleBaseSoldiersMain : BAL.castleBaseSoldiersBranch;
  const barracks = hasFacility(castle, 'fac.heisha') ? BAL.facBarracksSoldierCap : 0;
  return base + Math.floor(population * BAL.soldiersPerPop * policyMult) + barracks;
}

export function fiefTaxRate(state: Readonly<GameState>, clanId: ClanId): number {
  return BAL.fiefTaxRate + (hasPolicy(state, clanId, 'pol.kenchi') ? 0.05 : 0);
}

export function isSteward(state: Readonly<GameState>, officer: Readonly<Officer>): boolean {
  return Object.values<District>(state.districts).some(
    (district) => district.stewardId === officer.id,
  );
}

export function officerSalary(state: Readonly<GameState>, officer: Readonly<Officer>): number {
  if (officer.status !== 'serving' || officer.clanId === null) return 0;
  if (state.clans[officer.clanId]?.leaderId === officer.id || isSteward(state, officer)) return 0;
  const index = RANK_VALUES.indexOf(officer.rank);
  return BAL.rankSalary[index] ?? 0;
}

/** 城內駐軍一個月的兵糧需求；超編部分雙倍、兵農分離再加一成。 */
export function garrisonFoodMonthly(state: Readonly<GameState>, castle: Readonly<Castle>): number {
  const overCap = Math.max(0, castle.soldiers - castleMaxSoldiers(state, castle));
  const policyRate = hasPolicy(state, castle.ownerClanId, 'pol.heinobunri') ? 1.1 : 1;
  return (castle.soldiers + overCap) * BAL.garrisonFoodPerSoldierMonthly * policyRate;
}

export function policyUpkeep(state: Readonly<GameState>, clanId: ClanId): number {
  let total = 0;
  for (const id of state.policies[clanId]?.active ?? []) total += POLICIES[id]?.upkeepGold ?? 0;
  return total;
}

export function castleCommerceMultiplier(
  state: Readonly<GameState>,
  castle: Readonly<Castle>,
): number {
  let multiplier = 1;
  if (hasFacility(castle, 'fac.ichi')) multiplier *= 1 + BAL.facMarketIncomeBonus;
  if (hasFacility(castle, 'fac.minato')) multiplier *= 1 + BAL.facPortIncomeBonus;
  if (hasPolicy(state, castle.ownerClanId, 'pol.rakuichi')) multiplier *= 1.25;
  return multiplier;
}

export function monthlyGoldIncome(state: Readonly<GameState>, clanId: ClanId): number {
  let commerce = 0;
  for (const district of Object.values<District>(state.districts)) {
    if (district.ownerClanId !== clanId || district.uprising !== null) continue;
    const castle = state.castles[district.castleId];
    if (!castle) continue;
    const tax = district.stewardId === null ? 1 : fiefTaxRate(state, clanId);
    commerce += district.commerce * tax * castleCommerceMultiplier(state, castle);
  }
  let fixed = 0;
  for (const castle of Object.values<Castle>(state.castles)) {
    if (
      castle.ownerClanId === clanId &&
      facilityIsActive(state, castle, 'fac.nanbanji') &&
      hasPolicy(state, clanId, 'pol.nanban')
    ) {
      fixed += BAL.facNanbanGold;
    }
  }
  if (hasPolicy(state, clanId, 'pol.nanban')) fixed += BAL.polNanbanGold;
  return Math.floor(commerce * BAL.goldPerCommerce + fixed);
}

export function castleHarvest(state: Readonly<GameState>, castleId: CastleId): number {
  const castle = state.castles[castleId];
  if (!castle) return 0;
  let total = 0;
  for (const districtId of castle.districtIds) {
    const district = state.districts[districtId];
    if (!district || district.ownerClanId !== castle.ownerClanId || district.uprising !== null)
      continue;
    total +=
      district.kokudaka *
      (district.stewardId === null ? 1 : fiefTaxRate(state, castle.ownerClanId));
  }
  let multiplier = BAL.harvestRate;
  if (facilityIsActive(state, castle, 'fac.komedoiya')) multiplier *= 1 + BAL.facRiceHarvestBonus;
  if (hasPolicy(state, castle.ownerClanId, 'pol.kenchi')) multiplier *= 1.1;
  return Math.floor(total * multiplier);
}

export function facilityIsActive(
  state: Readonly<GameState>,
  castle: Readonly<Castle>,
  facilityId: string,
): boolean {
  if (!castle.facilities.includes(facilityId as never)) return false;
  const def = FACILITIES[facilityId as keyof typeof FACILITIES];
  if (!def) return false;
  if (def.requiresFacility !== null && !castle.facilities.includes(def.requiresFacility))
    return false;
  if (def.requiresPolicy !== null && !hasPolicy(state, castle.ownerClanId, def.requiresPolicy))
    return false;
  return true;
}
