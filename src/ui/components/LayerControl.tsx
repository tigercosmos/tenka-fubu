import { useState, type ReactElement } from 'react';
import type { MapAnalysisMode } from '@app/store';
import { t } from '@i18n/zh-TW';
import { useUIStore } from '../hooks/uiStore';
import styles from './LayerControl.module.css';
import { ANALYSIS_COLORS } from '../map/analysisOverlay/analysisColors';

const modes: readonly MapAnalysisMode[] = [
  'none',
  'faction',
  'supply',
  'roadCapacity',
  'terrainAdvantage',
  'castleDefense',
];
const legendKeys = {
  faction: 'ui.map.layers.factionLegend',
  supply: 'ui.map.layers.supplyLegend',
  roadCapacity: 'ui.map.layers.roadLegend',
  terrainAdvantage: 'ui.map.layers.terrainLegend',
  castleDefense: 'ui.map.layers.defenseLegend',
} as const;

const swatches = {
  faction: [],
  supply: [
    ['healthy', 'supplyHealthy'],
    ['low', 'supplyLow'],
    ['critical', 'supplyCritical'],
  ],
  roadCapacity: [
    ['critical', 'road1'],
    ['low', 'road2'],
    ['healthy', 'road3'],
    ['sea', 'sea'],
  ],
  terrainAdvantage: [
    ['plain', 'plain'],
    ['mountain', 'mountain'],
  ],
  castleDefense: [
    ['healthy', 'defenseHealthy'],
    ['low', 'defenseLow'],
    ['critical', 'defenseCritical'],
  ],
} as const;

/** Mutually exclusive presentation controls; changes never enter the command queue. */
export function LayerControl(): ReactElement {
  const [expanded, setExpanded] = useState(false);
  const mode = useUIStore((state) => state.analysisMode);
  const opacity = useUIStore((state) => state.analysisOpacity);
  const actions = useUIStore((state) => state.actions);
  return (
    <section
      className={styles.root}
      aria-label={t('ui.map.layers.title')}
      data-testid="layer-control"
      data-compact={!expanded && mode === 'none'}
    >
      <details onToggle={(event) => setExpanded(event.currentTarget.open)}>
        <summary>
          {t('ui.map.layers.title')} · {t(`ui.map.mode.${mode}`)}
        </summary>
        <fieldset className={styles.modes}>
          <legend>{t('ui.map.layers.title')}</legend>
          {modes.map((item, index) => (
            <label key={item}>
              <input
                type="radio"
                name="map-analysis-mode"
                value={item}
                checked={mode === item}
                onChange={() => actions.setAnalysisMode(item)}
              />
              {t(`ui.map.mode.${item}`)}
              {index > 0 && <kbd>Alt+{index}</kbd>}
            </label>
          ))}
        </fieldset>
        <label className={styles.opacity}>
          {t('ui.map.layers.opacity')} {Math.round(opacity * 100)}%
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={Math.round(opacity * 100)}
            disabled={mode === 'none'}
            aria-label={t('ui.map.layers.opacity')}
            onChange={(event) =>
              actions.setAnalysisOpacity(Number(event.currentTarget.value) / 100)
            }
          />
        </label>
      </details>
      {mode !== 'none' && (
        <div
          className={styles.legend}
          role="status"
          aria-live="polite"
          data-testid="analysis-legend"
        >
          <strong>
            {t('ui.map.layers.legend')} · {t(`ui.map.mode.${mode}`)}
          </strong>
          <span>{t(legendKeys[mode])}</span>
          {swatches[mode].map(([color, label]) => (
            <span key={label} className={styles.legendItem}>
              <svg width="16" height="16" aria-hidden="true">
                <circle
                  cx="8"
                  cy="8"
                  r="6"
                  fill={`#${ANALYSIS_COLORS[color].toString(16).padStart(6, '0')}`}
                />
              </svg>
              {t(`ui.map.legend.${label}`)}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
