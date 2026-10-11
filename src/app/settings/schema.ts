import { z } from 'zod';
import { UI } from '../../ui/uiConstants';

export const SETTINGS_VERSION = 1;
export const SETTINGS_STORAGE_KEY = 'tf.settings.v1';

const autoPauseSchema = z.object({
  monthStart: z.boolean().catch(true),
  proposal: z.boolean().catch(true),
  envoy: z.boolean().catch(true),
  siege: z.boolean().catch(true),
  battle: z.boolean().catch(true),
  event: z.boolean().catch(true),
});
const audioSchema = z.object({
  masterVolume: z.number().int().min(0).max(100).catch(70),
  muted: z.boolean().catch(false),
});

/** Preferences are presentation data, never part of GameState or a save envelope. */
export const SettingsSchema = z.object({
  settingsVersion: z.literal(SETTINGS_VERSION).catch(SETTINGS_VERSION),
  defaultSpeed: z.enum(['x1', 'x2', 'x5']).catch('x1'),
  autoPause: autoPauseSchema.catch(() => autoPauseSchema.parse({})),
  notificationFilter: z.enum(['all', 'major', 'critical']).catch('all'),
  mapLabelDensity: z.enum(['high', 'medium', 'low']).catch('medium'),
  effectsEnabled: z.boolean().catch(true),
  uiScale: z
    .number()
    .finite()
    .catch(1)
    .transform((value) => {
      const clamped = Math.max(UI.uiScaleMin, Math.min(UI.uiScaleMax, value));
      return Number((Math.round(clamped / UI.uiScaleStep) * UI.uiScaleStep).toFixed(2));
    }),
  audio: audioSchema.catch(() => audioSchema.parse({})),
  language: z.literal('zh-TW').catch('zh-TW'),
});

export type GameSettings = z.infer<typeof SettingsSchema>;
export type SettingsPatch = Partial<
  Omit<GameSettings, 'autoPause' | 'audio' | 'settingsVersion'>
> & {
  autoPause?: Partial<GameSettings['autoPause']>;
  audio?: Partial<GameSettings['audio']>;
};
export const DEFAULT_SETTINGS: Readonly<GameSettings> = Object.freeze({
  ...SettingsSchema.parse({}),
  autoPause: Object.freeze(autoPauseSchema.parse({})),
  audio: Object.freeze(audioSchema.parse({})),
});

export interface SettingsDecodeResult {
  settings: GameSettings;
  migrated: boolean;
  sourceVersion: number | null;
  fallback: 'invalid' | 'unsupportedVersion' | null;
}

/** Missing/version-0 legacy preferences migrate to v1; future versions are not guessed. */
export function decodeSettings(value: unknown): SettingsDecodeResult {
  const object =
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  const version = object?.settingsVersion;
  const sourceVersion = typeof version === 'number' && Number.isInteger(version) ? version : null;
  if (sourceVersion !== null && sourceVersion > SETTINGS_VERSION)
    return {
      settings: SettingsSchema.parse({}),
      migrated: false,
      sourceVersion,
      fallback: 'unsupportedVersion',
    };
  if (object === null || (sourceVersion !== null && sourceVersion < 0))
    return {
      settings: SettingsSchema.parse({}),
      migrated: false,
      sourceVersion,
      fallback: 'invalid',
    };
  return {
    settings: SettingsSchema.parse({ ...object, settingsVersion: SETTINGS_VERSION }),
    migrated: sourceVersion !== SETTINGS_VERSION,
    sourceVersion,
    fallback: null,
  };
}
