import type { GameState } from '@core/state/gameState';
import type { EventEngine } from '@core/systems/events/engine';
import {
  evalCond,
  resolveClanRef,
  resolveCastleRef,
  resolveDistrictRef,
} from '@core/systems/events/conditions';
import { resolveEventFlagKey } from '@core/systems/events/flagKeys';
import { t } from '@i18n/zh-TW';
import type { EventBinding, EventCondition, EventDef } from '@core/systems/events/types';
import { REGION_VALUES } from '@core/state/enums';
import type { EventModalVM } from '../../ui/screens/EventModal';

export interface EventPresentationOptions {
  /** Already-resolved occurrences are informational, never another decision. */
  resolved?: boolean;
  /** Explicit catalog presentation data; never inferred from effect amounts or geography. */
  presentation?: { cost?: string | number; regionName?: string };
  /** Returns the raw localized reason (EventModal supplies the choiceLocked wrapper). */
  conditionReason?: (
    condition: EventCondition,
    binding: Readonly<EventBinding>,
    state: Readonly<GameState>,
  ) => string;
}
export type EventViewModelResult =
  | { ok: true; vm: EventModalVM }
  | {
      ok: false;
      reason:
        | 'catalog-unavailable'
        | 'unknown-event'
        | 'not-choice-event'
        | 'missing-binding'
        | 'invalid-binding'
        | 'unsupported-presentation'
        | 'missing-referenced-name'
        | 'missing-condition-reason';
      token?: string;
    };

/** A localized description of the required predicate, not a second evaluator. */
export function eventConditionReason(
  condition: EventCondition,
  binding: Readonly<EventBinding>,
  state: Readonly<GameState>,
  catalog: Pick<EventEngine, 'getDef'>,
): string | null {
  const clan = (ref: Parameters<typeof resolveClanRef>[0]) => {
    const id = resolveClanRef(ref, binding);
    return id === null ? undefined : state.clans[id]?.name;
  };
  const officer = 'officerId' in condition ? state.officers[condition.officerId]?.name : undefined;
  const name = ('clanId' in condition ? clan(condition.clanId) : undefined) ?? '';
  const named = (text: () => string) => (name === '' ? null : text());
  switch (condition.kind) {
    case 'districtPopulationAtLeast': {
      const id = resolveDistrictRef(condition.districtId, binding);
      const district = id === null ? undefined : state.districts[id]?.name;
      return district === undefined
        ? null
        : t('ui.event.condition.population', { district, value: condition.value });
    }
    case 'clanAlive':
      return named(() => t('ui.event.condition.clanAlive', { name }));
    case 'clanIsPlayer':
      return named(() =>
        t(condition.value ? 'ui.event.condition.player' : 'ui.event.condition.nonPlayer', { name }),
      );
    case 'clanGoldAtLeast':
      return named(() => t('ui.event.condition.gold', { name, value: condition.value }));
    case 'prestigeAtLeast':
      return named(() => t('ui.event.condition.prestige', { name, value: condition.value }));
    case 'castleCountAtLeast':
      return named(() => t('ui.event.condition.castleCount', { name, value: condition.count }));
    case 'kokudakaShareAtLeast':
      return named(() => t('ui.event.condition.share', { name, value: condition.percent }));
    case 'clanOwnsCoastalCastle':
      return named(() => t('ui.event.condition.coastal', { name }));
    case 'ownsProvince': {
      const province = state.provinces[condition.provinceId]?.name;
      return province === undefined
        ? null
        : named(() => t('ui.event.condition.province', { name, province }));
    }
    case 'castleOwner': {
      const id = resolveCastleRef(condition.castleId, binding);
      const castle = id === null ? undefined : state.castles[id]?.name;
      return castle === undefined
        ? null
        : named(() => t('ui.event.condition.castleOwner', { name, castle }));
    }
    case 'officerAlive':
      return officer === undefined ? null : t('ui.event.condition.officerAlive', { officer });
    case 'officerServes':
      return officer === undefined
        ? null
        : named(() => t('ui.event.condition.officerServes', { name, officer }));
    case 'officerIsLeader':
      return officer === undefined
        ? null
        : named(() => t('ui.event.condition.leader', { name, officer }));
    case 'officerInProvinces': {
      const provinces = condition.provinceIds.map((id) => state.provinces[id]?.name);
      return officer === undefined || provinces.some((value) => value === undefined)
        ? null
        : t('ui.event.condition.officerProvince', { officer, provinces: provinces.join('、') });
    }
    case 'atWar':
    case 'pactExists': {
      const a = clan(condition.a),
        b = clan(condition.b);
      if (a === undefined || b === undefined) return null;
      return condition.kind === 'atWar'
        ? t('ui.event.condition.war', { a, b })
        : t('ui.event.condition.pact', { a, b, pact: t(`term.pact.${condition.pact}`) });
    }
    case 'shogunateExists':
      return t(condition.value ? 'ui.event.condition.shogunate' : 'ui.event.condition.noShogunate');
    case 'shogunateTitleAtLeast':
      return named(() =>
        t('ui.event.condition.title', { name, title: t(`term.shogunateTitle.${condition.title}`) }),
      );
    case 'courtRankAtLeast':
      return named(() =>
        t('ui.event.condition.rank', { name, rank: t(`term.courtRank.${condition.rank}`) }),
      );
    case 'flag': {
      const key = resolveEventFlagKey(condition.key, state, binding);
      return key === null
        ? null
        : t('ui.event.condition.flag', { flag: key, value: condition.min });
    }
    case 'eventFired': {
      const event = catalog.getDef(condition.eventId)?.cutscene.title;
      return event === undefined || /\{[^{}]+\}/u.test(event)
        ? null
        : t('ui.event.condition.event', { event });
    }
    case 'not': {
      const reason = eventConditionReason(condition.cond, binding, state, catalog);
      return reason === null ? null : t('ui.event.condition.not', { reason });
    }
    case 'any': {
      if (condition.conds.length === 0) return t('ui.event.condition.anyEmpty');
      const reasons = condition.conds.map((cond) =>
        eventConditionReason(cond, binding, state, catalog),
      );
      return reasons.some((reason) => reason === null)
        ? null
        : t('ui.event.condition.any', { reasons: reasons.join('；') });
    }
  }
}

/** Rebuild the saved mandatory interaction without drawing RNG or repairing core state. */
export function buildPendingEventModalVM(
  state: Readonly<GameState>,
  catalog: Pick<EventEngine, 'getDef'> | null,
  options: EventPresentationOptions = {},
): EventViewModelResult | null {
  const eventId = state.events.pendingChoiceEventId;
  if (eventId === null) return null;
  if (catalog === null) return { ok: false, reason: 'catalog-unavailable' };
  const def = catalog.getDef(eventId);
  if (!def) return { ok: false, reason: 'unknown-event' };
  if (def.choices.length === 0) return { ok: false, reason: 'not-choice-event' };
  let binding = state.events.pendingChoiceBinding;
  if (binding === null) {
    if (def.target !== 'fixed') return { ok: false, reason: 'missing-binding' };
    const empty: EventBinding = { clanId: null, castleId: null, districtId: null };
    const owners = def.ownerCandidates
      .map((ref) => resolveClanRef(ref, empty))
      .filter((id) => id !== null && state.clans[id]?.alive === true);
    binding = {
      ...empty,
      clanId:
        (!state.ai.allAi && owners.includes(state.meta.playerClanId)
          ? state.meta.playerClanId
          : owners[0]) ?? null,
    };
  }
  return buildEventModalVM(state, def, binding, catalog, { ...options, resolved: false });
}

/** Present a concrete occurrence, including informational events with no choices. */
export function buildEventModalVM(
  state: Readonly<GameState>,
  def: Readonly<EventDef>,
  binding: Readonly<EventBinding>,
  catalog: Pick<EventEngine, 'getDef'>,
  options: EventPresentationOptions = {},
): EventViewModelResult {
  const eventId = def.id;
  if (
    (binding.clanId !== null && !state.clans[binding.clanId]) ||
    (binding.castleId !== null && !state.castles[binding.castleId]) ||
    (binding.districtId !== null && !state.districts[binding.districtId]) ||
    (binding.region != null && !REGION_VALUES.includes(binding.region))
  )
    return { ok: false, reason: 'invalid-binding' };
  const monClanId =
    def.cutscene.monClanId === null ? null : resolveClanRef(def.cutscene.monClanId, binding);
  if (def.cutscene.monClanId !== null && (monClanId === null || !state.clans[monClanId]))
    return { ok: false, reason: 'invalid-binding' };
  const replacements: Record<string, string | number | undefined> = {
    clanName: binding.clanId === null ? undefined : state.clans[binding.clanId]?.name,
    castleName: binding.castleId === null ? undefined : state.castles[binding.castleId]?.name,
    districtName:
      binding.districtId === null ? undefined : state.districts[binding.districtId]?.name,
    cost: options.presentation?.cost,
    // Geography is never inferred from a district, clan or effect.
    regionName: binding.region == null ? undefined : t(`term.region.${binding.region}`),
  };
  let missing: string | undefined;
  const interpolate = (text: string) =>
    text.replace(/\{([^{}]+)\}/gu, (_match, token: string) => {
      const value = Object.hasOwn(replacements, token) ? replacements[token] : undefined;
      if (value === undefined || (typeof value === 'number' && !Number.isFinite(value))) {
        missing ??= token;
        return '';
      }
      return String(value);
    });
  const title = interpolate(def.cutscene.title);
  const body = interpolate(def.cutscene.body);
  const choices: EventModalVM['choices'] = [];
  for (const choice of options.resolved ? [] : def.choices) {
    const failed = choice.conditions.find((condition) => !evalCond(condition, state, binding));
    const label = interpolate(choice.label);
    const hint = failed
      ? options.conditionReason
        ? options.conditionReason(failed, binding, state)
        : eventConditionReason(failed, binding, state, catalog)
      : '';
    if (failed && !hint)
      return {
        ok: false,
        reason: options.conditionReason ? 'missing-condition-reason' : 'missing-referenced-name',
      };
    choices.push({ label, enabled: failed === undefined, hint: hint ?? '' });
  }
  if (missing !== undefined)
    return { ok: false, reason: 'unsupported-presentation', token: missing };
  return {
    ok: true,
    vm: {
      eventId,
      title,
      body,
      monClanId,
      choices,
      requiresChoice: !options.resolved && def.choices.length > 0,
    },
  };
}
