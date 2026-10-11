import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { applyProposePact } from '../../src/core/commands/diplomacyCommands';
import { validateCommand } from '../../src/core/commands/validate';
import { validateState } from '../../src/core/state/invariants';
import type { CastleId, ClanId, DistrictId, OfficerId, RoadEdgeId } from '../../src/core/state/ids';
import { canonicalStringify } from '../../src/core/state/serialize';
import { applyAwe } from '../../src/core/systems/awe';
import { diplomacySystem } from '../../src/core/systems/diplomacy';
import { clanPower, evaluateProposal } from '../../src/core/systems/diplomacyEval';
import {
  adjustSentiment,
  adjustTrust,
  ensureDiplomacyRow,
  getSentiment,
  getTrust,
  hasPact,
} from '../../src/core/systems/diplomacyCommon';
import { dayToCalendar, DAYS_PER_MONTH } from '../../src/core/systems/time';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  DIST_B1X,
  OFF_BETA_LORD,
} from '../fixtures/tiny';

function withNeighbor() {
  const state = buildTinyState();
  const clanId = 'clan.neighbor' as ClanId;
  const castleId = 'castle.neighbor' as CastleId;
  const districtId = 'dist.neighbor' as DistrictId;
  const officerId = 'off.neighbor-lord' as OfficerId;
  state.clans[clanId] = {
    ...structuredClone(state.clans[CLAN_BETA]!),
    id: clanId,
    leaderId: officerId,
    homeCastleId: castleId,
    colorIndex: 2,
  };
  state.officers[officerId] = {
    ...structuredClone(state.officers[OFF_BETA_LORD]!),
    id: officerId,
    clanId,
    locationCastleId: castleId,
    debutClanId: clanId,
    debutCastleId: castleId,
  };
  state.castles[castleId] = {
    ...structuredClone(state.castles[CASTLE_B1]!),
    id: castleId,
    ownerClanId: clanId,
    lordId: officerId,
    districtIds: [districtId],
    pos: { x: 1800, y: 1500 },
  };
  state.districts[districtId] = {
    ...structuredClone(state.districts[DIST_B1X]!),
    id: districtId,
    castleId,
    ownerClanId: clanId,
    stewardId: null,
  };
  const roadId = 'road.neighbor' as RoadEdgeId;
  state.roads[roadId] = {
    id: roadId,
    a: CASTLE_A1,
    b: castleId,
    type: 'land',
    grade: 1,
    baseDays: 1,
  };
  const localRoadId = 'road.neighbor-local' as RoadEdgeId;
  state.roads[localRoadId] = {
    id: localRoadId,
    a: castleId,
    b: districtId,
    type: 'land',
    grade: 1,
    baseDays: 1,
  };
  expect(validateState(state)).toEqual([]);
  return { state, clanId, roadId };
}

describe('M6-3 hand-derived monthly sentiment and awe acceptance', () => {
  it('matches twelve monthly war/border settlements, directional drift and zero crossings', () => {
    const state = buildTinyState();
    adjustSentiment(state, CLAN_ALPHA, CLAN_BETA, 10);
    adjustSentiment(state, CLAN_BETA, CLAN_ALPHA, -10);
    const row = ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA);
    const rng = structuredClone(state.rng);
    // 08 §3.3: war overrides border tension; -2 then one toward zero.
    // After peace, border tension is -.5 then one toward zero, capped at zero.
    const expected = [
      [7, -11],
      [4, -12],
      [1, -13],
      [0, -14],
      [-1, -15],
      [-2, -16],
      [-1.5, -15.5],
      [-1, -15],
      [-0.5, -14.5],
      [0, -14],
      [0, -13.5],
      [0, -13],
    ];
    for (const [month, values] of expected.entries()) {
      const day = state.time.day + (month === 0 ? 0 : DAYS_PER_MONTH);
      state.time = { day, ...dayToCalendar(day) };
      row.lastHostileDay = month < 6 ? day : null;
      diplomacySystem(state);
      expect(
        [getSentiment(state, CLAN_ALPHA, CLAN_BETA), getSentiment(state, CLAN_BETA, CLAN_ALPHA)],
        `month ${month + 1}`,
      ).toEqual(values);
      expect(validateState(state)).toEqual([]);
    }
    expect(state.rng).toEqual(rng);
  });

  it('adds common-enemy sentiment before drift rather than replacing border tension', () => {
    const { state, clanId } = withNeighbor();
    ensureDiplomacyRow(state, CLAN_ALPHA, clanId).lastHostileDay = state.time.day;
    ensureDiplomacyRow(state, CLAN_BETA, clanId).lastHostileDay = state.time.day;
    adjustSentiment(state, CLAN_ALPHA, CLAN_BETA, 10);
    adjustSentiment(state, CLAN_BETA, CLAN_ALPHA, -10);
    diplomacySystem(state);
    expect(getSentiment(state, CLAN_ALPHA, CLAN_BETA)).toBe(9.5);
    expect(getSentiment(state, CLAN_BETA, CLAN_ALPHA)).toBe(-8.5);
    expect(validateState(state)).toEqual([]);
  });

  it.each(['unprotected', 'allied', 'disconnected'] as const)(
    'large awe applies exact directional -25/-8 with %s neighbor',
    (protection) => {
      const { state, clanId, roadId } = withNeighbor();
      if (protection === 'allied')
        ensureDiplomacyRow(state, CLAN_ALPHA, clanId).pacts.push({
          kind: 'alliance',
          startDay: state.time.day,
          endDay: state.time.day + 12 * DAYS_PER_MONTH,
          vassalClanId: null,
        });
      if (protection === 'disconnected') state.roads[roadId]!.a = CASTLE_B1;
      const rng = structuredClone(state.rng);
      applyAwe(state, 'large', CASTLE_A1, CLAN_ALPHA, CLAN_BETA, 'battle.acceptance');
      expect(getSentiment(state, CLAN_BETA, CLAN_ALPHA)).toBe(-25);
      expect(getSentiment(state, clanId, CLAN_ALPHA)).toBe(protection === 'unprotected' ? -8 : 0);
      expect(getSentiment(state, CLAN_ALPHA, CLAN_BETA)).toBe(0);
      expect(getSentiment(state, CLAN_ALPHA, clanId)).toBe(0);
      expect(state.rng).toEqual(rng);
      expect(validateState(state)).toEqual([]);
    },
  );
});

describe('M6-8 exact acceptance-score threshold', () => {
  it.each([
    { sentiment: 29.875, score: 59.9, accepted: false },
    { sentiment: 30, score: 60, accepted: true },
  ])(
    'settles score $score with accepted=$accepted without evaluation side effects',
    ({ sentiment, score, accepted }) => {
      const state = buildTinyState();
      state.time.day += 1;
      state.time = { day: state.time.day, ...dayToCalendar(state.time.day) };
      // Equal power leaves only .6*60 credit + .8*sentiment, with no special bonus.
      state.clans[CLAN_BETA]!.prestige +=
        (clanPower(state, CLAN_ALPHA) - clanPower(state, CLAN_BETA)) / BAL.powerPrestigeWeight;
      expect(clanPower(state, CLAN_ALPHA)).toBe(clanPower(state, CLAN_BETA));
      adjustTrust(state, CLAN_ALPHA, CLAN_BETA, 60);
      adjustSentiment(state, CLAN_BETA, CLAN_ALPHA, sentiment);
      const command = {
        type: 'proposePact' as const,
        clanId: CLAN_ALPHA,
        targetClanId: CLAN_BETA,
        kind: 'proposeAlliance' as const,
        reinforceAgainstClanId: null,
      };
      expect(validateCommand(state, command)).toEqual({ ok: true });
      expect(validateState(state)).toEqual([]);
      const before = canonicalStringify(state);
      const power = clanPower(state, CLAN_ALPHA);
      for (let repeat = 0; repeat < 10; repeat++) {
        expect(clanPower(state, CLAN_ALPHA)).toBe(power);
        expect(evaluateProposal(state, CLAN_ALPHA, CLAN_BETA, command.kind)).toBeCloseTo(score, 12);
      }
      if (accepted) expect(evaluateProposal(state, CLAN_ALPHA, CLAN_BETA, command.kind)).toBe(60);
      expect(canonicalStringify(state)).toBe(before);
      const rng = structuredClone(state.rng);
      applyProposePact(state, command, () => {});
      const events = diplomacySystem(state);
      expect(hasPact(state, CLAN_ALPHA, CLAN_BETA, 'alliance')).toBe(accepted);
      expect(getTrust(state, CLAN_ALPHA, CLAN_BETA)).toBe(accepted ? 0 : 60);
      expect(
        events.filter((e) => e.type === (accepted ? 'pact.signed' : 'diplo.refused')),
      ).toHaveLength(1);
      expect(state.diplomacy.pendingProposals).toHaveLength(0);
      expect(state.rng).toEqual(rng);
      expect(validateState(state)).toEqual([]);
    },
  );
});
