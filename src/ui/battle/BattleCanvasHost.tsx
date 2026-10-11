import { useEffect, useId, useRef, useState, type ReactElement } from 'react';
import type { BattleSide, BattleState } from '@core/state/gameState';
import { t } from '@i18n/zh-TW';
import { useUIStore } from '../hooks/uiStore';
import { waitForMapFont } from '../map/mapFontReady';
import { BattleRenderer } from './BattleRenderer';
import { projectBattleView } from './battleViewModel';
import styles from './BattleCanvasHost.module.css';
import { getBattleUnitActivity } from '@app/battleBridge';
import { formatBattleActivity } from './battleActivity';

export interface BattleCanvasHostProps {
  battle: Readonly<BattleState>;
  playerSide: BattleSide;
  selectedUnitId: string | null;
  unitName: (id: string) => string;
  onSelectUnit: (id: string) => void;
  onSelectEnemy: (id: string) => void;
  onMoveJin: (id: string) => void;
  disabled?: boolean;
  /** Isolated presentation fixtures may override scale without writing the application store. */
  uiScale?: number;
}

/** The canvas is decorative; co-projected native controls own every interaction. */
export function BattleCanvasHost(props: BattleCanvasHostProps): ReactElement {
  const { battle, playerSide, selectedUnitId, unitName, disabled = false } = props;
  const storedScale = useUIStore((state) => state.uiScale);
  const uiScale = props.uiScale ?? storedScale;
  const descriptionId = useId();
  const [failed, setFailed] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const canvasHost = useRef<HTMLDivElement>(null);
  const renderer = useRef<BattleRenderer | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  // Core ticks mutate the existing battle object; object identity is not a revision.
  const view = projectBattleView(battle, size.width, size.height, uiScale, selectedUnitId);
  const latestView = useRef(view);
  latestView.current = view;

  useEffect(() => {
    const element = root.current;
    if (!element) return;
    let disposed = false;
    let resolutionQuery: MediaQueryList | null = null;
    const measure = () => {
      if (disposed) return;
      const { width, height } = element.getBoundingClientRect();
      setSize((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height },
      );
      // A paused DPR-only change needs a buffer resize even with identical CSS bounds.
      renderer.current?.update(latestView.current);
    };
    const armResolution = () => {
      resolutionQuery?.removeEventListener?.('change', resolutionChanged);
      resolutionQuery =
        typeof window.matchMedia === 'function'
          ? window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
          : null;
      resolutionQuery?.addEventListener?.('change', resolutionChanged);
    };
    const resolutionChanged = () => {
      if (disposed) return;
      measure();
      armResolution();
    };
    measure();
    window.addEventListener('resize', measure);
    armResolution();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    return () => {
      disposed = true;
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      resolutionQuery?.removeEventListener?.('change', resolutionChanged);
    };
  }, []);

  useEffect(() => {
    const host = canvasHost.current;
    if (!host) return;
    let disposed = false;
    const instance = new BattleRenderer();
    void waitForMapFont()
      .then(async () => {
        if (disposed) return;
        await instance.init(host);
        if (disposed) {
          instance.destroy();
          return;
        }
        renderer.current = instance;
        instance.update(latestView.current);
      })
      .catch(() => {
        if (renderer.current === instance) renderer.current = null;
        instance.destroy();
        if (!disposed) setFailed(true);
      });
    return () => {
      disposed = true;
      if (renderer.current === instance) renderer.current = null;
      instance.destroy();
    };
  }, []);
  useEffect(() => {
    renderer.current?.update(view);
  }, [view]);

  return (
    <div
      ref={root}
      className={styles.root}
      data-testid="battlefield"
      data-node-count={view.nodes.length}
      data-edge-count={view.edges.length}
      aria-label={t('ui.battle.battlefield')}
      role="group"
    >
      <div
        ref={canvasHost}
        className={styles.canvas}
        aria-hidden="true"
        data-testid="battle-canvas"
      />
      {failed && (
        <p className={styles.error} role="status">
          {t('ui.battle.mapUnavailable')}
        </p>
      )}
      {view.nodes.map((node) => {
        const enemyPresent = battle.units.some(
          (unit) =>
            unit.jinId === node.id &&
            unit.side !== playerSide &&
            !unit.exited &&
            !unit.routed &&
            unit.troops > 0,
        );
        return (
          <button
            key={node.id}
            type="button"
            className={styles.node}
            style={{
              left: node.hitBox.x,
              top: node.hitBox.y,
              width: node.hitBox.width,
              height: node.hitBox.height,
            }}
            data-projection-x={node.x}
            data-projection-y={node.y}
            data-glyph-left={node.glyphBox.x}
            data-glyph-top={node.glyphBox.y}
            data-glyph-right={node.glyphBox.x + node.glyphBox.width}
            data-glyph-bottom={node.glyphBox.y + node.glyphBox.height}
            data-testid={`battle-jin-${node.id}`}
            aria-label={`${node.isHonjin ? `${t('ui.battle.honjin')} ${node.id}` : node.id} ${t('ui.battle.flag', { value: Math.max(0, Math.round(node.flagPower)) })}`}
            aria-describedby={`${descriptionId}-node-${node.id}`}
            disabled={disabled || selectedUnitId === null || enemyPresent}
            onClick={() => props.onMoveJin(node.id)}
          >
            <span className={styles.srOnly} id={`${descriptionId}-node-${node.id}`}>
              {t(`ui.battle.side.${node.owner}`)}{' '}
              {t('ui.battle.defense', { value: Math.round(node.defenseBonus * 100) })}
            </span>
            {failed && node.id}
          </button>
        );
      })}
      {view.units.map((unit) => (
        <button
          key={unit.id}
          type="button"
          className={styles.unit}
          style={{
            left: unit.hitBox.x,
            top: unit.hitBox.y,
            width: unit.hitBox.width,
            height: unit.hitBox.height,
          }}
          data-projection-x={unit.x}
          data-projection-y={unit.y}
          data-glyph-left={unit.glyphBox.x}
          data-glyph-top={unit.glyphBox.y}
          data-glyph-right={unit.glyphBox.x + unit.glyphBox.width}
          data-glyph-bottom={unit.glyphBox.y + unit.glyphBox.height}
          data-testid={`battle-unit-${unit.id}`}
          data-side={unit.side}
          aria-describedby={`${descriptionId}-unit-${unit.id}`}
          aria-pressed={unit.side === playerSide ? unit.selected : undefined}
          aria-label={
            unit.side === playerSide
              ? `${unitName(unit.id)} ${t('ui.battle.troops', { count: unit.troops })}`
              : t('ui.battle.enemyTroops', { count: unit.troops })
          }
          disabled={disabled || unit.routed || unit.troops <= 0}
          onClick={() =>
            unit.side === playerSide ? props.onSelectUnit(unit.id) : props.onSelectEnemy(unit.id)
          }
        >
          <span className={styles.srOnly} id={`${descriptionId}-unit-${unit.id}`}>
            {unitName(unit.id)} {t('ui.battle.morale', { value: unit.morale })}{' '}
            {formatBattleActivity(getBattleUnitActivity(battle, unit.id)).map((status) => (
              <span key={status.kind} data-battle-status={status.kind}>
                {status.description}{' '}
              </span>
            ))}
          </span>
          {failed && unit.troops}
        </button>
      ))}
    </div>
  );
}
