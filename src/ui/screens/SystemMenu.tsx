import { useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import { useStore } from 'zustand';
import { store } from '@app/store';
import { settingsStore } from '@app/settings/runtime';
import { t } from '@i18n/zh-TW';
import { ConfirmDialog, Dialog } from '../components';
import { SettingsPanel } from './SettingsPanel';
import { uiStore } from '../hooks/uiStore';
import styles from './SystemMenu.module.css';
import { SaveConfirmationContext, useSaveConfirmationHost } from './SaveConfirmationContext';

export interface SystemPanel {
  /** Stable parent subview identity across its ordinary data refreshes. */
  identity?: object;
  title: string;
  content: ReactElement;
  onBack: () => void;
}

export function SystemMenu({
  onReturnToTitle,
  dirty = true,
  onOpenSaveLoad,
  saveUnavailableReason,
  systemPanel,
}: {
  onReturnToTitle?: (() => void) | undefined;
  dirty?: boolean;
  onOpenSaveLoad?: ((mode: 'save' | 'load') => void) | undefined;
  saveUnavailableReason?: string | undefined;
  systemPanel?: SystemPanel | null | undefined;
}) {
  const [showSettings, setShowSettings] = useState(false);
  const [request, setRequest] = useState<{
    consumed: boolean;
    revision: number;
    subview: string;
  } | null>(null);
  const activeRequest = useRef<typeof request>(null);
  const mounted = useRef(false);
  const revoked = useRef(false);
  const [invalid, setInvalid] = useState(false);
  const owner = useRef({
    game: store.getState().game,
    screen: store.getState().session.screen,
    modal: uiStore.getState().modal,
    modalKey: JSON.stringify(uiStore.getState().modal),
  }).current;
  const revision = useRef(0);
  const [renderedRevision, setRenderedRevision] = useState(0);
  const cleanTitleSubmitted = useRef(false);
  const menuBody = useRef<HTMLElement>(null);
  const titleBody = useRef<HTMLSpanElement>(null);
  const subview = systemPanel ? `system:${systemPanel.title}` : showSettings ? 'settings' : 'menu';
  const currentSubview = useRef(subview);
  currentSubview.current = subview;
  const currentSystemPanel = useRef(systemPanel);
  currentSystemPanel.current = systemPanel;
  useLayoutEffect(() => {
    const expected = activeRequest.current;
    if (expected !== null && expected.subview !== subview) {
      expected.consumed = true;
      activeRequest.current = null;
      revision.current += 1;
      setRenderedRevision(revision.current);
      setRequest(null);
    }
  }, [subview]);
  useLayoutEffect(() => {
    mounted.current = true;
    const unsubscribe = uiStore.subscribe((current, previous) => {
      if (
        owner.modal !== null &&
        (previous.modal === owner.modal || previous.modalQueue.includes(owner.modal)) &&
        current.modal !== owner.modal &&
        !current.modalQueue.includes(owner.modal)
      ) {
        revoked.current = true;
        if (activeRequest.current !== null) activeRequest.current.consumed = true;
        activeRequest.current = null;
        setRequest(null);
        setInvalid(true);
      }
    });
    return () => {
      unsubscribe();
      mounted.current = false;
      revoked.current = true;
      if (activeRequest.current !== null) activeRequest.current.consumed = true;
      activeRequest.current = null;
      if (owner.modal !== null)
        uiStore.getState().actions.closeOwnedModal(owner.modal, {
          resume: false,
          expectedGame: owner.game,
        });
    };
  }, [owner]);
  useLayoutEffect(() => {
    if (invalid && owner.modal !== null)
      uiStore.getState().actions.closeOwnedModal(owner.modal, {
        resume: false,
        expectedGame: owner.game,
      });
  }, [invalid, owner]);
  const nativeMenu = () => menuBody.current?.closest('[data-ui-dialog]') ?? undefined;
  const nativeTitle = () => titleBody.current?.closest('[data-ui-dialog]') ?? undefined;
  const ownsParent = () => {
    const app = store.getState(),
      ui = uiStore.getState();
    return (
      mounted.current &&
      !revoked.current &&
      app.game === owner.game &&
      app.session.screen === owner.screen &&
      ui.modal === owner.modal &&
      JSON.stringify(ui.modal) === owner.modalKey
    );
  };
  const owns = (native: Element | undefined) => {
    const dialogs = document.querySelectorAll('[data-ui-dialog]');
    return (
      ownsParent() &&
      native !== undefined &&
      native.isConnected &&
      dialogs.item(dialogs.length - 1) === native
    );
  };
  const saveConfirmation = useSaveConfirmationHost(
    (native) =>
      owns(native) &&
      activeRequest.current === null &&
      currentSubview.current === subview &&
      (currentSystemPanel.current?.identity ?? currentSystemPanel.current) ===
        (systemPanel?.identity ?? systemPanel),
    () =>
      ownsParent() &&
      activeRequest.current === null &&
      currentSubview.current === subview &&
      (currentSystemPanel.current?.identity ?? currentSystemPanel.current) ===
        (systemPanel?.identity ?? systemPanel),
  );
  const ownsSubview = () =>
    owns(nativeMenu()) &&
    saveConfirmation.request === null &&
    activeRequest.current === null &&
    currentSubview.current === subview &&
    (currentSystemPanel.current?.identity ?? currentSystemPanel.current) ===
      (systemPanel?.identity ?? systemPanel) &&
    revision.current === renderedRevision;
  const transition = (change: () => void) => {
    if (!ownsSubview()) return;
    revision.current += 1;
    setRenderedRevision(revision.current);
    change();
  };
  const settings = useStore(settingsStore, (state) => state.settings);
  const persistenceError = useStore(settingsStore, (state) => state.persistenceError);
  const close = () => {
    if (!ownsSubview() || owner.modal === null) return;
    revoked.current = true;
    uiStore.getState().actions.closeOwnedModal(owner.modal, { expectedGame: owner.game });
  };
  const back = () => {
    transition(() => {
      if (systemPanel) systemPanel.onBack();
      else setShowSettings(false);
    });
  };
  if (invalid) return null;
  return (
    <SaveConfirmationContext.Provider value={saveConfirmation.context}>
      <Dialog
        open={request === null}
        focusScopeKey={
          saveConfirmation.request !== null
            ? saveConfirmation.focusKey
            : systemPanel
              ? `system:${systemPanel.title}`
              : showSettings
                ? 'settings'
                : 'menu'
        }
        title={
          saveConfirmation.request?.title ??
          systemPanel?.title ??
          t(showSettings ? 'ui.settings.title' : 'ui.system.menu')
        }
        {...(saveConfirmation.request === null
          ? { initialFocusRef: saveConfirmation.returnFocusRef }
          : {
              footer: saveConfirmation.footer,
              initialFocusRef: saveConfirmation.cancelRef,
            })}
        size={systemPanel || showSettings ? 'lg' : 'sm'}
        onClose={
          saveConfirmation.request !== null
            ? saveConfirmation.request.onCancel
            : systemPanel || showSettings
              ? back
              : close
        }
      >
        {saveConfirmation.request?.message}
        <section ref={menuBody} hidden={saveConfirmation.request !== null}>
          {systemPanel ? (
            systemPanel.content
          ) : showSettings ? (
            <SettingsPanel
              settings={settings}
              onChange={(patch) => {
                if (ownsSubview()) settingsStore.getState().updateSettings(patch);
              }}
              onReset={() => {
                if (ownsSubview()) settingsStore.getState().resetSettings();
              }}
              onClose={back}
              persistenceError={persistenceError !== null}
            />
          ) : (
            <nav aria-label={t('ui.system.menu')} className={styles.menu}>
              <button type="button" className={styles.resume} onClick={close}>
                {t('ui.system.resume')}
              </button>
              <button
                type="button"
                disabled={onOpenSaveLoad === undefined}
                aria-describedby={
                  onOpenSaveLoad === undefined ? 'system-save-unavailable' : undefined
                }
                onClick={() => transition(() => onOpenSaveLoad?.('save'))}
              >
                {t('ui.system.save')}
              </button>
              <button
                type="button"
                disabled={onOpenSaveLoad === undefined}
                aria-describedby={
                  onOpenSaveLoad === undefined ? 'system-save-unavailable' : undefined
                }
                onClick={() => transition(() => onOpenSaveLoad?.('load'))}
              >
                {t('ui.system.load')}
              </button>
              {onOpenSaveLoad === undefined && (
                <p id="system-save-unavailable">
                  {saveUnavailableReason ?? t('cmd.reject.notImplemented')}
                </p>
              )}
              <button type="button" onClick={() => transition(() => setShowSettings(true))}>
                {t('ui.system.settings')}
              </button>
              <button
                type="button"
                className={styles.titleExit}
                disabled={onReturnToTitle === undefined}
                onClick={() => {
                  if (!ownsSubview() || cleanTitleSubmitted.current) return;
                  const dialog = nativeMenu();
                  revision.current += 1;
                  setRenderedRevision(revision.current);
                  if (!dirty) {
                    cleanTitleSubmitted.current = true;
                    onReturnToTitle?.();
                    if (owns(dialog)) cleanTitleSubmitted.current = false;
                    return;
                  }
                  const next = { consumed: false, revision: revision.current, subview };
                  activeRequest.current = next;
                  setRequest(next);
                }}
              >
                {t('ui.system.toTitle')}
              </button>
            </nav>
          )}
        </section>
      </Dialog>
      <ConfirmDialog
        open={request !== null}
        title={t('ui.system.toTitle')}
        message={<span ref={titleBody}>{t('ui.system.confirmToTitle')}</span>}
        danger
        onCancel={() => {
          if (request === null || activeRequest.current !== request || !owns(nativeTitle())) return;
          request.consumed = true;
          activeRequest.current = null;
          revision.current += 1;
          setRenderedRevision(revision.current);
          setRequest(null);
        }}
        onConfirm={() => {
          if (
            request === null ||
            request.consumed ||
            activeRequest.current !== request ||
            revision.current !== request.revision ||
            currentSubview.current !== request.subview ||
            !owns(nativeTitle())
          )
            return;
          request.consumed = true;
          const expected = request,
            dialog = nativeTitle();
          onReturnToTitle?.();
          if (
            activeRequest.current === expected &&
            owns(dialog) &&
            revision.current === expected.revision &&
            currentSubview.current === expected.subview
          ) {
            activeRequest.current = null;
            revision.current += 1;
            setRenderedRevision(revision.current);
            setRequest(null);
          }
        }}
      />
    </SaveConfirmationContext.Provider>
  );
}
