import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { TRAITS, traitModifier } from '../../src/core/traits';
import type { TraitId } from '../../src/core/state/ids';

const traitId = (value: string): TraitId => value as TraitId;

describe('TRAITS', () => {
  it('defines the canonical 37 traits and rarity distribution', () => {
    const traits = Object.values(TRAITS);
    expect(traits).toHaveLength(37);
    expect(new Set(traits.map((trait) => trait.id)).size).toBe(37);
    expect(traits.every((trait) => trait.id.startsWith('trait.'))).toBe(true);
    expect(traits.filter((trait) => trait.rarity === 'legendary')).toHaveLength(4);
    expect(traits.filter((trait) => trait.rarity === 'rare')).toHaveLength(11);
    expect(traits.filter((trait) => trait.rarity === 'common')).toHaveLength(22);
    expect(traits.slice(30).every((trait) => trait.effects.length === 0)).toBe(true);
  });
});

describe('traitModifier', () => {
  it('multiplies mult effects and adds add effects', () => {
    const attack = traitModifier(
      { traits: [traitId('trait.kiba'), traitId('trait.goketsu')] },
      'battle.attackMult',
    );
    expect(attack).toEqual({
      mult: (1 + BAL.traitKiba) * (1 + BAL.traitGoketsu),
      add: 0,
    });

    const recruit = traitModifier(
      { traits: [traitId('trait.hitotarashi'), traitId('trait.keigan')] },
      'officer.recruitSuccessAdd',
    );
    expect(recruit).toEqual({
      mult: 1,
      add: BAL.traitHitotarashi + BAL.traitKeigan,
    });
  });

  it('returns the neutral modifier for no matching trait', () => {
    expect(traitModifier({ traits: [] }, 'plot.successAdd')).toEqual({ mult: 1, add: 0 });
  });
});
