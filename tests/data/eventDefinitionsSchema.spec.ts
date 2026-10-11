import { describe, expect, it } from 'vitest';
import type { EffectOp, EventDef, EventTrigger } from '../../src/core/systems/events/types';
import { zCanonicalEffectOp } from '../../src/data/schemas/eventEffects';
import {
  zCanonicalEventDef,
  zCanonicalEventsFile,
  zEventChoice,
  zEventTrigger,
  zScenarioDate,
} from '../../src/data/schemas/eventDefinitions';

const effects = [
  { op: 'addGold', clanId: '$clan', amount: -50 },
  { op: 'addFood', castleId: '$castle', amount: 100 },
  { op: 'addSoldiers', castleId: 'castle.kiyosu', amount: -100 },
  { op: 'reduceClanSoldiersPct', clanId: '$clan', pct: 12.5 },
  { op: 'addPrestige', clanId: '$clan', amount: 20 },
  { op: 'addLoyalty', officerId: 'off.oda-nobunaga', amount: -5 },
  { op: 'addClanLoyalty', clanId: '$clan', amount: 5 },
  { op: 'addMerit', officerId: 'off.oda-nobunaga', amount: 20 },
  { op: 'transferOfficer', officerId: 'off.oda-nobunaga', toClanId: 'clan.imagawa' },
  { op: 'makeRonin', officerId: 'off.oda-nobunaga' },
  { op: 'killOfficer', officerId: 'off.oda-nobunaga', cause: 'execution' },
  { op: 'renameOfficer', officerId: 'off.oda-nobunaga', name: '織田信長' },
  { op: 'addSentiment', from: '$clan', to: 'clan.imagawa', amount: -20 },
  { op: 'addTrust', from: 'clan.oda', to: '$clan', amount: 20 },
  { op: 'declareWar', a: 'clan.oda', b: 'clan.imagawa' },
  {
    op: 'signPact',
    a: '$clan',
    b: 'clan.imagawa',
    pact: 'marriage',
    months: null,
    vassalClanId: null,
  },
  { op: 'breakPact', a: '$clan', b: 'clan.imagawa', pact: 'alliance' },
  { op: 'transferCastle', castleId: '$castle', toClanId: 'clan.oda' },
  { op: 'renameCastle', castleId: '$castle', name: '岐阜' },
  { op: 'renameClan', clanId: '$clan', name: '織田家' },
  { op: 'addCastleMorale', castleId: '$castle', amount: 10 },
  { op: 'addClanCastlesMorale', clanId: '$clan', amount: -10 },
  { op: 'addCastleDurability', castleId: '$castle', amount: -100 },
  { op: 'scaleCastleDurability', castleId: '$castle', pct: 100 },
  { op: 'addDistrictOrder', districtId: '$district', amount: -20 },
  { op: 'addClanOrder', clanId: '$clan', amount: 20 },
  { op: 'scalePopulation', districtId: '$district', pct: 0 },
  { op: 'addCourtFavor', clanId: '$clan', amount: 10 },
  { op: 'grantCourtRank', clanId: '$clan', rank: 'sho2' },
  { op: 'grantShogunateTitle', clanId: '$clan', title: 'shogun' },
  { op: 'endShogunate' },
  { op: 'setFlag', key: 'evt.unlock', value: -1 },
];

const triggerInput = {
  from: { year: 1560, month: 1, day: 1 },
  to: { year: 1600, month: 12, day: 30 },
  check: 'monthStart',
  hooks: [],
  conditions: [],
  probability: 1,
  once: true,
  cooldownDays: 0,
  cooldownKey: null,
};
const definitionInput = {
  id: 'evt.okehazama',
  kind: 'historical',
  priority: 100,
  trigger: triggerInput,
  ownerCandidates: ['clan.oda'],
  target: 'fixed',
  cutscene: { title: '桶狹間', body: '敘事', monClanId: 'clan.oda' },
  choices: [],
  effects,
};

describe('M8 canonical effect schema', () => {
  it.each(effects)('roundtrips $op with core-compatible output', (input) => {
    const parsed: EffectOp = zCanonicalEffectOp.parse(input);
    expect(parsed).toEqual(input);
  });
  it('covers all 32 distinct canonical operations', () => {
    expect(new Set(effects.map((op) => op.op)).size).toBe(32);
  });
  it.each([
    { op: 'addGold', clanId: '$castle', amount: 1 },
    { op: 'addFood', castleId: '$clan', amount: 1 },
    { op: 'addDistrictOrder', districtId: 'castle.kiyosu', amount: 1 },
    { op: 'transferOfficer', officerId: '$officer', toClanId: 'clan.oda' },
    { op: 'transferCastle', castleId: '$castle', toClanId: '$clan' },
    { op: 'killOfficer', officerId: 'off.oda-nobunaga', cause: 'script' },
    { op: 'addGold', clanId: '$clan', amount: Infinity },
    { op: 'addGold', clanId: '$clan', amount: 1.5 },
    { op: 'scalePopulation', districtId: '$district', pct: -1 },
    { op: 'scaleCastleDurability', castleId: '$castle', pct: 101 },
    { op: 'scalePopulation', districtId: '$district', pct: 10, minimumPopulation: 5000 },
    { op: 'reduceClanSoldiersPct', clanId: '$clan', pct: { expression: 'population * .1' } },
    { op: 'setFlag', key: ' ', value: 1 },
    { op: 'setFlag', key: ['unlock.', '$clan'], value: 1 },
    { op: 'endShogunate', unknown: true },
    { op: 'script', code: 'throw new Error()' },
  ])('rejects invalid scalar, reference or unsupported DSL %#', (input) => {
    expect(zCanonicalEffectOp.safeParse(input).success).toBe(false);
  });
  it.each([
    { a: 'clan.oda', b: 'clan.oda', pact: 'alliance', months: 12, vassalClanId: null },
    { a: 'clan.oda', b: 'clan.imagawa', pact: 'ceasefire', months: null, vassalClanId: null },
    { a: 'clan.oda', b: 'clan.imagawa', pact: 'alliance', months: 0, vassalClanId: null },
    { a: 'clan.oda', b: 'clan.imagawa', pact: 'marriage', months: null, vassalClanId: 'clan.oda' },
    { a: 'clan.oda', b: 'clan.imagawa', pact: 'vassal', months: null, vassalClanId: null },
    { a: 'clan.oda', b: 'clan.imagawa', pact: 'vassal', months: null, vassalClanId: 'clan.takeda' },
  ])('rejects pact structural violations %#', (pact) => {
    expect(zCanonicalEffectOp.safeParse({ op: 'signPact', ...pact }).success).toBe(false);
  });
  it('defers concrete membership of a bound vassal endpoint to runtime', () => {
    expect(
      zCanonicalEffectOp.safeParse({
        op: 'signPact',
        a: '$clan',
        b: 'clan.imagawa',
        pact: 'vassal',
        months: null,
        vassalClanId: 'clan.oda',
      }).success,
    ).toBe(true);
  });
});

describe('M8 canonical event definition schema', () => {
  it('roundtrips a full definition without mutating input', () => {
    const before = structuredClone(definitionInput);
    const parsed: EventDef = zCanonicalEventDef.parse(definitionInput);
    expect(parsed).toEqual(before);
    expect(definitionInput).toEqual(before);
  });
  it('supports generic bound choice owners and recursive conditions', () => {
    const input = {
      ...definitionInput,
      kind: 'generic',
      target: 'eachClan',
      trigger: { ...triggerInput, once: false, cooldownDays: 360, cooldownKey: 'harvest' },
      ownerCandidates: ['$clan'],
      choices: [
        {
          label: '獻金',
          conditions: [
            { kind: 'not', cond: { kind: 'clanIsPlayer', clanId: '$clan', value: false } },
          ],
          effects: [effects[0]],
          aiWeight: 0,
        },
      ],
    };
    expect(zCanonicalEventDef.parse(input)).toEqual(input);
  });
  it('treats catalog text length guidelines as presentation warnings, not invalidity', () => {
    expect(
      zCanonicalEventDef.safeParse({
        ...definitionInput,
        cutscene: { ...definitionInput.cutscene, body: '敘'.repeat(250) },
        choices: [{ label: '選'.repeat(20), conditions: [], effects: [], aiWeight: 1 }],
      }).success,
    ).toBe(true);
  });
  it.each([
    { ...triggerInput, from: { year: 1601, month: 1, day: 1 } },
    { ...triggerInput, check: 'hook', hooks: [] },
    { ...triggerInput, check: 'monthStart', hooks: ['leaderDied'] },
    { ...triggerInput, check: 'daily' },
    { ...triggerInput, probability: 1.1 },
    { ...triggerInput, once: true, cooldownDays: 1 },
    { ...triggerInput, cooldownDays: -1 },
    { ...triggerInput, cooldownKey: ' ' },
    { ...triggerInput, hooks: ['officerDied'] },
  ])('rejects inconsistent triggers %#', (input) => {
    expect(zEventTrigger.safeParse(input).success).toBe(false);
  });
  it('accepts all four canonical hooks and inclusive single-day windows', () => {
    const input = {
      ...triggerInput,
      to: triggerInput.from,
      check: 'hook',
      hooks: ['castleFallen', 'clanDestroyed', 'leaderDied', 'battleEnded'],
    };
    const parsed: EventTrigger = zEventTrigger.parse(input);
    expect(parsed).toEqual(input);
  });
  it.each([
    { year: 0, month: 1, day: 1 },
    { year: 1560, month: 13, day: 1 },
    { year: 1560, month: 2, day: 31 },
    { year: 1560.5, month: 1, day: 1 },
  ])('rejects noncanonical 360-day dates %#', (input) => {
    expect(zScenarioDate.safeParse(input).success).toBe(false);
  });
  it.each([
    { ...definitionInput, id: 'legacy.event' },
    { ...definitionInput, priority: 101 },
    { ...definitionInput, target: 'player' },
    {
      ...definitionInput,
      ownerCandidates: [],
      choices: [{ label: '選擇', conditions: [], effects: [], aiWeight: 1 }],
    },
    { ...definitionInput, ownerCandidates: ['$castle'] },
    { ...definitionInput, cutscene: { ...definitionInput.cutscene, body: ' ' } },
    { ...definitionInput, legacy: true },
  ])('rejects invalid definitions %#', (input) => {
    expect(zCanonicalEventDef.safeParse(input).success).toBe(false);
  });
  it.each([
    { label: '', conditions: [], effects: [], aiWeight: 1 },
    { label: '選', conditions: [], effects: [], aiWeight: -1 },
    { label: '選', conditions: [], effects: [], aiWeight: 0.5 },
  ])('rejects malformed choices %#', (input) => {
    expect(zEventChoice.safeParse(input).success).toBe(false);
  });
  it('accepts only the canonical versioned envelope', () => {
    expect(
      zCanonicalEventsFile.parse({ version: 1, events: [definitionInput] }).events,
    ).toHaveLength(1);
    expect(zCanonicalEventsFile.safeParse({ version: 2, events: [] }).success).toBe(false);
    expect(zCanonicalEventsFile.safeParse({ events: [definitionInput] }).success).toBe(false);
  });
});
