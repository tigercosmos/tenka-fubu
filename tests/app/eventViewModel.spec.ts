import { describe, expect, it } from 'vitest';
import {
  buildPendingEventModalVM,
  eventConditionReason,
} from '../../src/app/events/eventViewModel';
import { createEventEngine } from '../../src/core/systems/events/engine';
import type { EventDef, EventCondition } from '../../src/core/systems/events/types';
import type { CastleId, EventId } from '../../src/core/state/ids';
import { buildTinyState, CLAN_ALPHA, CLAN_BETA } from '../fixtures/tiny';

const id = 'evt.presentation' as EventId;
function fixture(target: EventDef['target'] = 'fixed') {
  const state = buildTinyState();
  state.events.pendingChoiceEventId = id;
  const def: EventDef = {
    id,
    target,
    kind: 'historical',
    priority: 1,
    ownerCandidates: [CLAN_BETA, CLAN_ALPHA],
    trigger: {
      from: { year: 1560, month: 1, day: 1 },
      to: { year: 1561, month: 1, day: 1 },
      check: 'monthStart',
      hooks: [],
      conditions: [],
      probability: 1,
      once: true,
      cooldownDays: 0,
      cooldownKey: null,
    },
    cutscene: { title: '{clanName}', body: '{clanName}', monClanId: '$clan' },
    effects: [],
    choices: [{ label: '決定', conditions: [], effects: [], aiWeight: 1 }],
  };
  return { state, def, catalog: () => createEventEngine([def], () => undefined) };
}

describe('pending event presentation', () => {
  it('rejects a malformed pending pointer to an informational event without repairing core state', () => {
    const f = fixture();
    f.def.choices = [];
    const before = structuredClone(f.state);
    expect(buildPendingEventModalVM(f.state, f.catalog())).toEqual({
      ok: false,
      reason: 'not-choice-event',
    });
    expect(f.state).toEqual(before);
  });
  it('cannot turn a mandatory pending choice into a resolved informational occurrence', () => {
    const f = fixture();
    expect(buildPendingEventModalVM(f.state, f.catalog(), { resolved: true })).toMatchObject({
      ok: true,
      vm: { requiresChoice: true, choices: [{ label: '決定', enabled: true }] },
    });
  });
  it('uses saved binding, names and watermark without state/RNG mutation', () => {
    const f = fixture('randomDistrict');
    const district = Object.values(f.state.districts)[0]!;
    f.state.events.pendingChoiceBinding = {
      clanId: CLAN_BETA,
      castleId: district.castleId,
      districtId: district.id,
    };
    f.def.cutscene.body = '{clanName}／{castleName}／{districtName}';
    const before = structuredClone(f.state);
    const result = buildPendingEventModalVM(f.state, f.catalog());
    expect(result).toMatchObject({
      ok: true,
      vm: {
        requiresChoice: true,
        monClanId: CLAN_BETA,
        body: `${f.state.clans[CLAN_BETA]!.name}／${f.state.castles[district.castleId]!.name}／${district.name}`,
      },
    });
    expect(f.state).toEqual(before);
  });
  it('recovers fixed legacy binding using engine player preference and all-AI owner ordering', () => {
    const f = fixture();
    expect(buildPendingEventModalVM(f.state, f.catalog())).toMatchObject({
      ok: true,
      vm: { monClanId: CLAN_ALPHA },
    });
    f.state.ai.allAi = true;
    expect(buildPendingEventModalVM(f.state, f.catalog())).toMatchObject({
      ok: true,
      vm: { monClanId: CLAN_BETA },
    });
    f.state.clans[CLAN_BETA]!.alive = false;
    expect(buildPendingEventModalVM(f.state, f.catalog())).toMatchObject({
      ok: true,
      vm: { monClanId: CLAN_ALPHA },
    });
    expect(f.state.events.pendingChoiceBinding).toBeNull();
  });
  it('never reconstructs random or player bindings on restore', () => {
    for (const target of ['player', 'eachClan', 'randomDistrict'] as const) {
      const f = fixture(target);
      expect(buildPendingEventModalVM(f.state, f.catalog())).toEqual({
        ok: false,
        reason: 'missing-binding',
      });
    }
  });
  it('returns explicit unavailable catalog/unknown definition failures, and null without pending', () => {
    const f = fixture();
    expect(buildPendingEventModalVM(f.state, null)).toEqual({
      ok: false,
      reason: 'catalog-unavailable',
    });
    expect(buildPendingEventModalVM(f.state, { getDef: () => undefined })).toEqual({
      ok: false,
      reason: 'unknown-event',
    });
    f.state.events.pendingChoiceEventId = null;
    expect(buildPendingEventModalVM(f.state, null)).toBeNull();
  });
  it('rejects dangling saved binding and unresolved watermark rather than substituting player', () => {
    const f = fixture();
    f.state.events.pendingChoiceBinding = {
      clanId: CLAN_ALPHA,
      castleId: 'missing' as CastleId,
      districtId: null,
    };
    expect(buildPendingEventModalVM(f.state, f.catalog())).toEqual({
      ok: false,
      reason: 'invalid-binding',
    });
    f.state.events.pendingChoiceBinding = { clanId: null, castleId: null, districtId: null };
    expect(buildPendingEventModalVM(f.state, f.catalog())).toEqual({
      ok: false,
      reason: 'invalid-binding',
    });
  });
  it('evaluates conditions with saved binding and passes a raw localized reason only when locked', () => {
    const f = fixture();
    f.def.choices[0]!.conditions = [
      { kind: 'clanGoldAtLeast', clanId: '$clan', value: f.state.clans[CLAN_ALPHA]!.gold + 1 },
    ];
    const catalog = f.catalog();
    expect(buildPendingEventModalVM(f.state, catalog)).toMatchObject({
      ok: true,
      vm: {
        choices: [
          {
            enabled: false,
            hint: `「${f.state.clans[CLAN_ALPHA]!.name}」金至少${(f.state.clans[CLAN_ALPHA]!.gold + 1).toLocaleString('zh-TW')}`,
          },
        ],
      },
    });
    expect(
      buildPendingEventModalVM(f.state, catalog, { conditionReason: () => '金不足' }),
    ).toMatchObject({ ok: true, vm: { choices: [{ enabled: false, hint: '金不足' }] } });
    f.state.clans[CLAN_ALPHA]!.gold += 1;
    expect(buildPendingEventModalVM(f.state, catalog)).toMatchObject({
      ok: true,
      vm: { choices: [{ enabled: true, hint: '' }] },
    });
  });
  it('describes every predicate kind with concrete names/thresholds and recursive logic', () => {
    const f = fixture();
    const castle = Object.values(f.state.castles)[0]!;
    const officer = Object.values(f.state.officers)[0]!;
    const binding = { clanId: CLAN_ALPHA, castleId: castle.id, districtId: null };
    const conditions: EventCondition[] = [
      { kind: 'clanAlive', clanId: '$clan' },
      { kind: 'clanIsPlayer', clanId: '$clan', value: true },
      { kind: 'clanIsPlayer', clanId: '$clan', value: false },
      { kind: 'clanGoldAtLeast', clanId: '$clan', value: 100 },
      { kind: 'prestigeAtLeast', clanId: '$clan', value: 20 },
      { kind: 'castleCountAtLeast', clanId: '$clan', count: 3 },
      { kind: 'kokudakaShareAtLeast', clanId: '$clan', percent: 30 },
      { kind: 'clanOwnsCoastalCastle', clanId: '$clan' },
      { kind: 'ownsProvince', clanId: '$clan', provinceId: castle.provinceId },
      { kind: 'castleOwner', clanId: '$clan', castleId: '$castle' },
      { kind: 'officerAlive', officerId: officer.id },
      { kind: 'officerServes', officerId: officer.id, clanId: '$clan' },
      { kind: 'officerIsLeader', officerId: officer.id, clanId: '$clan' },
      { kind: 'officerInProvinces', officerId: officer.id, provinceIds: [castle.provinceId] },
      { kind: 'atWar', a: '$clan', b: CLAN_BETA },
      { kind: 'pactExists', a: '$clan', b: CLAN_BETA, pact: 'alliance' },
      { kind: 'shogunateExists', value: true },
      { kind: 'shogunateExists', value: false },
      { kind: 'shogunateTitleAtLeast', clanId: '$clan', title: 'kanrei' },
      { kind: 'courtRankAtLeast', clanId: '$clan', rank: 'ju3' },
      { kind: 'flag', key: 'visited', min: 1 },
      { kind: 'eventFired', eventId: id },
      { kind: 'not', cond: { kind: 'clanAlive', clanId: '$clan' } },
      {
        kind: 'any',
        conds: [
          { kind: 'clanAlive', clanId: '$clan' },
          { kind: 'shogunateExists', value: false },
        ],
      },
      { kind: 'any', conds: [] },
    ];
    f.def.cutscene.title = '既定事件';
    const catalog = f.catalog();
    const before = structuredClone(f.state);
    for (const condition of conditions) {
      const reason = eventConditionReason(condition, binding, f.state, catalog);
      expect(reason).toBeTypeOf('string');
      expect(reason).not.toMatch(/⟦|undefined|\{[^{}]+\}/u);
    }
    expect(eventConditionReason(conditions[22]!, binding, f.state, catalog)).toBe(
      `不得符合：「${f.state.clans[CLAN_ALPHA]!.name}」仍存續`,
    );
    expect(eventConditionReason(conditions[23]!, binding, f.state, catalog)).toContain(
      '符合任一條件：',
    );
    expect(f.state).toEqual(before);
  });
  it('fails explicitly when a disabled predicate references a missing name', () => {
    const f = fixture();
    f.def.choices[0]!.conditions = [
      { kind: 'castleOwner', castleId: 'missing' as CastleId, clanId: '$clan' },
    ];
    expect(buildPendingEventModalVM(f.state, f.catalog())).toEqual({
      ok: false,
      reason: 'missing-referenced-name',
    });
  });
  it('requires explicit region/cost metadata and rejects unknown interpolation', () => {
    const f = fixture();
    f.def.cutscene.body = '{regionName}：{cost}';
    const catalog = f.catalog();
    expect(buildPendingEventModalVM(f.state, catalog)).toEqual({
      ok: false,
      reason: 'unsupported-presentation',
      token: 'regionName',
    });
    expect(
      buildPendingEventModalVM(f.state, catalog, {
        presentation: { regionName: '指定地區', cost: 123 },
      }),
    ).toEqual({ ok: false, reason: 'unsupported-presentation', token: 'regionName' });
    f.state.events.pendingChoiceBinding = {
      clanId: CLAN_ALPHA,
      castleId: null,
      districtId: null,
      region: 'kinki',
    };
    expect(
      buildPendingEventModalVM(f.state, catalog, {
        presentation: { regionName: '指定地區', cost: 123 },
      }),
    ).toMatchObject({ ok: true, vm: { body: '近畿：123' } });
    expect(
      buildPendingEventModalVM(f.state, catalog, {
        presentation: { regionName: '指定地區', cost: NaN },
      }),
    ).toEqual({ ok: false, reason: 'unsupported-presentation', token: 'cost' });
    f.def.cutscene.body = '{invented}';
    expect(buildPendingEventModalVM(f.state, f.catalog())).toEqual({
      ok: false,
      reason: 'unsupported-presentation',
      token: 'invented',
    });
  });
});
