import type { ReactElement } from 'react';
import { dispatchCommand, type CommandDispatchResult } from '@app/bridge';
import { BAL } from '@core/balance';
import type { Command } from '@core/commands/types';
import type { SiegeId } from '@core/state/ids';
import { t } from '@i18n/zh-TW';
import { ProgressBar } from '@ui/components';
import { makeCachedSelector, useCachedGameSelector } from '@ui/hooks/useGameSelector';
import styles from './SiegeOverlay.module.css';
import { useUIStore } from '@ui/hooks/uiStore';

type Dispatch = (command: Command) => CommandDispatchResult | void;

export interface SiegeOverlayProps {
  siegeId: SiegeId;
  onCommand?: Dispatch;
  anchor?: { x: number; y: number };
}

const selectSiegeModel = makeCachedSelector((game, siegeId: SiegeId) => {
  const siege = game.sieges[siegeId];
  if (siege === undefined) return null;
  const castle = game.castles[siege.castleId];
  if (castle === undefined || siege.attackerClanId !== game.meta.playerClanId) return null;
  const dailyFood = Math.max(
    1,
    ((castle.soldiers * BAL.garrisonFoodPerSoldierMonthly) / 30) *
      (siege.mode === 'encircle' ? BAL.encircleFoodMult : 1),
  );
  return {
    playerClanId: game.meta.playerClanId,
    siege,
    castle,
    days: Math.max(1, game.time.day - siege.startDay + 1),
    foodDays: Math.max(0, Math.ceil(castle.food / dailyFood)),
  };
});

export function SiegeOverlay({
  siegeId,
  onCommand = dispatchCommand,
  anchor,
}: SiegeOverlayProps): ReactElement | null {
  const model = useCachedGameSelector(selectSiegeModel, siegeId);
  const mapCamera = useUIStore((state) => state.mapCamera);
  if (model === null) return null;
  const projectedAnchor =
    anchor ??
    (mapCamera === null
      ? undefined
      : {
          x:
            mapCamera.width / 2 +
            (model.castle.pos.x - mapCamera.camera.x) * mapCamera.camera.scale,
          y:
            mapCamera.height / 2 +
            (model.castle.pos.y - mapCamera.camera.y) * mapCamera.camera.scale,
        });
  const setMode = (mode: 'encircle' | 'assault') => {
    if (mode === model.siege.mode) return;
    onCommand({ type: 'setSiegeMode', clanId: model.playerClanId, siegeId, mode });
  };
  return (
    <aside
      className={styles.overlay}
      data-testid="siege-overlay"
      style={
        projectedAnchor === undefined
          ? undefined
          : { left: projectedAnchor.x, top: projectedAnchor.y }
      }
    >
      <h3>{t('ui.siege.title', { castle: model.castle.name, days: model.days })}</h3>
      <ProgressBar
        value={model.castle.durability}
        max={model.castle.maxDurability}
        color="gold"
        label={t('ui.siege.durabilityValue', {
          value: model.castle.durability,
          max: model.castle.maxDurability,
        })}
      />
      <ProgressBar
        value={model.castle.morale}
        max={100}
        label={t('ui.siege.moraleValue', { value: model.castle.morale })}
      />
      <ProgressBar
        value={model.foodDays}
        max={Math.max(30, model.foodDays)}
        color="vermilion"
        label={t('ui.siege.castleFoodEst', { days: model.foodDays })}
      />
      <fieldset>
        <legend>{t('ui.siege.mode')}</legend>
        <label>
          <input
            type="radio"
            name={`siege-${siegeId}`}
            checked={model.siege.mode === 'encircle'}
            onChange={() => setMode('encircle')}
          />
          {t('ui.siege.encircle')}
        </label>
        <label>
          <input
            type="radio"
            name={`siege-${siegeId}`}
            checked={model.siege.mode === 'assault'}
            onChange={() => setMode('assault')}
          />
          {t('ui.siege.assault')}
        </label>
      </fieldset>
    </aside>
  );
}
