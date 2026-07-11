// 歷史事件（Event）zod schema。
// 規格：plan/14-scenario-data.md §4.7（events.json）、plan/10-events-and-victory.md（觸發條件與
// 效果數值定案）。觸發條件與效果為封閉 DSL（10 之事件引擎逐 kind 實作語意）；`text`／
// `choices[].label` 為繁中敘事文字，屬劇本內容資料，不進 i18n（§8-D9）。
import { z } from 'zod';
import { PACT_KIND_VALUES } from '../../core/state/enums';
import { RE, id, zName, int0, pct100 } from './common';

export const zEventCondition = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('clanAlive'), clanId: id(RE.clan) }),
  z.object({ kind: z.literal('clanDead'), clanId: id(RE.clan) }),
  z.object({ kind: z.literal('officerServing'), officerId: id(RE.off) }),
  z.object({ kind: z.literal('officerDead'), officerId: id(RE.off) }),
  z.object({ kind: z.literal('officerLoyaltyBelow'), officerId: id(RE.off), value: pct100 }),
  z.object({ kind: z.literal('castleOwnedBy'), castleId: id(RE.castle), clanId: id(RE.clan) }),
  z.object({
    kind: z.literal('clanCastleCountAtLeast'),
    clanId: id(RE.clan),
    count: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal('clanOwnsNodesInProvince'),
    clanId: id(RE.clan),
    provinceId: id(RE.prov),
    count: z.number().int().positive(),
  }),
  z.object({ kind: z.literal('atWar'), a: id(RE.clan), b: id(RE.clan) }),
  z.object({
    kind: z.literal('pactActive'),
    a: id(RE.clan),
    b: id(RE.clan),
    pact: z.enum(PACT_KIND_VALUES),
  }),
  z.object({ kind: z.literal('eventFired'), eventId: id(RE.evt) }),
  z.object({ kind: z.literal('playerIs'), clanId: id(RE.clan) }),
  z.object({ kind: z.literal('monthlyChance'), pct: z.number().min(0).max(100) }), // rng.event 流
  z.object({
    kind: z.literal('armiesInEnemyTerritory'),
    clanId: id(RE.clan),
    targetClanId: id(RE.clan),
    minSoldiers: int0,
  }),
]);
export type EventConditionData = z.infer<typeof zEventCondition>;

export const zEventEffect = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('officerDies'),
    officerId: id(RE.off),
    cause: z.enum(['age', 'battle', 'execution']),
  }),
  z.object({ kind: z.literal('officerToRonin'), officerId: id(RE.off) }),
  z.object({ kind: z.literal('officerJoinClan'), officerId: id(RE.off), clanId: id(RE.clan) }),
  z.object({ kind: z.literal('transferCastle'), castleId: id(RE.castle), toClanId: id(RE.clan) }),
  z.object({ kind: z.literal('setWar'), a: id(RE.clan), b: id(RE.clan) }), // lastHostileDay=今日
  z.object({
    kind: z.literal('signPact'),
    a: id(RE.clan),
    b: id(RE.clan),
    pact: z.enum(PACT_KIND_VALUES),
    months: z.number().int().positive().nullable(),
    vassalClanId: id(RE.clan).nullable().default(null),
  }),
  z.object({
    kind: z.literal('breakPact'),
    a: id(RE.clan),
    b: id(RE.clan),
    pact: z.enum(PACT_KIND_VALUES),
  }),
  z.object({
    kind: z.literal('sentimentSet'),
    a: id(RE.clan),
    b: id(RE.clan),
    aToB: pct100,
    bToA: pct100,
  }),
  z.object({ kind: z.literal('prestigeAdd'), clanId: id(RE.clan), amount: z.number().int() }),
  z.object({ kind: z.literal('goldAdd'), clanId: id(RE.clan), amount: z.number().int() }),
  z.object({ kind: z.literal('courtFavorAdd'), clanId: id(RE.clan), amount: z.number().int() }),
  z.object({
    kind: z.literal('loyaltyAdd'),
    clanId: id(RE.clan),
    kinOnly: z.boolean(),
    amount: z.number().int(),
  }),
  z.object({ kind: z.literal('clanRename'), clanId: id(RE.clan), name: zName }),
  z.object({ kind: z.literal('routClanArmies'), clanId: id(RE.clan) }), // 全部隊強制潰走歸還
  z.object({ kind: z.literal('shogunateFall') }), // shogunateExists=false
  z.object({ kind: z.literal('unlockFlag'), flag: z.string().min(1) }), // 政策解鎖旗標（05 引用）
  z.object({ kind: z.literal('fireEvent'), eventId: id(RE.evt) }), // 連鎖觸發
]);
export type EventEffectData = z.infer<typeof zEventEffect>;

export const zEvent = z.object({
  id: id(RE.evt),
  name: zName, // '桶狹間之戰'
  once: z.literal(true), // v1.0 全部一生一次（02 §4.16 fired）
  window: z.object({
    // 觸發窗（絕對日；00 §5.1 曆法）
    startDay: int0,
    endDay: int0.nullable(), // null=無期限（條件式事件）
  }),
  conditions: z.array(zEventCondition).min(1), // AND 結合；每月 1 日判定（00 §5.4 步驟 3）
  text: z.string().min(1).max(200), // 事件敘事（繁中）
  choices: z
    .array(
      z.object({
        // 空陣列=無選項自動結算
        label: z.string().min(1).max(30),
        effects: z.array(zEventEffect),
      }),
    )
    .max(3)
    .default([]),
  effects: z.array(zEventEffect).default([]), // 無選項時套用；有選項時忽略
});
export type EventData = z.infer<typeof zEvent>;

export const zEventsFile = z.object({ version: z.literal(1), events: z.array(zEvent) });
export type EventsFileData = z.infer<typeof zEventsFile>;
