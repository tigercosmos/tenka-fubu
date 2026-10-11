import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { mapHoverLines, type MapHoverTarget } from './mapHoverContent';
import { UI } from '../uiConstants';
import { claimTooltip, releaseTooltip } from '../components/Tooltip/ownership';
import styles from './MapHoverTooltip.module.css';
import { useUIStore } from '../hooks/uiStore';

export function MapHoverTooltip({
  target,
  onDismiss,
}: {
  target: MapHoverTarget | null;
  onDismiss: () => void;
}) {
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  const [shown, setShown] = useState<Pick<MapHoverTarget, 'game' | 'kind' | 'id'> | null>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const element = useRef<HTMLDivElement>(null);
  const uiScale = useUIStore((s) => s.uiScale);
  const timerRef = useRef<number | null>(null);
  const hide = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    setShown(null);
    releaseTooltip(hide);
    dismissRef.current();
  }, []);
  const game = target?.game;
  const kind = target?.kind;
  const id = target?.id;
  const visible = shown !== null && shown.game === game && shown.kind === kind && shown.id === id;
  const lines = target === null ? null : mapHoverLines(target.game, target.kind, target.id);
  const exists = lines !== null;
  useEffect(() => {
    setShown(null);
    if (!exists || game === undefined || kind === undefined || id === undefined) return;
    claimTooltip(hide);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setShown({ game, kind, id });
    }, UI.mapTooltipDelayMs);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
      releaseTooltip(hide);
    };
  }, [game, kind, id, exists, hide]);
  const updatePosition = useCallback(() => {
    if (!visible || target === null) return;
    const bounds = element.current?.getBoundingClientRect();
    const width = bounds?.width ?? 0;
    const height = bounds?.height ?? 0;
    let x = target.screenX + UI.mapTooltipOffsetPx;
    if (x + width > window.innerWidth - 8) x = target.screenX - width - UI.mapTooltipOffsetPx;
    const next = {
      x: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
      y: Math.max(
        8,
        Math.min(target.screenY + UI.mapTooltipOffsetPx, window.innerHeight - height - 8),
      ),
    };
    setPosition((old) => (old.x === next.x && old.y === next.y ? old : next));
  }, [visible, target]);
  useLayoutEffect(updatePosition, [updatePosition, lines?.join('\n'), uiScale]);
  useEffect(() => {
    if (!visible) return;
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updatePosition);
    if (element.current !== null) observer?.observe(element.current);
    window.addEventListener('resize', updatePosition);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', updatePosition);
    };
  }, [visible, updatePosition]);
  if (!visible || target === null || lines === null) return null;
  return createPortal(
    <div
      ref={element}
      role="tooltip"
      data-testid="map-hover-tooltip"
      data-kind={target.kind}
      className={styles.tip}
      style={{ left: position.x, top: position.y }}
    >
      {lines.map((line, index) => (
        <div key={index}>{line}</div>
      ))}
    </div>,
    document.getElementById('tooltip-root') ?? document.body,
  );
}
