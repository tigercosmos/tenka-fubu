import { describe, expect, it, vi } from 'vitest';
import { applySettings } from './apply';
import { createSettingsStore, loadSettings, type SettingsStorage } from './store';
import {
  DEFAULT_SETTINGS,
  decodeSettings,
  SETTINGS_STORAGE_KEY,
  SettingsSchema,
  type GameSettings,
} from './schema';

function memoryStorage(initial?: string): SettingsStorage {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(SETTINGS_STORAGE_KEY, initial);
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe('M8 isolated settings foundation', () => {
  it('matches canonical defaults with detached nested settings', () => {
    const result = SettingsSchema.parse({});
    expect(result).toEqual(DEFAULT_SETTINGS);
    result.autoPause.monthStart = false;
    result.audio.masterVolume = 0;
    expect(SettingsSchema.parse({})).toEqual(DEFAULT_SETTINGS);
  });
  it('recovers field by field, strips unknowns, clamps and quantizes UI-only scale', () => {
    const result = SettingsSchema.parse({
      defaultSpeed: 'x5',
      autoPause: { monthStart: false, envoy: 'false' },
      mapLabelDensity: 'low',
      effectsEnabled: false,
      language: 'ja',
      extra: true,
      notificationFilter: 'nonsense',
      audio: { masterVolume: 30, muted: 'yes' },
      uiScale: 9,
    });
    expect(result).toEqual({
      ...DEFAULT_SETTINGS,
      defaultSpeed: 'x5',
      mapLabelDensity: 'low',
      effectsEnabled: false,
      uiScale: 1.5,
      autoPause: { ...DEFAULT_SETTINGS.autoPause, monthStart: false },
      audio: { masterVolume: 30, muted: false },
    });
    expect(SettingsSchema.parse({ uiScale: -9 }).uiScale).toBe(0.8);
    expect(SettingsSchema.parse({ uiScale: 0.83 }).uiScale).toBe(0.85);
    expect(SettingsSchema.parse({ uiScale: Number.NaN }).uiScale).toBe(1);
    expect(SettingsSchema.parse({ uiScale: Number.POSITIVE_INFINITY }).uiScale).toBe(1);
  });
  it('explicitly migrates missing/version-zero preferences without guessing future versions', () => {
    expect(decodeSettings({ defaultSpeed: 'x2' })).toMatchObject({
      migrated: true,
      sourceVersion: null,
      fallback: null,
      settings: { settingsVersion: 1, defaultSpeed: 'x2' },
    });
    expect(decodeSettings({ settingsVersion: 0, effectsEnabled: false })).toMatchObject({
      migrated: true,
      sourceVersion: 0,
      settings: { effectsEnabled: false },
    });
    expect(decodeSettings({ settingsVersion: 99, effectsEnabled: false })).toMatchObject({
      migrated: false,
      fallback: 'unsupportedVersion',
      settings: DEFAULT_SETTINGS,
    });
    expect(decodeSettings([]).fallback).toBe('invalid');
  });
  it('tolerates empty, broken, inaccessible and unavailable local storage', () => {
    expect(loadSettings(memoryStorage()).settings).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(memoryStorage('{broken'))).toMatchObject({
      settings: DEFAULT_SETTINGS,
      fallback: 'invalid',
    });
    expect(loadSettings(null)).toMatchObject({
      settings: DEFAULT_SETTINGS,
      persistenceError: 'unavailable',
    });
    expect(
      loadSettings({
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {},
      }),
    ).toMatchObject({ settings: DEFAULT_SETTINGS, persistenceError: 'readFailed' });
  });
  it('persists and applies immediately; nested patches preserve siblings and reload survives', () => {
    const storage = memoryStorage(),
      apply = vi.fn<(settings: GameSettings) => void>();
    const store = createSettingsStore(storage, apply);
    expect(apply).toHaveBeenCalledTimes(1);
    store
      .getState()
      .updateSettings({ autoPause: { envoy: false }, audio: { muted: true }, defaultSpeed: 'x5' });
    expect(apply).toHaveBeenCalledTimes(2);
    expect(store.getState().settings.autoPause.monthStart).toBe(true);
    expect(store.getState().settings.audio.masterVolume).toBe(70);
    expect(createSettingsStore(storage).getState().settings).toEqual(store.getState().settings);
    // An integration callback cannot mutate the stored preferences through its supplied object.
    apply.mock.calls[1]![0].autoPause.monthStart = false;
    expect(store.getState().settings.autoPause.monthStart).toBe(true);
    store.getState().resetSettings();
    expect(JSON.parse(storage.getItem(SETTINGS_STORAGE_KEY)!)).toEqual(DEFAULT_SETTINGS);
    expect(store.getState().settings).toEqual(DEFAULT_SETTINGS);
  });
  it('write failure does not block in-memory application and later writes recover', () => {
    const storage = memoryStorage(),
      apply = vi.fn<(settings: GameSettings) => void>();
    const write = vi.spyOn(storage, 'setItem').mockImplementationOnce(() => {
      throw new Error('quota');
    });
    const store = createSettingsStore(storage, apply);
    store.getState().updateSettings({ effectsEnabled: false });
    expect(store.getState().persistenceError).toBe('writeFailed');
    expect(store.getState().settings.effectsEnabled).toBe(false);
    expect(apply).toHaveBeenLastCalledWith(expect.objectContaining({ effectsEnabled: false }));
    store.getState().updateSettings({ effectsEnabled: true });
    expect(store.getState().persistenceError).toBeNull();
    expect(write).toHaveBeenCalledTimes(2);
  });
  it('applies only explicit presentation/arrival adapters, not the active game speed', () => {
    const setProperty = vi.fn(),
      onMapSettings = vi.fn(),
      onNotificationFilter = vi.fn(),
      onArrivalAutoPause = vi.fn(),
      onDefaultSpeed = vi.fn();
    applySettings(
      SettingsSchema.parse({ uiScale: 1.2, defaultSpeed: 'x2', notificationFilter: 'major' }),
      {
        rootStyle: { setProperty },
        onMapSettings,
        onNotificationFilter,
        onArrivalAutoPause,
        onDefaultSpeed,
      },
    );
    expect(setProperty).toHaveBeenCalledWith('--ui-scale', '1.2');
    expect(setProperty).toHaveBeenCalledWith('font-size', 'calc(16px * 1.2)');
    expect(setProperty).toHaveBeenCalledWith('--font-size-sm', '0.875rem');
    expect(setProperty).toHaveBeenCalledWith('--space-4', '1rem');
    expect(onMapSettings).toHaveBeenCalledWith({ mapLabelDensity: 'medium', effectsEnabled: true });
    expect(onNotificationFilter).toHaveBeenCalledWith('major');
    expect(onArrivalAutoPause).toHaveBeenCalledWith(DEFAULT_SETTINGS.autoPause);
    expect(onDefaultSpeed).toHaveBeenCalledWith('x2');
  });
});
