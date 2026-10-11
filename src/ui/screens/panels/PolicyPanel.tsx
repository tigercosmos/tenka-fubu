import { useId, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import { dispatchCommand } from '@app/bridge';
import { store } from '@app/store';
import { BAL } from '@core/balance';
import { extraPolicySlots, validateCommand } from '@core/index';
import { policyUnlocked } from '@core/commands/domesticCommands';
import type { GameState } from '@core/state/gameState';
import type { PolicyDef } from '@core/policies';
import { POLICY_DEFS } from '@core/policies';
import { FACILITIES } from '@core/facilities';
import { t } from '@i18n/zh-TW';
import { Panel, Tooltip } from '@ui/components';
import { makeCachedSelector, useCachedGameSelector } from '@ui/hooks/useGameSelector';
import { uiStore, useUIStore } from '@ui/hooks/uiStore';
import styles from './PolicyPanel.module.css';
import { policyPresentation } from './policyPresentation';

const sessions = new WeakMap<GameState, number>();
let nextSession = 0;

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
  let session = sessions.get(game);
  if (session === undefined) {
    session = ++nextSession;
    sessions.set(game, session);
  }
  const slotCapacity = Math.min(
    BAL.policySlotMax,
    1 + Math.floor((clan?.prestige ?? 0) / BAL.policySlotPrestige) + extraPolicySlots(game, clanId),
  );
  const actionById = Object.fromEntries(
    POLICY_DEFS.map((policy) => {
      const isActive = active.has(policy.id);
      const verdict = validateCommand(game, {
        type: isActive ? 'revokePolicy' : 'enactPolicy',
        clanId,
        policyId: policy.id,
      });
      let reason = verdict.ok ? null : t(verdict.reasonKey, verdict.params);
      if (!verdict.ok && verdict.reasonKey !== 'cmd.reject.gameOver' && !isActive) {
        const context: string[] = [];
        if (!unlocked.has(policy.id))
          context.push(t('ui.policy.locked', { condition: policyCondition(policy) }));
        const cooldownDays = Math.max(0, (state?.cooldownUntil[policy.id] ?? 0) - game.time.day);
        if (cooldownDays > 0)
          context.push(t('ui.policy.cooldown', { months: Math.ceil(cooldownDays / 30) }));
        if (policy.exclusiveWith !== null && active.has(policy.exclusiveWith))
          context.push(
            t('ui.policy.exclusive', {
              name: t(POLICY_DEFS.find((item) => item.id === policy.exclusiveWith)!.nameKey),
            }),
          );
        if (active.size >= slotCapacity)
          context.push(t('ui.policy.blockSlots', { n: active.size, max: slotCapacity }));
        if (
          (clan?.gold ?? 0) < policy.upkeepGold &&
          verdict.reasonKey !== 'cmd.reject.insufficientGold'
        )
          context.push(t('cmd.reject.insufficientGold', { cost: policy.upkeepGold }));
        if (context.length > 0) reason = `${reason}；${context.join('；')}`;
      }
      return [policy.id, { ok: verdict.ok, reason }];
    }),
  );
  return {
    clanId,
    session,
    gold: clan?.gold ?? 0,
    prestige: clan?.prestige ?? 0,
    slotCapacity,
    active,
    unlocked,
    actionById,
    cooldownUntil: { ...state?.cooldownUntil },
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
  return <PolicyPanelContent key={model.session} model={model} />;
}

type PolicyModel = ReturnType<typeof selectPolicyModel>;

function PolicyAction({
  policy,
  model,
  onFeedback,
  canSubmit,
}: {
  policy: PolicyDef;
  model: PolicyModel;
  onFeedback: (feedback: string | null) => void;
  canSubmit: () => boolean;
}): ReactElement {
  const reasonId = useId();
  const active = model.active.has(policy.id);
  const verdict = model.actionById[policy.id]!;
  const label = t(active ? 'ui.policy.revoke' : 'ui.policy.adopt');
  return (
    <div>
      <Tooltip content={verdict.reason} disabled={verdict.reason === null}>
        <span
          className={styles.actionTarget}
          tabIndex={verdict.ok ? undefined : 0}
          aria-label={verdict.reason === null ? undefined : `${label}：${verdict.reason}`}
        >
          <button
            type="button"
            disabled={!verdict.ok}
            aria-describedby={verdict.reason === null ? undefined : reasonId}
            onClick={() => {
              if (!canSubmit()) return;
              const current = store.getState().game;
              if (current === null || sessions.get(current) !== model.session) return;
              const result = dispatchCommand({
                type: active ? 'revokePolicy' : 'enactPolicy',
                clanId: model.clanId,
                policyId: policy.id,
              });
              onFeedback(result.ok ? null : t(result.reason, result.params));
            }}
          >
            {label}
          </button>
        </span>
      </Tooltip>
      {verdict.reason !== null && <small id={reasonId}>{verdict.reason}</small>}
    </div>
  );
}

function PolicyPanelContent({ model }: { model: PolicyModel }): ReactElement {
  const actions = useUIStore((state) => state.actions);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState(POLICY_DEFS[0].id);
  const mounted = useRef(false);
  const ownerPanel = useRef(uiStore.getState().panelStack.at(-1) ?? null);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const canSubmit = () => {
    const current = store.getState();
    const ui = uiStore.getState();
    const top = ui.panelStack.at(-1);
    return (
      mounted.current &&
      current.session.screen === 'main' &&
      current.session.fatalError === null &&
      !current.session.viewportBlocked &&
      ui.modal === null &&
      document.querySelector('[data-ui-dialog]') === null &&
      (top === undefined || top.id === 'policy') &&
      (ownerPanel.current === null || top === ownerPanel.current)
    );
  };
  const canClose = () => {
    const current = store.getState();
    const ui = uiStore.getState();
    const top = ui.panelStack.at(-1);
    return (
      mounted.current &&
      current.game !== null &&
      sessions.get(current.game) === model.session &&
      current.session.screen === 'main' &&
      ui.modal === null &&
      document.querySelector('[data-ui-dialog]') === null &&
      (top === undefined || top.id === 'policy') &&
      (ownerPanel.current === null || top === ownerPanel.current)
    );
  };
  const detailId = useId();
  const selected = POLICY_DEFS.find((policy) => policy.id === selectedId)!;
  const selectedPresentation = policyPresentation(selected);
  const facts = (policy: PolicyDef) => {
    const cooldownDays = Math.max(0, (model.cooldownUntil[policy.id] ?? 0) - model.today);
    return (
      <div className={styles.facts}>
        <p>{t('ui.policy.upkeep', { gold: policy.upkeepGold })}</p>
        <small>{policyCondition(policy)}</small>
        <small>
          {policy.exclusiveWith === null
            ? t('ui.policy.noExclusivity')
            : t('ui.policy.exclusive', {
                name: t(POLICY_DEFS.find((item) => item.id === policy.exclusiveWith)!.nameKey),
              })}
        </small>
        <small>
          {cooldownDays > 0
            ? t('ui.policy.cooldown', { months: Math.ceil(cooldownDays / 30) })
            : t('ui.policy.cooldownReady')}
        </small>
      </div>
    );
  };
  return (
    <aside className={styles.anchor} data-testid="policy-panel">
      <Panel
        title={t('ui.policy.title')}
        variant="ornate"
        onClose={() => {
          if (canClose()) actions.closePanelById('policy');
        }}
      >
        <div className={styles.frame}>
          <p className={styles.capacity}>
            {t('ui.policy.active', { n: model.active.size, max: model.slotCapacity })}
          </p>
          <div className={styles.layout}>
            <div className={styles.grid}>
              {POLICY_DEFS.map((policy) => {
                const active = model.active.has(policy.id);
                const locked = !model.unlocked.has(policy.id);
                const presentation = policyPresentation(policy);
                const status = active
                  ? 'statusActive'
                  : locked
                    ? 'statusLocked'
                    : model.actionById[policy.id]!.ok
                      ? 'statusAvailable'
                      : 'statusBlocked';
                return (
                  <article
                    key={policy.id}
                    className={`${styles.card} ${active ? styles.active : ''}`}
                    data-testid={`policy-card-${policy.id}`}
                  >
                    <h3>{t(policy.nameKey)}</h3>
                    <span className={styles.badge} data-testid="policy-status">
                      {t(`ui.policy.${status}`)}
                    </span>
                    <p data-testid="policy-summary">{presentation.summary}</p>
                    {facts(policy)}
                    <button
                      type="button"
                      aria-pressed={selectedId === policy.id}
                      onClick={() => {
                        setSelectedId(policy.id);
                        setFeedback(null);
                      }}
                    >
                      {t('ui.policy.viewDetails', { name: t(policy.nameKey) })}
                    </button>
                    <PolicyAction
                      policy={policy}
                      model={model}
                      onFeedback={setFeedback}
                      canSubmit={canSubmit}
                    />
                  </article>
                );
              })}
            </div>
            <section
              className={styles.detail}
              aria-labelledby={detailId}
              data-testid="policy-detail"
            >
              <h3 id={detailId}>{t('ui.policy.detailTitle', { name: t(selected.nameKey) })}</h3>
              {facts(selected)}
              <h4>{t('ui.policy.effectTitle')}</h4>
              <ul>
                {selectedPresentation.effects.map((effect) => (
                  <li key={effect}>{effect}</li>
                ))}
              </ul>
              {selectedPresentation.pending.length > 0 && (
                <>
                  <h4>{t('ui.policy.pendingTitle')}</h4>
                  <ul>
                    {selectedPresentation.pending.map((effect) => (
                      <li key={effect}>{effect}</li>
                    ))}
                  </ul>
                </>
              )}
              <PolicyAction
                policy={selected}
                model={model}
                onFeedback={setFeedback}
                canSubmit={canSubmit}
              />
            </section>
          </div>
          {feedback && <p role="alert">{feedback}</p>}
        </div>
      </Panel>
    </aside>
  );
}
