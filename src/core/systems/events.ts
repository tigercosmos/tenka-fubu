import type { GameState } from '../state/gameState';
import type { GameEvent } from '../state/events';
import type { ClanId, OfficerId } from '../state/ids';
import type { EventHookSignal } from './events/types';

export { createEventEngine, type EventEngine } from './events/engine';

/** Detached fact queue; no RNG or simulation work occurs at the producer boundary. */
export function signalHook(state: GameState, signal: EventHookSignal): void {
  state.events.hookSignals.push({ ...signal, clanIds: [...signal.clanIds] });
}

/** Append this tick's facts only after Step 3; they become input to the next tick. */
export function collectEventHooks(
  state: GameState,
  events: readonly GameEvent[],
  leaders: ReadonlyMap<ClanId, OfficerId>,
): void {
  const currentLeaders = new Map(leaders);
  for (const event of events) {
    const common = {
      day: event.day,
      clanIds: [...event.clanIds],
      castleId: null,
      officerId: null,
      winnerClanId: null,
      playerInvolved: false,
    };
    if (event.type === 'battle.ended')
      signalHook(state, {
        ...common,
        kind: 'battleEnded',
        winnerClanId: event.winnerClanId,
        playerInvolved: event.clanIds.includes(state.meta.playerClanId),
      });
    else if (event.type === 'siege.ended' && event.fallen)
      signalHook(state, {
        ...common,
        kind: 'castleFallen',
        castleId: event.castleId,
      });
    else if (event.type === 'clan.destroyed')
      signalHook(state, {
        ...common,
        kind: 'clanDestroyed',
        clanIds: [event.clanId],
      });
    else if (event.type === 'officer.died' || event.type === 'officer.executed') {
      for (const [clanId, officerId] of currentLeaders) {
        if (officerId !== event.officerId) continue;
        signalHook(state, { ...common, kind: 'leaderDied', clanIds: [clanId], officerId });
        currentLeaders.delete(clanId);
      }
    } else if (event.type === 'clan.succession') {
      currentLeaders.set(event.clanId, event.heirId);
    }
  }
}
