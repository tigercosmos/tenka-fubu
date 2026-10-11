import { BAL } from '../balance';
import { createRngStream } from '../rng';
import { hasFacility, hasPolicy } from '../domestic';
import type { District, GameState } from '../state/gameState';
import type { GameEvent } from '../state/events';
import { traitModifier } from '../traits';
import { getStance } from './pathfinding';
import { armyPhysicalLeg } from './armyReroute';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function administratorInt(state: Readonly<GameState>, district: Readonly<District>): number {
  const officerId = district.stewardId ?? state.castles[district.castleId]?.lordId ?? null;
  const officer = officerId === null ? undefined : state.officers[officerId];
  return officer ? Math.min(BAL.abilityMax, officer.int + officer.statGrowth.int) : 0;
}

function monthlySecurityDelta(state: Readonly<GameState>, district: Readonly<District>): number {
  const castle = state.castles[district.castleId];
  if (!castle) return 0;
  let conscription = BAL.conscriptSecurityDelta[castle.conscriptPolicy];
  if (castle.conscriptPolicy === 'high' && hasPolicy(state, district.ownerClanId, 'pol.heinobunri'))
    conscription = 0;
  const contributions: number[] = [
    conscription,
    Math.floor(administratorInt(state, district) / BAL.securityIntDivisor),
  ];
  if (hasFacility(castle, 'fac.jisha')) contributions.push(BAL.facTempleSecurity);
  if (hasPolicy(state, district.ownerClanId, 'pol.jishahogo'))
    contributions.push(BAL.polJishahogoSecurityAdd);
  if (hasPolicy(state, district.ownerClanId, 'pol.meyasubako'))
    contributions.push(BAL.polMeyasubakoSecurityAdd);
  if (hasPolicy(state, district.ownerClanId, 'pol.goningumi'))
    contributions.push(BAL.polGoningumiSecurityAdd);
  const administratorId = district.stewardId ?? castle.lordId;
  const administrator = administratorId === null ? undefined : state.officers[administratorId];
  if (administrator) contributions.push(traitModifier(administrator, 'dev.securityAdd').add);
  if (
    Object.values(state.armies).some(
      (army) =>
        army.posNodeId === district.id &&
        armyPhysicalLeg(army) === null &&
        getStance(state, army.clanId, district.ownerClanId) === 'war',
    )
  )
    contributions.push(-BAL.securityEnemyArmyDelta);
  if (Object.values(state.sieges).some((siege) => siege.castleId === district.castleId))
    contributions.push(-BAL.securitySiegeDelta);
  const positive = contributions.reduce((sum, value) => sum + Math.max(0, value), 0);
  const negative = contributions.reduce((sum, value) => sum + Math.min(0, value), 0);
  return (
    negative +
    positive /
      (district.publicOrder > BAL.securityHighOrderThreshold ? BAL.securityHighOrderDampDivisor : 1)
  );
}

export function monthlyUprising(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  const rng = createRngStream(state.rng, 'event');
  for (const id of Object.keys(state.districts).sort()) {
    const district = state.districts[id as keyof typeof state.districts];
    if (!district) continue;
    if (district.uprising !== null) {
      if (state.time.day - district.uprising.startedOnDay >= BAL.uprisingAutoEndMonths * 30) {
        district.uprising = null;
        district.publicOrder = BAL.uprisingEndPublicOrder;
        district.population *= BAL.uprisingEndPopMult;
        events.push({
          type: 'uprising.ended',
          day: state.time.day,
          clanIds: [district.ownerClanId],
          districtId: district.id,
          resolved: 'subsided',
        });
      }
      continue;
    }
    district.publicOrder = clamp(
      Math.round(district.publicOrder + monthlySecurityDelta(state, district)),
      0,
      100,
    );
    if (district.publicOrder >= BAL.uprisingThreshold) continue;
    let chance = (BAL.uprisingThreshold - district.publicOrder) * BAL.uprisingChancePerPoint;
    if (hasPolicy(state, district.ownerClanId, 'pol.jishahogo'))
      chance *= BAL.polJishahogoUprisingChanceMult;
    if (hasPolicy(state, district.ownerClanId, 'pol.goningumi'))
      chance *= BAL.polGoningumiUprisingChanceMult;
    if (!rng.chance(chance)) continue;
    district.uprising = {
      startedOnDay: state.time.day,
      armySoldiers: Math.floor(district.population * BAL.uprisingArmyRate),
    };
    events.push({
      type: 'uprising.started',
      day: state.time.day,
      clanIds: [district.ownerClanId],
      districtId: district.id,
      severity: clamp(Math.ceil((BAL.uprisingThreshold - district.publicOrder) / 10), 1, 3),
    });
  }
  return events;
}
