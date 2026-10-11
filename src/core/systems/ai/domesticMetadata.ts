import { FACILITY_DEFS } from '../../facilities';
import { POLICY_DEFS } from '../../policies';
import type { AiPersona } from './types';

export type FacilityTag = 'defense' | 'military' | 'food' | 'economy' | 'loyalty';
/** Derived from 05 §3.4.2 effects: 05 has no effectTag field despite 09's reference. */
export const FACILITY_TAGS: Readonly<Record<string, FacilityTag>> = {
  'fac.ichi': 'economy',
  'fac.komedoiya': 'food',
  'fac.heisha': 'military',
  'fac.umaya': 'military',
  'fac.kajiba': 'military',
  'fac.shagekijo': 'military',
  'fac.hyojosho': 'loyalty',
  'fac.minato': 'economy',
  'fac.jisha': 'loyalty',
  'fac.nanbanji': 'economy',
  'fac.inkyo': 'loyalty',
  'fac.kura': 'food',
  'fac.toride': 'defense',
  'fac.gakumonjo': 'loyalty',
  'fac.ikan': 'military',
  'fac.jokaku': 'defense',
};
export type PolicyTag = 'economy' | 'military' | 'diplomacy';
/** 05 §3.7.2 primary effects. Security/development policies use the domestic/economy axis. */
export const POLICY_TAGS: Readonly<Record<string, PolicyTag>> = {
  'pol.rakuichi': 'economy',
  'pol.kenchi': 'economy',
  'pol.tenmasei': 'military',
  'pol.jishahogo': 'economy',
  'pol.nanban': 'economy',
  'pol.sekisho': 'economy',
  'pol.jokashuju': 'military',
  'pol.meyasubako': 'economy',
  'pol.heinobunri': 'military',
  'pol.goningumi': 'economy',
  'pol.kakishuchu': 'military',
  'pol.enkokinko': 'diplomacy',
};
export function rankFacilities(threatened: boolean) {
  const priority: readonly FacilityTag[] = threatened
    ? ['defense', 'military', 'food']
    : ['economy', 'food', 'military', 'loyalty'];
  return priority.flatMap((tag) => FACILITY_DEFS.filter((def) => FACILITY_TAGS[def.id] === tag));
}
/** 09 defines category weights but no base utility. Normalized baseline 1, not marginal utility. */
export function rankPolicies(persona: AiPersona) {
  const weights = {
    economy: persona.development / 50,
    military: persona.aggression / 50,
    diplomacy: persona.diplomacy / 50,
  };
  return [...POLICY_DEFS].sort(
    (a, b) => weights[POLICY_TAGS[b.id]!] - weights[POLICY_TAGS[a.id]!] || a.id.localeCompare(b.id),
  );
}
