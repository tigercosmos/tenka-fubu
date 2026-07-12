import { useState, type ReactElement } from 'react';
import { dispatchCommand } from '@app/bridge';
import { BAL } from '@core/balance';
import { policyUnlocked, validateEnactPolicy } from '@core/commands/domesticCommands';
import type { PolicyDef } from '@core/policies';
import { POLICY_DEFS } from '@core/policies';
import { FACILITIES } from '@core/facilities';
import { t } from '@i18n/zh-TW';
import { Panel } from '@ui/components';
import { makeCachedSelector, useCachedGameSelector } from '@ui/hooks/useGameSelector';
import { useUIStore } from '@ui/hooks/uiStore';
import styles from './PolicyPanel.module.css';

const selectPolicyModel = makeCachedSelector((game) => {
  const clanId = game.meta.playerClanId;
  const clan = game.clans[clanId];
  const state = game.policies[clanId];
  const active = new Set(state?.active ?? []);
  const unlocked = new Set(
    POLICY_DEFS.filter((policy) =>
      policyUnlocked(game, { type: 'enactPolicy', clanId, policyId: policy.id }),
    ).map((policy) => policy.id),
  );
  const canEnact = new Set(
    POLICY_DEFS.filter(
      (policy) =>
        validateEnactPolicy(game, { type: 'enactPolicy', clanId, policyId: policy.id }).ok,
    ).map((policy) => policy.id),
  );
  return {
    clanId,
    gold: clan?.gold ?? 0,
    prestige: clan?.prestige ?? 0,
    active,
    unlocked,
    canEnact,
    cooldownUntil: state?.cooldownUntil ?? {},
    today: game.time.day,
  };
});

function policyCondition(policy: PolicyDef): string {
  let condition = t('ui.policy.prestigeRequirement', { prestige: policy.unlockPrestige });
  if (policy.requiresFacility !== null) {
    condition += t('ui.policy.requiresFacility', {
      name: t(FACILITIES[policy.requiresFacility]?.nameKey ?? policy.requiresFacility),
    });
  }
  if (policy.unlockCourtRank !== null) {
    condition += t('ui.policy.orCourtRank', {
      rank: t(`term.courtRank.${policy.unlockCourtRank}`),
    });
  }
  if (policy.unlockEvent !== null) condition += t('ui.policy.orEvent');
  return condition;
}

export function PolicyPanel(): ReactElement {
  const model = useCachedGameSelector(selectPolicyModel);
  const actions = useUIStore((state) => state.actions);
  const [feedback, setFeedback] = useState<string | null>(null);
  const slots = Math.min(
    BAL.policySlotMax,
    1 + Math.floor(model.prestige / BAL.policySlotPrestige),
  );
  return (
    <aside className={styles.anchor} data-testid="policy-panel">
      <Panel
        title={t('ui.policy.title')}
        variant="ornate"
        onClose={() => actions.closePanelById('policy')}
      >
        <p>{t('ui.policy.active', { n: model.active.size, max: slots })}</p>
        <div className={styles.grid}>
          {POLICY_DEFS.map((policy) => {
            const active = model.active.has(policy.id);
            const cooldownDays = Math.max(0, (model.cooldownUntil[policy.id] ?? 0) - model.today);
            const locked = !model.unlocked.has(policy.id);
            return (
              <article key={policy.id} className={active ? styles.active : undefined}>
                <h3>{t(policy.nameKey)}</h3>
                <p>{t('ui.policy.upkeep', { gold: policy.upkeepGold })}</p>
                {locked && (
                  <small>
                    {t('ui.policy.locked', {
                      condition: policyCondition(policy),
                    })}
                  </small>
                )}
                {cooldownDays > 0 && (
                  <small>{t('ui.policy.cooldown', { months: Math.ceil(cooldownDays / 30) })}</small>
                )}
                <button
                  type="button"
                  disabled={!active && !model.canEnact.has(policy.id)}
                  onClick={() => {
                    const result = dispatchCommand({
                      type: active ? 'revokePolicy' : 'enactPolicy',
                      clanId: model.clanId,
                      policyId: policy.id,
                    });
                    setFeedback(result.ok ? null : result.reason);
                  }}
                >
                  {t(active ? 'ui.policy.revoke' : 'ui.policy.adopt')}
                </button>
              </article>
            );
          })}
        </div>
        {feedback && <p role="alert">{feedback}</p>}
      </Panel>
    </aside>
  );
}
