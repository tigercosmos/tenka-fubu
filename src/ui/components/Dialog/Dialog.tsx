import {
  useEffect,
  useLayoutEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { isTypingTarget } from '@app/hotkeys';
import { IconButton } from '../IconButton/IconButton';
import { acquireFocus, focusables, recordOwnedFocus, restoreFocus } from './focus';
import styles from './Dialog.module.css';
export interface DialogProps {
  open: boolean;
  title: string;
  size?: 'sm' | 'md' | 'lg';
  onClose: () => void;
  closeOnBackdrop?: boolean;
  dismissible?: boolean;
  footer?: ReactNode;
  initialFocusRef?: RefObject<HTMLElement>;
  /** Stable subview identity; re-focus replaced content without remounting or changing pause ownership. */
  focusScopeKey?: string | number;
  children: ReactNode;
}
let openDialogs = 0;
let originalBodyOverflow = '';
export function Dialog({
  open,
  title,
  size = 'md',
  onClose,
  closeOnBackdrop = true,
  dismissible = true,
  footer,
  initialFocusRef,
  focusScopeKey,
  children,
}: DialogProps) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const prior = useRef<HTMLElement | null>(null);
  const priorScope = useRef(focusScopeKey);
  const latestInitialFocus = useRef(initialFocusRef);
  useLayoutEffect(() => {
    latestInitialFocus.current = initialFocusRef;
  }, [initialFocusRef]);
  useEffect(() => {
    if (!open) return;
    prior.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (openDialogs === 0) originalBodyOverflow = document.body.style.overflow;
    openDialogs++;
    document.body.style.overflow = 'hidden';
    const openingRoot = dialog.current;
    const frame = requestAnimationFrame(() => {
      const root = dialog.current;
      if (root) acquireFocus(root, latestInitialFocus.current?.current);
    });
    return () => {
      cancelAnimationFrame(frame);
      openDialogs--;
      if (openDialogs === 0) document.body.style.overflow = originalBodyOverflow;
      restoreFocus(openingRoot, prior.current);
    };
  }, [open]);
  useEffect(() => {
    const changed = priorScope.current !== focusScopeKey;
    priorScope.current = focusScopeKey;
    if (!open || !changed) return;
    const root = dialog.current;
    if (root) acquireFocus(root, initialFocusRef?.current);
  }, [open, focusScopeKey, initialFocusRef]);
  if (!open) return null;
  const isTop = () => {
    const nodes = Array.from(document.querySelectorAll('[data-ui-dialog]'));
    return nodes.at(-1) === dialog.current;
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!isTop()) return;
    if (
      e.key === 'Enter' &&
      !e.defaultPrevented &&
      !e.repeat &&
      !e.nativeEvent.isComposing &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey
    ) {
      // Native controls retain Enter (including cancel-first confirmations and multiline input).
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        target.closest(
          'button,a[href],input,select,textarea,[contenteditable="true"],[role="button"]',
        )
      )
        return;
      const primary = dialog.current?.querySelector<HTMLButtonElement>(
        'button[data-dialog-primary="true"]',
      );
      if (primary && !primary.disabled && primary.getAttribute('aria-disabled') !== 'true') {
        e.preventDefault();
        e.stopPropagation();
        primary.click();
      }
      return;
    }
    if (e.key === 'Escape') {
      e.stopPropagation();
      if (
        e.defaultPrevented ||
        e.repeat ||
        e.nativeEvent.isComposing ||
        e.nativeEvent.keyCode === 229 ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        e.shiftKey
      )
        return;
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        dialog.current?.contains(active) &&
        isTypingTarget(active)
      ) {
        e.preventDefault();
        active.blur();
        dialog.current.focus();
        return;
      }
      if (dismissible) onClose();
      return;
    }
    if (e.key !== 'Tab' || dialog.current === null) return;
    const nodes = focusables(dialog.current);
    if (nodes.length === 0) {
      e.preventDefault();
      dialog.current.focus();
      return;
    }
    const first = nodes[0];
    const last = nodes.at(-1);
    if (document.activeElement === dialog.current) {
      e.preventDefault();
      (e.shiftKey ? last : first)?.focus();
    } else if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  };
  const backdrop = (e: MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || !isTop()) return;
    if (dismissible && closeOnBackdrop) onClose();
    else e.preventDefault(); // A retained backdrop must not move native focus outside its Dialog.
  };
  const portal = document.getElementById('modal-root') ?? document.body;
  return createPortal(
    <div className={styles.backdrop} onMouseDown={backdrop}>
      <div
        data-ui-dialog
        ref={dialog}
        className={`${styles.dialog} ${styles[size]}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={key}
        onFocusCapture={(event) => {
          const root = dialog.current;
          if (root) recordOwnedFocus(root, event.target);
        }}
      >
        <header>
          <h2 id={titleId}>{title}</h2>
          {dismissible && <IconButton icon="close" ariaLabel={title} size="sm" onClick={onClose} />}
        </header>
        <div className={styles.body}>{children}</div>
        {footer !== undefined && <footer>{footer}</footer>}
      </div>
    </div>,
    portal,
  );
}
