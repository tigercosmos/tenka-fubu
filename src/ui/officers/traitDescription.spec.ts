import { expect, it } from 'vitest';
import { describeOfficerTrait } from './traitDescription';
import { TRAITS, traitModifier } from '@core/traits';
import { TACTICS } from '@core/tactics';
import type { TraitId } from '@core/state/ids';
import { hasKey, getMissingKeys, resetMissingKeyTrackingForTests } from '@i18n/zh-TW';

it('covers all37 canonical traits with exact detached effects, declaration order and actual tactic links', () => {
  resetMissingKeyTrackingForTests();
  expect(Object.values(TRAITS)).toHaveLength(37);
  const before = JSON.stringify({ traits: TRAITS, tactics: TACTICS });
  for (const trait of Object.values(TRAITS)) {
    const view = describeOfficerTrait(trait.id)!;
    expect(hasKey(`${trait.id}.description`)).toBe(true);
    expect(view.id).toBe(trait.id);
    expect(view.effects.map(({ hook, mode, value }) => ({ hook, mode, value }))).toEqual(
      trait.effects,
    );
    expect(view.effects).not.toBe(trait.effects);
    view.effects.forEach((effect, index) => {
      expect(effect).not.toBe(trait.effects[index]);
      const probability = [
        'plot.successAdd',
        'plot.defenseAdd',
        'officer.recruitSuccessAdd',
      ].includes(effect.hook);
      expect(Number(effect.displayed)).toBe(
        effect.mode === 'mult' ? 1 + effect.value : effect.value * (probability ? 100 : 1),
      );
    });
    expect(view.unlocks.map((unlock) => unlock.id)).toEqual(
      Object.values(TACTICS)
        .filter((tactic) => tactic.unlockTraitId === trait.id)
        .map((tactic) => tactic.id)
        .sort(),
    );
    expect(view.lines.join('\n')).not.toMatch(/\{(?:effect\d|tactics)\}/);
  }
  expect(getMissingKeys()).toEqual([]);
  expect(JSON.stringify({ traits: TRAITS, tactics: TACTICS })).toBe(before);
  expect(describeOfficerTrait('trait.unknown')).toBeNull();
});

it('keeps multiplicative contributions distinct rather than adding percentage boosts', () => {
  const cavalry = describeOfficerTrait('trait.kiba')!;
  const attack = describeOfficerTrait('trait.goketsu')!;
  const factors = [cavalry, attack].flatMap((trait) =>
    trait.effects
      .filter((effect) => effect.hook === 'battle.attackMult')
      .map((effect) => Number(effect.displayed)),
  );
  const actual = traitModifier(
    { traits: ['trait.kiba', 'trait.goketsu'] as TraitId[] },
    'battle.attackMult',
  );
  expect(factors.reduce((product, factor) => product * factor, 1)).toBe(actual.mult);
  expect(actual.mult).not.toBe(1 + factors.reduce((sum, factor) => sum + factor - 1, 0));
  expect(cavalry.lines.join('\n')).toContain('同項乘數相乘、加值相加');
});

it('qualifies special conditions, signed probability points and other-officer auras', () => {
  expect(describeOfficerTrait('trait.heitan')!.lines[0]).toContain(
    '主將部隊行軍與圍城時，兵糧消耗 ×0.8',
  );
  expect(describeOfficerTrait('trait.ifudodo')!.lines[0]).toContain('已為大威風時');
  expect(describeOfficerTrait('trait.chushin')!.lines[0]).toContain('不參與出奔與引拔判定');
  expect(describeOfficerTrait('trait.jinbo')!.lines[0]).toContain('同城其他我方武將');
  expect(describeOfficerTrait('trait.hitotarashi')!.lines[0]).toContain('同城其他我方武將');
  expect(describeOfficerTrait('trait.boshin')!.lines[0]).toContain('+35 個百分點');
  expect(describeOfficerTrait('trait.hayamimi')!.lines[0]).toContain('-20 個百分點');
  expect(describeOfficerTrait('trait.gaiko')!.lines[0]).toContain('執行外交工作時');
  expect(describeOfficerTrait('trait.rojo')!.lines[0]).toContain('任城主之城被圍時');
});

it('explains allseven unlock-only traits without manufacturing passive effects', () => {
  const traits = ['benzetsu', 'gunryaku', 'fudou', 'hizeme', 'kesshi', 'roukou', 'iryou'];
  for (const suffix of traits) {
    const view = describeOfficerTrait(`trait.${suffix}`)!;
    expect(view.effects).toEqual([]);
    expect(view.unlocks).toHaveLength(1);
    expect(view.lines[0]).toContain(`解鎖戰法「${view.unlocks[0]!.name}」`);
    expect(view.lines[0]).toContain('沒有被動數值加成');
    expect(view.lines[0]).toContain('使用條件仍依戰法規則');
  }
  for (const id of ['trait.gunshin', 'trait.kiba', 'trait.teppo']) {
    const view = describeOfficerTrait(id)!;
    expect(view.effects.length).toBeGreaterThan(0);
    expect(view.unlocks).toHaveLength(1);
    expect(view.lines.join('\n')).toContain(`解鎖戰法「${view.unlocks[0]!.name}」`);
  }
});
