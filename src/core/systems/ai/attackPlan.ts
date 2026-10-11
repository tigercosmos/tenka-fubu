import { BAL } from '../../balance';
import { armyFoodDays } from '../../armyFood';
import { castleMaxSoldiers } from '../../domestic';
import type { Command } from '../../commands/types';
import type { Army, AttackPlan, Castle, GameState, Officer } from '../../state/gameState';
import type { ArmyId, CastleId } from '../../state/ids';
import { nearestOwnedCastleByTravelTime } from '../castleSelection';
import { canPlot, hasPact, isAtWar, isOfficerBusy } from '../diplomacyCommon';
import {
  estArmyPower,
  estCastlePower,
  nodesWithin,
  officerTroopCap,
  planMarchFromCastle,
  retainedGarrison,
  scopeAuthority,
  travelDays,
} from './shared';
import { scoreExpansionTargets, scopeAggression } from './targetScoring';
import { getThreatCache } from './threat';
import { pickDevFocus } from './stewardAi';
import type { AiScope, AiSink } from './types';

function record(
  state: GameState,
  scope: AiScope,
  sink: AiSink,
  kind: string,
  detail: Record<string, string | number | boolean>,
  commands: Command[] = [],
): void {
  sink.record({
    day: state.time.day,
    clanId: scope.clanId,
    layer: scope.corpsId === null ? 'council' : 'corps',
    kind,
    detail,
    scores: null,
    commands,
  });
}
function order(
  state: GameState,
  scope: AiScope,
  sink: AiSink,
  command: Command,
  commands: Command[],
): boolean {
  if (command.type === 'march' && state.clans[scope.clanId]!.gold < BAL.aiLowGoldThreshold) {
    record(state, scope, sink, 'order.blocked', { type: command.type, reason: 'lowGold' });
    return false;
  }
  const prospective = sink.canEnqueue?.(command, scopeAuthority(scope));
  if (prospective && !prospective.ok) {
    record(state, scope, sink, 'order.blocked', {
      type: command.type,
      reason: prospective.reasonKey,
    });
    return false;
  }
  const result = sink.enqueue(command, scopeAuthority(scope));
  if (result.ok) commands.push(command);
  else
    record(state, scope, sink, 'error.invalidCommand', {
      type: command.type,
      reason: result.reasonKey,
    });
  return result.ok;
}
function returnCommand(
  clanId: AiScope['clanId'],
  army: Army,
  destination: CastleId | null,
): Command {
  return destination === null
    ? { type: 'recallArmy', clanId, armyId: army.id }
    : { type: 'returnArmyToCastle', clanId, armyId: army.id, destinationCastleId: destination };
}
function armiesOf(state: GameState, scope: AiScope, plan: AttackPlan): Army[] {
  // Identity snapshots prevent stealing a pre-existing army that happens to share a route.
  for (const army of Object.values(state.armies))
    if (
      army.clanId === scope.clanId &&
      army.corpsId === scope.corpsId &&
      (plan.sourceLeaderIds[army.originCastleId] === army.leaderId ||
        (army.originCastleId === plan.stagingCastleId &&
          Object.values(plan.sourceLeaderIds).includes(army.leaderId))) &&
      (army.targetNodeId === plan.stagingCastleId || army.targetNodeId === plan.targetCastleId) &&
      !plan.armyIds.includes(army.id)
    )
      plan.armyIds.push(army.id);
  plan.armyIds = plan.armyIds.filter(
    (id) =>
      state.armies[id]?.clanId === scope.clanId && state.armies[id]?.corpsId === scope.corpsId,
  );
  return plan.armyIds
    .map((id) => state.armies[id])
    .filter((army): army is Army => army !== undefined)
    .sort((a, b) => a.id.localeCompare(b.id));
}
function abort(
  state: GameState,
  scope: AiScope,
  sink: AiSink,
  plan: AttackPlan,
  reason: string,
): void {
  const firstAbort = plan.abortReason === null;
  plan.abortReason = reason;
  const commands: Command[] = [];
  const survivors = armiesOf(state, scope, plan);
  for (const army of survivors)
    if (army.status !== 'returning' && army.status !== 'routed' && army.mission !== 'return') {
      // Combat may end after this decision, or begin before a queued recall applies.
      // Keep the persisted plan until the real army has actually adopted a return mission.
      if (army.status === 'engaged') continue;
      const destinationCastleId =
        (state.castles[plan.stagingCastleId]?.ownerClanId === scope.clanId &&
        Number.isFinite(travelDays(state, army.posNodeId, plan.stagingCastleId, scope.clanId))
          ? plan.stagingCastleId
          : null) ??
        nearestOwnedCastleByTravelTime(state, scope.clanId, army.posNodeId)?.castle.id ??
        null;
      order(state, scope, sink, returnCommand(scope.clanId, army, destinationCastleId), commands);
    }
  const ai = state.ai.clans[scope.clanId];
  if (
    ai &&
    survivors.every(
      (army) =>
        army.status === 'returning' || army.status === 'routed' || army.mission === 'return',
    )
  )
    ai.attackPlans = ai.attackPlans.filter((p) => p.id !== plan.id);
  if (firstAbort || commands.length > 0)
    record(state, scope, sink, 'plan.abort', { planId: plan.id, reason }, commands);
}
function enter(
  state: GameState,
  scope: AiScope,
  sink: AiSink,
  plan: AttackPlan,
  stage: AttackPlan['stage'],
  commands: Command[] = [],
): void {
  plan.stage = stage;
  plan.stageEnteredDay = state.time.day;
  record(state, scope, sink, `plan.${stage}`, { planId: plan.id }, commands);
}
function consolidate(
  state: GameState,
  scope: AiScope,
  sink: AiSink,
  plan: AttackPlan,
  armies: Army[],
): void {
  const castle = state.castles[plan.targetCastleId];
  if (!castle) return;
  // Scope authorization uses this persisted proof before allowing a corps to leave a garrison.
  plan.stage = 'consolidate';
  plan.stageEnteredDay = state.time.day;
  const commands: Command[] = [];
  let leave = Math.floor(
    Math.min(
      Math.max(0, castleMaxSoldiers(state, castle) - castle.soldiers),
      Math.floor(armies.reduce((s, a) => s + a.soldiers, 0) * BAL.aiConsolidateGarrisonRatio),
    ),
  );
  for (const army of armies) {
    if (army.posNodeId !== castle.id || army.edgeProgressDays !== 0) continue;
    const count = Math.min(leave, army.soldiers);
    if (
      count > 0 &&
      order(
        state,
        scope,
        sink,
        {
          type: 'depositGarrison',
          clanId: scope.clanId,
          armyId: army.id,
          castleId: castle.id,
          soldiers: count,
          food: Math.floor((army.food * count) / army.soldiers),
        },
        commands,
      )
    )
      leave -= count;
    const originalSource =
      (Object.entries(plan.sourceLeaderIds).find(([, leader]) => leader === army.leaderId)?.[0] as
        CastleId | undefined) ?? army.originCastleId;
    if (count < army.soldiers)
      order(
        state,
        scope,
        sink,
        returnCommand(
          scope.clanId,
          army,
          state.castles[originalSource]?.ownerClanId === scope.clanId ? originalSource : null,
        ),
        commands,
      );
  }
  for (const id of castle.districtIds) {
    const district = state.districts[id];
    if (district)
      order(
        state,
        scope,
        sink,
        {
          type: 'setDevelopFocus',
          clanId: scope.clanId,
          districtId: id,
          focus: pickDevFocus(district),
        },
        commands,
      );
  }
  enter(state, scope, sink, plan, 'consolidate', commands);
}

/** Daily state machine shared by daimyo and corps; gameplay changes exclusively through sink. */
export function attackPlansDailyTick(state: GameState, scope: AiScope, sink: AiSink): void {
  const ai = state.ai.clans[scope.clanId];
  if (!ai) return;
  for (const plan of [...ai.attackPlans]
    .filter((p) => p.ownerCorpsId === scope.corpsId)
    .sort((a, b) => a.id.localeCompare(b.id))) {
    if (plan.abortReason !== null) {
      abort(state, scope, sink, plan, plan.abortReason);
      continue;
    }
    const target = state.castles[plan.targetCastleId],
      staging = state.castles[plan.stagingCastleId];
    const armies = armiesOf(state, scope, plan).filter(
      (a) => a.status !== 'routed' && a.status !== 'returning',
    );
    if (
      !target ||
      (target.ownerClanId !== plan.targetClanId && target.ownerClanId !== scope.clanId)
    ) {
      abort(state, scope, sink, plan, 'targetLost');
      continue;
    }
    if (
      !staging ||
      plan.sourceCastleIds.some(
        (id) =>
          state.castles[id]?.ownerClanId !== scope.clanId ||
          state.castles[id]?.corpsId !== scope.corpsId,
      )
    ) {
      abort(state, scope, sink, plan, 'sourceLost');
      continue;
    }
    if (target.ownerClanId === scope.clanId && plan.stage !== 'consolidate') {
      consolidate(state, scope, sink, plan, armies);
      continue;
    }
    if (plan.stage !== 'consolidate' && !canPlot(state, scope.clanId, target.ownerClanId)) {
      abort(state, scope, sink, plan, 'targetPact');
      continue;
    }
    const required =
      BAL.aiAttackPowerRatioBase -
      (scopeAggression(state, scope) / 100) * BAL.aiAttackPowerRatioAggrBonus;
    const power = armies.reduce((s, a) => s + estArmyPower(state, a), 0);
    if (plan.stage === 'muster') {
      const arrived = Object.values(plan.sourceLeaderIds).every(
        (id) =>
          state.officers[id]?.locationCastleId === staging.id ||
          armies.some(
            (a) =>
              a.leaderId === id &&
              a.posNodeId === staging.id &&
              a.edgeProgressDays === 0 &&
              a.status === 'holding',
          ),
      );
      const timedOut = state.time.day - plan.stageEnteredDay > BAL.aiMusterTimeoutDays;
      if (!arrived && !timedOut) continue;
      const ready = armies.filter(
        (a) => a.posNodeId === staging.id && a.edgeProgressDays === 0 && a.status === 'holding',
      );
      const leaders = Object.values(plan.sourceLeaderIds)
        .map((id) => state.officers[id])
        .filter(
          (o): o is Officer =>
            o !== undefined &&
            o.status === 'serving' &&
            o.locationCastleId === staging.id &&
            !isOfficerBusy(state, o.id),
        )
        .sort((a, b) => a.id.localeCompare(b.id));
      let available = Math.min(
        plan.plannedTroops,
        Math.max(0, staging.soldiers - plan.stagingRetainedTroops),
      );
      const capacity = leaders.reduce((sum, o) => sum + officerTroopCap(state, o), 0);
      const troops = Math.min(available, capacity) + ready.reduce((sum, a) => sum + a.soldiers, 0);
      const readyPower =
        estCastlePower(state, staging, Math.min(available, capacity)) +
        ready.reduce((sum, a) => sum + estArmyPower(state, a), 0);
      if (
        troops < plan.plannedTroops * BAL.aiMusterReadyRatio &&
        readyPower / Math.max(estCastlePower(state, target), 1) < required
      ) {
        abort(state, scope, sink, plan, timedOut ? 'musterTimeout' : 'musterWeak');
        continue;
      }
      const commands: Command[] = [];
      let food = staging.food;
      for (const leader of leaders) {
        const soldiers = Math.floor(
          Math.min(
            available,
            officerTroopCap(state, leader),
            food / (BAL.fieldFoodPerSoldierDaily * BAL.minCarryDays),
          ),
        );
        if (soldiers < BAL.minMarchTroops) continue;
        const carried = Math.floor(
          Math.min(food, soldiers * BAL.fieldFoodPerSoldierDaily * BAL.defaultCarryDays),
        );
        if (
          order(
            state,
            scope,
            sink,
            {
              type: 'march',
              clanId: scope.clanId,
              originCastleId: staging.id,
              leaderId: leader.id,
              deputyIds: [],
              soldiers,
              food: carried,
              targetNodeId: target.id,
            },
            commands,
          )
        ) {
          available -= soldiers;
          food -= carried;
        }
      }
      for (const army of ready)
        order(
          state,
          scope,
          sink,
          { type: 'setArmyTarget', clanId: scope.clanId, armyId: army.id, targetNodeId: target.id },
          commands,
        );
      if (commands.length > 0) enter(state, scope, sink, plan, 'advance', commands);
      else abort(state, scope, sink, plan, 'musterDispatchFailed');
    } else if (plan.stage === 'advance') {
      if (armies.some((a) => a.siegeId !== null && a.posNodeId === target.id)) {
        enter(state, scope, sink, plan, 'siege');
        continue;
      }
      if (armies.length === 0 && state.time.day === plan.stageEnteredDay) continue;
      const route = new Set(armies.flatMap((a) => a.path.slice(a.pathCursor)));
      const fieldPower = Object.values(state.armies)
        .filter(
          (a) =>
            (a.clanId === target.ownerClanId || isAtWar(state, scope.clanId, a.clanId)) &&
            a.status !== 'routed' &&
            a.status !== 'returning' &&
            route.has(a.posNodeId),
        )
        .reduce((sum, a) => sum + estArmyPower(state, a), 0);
      if (power / Math.max(estCastlePower(state, target) + fieldPower, 1) < BAL.aiAdvanceAbortRatio)
        abort(state, scope, sink, plan, 'advanceOutmatched');
    } else if (plan.stage === 'siege') {
      if (armies.length === 0) {
        abort(state, scope, sink, plan, 'siegeArmyLost');
        continue;
      }
      const supplyAvailable = target.ownerClanId === scope.clanId && target.food > 0;
      if (
        !supplyAvailable &&
        armies.some((army) => armyFoodDays(state, army) <= BAL.aiSiegeFoodAbortDays)
      ) {
        abort(state, scope, sink, plan, 'siegeFood');
        continue;
      }
      const nearby = nodesWithin(state, [target.id], BAL.aiReliefApproachNodes);
      const diverted = new Set<ArmyId>();
      const besiegers = armies.filter((a) => {
        const siege = a.siegeId === null ? undefined : state.sieges[a.siegeId];
        return (
          a.status === 'sieging' &&
          siege?.castleId === target.id &&
          siege.attackerClanId === scope.clanId &&
          siege.attackerArmyIds.includes(a.id)
        );
      });
      const relief = Object.values(state.armies)
        .filter(
          (a) =>
            (a.clanId === target.ownerClanId ||
              (isAtWar(state, scope.clanId, a.clanId) &&
                (hasPact(state, target.ownerClanId, a.clanId, 'alliance') ||
                  hasPact(state, target.ownerClanId, a.clanId, 'marriage') ||
                  hasPact(state, target.ownerClanId, a.clanId, 'vassal')))) &&
            a.status !== 'routed' &&
            a.status !== 'returning' &&
            nearby.has(a.posNodeId),
        )
        .sort((a, b) => a.id.localeCompare(b.id));
      if (relief.length > 0) {
        const reliefPower = relief.reduce((s, a) => s + estArmyPower(state, a), 0);
        const besiegingTroops = besiegers.reduce((sum, a) => sum + a.soldiers, 0);
        const reliefTroops = relief.reduce((sum, a) => sum + a.soldiers, 0);
        if (
          besiegingTroops <
          (reliefTroops + target.soldiers * BAL.aiNeighborAidRatio) * BAL.aiReliefFightRatio
        ) {
          abort(state, scope, sink, plan, 'siegeRelief');
          continue;
        }
        let remaining = besiegingTroops;
        const interceptors: Army[] = [];
        const destination = relief[0]?.posNodeId;
        let interceptionPower = armies
          .filter((a) => a.siegeId === null && a.targetNodeId === destination)
          .reduce((sum, a) => sum + estArmyPower(state, a), 0);
        for (const army of [...besiegers].sort(
          (a, b) => estArmyPower(state, b) - estArmyPower(state, a) || a.id.localeCompare(b.id),
        )) {
          if (interceptionPower >= reliefPower) break;
          if (remaining - army.soldiers < target.soldiers * BAL.aiReliefRetainRatio) continue;
          interceptors.push(army);
          remaining -= army.soldiers;
          interceptionPower += estArmyPower(state, army);
        }
        if (
          interceptors.length > 0 &&
          destination !== undefined &&
          destination !== target.id &&
          interceptionPower >= reliefPower
        ) {
          const commands: Command[] = [];
          for (const interception of interceptors)
            if (
              order(
                state,
                scope,
                sink,
                {
                  type: 'setArmyTarget',
                  clanId: scope.clanId,
                  armyId: interception.id,
                  targetNodeId: destination,
                },
                commands,
              )
            )
              diverted.add(interception.id);
          record(
            state,
            scope,
            sink,
            'siege.intercept',
            { planId: plan.id, remainingSiegeTroops: remaining },
            commands,
          );
        } else
          record(state, scope, sink, 'siege.hold', {
            planId: plan.id,
            reason: interceptionPower >= reliefPower ? 'interceptionOngoing' : 'cannotSplitArmy',
          });
      }
      const siegeTroops = besiegers
        .filter((a) => !diverted.has(a.id))
        .reduce((sum, a) => sum + a.soldiers, 0);
      const mode =
        siegeTroops >= target.soldiers * BAL.aiAssaultRatio &&
        target.durability <= target.maxDurability * BAL.aiAssaultDurabilityRatio
          ? 'assault'
          : 'encircle';
      if (mode === 'encircle' && siegeTroops < target.soldiers * BAL.encircleRatio) {
        // 07's validator is authoritative over 09's simplified "otherwise encircle" rule.
        record(state, scope, sink, 'siege.hold', {
          planId: plan.id,
          reason: 'encircleUnavailable',
        });
        continue;
      }
      for (const siegeId of [...new Set(besiegers.map((a) => a.siegeId))])
        if (siegeId !== null && state.sieges[siegeId]?.mode !== mode) {
          const commands: Command[] = [];
          order(
            state,
            scope,
            sink,
            { type: 'setSiegeMode', clanId: scope.clanId, siegeId, mode },
            commands,
          );
          record(state, scope, sink, 'siege.mode', { planId: plan.id, mode }, commands);
        }
    } else {
      const threat = getThreatCache(state, scope.clanId)
        .entries.filter((e) => e.threatenedCastleIds.includes(target.id))
        .reduce((sum, e) => sum + e.threat, 0);
      if (
        state.time.day - plan.stageEnteredDay >= BAL.aiConsolidateDays ||
        threat < BAL.aiConsolidateSafeThreat
      ) {
        ai.attackPlans = ai.attackPlans.filter((p) => p.id !== plan.id);
        record(state, scope, sink, 'plan.complete', { planId: plan.id });
      }
    }
  }
}

/** Council military phase: defensive transports, plan maintenance, then bounded expansion. */
export function militaryPhase(
  state: GameState,
  scope: AiScope,
  sink: AiSink,
  options: { allowExpansion?: boolean } = {},
): void {
  const ai = state.ai.clans[scope.clanId];
  if (!ai) return;
  const threat = getThreatCache(state, scope.clanId);
  const unsafe = new Set(threat.entries.flatMap((e) => e.threatenedCastleIds));
  const used = new Set<CastleId>();
  for (const entry of threat.entries.filter((e) => e.threat >= BAL.aiThreatAlertRatio))
    for (const id of entry.threatenedCastleIds) {
      const target = state.castles[id];
      if (!target || !scope.castleIds.includes(id)) continue;
      let need = Math.max(
        0,
        Math.ceil(entry.borderPowerEnemy * BAL.aiDefenseGarrisonRatio) - target.soldiers,
      );
      const commands: Command[] = [];
      const safe = scope.castleIds
        .map((i) => state.castles[i])
        .filter((c): c is Castle => c !== undefined && !unsafe.has(c.id) && !used.has(c.id))
        .map((c) => ({ castle: c, days: travelDays(state, c.id, target.id, scope.clanId) }))
        .filter((c) => c.days <= BAL.aiReinforceMaxDays)
        .sort((a, b) => a.days - b.days || a.castle.id.localeCompare(b.castle.id));
      for (const { castle } of safe) {
        const soldiers = Math.floor(
          Math.min(
            need,
            castle.soldiers * BAL.aiReinforceRatio,
            castle.soldiers - retainedGarrison(castle),
          ),
        );
        if (soldiers <= 0) continue;
        if (
          order(
            state,
            scope,
            sink,
            {
              type: 'transport',
              clanId: scope.clanId,
              fromCastleId: castle.id,
              toCastleId: target.id,
              soldiers,
              food: 0,
              gold: 0,
            },
            commands,
          )
        ) {
          need -= soldiers;
          used.add(castle.id);
        }
      }
      record(
        state,
        scope,
        sink,
        commands.length ? 'defense.reinforce' : 'defense.hold',
        { castleId: id, need },
        commands,
      );
    }
  if (threat.totalThreat >= BAL.aiRecallThreat)
    for (const plan of [...ai.attackPlans])
      if (
        plan.ownerCorpsId === scope.corpsId &&
        (plan.stage === 'muster' || plan.stage === 'advance')
      )
        abort(state, scope, sink, plan, 'homeThreat');
  attackPlansDailyTick(state, scope, sink);
  if (threat.totalThreat >= BAL.aiRecallThreat || options.allowExpansion === false) return;
  if (state.clans[scope.clanId]!.gold < BAL.aiLowGoldThreshold) {
    record(state, scope, sink, 'expand.skip', { reason: 'lowGold' });
    return;
  }
  const castleCount = Object.values(state.castles).filter(
    (c) => c.ownerClanId === scope.clanId,
  ).length;
  const maxPlans = Math.min(3, 1 + Math.floor(castleCount / BAL.aiPlanPerCastles));
  if (ai.attackPlans.length >= maxPlans) {
    record(state, scope, sink, 'expand.skip', { reason: 'planFull' });
    return;
  }
  const candidate = scoreExpansionTargets(state, scope.clanId, scope).find(
    (c) =>
      c.score >= BAL.aiExpandScoreMin &&
      c.ourPower / Math.max(c.defensePower, 1) >= c.requiredRatio &&
      !c.sources.some((s) => used.has(s.castleId)),
  );
  if (!candidate) {
    record(state, scope, sink, 'expand.none', {});
    return;
  }
  const plan: AttackPlan = {
    id: `plan.${scope.clanId.replace(/^clan\./, '')}-${ai.nextPlanSeq++}`,
    ownerCorpsId: scope.corpsId,
    targetCastleId: candidate.targetCastleId,
    targetClanId: state.castles[candidate.targetCastleId]!.ownerClanId,
    stagingCastleId: candidate.stagingCastleId,
    stagingRetainedTroops: retainedGarrison(state.castles[candidate.stagingCastleId]!),
    abortReason: null,
    sourceCastleIds: [],
    sourceLeaderIds: {},
    stage: 'muster',
    armyIds: [],
    startedDay: state.time.day,
    stageEnteredDay: state.time.day,
    plannedTroops: 0,
  };
  const commands: Command[] = [];
  for (const source of candidate.sources) {
    const castle = state.castles[source.castleId];
    if (!castle) continue;
    const command = planMarchFromCastle(
      state,
      scope,
      castle,
      plan.stagingCastleId,
      source.soldiers,
    );
    if (
      castle.id !== plan.stagingCastleId &&
      (!command || !order(state, scope, sink, command, commands))
    )
      continue;
    plan.sourceCastleIds.push(source.castleId);
    plan.sourceLeaderIds[source.castleId] = source.leaderId;
    plan.plannedTroops += source.soldiers;
  }
  if (plan.sourceCastleIds.length > 0) {
    ai.attackPlans.push(plan);
    record(
      state,
      scope,
      sink,
      'expand.select',
      { planId: plan.id, targetCastleId: plan.targetCastleId, score: candidate.score },
      commands,
    );
  }
}
