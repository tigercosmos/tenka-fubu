import { FACILITIES } from '../facilities';
import { BAL } from '../balance';
import { hasPolicy } from '../domestic';
import type { Castle, GameState } from '../state/gameState';
import type { GameEvent } from '../state/events';

function queuedOrderStillValid(state: Readonly<GameState>, castle: Readonly<Castle>): boolean {
  const order = castle.buildQueue[0];
  const def = order ? FACILITIES[order.facilityTypeId] : undefined;
  if (!def) return false;
  const slots = castle.tier === 'main' ? BAL.facilitySlotsMain : BAL.facilitySlotsBranch;
  return (
    castle.facilities.length < slots &&
    !castle.facilities.includes(def.id) &&
    (!def.mainCastleOnly || castle.tier === 'main') &&
    (!def.requiresCoastal || castle.coastal) &&
    (def.requiresFacility === null || castle.facilities.includes(def.requiresFacility)) &&
    (def.requiresPolicy === null || hasPolicy(state, castle.ownerClanId, def.requiresPolicy)) &&
    (def.exclusiveWith === null || !castle.facilities.includes(def.exclusiveWith))
  );
}

function cancelInvalidQueueHeads(state: GameState, castle: Castle): void {
  while (castle.buildQueue.length > 0 && !queuedOrderStillValid(state, castle)) {
    const cancelled = castle.buildQueue.shift();
    const clan = state.clans[castle.ownerClanId];
    if (cancelled && clan)
      clan.gold += Math.floor(
        (FACILITIES[cancelled.facilityTypeId]?.costGold ?? 0) * BAL.buildRefundRate,
      );
  }
}

export function facilitiesDaily(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  for (const id of Object.keys(state.castles).sort()) {
    const castle: Castle | undefined = state.castles[id as keyof typeof state.castles];
    const current = castle?.buildQueue[0];
    if (!castle || !current) continue;
    current.daysLeft -= 1;
    if (current.daysLeft > 0) continue;
    castle.buildQueue.shift();
    if (!castle.facilities.includes(current.facilityTypeId) && FACILITIES[current.facilityTypeId]) {
      castle.facilities.push(current.facilityTypeId);
      events.push({
        type: 'facility.completed',
        day: state.time.day,
        clanIds: [castle.ownerClanId],
        castleId: castle.id,
        facilityTypeId: current.facilityTypeId,
      });
    }
    cancelInvalidQueueHeads(state, castle);
  }
  return events;
}
