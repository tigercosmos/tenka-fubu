import { TRAITS } from '@core/traits';
import { TACTICS } from '@core/tactics';
import type { TraitEffect } from '@core/state/officerTypes';
import type { TraitId, TacticId } from '@core/state/ids';
import { t } from '@i18n/zh-TW';

export interface OfficerTraitDescription {
  readonly id: TraitId;
  readonly name: string;
  readonly effects: readonly (Readonly<TraitEffect> & { readonly displayed: string })[];
  readonly unlocks: readonly { readonly id: TacticId; readonly name: string }[];
  readonly lines: readonly string[];
}

/** One trait's authored facts, not an aggregate or a promise that a tactic is currently usable. */
export function describeOfficerTrait(id: string): OfficerTraitDescription | null {
  const trait = TRAITS[id as TraitId];
  if (trait === undefined) return null;
  const effects = trait.effects.map((effect) => {
    const probability =
      effect.hook === 'plot.successAdd' ||
      effect.hook === 'plot.defenseAdd' ||
      effect.hook === 'officer.recruitSuccessAdd';
    const value = probability ? effect.value * 100 : effect.value;
    return {
      ...effect,
      displayed:
        effect.mode === 'mult' ? String(1 + effect.value) : `${value >= 0 ? '+' : ''}${value}`,
    };
  });
  const unlocks = Object.values(TACTICS)
    .filter((tactic) => tactic.unlockTraitId === trait.id)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((tactic) => ({ id: tactic.id, name: t(`${tactic.id}.name`) }));
  const tactics = unlocks.map((unlock) => unlock.name).join('、');
  const params: Record<string, string> = { tactics };
  effects.forEach((effect, index) => {
    params[`effect${index}`] = effect.displayed;
  });
  const lines = [t(`${trait.id}.description`, params)];
  if (effects.length > 0) {
    if (unlocks.length > 0) lines.push(t('ui.officer.trait.unlock', { tactics }));
    lines.push(t('ui.officer.trait.combination'));
  }
  return { id: trait.id, name: t(`${trait.id}.name`), effects, unlocks, lines };
}
