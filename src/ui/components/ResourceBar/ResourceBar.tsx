import { useEffect, useRef, useState, type ReactNode } from 'react';
import { formatDate, formatNumber, t } from '@i18n/zh-TW';
import { clanColorHex, TOKENS } from '@ui/styles/tokens';
import { Icon, type IconName } from '../IconButton/icons';
import { Tooltip } from '../Tooltip/Tooltip';
import { useReducedMotion } from '../../motion/MotionContext';
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
  /** Current BudgetForecast coverage; Infinity means known zero consumption. */
  foodMonthsLeft?: number;
  soldiersTotal: number;
  soldiersCap: number;
  prestige: number;
  date: number;
  /** 勢力識別塊（M6-V9b §4.1：旗幟軌色章＋勢力名；省略＝不渲染，向後相容）。 */
  clanName?: string;
  clanColorIndex?: number;
}
function useTween(value: number) {
  const reducedMotion = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reducedMotion) {
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
  }, [value, reducedMotion]);
  return reducedMotion ? value : Math.round(shown);
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
  coverage,
}: {
  icon: IconName;
  label: string;
  value: number;
  delta?: ResourceDelta;
  children?: ReactNode;
  coverage?: ReactNode;
}) {
  const shown = useTween(value);
  const item = (
    <span className={styles.item} tabIndex={0}>
      <span className={styles.itemHeading}>
        <Icon name={icon} />
        <span>{label}</span>
      </span>
      <span className={coverage === undefined ? undefined : styles.foodValues}>
        <span className={styles.itemValue}>
          <strong>{formatNumber(shown)}</strong>
          {children}
        </span>
        {coverage}
      </span>
    </span>
  );
  return delta ? <Tooltip content={<Delta delta={delta} />}>{item}</Tooltip> : item;
}
function FoodCoverage({ months }: { months: number }) {
  if (!Number.isFinite(months) || months < 0)
    return (
      <span data-testid="food-coverage" className={styles.foodCoverage}>
        {t(months === Infinity ? 'ui.hud.foodNoConsumption' : 'ui.hud.foodCoverageUnknown')}
      </span>
    );
  const label = t('ui.budget.foodMonthsLeft', { months: formatNumber(months) });
  const [before, after] = t('ui.budget.foodMonthsLeft', { months: '\uFFFC' }).split('\uFFFC');
  return (
    <span data-testid="food-coverage" className={styles.foodCoverage} aria-label={label}>
      {before}
      <strong
        data-testid="food-coverage-months"
        className={months <= 2 ? styles.foodWarning : undefined}
      >
        {formatNumber(months)}
      </strong>
      {after}
    </span>
  );
}
export function ResourceBar(props: ResourceBarProps) {
  return (
    <div className={styles.root}>
      {/* 勢力識別塊（M6-V9b §4.1）：頂帶最左、資源緊隨——「勢力身分與資源同座」的原創轉譯；
          色章＝旗幟軌 clanColorHex（呼應名牌印記），≤1440px 以 CSS 斷點只留色章。 */}
      {props.clanName !== undefined && props.clanColorIndex !== undefined && (
        <span
          className={styles.clanIdentity}
          role="group"
          aria-label={t('ui.hud.clanIdentity', { clan: props.clanName.replace(/家$/u, '') })}
        >
          <span
            className={styles.clanChip}
            style={{ background: clanColorHex(props.clanColorIndex) }}
          />
          <strong className={styles.clanName}>{props.clanName}</strong>
        </span>
      )}
      {/* e2e 契約 data-testid（M6-V9 §4.2／§5；17 §6.2）：hud-date 隨 ResourceBar 遷移至此。 */}
      <time data-testid="hud-date">{formatDate(props.date)}</time>
      <Item icon="coin" label={t('ui.hud.gold')} value={props.gold} delta={props.goldDelta} />
      <Item
        icon="rice"
        label={t('ui.hud.food')}
        value={props.foodTotal}
        delta={props.foodDelta}
        coverage={
          props.foodMonthsLeft === undefined ? undefined : (
            <FoodCoverage months={props.foodMonthsLeft} />
          )
        }
      />
      <Item icon="people" label={t('ui.hud.soldiers')} value={props.soldiersTotal}>
        <span>/{formatNumber(props.soldiersCap)}</span>
      </Item>
      <Item icon="crown" label={t('ui.hud.prestige')} value={props.prestige} />
    </div>
  );
}
