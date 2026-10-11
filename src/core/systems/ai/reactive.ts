import { BAL } from '../../balance';
import type { GameEvent } from '../../state/events';
import type { Army, Castle, GameState } from '../../state/gameState';
import type { ClanId, CorpsId } from '../../state/ids';
import type { Command } from '../../commands/types';
import { validateCommand } from '../../commands/validate';
import { hasPact, isAtWar } from '../diplomacyCommon';
import { corpsScope } from './corps';
import {
  boundedTravelDays,
  cachedTravelDays,
  estArmyPower,
  estCastlePower,
  nodeOwner,
  planMarchFromCastle,
  scopeAuthority,
} from './shared';
import type { AiScope, AiSignal, AiSink } from './types';

function scopesFor(state: GameState, clanId: ClanId): AiScope[] {
  const result: AiScope[] = [];
  if (state.ai.allAi || clanId !== state.meta.playerClanId)
    result.push({
      clanId,
      corpsId: null,
      targetNodeId: null,
      castleIds: Object.values(state.castles)
        .filter((c) => c.ownerClanId === clanId && c.corpsId === null)
        .map((c) => c.id)
        .sort(),
    });
  for (const id of Object.keys(state.corps).sort() as CorpsId[]) {
    const scope = corpsScope(state, id);
    if (scope?.clanId === clanId) result.push(scope);
  }
  return result;
}

function record(
  state: GameState,
  sink: AiSink,
  scope: AiScope,
  kind: string,
  commands: Command[],
  detail: Record<string, string | number | boolean> = {},
): void {
  const accepted: Command[] = [];
  for (const command of commands) {
    const result = sink.enqueue(command, scopeAuthority(scope));
    if (result.ok) accepted.push(command);
    else
      sink.record({
        day: state.time.day,
        clanId: scope.clanId,
        layer: 'reactive',
        kind: 'error.invalidCommand',
        detail: { reason: result.reasonKey },
        scores: null,
        commands: [],
      });
  }
  sink.record({
    day: state.time.day,
    clanId: scope.clanId,
    layer: 'reactive',
    kind,
    detail,
    scores: null,
    commands: accepted,
  });
}

function localMarches(
  state: GameState,
  scope: AiScope,
  target: Army['posNodeId'],
  maxDays: number,
) {
  return scope.castleIds
    .map((id) => state.castles[id])
    .filter((c): c is Castle => c !== undefined)
    .map((castle) => ({
      castle,
      days: boundedTravelDays(state, castle.id, target, scope.clanId, maxDays),
      command: planMarchFromCastle(state, scope, castle, target, undefined, maxDays),
    }))
    .filter((entry) => entry.command !== null && Number.isFinite(entry.days))
    .sort((a, b) => a.days - b.days || a.castle.id.localeCompare(b.castle.id));
}

/** Current-tick event input only: no events means no entity scan, path search or intent work. */
export function runReactiveAi(
  state: GameState,
  events: readonly (GameEvent | AiSignal)[],
  sink: AiSink,
): void {
  if (events.length === 0) return;
  const handled = new Set<string>();
  for (const event of events) {
    if (event.type === 'army.arrived' || event.type === 'army.enteredTerritory') {
      const army = state.armies[event.armyId],
        owner = nodeOwner(state, event.nodeId);
      if (!army || !owner || owner === army.clanId || !isAtWar(state, owner, army.clanId)) continue;
      const key = `intercept:${army.id}`;
      if (handled.has(key)) continue;
      handled.add(key);
      for (const scope of scopesFor(state, owner)) {
        const candidates = scope.castleIds
          .map((id) => state.castles[id])
          .filter((c): c is Castle => c !== undefined && c.soldiers > BAL.aiHomeGarrisonMin)
          .map((castle) => {
            const days = cachedTravelDays(state, castle.id, event.nodeId, owner);
            return { castle, days: days !== null && Number.isFinite(days) ? days : null };
          })
          .filter((entry): entry is { castle: Castle; days: number } => entry.days !== null)
          .sort((a, b) => a.days - b.days || a.castle.id.localeCompare(b.castle.id));
        const source = candidates[0];
        // The cache selects the nearest defended castle; routing stays local to the estimate.
        const command = source
          ? planMarchFromCastle(state, scope, source.castle, army.posNodeId, undefined, source.days)
          : null;
        const nearest = source && command ? { ...source, command } : null;
        const ratio = nearest?.command
          ? estCastlePower(state, nearest.castle, nearest.command.soldiers) /
            Math.max(1, estArmyPower(state, army))
          : 0;
        record(
          state,
          sink,
          scope,
          ratio >= BAL.aiInterceptRatioMin ? 'defense.intercept' : 'defense.hold',
          ratio >= BAL.aiInterceptRatioMin && nearest?.command ? [nearest.command] : [],
          { armyId: army.id, ratio, reason: source ? 'localResponse' : 'cacheMissing' },
        );
      }
    } else if (event.type === 'siege.started') {
      const castle = state.castles[event.castleId],
        siege = state.sieges[event.siegeId];
      if (!castle || !siege) continue;
      const key = `relief:${siege.id}`;
      if (handled.has(key)) continue;
      handled.add(key);
      const enemyPower = siege.attackerArmyIds.reduce(
        (sum, id) => sum + (state.armies[id] ? estArmyPower(state, state.armies[id]) : 0),
        0,
      );
      const responses = scopesFor(state, castle.ownerClanId).map((scope) => ({
        scope,
        sources: localMarches(state, scope, castle.id, BAL.aiSiegeReliefMaxDays),
      }));
      const power = responses.reduce(
        (sum, response) =>
          sum +
          response.sources.reduce(
            (subtotal, source) =>
              subtotal + estCastlePower(state, source.castle, source.command!.soldiers),
            0,
          ),
        0,
      );
      const ratio = power / Math.max(1, enemyPower);
      for (const { scope, sources } of responses) {
        record(
          state,
          sink,
          scope,
          ratio >= BAL.aiSiegeReliefRatio ? 'defense.relief' : 'defense.hold',
          ratio >= BAL.aiSiegeReliefRatio ? sources.map((s) => s.command!) : [],
          { castleId: castle.id, ratio },
        );
      }
    } else if (event.type === 'battle.kassenAvailable') {
      const combat = state.fieldCombats[event.battleId];
      if (!combat || combat.kassenUsed) continue;
      const key = `kassen:${combat.id}`;
      if (handled.has(key)) continue;
      handled.add(key);
      for (const [ours, theirs, defender] of [
        [combat.sideA, combat.sideB, true],
        [combat.sideB, combat.sideA, false],
      ] as const) {
        for (const clanId of ours.clanIds) {
          if (
            (!state.ai.allAi && clanId === state.meta.playerClanId) ||
            !state.clans[clanId]?.alive
          )
            continue;
          const scope = scopesFor(state, clanId)[0];
          if (!scope) continue;
          const ownPower =
            ours.armyIds.reduce(
              (sum, id) => sum + (state.armies[id] ? estArmyPower(state, state.armies[id]) : 0),
              0,
            ) * (defender ? BAL.aiKassenDefenderMult : 1);
          const enemyPower =
            theirs.armyIds.reduce(
              (sum, id) => sum + (state.armies[id] ? estArmyPower(state, state.armies[id]) : 0),
              0,
            ) * (defender ? 1 : BAL.aiKassenDefenderMult);
          const winRate = ownPower / Math.max(1, ownPower + enemyPower);
          if (winRate > BAL.aiKassenWinRateMin) {
            const command: Command = { type: 'startKassen', clanId, fieldCombatId: combat.id };
            const authority = scopeAuthority(scope);
            const eligibility = validateCommand(state, command, authority);
            const prospective = eligibility.ok
              ? (sink.canEnqueue?.(command, authority) ?? eligibility)
              : eligibility;
            if (!prospective.ok) {
              record(state, sink, scope, 'battle.hold', [], {
                winRate,
                reason: prospective.reasonKey,
              });
              continue;
            }
            record(state, sink, scope, 'battle.kassen', [command], { winRate });
          }
        }
      }
    } else if (event.type === 'diplo.reinforceAgreed') {
      const clanId = event.toClanId;
      if (!state.ai.allAi && clanId === state.meta.playerClanId) continue;
      const key = `aid:${event.fromClanId}:${clanId}:${event.againstClanId}`;
      if (handled.has(key)) continue;
      handled.add(key);
      const ai = state.ai.clans[clanId],
        persona = ai && state.ai.personas[ai.personaId];
      const threat = ai?.threatCache?.totalThreat;
      const factor = hasPact(state, clanId, event.fromClanId, 'marriage')
        ? BAL.aiAidMarriageFactor
        : hasPact(state, clanId, event.fromClanId, 'alliance')
          ? 1
          : 0;
      const score =
        ((persona?.loyalty ?? BAL.aiPersonaDefault) / 100) *
        factor *
        Math.max(
          0,
          Math.min(1, BAL.aiAidSafetyBase - (threat ?? Infinity) / BAL.aiAidThreatDivisor),
        );
      for (const scope of scopesFor(state, clanId)) {
        const targets = Object.values(state.castles)
          .filter((c) => c.ownerClanId === event.againstClanId)
          .flatMap((target) =>
            localMarches(state, scope, target.id, BAL.aiReinforceMaxDays).map((source) => ({
              target,
              ...source,
            })),
          )
          .sort(
            (a, b) =>
              a.days - b.days ||
              a.target.id.localeCompare(b.target.id) ||
              a.command!.originCastleId.localeCompare(b.command!.originCastleId),
          );
        const closest = targets[0];
        const commands =
          score >= BAL.aiAidScoreMin && closest
            ? targets
                .filter((t) => t.target.id === closest.target.id)
                .map((t) =>
                  planMarchFromCastle(
                    state,
                    scope,
                    t.castle,
                    closest.target.id,
                    Math.floor(t.command!.soldiers * Math.min(score, 1) * BAL.aiAidTroopRatio),
                    BAL.aiReinforceMaxDays,
                  ),
                )
                .filter((c): c is NonNullable<typeof c> => c !== null)
            : [];
        record(state, sink, scope, commands.length ? 'diplo.aid' : 'diplo.aidDeclined', commands, {
          score,
          againstClanId: event.againstClanId,
        });
      }
    }
  }
}
