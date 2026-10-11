import { useCallback, useEffect, useRef, useState } from 'react';
import { buildSaveFile, decodeSave, type SaveFile } from '@core/save/serialize';
import { t } from '@i18n/zh-TW';
import type { SaveLoadPanelProps } from '@ui/screens/SaveLoadPanel';
import { store } from '../store';
import { downloadSave, importSave } from './exportImport';
import type { SaveSessionController } from './saveSession';
import type {
  LoadOutcome,
  SaveErrorCode,
  SaveOperationGuard,
  SaveSlotId,
  SaveSlotVersion,
  SaveSlotView,
} from './saveStore';

interface ImportedSave {
  save: SaveFile;
  migratedFrom: number | null;
  identity: object;
}
export interface SaveActionNotice {
  id: string;
  text: string;
}
export interface ContinueSavePreview {
  clanName: string;
  leaderName: string;
  dateText: string | undefined;
  day: number;
  timestamp: number | null;
}
function continueMetadata(slot: SaveSlotView | null): ContinueSavePreview | null {
  const meta = slot?.meta;
  return meta
    ? {
        clanName: meta.clanName,
        leaderName: meta.leaderName,
        dateText: meta.dateText,
        day: meta.day,
        timestamp: slot.timestamp,
      }
    : null;
}
let nextNoticeId = 0;
let nextLegacyVersion = 0;
interface LegacyView {
  raw: string;
  storageVersion: SaveSlotVersion | undefined;
  version: SaveSlotVersion;
}
function operationGuard(
  version: SaveSlotVersion | undefined,
  isCurrent: () => boolean,
): SaveOperationGuard {
  return version === undefined ? { isCurrent } : { expectedVersion: version, isCurrent };
}
function slotLabel(slot: SaveSlotId): string {
  if (slot === 'quick:1') return t('ui.save.slotQuick');
  const [kind, n] = slot.split(':');
  return t(kind === 'manual' ? 'ui.save.slotManual' : 'ui.save.slotAuto', { n: n ?? '' });
}
function errorText(error: SaveErrorCode): string {
  const keys = {
    'quota-exceeded': 'error.save.quotaExceeded',
    'too-large': 'error.save.tooLarge',
    'write-failed': 'error.save.writeFailed',
    corrupt: 'error.load.corrupt',
    'invalid-file': 'error.load.invalidFile',
    'file-too-large': 'error.load.fileTooLarge',
    'newer-version': 'error.load.newerVersion',
    'empty-slot': 'error.load.emptySlot',
    'slot-changed': 'error.save.writeFailed',
  } as const;
  return t(keys[error], { version: '?' });
}
function downloadRaw(slot: SaveSlotId, raw: string): void {
  const url = URL.createObjectURL(new Blob([raw], { type: 'application/octet-stream' }));
  const anchor = document.createElement('a');
  try {
    anchor.href = url;
    anchor.download = `tenkafubu_${slot.replace(':', '-')}_raw.txt`;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}

/** UI-only orchestration; generation guards keep late imports/loads out of a replacement game. */
export function useSaveLoad(
  controller: SaveSessionController,
  onLoad: (save: SaveFile, isCurrent: () => boolean) => void | Promise<void>,
) {
  const [mode, setMode] = useState<'save' | 'load' | null>(null);
  const [slots, setSlots] = useState<SaveSlotView[]>([]);
  const [hasSave, setHasSave] = useState(false);
  const [continuePreview, setContinuePreview] = useState<ContinueSavePreview | null>(null);
  const [initializing, setInitializing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<SaveActionNotice | null>(null);
  const publishNotice = (text: string): void => {
    setNotice({ id: `save-action:${++nextNoticeId}`, text });
  };
  const [preview, setPreview] = useState<ImportedSave | null>(null);
  const epoch = useRef(0);
  const inFlight = useRef(false);
  const ready = useRef(false);
  const legacy = useRef(new Map<SaveSlotId, SaveFile>());
  const legacyViews = useRef(new Map<SaveSlotId, LegacyView>());
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const previewRef = useRef(preview);
  previewRef.current = preview;
  const panelIdentity = useRef<object>({});
  const readViews = useCallback(
    async (resolveLatest = true) => {
      const views = await controller.store.listSlots();
      const fallbacks = new Map<SaveSlotId, SaveFile>();
      const versions = new Map<SaveSlotId, LegacyView>();
      for (const slot of ['auto:1', 'quick:1'] as const) {
        const view = views.find((item) => item.slotId === slot);
        if (view?.status !== 'empty') continue;
        try {
          // A handled marker survives deletion: retained originals must never resurrect a slot.
          if (await controller.store.isLegacySlotHandled(slot)) continue;
          const raw = window.localStorage.getItem(`tf.save.${slot}.blob`);
          if (raw === null) continue;
          const decoded = decodeSave(raw);
          if (!decoded.ok) continue;
          const previous = legacyViews.current.get(slot);
          const version =
            previous?.raw === raw && previous.storageVersion === view.version
              ? previous
              : {
                  raw,
                  storageVersion: view.version,
                  version: `legacy-view:${++nextLegacyVersion}` as SaveSlotVersion,
                };
          versions.set(slot, version);
          fallbacks.set(slot, decoded.saveFile);
          Object.assign(view, {
            status: 'ok',
            meta: decoded.saveFile.meta,
            timestamp: decoded.saveFile.timestamp,
            needsMigration: true,
            version: version.version,
          });
        } catch {
          // Unknown marker state is not permission to resurrect an old save.
        }
      }
      if (!resolveLatest) return { views, fallbacks, versions, latest: null };
      const persisted = await controller.store.findLatestSave();
      const fallback = [...fallbacks.entries()].sort((a, b) => b[1].timestamp - a[1].timestamp)[0];
      const latest =
        fallback && (!persisted || fallback[1].timestamp > (persisted.timestamp ?? 0))
          ? (views.find((view) => view.slotId === fallback[0]) ?? null)
          : persisted;
      return { views, fallbacks, versions, latest };
    },
    [controller],
  );
  const readSlot = async (slot: SaveSlotId, guard?: SaveOperationGuard): Promise<LoadOutcome> => {
    const legacyView = legacyViews.current.get(slot);
    const useLegacy =
      legacyView !== undefined &&
      (guard?.expectedVersion === undefined || guard.expectedVersion === legacyView.version);
    const current = () =>
      (guard?.isCurrent?.() ?? true) &&
      (!useLegacy || window.localStorage.getItem(`tf.save.${slot}.blob`) === legacyView.raw);
    if (!current()) return { ok: false, error: 'slot-changed' };
    const outcome = await controller.store.loadFromSlot(
      slot,
      useLegacy ? operationGuard(legacyView.storageVersion, current) : guard,
    );
    const fallback = legacy.current.get(slot);
    const handled = fallback ? await controller.store.isLegacySlotHandled(slot) : true;
    if (!current()) return { ok: false, error: 'slot-changed' };
    return !outcome.ok && outcome.error === 'empty-slot' && fallback && !handled && useLegacy
      ? { ok: true, save: JSON.parse(JSON.stringify(fallback)) as SaveFile, migratedFrom: null }
      : outcome;
  };
  const refresh = useCallback(async () => {
    const requestedEpoch = epoch.current;
    const { views, fallbacks, versions, latest } = await readViews();
    if (requestedEpoch !== epoch.current) return;
    legacy.current = fallbacks;
    legacyViews.current = versions;
    setSlots(views);
    setHasSave(latest !== null);
    setContinuePreview(continueMetadata(latest));
    return latest;
  }, [readViews]);

  useEffect(() => {
    let disposed = false;
    epoch.current += 1;
    inFlight.current = false;
    setBusy(false);
    ready.current = false;
    setInitializing(true);
    setMode(null);
    modeRef.current = null;
    panelIdentity.current = {};
    setPreview(null);
    setError(null);
    setNotice(null);
    void (async () => {
      // Copy the two legacy MVP slots only into empty IndexedDB slots; keep originals as backups.
      for (const slot of ['auto:1', 'quick:1'] as const) {
        if (disposed) return;
        try {
          const raw = window.localStorage.getItem(`tf.save.${slot}.blob`);
          if (raw === null) continue;
          const decoded = decodeSave(raw);
          if (!decoded.ok || disposed) continue;
          const old = decoded.saveFile;
          const migrated = buildSaveFile(old.state, old.timestamp, old.pendingCommands, {
            playtimeSeconds: old.meta.playtimeSeconds ?? 0,
            appVersion: old.meta.appVersion,
            slotLabel: old.meta.slotLabel ?? '',
          });
          await controller.store.importLegacySlotIfEmpty(slot, migrated, raw);
        } catch {
          // A blocked legacy medium must not prevent imported/manual saves in IndexedDB.
        }
      }
      const { views, fallbacks, versions, latest } = await readViews();
      if (disposed) return;
      legacy.current = fallbacks;
      legacyViews.current = versions;
      setSlots(views);
      setHasSave(latest !== null);
      setContinuePreview(continueMetadata(latest));
      ready.current = true;
      setInitializing(false);
    })();
    return () => {
      disposed = true;
      epoch.current += 1;
      ready.current = false;
      inFlight.current = false;
    };
  }, [controller, readViews]);

  const run = useCallback(
    async (
      action: (isCurrent: () => boolean) => Promise<void | (() => void)>,
      admission?: () => boolean,
    ): Promise<void> => {
      if (!ready.current || inFlight.current || (admission && !admission())) return;
      const requestedEpoch = epoch.current;
      const originalGame = store.getState().game;
      const isCurrent = () =>
        requestedEpoch === epoch.current &&
        store.getState().game === originalGame &&
        (admission?.() ?? true);
      inFlight.current = true;
      setBusy(true);
      setError(null);
      let afterRelease: void | (() => void) = undefined;
      try {
        if (isCurrent()) afterRelease = await action(isCurrent);
      } catch {
        if (isCurrent()) setError(t('error.save.writeFailed'));
      } finally {
        if (requestedEpoch === epoch.current) {
          inFlight.current = false;
          setBusy(false);
        }
      }
      if (afterRelease && isCurrent()) afterRelease();
    },
    [],
  );

  const resetUi = useCallback(() => {
    epoch.current += 1;
    inFlight.current = false;
    setBusy(false);
    setMode(null);
    modeRef.current = null;
    panelIdentity.current = {};
    setPreview(null);
    setError(null);
    setNotice(null);
  }, []);
  const closeEpoch = epoch.current;
  const closeGame = store.getState().game;
  const closeScreen = store.getState().session.screen;
  const close = () => {
    if (
      inFlight.current ||
      initializing ||
      closeEpoch !== epoch.current ||
      closeGame !== store.getState().game ||
      closeScreen !== store.getState().session.screen
    )
      return;
    epoch.current += 1;
    setMode(null);
    modeRef.current = null;
    panelIdentity.current = {};
    setPreview(null);
    setError(null);
  };
  const loadPreparedSession = async (save: SaveFile, current: () => boolean): Promise<void> => {
    try {
      await onLoad(save, current);
    } catch {
      if (current()) setError(t('error.load.loadFailed'));
      return;
    }
    if (current()) resetUi();
  };
  const loadSlot = (
    slot: SaveSlotId,
    quick = false,
    guard?: SaveOperationGuard,
    admission?: () => boolean,
  ) => {
    const originalScreen = store.getState().session.screen;
    return run(
      async (current) => {
        const outcome = await readSlot(slot, { ...guard, isCurrent: current });
        if (!current()) return;
        if (!outcome.ok) {
          if (quick && outcome.error === 'empty-slot') publishNotice(t('ui.load.quickEmpty'));
          else setError(errorText(outcome.error));
          await refresh();
          return;
        }
        await loadPreparedSession(outcome.save, current);
      },
      admission ?? (() => store.getState().session.screen === originalScreen),
    );
  };
  const saveSlot = (slot: SaveSlotId, guard?: SaveOperationGuard, admission?: () => boolean) =>
    run(async (current) => {
      const outcome = await controller.saveCurrent(slot, '', { ...guard, isCurrent: current });
      if (!current()) return;
      if (!outcome.ok) {
        if (outcome.error !== 'no-session' && outcome.error !== 'session-changed')
          setError(errorText(outcome.error));
        return;
      }
      await refresh();
      return () =>
        publishNotice(
          t(slot === 'quick:1' ? 'ui.save.quickSaved' : 'ui.save.saved', {
            label: slotLabel(slot),
          }),
        );
    }, admission);

  function panelProps(context: 'title' | 'main', dirty: boolean): SaveLoadPanelProps {
    const originalEpoch = epoch.current;
    const originalMode = modeRef.current;
    const originalGame = store.getState().game;
    const originalScreen = store.getState().session.screen;
    const originalPanel = panelIdentity.current;
    const owns = (guard?: SaveOperationGuard) =>
      originalEpoch === epoch.current &&
      originalMode === modeRef.current &&
      originalPanel === panelIdentity.current &&
      store.getState().game === originalGame &&
      store.getState().session.screen === originalScreen &&
      (guard?.isCurrent?.() ?? true);
    const slotGuard = (slot: SaveSlotId, guard?: SaveOperationGuard): SaveOperationGuard =>
      operationGuard(
        guard?.expectedVersion ?? slots.find((view) => view.slotId === slot)?.version,
        () => owns(guard),
      );
    return {
      mode: mode ?? 'load',
      context,
      slots,
      dirty,
      busy: busy || initializing,
      error,
      importPreview: preview
        ? {
            meta: preview.save.meta,
            timestamp: preview.save.timestamp,
            migratedFrom: preview.migratedFrom,
            identity: preview.identity,
          }
        : null,
      onClose: () => {
        if (owns()) close();
      },
      onSave: (slot, guard) => saveSlot(slot, slotGuard(slot, guard), () => owns(guard)),
      onLoad: (slot, guard) => loadSlot(slot, false, slotGuard(slot, guard), () => owns(guard)),
      onDelete: (slot, guard) =>
        run(
          async (current) => {
            let deletionGuard = { ...slotGuard(slot, guard), isCurrent: current };
            const fallback = legacy.current.get(slot);
            if (fallback) {
              const legacyView = legacyViews.current.get(slot);
              const raw = window.localStorage.getItem(`tf.save.${slot}.blob`);
              if (
                !legacyView ||
                raw === null ||
                raw !== legacyView.raw ||
                deletionGuard.expectedVersion !== legacyView.version
              )
                return;
              const originalCurrent = current;
              const legacyCurrent = () =>
                originalCurrent() && window.localStorage.getItem(`tf.save.${slot}.blob`) === raw;
              // Establish the durable handled marker before deleting a read-only fallback.
              const migrated = await controller.store.importLegacySlotIfEmpty(
                slot,
                fallback,
                raw,
                operationGuard(legacyView.storageVersion, legacyCurrent),
              );
              if (!legacyCurrent()) return;
              if (!migrated.ok) {
                setError(errorText(migrated.error));
                return;
              }
              if (migrated.imported !== true || migrated.version === undefined) {
                setError(errorText('slot-changed'));
                await refresh();
                return;
              }
              deletionGuard = { expectedVersion: migrated.version, isCurrent: legacyCurrent };
            }
            const outcome = await controller.store.deleteSlot(slot, deletionGuard);
            if (!current()) return;
            if (!outcome.ok) setError(errorText(outcome.error));
            else publishNotice(t('ui.save.deleted'));
            await refresh();
          },
          () => owns(guard),
        ),
      onExport: (slot, options, guard) =>
        run(
          async (current) => {
            if (options.raw) {
              const outcome = await controller.store.exportRawFromSlot(slot, {
                ...slotGuard(slot, guard),
                isCurrent: current,
              });
              if (!current()) return;
              if (!outcome.ok) setError(errorText(outcome.error));
              else downloadRaw(slot, outcome.raw);
            } else {
              const outcome = await readSlot(slot, {
                ...slotGuard(slot, guard),
                isCurrent: current,
              });
              if (!current()) return;
              if (!outcome.ok) setError(errorText(outcome.error));
              else downloadSave(outcome.save);
            }
          },
          () => owns(guard),
        ),
      onExportCurrent:
        context === 'main'
          ? (guard) =>
              run(
                async (current) => {
                  const captured = controller.captureCurrent();
                  if (captured && current()) downloadSave(captured.save);
                  await Promise.resolve();
                },
                () => owns(guard),
              )
          : undefined,
      onImport: (file, guard) =>
        run(
          async (current) => {
            const outcome = await importSave(file);
            if (!current()) return;
            if (!outcome.ok) {
              setError(errorText(outcome.error));
              setPreview(null);
            } else
              setPreview({ save: outcome.save, migratedFrom: outcome.migratedFrom, identity: {} });
          },
          () => owns(guard),
        ),
      onImportLoad: (guard) => {
        const captured = preview;
        if (!captured) return;
        return run(
          async (current) => {
            if (!current()) return;
            await loadPreparedSession(captured.save, current);
          },
          () => owns(guard) && previewRef.current === captured,
        );
      },
      onImportStore: (slot, guard) => {
        const captured = preview;
        if (!captured || !slot.startsWith('manual:')) return;
        return run(
          async (current) => {
            const save = buildSaveFile(
              captured.save.state,
              Date.now(),
              captured.save.pendingCommands,
              {
                playtimeSeconds: captured.save.meta.playtimeSeconds ?? 0,
                appVersion: captured.save.meta.appVersion,
                slotLabel: '',
              },
            );
            const outcome = await controller.store.saveToSlot(slot, save, {
              ...slotGuard(slot, guard),
              isCurrent: current,
            });
            if (!current()) return;
            if (!outcome.ok) setError(errorText(outcome.error));
            else publishNotice(t('ui.save.saved', { label: slotLabel(slot) }));
            await refresh();
          },
          () => owns(guard) && previewRef.current === captured,
        );
      },
      onImportCancel: (guard) => {
        if (!inFlight.current && owns(guard) && previewRef.current === preview) {
          previewRef.current = null;
          setPreview(null);
        }
      },
    };
  }
  return {
    mode,
    panelIdentity: panelIdentity.current,
    busy: busy || initializing,
    hasSave,
    continuePreview,
    error,
    notice,
    dismissNotice: (id: string) => setNotice((current) => (current?.id === id ? null : current)),
    panelProps,
    close,
    resetUi,
    refresh,
    open: (next: 'save' | 'load') => {
      if (inFlight.current) return;
      epoch.current += 1;
      panelIdentity.current = {};
      modeRef.current = next;
      setMode(next);
      setPreview(null);
      setError(null);
      if (ready.current)
        void run(async () => {
          await refresh();
        });
    },
    quickSave: () => saveSlot('quick:1'),
    captureQuickLoadGuard: async (owns: () => boolean): Promise<SaveOperationGuard | null> => {
      const originalEpoch = epoch.current;
      const originalGame = store.getState().game;
      const current = (): boolean =>
        epoch.current === originalEpoch && store.getState().game === originalGame && owns();
      if (!ready.current || inFlight.current || !current()) return null;
      try {
        const result = await readViews(false);
        if (!current()) return null;
        const version = result.views.find((view) => view.slotId === 'quick:1')?.version;
        if (version === undefined) {
          setError(t('error.load.loadFailed'));
          return null;
        }
        legacy.current = result.fallbacks;
        legacyViews.current = result.versions;
        setSlots(result.views);
        return operationGuard(version, current);
      } catch {
        if (current()) setError(t('error.load.loadFailed'));
        return null;
      }
    },
    quickLoad: (guard?: SaveOperationGuard) =>
      loadSlot('quick:1', true, guard, guard ? () => guard.isCurrent?.() ?? true : undefined),
    continueLatest: () => {
      const originalScreen = store.getState().session.screen;
      return run(
        async (current) => {
          const latest = await refresh();
          if (!current()) return;
          if (!latest) {
            setHasSave(false);
            setError(t('error.load.emptySlot'));
            return;
          }
          const loaded = await readSlot(latest.slotId, operationGuard(latest.version, current));
          if (!current()) return;
          if (!loaded.ok) {
            setError(errorText(loaded.error));
            return;
          }
          await loadPreparedSession(loaded.save, current);
        },
        () => store.getState().session.screen === originalScreen,
      );
    },
  };
}
