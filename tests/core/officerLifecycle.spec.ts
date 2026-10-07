import { describe, expect, it, vi } from 'vitest';
import { BAL } from '../../src/core/balance';
import { buildGameStateFromScenario } from '../../src/core/state/builder';
import { loadS1560Scenario } from '../../src/data/scenarios/s1560';
import { advanceDay } from '../../src/core/systems/index';
import { applyMarch } from '../../src/core/commands/march';
import { beginSiege } from '../../src/core/systems/siege';
import { validateState } from '../../src/core/state/invariants';
import { mulberry32Next } from '../../src/core/rng';
import type { GameState, Proposal } from '../../src/core/state/gameState';
import type { GameEvent } from '../../src/core/state/events';
import type { OfficerId, ProposalId, TraitId } from '../../src/core/state/ids';
import type { ClanId } from '../../src/core/state/ids';
import {
  applyHandleCaptive,
  applyRecruitRonin,
  applyRewardOfficer,
  validateHandleCaptive,
  validateRecruitRonin,
  validateRewardOfficer,
} from '../../src/core/commands/officerCommands';
import {
  createApplyResolveProposal,
  validateResolveProposal,
} from '../../src/core/commands/proposalCommands';
import {
  captiveRecruitSuccessRate,
  checkDefections,
  comingOfAge,
  officersSystem,
  poachAcceptanceFactor,
  recruitRoninSuccessRate,
  releaseOrphanedCaptives,
  rewardOfficerLoyaltyGain,
  transferOfficer,
} from '../../src/core/systems/officers';
import { proposalsSystem, submitProposal } from '../../src/core/systems/proposals';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_BUSHO,
  OFF_ALPHA_LORD,
  OFF_ALPHA_TAISHO,
  OFF_BETA_BUSHO,
} from '../fixtures/tiny';

function forceRoll(state: GameState, success: boolean): void {
  for (let seed = 0; seed < 10000; seed++) {
    const roll = mulberry32Next(seed)[0];
    if (success ? roll < 0.01 : roll > 0.99) {
      state.rng.misc = seed;
      return;
    }
  }
  throw new Error('Unable to choose deterministic RNG seed');
}
function ronin() {
  const state = buildTinyState();
  Object.assign(state.officers[OFF_BETA_BUSHO]!, {
    status: 'ronin',
    clanId: null,
    locationCastleId: CASTLE_A1,
  });
  state.clans[CLAN_ALPHA]!.gold = 10000;
  return state;
}
function captive() {
  const state = buildTinyState();
  Object.assign(state.officers[OFF_BETA_BUSHO]!, {
    status: 'captive',
    capturedByClanId: CLAN_ALPHA,
    locationCastleId: CASTLE_A1,
  });
  state.clans[CLAN_ALPHA]!.gold = 10000;
  return state;
}
const recruit = {
  type: 'recruitRonin' as const,
  clanId: CLAN_ALPHA,
  officerId: OFF_BETA_BUSHO,
  executorId: OFF_ALPHA_BUSHO,
};
const handle = {
  type: 'handleCaptive' as const,
  clanId: CLAN_ALPHA,
  officerId: OFF_BETA_BUSHO,
  executorId: null,
};

describe('M6 officer recruitment and captivity', () => {
  it('clamps both rates at canonical bounds and incorporates executor recruitment traits', () => {
    const state = ronin(),
      target = state.officers[OFF_BETA_BUSHO]!,
      executor = state.officers[OFF_ALPHA_BUSHO]!;
    executor.pol = 0;
    state.clans[CLAN_ALPHA]!.prestige = 0;
    target.pol = 110;
    expect(recruitRoninSuccessRate(state, target.id, executor.id, CLAN_ALPHA)).toBe(0.05);
    executor.pol = 110;
    executor.traits = ['trait.hitotarashi' as TraitId, 'trait.keigan' as TraitId];
    state.clans[CLAN_ALPHA]!.prestige = 10000;
    target.pol = 0;
    target.ldr = target.int = target.val = 0;
    expect(recruitRoninSuccessRate(state, target.id, executor.id, CLAN_ALPHA)).toBe(0.95);
    target.loyalty = 0;
    target.kinship = 'tozama';
    expect(captiveRecruitSuccessRate(state, target.id, executor.id, CLAN_ALPHA)).toBe(0.9);
    executor.pol = 0;
    executor.traits = [];
    target.loyalty = 100;
    target.kinship = 'kin';
    state.clans[CLAN_ALPHA]!.prestige = 0;
    expect(captiveRecruitSuccessRate(state, target.id, executor.id, CLAN_ALPHA)).toBe(0.02);
    const before = structuredClone(state.rng);
    state.diplomacy.missions.push({
      fromClanId: CLAN_ALPHA,
      target: 'court',
      officerId: executor.id,
      startDay: state.time.day,
    });
    expect(validateRecruitRonin(state, recruit).ok).toBe(false);
    expect(state.rng).toEqual(before);
  });
  it('keeps probability previews and validation pure and rejects wrong location / youth / insufficient signing bonus', () => {
    const state = ronin(),
      before = structuredClone(state);
    expect(validateRecruitRonin(state, recruit).ok).toBe(true);
    expect(
      recruitRoninSuccessRate(state, OFF_BETA_BUSHO, OFF_ALPHA_BUSHO, CLAN_ALPHA),
    ).toBeGreaterThanOrEqual(0.05);
    expect(state).toEqual(before);
    state.officers[OFF_ALPHA_BUSHO]!.locationCastleId = CASTLE_A2;
    expect(validateRecruitRonin(state, recruit).ok).toBe(false);
    state.officers[OFF_ALPHA_BUSHO]!.locationCastleId = CASTLE_A1;
    state.officers[OFF_BETA_BUSHO]!.hasComeOfAge = false;
    expect(validateRecruitRonin(state, recruit).ok).toBe(false);
    state.officers[OFF_BETA_BUSHO]!.hasComeOfAge = true;
    state.clans[CLAN_ALPHA]!.gold = BAL.recruitAttemptCost;
    expect(validateRecruitRonin(state, recruit).ok).toBe(false);
  });
  it('charges attempt on failure, enforces only actor cooldown, and never charges bonus on failure', () => {
    const state = ronin(),
      events: GameEvent[] = [],
      gold = state.clans[CLAN_ALPHA]!.gold;
    forceRoll(state, false);
    applyRecruitRonin(state, recruit, (e) => events.push(e));
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(gold - BAL.recruitAttemptCost);
    expect(state.officers[OFF_BETA_BUSHO]!.recruitRetryOn).toBe(state.time.day + 90);
    expect(events.map((e) => e.type)).toEqual(['officer.recruitFailed']);
    expect(validateRecruitRonin(state, recruit).ok).toBe(false);
    state.castles[CASTLE_A1]!.ownerClanId = CLAN_BETA;
    expect(
      state.events.cooldownUntil[`officer.recruit:${OFF_BETA_BUSHO}:${CLAN_BETA}`],
    ).toBeUndefined();
    state.time.day += 90;
    state.castles[CASTLE_A1]!.ownerClanId = CLAN_ALPHA;
    expect(validateRecruitRonin(state, recruit).ok).toBe(true);
  });
  it('successful ronin transfer pays both costs, caps initial rank, and emits recruitment', () => {
    const state = ronin(),
      events: GameEvent[] = [],
      target = state.officers[OFF_BETA_BUSHO]!;
    target.pol = 110;
    target.merit = 10000;
    forceRoll(state, true);
    applyRecruitRonin(state, recruit, (e) => events.push(e));
    expect(target.status).toBe('serving');
    expect(target.clanId).toBe(CLAN_ALPHA);
    expect(target.rank).toBe('busho');
    expect(target.capturedByClanId).toBeNull();
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(10000 - 20 - 220);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'officer.recruited', source: 'ronin' }),
    );
  });
  it('captive retry leaves allegiance intact; null executor uses the leader; success starts at40', () => {
    const state = captive(),
      target = state.officers[OFF_BETA_BUSHO]!;
    const before = structuredClone(state);
    expect(captiveRecruitSuccessRate(state, target.id, null, CLAN_ALPHA)).toBeGreaterThanOrEqual(
      0.02,
    );
    expect(state).toEqual(before);
    forceRoll(state, false);
    applyHandleCaptive(state, { ...handle, action: 'recruit' }, () => {});
    expect(target.status).toBe('captive');
    expect(target.clanId).toBe(CLAN_BETA);
    expect(validateHandleCaptive(state, { ...handle, action: 'recruit' }).ok).toBe(false);
    state.time.day += 30;
    forceRoll(state, true);
    applyHandleCaptive(state, { ...handle, action: 'recruit' }, () => {});
    expect(target.clanId).toBe(CLAN_ALPHA);
    expect(target.loyalty).toBe(40);
    expect(target.captiveRetryOn).toBeNull();
  });
  it('release returns to original clan; vanished original returns ronin; orphaned prison also returns', () => {
    const state = captive(),
      prestige = state.clans[CLAN_ALPHA]!.prestige;
    applyHandleCaptive(state, { ...handle, action: 'release' }, () => {});
    expect(state.officers[OFF_BETA_BUSHO]).toMatchObject({
      status: 'serving',
      clanId: CLAN_BETA,
      locationCastleId: CASTLE_B1,
      capturedByClanId: null,
    });
    expect(state.clans[CLAN_ALPHA]!.prestige).toBe(prestige + 5);
    const extinct = captive();
    extinct.clans[CLAN_BETA]!.alive = false;
    applyHandleCaptive(extinct, { ...handle, action: 'release' }, () => {});
    expect(extinct.officers[OFF_BETA_BUSHO]).toMatchObject({
      status: 'ronin',
      clanId: null,
      locationCastleId: CASTLE_A1,
    });
    const orphan = captive();
    orphan.castles[CASTLE_A1]!.ownerClanId = CLAN_BETA;
    expect(releaseOrphanedCaptives(orphan).map((e) => e.type)).toEqual(['officer.released']);
    expect(orphan.officers[OFF_BETA_BUSHO]!.status).toBe('serving');
  });
  it('execution emits only executed and penalizes nonkin household, not ruler or kin', () => {
    const state = captive(),
      events: GameEvent[] = [];
    state.officers[OFF_ALPHA_BUSHO]!.kinship = 'tozama';
    state.officers[OFF_ALPHA_BUSHO]!.loyalty = 80;
    state.officers[OFF_ALPHA_TAISHO]!.kinship = 'kin';
    state.officers[OFF_ALPHA_TAISHO]!.loyalty = 80;
    applyHandleCaptive(state, { ...handle, action: 'execute' }, (e) => events.push(e));
    expect(events.map((e) => e.type)).toEqual(['officer.executed']);
    expect(state.officers[OFF_BETA_BUSHO]).toMatchObject({
      status: 'dead',
      clanId: null,
      locationCastleId: null,
    });
    expect(state.officers[OFF_ALPHA_BUSHO]!.loyalty).toBe(78);
    expect(state.officers[OFF_ALPHA_TAISHO]!.loyalty).toBe(80);
    expect(state.officers[OFF_ALPHA_LORD]!.loyalty).toBe(100);
  });
});

describe('M6 officer lifecycle', () => {
  it('poaching an army commander appoints an eligible deputy or dissolves an empty army without dangling siege refs', () => {
    for (const withDeputy of [true, false]) {
      const state = buildTinyState();
      applyMarch(
        state,
        {
          type: 'march',
          clanId: CLAN_ALPHA,
          originCastleId: CASTLE_A1,
          leaderId: OFF_ALPHA_BUSHO,
          deputyIds: withDeputy ? [OFF_ALPHA_LORD] : [],
          soldiers: 100,
          food: 100,
          targetNodeId: CASTLE_B1,
        },
        () => {},
      );
      const army = Object.values(state.armies)[0]!;
      army.posNodeId = CASTLE_B1;
      army.path = [CASTLE_B1];
      army.pathCursor = 0;
      army.status = 'holding';
      beginSiege(state, CASTLE_B1, army.id);
      transferOfficer(
        state,
        OFF_ALPHA_BUSHO,
        { clanId: CLAN_BETA, castleId: CASTLE_B1, rank: 'busho', loyalty: 45 },
        () => {},
      );
      if (withDeputy) {
        expect(army.leaderId).toBe(OFF_ALPHA_LORD);
        expect(army.deputyIds).toEqual([]);
      } else {
        expect(state.armies[army.id]).toBeUndefined();
        expect(Object.values(state.sieges)).toEqual([]);
      }
      expect(validateState(state)).toEqual([]);
    }
  });
  it('rewards diminish to1, pay each gift immediately, and reset at January hook', () => {
    const state = buildTinyState(),
      officer = state.officers[OFF_ALPHA_BUSHO]!;
    state.clans[CLAN_ALPHA]!.gold = 10000;
    officer.loyalty = 0;
    const command = {
      type: 'rewardOfficer' as const,
      clanId: CLAN_ALPHA,
      officerId: officer.id,
      tier: 'small' as const,
    };
    expect(validateRewardOfficer(state, command).ok).toBe(true);
    for (const gain of [4, 2, 1, 1]) {
      expect(rewardOfficerLoyaltyGain(officer, 'small')).toBe(gain);
      applyRewardOfficer(state, command, () => {});
    }
    expect(officer.loyalty).toBe(8);
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(9800);
    state.time.month = 1;
    officersSystem(state, new Set());
    expect(officer.rewardGiftsThisYear).toBe(0);
  });
  it('defection removes fiefs/lord role and protects kin, loyalist and daimyo without extra RNG draws', () => {
    const state = buildTinyState(),
      officer = state.officers[OFF_ALPHA_TAISHO]!,
      events: GameEvent[] = [];
    officer.loyalty = 0;
    officer.kinship = 'tozama';
    officer.traits = [];
    state.officers[OFF_ALPHA_BUSHO]!.kinship = 'kin';
    state.officers[OFF_ALPHA_BUSHO]!.loyalty = 0;
    const district = Object.values(state.districts)[0]!;
    district.stewardId = officer.id;
    forceRoll(state, true);
    const rngBefore = state.rng.misc;
    checkDefections(state, (e) => events.push(e));
    expect(officer.status).toBe('ronin');
    expect(officer.clanId).toBeNull();
    expect(district.stewardId).toBeNull();
    expect(state.castles[CASTLE_A2]!.lordId).not.toBe(officer.id);
    expect(events.map((e) => e.type)).toEqual(['officer.defected']);
    expect(state.rng.misc).toBe(mulberry32Next(rngBefore)[1]);
    expect(poachAcceptanceFactor(state, OFF_ALPHA_LORD)).toBe(0);
    state.officers[OFF_ALPHA_BUSHO]!.kinship = 'tozama';
    state.officers[OFF_ALPHA_BUSHO]!.traits = ['trait.chushin' as TraitId];
    expect(poachAcceptanceFactor(state, OFF_ALPHA_BUSHO)).toBe(0);
  });
  it('transfers safely clear castle betrayal targets and keep spouse relations intact', () => {
    const state = buildTinyState(),
      officer = state.officers[OFF_ALPHA_TAISHO]!;
    const castle = state.castles[CASTLE_A2]!;
    castle.betrayalReadyTargetLordId = officer.id;
    castle.betrayalReadyClanId = CLAN_BETA;
    castle.betrayalReadyTargetClanId = CLAN_ALPHA;
    officer.spouseId = OFF_ALPHA_BUSHO;
    transferOfficer(
      state,
      officer.id,
      { clanId: CLAN_BETA, castleId: CASTLE_B1, rank: officer.rank, loyalty: 45 },
      () => {},
    );
    expect(castle.betrayalReadyClanId).toBeNull();
    expect(castle.betrayalReadyTargetLordId).toBeNull();
    expect(officer.spouseId).toBe(OFF_ALPHA_BUSHO);
  });
  it('debut joins active household or becomes ronin, and pre-debut deaths do not emit', () => {
    const state = buildTinyState(),
      child = state.officers[OFF_ALPHA_BUSHO]!;
    Object.assign(child, {
      hasComeOfAge: false,
      debutYear: 1560,
      status: 'ronin',
      merit: 100,
      rank: 'karō',
    });
    expect(comingOfAge(state).map((e) => e.type)).toEqual(['officer.comingOfAge']);
    expect(child.rank).toBe('kumigashira');
    expect(child.merit).toBe(0);
    child.hasComeOfAge = false;
    child.scheduledDeath.year = 1559;
    expect(comingOfAge(state)).toEqual([]);
    expect(child.status).toBe('dead');
    expect(child.locationCastleId).toBeNull();
    const extinct = buildTinyState(),
      other = extinct.officers[OFF_ALPHA_BUSHO]!;
    extinct.clans[CLAN_ALPHA]!.alive = false;
    other.hasComeOfAge = false;
    other.debutYear = 1560;
    comingOfAge(extinct);
    expect(other.status).toBe('ronin');
    expect(other.clanId).toBeNull();
  });
  it('scheduled death fires age cause exactly once and only at month boundary', () => {
    const state = buildTinyState(),
      officer = state.officers[OFF_ALPHA_BUSHO]!;
    officer.scheduledDeath = { year: state.time.year, month: state.time.month };
    state.time.dayOfMonth = 2;
    expect(officersSystem(state, new Set())).toEqual([]);
    state.time.dayOfMonth = 1;
    expect(officersSystem(state, new Set())).toContainEqual(
      expect.objectContaining({
        type: 'officer.died',
        cause: 'age',
        officerId: officer.id,
        nodeId: null,
      }),
    );
    expect(officersSystem(state, new Set()).filter((e) => e.type === 'officer.died')).toEqual([]);
  });
});

function proposalState() {
  const state = buildTinyState();
  const candidate: Omit<Proposal, 'id' | 'createdDay' | 'expiresDay' | 'status'> = {
    clanId: CLAN_ALPHA,
    officerId: OFF_ALPHA_BUSHO,
    kind: 'develop',
    command: {
      type: 'rewardOfficer',
      clanId: CLAN_ALPHA,
      officerId: OFF_ALPHA_BUSHO,
      tier: 'small',
    },
    meritReward: 30,
    estimatedCostGold: 50,
    summaryKey: 'test',
    summaryParams: {},
  };
  submitProposal(state, candidate);
  const proposal = Object.values(state.proposals)[0]!;
  return {
    state,
    proposal,
    candidate,
    cmd: {
      type: 'resolveProposal' as const,
      clanId: CLAN_ALPHA,
      proposalId: proposal.id,
      accept: true,
    },
  };
}
describe('M6 proposal resolution', () => {
  it('executes once before rewarding, preserves payload, and rejects repeated resolutions', () => {
    const { state, proposal, cmd } = proposalState(),
      officer = state.officers[OFF_ALPHA_BUSHO]!,
      before = officer.merit;
    const apply = vi.fn((actualState: GameState, command: Proposal['command']) => {
      expect(actualState).toBe(state);
      expect(command).toBe(proposal.command);
      expect(officer.merit).toBe(before);
    });
    const handler = createApplyResolveProposal({ validate: () => ({ ok: true }), apply });
    const payload = structuredClone(proposal.command);
    handler(state, cmd, () => {});
    handler(state, cmd, () => {});
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply.mock.calls[0]?.[1]).toEqual(payload);
    expect(officer.merit).toBe(before + 30);
    expect(proposal.status).toBe('accepted');
  });
  it('invalid nested commands expire without rewards or loyalty penalty', () => {
    const { state, proposal, cmd } = proposalState(),
      before = state.officers[OFF_ALPHA_BUSHO]!.loyalty,
      events: GameEvent[] = [],
      apply = vi.fn();
    createApplyResolveProposal({ validate: () => ({ ok: false, reasonKey: 'test' }), apply })(
      state,
      cmd,
      (e) => events.push(e),
    );
    expect(apply).not.toHaveBeenCalled();
    expect(proposal.status).toBe('expired');
    expect(state.officers[OFF_ALPHA_BUSHO]!.loyalty).toBe(before);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'proposal.expired', reason: 'invalidated' }),
    );
  });
  it('rejects nested recursion and foreign payloads, and outer validation is pure', () => {
    const { state, proposal, cmd } = proposalState(),
      before = structuredClone(state);
    expect(validateResolveProposal(state, cmd).ok).toBe(true);
    expect(state).toEqual(before);
    proposal.command = { ...cmd };
    expect(validateResolveProposal(state, cmd).ok).toBe(false);
    proposal.command = {
      type: 'rewardOfficer',
      clanId: CLAN_BETA,
      officerId: OFF_BETA_BUSHO,
      tier: 'small',
    };
    expect(validateResolveProposal(state, cmd).ok).toBe(false);
    expect(validateResolveProposal(state, { ...cmd, clanId: CLAN_BETA }).ok).toBe(false);
  });
  it('reject, timeout and invalid proposer have distinct penalties and next-month cleanup', () => {
    const { state, proposal, cmd } = proposalState(),
      before = state.officers[OFF_ALPHA_BUSHO]!.loyalty;
    createApplyResolveProposal({ validate: () => ({ ok: true }), apply: () => {} })(
      state,
      { ...cmd, accept: false },
      () => {},
    );
    expect(state.officers[OFF_ALPHA_BUSHO]!.loyalty).toBe(before - 2);
    state.time.day += 30;
    expect(proposalsSystem(state)).toEqual([]);
    expect(state.proposals[proposal.id]).toBeUndefined();
    const timeout = proposalState();
    timeout.state.time.day = timeout.proposal.expiresDay;
    expect(proposalsSystem(timeout.state)[0]).toMatchObject({
      type: 'proposal.expired',
      reason: 'timeout',
    });
    const invalid = proposalState();
    invalid.state.officers[OFF_ALPHA_BUSHO]!.status = 'ronin';
    expect(proposalsSystem(invalid.state)[0]).toMatchObject({ reason: 'invalidated' });
  });
  it('enforces one proposal per officer per month and only player/proper adult candidates', () => {
    const { state, candidate } = proposalState();
    expect(submitProposal(state, candidate)).toBeNull();
    expect(
      submitProposal(state, { ...candidate, clanId: CLAN_BETA, officerId: OFF_BETA_BUSHO }),
    ).toBeNull();
    state.time.day += 30;
    expect(submitProposal(state, candidate)?.type).toBe('proposal.submitted');
    const id = 'prop.999999' as ProposalId;
    state.proposals[id] = {
      ...Object.values(state.proposals)[0]!,
      id,
      officerId: 'off.unknown' as OfficerId,
    };
    expect(proposalsSystem(state)).toContainEqual(
      expect.objectContaining({ proposalId: id, reason: 'invalidated' }),
    );
  });
  it('bounds monthly player generation at five regardless of proposer identities', () => {
    const { state, candidate } = proposalState();
    for (let i = 0; i < 5; i++) {
      const id = `off.proposer-${i}` as OfficerId;
      state.officers[id] = { ...structuredClone(state.officers[OFF_ALPHA_BUSHO]!), id };
      const event = submitProposal(state, { ...candidate, officerId: id });
      expect(event === null).toBe(i === 4);
    }
    expect(Object.keys(state.proposals)).toHaveLength(5);
  });
});

describe('M6 lifecycle integration', () => {
  it('runs real s1560 for24months with salary stress, debut/death and invariants', async () => {
    const bundle = await loadS1560Scenario(),
      clanId = 'clan.oda' as ClanId;
    const state = buildGameStateFromScenario(bundle, {
      appVersion: 'm6-officer-test',
      seed: 42,
      playerClanId: clanId,
      difficulty: 'normal',
      startDay: 0,
      regions: ['tokai', 'kinki'],
    });
    const household = Object.values(state.officers).filter(
      (o) =>
        o.clanId === clanId &&
        o.hasComeOfAge &&
        o.status === 'serving' &&
        o.id !== state.clans[clanId]!.leaderId,
    );
    const dying = household[0]!,
      debtor = household[1]!;
    dying.scheduledDeath = { year: 1560, month: 2 };
    debtor.kinship = 'tozama';
    debtor.loyalty = 40;
    const childId = 'off.test-debut' as OfficerId;
    state.officers[childId] = {
      ...structuredClone(debtor),
      id: childId,
      status: 'ronin',
      clanId: null,
      hasComeOfAge: false,
      debutYear: 1561,
      debutClanId: clanId,
      debutCastleId: state.clans[clanId]!.homeCastleId,
      armyId: null,
    };
    const events: GameEvent[] = [];
    for (let day = 0; day < 720; day++) {
      if (day < 90) state.clans[clanId]!.gold = 0;
      events.push(...advanceDay(state, []).events);
      expect(
        validateState(state),
        `day=${day} gamo=${JSON.stringify(state.officers['off.gamo-katahide' as OfficerId])}`,
      ).toEqual([]);
      for (const officer of Object.values(state.officers)) {
        expect(Number.isFinite(officer.loyalty)).toBe(true);
        expect(officer.loyalty).toBeGreaterThanOrEqual(0);
        expect(officer.loyalty).toBeLessThanOrEqual(100);
        expect(
          [
            officer.merit,
            officer.statGrowth.ldr,
            officer.statGrowth.val,
            officer.statGrowth.int,
            officer.statGrowth.pol,
            officer.statExp.ldr,
            officer.statExp.val,
            officer.statExp.int,
            officer.statExp.pol,
          ].every(Number.isFinite),
        ).toBe(true);
      }
    }
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'officer.died', officerId: dying.id, cause: 'age' }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'officer.comingOfAge', officerId: childId }),
    );
    expect(state.officers[childId].hasComeOfAge).toBe(true);
    expect(dying.status).toBe('dead');
  });
});
