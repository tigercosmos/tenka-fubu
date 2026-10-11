import { createContext, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { t } from '@i18n/zh-TW';

export interface SaveConfirmationRequest {
  token: object;
  /** Original parent control, recorded before the child disables/hides its draft. */
  opener?: HTMLElement | null;
  title: string;
  message: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  onRevoke?: () => void;
}
export interface SaveConfirmationOwner {
  present(request: SaveConfirmationRequest, native: Element | undefined): boolean;
  dismiss(token: object): void;
  owns(token: object, native: Element | undefined): boolean;
  canUse(native: Element | undefined): boolean;
  isCurrent(): boolean;
  captureOwner(): () => boolean;
}
export const SaveConfirmationContext = createContext<SaveConfirmationOwner | null>(null);

/** A local subview lease: the parent retains its existing FIFO and pause ownership. */
export function useSaveConfirmationHost(
  canUse: (native: Element | undefined) => boolean,
  isCurrent: () => boolean,
) {
  const [request, setRequest] = useState<SaveConfirmationRequest | null>(null);
  const active = useRef<SaveConfirmationRequest | null>(null);
  const leaseOwner = useRef<(() => boolean) | null>(null);
  const openingFocus = useRef<{
    element: HTMLElement | null;
    native: Element;
    owns: () => boolean;
  } | null>(null);
  const returningFocus = useRef<typeof openingFocus.current>(null);
  const mounted = useRef(false);
  const currentScope = useRef(canUse);
  currentScope.current = canUse;
  const currentOwner = useRef(isCurrent);
  currentOwner.current = isCurrent;
  const cancelRef = useRef<HTMLButtonElement>(null);
  const focusKey = useRef(0);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      active.current = null;
      leaseOwner.current = null;
      openingFocus.current = null;
      returningFocus.current = null;
    };
  }, []);
  const [context] = useState<SaveConfirmationOwner>(() => ({
    present(next, native) {
      if (!mounted.current || active.current !== null || !currentScope.current(native))
        return false;
      active.current = next;
      leaseOwner.current = currentOwner.current;
      returningFocus.current = null;
      openingFocus.current =
        native === undefined
          ? null
          : {
              element:
                next.opener instanceof HTMLElement && native.contains(next.opener)
                  ? next.opener
                  : document.activeElement instanceof HTMLElement &&
                      native.contains(document.activeElement)
                    ? document.activeElement
                    : null,
              native,
              owns: currentOwner.current,
            };
      focusKey.current += 1;
      setRequest(next);
      return true;
    },
    dismiss(token) {
      if (!mounted.current || active.current?.token !== token) return;
      const opening = openingFocus.current;
      returningFocus.current =
        opening?.owns() && currentScope.current(opening.native) ? opening : null;
      openingFocus.current = null;
      active.current = null;
      leaseOwner.current = null;
      setRequest(null);
    },
    owns(token, native) {
      return (
        mounted.current &&
        active.current?.token === token &&
        leaseOwner.current?.() === true &&
        currentScope.current(native)
      );
    },
    canUse(native) {
      return mounted.current && active.current === null && currentScope.current(native);
    },
    isCurrent() {
      return mounted.current && currentOwner.current();
    },
    captureOwner() {
      const expected = currentOwner.current;
      return () => mounted.current && expected();
    },
  }));
  useLayoutEffect(() => {
    if (active.current !== null && leaseOwner.current?.() !== true) {
      const previous = active.current;
      active.current = null;
      leaseOwner.current = null;
      openingFocus.current = null;
      returningFocus.current = null;
      setRequest(null);
      previous.onRevoke?.();
    }
  }, [canUse, isCurrent]);
  const [returnFocusRef] = useState(() => ({
    get current(): HTMLElement | null {
      const expected = returningFocus.current;
      return mounted.current &&
        active.current === null &&
        expected?.owns() &&
        currentScope.current(expected.native)
        ? expected.element
        : null;
    },
  }));
  const native = () => cancelRef.current?.closest('[data-ui-dialog]') ?? undefined;
  const footer =
    request === null ? undefined : (
      <>
        <button
          ref={cancelRef}
          type="button"
          data-dialog-primary
          onClick={() => {
            if (context.owns(request.token, native())) request.onCancel();
          }}
        >
          {t('ui.common.cancel')}
        </button>
        <button
          type="button"
          onClick={() => {
            if (context.owns(request.token, native())) request.onConfirm();
          }}
        >
          {t('ui.common.confirm')}
        </button>
      </>
    );
  return {
    context,
    request,
    footer,
    cancelRef,
    returnFocusRef,
    focusKey: `save-confirm:${focusKey.current}`,
  };
}
