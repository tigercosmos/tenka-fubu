import { useId, useState } from 'react';
import type { GameSettings, SettingsPatch } from '../../app/settings';
import { t, type StringKey } from '@i18n/zh-TW';
import { ConfirmDialog } from '../components';
import { UI } from '../uiConstants';
import styles from './SettingsPanel.module.css';

type SettingsStringKey = Extract<StringKey, `ui.settings.${string}`> | 'ui.common.back';

export interface SettingsPanelProps {
  settings: GameSettings;
  onChange: (patch: SettingsPatch) => void;
  onReset: () => void;
  onClose: () => void;
  persistenceError?: boolean;
  translate?: (key: SettingsStringKey) => string;
}

const ARRIVAL_KEYS: readonly (keyof GameSettings['autoPause'])[] = [
  'monthStart',
  'proposal',
  'envoy',
  'siege',
  'battle',
  'event',
];

/** Controlled preferences: no persistence, core state or pause ownership is hidden in this view. */
export function SettingsPanel({
  settings,
  onChange,
  onReset,
  onClose,
  persistenceError = false,
  translate = t,
}: SettingsPanelProps) {
  const [resetOpen, setResetOpen] = useState(false);
  const id = useId();
  const choices = <T extends string>(
    label: SettingsStringKey,
    values: readonly T[],
    selected: T,
    change: (value: T) => void,
    optionLabel: (value: T) => string,
  ) => (
    <fieldset className={styles.row}>
      <legend>{translate(label)}</legend>
      <div className={styles.choices}>
        {values.map((value) => (
          <label key={value} className={styles.choice}>
            <input
              type="radio"
              name={`${id}-${label}`}
              value={value}
              checked={selected === value}
              onChange={() => change(value)}
            />
            {optionLabel(value)}
          </label>
        ))}
      </div>
    </fieldset>
  );
  return (
    <section className={styles.panel} data-testid="settings-panel" aria-labelledby={`${id}-title`}>
      <header className={styles.header}>
        <h2 id={`${id}-title`}>{translate('ui.settings.title')}</h2>
        <button type="button" onClick={onClose}>
          {translate('ui.common.back')}
        </button>
      </header>
      <div className={styles.body}>
        <section className={styles.group} aria-labelledby={`${id}-time`}>
          <h3 id={`${id}-time`}>{translate('ui.settings.groupTime')}</h3>
          {choices(
            'ui.settings.defaultSpeed',
            ['x1', 'x2', 'x5'],
            settings.defaultSpeed,
            (defaultSpeed) => onChange({ defaultSpeed }),
            (value) => t(`ui.speed.${value}`),
          )}
          <fieldset className={styles.pauses}>
            <legend>{translate('ui.settings.autoPause')}</legend>
            {ARRIVAL_KEYS.map((key) => (
              <label className={styles.toggle} key={key}>
                <span>{translate(`ui.settings.autoPause.${key}`)}</span>
                <input
                  type="checkbox"
                  role="switch"
                  checked={settings.autoPause[key]}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter') return;
                    event.preventDefault();
                    onChange({ autoPause: { [key]: !settings.autoPause[key] } });
                  }}
                  onChange={(event) =>
                    onChange({ autoPause: { [key]: event.currentTarget.checked } })
                  }
                />
              </label>
            ))}
          </fieldset>
        </section>
        <section className={styles.group} aria-labelledby={`${id}-notify`}>
          <h3 id={`${id}-notify`}>{translate('ui.settings.groupNotify')}</h3>
          {choices(
            'ui.settings.notificationFilter',
            ['all', 'major', 'critical'],
            settings.notificationFilter,
            (notificationFilter) => onChange({ notificationFilter }),
            (value) => translate(`ui.settings.notificationFilter.${value}`),
          )}
          {choices(
            'ui.settings.mapLabelDensity',
            ['high', 'medium', 'low'],
            settings.mapLabelDensity,
            (mapLabelDensity) => onChange({ mapLabelDensity }),
            (value) => translate(`ui.settings.mapLabelDensity.${value}`),
          )}
          <label className={styles.toggle}>
            <span>{translate('ui.settings.effects')}</span>
            <input
              type="checkbox"
              role="switch"
              checked={settings.effectsEnabled}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                onChange({ effectsEnabled: !settings.effectsEnabled });
              }}
              onChange={(event) => onChange({ effectsEnabled: event.currentTarget.checked })}
            />
          </label>
        </section>
        <section className={styles.group} aria-labelledby={`${id}-display`}>
          <h3 id={`${id}-display`}>{translate('ui.settings.groupDisplay')}</h3>
          <label className={styles.toggle} htmlFor={`${id}-scale`}>
            <span>
              {translate('ui.settings.uiScale')}{' '}
              <output>{Math.round(settings.uiScale * 100)}%</output>
            </span>
            <input
              id={`${id}-scale`}
              type="range"
              min={UI.uiScaleMin}
              max={UI.uiScaleMax}
              step={UI.uiScaleStep}
              value={settings.uiScale}
              aria-label={translate('ui.settings.uiScale')}
              onChange={(event) => onChange({ uiScale: Number(event.currentTarget.value) })}
            />
          </label>
          <label className={styles.toggle}>
            <span>{translate('ui.settings.language')}</span>
            <select disabled value="zh-TW" aria-label={translate('ui.settings.language')}>
              <option value="zh-TW">{translate('ui.settings.languageValue')}</option>
            </select>
          </label>
        </section>
        {persistenceError && <p role="status">{translate('ui.settings.persistenceWarning')}</p>}
      </div>
      <footer>
        <button type="button" onClick={() => setResetOpen(true)}>
          {translate('ui.settings.reset')}
        </button>
      </footer>
      <ConfirmDialog
        open={resetOpen}
        title={translate('ui.settings.reset')}
        message={translate('ui.settings.resetConfirm')}
        onCancel={() => setResetOpen(false)}
        onConfirm={() => {
          onReset();
          setResetOpen(false);
        }}
      />
    </section>
  );
}
