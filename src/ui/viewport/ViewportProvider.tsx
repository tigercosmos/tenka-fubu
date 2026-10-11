import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { store } from '@app/store';
import { t } from '@i18n/zh-TW';
import { recoverDialogFocus } from '../components/Dialog/focus';
import { isViewportTooSmall, ViewportContext } from './ViewportContext';
import styles from './ViewportProvider.module.css';

export function ViewportProvider({ children }: { children: ReactNode }) {
  const [blocked, setBlocked] = useState(() =>
    isViewportTooSmall(window.innerWidth, window.innerHeight),
  );
  const contentRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const resize = () => setBlocked(isViewportTooSmall(window.innerWidth, window.innerHeight));
    window.addEventListener('resize', resize);
    // Re-read at subscription time in case the viewport changed during mounting.
    resize();
    return () => window.removeEventListener('resize', resize);
  }, []);
  useLayoutEffect(() => {
    store.getState().actions.setViewportBlocked(blocked);
  }, [blocked]);
  useLayoutEffect(() => () => store.getState().actions.setViewportBlocked(false), []);

  useLayoutEffect(() => {
    if (!blocked) return;
    const overlay = overlayRef.current;
    if (document.activeElement instanceof HTMLElement && document.activeElement !== document.body)
      restoreFocusRef.current = document.activeElement;
    // Dialogs/tooltips are body portals, not descendants of the inert content wrapper.
    const prior = new Map<HTMLElement, { inert: string | null; hidden: string | null }>();
    const shieldPortals = () => {
      for (const child of document.body.children) {
        if (
          !(child instanceof HTMLElement) ||
          child.contains(contentRef.current) ||
          child.contains(overlay)
        )
          continue;
        if (!prior.has(child))
          prior.set(child, {
            inert: child.getAttribute('inert'),
            hidden: child.getAttribute('aria-hidden'),
          });
        child.setAttribute('inert', '');
        child.setAttribute('aria-hidden', 'true');
      }
    };
    shieldPortals();
    const observer = new MutationObserver(shieldPortals);
    observer.observe(document.body, { childList: true });
    const keyShield = (event: KeyboardEvent) => {
      // Leave browser recovery/navigation available; only intercept app-owned chords.
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() !== 's') return;
      if (event.altKey && !/^[1-5]$/.test(event.key)) return;
      if (event.key === 'F12') return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };
    const focusShield = (event: FocusEvent) => {
      if (event.target instanceof Node && !overlay?.contains(event.target)) overlay?.focus();
    };
    window.addEventListener('keydown', keyShield, true);
    window.addEventListener('focusin', focusShield, true);
    overlay?.focus();
    return () => {
      observer.disconnect();
      window.removeEventListener('keydown', keyShield, true);
      window.removeEventListener('focusin', focusShield, true);
      for (const [node, attributes] of prior) {
        for (const [name, value] of [
          ['inert', attributes.inert],
          ['aria-hidden', attributes.hidden],
        ] as const) {
          if (value === null) node.removeAttribute(name);
          else node.setAttribute(name, value);
        }
      }
      const previous = restoreFocusRef.current;
      restoreFocusRef.current = null;
      recoverDialogFocus(previous);
    };
  }, [blocked]);

  return (
    <ViewportContext.Provider value={blocked}>
      <div ref={contentRef} {...(blocked ? { inert: '', 'aria-hidden': true } : {})}>
        {children}
      </div>
      {blocked && (
        <div
          ref={overlayRef}
          className={styles.overlay}
          role="alertdialog"
          aria-modal="true"
          aria-label={t('ui.system.tooSmall')}
          tabIndex={-1}
          data-testid="viewport-too-small"
        >
          <p>{t('ui.system.tooSmall')}</p>
        </div>
      )}
    </ViewportContext.Provider>
  );
}
