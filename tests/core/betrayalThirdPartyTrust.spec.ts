import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { applyBreakPact, validateBreakPact } from '../../src/core/commands/diplomacyCommands';
import { applyCommand } from '../../src/core/commands/apply';
import { validateCommand } from '../../src/core/commands/validate';
import type { GameEvent } from '../../src/core/state/events';
import type { ClanId } from '../../src/core/state/ids';
import { validateState } from '../../src/core/state/invariants';
import {
  adjustTrust,
  ensureDiplomacyRow,
  getSentiment,
  getTrust,
} from '../../src/core/systems/diplomacyCommon';
import { applyEventBreakPact } from '../../src/core/systems/events/pactEffects';
import {
  buildTinyState,
  CASTLE_A2,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_TAISHO,
  TINY_SCENARIO,
} from '../fixtures/tiny';

const THIRD = 'clan.third-credit' as ClanId;
function fixture() {
  const scenario = structuredClone(TINY_SCENARIO);
  scenario.clanPersonaIds[THIRD] = scenario.clanPersonaIds[CLAN_ALPHA]!;
  scenario.clans.push({
    ...structuredClone(scenario.clans[0]!),
    id: THIRD,
    name: 'Third clan',
    leaderId: OFF_ALPHA_TAISHO,
    homeCastleId: CASTLE_A2,
    colorIndex: 2,
  });
  const castle = scenario.castles.find((candidate) => candidate.id === CASTLE_A2)!;
  castle.ownerClanId = THIRD;
  castle.tier = 'main';
  for (const district of scenario.districts)
    if (castle.districtIds.includes(district.id)) district.ownerClanId = THIRD;
  const leader = scenario.officers.find((officer) => officer.id === OFF_ALPHA_TAISHO)!;
  leader.clanId = THIRD;
  leader.loyalty = 100;
  const state = buildTinyState(scenario);
  const row = ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA);
  row.pacts.push({
    kind: 'alliance',
    startDay: state.time.day,
    endDay: state.time.day + 1800,
    vassalClanId: null,
  });
  state.clans[CLAN_ALPHA]!.prestige = 300;
  adjustTrust(state, CLAN_ALPHA, CLAN_BETA, 70);
  adjustTrust(state, CLAN_BETA, CLAN_ALPHA, 80);
  adjustTrust(state, CLAN_ALPHA, THIRD, 45);
  expect(validateState(state)).toEqual([]);
  return state;
}
const command = {
  type: 'breakPact' as const,
  clanId: CLAN_ALPHA,
  targetClanId: CLAN_BETA,
  kind: 'alliance' as const,
};

describe('betrayal third-party directed credit penalty', () => {
  it('executes accepted betrayal through the unified command authority without validation mutation', () => {
    const state = fixture();
    adjustTrust(state, THIRD, CLAN_ALPHA, 70);
    const before = structuredClone(state);
    const events: GameEvent[] = [];
    expect(validateCommand(state, command)).toEqual({ ok: true });
    expect(state).toEqual(before);
    applyCommand(state, command, (event) => events.push(event));
    expect(getTrust(state, THIRD, CLAN_ALPHA)).toBe(50);
    expect(getTrust(before, THIRD, CLAN_ALPHA) - getTrust(state, THIRD, CLAN_ALPHA)).toBe(20);
    expect(getTrust(state, CLAN_ALPHA, THIRD)).toBe(45);
    expect(events).toEqual([
      {
        type: 'pact.broken',
        day: state.time.day,
        clanIds: [CLAN_ALPHA, CLAN_BETA],
        aClanId: CLAN_ALPHA,
        bClanId: CLAN_BETA,
        kind: 'alliance',
        breakerClanId: CLAN_ALPHA,
      },
    ]);
    expect(state.rng).toEqual(before.rng);
    expect(validateState(state)).toEqual([]);
  });

  it.each([30, 5, 0])('deducts literal twenty credit from %i and clamps at zero', (credit) => {
    const state = fixture();
    adjustTrust(state, THIRD, CLAN_ALPHA, credit);
    const rng = structuredClone(state.rng);
    const events: GameEvent[] = [];
    expect(validateBreakPact(state, command)).toEqual({ ok: true });
    applyBreakPact(state, command, (event) => events.push(event));
    expect(getTrust(state, THIRD, CLAN_ALPHA)).toBe(Math.max(0, credit - 20));
    expect(getTrust(state, CLAN_ALPHA, THIRD)).toBe(45);
    expect(getTrust(state, CLAN_ALPHA, CLAN_BETA)).toBe(0);
    expect(getTrust(state, CLAN_BETA, CLAN_ALPHA)).toBe(80);
    expect(getSentiment(state, THIRD, CLAN_ALPHA)).toBe(-10);
    expect(getSentiment(state, CLAN_BETA, CLAN_ALPHA)).toBe(-60);
    expect(state.clans[CLAN_ALPHA]!.prestige).toBe(150);
    expect(ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA).pacts).toEqual([]);
    expect(events).toEqual([
      expect.objectContaining({ type: 'pact.broken', breakerClanId: CLAN_ALPHA }),
    ]);
    expect(state.rng).toEqual(rng);
    expect(validateState(state)).toEqual([]);
  });

  it('continues excluding extinct third parties from global penalties', () => {
    const state = fixture();
    adjustTrust(state, THIRD, CLAN_ALPHA, 30);
    state.clans[THIRD]!.alive = false;
    state.clans[THIRD]!.destroyedDay = state.time.day;
    const castle = state.castles[CASTLE_A2]!;
    castle.ownerClanId = CLAN_ALPHA;
    castle.tier = 'branch';
    castle.lordId = null;
    for (const id of castle.districtIds) state.districts[id]!.ownerClanId = CLAN_ALPHA;
    const officer = state.officers[OFF_ALPHA_TAISHO]!;
    officer.status = 'ronin';
    officer.clanId = null;
    expect(validateState(state)).toEqual([]);
    applyBreakPact(state, command, () => {});
    expect(getTrust(state, THIRD, CLAN_ALPHA)).toBe(30);
    expect(getSentiment(state, THIRD, CLAN_ALPHA)).toBe(0);
    expect(validateState(state)).toEqual([]);
  });

  it('keeps ceasefire unbreakable without mutating state or RNG during validation', () => {
    const state = fixture();
    ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA).pacts[0]!.kind = 'ceasefire';
    const before = structuredClone(state);
    expect(validateBreakPact(state, { ...command, kind: 'ceasefire' }).ok).toBe(false);
    expect(state).toEqual(before);
  });

  it('does not attribute betrayal penalties to a neutral scripted cancellation', () => {
    const state = fixture();
    adjustTrust(state, THIRD, CLAN_ALPHA, 30);
    const rng = structuredClone(state.rng);
    const events: GameEvent[] = [];
    applyEventBreakPact(
      state,
      { op: 'breakPact', a: CLAN_ALPHA, b: CLAN_BETA, pact: 'alliance' },
      null,
      (event) => events.push(event),
    );
    expect(getTrust(state, THIRD, CLAN_ALPHA)).toBe(30);
    expect(getTrust(state, CLAN_ALPHA, CLAN_BETA)).toBe(70);
    expect(getSentiment(state, THIRD, CLAN_ALPHA)).toBe(0);
    expect(state.clans[CLAN_ALPHA]!.prestige).toBe(300);
    expect(events).toEqual([expect.objectContaining({ type: 'pact.broken', breakerClanId: null })]);
    expect(state.rng).toEqual(rng);
    expect(validateState(state)).toEqual([]);
  });

  it('registers the literal canonical twenty-credit penalty', () => {
    expect(BAL).toHaveProperty('betrayalTrustPenaltyOthers', 20);
  });
});
