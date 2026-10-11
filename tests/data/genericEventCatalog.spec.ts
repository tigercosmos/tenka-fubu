import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import eventsJson from '../../src/data/scenarios/s1560/events.json';
import { zCanonicalEventsFile } from '../../src/data/schemas/eventDefinitions';

const all = zCanonicalEventsFile.parse(eventsJson).events;
const generic = all.filter((event) => event.kind === 'generic');
const plan = readFileSync(new URL('../../plan/10-events-and-victory.md', import.meta.url), 'utf8');
const section = plan.slice(plan.indexOf('### 3.6 '), plan.indexOf('### 3.7 '));
const byId = (id: string) => generic.find((event) => event.id === id)!;

describe('canonical generic event catalog', () => {
  it('appends exactly six records without changing any historical record', () => {
    expect(generic.map((event) => event.id)).toEqual([
      'evt.gen-hosaku',
      'evt.gen-kyosaku',
      'evt.gen-jishin',
      'evt.gen-ekibyo',
      'evt.nanban-visit',
      'evt.teppo-denrai',
    ]);
    const historical = eventsJson.events.filter((event) => event.kind === 'historical');
    expect(historical).toHaveLength(15);
    expect(createHash('sha256').update(JSON.stringify(historical)).digest('hex')).toBe(
      'f49e5e15f6a4772febbe82b808cec5212f54321f6599f916e379cc89c747131f',
    );
    expect(all).toHaveLength(21);
  });

  it('preserves ongoing checks, independent probabilities and canonical cooldowns', () => {
    const expected = [
      ['evt.gen-hosaku', 'harvest', 'eachClan', 0.1, 'gen.harvest', 300, 20],
      ['evt.gen-kyosaku', 'harvest', 'eachClan', 0.1, 'gen.harvest', 300, 19],
      ['evt.gen-jishin', 'monthStart', 'randomRegionClan', 0.01, 'gen.jishin', 720, 18],
      ['evt.gen-ekibyo', 'monthStart', 'randomDistrict', 0.008, 'gen.ekibyo', 360, 17],
      ['evt.nanban-visit', 'monthStart', 'eachClan', 0.05, 'gen.nanban', 360, 16],
      ['evt.teppo-denrai', 'monthStart', 'eachClan', 0.04, 'gen.teppo', 540, 15],
    ];
    expect(
      generic.map((event) => [
        event.id,
        event.trigger.check,
        event.target,
        event.trigger.probability,
        event.trigger.cooldownKey,
        event.trigger.cooldownDays,
        event.priority,
      ]),
    ).toEqual(expected);
    for (const event of generic) {
      expect(event.trigger).toMatchObject({ from: null, to: null, once: false, hooks: [] });
      expect(event.cutscene.monClanId).toBeNull();
    }
    expect([
      BAL.genHosakuChance,
      BAL.genKyosakuChance,
      BAL.genJishinChance,
      BAL.genEkibyoChance,
      BAL.genNanbanChance,
      BAL.genTeppoChance,
    ]).toEqual([0.1, 0.1, 0.01, 0.008, 0.05, 0.04]);
    expect([
      BAL.genHarvestCooldownDays,
      BAL.genJishinCooldownDays,
      BAL.genEkibyoCooldownDays,
      BAL.genNanbanCooldownDays,
      BAL.genTeppoCooldownDays,
    ]).toEqual([300, 720, 360, 360, 540]);
  });

  it('transcribes titles, bodies and option labels directly from plan10', () => {
    const narratives = [...section.matchAll(/（title `([^`]+)`）：「([\s\S]*?)」/g)];
    expect(narratives).toHaveLength(6);
    generic.forEach((event, index) => {
      expect(event.cutscene.title).toBe(narratives[index]![1]);
      expect(event.cutscene.body).toBe(narratives[index]![2]!.replace(/\n\s*/g, ''));
      for (const choice of event.choices) expect(section).toContain(`「${choice.label}」`);
    });
  });

  it('preserves harvest exclusivity and typed year/clan keys', () => {
    const harvest = { prefix: 'harvest', clanId: '$clan', year: 'current' };
    for (const id of ['evt.gen-hosaku', 'evt.gen-kyosaku']) {
      expect(byId(id).trigger.conditions).toEqual([{ kind: 'clanAlive', clanId: '$clan' }]);
      expect(byId(id).ownerCandidates).toEqual([]);
      expect(byId(id).choices).toEqual([]);
    }
    expect(byId('evt.gen-hosaku').effects).toEqual([{ op: 'setFlag', key: harvest, value: 120 }]);
    expect(byId('evt.gen-kyosaku').effects).toEqual([
      { op: 'setFlag', key: harvest, value: 70 },
      { op: 'addClanOrder', clanId: '$clan', amount: -3 },
    ]);
  });

  it('expresses regional earthquake and district epidemic losses without guessed IDs', () => {
    const earthquake = byId('evt.gen-jishin');
    expect(earthquake.trigger.conditions).toEqual([]);
    expect(earthquake.effects).toEqual([
      {
        op: 'affectRegion',
        region: '$region',
        effects: [
          { op: 'scaleCastleDurability', pct: 20 },
          { op: 'addDistrictOrder', amount: -10 },
          { op: 'scalePopulation', pct: 2 },
        ],
      },
    ]);
    const epidemic = byId('evt.gen-ekibyo');
    expect(epidemic.trigger.conditions).toEqual([
      { kind: 'districtPopulationAtLeast', districtId: '$district', value: 5000 },
    ]);
    expect(epidemic.effects).toEqual([
      { op: 'scalePopulation', districtId: '$district', pct: 8 },
      { op: 'addDistrictOrder', districtId: '$district', amount: -8 },
      { op: 'loseCastleSoldiersPct', castleId: '$castle', pct: 10 },
    ]);
    expect([
      BAL.genJishinDurabilityLossPct,
      BAL.genJishinOrderLoss,
      BAL.genJishinPopLossPct,
      BAL.genEkibyoPopLossPct,
      BAL.genEkibyoOrderLoss,
      BAL.genEkibyoSoldierLossPct,
    ]).toEqual([20, 10, 2, 8, 8, 10]);
  });

  it('preserves both merchant tradeoffs, affordability and policy unlock bindings', () => {
    const nanban = byId('evt.nanban-visit');
    const teppo = byId('evt.teppo-denrai');
    for (const event of [nanban, teppo]) {
      expect(event.ownerCandidates).toEqual(['$clan']);
      expect(event.effects).toEqual([]);
    }
    expect(nanban.trigger.conditions).toEqual([{ kind: 'clanOwnsCoastalCastle', clanId: '$clan' }]);
    expect(nanban.choices).toEqual([
      {
        label: '允其通商',
        conditions: [],
        aiWeight: 3,
        effects: [
          { op: 'addGold', clanId: '$clan', amount: 300 },
          { op: 'setFlag', key: { prefix: 'unlock.pol.nanban', clanId: '$clan' }, value: 1 },
        ],
      },
      {
        label: '異教之物，逐之',
        conditions: [],
        aiWeight: 1,
        effects: [{ op: 'addCourtFavor', clanId: '$clan', amount: 5 }],
      },
    ]);
    const affordability = [{ kind: 'clanGoldAtLeast', clanId: '$clan', value: 500 }];
    expect(teppo.trigger.conditions).toEqual(affordability);
    expect(teppo.choices).toEqual([
      {
        label: '重金購下',
        conditions: affordability,
        aiWeight: 2,
        effects: [
          { op: 'addGold', clanId: '$clan', amount: -500 },
          { op: 'setFlag', key: { prefix: 'unlock.pol.kakishuchu', clanId: '$clan' }, value: 1 },
          { op: 'addPrestige', clanId: '$clan', amount: 30 },
        ],
      },
      { label: '送客', conditions: [], effects: [], aiWeight: 1 },
    ]);
    expect([BAL.genNanbanGold, BAL.genTeppoCost]).toEqual([300, 500]);
  });
});
