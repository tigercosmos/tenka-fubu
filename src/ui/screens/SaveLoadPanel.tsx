import {
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from 'react';
import { useStore } from 'zustand';
import { store } from '@app/store';
import { SAVE_SLOTS, type SaveSlotId, type SaveSlotView } from '@app/persistence/saveStore';
import type { SaveOperationGuard as StorageOperationGuard } from '@app/persistence/saveStore';
import { canonicalStringify } from '@core/state/serialize';
import type { SaveMeta } from '@core/save/serialize';
import { SAVE_FORMAT_VERSION } from '@core/save/migrate';
import { formatDate, t } from '@i18n/zh-TW';
import { ConfirmDialog } from '../components';
import styles from './SaveLoadPanel.module.css';
import { SaveConfirmationContext } from './SaveConfirmationContext';
import { uiStore } from '../hooks/uiStore';

export interface SaveImportPreview {
  /** Controller-owned stable token per validated import; never contains gameplay state. */
  identity?: object;
  meta: SaveMeta;
  timestamp: number;
  migratedFrom: number | null;
}

type Operation = void | Promise<void>;
export interface SaveOperationGuard extends StorageOperationGuard {
  isCurrent: () => boolean;
}
export interface SaveLoadPanelProps {
  mode: 'save' | 'load';
  context: 'title' | 'main';
  slots: readonly SaveSlotView[];
  dirty: boolean;
  busy?: boolean;
  error?: string | null;
  importPreview?: SaveImportPreview | null;
  onClose: () => void;
  onSave: (slot: SaveSlotId, guard?: SaveOperationGuard) => Operation;
  onLoad: (slot: SaveSlotId, guard?: SaveOperationGuard) => Operation;
  onDelete: (slot: SaveSlotId, guard?: SaveOperationGuard) => Operation;
  onExport: (slot: SaveSlotId, options: { raw: boolean }, guard?: SaveOperationGuard) => Operation;
  onExportCurrent?: ((guard?: SaveOperationGuard) => Operation) | undefined;
  onImport: (file: File, guard?: SaveOperationGuard) => Operation;
  onImportLoad: (guard?: SaveOperationGuard) => Operation;
  onImportStore: (slot: SaveSlotId, guard?: SaveOperationGuard) => Operation;
  onImportCancel: (guard?: SaveOperationGuard) => Operation;
}

type ConfirmationIntent =
  | { kind: 'save' | 'load' | 'delete'; slot: SaveSlotView }
  | { kind: 'importStore'; slot: SaveSlotView; preview: SaveImportPreview }
  | { kind: 'importLoad'; preview: SaveImportPreview };
type Confirmation = ConfirmationIntent & {
  token: object;
  opener: HTMLElement | null;
  consumed: boolean;
  previewSubject?: string;
};
const slotSubject = (slot: SaveSlotView) => canonicalStringify(slot);
const previewSubject = (preview: SaveImportPreview) =>
  canonicalStringify({
    meta: preview.meta,
    timestamp: preview.timestamp,
    migratedFrom: preview.migratedFrom,
  });

function samePreview(a: SaveImportPreview, b: SaveImportPreview | null | undefined): boolean {
  if (!b) return false;
  if (a.identity !== undefined || b.identity !== undefined) return a.identity === b.identity;
  return a.meta === b.meta && a.timestamp === b.timestamp && a.migratedFrom === b.migratedFrom;
}

function slotLabel(slot: SaveSlotId): string {
  const [kind, n] = slot.split(':');
  return kind === 'manual'
    ? t('ui.save.slotManual', { n: Number(n) })
    : kind === 'auto'
      ? t('ui.save.slotAuto', { n: Number(n) })
      : t('ui.save.slotQuick');
}

function metaDetails(meta: SaveMeta, timestamp: number | null, migratedFrom: number | '—' | null) {
  const hours = Math.floor((meta.playtimeSeconds ?? 0) / 3600);
  const minutes = Math.floor(((meta.playtimeSeconds ?? 0) % 3600) / 60);
  const difficulty = meta.difficulty;
  const realDate = timestamp === null ? null : new Date(timestamp);
  return (
    <>
      <strong>
        {meta.clanName} · {meta.leaderName}
      </strong>
      <span>{meta.dateText ?? formatDate(meta.day)}</span>
      <span>
        {t('ui.save.summary', {
          castles: meta.castleCount,
          officers: meta.officerCount,
          koku: meta.totalKokudaka,
        })}
      </span>
      {(difficulty === 'easy' || difficulty === 'normal' || difficulty === 'hard') && (
        <span>{t(`term.difficulty.${difficulty}`)}</span>
      )}
      {realDate !== null && Number.isFinite(realDate.getTime()) && (
        <time dateTime={realDate.toISOString()}>{realDate.toLocaleString('zh-TW')}</time>
      )}
      <span>{t('ui.save.playtime', { hours, minutes })}</span>
      {meta.slotLabel && <span>{meta.slotLabel}</span>}
      {migratedFrom !== null && (
        <span className={styles.migration}>
          {t('ui.save.willMigrate', { from: migratedFrom, to: SAVE_FORMAT_VERSION })}
        </span>
      )}
    </>
  );
}

/** Storage and game replacement stay in the caller; this view owns only transient interaction drafts. */
export function SaveLoadPanel(props: SaveLoadPanelProps) {
  const { mode, context, slots, dirty, busy = false, error, importPreview, onClose } = props;
  const parent = useContext(SaveConfirmationContext);
  const game = useStore(store, (state) => state.game);
  const screen = useStore(store, (state) => state.session.screen);
  const owner = useMemo(
    () => ({
      game,
      screen,
      mode,
      context,
      modal: uiStore.getState().modal,
      parentCurrent: parent?.captureOwner(),
    }),
    [game, screen, mode, context, parent],
  );
  const activeOwner = useRef<object | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const id = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const panelRoot = useRef<HTMLElement>(null);
  const importButton = useRef<HTMLButtonElement>(null);
  const previewCancelButton = useRef<HTMLButtonElement>(null);
  const lastPanelFocus = useRef<HTMLElement | null>(null);
  const previousPreview = useRef(importPreview);
  const restorePreviewFocus = useRef(false);
  const dragDepth = useRef(0);
  const inFlight = useRef(false);
  const [pending, setPending] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const activeConfirmation = useRef<Confirmation | null>(null);
  const operation = useRef<object | null>(null);
  const confirmationBody = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    activeOwner.current = owner;
    inFlight.current = false;
    setPending(false);
    setConfirmation(null);
    setOperationError(null);
    const revoke = () => {
      if (activeOwner.current !== owner) return;
      activeOwner.current = null;
      const request = activeConfirmation.current;
      if (request !== null) {
        request.consumed = true;
        activeConfirmation.current = null;
        parent?.dismiss(request.token);
      }
      setConfirmation(null);
    };
    const unsubscribeGame = store.subscribe((current) => {
      if (current.game !== owner.game || current.session.screen !== owner.screen) revoke();
    });
    const unsubscribeModal = uiStore.subscribe((current, previous) => {
      if (
        owner.modal !== null &&
        (previous.modal === owner.modal || previous.modalQueue.includes(owner.modal)) &&
        current.modal !== owner.modal &&
        !current.modalQueue.includes(owner.modal)
      )
        revoke();
    });
    return () => {
      unsubscribeGame();
      unsubscribeModal();
      if (activeOwner.current === owner) activeOwner.current = null;
      operation.current = null;
      const request = activeConfirmation.current;
      activeConfirmation.current = null;
      if (request !== null) {
        request.consumed = true;
        parent?.dismiss(request.token);
      }
    };
  }, [owner, parent]);
  const ownsOwner = () =>
    activeOwner.current === owner &&
    store.getState().game === owner.game &&
    store.getState().session.screen === owner.screen &&
    latest.current.mode === owner.mode &&
    latest.current.context === owner.context &&
    uiStore.getState().modal === owner.modal &&
    (owner.parentCurrent === undefined || owner.parentCurrent());
  const nativePanel = () => panelRoot.current?.closest('[data-ui-dialog]') ?? undefined;
  const nativeConfirmation = () =>
    confirmationBody.current?.closest('[data-ui-dialog]') ?? undefined;
  const foreground = () => {
    if (
      !ownsOwner() ||
      latest.current.busy === true ||
      !panelRoot.current?.isConnected ||
      activeConfirmation.current !== null
    )
      return false;
    const native = nativePanel();
    if (parent !== null) return parent.canUse(native);
    const dialogs = document.querySelectorAll('[data-ui-dialog]');
    return dialogs.length === 0 || dialogs.item(dialogs.length - 1) === native;
  };
  const sameSlot = (slot: SaveSlotView) => {
    const current = latest.current.slots.find((item) => item.slotId === slot.slotId);
    return (
      slotSubject(
        current ?? {
          slotId: slot.slotId,
          status: 'empty',
          meta: null,
          timestamp: null,
          needsMigration: false,
        },
      ) === slotSubject(slot)
    );
  };
  const subjectCurrent = (intent: ConfirmationIntent) =>
    (intent.kind === 'importLoad' || sameSlot(intent.slot)) &&
    ((intent.kind !== 'importLoad' && intent.kind !== 'importStore') ||
      samePreview(intent.preview, latest.current.importPreview));
  const guard = (slot?: SaveSlotView, preview?: SaveImportPreview): SaveOperationGuard => {
    const expectedPreview =
      preview === undefined || preview.identity !== undefined ? undefined : previewSubject(preview);
    return {
      ...(slot?.version === undefined ? {} : { expectedVersion: slot.version }),
      isCurrent: () =>
        ownsOwner() &&
        (slot === undefined || sameSlot(slot)) &&
        (preview === undefined ||
          (samePreview(preview, latest.current.importPreview) &&
            latest.current.importPreview != null &&
            (expectedPreview === undefined ||
              previewSubject(latest.current.importPreview) === expectedPreview))),
    };
  };
  const dismiss = (request: Confirmation) => {
    if (activeConfirmation.current !== request) return;
    request.consumed = true;
    activeConfirmation.current = null;
    parent?.dismiss(request.token);
    setConfirmation(null);
  };
  const requestForeground = (request: Confirmation) => {
    if (!ownsOwner() || activeConfirmation.current !== request) return false;
    const native = nativeConfirmation() ?? nativePanel();
    if (parent !== null) return parent.owns(request.token, native);
    const dialogs = document.querySelectorAll('[data-ui-dialog]');
    return (
      native !== undefined && native.isConnected && dialogs.item(dialogs.length - 1) === native
    );
  };
  const openConfirmation = (intent: ConfirmationIntent) => {
    if (!foreground() || inFlight.current || busy || !subjectCurrent(intent)) return;
    const request: Confirmation = {
      ...intent,
      token: {},
      opener:
        lastPanelFocus.current !== null && panelRoot.current?.contains(lastPanelFocus.current)
          ? lastPanelFocus.current
          : null,
      consumed: false,
      ...((intent.kind === 'importLoad' || intent.kind === 'importStore') &&
      intent.preview.identity === undefined
        ? { previewSubject: previewSubject(intent.preview) }
        : {}),
    };
    activeConfirmation.current = request;
    setConfirmation(request);
  };
  useLayoutEffect(() => {
    const request = activeConfirmation.current;
    if (
      request !== null &&
      (!subjectCurrent(request) ||
        (request.previewSubject !== undefined &&
          (latest.current.importPreview == null ||
            previewSubject(latest.current.importPreview) !== request.previewSubject)))
    )
      dismiss(request);
  });
  const [importTarget, setImportTarget] = useState<SaveSlotId>('manual:1');
  const working = busy || pending;
  const locked = working || confirmation !== null;
  useEffect(() => {
    const previous = previousPreview.current;
    const changed = previous ? !samePreview(previous, importPreview) : Boolean(importPreview);
    previousPreview.current = importPreview;
    if (changed && lastPanelFocus.current && !lastPanelFocus.current.isConnected)
      restorePreviewFocus.current = true;
    if (!restorePreviewFocus.current || working || confirmation !== null) return;
    const topDialog = Array.from(document.querySelectorAll('[data-ui-dialog]')).at(-1);
    if (topDialog && panelRoot.current && !topDialog.contains(panelRoot.current)) return;
    restorePreviewFocus.current = false;
    if (document.activeElement === document.body)
      (importPreview ? previewCancelButton.current : importButton.current)?.focus();
  }, [importPreview, working, confirmation]);
  const byId = new Map(
    slots.map((slot) => [
      slot.slotId,
      {
        ...slot,
        meta: slot.meta === null ? null : structuredClone(slot.meta),
      },
    ]),
  );
  const views = SAVE_SLOTS.map(
    (slotId): SaveSlotView =>
      byId.get(slotId) ?? {
        slotId,
        status: 'empty',
        meta: null,
        timestamp: null,
        needsMigration: false,
      },
  );

  async function run(action: () => Operation, importing = false, current = guard()): Promise<void> {
    if (latest.current.busy === true || inFlight.current || !current.isCurrent()) return;
    const token = {};
    operation.current = token;
    inFlight.current = true;
    setPending(true);
    setOperationError(null);
    try {
      if (current.isCurrent()) await action();
    } catch {
      if (operation.current === token && current.isCurrent())
        setOperationError(t(importing ? 'error.load.invalidFile' : 'error.save.writeFailed'));
    } finally {
      if (operation.current === token && ownsOwner()) {
        operation.current = null;
        inFlight.current = false;
        setPending(false);
      }
    }
  }
  function save(slot: SaveSlotView, imported = false): void {
    if (!foreground() || !sameSlot(slot) || !slot.slotId.startsWith('manual:') || locked) return;
    if (imported && !importPreview) return;
    if (slot.status !== 'empty') {
      if (imported && importPreview)
        openConfirmation({ kind: 'importStore', slot, preview: importPreview });
      else openConfirmation({ kind: 'save', slot });
    } else {
      const current = guard(slot, imported ? (importPreview ?? undefined) : undefined);
      void run(
        () =>
          imported ? props.onImportStore(slot.slotId, current) : props.onSave(slot.slotId, current),
        false,
        current,
      );
    }
  }
  function load(slot: SaveSlotView): void {
    if (
      !foreground() ||
      dirty !== latest.current.dirty ||
      !sameSlot(slot) ||
      locked ||
      slot.status !== 'ok'
    )
      return;
    if (dirty) openConfirmation({ kind: 'load', slot });
    else {
      const current = guard(slot);
      void run(() => props.onLoad(slot.slotId, current), true, current);
    }
  }
  function acceptFile(file: File | undefined): void {
    if (file !== undefined && !locked && foreground()) {
      const current = guard();
      void run(() => props.onImport(file, current), true, current);
    }
  }
  function hasFiles(event: DragEvent): boolean {
    return Array.from(event.dataTransfer.types).includes('Files');
  }
  const confirmLabel =
    confirmation?.kind === 'importLoad'
      ? t('ui.save.importPreview')
      : confirmation
        ? slotLabel(confirmation.slot.slotId)
        : '';
  const oldMeta =
    confirmation && confirmation.kind !== 'importLoad' ? confirmation.slot.meta : null;
  const message =
    confirmation?.kind === 'delete'
      ? t('ui.save.deleteConfirm', {
          label: confirmLabel,
          clan: oldMeta?.clanName ?? t('ui.save.corrupt'),
          date: oldMeta?.dateText ?? (oldMeta ? formatDate(oldMeta.day) : t('ui.common.noData')),
        })
      : confirmation?.kind === 'importLoad' && !dirty && importPreview
        ? `${t('ui.save.importLoad')} · ${importPreview.meta.clanName} · ${importPreview.meta.dateText ?? formatDate(importPreview.meta.day)}`
        : confirmation?.kind === 'load' || confirmation?.kind === 'importLoad'
          ? t('ui.load.loadConfirm', { label: confirmLabel })
          : t('ui.save.overwriteConfirm', {
              label: confirmLabel,
              clan: oldMeta?.clanName ?? t('ui.save.corrupt'),
              date:
                oldMeta?.dateText ?? (oldMeta ? formatDate(oldMeta.day) : t('ui.common.noData')),
            });
  const confirmationTitle = t(
    confirmation?.kind === 'delete'
      ? 'ui.save.action.delete'
      : confirmation?.kind === 'load' || confirmation?.kind === 'importLoad'
        ? 'ui.load.title'
        : 'ui.save.title',
  );
  const cancelConfirmation = (intent: Confirmation) => {
    if (!intent.consumed && requestForeground(intent)) dismiss(intent);
  };
  const confirm = (intent: Confirmation) => {
    if (
      intent.consumed ||
      !requestForeground(intent) ||
      !subjectCurrent(intent) ||
      (intent.previewSubject !== undefined &&
        (latest.current.importPreview == null ||
          previewSubject(latest.current.importPreview) !== intent.previewSubject)) ||
      inFlight.current ||
      busy
    )
      return;
    intent.consumed = true;
    const current = guard(
      intent.kind === 'importLoad' ? undefined : intent.slot,
      intent.kind === 'importLoad' || intent.kind === 'importStore' ? intent.preview : undefined,
    );
    dismiss(intent);
    void run(
      () =>
        intent.kind === 'importLoad'
          ? props.onImportLoad(current)
          : intent.kind === 'importStore'
            ? props.onImportStore(intent.slot.slotId, current)
            : intent.kind === 'delete'
              ? props.onDelete(intent.slot.slotId, current)
              : intent.kind === 'load'
                ? props.onLoad(intent.slot.slotId, current)
                : props.onSave(intent.slot.slotId, current),
      intent.kind === 'load' || intent.kind === 'importLoad',
      current,
    );
  };
  const confirmationActions = useRef({ cancelConfirmation, confirm, dismiss });
  confirmationActions.current = { cancelConfirmation, confirm, dismiss };
  useLayoutEffect(() => {
    if (confirmation === null || parent === null || activeConfirmation.current !== confirmation)
      return;
    if (
      !parent.present(
        {
          token: confirmation.token,
          opener: confirmation.opener,
          title: confirmationTitle,
          message: <span ref={confirmationBody}>{message}</span>,
          onCancel: () => confirmationActions.current.cancelConfirmation(confirmation),
          onRevoke: () => confirmationActions.current.dismiss(confirmation),
          onConfirm: () => confirmationActions.current.confirm(confirmation),
        },
        nativePanel(),
      )
    )
      confirmationActions.current.dismiss(confirmation);
    return () => parent.dismiss(confirmation.token);
  }, [confirmation, parent, confirmationTitle, message]);

  return (
    <section
      className={styles.panel}
      ref={panelRoot}
      onFocusCapture={(event) => {
        if (event.target instanceof HTMLElement && panelRoot.current?.contains(event.target))
          lastPanelFocus.current = event.target;
      }}
      data-testid="save-load-panel"
      data-context={context}
      aria-busy={working}
      onDragEnter={(event) => {
        if (!foreground() || mode !== 'load' || locked || !hasFiles(event)) return;
        event.preventDefault();
        dragDepth.current++;
        setDragging(true);
      }}
      onDragOver={(event) => {
        if (foreground() && mode === 'load' && hasFiles(event)) {
          event.preventDefault();
          event.dataTransfer.dropEffect = locked ? 'none' : 'copy';
        }
      }}
      onDragLeave={(event) => {
        if (!foreground() || mode !== 'load' || !hasFiles(event)) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(event) => {
        if (!foreground() || mode !== 'load' || !hasFiles(event)) return;
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        acceptFile(event.dataTransfer.files[0]);
      }}
    >
      <header className={styles.header}>
        <h2>{t(mode === 'save' ? 'ui.save.title' : 'ui.load.title')}</h2>
        <button
          type="button"
          disabled={locked}
          onClick={() => {
            if (foreground() && !inFlight.current) onClose();
          }}
        >
          {t('ui.common.back')}
        </button>
      </header>
      {(error ?? operationError) && <p role="alert">{error ?? operationError}</p>}
      {working && <p role="status">{t('ui.save.loading')}</p>}
      {mode === 'save' && (
        <p className={styles.registryNote} id={`${id}-manual-only`}>
          {t('ui.save.manualOnly')}
        </p>
      )}
      <ol className={styles.slots}>
        {views.map((slot) => (
          <li className={styles.slot} key={slot.slotId} data-testid={`save-slot-${slot.slotId}`}>
            <h3 className={styles.slotTitle}>{slotLabel(slot.slotId)}</h3>
            <div className={styles.metadata}>
              {slot.status === 'ok' && slot.meta ? (
                metaDetails(
                  slot.meta,
                  slot.timestamp,
                  slot.needsMigration ? (slot.meta.version ?? '—') : null,
                )
              ) : (
                <span id={`${id}-${slot.slotId}-status`}>
                  {t(slot.status === 'corrupt' ? 'ui.save.corrupt' : 'ui.save.empty')}
                </span>
              )}
            </div>
            <div className={styles.actions}>
              {mode === 'save' && slot.status !== 'corrupt' && (
                <button
                  type="button"
                  disabled={locked || !slot.slotId.startsWith('manual:')}
                  aria-describedby={
                    !slot.slotId.startsWith('manual:') ? `${id}-manual-only` : undefined
                  }
                  onClick={() => save(slot)}
                >
                  {t('ui.save.action.save')}
                </button>
              )}
              {mode === 'load' && (
                <button
                  type="button"
                  disabled={locked || slot.status !== 'ok'}
                  aria-describedby={
                    slot.status !== 'ok' ? `${id}-${slot.slotId}-status` : undefined
                  }
                  onClick={() => load(slot)}
                >
                  {t('ui.save.action.load')}
                </button>
              )}
              <button
                type="button"
                disabled={locked || slot.status === 'empty'}
                aria-describedby={
                  slot.status === 'empty' ? `${id}-${slot.slotId}-status` : undefined
                }
                onClick={() => {
                  if (!locked) openConfirmation({ kind: 'delete', slot });
                }}
              >
                {t('ui.save.action.delete')}
              </button>
              <button
                type="button"
                disabled={locked || slot.status === 'empty'}
                aria-describedby={
                  slot.status === 'empty' ? `${id}-${slot.slotId}-status` : undefined
                }
                onClick={() => {
                  if (!foreground() || !sameSlot(slot) || locked) return;
                  const current = guard(slot);
                  void run(
                    () => props.onExport(slot.slotId, { raw: slot.status === 'corrupt' }, current),
                    false,
                    current,
                  );
                }}
              >
                {t(
                  slot.status === 'corrupt' ? 'ui.save.action.exportRaw' : 'ui.save.action.export',
                )}
              </button>
            </div>
          </li>
        ))}
      </ol>
      {context === 'main' && props.onExportCurrent && (
        <button
          type="button"
          disabled={locked}
          onClick={() => {
            if (!foreground() || locked) return;
            const current = guard();
            void run(() => props.onExportCurrent?.(current), false, current);
          }}
        >
          {t('ui.save.exportCurrent')}
        </button>
      )}
      {mode === 'load' && (
        <section className={styles.importArea} aria-label={t('ui.save.import')}>
          {importPreview ? (
            <>
              <h3>{t('ui.save.importPreview')}</h3>
              <div className={styles.metadata}>
                {metaDetails(
                  importPreview.meta,
                  importPreview.timestamp,
                  importPreview.migratedFrom,
                )}
              </div>
              <label>
                {t('ui.save.importTarget')}
                <select
                  disabled={locked}
                  value={importTarget}
                  onChange={(event) => {
                    if (foreground() && !locked)
                      setImportTarget(event.currentTarget.value as SaveSlotId);
                  }}
                >
                  {views
                    .filter((slot) => slot.slotId.startsWith('manual:'))
                    .map((slot) => (
                      <option value={slot.slotId} key={slot.slotId}>
                        {slotLabel(slot.slotId)}
                      </option>
                    ))}
                </select>
              </label>
              <div className={styles.actions}>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => {
                    if (!locked) openConfirmation({ kind: 'importLoad', preview: importPreview });
                  }}
                >
                  {t('ui.save.importLoad')}
                </button>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => {
                    const slot = views.find((item) => item.slotId === importTarget);
                    if (slot) save(slot, true);
                  }}
                >
                  {t('ui.save.importStore')}
                </button>
                <button
                  type="button"
                  disabled={locked}
                  ref={previewCancelButton}
                  onClick={() => {
                    if (!foreground() || locked) return;
                    const current = guard(undefined, importPreview);
                    void run(() => props.onImportCancel(current), false, current);
                  }}
                >
                  {t('ui.save.importCancel')}
                </button>
              </div>
            </>
          ) : (
            <>
              <p>{t('ui.save.importHint')}</p>
              <button
                ref={importButton}
                type="button"
                disabled={locked}
                onClick={() => {
                  if (foreground() && !locked) fileInput.current?.click();
                }}
              >
                {t('ui.save.import')}
              </button>
              <input
                ref={fileInput}
                hidden
                type="file"
                accept=".json,.tenkafubu.json"
                data-testid="save-import-file"
                onChange={(event) => {
                  acceptFile(event.currentTarget.files?.[0]);
                  event.currentTarget.value = '';
                }}
              />
            </>
          )}
        </section>
      )}
      {dragging && (
        <div className={styles.dropOverlay} aria-live="polite">
          {t('ui.save.importDropOverlay')}
        </div>
      )}
      <ConfirmDialog
        open={parent === null && confirmation !== null}
        title={confirmationTitle}
        message={<span ref={confirmationBody}>{message}</span>}
        danger
        onCancel={() => {
          if (confirmation !== null) cancelConfirmation(confirmation);
        }}
        onConfirm={() => {
          if (confirmation !== null) confirm(confirmation);
        }}
      />
    </section>
  );
}
