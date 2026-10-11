import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import eventsJson from '../../src/data/scenarios/s1560/events.json';
import { zCanonicalEventsFile } from '../../src/data/schemas/eventDefinitions';
import { createRuntimeEventEngine } from '../../src/core/systems/events/runtime';
import type { EffectOp, EventCondition } from '../../src/core/systems/events/types';

const catalog = {
  events: zCanonicalEventsFile
    .parse(eventsJson)
    .events.filter((event) => event.kind === 'historical'),
};
const plan = readFileSync(new URL('../../plan/10-events-and-victory.md', import.meta.url), 'utf8');
const historicalSection = plan.slice(plan.indexOf('### 3.5 '), plan.indexOf('### 3.6 '));
const blocks = historicalSection.split(/(?=#### 事件 \d+｜)/).slice(1);
const expected = [
  ['evt.okehazama', 100, '1560/5/1', '1560/5/30', [1, 0]],
  ['evt.kawanakajima4', 90, '1561/9/1', '1561/10/30', [1, 0]],
  ['evt.kiyosu-domei', 90, '1562/1/1', '1563/12/30', [1, 0]],
  ['evt.yoshiteru-shi', 80, '1565/5/1', '1565/6/30', []],
  ['evt.mino-koryaku', 80, '1560/1/1', '1599/12/30', []],
  ['evt.joraku', 85, '1568/9/1', '1572/12/30', [2, 1]],
  ['evt.kanegasaki', 80, '1570/4/1', '1571/12/30', [1, 1]],
  ['evt.anegawa', 79, '1570/6/1', '1571/12/30', [1, 0]],
  ['evt.hieizan', 78, '1571/9/1', '1572/12/30', [2, 1]],
  ['evt.muromachi-metsubo', 85, '1573/4/1', '1580/12/30', [2, 1]],
  ['evt.nagashino', 80, '1575/5/1', '1576/12/30', [3, 1]],
  ['evt.honnoji', 100, '1582/6/1', '1590/12/30', [1, 0]],
  ['evt.takamoto-soshi', 60, '1563/8/1', '1563/9/30', []],
  ['evt.shingen-byoshi', 60, '1573/4/1', '1573/5/30', []],
  ['evt.kenshin-byoshi', 60, '1578/3/1', '1578/4/30', []],
] as const;

function codes(value: string): string[] {
  return [...value.matchAll(/`([^`]+)`/g)].map((match) => match[1]!);
}
function normalizeDsl(value: string): string {
  return value
    .replace(/BAL\.evtHonnojiOdaCastleMin=25/g, '25')
    .replace(
      /KINAI_PROVINCE_IDS/g,
      '[prov.yamashiro,prov.yamato,prov.kawachi,prov.izumi,prov.settsu]',
    )
    .replace(/clan\./g, '')
    .replace(/months:|vassalClanId:/g, '')
    .replace(/['"\s+]/g, '');
}
function conditionDsl(condition: EventCondition): string {
  if (condition.kind === 'not') return `not(${conditionDsl(condition.cond)})`;
  if (condition.kind === 'any') return `any([${condition.conds.map(conditionDsl).join(',')}])`;
  const args: Record<Exclude<EventCondition['kind'], 'not' | 'any'>, readonly string[]> = {
    clanAlive: ['clanId'],
    clanIsPlayer: ['clanId', 'value'],
    clanGoldAtLeast: ['clanId', 'value'],
    districtPopulationAtLeast: ['districtId', 'value'],
    prestigeAtLeast: ['clanId', 'value'],
    castleCountAtLeast: ['clanId', 'count'],
    kokudakaShareAtLeast: ['clanId', 'percent'],
    clanOwnsCoastalCastle: ['clanId'],
    ownsProvince: ['clanId', 'provinceId'],
    castleOwner: ['castleId', 'clanId'],
    officerAlive: ['officerId'],
    officerServes: ['officerId', 'clanId'],
    officerIsLeader: ['officerId', 'clanId'],
    officerInProvinces: ['officerId', 'provinceIds'],
    atWar: ['a', 'b'],
    pactExists: ['a', 'b', 'pact'],
    shogunateExists: ['value'],
    shogunateTitleAtLeast: ['clanId', 'title'],
    courtRankAtLeast: ['clanId', 'rank'],
    flag: ['key', 'min'],
    eventFired: ['eventId'],
  };
  const fields = condition as unknown as Record<string, unknown>;
  return `${condition.kind}(${args[condition.kind]
    .map((key) =>
      Array.isArray(fields[key]) ? `[${(fields[key] as string[]).join(',')}]` : String(fields[key]),
    )
    .join(',')})`;
}
function effectDsl(effect: EffectOp): string {
  // Explicit argument order is independent of JSON key order and transcription tooling.
  const args: Partial<Record<EffectOp['op'], readonly string[]>> = {
    declareWar: ['a', 'b'],
    killOfficer: ['officerId', 'cause'],
    reduceClanSoldiersPct: ['clanId', 'pct'],
    addClanCastlesMorale: ['clanId', 'amount'],
    addPrestige: ['clanId', 'amount'],
    addMerit: ['officerId', 'amount'],
    setFlag: ['key', 'value'],
    renameOfficer: ['officerId', 'name'],
    renameClan: ['clanId', 'name'],
    addSentiment: ['from', 'to', 'amount'],
    addTrust: ['from', 'to', 'amount'],
    breakPact: ['a', 'b', 'pact'],
    signPact: ['a', 'b', 'pact', 'months', 'vassalClanId'],
    addCourtFavor: ['clanId', 'amount'],
    renameCastle: ['castleId', 'name'],
    addClanLoyalty: ['clanId', 'amount'],
    grantShogunateTitle: ['clanId', 'title'],
    addLoyalty: ['officerId', 'amount'],
    addClanOrder: ['clanId', 'amount'],
    endShogunate: [],
    addGold: ['clanId', 'amount'],
    makeRonin: ['officerId'],
  };
  const keys = args[effect.op];
  if (!keys) throw new Error(`Unlisted historical effect ${effect.op}`);
  if (keys.length === 0) return effect.op;
  const fields = effect as unknown as Record<string, unknown>;
  return `${effect.op}(${keys.map((key) => String(fields[key])).join(',')})`;
}

describe('authored s1560 historical catalog (plan10 §3.5)', () => {
  it('contains exactly fifteen canonical schema-valid fixed historical events', () => {
    expect(catalog.events.map((event) => event.id)).toEqual(expected.map((row) => row[0]));
    expect(new Set(catalog.events.map((event) => event.id)).size).toBe(15);
    expect(blocks).toHaveLength(15);
    for (const event of catalog.events) {
      expect(event).toMatchObject({
        kind: 'historical',
        target: 'fixed',
        trigger: {
          once: true,
          probability: 1,
          cooldownDays: 0,
          cooldownKey: null,
        },
      });
    }
  });

  it.each(expected)(
    '%s preserves its exact dates, priority and choice weights',
    (id, priority, from, to, weights) => {
      const event = catalog.events.find((candidate) => candidate.id === id)!;
      const date = (value: typeof event.trigger.from) => {
        if (value === null) throw new Error('Historical dates must remain bounded');
        return `${value.year}/${value.month}/${value.day}`;
      };
      expect(date(event.trigger.from)).toBe(from);
      expect(date(event.trigger.to)).toBe(to);
      expect(event.priority).toBe(priority);
      expect(event.choices.map((choice) => choice.aiWeight)).toEqual(weights);
      expect(event.trigger.check).toBe(id === 'evt.mino-koryaku' ? 'hook' : 'monthStart');
      expect(event.trigger.hooks).toEqual(id === 'evt.mino-koryaku' ? ['castleFallen'] : []);
    },
  );

  it('transcribes every condition, owner, ordered effect and choice verbatim from canonical tables', () => {
    catalog.events.forEach((event, index) => {
      const block = blocks[index]!;
      const conditionLine = block.match(/\| 條件 \| ([^\n]+)/)![1]!;
      expect(event.trigger.conditions.map(conditionDsl).map(normalizeDsl), event.id).toEqual(
        codes(conditionLine).map(normalizeDsl),
      );
      const owners = block
        .match(/\| ownerCandidates \| `\[([^\]]*)\]`/)![1]!
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
      expect(event.ownerCandidates).toEqual(owners);
      expect(event.cutscene.monClanId).toBe(block.match(/\| monClanId \| `([^`]+)`/)![1]);
      const common = block.match(/\*\*(?:共通效果|效果)\*\*：([\s\S]*?)(?=\n\n)/);
      expect(event.effects.map(effectDsl).map(normalizeDsl), event.id).toEqual(
        common ? codes(common[1]!).map(normalizeDsl) : [],
      );
      const rows = block.split('\n').filter((line) => /^\| [AB] \|/.test(line));
      expect(event.choices).toHaveLength(rows.length);
      event.choices.forEach((choice, choiceIndex) => {
        const cells = rows[choiceIndex]!.split('|')
          .slice(1, -1)
          .map((cell) => cell.trim());
        expect(choice.label).toBe(cells[1]);
        expect(choice.conditions.map(conditionDsl).map(normalizeDsl)).toEqual(
          codes(cells[2]!).map(normalizeDsl),
        );
        expect(choice.effects.map(effectDsl).map(normalizeDsl)).toEqual(
          codes(cells[3]!).map(normalizeDsl),
        );
      });
    });
  });

  it('preserves the supplied full narrative text without inventing or shortening it', () => {
    catalog.events.forEach((event, index) => {
      const narrative = blocks[index]!.match(
        /\*\*文本\*\*（title：`([^`]+)`）：\n「([\s\S]*?)」\n/,
      )!;
      expect(event.cutscene.title).toBe(narrative[1]);
      // Markdown source line wrapping is not an authored in-game line break.
      expect(event.cutscene.body).toBe(narrative[2]!.replace(/\n/g, ''));
    });
  });

  it('retains canonical nationwide references and supports the complete historical catalog', () => {
    const honnoji = catalog.events.find((event) => event.id === 'evt.honnoji')!;
    expect(honnoji.trigger.conditions).toContainEqual({
      kind: 'castleCountAtLeast',
      clanId: 'clan.oda',
      count: 25,
    });
    expect(honnoji.trigger.conditions).toContainEqual({
      kind: 'officerInProvinces',
      officerId: 'off.oda-nobunaga',
      provinceIds: ['prov.yamashiro', 'prov.yamato', 'prov.kawachi', 'prov.izumi', 'prov.settsu'],
    });
    expect(
      catalog.events.find((event) => event.id === 'evt.kawanakajima4')?.ownerCandidates,
    ).toEqual(['clan.takeda', 'clan.nagao']);
    const engine = createRuntimeEventEngine(catalog.events);
    for (const event of catalog.events) expect(engine.getDef(event.id)).toEqual(event);
  });
});
