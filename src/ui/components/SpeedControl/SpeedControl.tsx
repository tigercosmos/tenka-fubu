import { t } from '@i18n/zh-TW';
import { IconButton } from '../IconButton/IconButton';
import styles from './SpeedControl.module.css';
export type GameSpeed = 'paused' | 'x1' | 'x2' | 'x5';
export interface SpeedControlProps {
  speed: GameSpeed;
  onChange: (s: GameSpeed) => void;
  disabled?: boolean;
}
const options = [
  ['paused', 'pause', 'ui.speed.aria.pause'],
  ['x1', 'play', 'ui.speed.aria.x1'],
  ['x2', 'ff2', 'ui.speed.aria.x2'],
  ['x5', 'ff5', 'ui.speed.aria.x5'],
] as const;
export function SpeedControl({ speed, onChange, disabled = false }: SpeedControlProps) {
  return (
    <div className={`${styles.root} ${speed === 'paused' ? styles.paused : ''}`}>
      {options.map(([id, icon, key]) => (
        <IconButton
          key={id}
          icon={icon}
          ariaLabel={t(key)}
          toggled={speed === id}
          disabled={disabled}
          onClick={() => onChange(id)}
        />
      ))}
    </div>
  );
}
