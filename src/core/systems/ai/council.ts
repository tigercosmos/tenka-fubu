import { BAL } from '../../balance';
import type { ExecutionAuthority } from '../../commands/authority';
import type { Command } from '../../commands/types';
import { validateCommand } from '../../commands/validate';
import { pactTrustCost } from '../../commands/diplomacyCommands';
import {
  castleFoodCap,
  castleMaxSoldiers,
  garrisonFoodMonthly,
  monthlyGoldIncome,
  monthlyGoldIncomeForCastles,
} from '../../domestic';
import { RANK_VALUES } from '../../state/enums';
import type { Castle, GameState, Officer } from '../../state/gameState';
import type { ClanId } from '../../state/ids';
import { buildMapGraph } from '../../state/mapGraph';
import { computePath } from '../pathfinding';
import {
  canPlot,
  getDiplomacyRow,
  getTrust,
  hasPact,
  isAtWar,
  isOfficerBusy,
} from '../diplomacyCommon';
import { clanPower } from '../diplomacyEval';
import { effectiveStats, rewardOfficerCost } from '../officers';
import { rankFacilities, rankPolicies } from './domesticMetadata';
import { getDifficultyMods } from './difficulty';
import { splitCorpsIncome } from '../corps';
import { pickDevFocus } from './stewardAi';
import type { AiScope, AiSink } from './types';

export interface DomesticOptions {
  rewards?: boolean;
  policies?: boolean;
  authority?: ExecutionAuthority;
}
export function scopeAuthority(scope: AiScope): ExecutionAuthority {
  return scope.corpsId === null
    ? { kind: 'clan', clanId: scope.clanId }
    : { kind: 'corps', clanId: scope.clanId, corpsId: scope.corpsId };
}
export function foodReserve(state: Readonly<GameState>, castle: Readonly<Castle>): number {
  return Math.min(
    castleFoodCap(castle),
    Math.ceil((garrisonFoodMonthly(state, castle) / 30) * BAL.aiFoodReserveDays),
  );
}
export function isThreatened(state: Readonly<GameState>, castle: Readonly<Castle>): boolean {
  return (
    state.ai.clans[castle.ownerClanId]?.threatCache?.entries.some(
      (entry) =>
        entry.threat >= BAL.aiThreatAlertRatio && entry.threatenedCastleIds.includes(castle.id),
    ) ?? false
  );
}
export function recordOrder(
  state: GameState,
  sink: AiSink,
  command: Command,
  authority: ExecutionAuthority,
  kind: string,
  layer: 'council' | 'castle' | 'corps' = 'council',
): boolean {
  const eligible =
    sink.canEnqueue?.(command, authority) ?? validateCommand(state, command, authority);
  if (!eligible.ok) {
    sink.record({
      day: state.time.day,
      clanId: command.clanId,
      layer,
      kind: 'decision.ineligible',
      detail: { decision: kind, commandType: command.type, reason: eligible.reasonKey },
      scores: null,
      commands: [],
    });
    return false;
  }
  const result = sink.enqueue(command, authority);
  sink.record({
    day: state.time.day,
    clanId: command.clanId,
    layer,
    kind: result.ok ? kind : 'error.invalidCommand',
    detail: result.ok ? {} : { reason: result.reasonKey },
    scores: null,
    commands: result.ok ? [command] : [],
  });
  return result.ok;
}

/** Ordered Phase C. Shadow balances reserve queued orders without applying gameplay. */
export function runDomesticCouncil(
  state: GameState,
  scope: AiScope,
  sink: AiSink,
  options: DomesticOptions = {},
): void {
  const clan = state.clans[scope.clanId];
  if (!clan?.alive) return;
  const authority = options.authority ?? scopeAuthority(scope);
  const castles = scope.castleIds
    .map((id) => state.castles[id])
    .filter((c): c is Castle => c?.ownerClanId === clan.id)
    .sort((a, b) => a.id.localeCompare(b.id));
  const incomeMult = getDifficultyMods(state, clan.id).incomeMult;
  const monthlyIncome =
    scope.corpsId === null
      ? Math.floor(monthlyGoldIncome(state, clan.id) * incomeMult)
      : splitCorpsIncome(
          Math.floor(monthlyGoldIncomeForCastles(state, scope.castleIds) * incomeMult),
        ).corpsGold;
  const reserve = monthlyIncome * BAL.aiGoldReserveMonths;
  let gold = scope.corpsId === null ? clan.gold : (state.corps[scope.corpsId]?.gold ?? 0);
  const spendable = Math.max(0, gold - reserve);
  const donorCastles =
    authority.kind === 'castle'
      ? Object.values(state.castles).filter((c) => c.ownerClanId === clan.id && c.corpsId === null)
      : castles;
  const food = new Map(donorCastles.map((c) => [c.id, c.food]));
  const graph = buildMapGraph(state.castles, state.districts, state.roads);
  for (const destination of castles) {
    const inbound = Object.values(state.transports)
      .filter((t) => !t.returning && t.toCastleId === destination.id)
      .reduce((sum, t) => sum + t.food, 0);
    let deficit = Math.max(
      0,
      foodReserve(state, destination) - (food.get(destination.id) ?? 0) - inbound,
    );
    if (deficit === 0) continue;
    const donors = donorCastles
      .filter((c) => c.id !== destination.id)
      .filter((c) => Math.floor(Math.max(0, (food.get(c.id) ?? 0) - foodReserve(state, c))) > 0)
      .map((castle) => ({
        castle,
        path: computePath(state, graph, {
          clanId: clan.id,
          from: castle.id,
          to: destination.id,
          speedFactor: 1,
        }),
      }))
      .filter((entry) => entry.path.found)
      .sort(
        (a, b) => a.path.totalDays - b.path.totalDays || a.castle.id.localeCompare(b.castle.id),
      );
    for (const { castle: source } of donors) {
      const amount = Math.floor(
        Math.min(deficit, Math.max(0, (food.get(source.id) ?? 0) - foodReserve(state, source))),
      );
      if (amount <= 0) continue;
      if (
        recordOrder(
          state,
          sink,
          {
            type: 'transport',
            clanId: clan.id,
            fromCastleId: source.id,
            toCastleId: destination.id,
            soldiers: 0,
            gold: 0,
            food: amount,
          },
          authority,
          'food.transport',
        )
      ) {
        food.set(source.id, (food.get(source.id) ?? 0) - amount);
        deficit -= amount;
      }
    }
  }
  const war = Object.values(state.clans).some(
    (other) => other.alive && isAtWar(state, clan.id, other.id),
  );
  for (const castle of castles) {
    const urgent = war || isThreatened(state, castle);
    const target =
      castleMaxSoldiers(state, castle) *
      (urgent ? BAL.aiGarrisonTargetWar : BAL.aiGarrisonTargetPeace);
    const secure = castle.districtIds.every(
      (id) => (state.districts[id]?.publicOrder ?? 0) >= BAL.aiConscriptSecurityMin,
    );
    const policy = castle.soldiers < target && secure ? (urgent ? 'high' : 'mid') : 'low';
    if (policy !== castle.conscriptPolicy)
      recordOrder(
        state,
        sink,
        { type: 'setConscriptPolicy', clanId: clan.id, castleId: castle.id, policy },
        authority,
        'conscript.policy',
      );
  }
  if (options.rewards !== false && scope.corpsId === null) {
    let budget = spendable * BAL.aiRewardBudgetRatio;
    const officers = Object.values(state.officers)
      .filter(
        (o) =>
          o.clanId === clan.id &&
          o.status === 'serving' &&
          o.hasComeOfAge &&
          o.id !== clan.leaderId &&
          o.loyalty < BAL.aiRewardLoyaltyThreshold,
      )
      .sort(
        (a, b) =>
          RANK_VALUES.indexOf(b.rank) - RANK_VALUES.indexOf(a.rank) ||
          a.loyalty - b.loyalty ||
          a.id.localeCompare(b.id),
      );
    for (const officer of officers) {
      const tier = (['large', 'medium', 'small'] as const).find(
        (t) => rewardOfficerCost(t) <= budget && gold - rewardOfficerCost(t) >= reserve,
      );
      if (!tier) break;
      if (
        recordOrder(
          state,
          sink,
          { type: 'rewardOfficer', clanId: clan.id, officerId: officer.id, tier },
          authority,
          'officer.reward',
        )
      ) {
        budget -= rewardOfficerCost(tier);
        gold -= rewardOfficerCost(tier);
      }
    }
  }
  let buildBudget = Math.max(0, gold - reserve) * BAL.aiBuildBudgetRatio;
  for (const castle of castles) {
    for (const def of rankFacilities(isThreatened(state, castle))) {
      if (def.costGold > buildBudget || gold - def.costGold < reserve) continue;
      const command: Command = {
        type: 'buildFacility',
        clanId: clan.id,
        castleId: castle.id,
        facilityTypeId: def.id,
      };
      // Sink performs authority-aware validation; cheap catalogue screening avoids normal invalid attempts.
      if (
        castle.facilities.includes(def.id) ||
        castle.buildQueue.some((q) => q.facilityTypeId === def.id)
      )
        continue;
      if (recordOrder(state, sink, command, authority, 'facility.build')) {
        gold -= def.costGold;
        buildBudget -= def.costGold;
        break;
      }
    }
  }
  const ai = state.ai.clans[clan.id];
  const persona = ai && state.ai.personas[ai.personaId];
  if (options.policies !== false && persona && scope.corpsId === null) {
    for (const def of rankPolicies(persona)) {
      if (gold - def.upkeepGold < reserve) continue;
      if (
        recordOrder(
          state,
          sink,
          { type: 'enactPolicy', clanId: clan.id, policyId: def.id },
          authority,
          'policy.enact',
        )
      )
        break;
    }
  }
  for (const castle of castles)
    for (const id of castle.districtIds) {
      const district = state.districts[id];
      if (!district || district.ownerClanId !== clan.id || district.stewardId !== null) continue;
      const focus = pickDevFocus(district);
      if (focus !== district.developFocus)
        recordOrder(
          state,
          sink,
          { type: 'setDevelopFocus', clanId: clan.id, districtId: id, focus },
          authority,
          'develop.focus',
        );
    }
  sink.record({
    day: state.time.day,
    clanId: clan.id,
    layer: scope.corpsId === null ? 'council' : 'corps',
    kind: 'domestic.evaluated',
    detail: { castles: castles.length, reserve },
    scores: null,
    commands: [],
  });
}

export function availableExecutors(
  state: Readonly<GameState>,
  clanId: ClanId,
  stat: 'pol' | 'int',
): Officer[] {
  return Object.values(state.officers)
    .filter(
      (o) =>
        o.clanId === clanId &&
        o.status === 'serving' &&
        o.hasComeOfAge &&
        !isOfficerBusy(state, o.id),
    )
    .sort((a, b) => effectiveStats(b)[stat] - effectiveStats(a)[stat] || a.id.localeCompare(b.id));
}
/** Shared plot priority for Phase D and player proposals; legal commands only. */
export function plotCandidates(
  state: Readonly<GameState>,
  clanId: ClanId,
  executor: Officer,
): Command[] {
  const commands: Command[] = [];
  const enemies = state.ai.clans[clanId]?.threatCache?.entries ?? [];
  const lords = Object.values(state.castles)
    .map((c) => (c.lordId === null ? undefined : state.officers[c.lordId]))
    .filter(
      (o): o is Officer =>
        !!o && o.loyalty < 50 && o.clanId !== null && canPlot(state, clanId, o.clanId),
    )
    .sort((a, b) => a.loyalty - b.loyalty || a.id.localeCompare(b.id));
  for (const lord of lords)
    commands.push({
      type: 'startPlot',
      clanId,
      kind: 'poach',
      executorId: executor.id,
      targetClanId: lord.clanId!,
      targetOfficerId: lord.id,
      targetCastleId: null,
      investGold: 0,
    });
  for (const siege of Object.values(state.sieges).sort((a, b) =>
    a.castleId.localeCompare(b.castleId),
  )) {
    const castle = state.castles[siege.castleId];
    if (
      !castle ||
      !canPlot(state, clanId, castle.ownerClanId) ||
      !siege.attackerArmyIds.some((id) => state.armies[id]?.clanId === clanId)
    )
      continue;
    commands.push({
      type: 'startPlot',
      clanId,
      kind: 'betrayal',
      executorId: executor.id,
      targetClanId: castle.ownerClanId,
      targetOfficerId: null,
      targetCastleId: castle.id,
      investGold: BAL.plotBetrayalMinInvestGold,
    });
  }
  for (const enemy of enemies)
    for (const castle of Object.values(state.castles)
      .filter((c) => c.ownerClanId === enemy.enemyClanId)
      .sort((a, b) => a.id.localeCompare(b.id)))
      commands.push({
        type: 'startPlot',
        clanId,
        kind: 'rumor',
        executorId: executor.id,
        targetClanId: castle.ownerClanId,
        targetOfficerId: null,
        targetCastleId: castle.id,
        investGold: 0,
      });
  const authority: ExecutionAuthority =
    clanId === state.meta.playerClanId && !state.ai.allAi
      ? { kind: 'player' }
      : { kind: 'clan', clanId };
  return commands.filter((command) => validateCommand(state, command, authority).ok);
}

export function runDiplomacyCouncil(state: GameState, clanId: ClanId, sink: AiSink): void {
  const ai = state.ai.clans[clanId],
    persona = ai && state.ai.personas[ai.personaId];
  if (!persona || !state.clans[clanId]?.alive) return;
  const authority: ExecutionAuthority = { kind: 'clan', clanId };
  const entries = ai.threatCache?.entries ?? [];
  const used = new Set<string>();
  const fear = [...entries]
    .filter(
      (e) =>
        e.threat >= BAL.aiDiploFearThreshold &&
        !hasPact(state, clanId, e.enemyClanId, 'alliance') &&
        !hasPact(state, clanId, e.enemyClanId, 'marriage') &&
        !hasPact(state, clanId, e.enemyClanId, 'ceasefire'),
    )
    .sort((a, b) => b.threat - a.threat || a.enemyClanId.localeCompare(b.enemyClanId))[0];
  if (fear && persona.diplomacy >= 40) {
    const kind = isAtWar(state, clanId, fear.enemyClanId) ? 'proposeCeasefire' : 'proposeAlliance';
    if (getTrust(state, clanId, fear.enemyClanId) >= pactTrustCost(kind))
      recordOrder(
        state,
        sink,
        {
          type: 'proposePact',
          clanId,
          targetClanId: fear.enemyClanId,
          kind,
          reinforceAgainstClanId: null,
        },
        authority,
        'diplo.requestPeace',
      );
    else {
      const executor = availableExecutors(state, clanId, 'pol').find((officer) => {
        const command: Command = {
          type: 'startDiploWork',
          clanId,
          target: fear.enemyClanId,
          executorId: officer.id,
        };
        return (sink.canEnqueue?.(command, authority) ?? validateCommand(state, command, authority))
          .ok;
      });
      if (
        executor &&
        recordOrder(
          state,
          sink,
          { type: 'startDiploWork', clanId, target: fear.enemyClanId, executorId: executor.id },
          authority,
          'diplo.work',
        )
      )
        used.add(executor.id);
    }
  }
  for (const entry of entries) {
    const ratio = clanPower(state, clanId) / Math.max(1, clanPower(state, entry.enemyClanId));
    if (ratio >= BAL.aiVassalDemandRatio)
      recordOrder(
        state,
        sink,
        {
          type: 'proposePact',
          clanId,
          targetClanId: entry.enemyClanId,
          kind: 'demandVassal',
          reinforceAgainstClanId: null,
        },
        authority,
        'diplo.demandVassal',
      );
    if (
      persona.loyalty < 25 &&
      ratio >= BAL.aiVassalDemandRatio &&
      hasPact(state, clanId, entry.enemyClanId, 'alliance')
    ) {
      const pact = getDiplomacyRow(state, clanId, entry.enemyClanId)?.pacts.find(
        (p) => p.kind === 'alliance',
      );
      if (pact)
        recordOrder(
          state,
          sink,
          { type: 'breakPact', clanId, targetClanId: entry.enemyClanId, kind: 'alliance' },
          authority,
          'diplo.breakAlliance',
        );
    }
  }
  if ((persona.aggression + 100 - persona.loyalty) / 2 >= 60) {
    for (const executor of availableExecutors(state, clanId, 'int').filter(
      (o) => !used.has(o.id),
    )) {
      const command = plotCandidates(state, clanId, executor).find(
        (candidate) =>
          sink.canEnqueue?.(candidate, authority).ok ??
          validateCommand(state, candidate, authority).ok,
      );
      if (command && recordOrder(state, sink, command, authority, 'plot.start')) break;
    }
  }
  sink.record({
    day: state.time.day,
    clanId,
    layer: 'council',
    kind: 'diplo.evaluated',
    detail: {},
    scores: null,
    commands: [],
  });
}
