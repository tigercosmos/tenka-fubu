import { describe, expect, it } from 'vitest';
import { policyUnlocked, validateEnactPolicy } from '../../src/core/commands/domesticCommands';
import { POLICIES } from '../../src/core/policies';
import type { PolicyId } from '../../src/core/state/ids';
import { buildTinyState, CLAN_ALPHA, CLAN_BETA, CASTLE_A1 } from '../fixtures/tiny';
import { createRuntimeEventEngine } from '../../src/core/systems/events/runtime';
import type { EventDef } from '../../src/core/systems/events/types';

describe.each(['pol.nanban', 'pol.kakishuchu'] as const)('merchant policy acceptance %s', (id) => {
  const policyId = id as PolicyId;
  const cmd = { type: 'enactPolicy' as const, clanId: CLAN_ALPHA, policyId };
  const def = POLICIES[policyId]!;
  function fixture() {
    const state = buildTinyState();
    state.clans[CLAN_ALPHA]!.prestige = 0;
    state.clans[CLAN_ALPHA]!.gold = def.upkeepGold;
    state.policies[CLAN_ALPHA]!.active = [];
    for (const castle of Object.values(state.castles)) castle.facilities = [];
    return state;
  }
  it('rejects no flag, rejected/zero flag, fired-only, other-clan and other-policy flags', () => {
    const state = fixture();
    expect(policyUnlocked(state, cmd)).toBe(false);
    state.events.fired[def.unlockEvent!] = state.time.day;
    // Global historical bookkeeping alone is never proof of this clan's acceptance.
    expect(policyUnlocked(state, cmd)).toBe(false);
    expect(validateEnactPolicy(state, cmd).ok).toBe(false);
    state.events.flags[`unlock.${id}.${CLAN_ALPHA}`] = 0;
    state.events.flags[`unlock.${id}.${CLAN_BETA}`] = 1;
    const other = id === 'pol.nanban' ? 'pol.kakishuchu' : 'pol.nanban';
    state.events.flags[`unlock.${other}.${CLAN_ALPHA}`] = 1;
    expect(policyUnlocked(state, cmd)).toBe(false);
    expect(validateEnactPolicy(state, cmd).ok).toBe(false);
  });
  it('uses the canonical flag min:1 predicate: zero/negative reject and values at least one unlock', () => {
    const state = fixture();
    for (const value of [-1, 0, 1, 2]) {
      state.events.flags[`unlock.${id}.${CLAN_ALPHA}`] = value;
      expect(policyUnlocked(state, cmd)).toBe(value >= 1);
    }
  });
  it('acceptance bypasses prestige/facility only, not costs, slots, cooldown or mutual exclusion', () => {
    const state = fixture();
    state.events.flags[`unlock.${id}.${CLAN_ALPHA}`] = 1;
    const before = structuredClone(state);
    expect(policyUnlocked(state, cmd)).toBe(true);
    expect(validateEnactPolicy(state, cmd).ok).toBe(true);
    expect(state).toEqual(before);
    state.clans[CLAN_ALPHA]!.gold = def.upkeepGold - 1;
    expect(validateEnactPolicy(state, cmd).ok).toBe(false);
    state.clans[CLAN_ALPHA]!.gold = def.upkeepGold;
    state.policies[CLAN_ALPHA]!.cooldownUntil[policyId] = state.time.day + 1;
    expect(validateEnactPolicy(state, cmd).ok).toBe(false);
    state.policies[CLAN_ALPHA]!.cooldownUntil[policyId] = state.time.day;
    state.policies[CLAN_ALPHA]!.active = [policyId];
    expect(validateEnactPolicy(state, cmd).ok).toBe(false);
    state.policies[CLAN_ALPHA]!.active = ['pol.rakuichi' as PolicyId];
    expect(validateEnactPolicy(state, cmd).ok).toBe(false);
    if (def.exclusiveWith !== null) {
      state.clans[CLAN_ALPHA]!.prestige = def.unlockPrestige;
      state.policies[CLAN_ALPHA]!.active = [def.exclusiveWith];
      expect(validateEnactPolicy(state, cmd).ok).toBe(false);
    }
  });
  it('preserves the independent prestige AND facility unlock route', () => {
    const state = fixture();
    state.clans[CLAN_ALPHA]!.prestige = def.unlockPrestige;
    expect(policyUnlocked(state, cmd)).toBe(false);
    state.castles[CASTLE_A1]!.facilities.push(def.requiresFacility!);
    expect(validateEnactPolicy(state, cmd).ok).toBe(true);
    state.clans[CLAN_ALPHA]!.prestige -= 1;
    expect(policyUnlocked(state, cmd)).toBe(false);
  });
  it.each([0, 1])(
    'real accepted/refused branch %s produces only the expected local unlock',
    (index) => {
      const state = fixture();
      const eventId = def.unlockEvent!;
      const event: EventDef = {
        id: eventId,
        kind: 'generic',
        priority: 1,
        target: 'eachClan',
        ownerCandidates: ['$clan'],
        trigger: {
          from: { year: 1560, month: 1, day: 1 },
          to: { year: 1561, month: 12, day: 30 },
          check: 'monthStart',
          hooks: [],
          conditions: [],
          probability: 1,
          once: false,
          cooldownDays: 1,
          cooldownKey: null,
        },
        cutscene: { title: '商人', body: '商人', monClanId: '$clan' },
        effects: [],
        // Literal test fixture flags: production template expansion is explicitly not in this slice.
        choices: [
          {
            label: '接受',
            conditions: [],
            aiWeight: 1,
            effects: [{ op: 'setFlag', key: `unlock.${id}.${CLAN_ALPHA}`, value: 1 }],
          },
          { label: '拒絕', conditions: [], aiWeight: 1, effects: [] },
        ],
      };
      state.events.fired[eventId] = state.time.day;
      state.events.pendingChoiceEventId = eventId;
      state.events.pendingChoiceBinding = { clanId: CLAN_ALPHA, castleId: null, districtId: null };
      createRuntimeEventEngine([event]).resolveChoice(
        state,
        { type: 'resolveEventChoice', clanId: CLAN_ALPHA, eventId, choiceIndex: index },
        () => {},
      );
      expect(policyUnlocked(state, cmd)).toBe(index === 0);
      expect(policyUnlocked(state, { ...cmd, clanId: CLAN_BETA })).toBe(false);
    },
  );
});
