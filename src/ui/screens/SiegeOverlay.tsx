import type { ReactElement } from 'react';
import { dispatchCommand, type CommandDispatchResult } from '@app/bridge';
import { BAL } from '@core/balance';
import type { Command } from '@core/commands/types';
import type { SiegeId } from '@core/state/ids';
import { t } from '@i18n/zh-TW';
import { ProgressBar } from '@ui/components';
import { makeCachedSelector, useCachedGameSelector } from '@ui/hooks/useGameSelector';
import styles from './SiegeOverlay.module.css';

type Dispatch = (command: Command) => CommandDispatchResult | void;

export interface SiegeOverlayProps {
  siegeId: SiegeId;
  onCommand?: Dispatch;
  dock?: { left: number; top: number; maxHeight: number; maxWidth: number };
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
  const attackerSoldiers = siege.attackerArmyIds.reduce(
    (sum, armyId) => sum + (game.armies[armyId]?.soldiers ?? 0),
    0,
  );
  return {
    playerClanId: game.meta.playerClanId,
    siege,
    castle,
    canEncircle: attackerSoldiers >= castle.soldiers * BAL.encircleRatio,
    days: Math.max(1, game.time.day - siege.startDay + 1),
    foodDays: Math.max(0, Math.ceil(castle.food / dailyFood)),
  };
});

export function SiegeOverlay({
  siegeId,
  onCommand = dispatchCommand,
  dock,
}: SiegeOverlayProps): ReactElement | null {
  const model = useCachedGameSelector(selectSiegeModel, siegeId);
  if (model === null) return null;
  const setMode = (mode: 'encircle' | 'assault') => {
    if (mode === 'encircle' && !model.canEncircle) return;
    if (mode === model.siege.mode) return;
    onCommand({ type: 'setSiegeMode', clanId: model.playerClanId, siegeId, mode });
  };
  const encircleHintId = `siege-${siegeId}-encircle-need`;
  return (
    <aside
      className={styles.overlay}
      data-testid="siege-overlay"
      tabIndex={0}
      aria-labelledby={`siege-${siegeId}-title`}
      style={dock}
    >
      <h3 id={`siege-${siegeId}-title`}>
        {t('ui.siege.title', { castle: model.castle.name, days: model.days })}
      </h3>
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
            disabled={!model.canEncircle}
            aria-describedby={!model.canEncircle ? encircleHintId : undefined}
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
      {!model.canEncircle && (
        <p id={encircleHintId} className={styles.hint}>
          {t('ui.siege.encircleNeed', { ratio: BAL.encircleRatio })}
        </p>
      )}
    </aside>
  );
}
