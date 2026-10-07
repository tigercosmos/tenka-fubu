import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import type { CommandByType } from '../../src/core/commands/registry';
import type { GameEvent } from '../../src/core/state/events';
import type { ClanId, OfficerId } from '../../src/core/state/ids';
import { canonicalStringify, stateHash } from '../../src/core/state/serialize';
import { validateState } from '../../src/core/state/invariants';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { advanceDay } from '../../src/core/systems/index';
import { diplomacySystem } from '../../src/core/systems/diplomacy';
import { evaluateProposal } from '../../src/core/systems/diplomacyEval';
import {
  adjustSentiment,
  adjustTrust,
  ensureDiplomacyRow,
  getSentiment,
  getTrust,
  hasPact,
} from '../../src/core/systems/diplomacyCommon';
import {
  applyStartDiploWork,
  validateStartDiploWork,
  applyProposePact,
  validateProposePact,
  settleDiplomacyProposal,
  marriageCandidates,
  validateBreakPact,
  applyBreakPact,
} from '../../src/core/commands/diplomacyCommands';
import { DAYS_PER_MONTH } from '../../src/core/systems/time';
import { applyMarch } from '../../src/core/commands/march';
import { militaryMovementSystem } from '../../src/core/systems/military';
import { startFieldCombat, fieldCombatSystem } from '../../src/core/systems/fieldCombat';
import {
  buildTinyState,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_BUSHO,
  OFF_ALPHA_TAISHO,
  OFF_BETA_BUSHO,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
} from '../fixtures/tiny';

const emitNothing = (_event: GameEvent) => {
  void _event;
};
const work = (): CommandByType['startDiploWork'] => ({
  type: 'startDiploWork',
  clanId: CLAN_ALPHA,
  target: CLAN_BETA,
  executorId: OFF_ALPHA_BUSHO,
});
const offer = (): CommandByType['proposePact'] => ({
  type: 'proposePact',
  clanId: CLAN_ALPHA,
  targetClanId: CLAN_BETA,
  kind: 'proposeAlliance',
  reinforceAgainstClanId: null,
});
function prepared() {
  const state = buildTinyState();
  state.time.dayOfMonth = 2;
  state.clans[CLAN_ALPHA]!.gold = 100_000;
  adjustTrust(state, CLAN_ALPHA, CLAN_BETA, 100);
  return state;
}

describe('M6 diplomacy settlement and directional relationships', () => {
  it('keeps validation/evaluation pure and reserves no trust before AI acceptance', () => {
    const state = prepared(),
      cmd = offer();
    adjustSentiment(state, CLAN_BETA, CLAN_ALPHA, 100);
    const before = canonicalStringify(state);
    expect(validateProposePact(state, cmd)).toEqual({ ok: true });
    expect(evaluateProposal(state, CLAN_ALPHA, CLAN_BETA, cmd.kind)).toBeGreaterThanOrEqual(
      BAL.dipAcceptThreshold,
    );
    expect(canonicalStringify(state)).toBe(before);
    applyProposePact(state, cmd, emitNothing);
    expect(getTrust(state, CLAN_ALPHA, CLAN_BETA)).toBe(100);
    expect(hasPact(state, CLAN_ALPHA, CLAN_BETA, 'alliance')).toBe(false);
    const events = diplomacySystem(state);
    expect(getTrust(state, CLAN_ALPHA, CLAN_BETA)).toBe(100 - BAL.trustCostAlliance);
    expect(getTrust(state, CLAN_BETA, CLAN_ALPHA)).toBe(0);
    expect(hasPact(state, CLAN_ALPHA, CLAN_BETA, 'alliance')).toBe(true);
    expect(events.filter((e) => e.type === 'pact.signed')).toHaveLength(1);
    expect(state.diplomacy.pendingProposals).toHaveLength(0);
  });

  it('rechecks resources at acceptance without imposing a refusal cooldown', () => {
    const state = prepared();
    applyProposePact(state, offer(), emitNothing);
    adjustTrust(state, CLAN_ALPHA, CLAN_BETA, -100);
    const events: GameEvent[] = [];
    settleDiplomacyProposal(state, state.diplomacy.pendingProposals[0]!, true, (e) =>
      events.push(e),
    );
    expect(hasPact(state, CLAN_ALPHA, CLAN_BETA, 'alliance')).toBe(false);
    expect(
      ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA).refusalCooldownUntilDay.proposeAlliance,
    ).toBeUndefined();
    expect(events.map((e) => e.type)).toEqual(['diplo.refused']);
  });

  it('uses pair-and-kind refusal cooldown without consuming trust', () => {
    const state = prepared(),
      cmd = offer();
    applyProposePact(state, cmd, emitNothing);
    settleDiplomacyProposal(state, state.diplomacy.pendingProposals[0]!, false, emitNothing);
    expect(getTrust(state, CLAN_ALPHA, CLAN_BETA)).toBe(100);
    expect(validateProposePact(state, cmd).ok).toBe(false);
    state.time.day += BAL.dipRefusalCooldownMonths * DAYS_PER_MONTH;
    expect(validateProposePact(state, cmd).ok).toBe(true);
  });

  it('expires a pact only after its final day, without clearing permanent spouses', () => {
    const state = prepared(),
      row = ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA);
    row.pacts.push({
      kind: 'alliance',
      startDay: state.time.day,
      endDay: state.time.day,
      vassalClanId: null,
    });
    state.officers[OFF_ALPHA_BUSHO]!.spouseId = OFF_BETA_BUSHO;
    state.officers[OFF_BETA_BUSHO]!.spouseId = OFF_ALPHA_BUSHO;
    expect(diplomacySystem(state).some((e) => e.type === 'pact.expired')).toBe(false);
    state.time.day++;
    expect(hasPact(state, CLAN_ALPHA, CLAN_BETA, 'alliance')).toBe(false);
    expect(diplomacySystem(state).filter((e) => e.type === 'pact.expired')).toHaveLength(1);
    expect(row.pacts).toHaveLength(0);
    expect(state.officers[OFF_ALPHA_BUSHO]!.spouseId).toBe(OFF_BETA_BUSHO);
  });

  it('selects youngest eligible kin with ID tie-breaks and snapshots the chosen marriage', () => {
    const state = prepared(),
      row = ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA);
    row.pacts.push({
      kind: 'alliance',
      startDay: state.time.day,
      endDay: null,
      vassalClanId: null,
    });
    for (const id of [OFF_ALPHA_BUSHO, OFF_BETA_BUSHO]) {
      const officer = state.officers[id]!;
      officer.kinship = 'kin';
      officer.birthYear = state.time.year - 20;
      officer.spouseId = null;
    }
    const youngest = 'off.alpha-youngest' as OfficerId;
    state.officers[youngest] = {
      ...structuredClone(state.officers[OFF_ALPHA_BUSHO]!),
      id: youngest,
      birthYear: state.time.year - 18,
    };
    expect(marriageCandidates(state, CLAN_ALPHA)[0]).toBe(youngest);
    const cmd = { ...offer(), kind: 'proposeMarriage' as const };
    applyProposePact(state, cmd, emitNothing);
    expect(state.diplomacy.pendingProposals[0]!.marriageOfficerIds).toEqual([
      youngest,
      OFF_BETA_BUSHO,
    ]);
    const gold = state.clans[CLAN_ALPHA]!.gold;
    settleDiplomacyProposal(state, state.diplomacy.pendingProposals[0]!, true, emitNothing);
    expect(state.officers[youngest].spouseId).toBe(OFF_BETA_BUSHO);
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(gold - BAL.goldCostMarriage);
    const breakCmd = {
      type: 'breakPact' as const,
      clanId: CLAN_ALPHA,
      targetClanId: CLAN_BETA,
      kind: 'marriage' as const,
    };
    expect(validateBreakPact(state, breakCmd).ok).toBe(false);
    state.time.day += BAL.marriageNoBreakMonths * DAYS_PER_MONTH;
    expect(validateBreakPact(state, breakCmd).ok).toBe(true);
    applyBreakPact(state, breakCmd, emitNothing);
    expect(state.officers[youngest].spouseId).toBe(OFF_BETA_BUSHO);
    expect(getTrust(state, CLAN_ALPHA, CLAN_BETA)).toBe(0);
    expect(state.clans[CLAN_ALPHA]!.prestige).toBe(0);
  });

  it('allows the explicit marriage age thirteen without treating it as officer employment', () => {
    const state = prepared(),
      officer = state.officers[OFF_ALPHA_BUSHO]!;
    officer.kinship = 'kin';
    officer.spouseId = null;
    officer.hasComeOfAge = false;
    officer.birthYear = state.time.year - BAL.marriageMinAge;
    expect(marriageCandidates(state, CLAN_ALPHA)).toContain(officer.id);
    officer.birthYear++;
    expect(marriageCandidates(state, CLAN_ALPHA)).not.toContain(officer.id);
  });

  it('does not give an expired alliance the marriage renewal acceptance bonus', () => {
    const state = prepared(),
      baseline = evaluateProposal(state, CLAN_ALPHA, CLAN_BETA, 'proposeMarriage');
    const row = ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA);
    row.pacts.push({
      kind: 'alliance',
      startDay: 0,
      endDay: state.time.day - 1,
      vassalClanId: null,
    });
    expect(evaluateProposal(state, CLAN_ALPHA, CLAN_BETA, 'proposeMarriage')).toBe(baseline);
    row.pacts[0]!.endDay = state.time.day + 1;
    expect(evaluateProposal(state, CLAN_ALPHA, CLAN_BETA, 'proposeMarriage')).toBe(
      baseline + BAL.dipMarriageRenewBonus,
    );
  });

  it('blocks sea passage through ceasefire territory even when the final target is owned', () => {
    const state = prepared();
    applyMarch(
      state,
      {
        type: 'march',
        clanId: CLAN_ALPHA,
        originCastleId: CASTLE_A1,
        leaderId: OFF_ALPHA_BUSHO,
        deputyIds: [],
        soldiers: 200,
        food: 120,
        targetNodeId: CASTLE_B1,
      },
      emitNothing,
    );
    const army = Object.values(state.armies)[0]!;
    const road = Object.values(state.roads)[0]!;
    road.a = CASTLE_A1;
    road.b = CASTLE_B1;
    road.type = 'sea';
    road.baseDays = 1;
    army.path = [CASTLE_A1, CASTLE_B1, CASTLE_A2];
    army.pathCursor = 0;
    army.targetNodeId = CASTLE_A2;
    army.edgeProgressDays = 0;
    army.edgeCostDays = 1;
    army.autoReturn = false;
    ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA).pacts.push({
      kind: 'ceasefire',
      startDay: state.time.day,
      endDay: state.time.day + 30,
      vassalClanId: null,
    });
    expect(militaryMovementSystem(state).some((event) => event.type === 'army.blocked')).toBe(true);
    expect(army.posNodeId).toBe(CASTLE_A1);
    expect(army.edgeProgressDays).toBe(0);
    expect(Object.keys(state.sieges)).toHaveLength(0);
  });

  it('withdraws an entire mixed coalition when one cross-side pair makes peace, without rewards or damage', () => {
    const state = prepared(),
      third = 'clan.third' as ClanId;
    state.clans[third] = {
      ...structuredClone(state.clans[CLAN_ALPHA]!),
      id: third,
      homeCastleId: CASTLE_A2,
      leaderId: OFF_ALPHA_TAISHO,
    };
    state.castles[CASTLE_A2]!.ownerClanId = third;
    state.castles[CASTLE_A2]!.tier = 'main';
    for (const district of Object.values(state.districts))
      if (district.castleId === CASTLE_A2) district.ownerClanId = third;
    state.officers[OFF_ALPHA_TAISHO]!.clanId = third;
    for (const [clanId, castleId, leaderId] of [
      [CLAN_ALPHA, CASTLE_A1, OFF_ALPHA_BUSHO],
      [CLAN_BETA, CASTLE_B1, OFF_BETA_BUSHO],
      [third, CASTLE_A2, OFF_ALPHA_TAISHO],
    ] as const) {
      applyMarch(
        state,
        {
          type: 'march',
          clanId,
          originCastleId: castleId,
          leaderId,
          deputyIds: [],
          soldiers: 200,
          food: 120,
          targetNodeId: clanId === CLAN_BETA ? CASTLE_A1 : CASTLE_B1,
        },
        emitNothing,
      );
    }
    const armies = Object.values(state.armies),
      a = armies.find((army) => army.clanId === CLAN_ALPHA)!,
      b = armies.find((army) => army.clanId === CLAN_BETA)!,
      c = armies.find((army) => army.clanId === third)!;
    for (const army of armies) {
      army.posNodeId = CASTLE_B1;
      army.path = [CASTLE_B1];
      army.pathCursor = 0;
      army.edgeProgressDays = 0;
    }
    startFieldCombat(state, CASTLE_B1, [a.id, c.id], [b.id]);
    const troops = armies.map((army) => army.soldiers),
      morale = armies.map((army) => army.morale),
      rng = structuredClone(state.rng),
      prestige = Object.values(state.clans).map((clan) => clan.prestige);
    ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA).pacts.push({
      kind: 'ceasefire',
      startDay: state.time.day,
      endDay: state.time.day + 30,
      vassalClanId: null,
    });
    const events = [...diplomacySystem(state), ...fieldCombatSystem(state)];
    expect(Object.keys(state.fieldCombats)).toHaveLength(0);
    expect(armies.map((army) => army.soldiers)).toEqual(troops);
    expect(armies.map((army) => army.morale)).toEqual(morale);
    expect(Object.values(state.clans).map((clan) => clan.prestige)).toEqual(prestige);
    expect(state.rng).toEqual(rng);
    expect(events.some((event) => event.type === 'battle.ended')).toBe(false);
  });

  it('applies each monthly pair sentiment update exactly once in both directions', () => {
    const state = prepared(),
      row = ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA);
    row.lastHostileDay = state.time.day;
    adjustSentiment(state, CLAN_ALPHA, CLAN_BETA, 10);
    adjustSentiment(state, CLAN_BETA, CLAN_ALPHA, 10);
    state.time.dayOfMonth = 1;
    diplomacySystem(state);
    expect(getSentiment(state, CLAN_ALPHA, CLAN_BETA)).toBe(
      10 + BAL.sentimentAtWarMonthly - BAL.sentimentDriftMonthly,
    );
    expect(getSentiment(state, CLAN_BETA, CLAN_ALPHA)).toBe(7);
  });

  it('rejects underage/busy envoys and earns canonical trust over ten monthly settlements', () => {
    const state = prepared(),
      officer = state.officers[OFF_ALPHA_BUSHO]!;
    officer.hasComeOfAge = false;
    expect(validateStartDiploWork(state, work()).ok).toBe(false);
    officer.hasComeOfAge = true;
    officer.pol = 100;
    officer.traits = [];
    officer.birthYear = state.time.year - 25;
    adjustTrust(state, CLAN_ALPHA, CLAN_BETA, -100);
    applyStartDiploWork(state, work());
    expect(validateStartDiploWork(state, { ...work(), target: 'court' })).toMatchObject({
      ok: false,
      reasonKey: 'cmd.reject.officerBusy',
    });
    const gold = state.clans[CLAN_ALPHA]!.gold;
    for (let month = 0; month < 10; month++) {
      state.time.dayOfMonth = 1;
      diplomacySystem(state);
      state.time.day += DAYS_PER_MONTH;
    }
    expect(getTrust(state, CLAN_ALPHA, CLAN_BETA)).toBe(60);
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(gold - 10 * BAL.diplomacyWorkMonthlyCost);
  });

  it('records reinforcement acceptance directionally without creating a fictitious pact', () => {
    const state = prepared(),
      third = 'clan.third' as ClanId;
    state.clans[third] = { ...structuredClone(state.clans[CLAN_BETA]!), id: third };
    const row = ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA);
    row.pacts.push({
      kind: 'alliance',
      startDay: state.time.day,
      endDay: null,
      vassalClanId: null,
    });
    const cmd = { ...offer(), kind: 'requestReinforce' as const, reinforceAgainstClanId: third };
    expect(validateProposePact(state, cmd).ok).toBe(true);
    applyProposePact(state, cmd, emitNothing);
    const events: GameEvent[] = [];
    settleDiplomacyProposal(state, state.diplomacy.pendingProposals[0]!, true, (e) =>
      events.push(e),
    );
    expect(row.pacts.map((p) => p.kind)).toEqual(['alliance']);
    expect(row.lastReinforceRequestDayAtoB).toBe(state.time.day);
    expect(row.lastReinforceRequestDayBtoA).toBeNull();
    expect(events.map((e) => e.type)).toEqual(['diplo.reinforceAgreed']);
    expect(validateProposePact(state, cmd).ok).toBe(false);
  });

  it('replays 1800 safe days identically, including a midpoint save/load and monthly invariants', () => {
    const a = buildTinyState();
    a.ai.clans = {};
    for (const clan of Object.values(a.clans)) clan.gold = 1_000_000;
    for (const officer of Object.values(a.officers)) {
      officer.loyalty = 100;
      officer.deathYear = 1700;
      officer.scheduledDeath = { year: 1700, month: 1 };
    }
    let b = structuredClone(a);
    for (let day = 0; day < 1800; day++) {
      const queue = day === 0 ? [{ seq: 1, issuedDay: a.time.day, command: work() }] : [];
      const left = advanceDay(a, queue),
        right = advanceDay(b, queue);
      expect(right.events).toEqual(left.events);
      if (a.time.dayOfMonth === 1) {
        expect(validateState(a)).toEqual([]);
        expect(stateHash(b)).toBe(stateHash(a));
      }
      if (day === 899) {
        const loaded = decodeSave(encodeSave(b, 0));
        expect(loaded.ok).toBe(true);
        if (loaded.ok) b = loaded.saveFile.state;
      }
    }
    expect(a.time.day).toBe(buildTinyState().time.day + 1800);
    expect(a.meta.gameOver).toBeNull();
    expect(Object.keys(a.armies)).toHaveLength(0);
    expect(stateHash(b)).toBe(stateHash(a));
    expect(getTrust(a, CLAN_ALPHA, CLAN_BETA)).toBe(BAL.trustMax);
  }, 20_000);
});
