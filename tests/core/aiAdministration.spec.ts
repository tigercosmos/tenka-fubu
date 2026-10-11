import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { FACILITY_DEFS } from '../../src/core/facilities';
import { POLICY_DEFS } from '../../src/core/policies';
import { monthlyGoldIncome, monthlyGoldIncomeForCastles } from '../../src/core/domestic';
import type { CorpsId } from '../../src/core/state/ids';
import { splitCorpsIncome } from '../../src/core/systems/corps';
import { validateCommand } from '../../src/core/commands/validate';
import type { Command } from '../../src/core/commands/types';
import type { AiSink } from '../../src/core/systems/ai/types';
import {
  FACILITY_TAGS,
  POLICY_TAGS,
  rankFacilities,
  rankPolicies,
} from '../../src/core/systems/ai/domesticMetadata';
import {
  foodReserve,
  runDomesticCouncil,
  runDiplomacyCouncil,
} from '../../src/core/systems/ai/council';
import { generateProposalCandidates } from '../../src/core/systems/ai/proposalGen';
import { pickDevFocus, updateStewardFocuses } from '../../src/core/systems/ai/stewardAi';
import { proposalOfficerCooldownKey } from '../../src/core/systems/proposals';
import { runDelegation } from '../../src/core/systems/ai/delegation';
import { ensureDiplomacyRow, adjustTrust } from '../../src/core/systems/diplomacyCommon';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CLAN_ALPHA,
  CLAN_BETA,
  DIST_A1X,
  OFF_ALPHA_BUSHO,
  OFF_ALPHA_TAISHO,
  OFF_BETA_BUSHO,
  CASTLE_B1,
  PERSONA_DEFAULT,
} from '../fixtures/tiny';

function harness(state: ReturnType<typeof buildTinyState>) {
  const commands: Command[] = [];
  const sink: AiSink = {
    enqueue(command, authority) {
      const result = validateCommand(state, command, authority);
      if (result.ok) commands.push(command);
      return result;
    },
    record() {},
  };
  return { sink, commands };
}
const scope = {
  clanId: CLAN_ALPHA,
  corpsId: null,
  castleIds: [CASTLE_A1, CASTLE_A2],
  targetNodeId: null,
};

describe('M7 administration and proposal decisions', () => {
  it('covers every catalogue ID and preserves facility table order within priority tags', () => {
    expect(FACILITY_DEFS.every((d) => FACILITY_TAGS[d.id])).toBe(true);
    expect(POLICY_DEFS.every((d) => POLICY_TAGS[d.id])).toBe(true);
    expect(Object.keys(FACILITY_TAGS)).toHaveLength(FACILITY_DEFS.length);
    expect(Object.keys(POLICY_TAGS)).toHaveLength(POLICY_DEFS.length);
    expect(
      rankFacilities(true)
        .slice(0, 2)
        .map((d) => d.id),
    ).toEqual(['fac.toride', 'fac.jokaku']);
    expect(rankFacilities(false)[0]?.id).toBe('fac.ichi');
    expect(
      rankPolicies({
        aggression: 10,
        development: 20,
        diplomacy: 100,
        loyalty: 50,
        ambition: 50,
      })[0]?.id,
    ).toBe('pol.enkokinko');
  });
  it('never changes real gameplay or RNG while selecting domestic orders', () => {
    const state = buildTinyState();
    state.meta.playerClanId = CLAN_BETA;
    state.clans[CLAN_ALPHA]!.gold = 10_000;
    state.castles[CASTLE_A1]!.food = 0;
    state.castles[CASTLE_A2]!.food = 20_000;
    state.officers[OFF_ALPHA_BUSHO]!.loyalty = 20;
    const before = JSON.stringify(state);
    const { sink, commands } = harness(state);
    runDomesticCouncil(state, scope, sink);
    expect(JSON.stringify(state)).toBe(before);
    expect(commands.some((c) => c.type === 'transport')).toBe(true);
    expect(commands.every((c) => validateCommand(state, c).ok)).toBe(true);
    const order = commands.map((c) => c.type);
    expect(order.indexOf('transport')).toBeLessThan(order.indexOf('rewardOfficer'));
    expect(order.indexOf('rewardOfficer')).toBeLessThan(order.indexOf('buildFacility'));
  });
  it('preserves the reserve and does not consume a donor food surplus twice', () => {
    const state = buildTinyState();
    state.meta.playerClanId = CLAN_BETA;
    state.clans[CLAN_ALPHA]!.gold = 0;
    state.castles[CASTLE_A1]!.food = 0;
    state.castles[CASTLE_A2]!.food = 2000;
    const { sink, commands } = harness(state);
    runDomesticCouncil(state, scope, sink);
    expect(
      commands.some((c) => ['buildFacility', 'rewardOfficer', 'enactPolicy'].includes(c.type)),
    ).toBe(false);
    const food = commands.reduce(
      (sum, c) => sum + (c.type === 'transport' && c.fromCastleId === CASTLE_A2 ? c.food : 0),
      0,
    );
    expect(food).toBeLessThanOrEqual(
      Math.max(0, 2000 - foodReserve(state, state.castles[CASTLE_A2]!)),
    );
  });
  it('steward gap tie and security gate are deterministic without direct mutation', () => {
    const state = buildTinyState(),
      district = state.districts[DIST_A1X]!;
    district.publicOrder = BAL.aiStewardSecurityFloor - 1;
    district.population = 0;
    district.kokudaka = 0;
    district.commerce = 0;
    expect(pickDevFocus(district)).toBe('agri');
    district.stewardId = OFF_ALPHA_BUSHO;
    district.developFocus = 'commerce';
    updateStewardFocuses(state);
    expect(district.developFocus).toBe('commerce');
  });
  it('generates genuinely valid proposals and honors persistent officer cooldown', () => {
    const state = buildTinyState(),
      officer = state.officers[OFF_ALPHA_BUSHO]!;
    officer.pol = 100;
    officer.int = 10;
    officer.ldr = 10;
    officer.val = 10;
    const district = state.districts[DIST_A1X]!;
    district.developFocus = 'commerce';
    district.kokudaka = 0;
    district.commerce = district.commerceCap;
    const before = JSON.stringify(state);
    const candidates = generateProposalCandidates(state);
    expect(candidates.some((c) => c.officerId === officer.id)).toBe(true);
    expect(candidates.length).toBeLessThanOrEqual(BAL.proposalTopK);
    expect(
      candidates.every((c) => c.clanId === CLAN_ALPHA && validateCommand(state, c.command).ok),
    ).toBe(true);
    expect(JSON.stringify(state)).toBe(before);
    state.events.cooldownUntil[proposalOfficerCooldownKey(officer.id)] = state.time.day + 1;
    expect(generateProposalCandidates(state).some((c) => c.officerId === officer.id)).toBe(false);
  });
  it('never attempts to break a ceasefire even with maximally disloyal persona', () => {
    const state = buildTinyState();
    state.meta.playerClanId = CLAN_BETA;
    state.ai.personas[PERSONA_DEFAULT]!.loyalty = 0;
    state.ai.clans[CLAN_ALPHA]!.threatCache = {
      computedDay: state.time.day,
      totalThreat: 2,
      entries: [
        {
          enemyClanId: CLAN_BETA,
          borderPowerEnemy: 100,
          borderPowerOurs: 1000,
          relationFactor: 0.6,
          threat: 2,
          threatenedCastleIds: [CASTLE_A1],
        },
      ],
    };
    const { sink, commands } = harness(state);
    runDiplomacyCouncil(state, CLAN_ALPHA, sink);
    expect(commands.some((c) => c.type === 'breakPact' && c.kind === 'ceasefire')).toBe(false);
  });
  it('delegated monthly administration uses castle authority and leaves direct castle controls untouched', () => {
    const state = buildTinyState();
    state.castles[CASTLE_A2]!.directControl = false;
    state.castles[CASTLE_A2]!.food = 0;
    state.castles[CASTLE_A1]!.food = 20_000;
    state.clans[CLAN_ALPHA]!.gold = 10_000;
    const { sink, commands } = harness(state);
    const before = JSON.stringify(state);
    runDelegation(state, sink);
    expect(JSON.stringify(state)).toBe(before);
    expect(
      commands.some(
        (c) => c.type === 'transport' && c.fromCastleId === CASTLE_A1 && c.toCastleId === CASTLE_A2,
      ),
    ).toBe(true);
    expect(commands.some((c) => c.type === 'buildFacility' && c.castleId === CASTLE_A2)).toBe(true);
    expect(commands.some((c) => c.type === 'setConscriptPolicy' && c.castleId === CASTLE_A1)).toBe(
      false,
    );
    expect(
      commands.some((c) =>
        ['startPlot', 'enactPolicy', 'rewardOfficer', 'proposePact'].includes(c.type),
      ),
    ).toBe(false);
    state.time.dayOfMonth = 2;
    const count = commands.length;
    runDelegation(state, sink);
    expect(commands).toHaveLength(count);
  });
  it('selects fear diplomacy work then a validated alliance when trust is sufficient', () => {
    const state = buildTinyState();
    state.meta.playerClanId = CLAN_BETA;
    state.ai.clans[CLAN_ALPHA]!.threatCache = {
      computedDay: state.time.day,
      totalThreat: 2,
      entries: [
        {
          enemyClanId: CLAN_BETA,
          borderPowerEnemy: 1000,
          borderPowerOurs: 500,
          relationFactor: 1,
          threat: 2,
          threatenedCastleIds: [CASTLE_A1],
        },
      ],
    };
    const first = harness(state);
    runDiplomacyCouncil(state, CLAN_ALPHA, first.sink);
    expect(first.commands.some((c) => c.type === 'startDiploWork' && c.target === CLAN_BETA)).toBe(
      true,
    );
    ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA);
    adjustTrust(state, CLAN_ALPHA, CLAN_BETA, 100);
    const second = harness(state);
    runDiplomacyCouncil(state, CLAN_ALPHA, second.sink);
    expect(
      second.commands.some((c) => c.type === 'proposePact' && c.kind === 'proposeAlliance'),
    ).toBe(true);
  });
  it('intelligence proposals select legal poaching then diplomatic fallback', () => {
    const state = buildTinyState(),
      officer = state.officers[OFF_ALPHA_BUSHO]!;
    officer.int = 110;
    officer.pol = 10;
    officer.ldr = 10;
    officer.val = 10;
    state.castles[CASTLE_B1]!.lordId = OFF_BETA_BUSHO;
    state.officers[OFF_BETA_BUSHO]!.loyalty = 20;
    state.ai.clans[CLAN_ALPHA]!.threatCache = {
      computedDay: state.time.day,
      totalThreat: 2,
      entries: [
        {
          enemyClanId: CLAN_BETA,
          borderPowerEnemy: 1000,
          borderPowerOurs: 500,
          relationFactor: 1,
          threat: 2,
          threatenedCastleIds: [CASTLE_A1],
        },
      ],
    };
    expect(generateProposalCandidates(state).find((c) => c.officerId === officer.id)?.kind).toBe(
      'plot',
    );
    state.officers[OFF_BETA_BUSHO]!.loyalty = 100;
    // Friendly relation forbids every plot, while diplomacy work remains legal.
    ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA).pacts.push({
      kind: 'alliance',
      startDay: state.time.day,
      endDay: state.time.day + 300,
      vassalClanId: null,
    });
    expect(generateProposalCandidates(state).find((c) => c.officerId === officer.id)?.kind).toBe(
      'diplomacy',
    );
  });
  it('military proposals originate at the proposing officer castle and filter rank/adulthood', () => {
    const state = buildTinyState(),
      officer = state.officers[OFF_ALPHA_TAISHO]!;
    officer.ldr = 110;
    officer.pol = 10;
    officer.int = 10;
    officer.val = 10;
    state.castles[CASTLE_A2]!.soldiers = 3000;
    state.castles[CASTLE_A2]!.food = 20_000;
    state.castles[CASTLE_B1]!.soldiers = 100;
    const candidate = generateProposalCandidates(state).find((c) => c.officerId === officer.id);
    expect(candidate?.kind).toBe('march');
    expect(candidate?.command.type === 'march' && candidate.command.originCastleId).toBe(CASTLE_A2);
    officer.hasComeOfAge = false;
    expect(generateProposalCandidates(state).some((c) => c.officerId === officer.id)).toBe(false);
    officer.hasComeOfAge = true;
    officer.rank = 'kumigashira';
    expect(generateProposalCandidates(state).some((c) => c.officerId === officer.id)).toBe(false);
  });
  it('political proposals fall back to build when development is unchanged and enforce the exact stat threshold', () => {
    const state = buildTinyState(),
      officer = state.officers[OFF_ALPHA_BUSHO]!;
    officer.pol = 100;
    officer.int = 10;
    officer.ldr = 10;
    officer.val = 10;
    officer.traits = [];
    for (const district of Object.values(state.districts).filter(
      (d) => d.castleId === officer.locationCastleId,
    ))
      district.developFocus = pickDevFocus(district);
    state.clans[CLAN_ALPHA]!.gold = 10000;
    const candidate = generateProposalCandidates(state).find((c) => c.officerId === officer.id);
    expect(candidate?.kind).toBe('facility');
    expect(candidate && validateCommand(state, candidate.command).ok).toBe(true);
    officer.pol = BAL.proposalStatThreshold - 1;
    expect(generateProposalCandidates(state).some((c) => c.officerId === officer.id)).toBe(false);
    officer.pol = BAL.proposalStatThreshold;
    expect(generateProposalCandidates(state).some((c) => c.officerId === officer.id)).toBe(true);
  });
  it('build allocation honors the exact half-excess budget boundary', () => {
    const state = buildTinyState();
    state.meta.playerClanId = CLAN_BETA;
    const reserve = monthlyGoldIncome(state, CLAN_ALPHA) * BAL.aiGoldReserveMonths;
    for (const officer of Object.values(state.officers)) officer.loyalty = 100;
    state.clans[CLAN_ALPHA]!.gold = reserve + 399;
    const first = harness(state);
    runDomesticCouncil(state, scope, first.sink, { policies: false });
    expect(first.commands.some((c) => c.type === 'buildFacility')).toBe(false);
    state.clans[CLAN_ALPHA]!.gold = reserve + 400;
    const second = harness(state);
    runDomesticCouncil(state, scope, second.sink, { policies: false });
    const builds = second.commands.filter((c) => c.type === 'buildFacility');
    expect(builds).toHaveLength(1);
    expect(builds[0]?.facilityTypeId).toBe('fac.ichi');
  });
  it('TopK is stable on score ties and no proposer receives multiple candidates', () => {
    const state = buildTinyState();
    state.clans[CLAN_ALPHA]!.gold = 10000;
    const template = Object.values(state.officers).find(
      (officer) =>
        officer.clanId === CLAN_ALPHA && officer.id !== state.clans[CLAN_ALPHA]!.leaderId,
    )!;
    for (const suffix of ['proposal-extra-a', 'proposal-extra-b']) {
      const id = suffix as typeof template.id;
      state.officers[id] = { ...structuredClone(template), id };
    }
    for (const officer of Object.values(state.officers).filter((o) => o.clanId === CLAN_ALPHA)) {
      officer.pol = 100;
      officer.int = 10;
      officer.ldr = 10;
      officer.val = 10;
      officer.traits = [];
    }
    for (const district of Object.values(state.districts))
      district.developFocus = pickDevFocus(district);
    const candidates = generateProposalCandidates(state);
    expect(candidates).toHaveLength(3);
    expect(candidates.map((c) => c.officerId)).toEqual(
      [...candidates.map((c) => c.officerId)].sort(),
    );
    expect(new Set(candidates.map((c) => c.officerId)).size).toBe(candidates.length);
  });
  it('corps construction budget uses its retained regional income and wallet, not the clan treasury', () => {
    const state = buildTinyState(),
      corpsId = 'corps.alpha-test' as CorpsId;
    state.corps[corpsId] = {
      id: corpsId,
      clanId: CLAN_ALPHA,
      corpsLeaderId: OFF_ALPHA_BUSHO,
      directive: 'develop',
      targetNodeId: null,
      gold: 0,
      createdDay: state.time.day,
    };
    state.officers[OFF_ALPHA_BUSHO]!.rank = 'karo';
    state.castles[CASTLE_A2]!.corpsId = corpsId;
    state.castles[CASTLE_A2]!.directControl = false;
    state.clans[CLAN_ALPHA]!.gold = 0;
    const reserve =
      splitCorpsIncome(monthlyGoldIncomeForCastles(state, [CASTLE_A2])).corpsGold *
      BAL.aiGoldReserveMonths;
    state.corps[corpsId].gold = reserve + 400;
    const { sink, commands } = harness(state);
    runDomesticCouncil(state, { ...scope, corpsId, castleIds: [CASTLE_A2] }, sink, {
      rewards: false,
      policies: false,
    });
    expect(commands.some((c) => c.type === 'buildFacility' && c.castleId === CASTLE_A2)).toBe(true);
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(0);
    state.corps[corpsId].gold = reserve + 399;
    const second = harness(state);
    runDomesticCouncil(state, { ...scope, corpsId, castleIds: [CASTLE_A2] }, second.sink, {
      rewards: false,
      policies: false,
    });
    expect(second.commands.some((c) => c.type === 'buildFacility')).toBe(false);
  });
});
