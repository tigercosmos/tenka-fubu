import {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { UI } from '@ui/uiConstants';
import { useUIStore } from '../../hooks/uiStore';
import { logicalPxToRem, scaledUiPixels } from '../../layout/sizing';
import { claimTooltip, releaseTooltip } from './ownership';
import styles from './Tooltip.module.css';
export interface TooltipProps {
  content: ReactNode;
  delayMs?: number;
  follow?: boolean;
  maxWidth?: number;
  disabled?: boolean;
  children: ReactElement;
}
export function Tooltip({
  content,
  delayMs = UI.tooltipDelayMs,
  follow = false,
  maxWidth = 280,
  disabled = false,
  children,
}: TooltipProps) {
  const uiScale = useUIStore((state) => state.uiScale);
  const id = useId();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [point, setPoint] = useState({ x: 0, y: 0 });
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const tip = useRef<HTMLDivElement | null>(null);
  const hide = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    setVisible(false);
    releaseTooltip(hide);
  }, []);
  const show = (immediate = false) => {
    if (disabled) return;
    claimTooltip(hide);
    if (immediate) setVisible(true);
    else timer.current = setTimeout(() => setVisible(true), delayMs);
  };
  useEffect(() => hide, [hide]);
  useEffect(() => {
    if (!visible || tip.current === null || trigger.current === null) return;
    const rect = trigger.current.getBoundingClientRect();
    const box = tip.current.getBoundingClientRect();
    const inset = scaledUiPixels(8, uiScale);
    const offsetX = scaledUiPixels(UI.tooltipFollowOffsetX, uiScale);
    const offsetY = scaledUiPixels(UI.tooltipFollowOffsetY, uiScale);
    let x = follow ? point.x + offsetX : rect.left + (rect.width - box.width) / 2;
    let y = follow ? point.y + offsetY : rect.top - box.height - inset;
    if (x + box.width > innerWidth - inset)
      x = follow ? point.x - box.width - offsetX : innerWidth - box.width - inset;
    x = Math.max(inset, x);
    if (y < inset || y + box.height > innerHeight - inset)
      y = follow ? point.y + offsetY : rect.bottom + inset;
    setPos({ x, y });
  }, [visible, follow, point, maxWidth, uiScale]);
  if (!isValidElement(children)) return children;
  const child = cloneElement(children as ReactElement<Record<string, unknown>>, {
    ref: (node: HTMLElement | null) => {
      trigger.current = node;
    },
    'aria-describedby': visible ? id : undefined,
    onPointerEnter: (e: PointerEvent<HTMLElement>) => {
      setPoint({ x: e.clientX, y: e.clientY });
      show();
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      if (follow) setPoint({ x: e.clientX, y: e.clientY });
    },
    onPointerLeave: hide,
    onPointerDown: hide,
    onFocus: () => show(true),
    onBlur: hide,
  });
  const root = document.getElementById('tooltip-root') ?? document.body;
  return (
    <>
      {child}
      {visible &&
        createPortal(
          <div
            ref={tip}
            id={id}
            role="tooltip"
            className={styles.tip}
            style={{ left: pos.x, top: pos.y, maxWidth: logicalPxToRem(maxWidth) }}
          >
            {content}
          </div>,
          root,
        )}
    </>
  );
}
