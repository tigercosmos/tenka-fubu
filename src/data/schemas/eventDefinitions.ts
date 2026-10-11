import { z } from 'zod';
import { isEventId, type EventId } from '../../core/state/ids';
import type {
  EventChoice,
  EventDef,
  EventTrigger,
  ScenarioDate,
} from '../../core/systems/events/types';
import { zCanonicalEventCondition, zClanRef, zEventFlagKey } from './eventConditions';
import { zCanonicalEffectOp } from './eventEffects';

export const zScenarioDate: z.ZodType<ScenarioDate> = z
  .object({
    year: z.number().finite().int().positive(),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(30),
  })
  .strict();
const dateKey = (date: ScenarioDate) => date.year * 360 + (date.month - 1) * 30 + date.day - 1;
export const zEventTrigger: z.ZodType<EventTrigger> = z
  .object({
    from: zScenarioDate.nullable(),
    to: zScenarioDate.nullable(),
    check: z.enum(['monthStart', 'harvest', 'hook']),
    hooks: z.array(z.enum(['castleFallen', 'clanDestroyed', 'leaderDied', 'battleEnded'])),
    conditions: z.array(zCanonicalEventCondition),
    probability: z.number().finite().min(0).max(1),
    once: z.boolean(),
    cooldownDays: z.number().finite().int().min(0),
    cooldownKey: zEventFlagKey.nullable(),
  })
  .strict()
  .superRefine((trigger, ctx) => {
    if (trigger.from !== null && trigger.to !== null && dateKey(trigger.from) > dateKey(trigger.to))
      ctx.addIssue({ code: 'custom', path: ['to'], message: 'event date window is reversed' });
    if (trigger.check !== 'hook' && trigger.hooks.length > 0)
      ctx.addIssue({
        code: 'custom',
        path: ['hooks'],
        message: 'non-hook checks must not subscribe to hooks',
      });
    if (trigger.check === 'hook' && trigger.hooks.length === 0)
      ctx.addIssue({
        code: 'custom',
        path: ['hooks'],
        message: 'hook check requires a subscription',
      });
    if (trigger.once && trigger.cooldownDays !== 0)
      ctx.addIssue({
        code: 'custom',
        path: ['cooldownDays'],
        message: 'once events have zero cooldown',
      });
  });
// Authored catalog content takes precedence over the presentation length guidelines in plan10.
const narrativeText = z
  .string()
  .refine((value) => value.trim().length > 0, 'text must not be blank');
export const zEventChoice: z.ZodType<EventChoice> = z
  .object({
    label: narrativeText,
    conditions: z.array(zCanonicalEventCondition),
    effects: z.array(zCanonicalEffectOp),
    aiWeight: z.number().finite().int().min(0),
  })
  .strict();
export const zCanonicalEventDef: z.ZodType<EventDef> = z
  .object({
    id: z.custom<EventId>((v: unknown) => typeof v === 'string' && isEventId(v)),
    kind: z.enum(['historical', 'generic']),
    priority: z.number().int().min(0).max(100),
    trigger: zEventTrigger,
    ownerCandidates: z.array(zClanRef),
    target: z.enum(['fixed', 'player', 'eachClan', 'randomDistrict', 'randomRegionClan']),
    cutscene: z
      .object({ title: narrativeText, body: narrativeText, monClanId: zClanRef.nullable() })
      .strict(),
    choices: z.array(zEventChoice),
    effects: z.array(zCanonicalEffectOp),
  })
  .strict()
  .superRefine((def, ctx) => {
    if (def.kind === 'historical' && (def.trigger.from === null || def.trigger.to === null))
      ctx.addIssue({
        code: 'custom',
        path: ['trigger'],
        message: 'historical events require dated endpoints',
      });
    if (def.kind === 'historical' && def.target !== 'fixed')
      ctx.addIssue({
        code: 'custom',
        path: ['target'],
        message: 'historical events use fixed targets',
      });
    if (def.choices.length > 0 && def.ownerCandidates.length === 0)
      ctx.addIssue({
        code: 'custom',
        path: ['ownerCandidates'],
        message: 'choice events need an owner candidate',
      });
  });
export const zCanonicalEventsFile = z
  .object({ version: z.literal(1), events: z.array(zCanonicalEventDef) })
  .strict();
