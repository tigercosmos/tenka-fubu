import { BAL } from '../balance';
import { castleMaxSoldiers, hasFacility, hasPolicy } from '../domestic';
import type { District, GameState } from '../state/gameState';
import type { GameEvent } from '../state/events';
import { traitModifier } from '../traits';

export function conscriptionSystem(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  for (const id of Object.keys(state.castles).sort()) {
    const castle = state.castles[id as keyof typeof state.castles];
    if (!castle) continue;
    let population = 0;
    for (const districtId of castle.districtIds) {
      const district: District | undefined = state.districts[districtId];
      if (!district || district.uprising !== null || district.ownerClanId !== castle.ownerClanId)
        continue;
      population +=
        district.population *
        (district.developFocus === 'barracks' ? BAL.barracksConscriptBonus : 1);
    }
    let recruit =
      population * BAL.conscriptRate * BAL.conscriptPolicyFactor[castle.conscriptPolicy];
    if (hasFacility(castle, 'fac.heisha')) recruit *= 1 + BAL.facBarracksConscriptBonus;
    if (hasPolicy(state, castle.ownerClanId, 'pol.jokashuju')) recruit *= 1.2;
    const lord = castle.lordId === null ? undefined : state.officers[castle.lordId];
    if (lord) recruit *= traitModifier(lord, 'dev.conscriptionMult').mult;
    const amount = Math.max(
      0,
      Math.min(castleMaxSoldiers(state, castle) - castle.soldiers, Math.floor(recruit)),
    );
    if (amount === 0) continue;
    castle.soldiers += amount;
    events.push({
      type: 'conscript.completed',
      day: state.time.day,
      clanIds: [castle.ownerClanId],
      castleId: castle.id,
      soldiers: amount,
    });
  }
  return events;
}
