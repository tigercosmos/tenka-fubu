import { BAL } from '@core/balance';
import { CommandQueue, applyCommands } from '@core/commands/queue';
import { validateCommand } from '@core/commands/validate';
import type { ExecutionAuthority } from '@core/commands/authority';
import type { CmdMarch, CmdSetArmyTarget } from '@core/commands/types';
import { buildMapGraph } from '@core/state/mapGraph';
import { REGION_VALUES } from '@core/state/enums';
import type { GameState } from '@core/state/gameState';
import type { ArmyId, CastleId, DistrictId, MapNodeId } from '@core/state/ids';
import { validateState } from '@core/state/invariants';
import { computePath, getStance } from '@core/systems/pathfinding';
import { armyPhysicalLeg, planArmyReroute } from '@core/systems/armyReroute';
import { traitModifier } from '@core/traits';
import type { GameEvent } from '@core/state/events';
import type { DebugLiveArmyDriver } from './bridge';

export interface LiveArmySlot {
  readonly armyId: ArmyId;
  readonly castleId: CastleId;
  readonly originalTarget: DistrictId;
  readonly alternateTarget: DistrictId;
  readonly originalFirstNode: MapNodeId;
  readonly alternateFirstNode: MapNodeId;
  readonly authority: ExecutionAuthority;
  readonly region: (typeof REGION_VALUES)[number];
}

/** Debug prerequisite: real commands on a clone, never resource or movement injections. */
export function prepareLiveMapWorkload(input: Readonly<GameState>, count: 40 | 120 = 40) {
  if (count !== 40 && count !== 120) throw new Error('Live cohort count must be40 or120');
  if (
    input.meta.scenarioId !== 's1560' ||
    input.time.day !== 0 ||
    input.meta.stateVersion !== 0 ||
    input.meta.lastAppliedCmdSeq !== 0 ||
    input.ai.pendingOrders.length !== 0 ||
    Object.keys(input.armies).length !== 0 ||
    validateState(input).length !== 0
  )
    throw new Error('Live workload requires a valid fresh national game');
  const geographyRegions = [...new Set(Object.values(input.provinces).map((p) => p.region))].sort();
  if (geographyRegions.length !== REGION_VALUES.length)
    throw new Error('Live workload requires all nine geography regions');
  const graph = buildMapGraph(input.castles, input.districts, input.roads);
  const sources = Object.values(input.castles)
    .sort((a, b) => (a.id < b.id ? -1 : 1))
    .map((castle) => {
      const authority: ExecutionAuthority =
        castle.ownerClanId === input.meta.playerClanId
          ? { kind: 'player' }
          : { kind: 'clan', clanId: castle.ownerClanId };
      const friendly = (id: string) => {
        const owner =
          input.castles[id as CastleId]?.ownerClanId ??
          input.districts[id as DistrictId]?.ownerClanId;
        return (
          owner !== undefined &&
          ['own', 'friendly'].includes(getStance(input, castle.ownerClanId, owner))
        );
      };
      const routes = Object.values(input.districts)
        .filter((d) => friendly(d.id))
        .flatMap((d) => {
          const path = computePath(input, graph, {
            clanId: castle.ownerClanId,
            from: castle.id,
            to: d.id,
            speedFactor: 1,
          });
          if (!path.found || path.nodes.length < 2 || !path.nodes.every(friendly)) return [];
          const edge = Object.values(input.roads).find(
            (e) =>
              (e.a === path.nodes[0] && e.b === path.nodes[1]) ||
              (e.b === path.nodes[0] && e.a === path.nodes[1]),
          );
          return edge?.type === 'land'
            ? [
                {
                  target: d.id,
                  firstNode: path.nodes[1],
                  firstCost: edge.baseDays / BAL.roadGradeSpeedMult[edge.grade],
                },
              ]
            : [];
        });
      const candidates = Object.values(input.officers)
        .filter((o) => o.locationCastleId === castle.id)
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .flatMap((officer) => {
          const speed = Math.max(
            BAL.marchSpeedMin,
            Math.min(BAL.marchSpeedMax, traitModifier(officer, 'march.landSpeedMult').mult),
          );
          const route = routes
            .filter(
              (r) => r.firstCost > speed && routes.some((other) => other.firstNode !== r.firstNode),
            )
            .sort((a, b) => b.firstCost - a.firstCost || (a.target < b.target ? -1 : 1))[0];
          if (!route) return [];
          const alternate = routes.find((other) => other.firstNode !== route.firstNode)!;
          const command: CmdMarch = {
            type: 'march',
            clanId: castle.ownerClanId,
            originCastleId: castle.id,
            leaderId: officer.id,
            deputyIds: [],
            soldiers: BAL.minMarchTroops,
            food: Math.ceil(BAL.minMarchTroops * BAL.fieldFoodPerSoldierDaily * BAL.maxCarryDays),
            targetNodeId: route.target,
          };
          return validateCommand(input, command, authority).ok
            ? [
                {
                  command,
                  alternate: alternate.target,
                  originalFirstNode: route.firstNode!,
                  alternateFirstNode: alternate.firstNode!,
                },
              ]
            : [];
        });
      return { castle, authority, candidates, region: input.provinces[castle.provinceId]!.region };
    });
  const game = structuredClone(input) as GameState;
  const queue = new CommandQueue(game.meta.lastAppliedCmdSeq + 1);
  const commands = [];
  const events: GameEvent[] = [];
  const slots: LiveArmySlot[] = [];
  const maxCandidates = Math.max(...sources.map((s) => s.candidates.length));
  for (let index = 0; index < maxCandidates && slots.length < count; index++) {
    for (const region of geographyRegions)
      for (const source of sources.filter((s) => s.region === region)) {
        if (slots.length === count) break;
        const candidate = source.candidates[index];
        if (!candidate || !validateCommand(game, candidate.command, source.authority).ok) continue;
        const envelope = queue.enqueue(candidate.command, game.time.day, source.authority);
        if (applyCommands(game, queue.drain(), (event) => events.push(event)).length !== 1)
          throw new Error('Live march rejected after validation');
        commands.push(envelope);
        const army = Object.values(game.armies).find(
          (a) => a.leaderId === candidate.command.leaderId,
        )!;
        slots.push({
          armyId: army.id,
          castleId: source.castle.id,
          originalTarget: candidate.command.targetNodeId as DistrictId,
          alternateTarget: candidate.alternate,
          originalFirstNode: candidate.originalFirstNode,
          alternateFirstNode: candidate.alternateFirstNode,
          authority: source.authority,
          region,
        });
      }
  }
  if (slots.length !== count || validateState(game).length !== 0)
    throw new Error(`Unable to prepare valid${count}-army live cohort`);
  return {
    game,
    commands,
    events,
    slots,
    geographyRegions,
    armyRegions: [...new Set(slots.map((s) => s.region))].sort(),
  };
}

/** Reversal is issued by the ordinary command handler; this query never writes movement. */
export function liveArmyTargets(
  game: Readonly<GameState>,
  slots: readonly LiveArmySlot[],
): readonly CmdSetArmyTarget[] {
  return slots.flatMap((slot) => {
    const army = game.armies[slot.armyId];
    if (
      !army ||
      army.status !== 'marching' ||
      army.soldiers <= 0 ||
      army.posNodeId !== slot.castleId
    )
      throw new Error(`Live cohort unavailable: ${slot.armyId}`);
    if (army.targetNodeId !== slot.originalTarget && army.targetNodeId !== slot.alternateTarget)
      throw new Error(`Live cohort target unavailable: ${slot.armyId}`);
    const leg = armyPhysicalLeg(army);
    const expectedFirst =
      army.targetNodeId === slot.originalTarget ? slot.originalFirstNode : slot.alternateFirstNode;
    if (leg === null && army.path[army.pathCursor + 1] !== expectedFirst)
      throw new Error(`Live cohort endpoint unavailable: ${slot.armyId}`);
    let targetNodeId = slot.originalTarget;
    if (leg !== null) {
      const opposite =
        leg.end === slot.originalFirstNode
          ? slot.alternateTarget
          : leg.end === slot.alternateFirstNode
            ? slot.originalTarget
            : null;
      if (
        opposite === null ||
        leg.from !== slot.castleId ||
        (leg.reversing ? army.targetNodeId !== opposite : leg.end !== expectedFirst)
      )
        throw new Error(`Live cohort endpoint unavailable: ${slot.armyId}`);
      if (leg.reversing) return [];
      // Canonical movement may reach the source and spend residual time on the
      // alternate leg in the same tick. Reverse that actual paid leg, not an
      // assumed original leg; destination IDs can lie beyond its first node.
      targetNodeId = opposite;
    }
    const plan = planArmyReroute(game, army, targetNodeId);
    if (plan === null || (leg !== null && plan.reversingEnd === null))
      throw new Error(`Live physical reversal unavailable: ${slot.armyId}`);
    return [{ type: 'setArmyTarget' as const, clanId: army.clanId, armyId: army.id, targetNodeId }];
  });
}

export function createLiveMapWorkload(slots: readonly LiveArmySlot[]) {
  const captured = structuredClone(slots);
  let failure: string | null = null;
  let disposed = false;
  let ticks = 0;
  let minimumMarching = captured.length;
  let latestDay = 0;
  let latestPaidLegs = 0;
  const driver: DebugLiveArmyDriver = {
    slots: captured,
    beforeDay: (game) => liveArmyTargets(game, captured),
    afterDay(game, result) {
      ticks++;
      latestDay = game.time.day;
      const armies = captured.map((slot) => game.armies[slot.armyId]);
      const marching = armies.filter(
        (a) =>
          a &&
          a.status === 'marching' &&
          a.soldiers > 0 &&
          (armyPhysicalLeg(a) !== null || a.pathCursor < a.path.length - 1),
      ).length;
      minimumMarching = Math.min(minimumMarching, marching);
      latestPaidLegs = armies.filter((a) => a && armyPhysicalLeg(a) !== null).length;
      if (marching !== captured.length || result.events.some((e) => e.type === 'command.rejected'))
        throw new Error('Live cohort lost marching army or encountered command rejection');
    },
    dispose(reason) {
      disposed = true;
      if (
        !['disposed', 'replaced', 'session-replaced', 'session-initialized', 'test-reset'].includes(
          reason,
        )
      )
        failure = reason;
    },
  };
  return {
    driver,
    getSnapshot: () => ({
      ticks,
      latestDay,
      minimumMarching,
      latestPaidLegs,
      disposed,
      failure,
      armyRegions: [...new Set(captured.map((s) => s.region))].sort(),
      count: captured.length,
      scope: 'canonical-command-driven/live-strategy' as const,
    }),
  };
}
