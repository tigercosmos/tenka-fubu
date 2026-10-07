import { describe, expect, it } from 'vitest';
import {
  prepareM6FlowState,
  DEBUG_M6_FLOW_IDS as ids,
  DEBUG_M6_FLOW_SEED,
} from '../../src/core/debugM6';
import { loadS1560Scenario } from '../../src/data/scenarios/s1560';
import { buildGameStateFromScenario } from '../../src/core/state/builder';
import { validateState } from '../../src/core/state/invariants';
import { canonicalStringify } from '../../src/core/state/serialize';
import { validateCommand } from '../../src/core/commands/validate';
import { advanceDay } from '../../src/core/systems';
import type { Command } from '../../src/core/commands/types';
import { BAL } from '../../src/core/balance';
import { calendarToDay } from '../../src/core/systems/time';
import { rewardOfficerCost, rewardOfficerLoyaltyGain } from '../../src/core/systems/officers';

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

describe('M6 sanctioned fresh-game debug flow', () => {
  it('uses the first fixed seed whose unmodified production plot RNG succeeds', async () => {
    let found = 0;
    for (let seed = 1; seed <= 64; seed++) {
      const state = prepareM6FlowState(await fresh(seed));
      advanceDay(state, [{ seq: 1, issuedDay: state.time.day, command: plot() }]);
      for (let day = 1; day < 60; day++) advanceDay(state, []);
      if (state.officers[ids.poachTarget]!.clanId === ids.actor) {
        found = seed;
        break;
      }
    }
    expect(found).toBe(DEBUG_M6_FLOW_SEED);
  });
  it('leaves input untouched, validates its synthetic extension and guards against live-state reuse', async () => {
    const input = await fresh(),
      before = canonicalStringify(input),
      state = prepareM6FlowState(input);
    expect(canonicalStringify(input)).toBe(before);
    expect(state).not.toBe(input);
    expect(validateState(state)).toEqual([]);
    expect(state.rng).toEqual(input.rng);
    expect(state.clans[ids.ally]!.name).toBe('武田家');
    state.meta.stateVersion++;
    expect(() => prepareM6FlowState(state)).toThrow();
    expect(validateCommand(prepareM6FlowState(input), plot())).toEqual({ ok: true });
  });

  it('accepts Takeda alliance and subsequent aid through real settlement, never a preinstalled pact', async () => {
    const state = prepareM6FlowState(await fresh());
    const alliance: Command = {
      type: 'proposePact',
      clanId: ids.actor,
      targetClanId: ids.ally,
      kind: 'proposeAlliance',
      reinforceAgainstClanId: null,
    };
    expect(validateCommand(state, alliance)).toEqual({ ok: true });
    const signed = advanceDay(state, [{ seq: 1, issuedDay: state.time.day, command: alliance }]);
    expect(
      signed.events.some((event) => event.type === 'pact.signed' && event.kind === 'alliance'),
    ).toBe(true);
    const aid: Command = {
      ...alliance,
      kind: 'requestReinforce',
      reinforceAgainstClanId: ids.against,
    };
    expect(validateCommand(state, aid)).toEqual({ ok: true });
    const response = advanceDay(state, [{ seq: 2, issuedDay: state.time.day, command: aid }]);
    expect(
      response.events.some(
        (event) => event.type === 'diplo.reinforceAgreed' && event.toClanId === ids.ally,
      ),
    ).toBe(true);
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
    const result = advanceDay(state, [{ seq: 1, issuedDay: state.time.day, command }]);
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
    advanceDay(state, [
      {
        seq: 1,
        issuedDay: state.time.day,
        command: {
          type: 'resolveProposal',
          clanId: ids.actor,
          proposalId: ids.proposalId,
          accept: false,
        },
      },
    ]);
    const start = advanceDay(state, [{ seq: 2, issuedDay: state.time.day, command: plot() }]);
    expect(start.appliedCommands).toHaveLength(1);
    let succeeded = false;
    for (let day = 1; day < 60; day++) {
      const result = advanceDay(state, []);
      if (result.events.some((event) => event.type === 'plot.succeeded' && event.kind === 'poach'))
        succeeded = true;
      expect(validateState(state)).toEqual([]);
    }
    expect(succeeded).toBe(true);
    expect(state.officers[ids.poachTarget]!.clanId).toBe(ids.actor);
  });
});
