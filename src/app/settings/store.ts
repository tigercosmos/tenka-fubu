import { createStore } from 'zustand/vanilla';
import {
  decodeSettings,
  SettingsSchema,
  SETTINGS_STORAGE_KEY,
  type GameSettings,
  type SettingsDecodeResult,
  type SettingsPatch,
} from './schema';

export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export type SettingsPersistenceError = 'unavailable' | 'readFailed' | 'writeFailed';
export interface SettingsState {
  settings: GameSettings;
  persistenceError: SettingsPersistenceError | null;
  migration: Pick<SettingsDecodeResult, 'migrated' | 'sourceVersion' | 'fallback'>;
  updateSettings(patch: SettingsPatch): void;
  resetSettings(): void;
}

function browserStorage(): SettingsStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** Safe synchronous startup; bad storage/preferences can never prevent the title screen. */
export function loadSettings(storage: SettingsStorage | null): SettingsDecodeResult & {
  persistenceError: SettingsPersistenceError | null;
} {
  if (storage === null)
    return { ...decodeSettings({ settingsVersion: 1 }), persistenceError: 'unavailable' };
  try {
    const raw = storage.getItem(SETTINGS_STORAGE_KEY);
    if (raw === null) return { ...decodeSettings({ settingsVersion: 1 }), persistenceError: null };
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { ...decodeSettings(null), persistenceError: null };
    }
    return { ...decodeSettings(parsed), persistenceError: null };
  } catch {
    return { ...decodeSettings(null), persistenceError: 'readFailed' };
  }
}

/** Inject storage and effect callbacks for tests; application boot owns the returned instance. */
export function createSettingsStore(
  storage: SettingsStorage | null = browserStorage(),
  apply: (settings: GameSettings) => void = () => {},
) {
  const initial = loadSettings(storage);
  const settingsStore = createStore<SettingsState>((set, get) => {
    const commit = (settings: GameSettings): void => {
      let persistenceError: SettingsPersistenceError | null =
        storage === null ? 'unavailable' : null;
      try {
        storage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
      } catch {
        persistenceError = 'writeFailed';
      }
      // Persistence failure still leaves every preference immediately usable in memory.
      set({ settings, persistenceError });
      apply(structuredClone(settings));
    };
    return {
      settings: initial.settings,
      persistenceError: initial.persistenceError,
      migration: {
        migrated: initial.migrated,
        sourceVersion: initial.sourceVersion,
        fallback: initial.fallback,
      },
      updateSettings(patch) {
        const previous = get().settings;
        commit(
          SettingsSchema.parse({
            ...previous,
            ...patch,
            settingsVersion: previous.settingsVersion,
            autoPause: { ...previous.autoPause, ...patch.autoPause },
            audio: { ...previous.audio, ...patch.audio },
          }),
        );
      },
      resetSettings() {
        commit(SettingsSchema.parse({}));
      },
    };
  });
  apply(structuredClone(initial.settings));
  return settingsStore;
}
