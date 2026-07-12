import { BAL } from '../balance';
import { createRngStream } from '../rng';
import { hasFacility, hasPolicy } from '../domestic';
import type { District, GameState } from '../state/gameState';
import type { GameEvent } from '../state/events';
import { traitModifier } from '../traits';

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
  let delta = BAL.conscriptSecurityDelta[castle.conscriptPolicy];
  if (castle.conscriptPolicy === 'high' && hasPolicy(state, district.ownerClanId, 'pol.heinobunri'))
    delta = 0;
  delta += Math.floor(administratorInt(state, district) / 40);
  if (hasFacility(castle, 'fac.jisha')) delta += BAL.facTempleSecurity;
  if (hasPolicy(state, district.ownerClanId, 'pol.jishahogo')) delta += 1;
  if (hasPolicy(state, district.ownerClanId, 'pol.meyasubako')) delta += 1;
  if (hasPolicy(state, district.ownerClanId, 'pol.goningumi')) delta += 2;
  const administratorId = district.stewardId ?? castle.lordId;
  const administrator = administratorId === null ? undefined : state.officers[administratorId];
  if (administrator) delta += traitModifier(administrator, 'dev.securityAdd').add;
  if (
    Object.values(state.armies).some(
      (army) => army.posNodeId === district.id && army.clanId !== district.ownerClanId,
    )
  )
    delta -= 2;
  if (Object.values(state.sieges).some((siege) => siege.castleId === district.castleId)) delta -= 3;
  return district.publicOrder > 80 && delta > 0 ? Math.floor(delta / 2) : delta;
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
        district.publicOrder = 40;
        district.population *= 0.95;
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
      district.publicOrder + monthlySecurityDelta(state, district),
      0,
      100,
    );
    if (district.publicOrder >= BAL.uprisingThreshold) continue;
    let chance = (BAL.uprisingThreshold - district.publicOrder) * BAL.uprisingChancePerPoint;
    if (hasPolicy(state, district.ownerClanId, 'pol.jishahogo')) chance *= 0.5;
    if (hasPolicy(state, district.ownerClanId, 'pol.goningumi')) chance *= 0.3;
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
