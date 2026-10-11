import { describe, expect, it } from 'vitest';
import {
  prepareM6FlowState,
  DEBUG_M6_FLOW_IDS as ids,
  DEBUG_M6_FLOW_SEED,
  DEBUG_M6_FLOW_METADATA,
} from '../../src/core/debugM6';
import { loadS1560Scenario } from '../../src/data/scenarios/s1560';
import { buildGameStateFromScenario } from '../../src/core/state/builder';
import { validateState } from '../../src/core/state/invariants';
import { canonicalStringify } from '../../src/core/state/serialize';
import { validateCommand } from '../../src/core/commands/validate';
import { advanceDay } from '../../src/core/systems';
import { CommandQueue } from '../../src/core/commands/queue';
import type { GameState } from '../../src/core/state/gameState';
import type { Command } from '../../src/core/commands/types';
import { BAL } from '../../src/core/balance';
import { calendarToDay } from '../../src/core/systems/time';
import { rewardOfficerCost, rewardOfficerLoyaltyGain } from '../../src/core/systems/officers';
import { computeThreatCache } from '../../src/core/systems/ai/threat';
import { reinforcementAidScore } from '../../src/core/systems/diplomacyEval';
import { getDiplomacyRow } from '../../src/core/systems/diplomacyCommon';
import { castleMaxSoldiers } from '../../src/core/domestic';

async function fresh(seed = DEBUG_M6_FLOW_SEED) {
  return buildGameStateFromScenario(await loadS1560Scenario(), {
    appVersion: 'test',
    seed,
    playerClanId: ids.actor,
    difficulty: 'normal',
    startDay: calendarToDay(1560, 4, 1),
  });
}
const plot = (): Command => ({
  type: 'startPlot',
  clanId: ids.actor,
  kind: 'poach',
  executorId: ids.plotExecutor,
  targetClanId: ids.enemy,
  targetOfficerId: ids.poachTarget,
  targetCastleId: null,
  investGold: 1000,
});
function queuedTick(state: GameState, queue: CommandQueue, command?: Command) {
  if (command) queue.enqueue(command, state.time.day);
  for (const order of state.ai.pendingOrders.splice(0))
    queue.enqueue(order.command, state.time.day, order.authority);
  const result = advanceDay(state, queue.drain());
  expect(result.events.filter((event) => event.type === 'command.rejected')).toEqual([]);
  return result;
}

describe('M6 sanctioned fresh-game debug flow', () => {
  it('uses the first fixed seed whose unmodified production plot RNG succeeds', async () => {
    let found = 0;
    for (let seed = 1; seed <= 64; seed++) {
      const state = prepareM6FlowState(await fresh(seed));
      const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
      queuedTick(state, queue, plot());
      for (let day = 1; day < 60; day++) queuedTick(state, queue);
      if (state.officers[ids.poachTarget]!.clanId === ids.actor) {
        found = seed;
        break;
      }
    }
    expect(found).toBe(DEBUG_M6_FLOW_SEED);
  });
  it('leaves input untouched, preserves production geography and roster, and guards against live-state reuse', async () => {
    const input = await fresh(),
      before = canonicalStringify(input),
      state = prepareM6FlowState(input);
    expect(canonicalStringify(input)).toBe(before);
    expect(state).not.toBe(input);
    expect(validateState(state)).toEqual([]);
    expect(state.rng).toEqual(input.rng);
    for (const key of ['clans', 'castles', 'districts', 'roads', 'officers', 'provinces'] as const)
      expect(Object.keys(state[key]).sort()).toEqual(Object.keys(input[key]).sort());
    expect(state.districts).toEqual(input.districts);
    expect(state.roads).toEqual(input.roads);
    expect(state.provinces).toEqual(input.provinces);
    expect(state.officers[ids.allyLeader]).toEqual(input.officers[ids.allyLeader]);
    for (const castle of Object.values(input.castles)) {
      const actual = state.castles[castle.id]!;
      expect(actual.pos).toEqual(castle.pos);
      expect(actual.districtIds).toEqual(castle.districtIds);
      expect(actual.ownerClanId).toBe(castle.ownerClanId);
      expect(actual.lordId).toBe(castle.lordId);
      if (castle.ownerClanId === ids.ally) {
        expect(actual.soldiers).toBe(castleMaxSoldiers(state, actual));
        expect(actual.morale).toBe(DEBUG_M6_FLOW_METADATA.takedaInitialMorale);
        expect(actual.food).toBeGreaterThanOrEqual(DEBUG_M6_FLOW_METADATA.takedaInitialFood);
      } else if (castle.ownerClanId === 'clan.nagao') {
        expect(actual.soldiers).toBe(
          Math.floor(castle.soldiers * DEBUG_M6_FLOW_METADATA.nagaoInitialGarrisonRatio),
        );
      } else expect(actual).toEqual(castle);
    }
    const beforePacts = getDiplomacyRow(input, ids.ally, ids.enemy);
    expect(beforePacts.pacts.length).toBeGreaterThan(0);
    expect(getDiplomacyRow(state, ids.ally, ids.enemy)).toEqual(beforePacts);
    expect(state.clans[ids.ally]!.name).toBe('武田家');
    state.meta.stateVersion++;
    expect(() => prepareM6FlowState(state)).toThrow();
    expect(validateCommand(prepareM6FlowState(input), plot())).toEqual({ ok: true });
  });

  it('accepts Takeda alliance and subsequent aid through real settlement, never a preinstalled pact', async () => {
    const state = prepareM6FlowState(await fresh());
    const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
    state.ai.clans[ids.ally]!.threatCache = computeThreatCache(state, ids.ally);
    expect(state.ai.clans[ids.ally]!.threatCache!.totalThreat).toBeGreaterThan(0);
    expect(reinforcementAidScore(state, ids.actor, ids.ally)).toBeGreaterThanOrEqual(
      BAL.aiAidScoreMin,
    );
    const alliance: Command = {
      type: 'proposePact',
      clanId: ids.actor,
      targetClanId: ids.ally,
      kind: 'proposeAlliance',
      reinforceAgainstClanId: null,
    };
    expect(validateCommand(state, alliance)).toEqual({ ok: true });
    const signed = queuedTick(state, queue, alliance);
    expect(
      signed.events.some((event) => event.type === 'pact.signed' && event.kind === 'alliance'),
    ).toBe(true);
    const aid: Command = {
      ...alliance,
      kind: 'requestReinforce',
      reinforceAgainstClanId: ids.against,
    };
    expect(validateCommand(state, aid)).toEqual({ ok: true });
    const response = queuedTick(state, queue, aid);
    expect(
      response.events.some(
        (event) => event.type === 'diplo.reinforceAgreed' && event.toClanId === ids.ally,
      ),
    ).toBe(true);
    const departure = queuedTick(state, queue);
    expect(
      departure.appliedCommands.some(
        (envelope) => envelope.command.type === 'march' && envelope.command.clanId === ids.ally,
      ),
    ).toBe(true);
    expect(Object.values(state.armies).some((army) => army.clanId === ids.ally)).toBe(true);
  });

  it('adopts the submitted proposal through registry execution with real gold, merit and loyalty effects', async () => {
    const state = prepareM6FlowState(await fresh()),
      author = state.officers[ids.proposalOfficer]!,
      gold = state.clans[ids.actor]!.gold,
      merit = author.merit,
      loyalty = author.loyalty,
      gain = rewardOfficerLoyaltyGain(author, 'small');
    const command: Command = {
      type: 'resolveProposal',
      clanId: ids.actor,
      proposalId: ids.proposalId,
      accept: true,
    };
    expect(validateCommand(state, command)).toEqual({ ok: true });
    const result = queuedTick(state, new CommandQueue(state.meta.lastAppliedCmdSeq + 1), command);
    expect(state.proposals[ids.proposalId]!.status).toBe('accepted');
    expect(state.clans[ids.actor]!.gold).toBe(gold - rewardOfficerCost('small'));
    expect(author.merit).toBe(merit + BAL.meritProposalAdopted);
    expect(author.loyalty).toBe(loyalty + gain + BAL.proposalAdoptLoyalty);
    expect(
      result.events.some((event) => event.type === 'proposal.resolved' && event.accepted),
    ).toBe(true);
  });

  it('poaches the real Imagawa target after two genuine monthly ticks with unchanged RNG mechanics', async () => {
    const state = prepareM6FlowState(await fresh());
    const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
    queuedTick(state, queue, {
      type: 'resolveProposal',
      clanId: ids.actor,
      proposalId: ids.proposalId,
      accept: false,
    });
    const start = queuedTick(state, queue, plot());
    expect(start.appliedCommands).toHaveLength(1);
    let succeeded = false;
    for (let day = 1; day < 60; day++) {
      const result = queuedTick(state, queue);
      if (result.events.some((event) => event.type === 'plot.succeeded' && event.kind === 'poach'))
        succeeded = true;
      expect(validateState(state)).toEqual([]);
    }
    expect(succeeded).toBe(true);
    expect(state.officers[ids.poachTarget]!.clanId).toBe(ids.actor);
  });
});
