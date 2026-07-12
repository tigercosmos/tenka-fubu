import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from '../IconButton/IconButton';
import styles from './Dialog.module.css';
export interface DialogProps {
  open: boolean;
  title: string;
  size?: 'sm' | 'md' | 'lg';
  onClose: () => void;
  closeOnBackdrop?: boolean;
  footer?: ReactNode;
  initialFocusRef?: RefObject<HTMLElement>;
  children: ReactNode;
}
let openDialogs = 0;
let originalBodyOverflow = '';
function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => {
    const style = getComputedStyle(el);
    return (
      !el.hasAttribute('disabled') &&
      !el.hidden &&
      style.display !== 'none' &&
      style.visibility !== 'hidden'
    );
  });
}
export function Dialog({
  open,
  title,
  size = 'md',
  onClose,
  closeOnBackdrop = true,
  footer,
  initialFocusRef,
  children,
}: DialogProps) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);
  const prior = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    prior.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (openDialogs === 0) originalBodyOverflow = document.body.style.overflow;
    openDialogs++;
    document.body.style.overflow = 'hidden';
    const frame = requestAnimationFrame(() => {
      const root = dialog.current;
      if (root) (initialFocusRef?.current ?? focusables(root)[0] ?? root).focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      openDialogs--;
      if (openDialogs === 0) document.body.style.overflow = originalBodyOverflow;
      prior.current?.focus();
    };
  }, [open, initialFocusRef]);
  if (!open) return null;
  const isTop = () => {
    const nodes = Array.from(document.querySelectorAll('[data-ui-dialog]'));
    return nodes.at(-1) === dialog.current;
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!isTop()) return;
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
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
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last?.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first?.focus();
    }
  };
  const backdrop = (e: MouseEvent<HTMLDivElement>) => {
    if (closeOnBackdrop && e.target === e.currentTarget && isTop()) onClose();
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
      >
        <header>
          <h2 id={titleId}>{title}</h2>
          <IconButton icon="close" ariaLabel={title} size="sm" onClick={onClose} />
        </header>
        <div className={styles.body}>{children}</div>
        {footer !== undefined && <footer>{footer}</footer>}
      </div>
    </div>,
    portal,
  );
}
