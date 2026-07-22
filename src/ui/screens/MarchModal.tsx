import { useEffect, useRef, useState, type ReactElement } from 'react';
import { dispatchCommand, type CommandDispatchResult } from '@app/bridge';
import { gameLoop } from '@app/gameLoop';
import { store } from '@app/store';
import { BAL } from '@core/balance';
import type { Command } from '@core/commands/types';
import { RANK_VALUES } from '@core/state/enums';
import type { CastleId, MapNodeId, OfficerId } from '@core/state/ids';
import { t } from '@i18n/zh-TW';
import { Dialog, NumberSlider } from '@ui/components';
import { StatBar } from '@ui/components/StatBar/StatBar';
import { makeCachedSelector, useCachedGameSelector } from '@ui/hooks/useGameSelector';
import { useUIStore } from '@ui/hooks/uiStore';
import styles from './MarchModal.module.css';

type Dispatch = (command: Command) => CommandDispatchResult | void;

export interface MarchModalProps {
  onCommand?: Dispatch;
}

const selectMarchModel = makeCachedSelector((game, originCastleId: CastleId) => {
  const castle = game.castles[originCastleId];
  if (castle === undefined) return null;
  const officers = Object.values(game.officers)
    .filter(
      (officer) =>
        officer.status === 'serving' &&
        officer.hasComeOfAge &&
        officer.clanId === game.meta.playerClanId &&
        officer.locationCastleId === castle.id &&
        officer.armyId === null,
    )
    .sort((a, b) => b.ldr - a.ldr || a.id.localeCompare(b.id))
    .map((officer) => ({
      id: officer.id,
      name: officer.name,
      ldr: officer.ldr,
      val: officer.val,
      rank: officer.rank,
      troopCap:
        BAL.rankTroopCap[
          game.clans[game.meta.playerClanId]?.leaderId === officer.id
            ? RANK_VALUES.length - 1
            : RANK_VALUES.indexOf(officer.rank)
        ] ?? 0,
    }));
  return {
    playerClanId: game.meta.playerClanId,
    castle: { id: castle.id, name: castle.name, soldiers: castle.soldiers, food: castle.food },
    officers,
    names: {
      ...Object.fromEntries(Object.values(game.castles).map((item) => [item.id, item.name])),
      ...Object.fromEntries(Object.values(game.districts).map((item) => [item.id, item.name])),
    },
    // M6-V9b §3.3：目標卡資料（UI selector，非 core）——敵城守備/耐久量條用。
    castleStatsById: Object.fromEntries(
      Object.values(game.castles).map((item) => [
        item.id,
        {
          soldiers: Math.floor(item.soldiers),
          durability: Math.floor(item.durability),
          maxDurability: item.maxDurability,
        },
      ]),
    ),
  };
});

function snap(value: number, max: number): number {
  return Math.max(0, Math.min(max, Math.round(value / 100) * 100));
}

export function MarchModal({ onCommand = dispatchCommand }: MarchModalProps): ReactElement | null {
  const draft = useUIStore((state) => state.marchDraft);
  const actions = useUIStore((state) => state.actions);
  const model = useCachedGameSelector(selectMarchModel, (draft?.originCastleId ?? '') as CastleId);
  const [feedback, setFeedback] = useState<string | null>(null);
  const speedBeforePick = useRef<'x1' | 'x2' | 'x5' | null>(null);
  const targetStripRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (draft?.phase !== 'pickTarget') return;
    const speed = store.getState().session.speed;
    if (speed !== 'paused') {
      speedBeforePick.current = speed;
      gameLoop.requestPause('modalOpen');
    }
    return () => {
      const prior = speedBeforePick.current;
      speedBeforePick.current = null;
      if (prior !== null) gameLoop.setSpeed(prior);
    };
  }, [draft?.phase]);

  useEffect(() => {
    if (draft?.phase !== 'pickTarget') return;
    targetStripRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      actions.setMarchDraft({
        ...draft,
        phase: 'compose',
        targetNodeId: null,
        previewPath: null,
        previewDays: null,
        errorKey: null,
      });
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [actions, draft]);

  if (draft === null || model === null) return null;

  const leader = model.officers.find((officer) => officer.id === draft.leaderOfficerId);
  const soldierMax = Math.max(0, Math.min(model.castle.soldiers, leader?.troopCap ?? 0));
  const foodMin = Math.ceil(draft.soldiers * BAL.fieldFoodPerSoldierDaily * BAL.minCarryDays);
  const foodMax = Math.max(
    0,
    Math.min(
      model.castle.food,
      Math.floor(draft.soldiers * BAL.fieldFoodPerSoldierDaily * BAL.maxCarryDays),
    ),
  );
  const supportedDays =
    draft.soldiers <= 0
      ? 0
      : Math.floor(draft.food / (draft.soldiers * BAL.fieldFoodPerSoldierDaily));

  const update = (patch: Partial<typeof draft>) => {
    actions.setMarchDraft({ ...draft, ...patch });
    setFeedback(null);
  };
  const close = () => {
    actions.setMarchDraft(null);
    actions.closeModal();
  };
  const chooseLeader = (id: OfficerId) => {
    const next = model.officers.find((officer) => officer.id === id);
    const max = Math.min(model.castle.soldiers, next?.troopCap ?? 0);
    const soldiers = snap(max, max);
    const food = snap(
      soldiers * BAL.fieldFoodPerSoldierDaily * 60,
      Math.min(model.castle.food, soldiers * BAL.fieldFoodPerSoldierDaily * BAL.maxCarryDays),
    );
    update({
      leaderOfficerId: id,
      subOfficerIds: draft.subOfficerIds.filter((officerId) => officerId !== id),
      soldiers,
      food,
    });
  };
  const toggleDeputy = (id: OfficerId) => {
    if (id === draft.leaderOfficerId) return;
    const selected = draft.subOfficerIds.includes(id);
    update({
      subOfficerIds: selected
        ? draft.subOfficerIds.filter((value) => value !== id)
        : [...draft.subOfficerIds, id].slice(0, BAL.maxDeputies),
    });
  };
  const confirm = () => {
    if (draft.leaderOfficerId === null || draft.targetNodeId === null) return;
    const result = onCommand({
      type: 'march',
      clanId: model.playerClanId,
      originCastleId: model.castle.id,
      leaderId: draft.leaderOfficerId as OfficerId,
      deputyIds: draft.subOfficerIds as OfficerId[],
      soldiers: draft.soldiers,
      food: draft.food,
      targetNodeId: draft.targetNodeId as MapNodeId,
    });
    if (result && !result.ok) {
      setFeedback(t(result.reason, result.params));
      return;
    }
    close();
  };

  if (draft.phase === 'pickTarget') {
    // M6-V9b §3.2：地圖內模式層三浮層——(a) 頂中操作說明帶（沿用 testid/焦點）、
    // (b) 底中確認/取消藥丸（點選＝預覽，確認才回 compose）、(c) 右側目標卡（敵我戰力比較）。
    const targetStats =
      draft.targetNodeId !== null ? model.castleStatsById[draft.targetNodeId] : undefined;
    const canConfirmTarget = draft.targetNodeId !== null && draft.previewPath?.unreachable !== true;
    const clearAndCompose = () =>
      update({
        phase: 'compose',
        targetNodeId: null,
        previewPath: null,
        previewDays: null,
        errorKey: null,
      });
    const soldierBarMax = Math.max(targetStats?.soldiers ?? 0, draft.soldiers, 1);
    return (
      <>
        <section
          ref={targetStripRef}
          className={styles.targetStrip}
          data-testid="march-target-strip"
          aria-live="polite"
          aria-label={t('ui.march.modeBanner')}
          tabIndex={-1}
        >
          <strong>{t('ui.march.modeBanner')}</strong>
          <span>
            {draft.previewDays !== null
              ? t('ui.march.estDays', { days: draft.previewDays })
              : t('ui.march.pickTarget')}
          </span>
          {draft.errorKey !== null && <span role="alert">{t(draft.errorKey)}</span>}
        </section>
        {draft.targetNodeId !== null && (
          <aside className={styles.targetCard} data-testid="march-target-card">
            <h3>{model.names[draft.targetNodeId] ?? draft.targetNodeId}</h3>
            {targetStats !== undefined ? (
              <>
                <StatBar
                  label={t('ui.march.targetEnemy')}
                  value={targetStats.soldiers}
                  max={soldierBarMax}
                />
                <StatBar
                  label={t('ui.march.targetDurability')}
                  value={targetStats.durability}
                  max={Math.max(targetStats.maxDurability, 1)}
                />
                <StatBar
                  label={t('ui.march.targetOurForce')}
                  value={draft.soldiers}
                  max={soldierBarMax}
                />
              </>
            ) : (
              // 目標為郡（無守備/耐久）：只顯路徑日數（§3.2c）
              draft.previewDays !== null && (
                <p>{t('ui.march.estDays', { days: draft.previewDays })}</p>
              )
            )}
          </aside>
        )}
        <div className={styles.targetActions}>
          <button
            type="button"
            className={styles.confirmPill}
            data-testid="march-target-confirm"
            disabled={!canConfirmTarget}
            onClick={() => update({ phase: 'compose' })}
          >
            {t('ui.march.confirmTarget')}
          </button>
          <button
            type="button"
            className={styles.cancelPill}
            data-testid="march-target-cancel"
            onClick={clearAndCompose}
          >
            {t('ui.common.cancel')}
          </button>
        </div>
      </>
    );
  }

  const canConfirm =
    leader !== undefined &&
    draft.targetNodeId !== null &&
    draft.soldiers >= BAL.minMarchTroops &&
    draft.soldiers <= soldierMax &&
    draft.food >= foodMin &&
    draft.food <= foodMax;
  const via =
    draft.previewPath?.result.nodes
      .slice(1, -1)
      .map((id) => model.names[id] ?? id)
      .join('、') || t('ui.common.none');
  return (
    <Dialog
      open
      title={t('ui.march.title')}
      size="lg"
      onClose={close}
      footer={
        <>
          <button type="button" onClick={close}>
            {t('ui.common.cancel')}
          </button>
          <button type="button" disabled={!canConfirm} onClick={confirm}>
            {t('cmd.march.confirm')}
          </button>
        </>
      }
    >
      <div className={styles.body} data-testid="march-modal">
        <p>{t('ui.march.origin', { castle: model.castle.name })}</p>
        <section>
          <h3>{t('ui.march.selectGeneral')}</h3>
          <div className={styles.officers}>
            {model.officers.map((officer) => (
              <button
                type="button"
                key={officer.id}
                aria-pressed={draft.leaderOfficerId === officer.id}
                onClick={() => chooseLeader(officer.id)}
              >
                {t('ui.march.officerRow', officer)}
              </button>
            ))}
          </div>
        </section>
        <section>
          <h3>{t('ui.march.selectDeputies', { max: BAL.maxDeputies })}</h3>
          <div className={styles.officers}>
            {model.officers
              .filter((officer) => officer.id !== draft.leaderOfficerId)
              .map((officer) => (
                <button
                  type="button"
                  key={officer.id}
                  aria-pressed={draft.subOfficerIds.includes(officer.id)}
                  disabled={
                    !draft.subOfficerIds.includes(officer.id) &&
                    draft.subOfficerIds.length >= BAL.maxDeputies
                  }
                  onClick={() => toggleDeputy(officer.id)}
                >
                  {officer.name}
                </button>
              ))}
          </div>
        </section>
        <NumberSlider
          label={t('ui.march.soldiers')}
          min={0}
          max={soldierMax}
          step={100}
          value={Math.min(draft.soldiers, soldierMax)}
          unit={t('term.unit.people')}
          onChange={(soldiers) =>
            update({
              soldiers,
              food: Math.min(
                draft.food,
                Math.floor(soldiers * BAL.fieldFoodPerSoldierDaily * BAL.maxCarryDays),
              ),
            })
          }
        />
        <NumberSlider
          label={t('ui.march.food')}
          min={0}
          max={foodMax}
          step={100}
          value={Math.min(draft.food, foodMax)}
          unit={t('term.unit.koku')}
          onChange={(food) => update({ food })}
        />
        <p>{t('ui.march.foodDays', { days: supportedDays })}</p>
        <button
          type="button"
          disabled={leader === undefined}
          onClick={() => update({ phase: 'pickTarget', errorKey: null })}
        >
          {t('ui.march.pickTargetAction')}
        </button>
        {draft.targetNodeId !== null && draft.previewDays !== null && (
          <p>
            {t('ui.march.pathSummary', {
              from: model.castle.name,
              to: model.names[draft.targetNodeId] ?? draft.targetNodeId,
              via,
              days: draft.previewDays,
            })}
          </p>
        )}
        {(feedback ?? draft.errorKey) && <p role="alert">{feedback ?? t(draft.errorKey!)}</p>}
      </div>
    </Dialog>
  );
}
