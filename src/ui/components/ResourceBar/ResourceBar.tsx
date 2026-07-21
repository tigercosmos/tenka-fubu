import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatDate, formatNumber, t } from '@i18n/zh-TW';
import { TOKENS } from '@ui/styles/tokens';
import { Icon, type IconName } from '../IconButton/icons';
import { Tooltip } from '../Tooltip/Tooltip';
import styles from './ResourceBar.module.css';
export interface ResourceDeltaLine {
  label: string;
  value: number;
}
export interface ResourceDelta {
  perMonth: number;
  breakdown: ResourceDeltaLine[];
}
export interface ResourceBarProps {
  gold: number;
  goldDelta: ResourceDelta;
  foodTotal: number;
  foodDelta: ResourceDelta;
  soldiersTotal: number;
  soldiersCap: number;
  prestige: number;
  date: number;
}
function useTween(value: number) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = performance.now();
    const begin = from.current;
    let frame = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / TOKENS.duration.normal);
      const next = begin + (value - begin) * p;
      from.current = next;
      setShown(next);
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return Math.round(shown);
}
function Delta({ delta }: { delta: ResourceDelta }) {
  return (
    <div className={styles.delta}>
      <strong className={delta.perMonth >= 0 ? styles.positive : styles.negative}>
        {t('ui.hud.deltaPerMonth')} {delta.perMonth >= 0 ? '+' : ''}
        {formatNumber(delta.perMonth)}
      </strong>
      {delta.breakdown.map((line, i) => (
        <span key={`${line.label}-${i}`}>
          <span>{line.label}</span>
          <span>
            {line.value >= 0 ? '+' : ''}
            {formatNumber(line.value)}
          </span>
        </span>
      ))}
    </div>
  );
}
function Item({
  icon,
  label,
  value,
  delta,
  children,
}: {
  icon: IconName;
  label: string;
  value: number;
  delta?: ResourceDelta;
  children?: ReactNode;
}) {
  const shown = useTween(value);
  const item = (
    <span className={styles.item} tabIndex={0}>
      <Icon name={icon} />
      <span>{label}</span>
      <strong>{formatNumber(shown)}</strong>
      {children}
    </span>
  );
  return delta ? <Tooltip content={<Delta delta={delta} />}>{item}</Tooltip> : item;
}
export function ResourceBar(props: ResourceBarProps) {
  return (
    <div className={styles.root}>
      {/* e2e 契約 data-testid（M6-V9 §4.2／§5；17 §6.2）：hud-date 隨 ResourceBar 遷移至此。 */}
      <time data-testid="hud-date">{formatDate(props.date)}</time>
      <Item icon="coin" label={t('ui.hud.gold')} value={props.gold} delta={props.goldDelta} />
      <Item icon="rice" label={t('ui.hud.food')} value={props.foodTotal} delta={props.foodDelta} />
      <Item icon="people" label={t('ui.hud.soldiers')} value={props.soldiersTotal}>
        <span>/{formatNumber(props.soldiersCap)}</span>
      </Item>
      <Item icon="crown" label={t('ui.hud.prestige')} value={props.prestige} />
    </div>
  );
}
