import { useEffect, useState, type KeyboardEvent } from 'react';
import { t } from '@i18n/zh-TW';
import styles from './NumberSlider.module.css';
export interface NumberSliderProps {
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
  label?: string;
  unit?: string;
  quickRatios?: number[];
}
function snap(v: number, min: number, max: number, step: number) {
  const clamped = Math.max(min, Math.min(max, v));
  return Math.max(min, Math.min(max, min + Math.round((clamped - min) / step) * step));
}
export function NumberSlider({
  min,
  max,
  step = 100,
  value,
  onChange,
  label,
  unit = '',
  quickRatios = [0, 0.25, 0.5, 1],
}: NumberSliderProps) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = (v: number) => onChange(snap(v, min, max, step));
  const key = (e: KeyboardEvent<HTMLInputElement>) => {
    let v: number | undefined;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') v = value - step;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') v = value + step;
    if (e.key === 'PageDown') v = value - step * 10;
    if (e.key === 'PageUp') v = value + step * 10;
    if (e.key === 'Home') v = min;
    if (e.key === 'End') v = max;
    if (v !== undefined) {
      e.preventDefault();
      commit(v);
    }
  };
  const quickLabel = (r: number) =>
    r === 0
      ? t('ui.slider.none')
      : r === 0.25
        ? t('ui.slider.quarter')
        : r === 0.5
          ? t('ui.slider.half')
          : r === 1
            ? t('ui.slider.all')
            : `${Math.round(r * 100)}%`;
  return (
    <label className={styles.root}>
      {label && <span>{label}</span>}
      <div className={styles.controls}>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => commit(Number(e.currentTarget.value))}
          onKeyDown={key}
          aria-label={label}
        />
        <span className={styles.value}>
          <input
            type="number"
            value={text}
            min={min}
            max={max}
            step={step}
            onChange={(e) => setText(e.currentTarget.value)}
            onBlur={() => {
              if (text.trim() === '') {
                setText(String(value));
                return;
              }
              const n = Number(text);
              if (!Number.isFinite(n)) {
                setText(String(value));
                return;
              }
              commit(n);
            }}
          />
          {unit}
        </span>
      </div>
      <div className={styles.quick}>
        {quickRatios.map((r) => (
          <button type="button" key={r} onClick={() => commit(min + (max - min) * r)}>
            {quickLabel(r)}
          </button>
        ))}
      </div>
    </label>
  );
}
