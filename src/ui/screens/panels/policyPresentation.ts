import { BAL } from '@core/balance';
import type { PolicyDef } from '@core/policies';
import { t } from '@i18n/zh-TW';

export interface PolicyPresentation {
  summary: string;
  effects: readonly string[];
  pending: readonly string[];
}

// Presentation only: implemented consumers and unresolved specification effects
// remain separate. This never grants a policy effect or changes its eligibility.
export function policyPresentation(policy: PolicyDef): PolicyPresentation {
  // t() formats numeric quantities as integers. Multiplier labels need exact decimal strings.
  const effect = (name: string, params?: Record<string, string | number>) =>
    t(
      `ui.policy.effect.${name}`,
      params === undefined
        ? undefined
        : Object.fromEntries(Object.entries(params).map(([key, value]) => [key, String(value)])),
    );
  const pending = (name: string) => t(`ui.policy.pending.${name}`);
  const result = (name: string, effects: string[], unresolved: string[] = []) => ({
    summary: t(`ui.policy.summary.${name}`),
    effects,
    pending: unresolved,
  });
  const clean = (value: number) => Number(value.toFixed(6));
  const security = (add: number) => effect('security', { add });
  switch (policy.id) {
    case 'pol.rakuichi':
      return result('rakuichi', [
        effect('commerceIncome', { mult: BAL.polRakuichiIncomeMult }),
        effect('commerceDevelopment', { mult: BAL.polRakuichiCommerceDevMult }),
      ]);
    case 'pol.kenchi':
      return result('kenchi', [
        effect('harvest', { mult: BAL.polKenchiHarvestMult }),
        effect('directDevelopment', { mult: BAL.polKenchiDirectDevMult }),
        effect('fiefTax', {
          add: clean(BAL.polKenchiTaxBonus * 100),
          rate: clean((BAL.fiefTaxRate + BAL.polKenchiTaxBonus) * 100),
        }),
      ]);
    case 'pol.tenmasei':
      return result('tenmasei', [
        effect('transport', { mult: clean(1 / BAL.polTenmaseiTransportDaysMult) }),
        effect('landMarch', { mult: BAL.polTenmaseiMarchSpeedMult }),
        effect('paidCarry'),
      ]);
    case 'pol.jishahogo':
      return result('jishahogo', [
        security(BAL.polJishahogoSecurityAdd),
        effect('uprising', { mult: BAL.polJishahogoUprisingChanceMult }),
      ]);
    case 'pol.nanban':
      return result(
        'nanban',
        [effect('flatGold', { gold: BAL.polNanbanGold })],
        [pending('gunPurchase')],
      );
    case 'pol.sekisho':
      return result('sekisho', [
        effect('commerceDevelopment', { mult: BAL.polSekishoCommerceDevMult }),
        effect('population', { mult: BAL.polSekishoPopGrowthMult }),
      ]);
    case 'pol.jokashuju':
      return result('jokashuju', [
        effect('populationCapacity', { mult: BAL.polJokashujuSoldierMult }),
        effect('conscription', { mult: BAL.polJokashujuConscriptMult }),
        effect('population', { mult: BAL.polJokashujuPopGrowthMult }),
      ]);
    case 'pol.meyasubako':
      return result(
        'meyasubako',
        [security(BAL.polMeyasubakoSecurityAdd)],
        [pending('loyalty'), pending('proposals')],
      );
    case 'pol.heinobunri':
      return result(
        'heinobunri',
        [effect('highConscription'), effect('garrisonFood', { mult: BAL.polHeinobunriFoodMult })],
        [pending('morale')],
      );
    case 'pol.goningumi':
      return result(
        'goningumi',
        [
          security(BAL.polGoningumiSecurityAdd),
          effect('uprising', { mult: BAL.polGoningumiUprisingChanceMult }),
        ],
        [pending('plots')],
      );
    case 'pol.kakishuchu':
      return result('kakishuchu', [], [pending('gunAttack'), pending('gunPrice')]);
    case 'pol.enkokinko':
      return result(
        'enkokinko',
        [effect('diplomacy', { mult: BAL.polEnkokinkoWorkGainMult }), effect('diplomacyTiming')],
        [pending('nonadjacentCredit')],
      );
    default:
      return { summary: t('ui.policy.effectUnknown'), effects: [], pending: [] };
  }
}
