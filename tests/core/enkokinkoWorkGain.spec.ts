import { expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { applyCommands, CommandQueue } from '../../src/core/commands/queue';
import type { Command } from '../../src/core/commands/types';
import { validateCommand } from '../../src/core/commands/validate';
import { advanceDay } from '../../src/core/systems';
import { diplomacySystem } from '../../src/core/systems/diplomacy';
import { getTrust, adjustTrust } from '../../src/core/systems/diplomacyCommon';
import { monthlyDiplomacyWorkCost } from '../../src/core/systems/court';
import { validateState } from '../../src/core/state/invariants';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import type { FacilityTypeId, PolicyId, TraitId, TaimeiId } from '../../src/core/state/ids';
import {
  buildTinyState,
  CASTLE_A1,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_BUSHO,
} from '../fixtures/tiny';

const targets = [CLAN_BETA, 'court', 'shogunate'] as const;
type Target = (typeof targets)[number];
const policyId = 'pol.enkokinko' as PolicyId;
const enact: Command = { type: 'enactPolicy', clanId: CLAN_ALPHA, policyId };
function work(target: Target): Command {
  return { type: 'startDiploWork', clanId: CLAN_ALPHA, target, executorId: OFF_ALPHA_BUSHO };
}
function fixture() {
  const state = buildTinyState();
  state.clans[CLAN_ALPHA]!.prestige = 450;
  state.clans[CLAN_ALPHA]!.gold = 100_000;
  state.court.shogunateExists = true;
  Object.assign(state.officers[OFF_ALPHA_BUSHO]!, { pol: 73, traits: [] });
  expect(validateState(state)).toEqual([]);
  return state;
}
function commands(state: ReturnType<typeof fixture>, cmds: Command[]) {
  const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  for (const cmd of cmds) {
    expect(validateCommand(state, cmd)).toEqual({ ok: true });
    queue.enqueue(cmd, state.time.day);
  }
  return queue.drain();
}
function tick(state: ReturnType<typeof fixture>, cmds: Command[] = []) {
  const result = advanceDay(state, commands(state, cmds));
  expect(result.events.some((e) => e.type === 'command.rejected')).toBe(false);
  expect(validateState(state)).toEqual([]);
  return result;
}
function value(state: ReturnType<typeof fixture>, target: Target) {
  return target === 'court'
    ? (state.court.courtFavor[CLAN_ALPHA] ?? 0)
    : target === 'shogunate'
      ? (state.court.shogunateFavor[CLAN_ALPHA] ?? 0)
      : getTrust(state, CLAN_ALPHA, target);
}
function base(target: Target) {
  return target === 'court'
    ? BAL.courtFavorGainBase + 73 / BAL.courtFavorGainPolDivisor
    : target === 'shogunate'
      ? BAL.shogunateFavorGainBase + 73 / BAL.shogunateFavorGainPolDivisor
      : BAL.trustGainBase + 73 / BAL.trustGainPolDivisor;
}
function assigned(target: Target, policy = true) {
  const state = fixture();
  expect(applyCommands(state, commands(state, policy ? [enact] : []), () => {})).toHaveLength(
    policy ? 1 : 0,
  );
  expect(applyCommands(state, commands(state, [work(target)]), () => {})).toHaveLength(1);
  expect(validateState(state)).toEqual([]);
  return state;
}

it.each(targets)(
  'boosts actual queued adopt/work at the normal month boundary for %s',
  (target) => {
    const state = fixture();
    for (let i = 0; i < 28; i++) tick(state);
    tick(state, [enact]);
    expect(state.time.dayOfMonth).toBe(30);
    tick(state, [work(target)]);
    expect(value(state, target)).toBeCloseTo(base(target) * 1.25, 12);
  },
);

it.each(targets)(
  'composes once with the completed facility, preserves fractional gains/cost/RNG and clamps %s',
  (target) => {
    const state = assigned(target);
    state.castles[CASTLE_A1]!.facilities.push('fac.hyojosho' as FacilityTypeId);
    expect(validateState(state)).toEqual([]);
    const gold = state.clans[CLAN_ALPHA]!.gold;
    const rng = structuredClone(state.rng);
    const mission = state.diplomacy.missions[0]!;
    diplomacySystem(state);
    expect(value(state, target)).toBeCloseTo(
      base(target) * 1.25 * BAL.facDiplomacyWorkGainMult,
      12,
    );
    expect(Number.isInteger(value(state, target))).toBe(false);
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(gold - monthlyDiplomacyWorkCost(state, mission));
    expect(state.rng).toEqual(rng);
    const cap =
      target === 'court'
        ? BAL.courtFavorMax
        : target === 'shogunate'
          ? BAL.shogunateFavorMax
          : BAL.trustMax;
    if (target === 'court') state.court.courtFavor[CLAN_ALPHA] = cap - 0.1;
    else if (target === 'shogunate') state.court.shogunateFavor[CLAN_ALPHA] = cap - 0.1;
    else adjustTrust(state, CLAN_ALPHA, target, cap - 0.1 - value(state, target));
    const merit = state.officers[OFF_ALPHA_BUSHO]!.merit;
    diplomacySystem(state);
    expect(value(state, target)).toBe(cap);
    expect(state.officers[OFF_ALPHA_BUSHO]!.merit - merit).toBe(
      target === CLAN_BETA ? BAL.meritDiplomacy : 0,
    );
    diplomacySystem(state);
    expect(state.officers[OFF_ALPHA_BUSHO]!.merit - merit).toBe(
      target === CLAN_BETA ? BAL.meritDiplomacy : 0,
    );
    expect(validateState(state)).toEqual([]);
  },
);

it('composes actor policy once with executor trait, cumulative rank, invoked taimei and completed facility', () => {
  const state = assigned(CLAN_BETA);
  state.officers[OFF_ALPHA_BUSHO]!.traits = ['trait.gaiko' as TraitId];
  state.clans[CLAN_ALPHA]!.courtRank = 'ju5jo';
  state.clans[CLAN_ALPHA]!.prestige = BAL.taimeiUnlockPrestige['taimei.gaiko-kosei'];
  state.castles[CASTLE_A1]!.facilities.push('fac.hyojosho' as FacilityTypeId);
  const invoke: Command = {
    type: 'invokeTaimei',
    clanId: CLAN_ALPHA,
    taimeiId: 'taimei.gaiko-kosei' as TaimeiId,
  };
  expect(applyCommands(state, commands(state, [invoke]), () => {})).toHaveLength(1);
  const rng = structuredClone(state.rng);
  diplomacySystem(state);
  expect(value(state, CLAN_BETA)).toBeCloseTo(
    base(CLAN_BETA) *
      (1 + BAL.traitGaiko) *
      BAL.courtTrustGainMult *
      BAL.taimeiGaikoTrustMult *
      BAL.facDiplomacyWorkGainMult *
      1.25,
    12,
  );
  expect(state.rng).toEqual(rng);
  expect(validateState(state)).toEqual([]);
});

it('ignores enemy-only policy and reads a legally queued actor revoke live', () => {
  const state = assigned('court', false);
  state.clans[CLAN_BETA]!.prestige = 450;
  expect(
    applyCommands(state, commands(state, [{ ...enact, clanId: CLAN_BETA }]), () => {}),
  ).toHaveLength(1);
  diplomacySystem(state);
  expect(value(state, 'court')).toBeCloseTo(base('court'), 12);
  expect(applyCommands(state, commands(state, [enact]), () => {})).toHaveLength(1);
  const before = value(state, 'court');
  diplomacySystem(state);
  expect(value(state, 'court') - before).toBeCloseTo(base('court') * 1.25, 12);
  expect(
    applyCommands(
      state,
      commands(state, [{ type: 'revokePolicy', clanId: CLAN_ALPHA, policyId }]),
      () => {},
    ),
  ).toHaveLength(1);
  const revoked = value(state, 'court');
  diplomacySystem(state);
  expect(value(state, 'court') - revoked).toBeCloseTo(base('court'), 12);
  expect(validateState(state)).toEqual([]);
});

it('never gains for unpaid or invalid executor missions despite active policy', () => {
  for (const invalid of [false, true]) {
    const state = assigned('court');
    if (invalid) state.officers[OFF_ALPHA_BUSHO]!.status = 'ronin';
    else state.clans[CLAN_ALPHA]!.gold = 0;
    // Invalid executor is a defensive subsystem prerequisite, not a legal saved mission.
    const rng = structuredClone(state.rng);
    const events = diplomacySystem(state);
    expect(events.some((e) => e.type === 'diplo.workStopped')).toBe(true);
    expect(value(state, 'court')).toBe(0);
    expect(state.rng).toEqual(rng);
    expect(state.diplomacy.missions).toEqual([]);
  }
});

it('pays diplomacy before later policy auto-revocation, then removes the bonus next month', () => {
  const state = fixture();
  for (let i = 0; i < 28; i++) tick(state);
  tick(state, [enact]);
  for (const district of Object.values(state.districts)) district.commerce = 0;
  state.clans[CLAN_ALPHA]!.gold = BAL.courtWorkMonthlyCost;
  const result = tick(state, [work('court')]);
  expect(value(state, 'court')).toBeCloseTo(base('court') * 1.25, 12);
  expect(
    result.events.some((e) => e.type === 'policy.autoRevoked' && e.policyId === policyId),
  ).toBe(true);
  expect(state.policies[CLAN_ALPHA]!.active).not.toContain(policyId);
  state.clans[CLAN_ALPHA]!.gold = 100_000;
  const before = value(state, 'court');
  for (let i = 0; i < 30; i++) tick(state);
  expect(value(state, 'court') - before).toBeCloseTo(base('court'), 12);
});

it('continues native saved policy and pending work with identical state and RNG', () => {
  const state = fixture();
  for (let i = 0; i < 28; i++) tick(state);
  tick(state, [enact]);
  const decoded = decodeSave(encodeSave(state, 42, [work('shogunate')]));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error(decoded.code);
  tick(state, [work('shogunate')]);
  tick(decoded.saveFile.state, decoded.saveFile.pendingCommands);
  expect(value(state, 'shogunate')).toBeCloseTo(base('shogunate') * 1.25, 12);
  expect(decoded.saveFile.state.rng).toEqual(state.rng);
  // The native codec intentionally omits transient pre-save diagnostic intent logs.
  const originalPersistent = structuredClone(state);
  const loadedPersistent = structuredClone(decoded.saveFile.state);
  originalPersistent.ai.intentLog = [];
  loadedPersistent.ai.intentLog = [];
  expect(loadedPersistent).toEqual(originalPersistent);
});
