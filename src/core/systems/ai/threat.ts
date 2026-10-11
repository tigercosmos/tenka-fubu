import { BAL } from '../../balance';
import type { GameState, ThreatCache } from '../../state/gameState';
import type { GameEvent } from '../../state/events';
import type { ClanId, MapNodeId } from '../../state/ids';
import { getDiplomacyRow, hasPact, isAtWar } from '../diplomacyCommon';
import {
  estArmyPower,
  estCastlePower,
  invalidateTravelCache,
  nodeOwner,
  nodesWithin,
  travelDays,
} from './shared';
import type { AiSignal } from './types';

export function warmThreatDistances(state: GameState, clanId: ClanId): void {
  // Council maintenance primes nearest defensive castle estimates for event-only reactions.
  const ourCastles = Object.values(state.castles).filter((c) => c.ownerClanId === clanId);
  const ourNodes = [
    ...ourCastles.map((c) => c.id),
    ...Object.values(state.districts)
      .filter((d) => d.ownerClanId === clanId)
      .map((d) => d.id),
  ];
  for (const from of ourCastles) for (const to of ourNodes) travelDays(state, from.id, to, clanId);
}
export function computeThreatCache(state: GameState, clanId: ClanId): ThreatCache {
  warmThreatDistances(state, clanId);
  const borders = new Map<ClanId, Set<MapNodeId>>();
  for (const edge of Object.values(state.roads)) {
    const a = nodeOwner(state, edge.a),
      b = nodeOwner(state, edge.b);
    if (!a || !b || a === b || (a !== clanId && b !== clanId)) continue;
    const enemy = a === clanId ? b : a;
    const set = borders.get(enemy) ?? new Set<MapNodeId>();
    set.add(edge.a);
    set.add(edge.b);
    borders.set(enemy, set);
  }
  // An overlord is a strategic neighbour even if its territory is not physically adjacent.
  for (const other of Object.values(state.clans))
    if (
      other.id !== clanId &&
      other.alive &&
      getDiplomacyRow(state, clanId, other.id).pacts.some(
        (p) =>
          p.kind === 'vassal' &&
          p.vassalClanId === clanId &&
          (p.endDay === null || p.endDay >= state.time.day),
      ) &&
      !borders.has(other.id)
    ) {
      borders.set(
        other.id,
        new Set(
          Object.values(state.castles)
            .filter((c) => c.ownerClanId === clanId || c.ownerClanId === other.id)
            .map((c) => c.id),
        ),
      );
    }
  const entries = [...borders]
    .map(([enemyClanId, border]) => {
      const range = nodesWithin(state, border, BAL.aiBorderNodeRange);
      const enemyNodes = [...range].filter((node) => nodeOwner(state, node) === enemyClanId);
      const threatenedRange = nodesWithin(state, enemyNodes, 1);
      const ours = Object.values(state.castles).filter(
        (c) => c.ownerClanId === clanId && range.has(c.id),
      );
      const borderPowerOurs = ours.reduce((sum, c) => sum + estCastlePower(state, c), 0);
      const borderPowerEnemy =
        Object.values(state.castles)
          .filter((c) => c.ownerClanId === enemyClanId && range.has(c.id))
          .reduce((sum, c) => sum + estCastlePower(state, c), 0) +
        Object.values(state.armies)
          .filter(
            (a) =>
              a.clanId === enemyClanId &&
              (range.has(a.posNodeId) || nodeOwner(state, a.posNodeId) === clanId),
          )
          .reduce((sum, a) => sum + estArmyPower(state, a), 0);
      const friendly = ['alliance', 'marriage', 'vassal'].some((kind) =>
        getDiplomacyRow(state, clanId, enemyClanId).pacts.some(
          (p) => p.kind === kind && (p.endDay === null || p.endDay >= state.time.day),
        ),
      );
      const relationFactor = friendly
        ? 0.2
        : hasPact(state, clanId, enemyClanId, 'ceasefire')
          ? 0.6
          : isAtWar(state, clanId, enemyClanId)
            ? 1.5
            : 1;
      return {
        enemyClanId,
        borderPowerEnemy,
        borderPowerOurs,
        relationFactor,
        threat: (borderPowerEnemy / Math.max(borderPowerOurs, 1)) * relationFactor,
        threatenedCastleIds: ours
          .filter((c) => threatenedRange.has(c.id))
          .map((c) => c.id)
          .sort(),
      };
    })
    .sort((a, b) => b.threat - a.threat || a.enemyClanId.localeCompare(b.enemyClanId));
  return {
    computedDay: state.time.day,
    entries,
    totalThreat: entries.reduce((sum, e) => sum + e.threat, 0),
  };
}
export function getThreatCache(state: GameState, clanId: ClanId): ThreatCache {
  const ai = state.ai.clans[clanId];
  if (!ai) return computeThreatCache(state, clanId);
  if (
    ai.threatCache === null ||
    state.time.day - ai.threatCache.computedDay > BAL.aiThreatCacheDays
  )
    ai.threatCache = computeThreatCache(state, clanId);
  return ai.threatCache;
}
/** Event invalidation precedes any reactive/council reads in the same tick. */
export function invalidateThreatCaches(
  state: GameState,
  events: readonly (GameEvent | AiSignal)[],
): void {
  const affected = new Set<ClanId>();
  for (const event of events) {
    if (event.type === 'awe.triggered' && event.flippedDistrictIds.length > 0) {
      // A district flip changes border adjacency for third parties as well as both combatants.
      for (const ai of Object.values(state.ai.clans)) affected.add(ai.clanId);
    }
    if (event.type === 'army.enteredTerritory') {
      affected.add(event.clanId);
      affected.add(event.ownerClanId);
    }
    if (event.type === 'battle.started') {
      affected.add(event.attackerClanId);
      affected.add(event.defenderClanId);
    }
    if (
      event.type === 'pact.signed' ||
      event.type === 'pact.broken' ||
      event.type === 'pact.expired'
    ) {
      affected.add(event.aClanId);
      affected.add(event.bClanId);
    }
    if (event.type === 'siege.started') {
      affected.add(event.attackerClanId);
      const owner = state.castles[event.castleId]?.ownerClanId;
      if (owner) affected.add(owner);
    }
    if (event.type === 'siege.ended' && event.fallen) {
      // Old ownership is no longer in state; cached entries and current adjacency cover both sides.
      for (const ai of Object.values(state.ai.clans))
        if (
          event.clanIds.includes(ai.clanId) ||
          ai.threatCache?.entries.some((e) => event.clanIds.includes(e.enemyClanId)) ||
          state.castles[event.castleId]?.ownerClanId === ai.clanId ||
          Object.values(state.roads).some(
            (r) =>
              (r.a === event.castleId && nodeOwner(state, r.b) === ai.clanId) ||
              (r.b === event.castleId && nodeOwner(state, r.a) === ai.clanId),
          )
        )
          affected.add(ai.clanId);
    }
    if (event.type === 'district.subjugated') {
      affected.add(event.fromClanId);
      affected.add(event.toClanId);
    }
    if (event.type === 'army.arrived') {
      const owner = nodeOwner(state, event.nodeId);
      if (owner && owner !== event.clanId && isAtWar(state, owner, event.clanId)) {
        affected.add(owner);
        affected.add(event.clanId);
      }
    }
  }
  for (const id of affected) if (state.ai.clans[id]) state.ai.clans[id].threatCache = null;
  if (
    events.some(
      (event) =>
        event.type === 'pact.signed' ||
        event.type === 'pact.broken' ||
        event.type === 'pact.expired' ||
        event.type === 'district.subjugated' ||
        (event.type === 'awe.triggered' && event.flippedDistrictIds.length > 0) ||
        (event.type === 'siege.ended' && event.fallen),
    )
  )
    invalidateTravelCache(state);
}
