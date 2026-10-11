import { BAL } from '../../balance';
import { applyCommand } from '../../commands/apply';
import { validateCommand } from '../../commands/validate';
import type { GameEvent } from '../../state/events';
import type { AiIntent, GameState } from '../../state/gameState';
import type { ClanId } from '../../state/ids';
import type { Command } from '../../commands/types';
import type { ExecutionAuthority } from '../../commands/authority';
import { attackPlansDailyTick, militaryPhase } from './attackPlan';
import { runCorpsDailyTick, runCorpsPhase } from './corps';
import { runDomesticCouncil, runDiplomacyCouncil } from './council';
import { runDelegation } from './delegation';
import { runReactiveAi } from './reactive';
import { enrollDueCouncils, runScheduledCouncilTick } from './scheduler';
import { nodeOwner } from './shared';
import {
  computeThreatCache,
  getThreatCache,
  invalidateThreatCaches,
  warmThreatDistances,
} from './threat';
import type { AiOrder, AiScope, AiSignal, AiSink } from './types';

export interface AiEntryResult {
  orders: AiOrder[];
  executedPhases: number;
  elapsedMs: number;
}
export interface AiEntryOptions {
  now?: () => number;
}
export type AiInput = GameEvent | AiSignal;

/**
 * One shadow reserves resources for the complete decision step.
 * Full mode refreshes all exposed AI bookkeeping before each check; authority mode is internal
 * decision bookkeeping, so unrelated shadow AI entries may remain stale.
 */
export function createAiCommandSink(
  state: GameState,
  options: { bookkeeping?: 'full' | 'authority' } = {},
): {
  sink: AiSink;
  orders: AiOrder[];
  shadow: GameState;
} {
  const shadow = structuredClone(state);
  const orders: AiOrder[] = [];
  // Old persisted orders are still competing for resources until the caller consumes them.
  for (const order of state.ai.pendingOrders) {
    if (validateCommand(shadow, order.command, order.authority).ok)
      applyCommand(shadow, order.command, () => {}, order.authority);
  }
  const sink = reservedCommandSink(state, () => shadow, orders, options.bookkeeping ?? 'full');
  return { sink, orders, shadow };
}

/** Shared reservation/validation logic; materialization never occurs for record-only decisions. */
function reservedCommandSink(
  state: GameState,
  getShadow: () => GameState,
  orders: AiOrder[],
  bookkeepingMode: 'full' | 'authority',
): AiSink {
  const record = (intent: AiIntent): void => {
    state.ai.intentLog.push(structuredClone(intent));
    if (state.ai.intentLog.length > BAL.aiIntentLogSize)
      state.ai.intentLog.splice(0, state.ai.intentLog.length - BAL.aiIntentLogSize);
  };
  const refreshBookkeeping = (command: Command, authority: ExecutionAuthority): GameState => {
    const shadow = getShadow();
    if (bookkeepingMode !== 'authority') {
      shadow.ai.clans = structuredClone(state.ai.clans);
      return shadow;
    }
    const clanId = authority.kind === 'player' ? command.clanId : authority.clanId;
    const bookkeeping = state.ai.clans[clanId];
    if (bookkeeping) shadow.ai.clans[clanId] = structuredClone(bookkeeping);
    else delete shadow.ai.clans[clanId];
    return shadow;
  };
  const sink: AiSink = {
    record,
    canEnqueue(command, authority) {
      const shadow = refreshBookkeeping(command, authority);
      return validateCommand(shadow, command, authority);
    },
    enqueue(command, authority) {
      // Plans transition during this decision step; copy only bookkeeping, never reserved resources.
      const shadow = refreshBookkeeping(command, authority);
      const ownedCommand = structuredClone(command),
        ownedAuthority = structuredClone(authority);
      const result = validateCommand(shadow, ownedCommand, ownedAuthority);
      if (!result.ok) {
        record({
          day: state.time.day,
          clanId: command.clanId,
          layer: 'council',
          kind: 'error.invalidCommand',
          detail: {
            reason: result.reasonKey,
            commandType: command.type,
            ...('armyId' in command ? { armyId: command.armyId } : {}),
            ...('targetNodeId' in command && command.targetNodeId !== null
              ? { targetNodeId: command.targetNodeId }
              : {}),
          },
          scores: null,
          commands: [],
        });
        return result;
      }
      applyCommand(shadow, ownedCommand, () => {}, ownedAuthority);
      orders.push({ command: ownedCommand, authority: ownedAuthority });
      return result;
    },
  };
  return sink;
}

/** Internal only: no public shadow observation contract changes. */
function createDecisionSink(state: GameState): { sink: AiSink; orders: AiOrder[] } {
  // Persisted orders must be replayed against entry-time authority, before plans transition.
  if (state.ai.pendingOrders.length > 0)
    return createAiCommandSink(state, { bookkeeping: 'authority' });
  // Existing diagnostic records are immutable here: record() appends detached values and trims
  // array membership only. Capture membership now, but clone records only if the private shadow
  // is inspected. Public eager sinks and persisted-order replay keep their full clone contract.
  const entryIntentLog = state.ai.intentLog.slice();
  const initialAi = structuredClone({ ...state.ai, intentLog: [] }),
    initialRng = { ...state.rng },
    orders: AiOrder[] = [];
  Object.defineProperty(initialAi, 'intentLog', {
    enumerable: true,
    configurable: true,
    get() {
      const owned = structuredClone(entryIntentLog);
      Object.defineProperty(initialAi, 'intentLog', {
        value: owned,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      return owned;
    },
  });
  let shadow: GameState | null = null;
  const getShadow = (): GameState => {
    if (shadow === null) {
      // Decision modules modify AI bookkeeping only; gameplay changes all use the sink.
      // Preserve entry-time AI/RNG before refreshing the current command authority below.
      shadow = {
        ...structuredClone({ ...state, ai: null }),
        ai: initialAi,
        rng: initialRng,
      };
    }
    return shadow;
  };
  return { sink: reservedCommandSink(state, getShadow, orders, 'authority'), orders };
}

// Transient distance caches do not survive save/load even when persisted threat data is fresh.
const warmed = new WeakMap<GameState, Map<ClanId, number>>();
const isPublicEvent = (event: AiInput): event is GameEvent =>
  event.type !== 'army.enteredTerritory';
function warmClan(state: GameState, clanId: ClanId): void {
  if (!state.clans[clanId]?.alive) return;
  getThreatCache(state, clanId);
  const days = warmed.get(state) ?? new Map<ClanId, number>();
  if (!days.has(clanId) || state.time.day - (days.get(clanId) ?? 0) > BAL.aiThreatCacheDays) {
    warmThreatDistances(state, clanId);
    days.set(clanId, state.time.day);
    warmed.set(state, days);
  }
}

/** Can also run before diplomacy Step4; pending reinforcement recipients need current threat. */
export function warmAiCaches(state: GameState, events: readonly AiInput[]): void {
  const publicEvents = events.filter(isPublicEvent);
  invalidateThreatCaches(state, events);
  if (
    publicEvents.some(
      (event) =>
        event.type === 'pact.signed' ||
        event.type === 'pact.broken' ||
        event.type === 'pact.expired' ||
        event.type === 'district.subjugated' ||
        (event.type === 'awe.triggered' && event.flippedDistrictIds.length > 0) ||
        (event.type === 'siege.ended' && event.fallen),
    )
  )
    warmed.delete(state);
  const owners = new Set<ClanId>();
  for (const event of events) {
    if (event.type === 'army.arrived' || event.type === 'army.enteredTerritory') {
      const owner = nodeOwner(state, event.nodeId);
      if (owner) owners.add(owner);
    } else if (event.type === 'siege.started') {
      const owner = state.castles[event.castleId]?.ownerClanId;
      if (owner) owners.add(owner);
    } else if (event.type === 'diplo.reinforceAgreed') owners.add(event.toClanId);
  }
  for (const proposal of state.diplomacy.pendingProposals)
    if (proposal.kind === 'requestReinforce') owners.add(proposal.toClanId);
  for (const clanId of [...owners].sort()) warmClan(state, clanId);
}

export function clanAiScope(state: GameState, clanId: ClanId): AiScope {
  return {
    clanId,
    corpsId: null,
    targetNodeId: null,
    castleIds: Object.values(state.castles)
      .filter((castle) => castle.ownerClanId === clanId && castle.corpsId === null)
      .map((castle) => castle.id)
      .sort(),
  };
}

/** Step11 decisions only. Caller queues returned authority-bearing orders for the next tick. */
export function runAiSystems(
  state: GameState,
  events: readonly AiInput[] = [],
  options: AiEntryOptions = {},
): AiEntryResult {
  const now = options.now ?? (() => 0),
    start = now();
  if (state.meta.gameOver !== null)
    return { orders: [], executedPhases: 0, elapsedMs: Math.max(0, now() - start) };
  warmAiCaches(state, events);
  const { sink, orders } = createDecisionSink(state);
  runReactiveAi(state, events, sink);
  for (const clan of Object.values(state.clans).sort((a, b) => a.id.localeCompare(b.id)))
    if (clan.alive && (state.ai.allAi || clan.id !== state.meta.playerClanId))
      attackPlansDailyTick(state, clanAiScope(state, clan.id), sink);
  runCorpsDailyTick(state, sink);
  enrollDueCouncils(state);
  const executedPhases = runScheduledCouncilTick(state, (job, phase) => {
    if (job.corpsId !== null) {
      runCorpsPhase(state, job.corpsId, phase, sink);
      return;
    }
    const scope = clanAiScope(state, job.clanId);
    if (phase === 'threat') {
      state.ai.clans[job.clanId]!.threatCache = computeThreatCache(state, job.clanId);
      sink.record({
        day: state.time.day,
        clanId: job.clanId,
        layer: 'council',
        kind: 'threat.compute',
        detail: {},
        scores: null,
        commands: [],
      });
    } else if (phase === 'military') militaryPhase(state, scope, sink);
    else if (phase === 'domestic') runDomesticCouncil(state, scope, sink);
    else runDiplomacyCouncil(state, job.clanId, sink);
  });
  if (!state.ai.allAi) {
    if (state.time.dayOfMonth === 1) warmClan(state, state.meta.playerClanId);
    runDelegation(state, sink);
  }
  return { orders, executedPhases, elapsedMs: Math.max(0, now() - start) };
}
