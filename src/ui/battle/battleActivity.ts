import type { BattleUnitActivity } from '@app/battleBridge';
import { t } from '@i18n/zh-TW';

export type BattleStatusKind =
  'exited' | 'depleted' | 'routed' | 'contact' | 'moving' | 'immobile' | 'missingEdge' | 'idle';
export interface BattleStatusBadge {
  readonly kind: BattleStatusKind;
  readonly label: string;
  readonly description: string;
}

/** Presentation only: contact is legal range, never proof of a strike or queued intent. */
export function formatBattleActivity(
  activity: Readonly<BattleUnitActivity> | null,
): readonly BattleStatusBadge[] {
  if (activity === null) return [];
  const badge = (kind: BattleStatusKind): BattleStatusBadge => ({
    kind,
    label: t(`ui.battle.unit.${kind}`),
    description:
      kind === 'contact' ? t('ui.battle.unit.contactDescription') : t(`ui.battle.unit.${kind}`),
  });
  if (activity.exited) return [badge('exited')];
  if (activity.depleted) return [badge('depleted')];
  if (activity.routed) return [badge('routed')];
  const badges: BattleStatusBadge[] = [];
  if (activity.contactEnemyUnitIds.length > 0) badges.push(badge('contact'));
  if (activity.moving) badges.push(badge('moving'));
  else if (activity.moveTargetJinId !== null && activity.movementBlockedReason === 'immobile')
    badges.push(badge('immobile'));
  else if (activity.moveTargetJinId !== null && activity.movementBlockedReason === 'missingEdge')
    badges.push(badge('missingEdge'));
  return badges.length ? badges : [badge('idle')];
}
