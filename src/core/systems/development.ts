import { BAL } from '../balance';
import { hasPolicy } from '../domestic';
import type { District, GameState, Officer } from '../state/gameState';
import type { GameEvent } from '../state/events';
import { monthlyUprising } from './uprising';
import { updateStewardFocuses } from './ai/stewardAi';
import { gainMerit } from './officers';
import { traitModifier } from '../traits';

type Attribute = 'kokudaka' | 'commerce' | 'population';

function effectiveStat(officer: Readonly<Officer> | undefined, attr: 'pol' | 'int'): number {
  if (!officer) return attr === 'pol' ? BAL.noLordDevPol : 0;
  return Math.min(BAL.abilityMax, officer[attr] + officer.statGrowth[attr]);
}

function effectivePol(state: Readonly<GameState>, district: Readonly<District>): number {
  if (district.stewardId !== null) return effectiveStat(state.officers[district.stewardId], 'pol');
  const lordId = state.castles[district.castleId]?.lordId;
  return effectiveStat(lordId ? state.officers[lordId] : undefined, 'pol');
}

function developmentOfficer(
  state: Readonly<GameState>,
  district: Readonly<District>,
): Officer | undefined {
  const officerId = district.stewardId ?? state.castles[district.castleId]?.lordId ?? null;
  return officerId === null ? undefined : state.officers[officerId];
}

function developmentPolicyMultiplier(
  state: Readonly<GameState>,
  district: Readonly<District>,
  attr: Attribute,
): number {
  let multiplier = 1;
  if (attr === 'commerce' && hasPolicy(state, district.ownerClanId, 'pol.rakuichi'))
    multiplier *= BAL.polRakuichiCommerceDevMult;
  if (attr === 'commerce' && hasPolicy(state, district.ownerClanId, 'pol.sekisho'))
    multiplier *= BAL.polSekishoCommerceDevMult;
  if (district.stewardId === null && hasPolicy(state, district.ownerClanId, 'pol.kenchi'))
    multiplier *= BAL.polKenchiDirectDevMult;
  return multiplier;
}

export function developDistrictDaily(state: GameState, district: District): void {
  if (district.uprising !== null) return;
  const attrs: readonly Attribute[] = ['kokudaka', 'commerce', 'population'];
  const focusAttr: Record<District['developFocus'], Attribute> = {
    agri: 'kokudaka',
    commerce: 'commerce',
    barracks: 'population',
  };
  const scales: Record<Attribute, number> = {
    kokudaka: 1,
    commerce: BAL.devScaleCommerce,
    population: BAL.devScalePop,
  };
  const caps: Record<Attribute, keyof District> = {
    kokudaka: 'kokudakaCap',
    commerce: 'commerceCap',
    population: 'populationCap',
  };
  for (const attr of attrs) {
    const cap = district[caps[attr]] as number;
    if (cap <= 0 || district[attr] >= cap) continue;
    const diminish = Math.max(0, 1 - Math.pow(district[attr] / cap, BAL.devDiminishExp));
    const officer = developmentOfficer(state, district);
    const traitMult = officer
      ? traitModifier(officer, 'dev.efficiencyMult').mult *
        (attr === 'kokudaka'
          ? traitModifier(officer, 'dev.kokudakaMult').mult
          : attr === 'commerce'
            ? traitModifier(officer, 'dev.commerceMult').mult
            : 1)
      : 1;
    const monthly =
      effectivePol(state, district) *
      BAL.devPolFactor *
      (focusAttr[district.developFocus] === attr ? 1 : BAL.devOffWeight) *
      scales[attr] *
      diminish *
      (district.stewardId === null ? BAL.directDevFactor : BAL.fiefDevBonus) *
      developmentPolicyMultiplier(state, district, attr) *
      traitMult;
    district[attr] = Math.min(cap, district[attr] + monthly / 30);
  }
}

function monthlyPopulation(state: GameState, district: District): void {
  if (district.uprising !== null) {
    district.population = Math.max(0, district.population * BAL.uprisingPopDecayMonthly);
    return;
  }
  const castle = state.castles[district.castleId];
  if (!castle) return;
  const conscriptFactor = BAL.conscriptPopFactor[castle.conscriptPolicy];
  let policyFactor = 1;
  if (hasPolicy(state, district.ownerClanId, 'pol.sekisho'))
    policyFactor *= BAL.polSekishoPopGrowthMult;
  if (hasPolicy(state, district.ownerClanId, 'pol.jokashuju'))
    policyFactor *= BAL.polJokashujuPopGrowthMult;
  const focusFactor = district.developFocus === 'barracks' ? BAL.barracksPopGrowthFactor : 1;
  const growth =
    district.population *
    BAL.popGrowthBase *
    (BAL.popGrowthOrderFloor + district.publicOrder / 100) *
    conscriptFactor *
    policyFactor *
    focusFactor;
  district.population = Math.min(district.populationCap, district.population + growth);
}

function monthlyStewardMerit(state: GameState): void {
  const counts = new Map<string, number>();
  for (const district of Object.values<District>(state.districts)) {
    if (district.stewardId !== null)
      counts.set(district.stewardId, (counts.get(district.stewardId) ?? 0) + 1);
  }
  for (const [officerId, count] of counts) {
    const officer = state.officers[officerId as keyof typeof state.officers];
    if (officer?.status === 'serving')
      gainMerit(officer, BAL.stewardMeritPerDistrict * count, ['pol']);
  }
}

export function developmentSystem(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  for (const id of Object.keys(state.districts).sort()) {
    const district = state.districts[id as keyof typeof state.districts];
    if (!district) continue;
    if (district.stewardId !== null) {
      const steward = state.officers[district.stewardId];
      const castle = state.castles[district.castleId];
      if (
        !steward ||
        steward.status !== 'serving' ||
        steward.clanId !== district.ownerClanId ||
        castle?.ownerClanId !== district.ownerClanId
      ) {
        district.stewardId = null;
      }
    }
    developDistrictDaily(state, district);
  }
  if (state.time.dayOfMonth === 1) {
    events.push(...monthlyUprising(state));
    for (const id of Object.keys(state.districts).sort()) {
      const district = state.districts[id as keyof typeof state.districts];
      if (district) monthlyPopulation(state, district);
    }
    updateStewardFocuses(state);
    monthlyStewardMerit(state);
  }
  return events;
}
