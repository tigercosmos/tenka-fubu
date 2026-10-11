import type { GameSettings } from './schema';
import { buildBaseCssVarEntries } from '@ui/styles/tokens';

export interface SettingsApplyTargets {
  rootStyle?: Pick<CSSStyleDeclaration, 'setProperty'>;
  onMapSettings?: (settings: Pick<GameSettings, 'mapLabelDensity' | 'effectsEnabled'>) => void;
  onNotificationFilter?: (filter: GameSettings['notificationFilter']) => void;
  /** Arrival report preferences only; mandatory choice dialogs retain their own pause. */
  onArrivalAutoPause?: (preferences: GameSettings['autoPause']) => void;
  /** Configure the next session's resume speed, never change the running session's speed. */
  onDefaultSpeed?: (speed: GameSettings['defaultSpeed']) => void;
}

/** All effects are supplied by the app shell; the adapter neither accesses nor mutates core. */
export function applySettings(settings: GameSettings, targets: SettingsApplyTargets): void {
  targets.rootStyle?.setProperty('--ui-scale', String(settings.uiScale));
  targets.rootStyle?.setProperty('font-size', `calc(16px * ${settings.uiScale})`);
  // Preserve token values at scale 1 while allowing DOM text and spacing to follow rem scale.
  // Pixi continues to read the untouched numeric/source tokens and viewport dimensions.
  if (targets.rootStyle !== undefined) {
    for (const [name, value] of buildBaseCssVarEntries()) {
      if (
        (name.startsWith('--font-size-') || name.startsWith('--space-')) &&
        value.endsWith('px')
      ) {
        targets.rootStyle.setProperty(name, `${Number.parseFloat(value) / 16}rem`);
      }
    }
  }
  targets.onMapSettings?.({
    mapLabelDensity: settings.mapLabelDensity,
    effectsEnabled: settings.effectsEnabled,
  });
  targets.onNotificationFilter?.(settings.notificationFilter);
  targets.onArrivalAutoPause?.({ ...settings.autoPause });
  targets.onDefaultSpeed?.(settings.defaultSpeed);
}
