import { BAL } from '../../balance';
import type { Castle, GameState } from '../../state/gameState';
import type { CastleId, OfficerId } from '../../state/ids';
import { canPlot } from '../diplomacyCommon';
import { getDifficultyMods } from './difficulty';
import {
  estCastlePower,
  nodesWithin,
  planMarchFromCastle,
  retainedGarrison,
  travelDays,
} from './shared';
import type { AiScope, DifficultyMods } from './types';

export interface ExpansionSource {
  castleId: CastleId;
  leaderId: OfficerId;
  soldiers: number;
  food: number;
  power: number;
  travelDays: number;
}
export interface ExpansionCandidate {
  targetCastleId: CastleId;
  stagingCastleId: CastleId;
  sources: ExpansionSource[];
  score: number;
  ourPower: number;
  defensePower: number;
  requiredRatio: number;
}

export function scopeAggression(state: GameState, scope: AiScope): number {
  if (!state.ai.allAi && scope.corpsId !== null && scope.clanId === state.meta.playerClanId)
    return 70;
  const id = state.ai.clans[scope.clanId]?.personaId;
  return (id && state.ai.personas[id]?.aggression) ?? BAL.aiPersonaDefault;
}
/** Pure evaluation: no RNG, army writes, or reservations. The caller commits one candidate. */
export function scoreExpansionTargets(
  state: GameState,
  clanId: AiScope['clanId'],
  scope: AiScope,
  mods: DifficultyMods = getDifficultyMods(state, clanId),
): ExpansionCandidate[] {
  const own = scope.castleIds
    .map((id) => state.castles[id])
    .filter(
      (c): c is Castle =>
        c !== undefined && c.ownerClanId === clanId && c.corpsId === scope.corpsId,
    );
  const reserved = new Set(
    state.ai.clans[clanId]?.attackPlans.flatMap((p) => p.sourceCastleIds) ?? [],
  );
  const ownNodes = Object.values(state.castles)
    .filter((c) => own.some((o) => o.id === c.id))
    .flatMap((c) => [c.id, ...c.districtIds]);
  const adjacent = nodesWithin(state, ownNodes, 1);
  const planned = new Set(state.ai.clans[clanId]?.attackPlans.map((p) => p.targetCastleId) ?? []);
  const aggression = scopeAggression(state, scope);
  const requiredRatio =
    BAL.aiAttackPowerRatioBase - (aggression / 100) * BAL.aiAttackPowerRatioAggrBonus;
  const result: ExpansionCandidate[] = [];
  for (const target of Object.values(state.castles).sort((a, b) => a.id.localeCompare(b.id))) {
    if (
      !canPlot(state, clanId, target.ownerClanId) ||
      planned.has(target.id) ||
      ![target.id, ...target.districtIds].some((id) => adjacent.has(id))
    )
      continue;
    const staging = own
      .filter((c) => !reserved.has(c.id))
      .map((c) => ({ castle: c, days: travelDays(state, c.id, target.id, clanId) }))
      .filter((c) => Number.isFinite(c.days))
      .sort((a, b) => a.days - b.days || a.castle.id.localeCompare(b.castle.id))[0];
    if (!staging) continue;
    const sources: ExpansionSource[] = own
      .filter((c) => !reserved.has(c.id))
      .map((c) => {
        const command = planMarchFromCastle(state, scope, c, target.id);
        return command
          ? {
              castleId: c.id,
              leaderId: command.leaderId,
              soldiers: command.soldiers,
              food: command.food,
              power: estCastlePower(state, c, command.soldiers),
              travelDays: travelDays(state, c.id, staging.castle.id, clanId),
            }
          : null;
      })
      .filter((c): c is ExpansionSource => c !== null && Number.isFinite(c.travelDays))
      .sort((a, b) => a.travelDays - b.travelDays || a.castleId.localeCompare(b.castleId))
      .slice(0, mods.coopMax);
    if (!sources.some((s) => s.castleId === staging.castle.id)) continue;
    const ourPower = sources.reduce((sum, s) => sum + s.power, 0);
    const nearby = nodesWithin(state, [target.id], 1);
    const aid = Object.values(state.castles)
      .filter((c) => c.id !== target.id && c.ownerClanId === target.ownerClanId && nearby.has(c.id))
      .reduce(
        (sum, c) => sum + Math.max(0, c.soldiers - retainedGarrison(c)) * BAL.aiNeighborAidRatio,
        0,
      );
    const defensePower = estCastlePower(state, target) + aid;
    const value =
      target.districtIds.reduce((sum, id) => sum + (state.districts[id]?.kokudaka ?? 0), 0) /
        BAL.aiValueKokudakaDivisor +
      Object.values(state.roads).filter((r) => r.a === target.id || r.b === target.id).length *
        BAL.aiValueConnectivityWeight +
      (target.tier === 'main' ? BAL.aiValueMainCastleBonus : 0);
    const weakness = Math.min(
      BAL.aiWeaknessCap,
      ourPower / Math.max(defensePower, BAL.aiWeaknessEpsilon),
    );
    const score =
      ((value * weakness) / Math.max(1, staging.days / BAL.aiDistanceNormDays)) *
      (0.5 + aggression / 100);
    result.push({
      targetCastleId: target.id,
      stagingCastleId: staging.castle.id,
      sources,
      score,
      ourPower,
      defensePower,
      requiredRatio,
    });
  }
  return result.sort(
    (a, b) =>
      Number(b.targetCastleId === scope.targetNodeId) -
        Number(a.targetCastleId === scope.targetNodeId) ||
      b.score - a.score ||
      a.targetCastleId.localeCompare(b.targetCastleId),
  );
}
