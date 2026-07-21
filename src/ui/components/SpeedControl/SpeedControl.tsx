import { t } from '@i18n/zh-TW';
import { IconButton } from '../IconButton/IconButton';
import styles from './SpeedControl.module.css';
export type GameSpeed = 'paused' | 'x1' | 'x2' | 'x5';
export interface SpeedControlProps {
  speed: GameSpeed;
  onChange: (s: GameSpeed) => void;
  disabled?: boolean;
}
// 第四欄 testId：e2e 契約 data-testid（M6-V9 §4.3；17 §6.2 speed-pause/speed-1/speed-2/speed-5）。
const options = [
  ['paused', 'pause', 'ui.speed.aria.pause', 'speed-pause'],
  ['x1', 'play', 'ui.speed.aria.x1', 'speed-1'],
  ['x2', 'ff2', 'ui.speed.aria.x2', 'speed-2'],
  ['x5', 'ff5', 'ui.speed.aria.x5', 'speed-5'],
] as const;
export function SpeedControl({ speed, onChange, disabled = false }: SpeedControlProps) {
  return (
    <div className={`${styles.root} ${speed === 'paused' ? styles.paused : ''}`}>
      {options.map(([id, icon, key, testId]) => (
        <IconButton
          key={id}
          icon={icon}
          ariaLabel={t(key)}
          toggled={speed === id}
          disabled={disabled}
          testId={testId}
          onClick={() => onChange(id)}
        />
      ))}
    </div>
  );
}
