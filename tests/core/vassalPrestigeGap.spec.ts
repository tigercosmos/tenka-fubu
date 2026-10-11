import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { CommandQueue } from '../../src/core/commands/queue';
import { validateCommand } from '../../src/core/commands/validate';
import type { Command } from '../../src/core/commands/types';
import type { ExecutionAuthority } from '../../src/core/commands/authority';
import { advanceDay } from '../../src/core/systems';
import { clanPower, evaluateProposal } from '../../src/core/systems/diplomacyEval';
import {
  adjustSentiment,
  adjustTrust,
  getDiplomacyRow,
} from '../../src/core/systems/diplomacyCommon';
import { validateState } from '../../src/core/state/invariants';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { buildTinyState, CLAN_ALPHA, CLAN_BETA } from '../fixtures/tiny';

function prepared(gap: number) {
  const state = buildTinyState();
  // Controlled valid weak-polity prerequisite; no claim to simulate its prior decline.
  state.clans[CLAN_BETA]!.prestige = 0;
  state.clans[CLAN_ALPHA]!.prestige = gap;
  for (const district of Object.values(state.districts))
    if (district.ownerClanId === CLAN_BETA) district.kokudaka = 1;
  for (const castle of Object.values(state.castles))
    if (castle.ownerClanId === CLAN_BETA) castle.soldiers = 0;
  adjustSentiment(state, CLAN_BETA, CLAN_ALPHA, 100);
  adjustSentiment(state, CLAN_ALPHA, CLAN_BETA, 100);
  expect(clanPower(state, CLAN_ALPHA) / clanPower(state, CLAN_BETA)).toBeGreaterThan(
    BAL.vassalDemandPowerRatio,
  );
  expect(validateState(state)).toEqual([]);
  return state;
}

function tick(
  state: ReturnType<typeof prepared>,
  command: Command,
  authority?: ExecutionAuthority,
) {
  expect(validateCommand(state, command, authority)).toEqual({ ok: true });
  const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  queue.enqueue(command, state.time.day, authority);
  const result = advanceDay(state, queue.drain());
  expect(result.appliedCommands).toHaveLength(1);
  expect(result.events.some((event) => event.type === 'command.rejected')).toBe(false);
  expect(validateState(state)).toEqual([]);
  return result;
}

describe('vassal acceptance prestige gap (15 / 17 DP7)', () => {
  it.each([-1, 0])(
    'preserves alliance credit-cost boundary independently of prestige (offset=%s)',
    (offset) => {
      expect(BAL.trustCostAlliance).toBe(60);
      const state = buildTinyState();
      adjustTrust(state, CLAN_ALPHA, CLAN_BETA, BAL.trustCostAlliance + offset);
      adjustSentiment(state, CLAN_BETA, CLAN_ALPHA, 100);
      const command = {
        type: 'proposePact' as const,
        clanId: CLAN_ALPHA,
        targetClanId: CLAN_BETA,
        kind: 'proposeAlliance' as const,
        reinforceAgainstClanId: null,
      };
      expect(validateCommand(state, command).ok).toBe(offset === 0);
      const rng = structuredClone(state.rng);
      const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
      queue.enqueue(command, state.time.day);
      const result = advanceDay(state, queue.drain());
      expect(result.events.some((event) => event.type === 'command.rejected')).toBe(offset < 0);
      expect(result.events.some((event) => event.type === 'pact.signed')).toBe(offset === 0);
      expect(state.rng).toEqual(rng);
      expect(validateState(state)).toEqual([]);
    },
  );
  it.each([-1, 0, 1])(
    'requires stronger minus weaker prestige at threshold offset %s, not power alone',
    (offset) => {
      const gap = BAL.vassalPrestigeGap + offset;
      const state = prepared(gap);
      const before = structuredClone(state);
      const score = evaluateProposal(state, CLAN_ALPHA, CLAN_BETA, 'demandVassal');
      expect(state).toEqual(before);
      expect(score >= BAL.dipAcceptThreshold).toBe(offset >= 0);
      const result = tick(state, {
        type: 'proposePact',
        clanId: CLAN_ALPHA,
        targetClanId: CLAN_BETA,
        kind: 'demandVassal',
        reinforceAgainstClanId: null,
      });
      expect(result.events.some((event) => event.type === 'pact.signed')).toBe(offset >= 0);
      expect(result.events.some((event) => event.type === 'diplo.refused')).toBe(offset < 0);
      expect(state.rng).toEqual(before.rng);
    },
  );

  it.each([-1, 0, 1])(
    'reverses offer direction and prevents a player acceptance bypass at offset %s',
    (offset) => {
      const gap = BAL.vassalPrestigeGap + offset;
      const state = prepared(gap);
      const score = evaluateProposal(state, CLAN_BETA, CLAN_ALPHA, 'offerVassal');
      expect(score >= BAL.dipAcceptThreshold).toBe(offset >= 0);
      tick(
        state,
        {
          type: 'proposePact',
          clanId: CLAN_BETA,
          targetClanId: CLAN_ALPHA,
          kind: 'offerVassal',
          reinforceAgainstClanId: null,
        },
        { kind: 'clan', clanId: CLAN_BETA },
      );
      expect(state.diplomacy.pendingProposals).toHaveLength(1);
      const rng = structuredClone(state.rng);
      const result = tick(state, {
        type: 'respondPact',
        clanId: CLAN_ALPHA,
        proposalId: state.diplomacy.pendingProposals[0]!.id,
        accept: true,
      });
      expect(result.events.some((event) => event.type === 'pact.signed')).toBe(offset >= 0);
      expect(state.rng).toEqual(rng);
    },
  );

  it('still rejects an ineligible power ratio even when the prestige gap is sufficient', () => {
    const state = prepared(BAL.vassalPrestigeGap);
    state.clans[CLAN_ALPHA]!.prestige = 0;
    state.clans[CLAN_BETA]!.prestige = BAL.vassalPrestigeGap;
    expect(clanPower(state, CLAN_BETA) / clanPower(state, CLAN_ALPHA)).toBeLessThan(
      BAL.vassalDemandPowerRatio,
    );
    expect(validateState(state)).toEqual([]);
    const command = {
      type: 'proposePact' as const,
      clanId: CLAN_BETA,
      targetClanId: CLAN_ALPHA,
      kind: 'demandVassal' as const,
      reinforceAgainstClanId: null,
    };
    expect(validateCommand(state, command, { kind: 'clan', clanId: CLAN_BETA }).ok).toBe(false);
  });

  it('rechecks a reduced prestige gap at acceptance and preserves native save continuation', () => {
    const state = prepared(BAL.vassalPrestigeGap);
    tick(
      state,
      {
        type: 'proposePact',
        clanId: CLAN_BETA,
        targetClanId: CLAN_ALPHA,
        kind: 'offerVassal',
        reinforceAgainstClanId: null,
      },
      { kind: 'clan', clanId: CLAN_BETA },
    );
    state.clans[CLAN_ALPHA]!.prestige = BAL.vassalPrestigeGap - 1;
    const decoded = decodeSave(encodeSave(state, 42));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.code);
    const restored = decoded.saveFile.state;
    const command = {
      type: 'respondPact' as const,
      clanId: CLAN_ALPHA,
      proposalId: state.diplomacy.pendingProposals[0]!.id,
      accept: true,
    };
    const result = tick(state, command);
    const replay = tick(restored, command);
    expect(result.events).toEqual(replay.events);
    expect(result.events.some((event) => event.type === 'diplo.refused')).toBe(true);
    expect(getDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA).pacts).toEqual([]);
    expect(
      getDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA).refusalCooldownUntilDay.offerVassal,
    ).toBeUndefined();
    state.ai.intentLog = [];
    restored.ai.intentLog = [];
    expect(restored).toEqual(state);
  });
});
