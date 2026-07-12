// 37 個武將特性與共用查詢函式。
// 規格：plan/06-officers.md §3.3、§5.9（M3-1）。

import { BAL } from './balance';
import type { TraitDef, TraitHook, OfficerTraits } from './state/officerTypes';
import type { TraitId } from './state/ids';

const id = (value: string): TraitId => value as TraitId;

function trait(
  traitId: string,
  name: string,
  rarity: TraitDef['rarity'],
  effects: TraitDef['effects'],
): TraitDef {
  return { id: id(traitId), name, rarity, effects };
}

const defs = [
  trait('trait.gunshin', '軍神', 'legendary', [
    { hook: 'battle.allStatsMult', mode: 'mult', value: BAL.traitGunshin },
  ]),
  trait('trait.ifudodo', '威風堂堂', 'legendary', [
    { hook: 'battle.aweLevelAdd', mode: 'add', value: 1 },
    { hook: 'battle.aweRangeAdd', mode: 'add', value: BAL.traitIfudodoAweRange },
  ]),
  trait('trait.boshin', '謀神', 'legendary', [
    { hook: 'plot.successAdd', mode: 'add', value: BAL.traitBoshin },
    { hook: 'plot.costMult', mode: 'mult', value: -BAL.traitBoshinCostCut },
  ]),
  trait('trait.hitotarashi', '人蕩', 'legendary', [
    { hook: 'officer.recruitSuccessAdd', mode: 'add', value: BAL.traitHitotarashi },
    { hook: 'officer.loyaltyAuraAdd', mode: 'add', value: BAL.traitHitotarashiLoyalty },
  ]),
  trait('trait.onimusha', '鬼武者', 'rare', [
    { hook: 'battle.tacticPowerValor', mode: 'mult', value: BAL.traitOnimusha },
  ]),
  trait('trait.chikujo', '築城名手', 'rare', [
    { hook: 'dev.facilityTimeMult', mode: 'mult', value: -BAL.traitChikujo },
  ]),
  trait('trait.naisei', '內政名人', 'rare', [
    { hook: 'dev.efficiencyMult', mode: 'mult', value: BAL.traitNaisei },
  ]),
  trait('trait.gaiko', '外交上手', 'rare', [
    { hook: 'diplo.trustGainMult', mode: 'mult', value: BAL.traitGaiko },
  ]),
  trait('trait.teppo', '鐵砲名人', 'rare', [
    { hook: 'battle.rangedAttackMult', mode: 'mult', value: BAL.traitTeppo },
    { hook: 'battle.tacticPowerRanged', mode: 'mult', value: BAL.traitTeppo },
  ]),
  trait('trait.kiba', '騎馬達人', 'rare', [
    { hook: 'battle.attackMult', mode: 'mult', value: BAL.traitKiba },
    { hook: 'battle.tacticPowerCharge', mode: 'mult', value: BAL.traitKibaCharge },
  ]),
  trait('trait.ninja', '忍者', 'rare', [
    { hook: 'plot.successAdd', mode: 'add', value: BAL.traitNinja },
  ]),
  trait('trait.kojo', '攻城名手', 'rare', [
    { hook: 'siege.attackMult', mode: 'mult', value: BAL.traitKojo },
  ]),
  trait('trait.rojo', '籠城名手', 'rare', [
    { hook: 'siege.defenseDamageMult', mode: 'mult', value: -BAL.traitRojo },
    { hook: 'siege.defenseMoraleMult', mode: 'mult', value: -BAL.traitRojoMorale },
  ]),
  trait('trait.chiebukuro', '智囊', 'rare', [
    { hook: 'proposal.weightMult', mode: 'mult', value: BAL.traitChiebukuro },
  ]),
  trait('trait.chushin', '忠臣', 'rare', [
    { hook: 'officer.loyaltySelfAdd', mode: 'add', value: BAL.traitChushin },
  ]),
  trait('trait.kaizoku', '海賊', 'common', [
    { hook: 'march.seaSpeedMult', mode: 'mult', value: BAL.traitKaizoku },
  ]),
  trait('trait.nosei', '農政家', 'common', [
    { hook: 'dev.kokudakaMult', mode: 'mult', value: BAL.traitNosei },
  ]),
  trait('trait.shosai', '商才', 'common', [
    { hook: 'dev.commerceMult', mode: 'mult', value: BAL.traitShosai },
  ]),
  trait('trait.reisei', '冷靜', 'common', [
    { hook: 'battle.moraleLossMult', mode: 'mult', value: -BAL.traitReisei },
    { hook: 'battle.routThresholdAdd', mode: 'add', value: -BAL.traitReiseiRout },
  ]),
  trait('trait.goketsu', '豪傑', 'common', [
    { hook: 'battle.attackMult', mode: 'mult', value: BAL.traitGoketsu },
  ]),
  trait('trait.keigan', '慧眼', 'common', [
    { hook: 'officer.recruitSuccessAdd', mode: 'add', value: BAL.traitKeigan },
  ]),
  trait('trait.jinsei', '仁政', 'common', [
    { hook: 'dev.securityAdd', mode: 'add', value: BAL.traitJinsei },
  ]),
  trait('trait.shinsoku', '神足', 'common', [
    { hook: 'march.landSpeedMult', mode: 'mult', value: BAL.traitShinsoku },
  ]),
  trait('trait.heitan', '兵站上手', 'common', [
    { hook: 'army.foodUseMult', mode: 'mult', value: -BAL.traitHeitan },
  ]),
  trait('trait.boshu', '募兵上手', 'common', [
    { hook: 'dev.conscriptionMult', mode: 'mult', value: BAL.traitBoshu },
  ]),
  trait('trait.jinbo', '人望', 'common', [
    { hook: 'officer.loyaltyAuraAdd', mode: 'add', value: BAL.traitJinbo },
  ]),
  trait('trait.yashin', '野心家', 'common', [
    { hook: 'officer.meritGainMult', mode: 'mult', value: BAL.traitYashinMerit },
    { hook: 'officer.loyaltySelfAdd', mode: 'add', value: -BAL.traitYashinLoyalty },
  ]),
  trait('trait.chotei', '朝廷通', 'common', [
    { hook: 'diplo.courtCostMult', mode: 'mult', value: -BAL.traitChotei },
  ]),
  trait('trait.hayamimi', '早耳', 'common', [
    { hook: 'plot.defenseAdd', mode: 'add', value: -BAL.traitHayamimi },
  ]),
  trait('trait.seiatsu', '攻略上手', 'common', [
    { hook: 'march.subjugateTimeMult', mode: 'mult', value: -BAL.traitSeiatsu },
  ]),
  trait('trait.benzetsu', '辯舌', 'common', []),
  trait('trait.gunryaku', '軍略', 'common', []),
  trait('trait.fudou', '不動', 'common', []),
  trait('trait.hizeme', '火攻', 'common', []),
  trait('trait.kesshi', '決死', 'common', []),
  trait('trait.roukou', '老巧', 'common', []),
  trait('trait.iryou', '醫療', 'common', []),
] as const satisfies readonly TraitDef[];

/** 37 個特性定義；未知 id 由 traitModifier 安全略過，供舊存檔遷移。 */
export const TRAITS: Readonly<Record<TraitId, TraitDef>> = Object.freeze(
  Object.fromEntries(defs.map((definition) => [definition.id, definition])),
);

export interface TraitModifier {
  mult: number;
  add: number;
}

/** 同 hook 的乘數相乘、加值相加（06 §5.9）。 */
export function traitModifier(officer: OfficerTraits, hook: TraitHook): TraitModifier {
  let mult = 1;
  let add = 0;
  for (const traitId of officer.traits) {
    const definition = TRAITS[traitId];
    if (definition === undefined) continue;
    for (const effect of definition.effects) {
      if (effect.hook !== hook) continue;
      if (effect.mode === 'mult') mult *= 1 + effect.value;
      else add += effect.value;
    }
  }
  return { mult, add };
}
