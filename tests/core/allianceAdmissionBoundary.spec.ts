import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { applyProposePact } from '../../src/core/commands/diplomacyCommands';
import type { CommandByType } from '../../src/core/commands/registry';
import { validateCommand } from '../../src/core/commands/validate';
import { validateState } from '../../src/core/state/invariants';
import { canonicalStringify } from '../../src/core/state/serialize';
import { diplomacySystem } from '../../src/core/systems/diplomacy';
import {
  adjustSentiment,
  adjustTrust,
  getTrust,
  hasPact,
  isAtWar,
} from '../../src/core/systems/diplomacyCommon';
import { evaluateProposal } from '../../src/core/systems/diplomacyEval';
import { buildTinyState, CLAN_ALPHA, CLAN_BETA } from '../fixtures/tiny';

const command: CommandByType['proposePact'] = {
  type: 'proposePact',
  clanId: CLAN_ALPHA,
  targetClanId: CLAN_BETA,
  kind: 'proposeAlliance',
  reinforceAgainstClanId: null,
};

// Synthetic schema-built campaign: use a non-month-opening day so settlement
// cannot be confused with monthly trust/sentiment changes.
function prepared(trust: number, sentiment: number) {
  const state = buildTinyState();
  state.time.day += 1;
  state.time.dayOfMonth = 2;
  adjustTrust(state, CLAN_ALPHA, CLAN_BETA, trust);
  adjustSentiment(state, CLAN_BETA, CLAN_ALPHA, sentiment);
  expect(state.meta.playerClanId).toBe(CLAN_ALPHA);
  expect(isAtWar(state, CLAN_ALPHA, CLAN_BETA)).toBe(false);
  expect(validateState(state)).toEqual([]);
  return state;
}

describe('alliance admission and deterministic acceptance boundaries', () => {
  it('rejects literal trust 59 even when the full acceptance score is sufficient', () => {
    const state = prepared(59, 100);
    const before = canonicalStringify(state);
    expect(BAL.trustCostAlliance).toBe(60);
    expect(evaluateProposal(state, CLAN_ALPHA, CLAN_BETA, command.kind)).toBeGreaterThanOrEqual(
      BAL.dipAcceptThreshold,
    );
    expect(validateCommand(state, command)).toEqual({
      ok: false,
      reasonKey: 'cmd.reject.invalidTarget',
    });
    expect(canonicalStringify(state)).toBe(before);
    // Only the admission credit changes: no war, authority, or score obstacle.
    adjustTrust(state, CLAN_ALPHA, CLAN_BETA, 1);
    expect(validateCommand(state, command)).toEqual({ ok: true });
    expect(validateState(state)).toEqual([]);
  });

  it('admits literal trust 60 but actually refuses a low-score proposal without spending credit', () => {
    const state = prepared(60, 0);
    const rng = structuredClone(state.rng);
    const before = canonicalStringify(state);
    expect(validateCommand(state, command)).toEqual({ ok: true });
    expect(evaluateProposal(state, CLAN_ALPHA, CLAN_BETA, command.kind)).toBeLessThan(
      BAL.dipAcceptThreshold,
    );
    expect(canonicalStringify(state)).toBe(before);
    applyProposePact(state, command, () => {});
    expect(getTrust(state, CLAN_ALPHA, CLAN_BETA)).toBe(60);
    expect(state.diplomacy.pendingProposals).toHaveLength(1);
    expect(validateState(state)).toEqual([]);
    const events = diplomacySystem(state);
    expect(events.filter((event) => event.type === 'diplo.refused')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'pact.signed')).toHaveLength(0);
    expect(hasPact(state, CLAN_ALPHA, CLAN_BETA, 'alliance')).toBe(false);
    expect(getTrust(state, CLAN_ALPHA, CLAN_BETA)).toBe(60);
    expect(state.diplomacy.pendingProposals).toHaveLength(0);
    expect(state.rng).toEqual(rng);
    expect(validateState(state)).toEqual([]);
  });

  it('actually accepts literal trust 60 with a sufficient score and spends credit exactly once', () => {
    const state = prepared(60, 100);
    const rng = structuredClone(state.rng);
    const before = canonicalStringify(state);
    expect(validateCommand(state, command)).toEqual({ ok: true });
    expect(evaluateProposal(state, CLAN_ALPHA, CLAN_BETA, command.kind)).toBeGreaterThanOrEqual(
      BAL.dipAcceptThreshold,
    );
    expect(canonicalStringify(state)).toBe(before);
    applyProposePact(state, command, () => {});
    expect(getTrust(state, CLAN_ALPHA, CLAN_BETA)).toBe(60);
    expect(validateState(state)).toEqual([]);
    const events = diplomacySystem(state);
    expect(events.filter((event) => event.type === 'pact.signed')).toHaveLength(1);
    expect(events.filter((event) => event.type === 'diplo.refused')).toHaveLength(0);
    expect(hasPact(state, CLAN_ALPHA, CLAN_BETA, 'alliance')).toBe(true);
    expect(getTrust(state, CLAN_ALPHA, CLAN_BETA)).toBe(0);
    expect(getTrust(state, CLAN_BETA, CLAN_ALPHA)).toBe(0);
    expect(state.diplomacy.pendingProposals).toHaveLength(0);
    expect(diplomacySystem(state).filter((event) => event.type === 'pact.signed')).toHaveLength(0);
    expect(getTrust(state, CLAN_ALPHA, CLAN_BETA)).toBe(0);
    expect(state.rng).toEqual(rng);
    expect(validateState(state)).toEqual([]);
  });
});
