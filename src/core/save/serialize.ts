// 存檔 codec：GameState ⇄ SaveFile 信封 ⇄ JSON 字串（16 §3.2／§5.1／§5.5）。
// MVP 先行實作（原屬 M8-12 之核心子集；依使用者 2026-07-22「先完成可通關 MVP」指示）：
// - 信封欄位與序列化規則依 16 §3.2 canonical（version/timestamp/meta/state/pendingCommands）；
//   timestamp 由呼叫端注入（core 禁 Date.now，00 §5.5）。
// - 壓縮（lz-string）與儲存介質（idb-keyval）屬 app 層（16 §3.1），M8-13 落地；
//   本檔輸出/輸入皆為未壓縮 JSON 字串，同時即是 §3.5 匯出檔格式。
// - 淺驗證以手寫檢查代替 16 §5.5 的 zod schema（core 目前零 runtime 依賴；M8-12 若引入
//   schemas.ts 再抽換，錯誤碼契約不變）；深度防線＝validateState 25 條不變量。

import type { GameState } from '../state/gameState';
import type { Command } from '../commands/types';
import { validateState } from '../state/invariants';
import { clanKokudaka } from '../state/selectors';
import { createDerivedCache } from '../state/derivedCache';
import { SAVE_FORMAT_VERSION, runMigrationChain } from './migrate';
import { validateSavedAi } from './validateAi';
import { defaultOmittedEventPersistenceFields, validateSavedEvents } from './validateEvents';
import { validateSavedPendingCommands } from './validatePendingCommands';
import { validateSavedTaimei } from './validateTaimei';
import { dayToCalendar } from '../systems/time';

/** 列表顯示用摘要（16 §4.1 SaveMeta 子集；不需解壓 state 即可渲染）。 */
export interface SaveMeta {
  scenarioId: string;
  appVersion: string;
  clanId: string;
  clanName: string;
  leaderName: string;
  day: number; // Retained absolute day for legacy consumers and date conversion.
  castleCount: number;
  officerCount: number;
  totalKokudaka: number; // 石（floor）
  difficulty: string;
  // Additive metadata: legacy format-3 envelopes and caches may omit these fields.
  date?: { year: number; month: number; day: number };
  dateText?: string;
  seed?: number;
  playtimeSeconds?: number;
  version?: number;
  slotLabel?: string;
}

export interface CanonicalSaveMeta extends SaveMeta {
  date: { year: number; month: number; day: number };
  dateText: string;
  seed: number;
  playtimeSeconds: number;
  version: number;
  slotLabel: string;
}

/** App-only elapsed time and labels are injected, never sampled by the core. */
export interface SaveMetadataContext {
  playtimeSeconds?: number;
  appVersion?: string;
  slotLabel?: string;
}

/** 存檔信封（16 §3.2／§4.1）。 */
export interface SaveFile {
  version: number;
  timestamp: number; // Unix 毫秒；呼叫端注入
  meta: SaveMeta;
  state: GameState;
  pendingCommands: Command[]; // 存檔當下未結算佇列（16 §8-D3；MVP 存檔一律於 tick 邊界＝空）
}

/** 讀檔錯誤碼（16 §4.3 子集）。 */
export type SaveDecodeError = 'invalidFile' | 'newerVersion' | 'corrupt';

export type SaveDecodeResult =
  { ok: true; saveFile: SaveFile; migrated: boolean } | { ok: false; code: SaveDecodeError };

/** 由 state 組列表摘要（16 §3.3 第 3 點的資料來源）。 */
export function buildSaveMeta(
  state: GameState,
  context: SaveMetadataContext = {},
): CanonicalSaveMeta {
  const playtimeSeconds = context.playtimeSeconds === undefined ? 0 : context.playtimeSeconds;
  if (!Number.isSafeInteger(playtimeSeconds) || playtimeSeconds < 0)
    throw new RangeError('Invalid save playtime');
  if (context.appVersion !== undefined && typeof context.appVersion !== 'string')
    throw new TypeError('Invalid save app version');
  if (context.slotLabel !== undefined && typeof context.slotLabel !== 'string')
    throw new TypeError('Invalid save slot label');
  const { year, month, dayOfMonth } = dayToCalendar(state.time.day);
  const playerClanId = state.meta.playerClanId;
  const clan = state.clans[playerClanId];
  const leader = clan ? state.officers[clan.leaderId] : undefined;
  let castleCount = 0;
  for (const castle of Object.values(state.castles)) {
    if (castle.ownerClanId === playerClanId) castleCount += 1;
  }
  let officerCount = 0;
  for (const officer of Object.values(state.officers)) {
    if (officer.status === 'serving' && officer.clanId === playerClanId) officerCount += 1;
  }
  return {
    scenarioId: state.meta.scenarioId,
    appVersion: context.appVersion ?? state.meta.appVersion,
    clanId: playerClanId,
    clanName: clan?.name ?? '',
    leaderName: leader?.name ?? '',
    day: state.time.day,
    castleCount,
    officerCount,
    totalKokudaka: Math.floor(clanKokudaka(state, createDerivedCache(), playerClanId)),
    difficulty: state.meta.difficulty,
    date: { year, month, day: dayOfMonth },
    dateText: `${String(year)}年${String(month)}月${String(dayOfMonth)}日`,
    seed: state.meta.seed,
    playtimeSeconds,
    version: SAVE_FORMAT_VERSION,
    slotLabel: context.slotLabel ?? '',
  };
}

/**
 * 組存檔信封（16 §5.1；存檔一律於 tick 邊界，pendingCommands 由呼叫端提供、預設空）。
 * state 以 JSON 深拷貝快照（02 §3.4 保證全樹 plain JSON），與活狀態解耦。
 */
export function buildSaveFile(
  state: GameState,
  timestamp: number,
  pendingCommands: Command[] = [],
  context: SaveMetadataContext = {},
): SaveFile {
  return {
    version: SAVE_FORMAT_VERSION,
    timestamp,
    meta: buildSaveMeta(state, context),
    state: JSON.parse(
      JSON.stringify({ ...state, ai: { ...state.ai, intentLog: [] } }),
    ) as GameState,
    pendingCommands: JSON.parse(JSON.stringify(pendingCommands)) as Command[],
  };
}

/** 序列化（16 §3.2 規則 3：JSON.stringify、無自訂 replacer）。 */
export function encodeSave(
  state: GameState,
  timestamp: number,
  pendingCommands: Command[] = [],
  context: SaveMetadataContext = {},
): string {
  return JSON.stringify(buildSaveFile(state, timestamp, pendingCommands, context));
}

/** 信封淺驗證（16 §5.5 步驟 3/5 的手寫版；只驗型別骨架，深度交給 invariants）。 */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** 摘要不需深驗證 state，但其顯示欄位必須可安全使用。 */
export function validSaveMeta(value: unknown): value is SaveMeta {
  if (!isPlainObject(value)) return false;
  if (
    !['scenarioId', 'appVersion', 'clanId', 'clanName', 'leaderName', 'difficulty'].every(
      (key) => typeof value[key] === 'string',
    )
  )
    return false;
  if (
    !['day', 'castleCount', 'officerCount', 'totalKokudaka'].every(
      (key) =>
        typeof value[key] === 'number' &&
        Number.isFinite(value[key]) &&
        Number.isInteger(value[key]) &&
        value[key] >= 0,
    )
  )
    return false;
  for (const key of ['dateText', 'slotLabel']) {
    if (Object.hasOwn(value, key) && typeof value[key] !== 'string') return false;
  }
  for (const key of ['seed', 'playtimeSeconds', 'version']) {
    if (!Object.hasOwn(value, key)) continue;
    const numeric = value[key];
    if (typeof numeric !== 'number' || !Number.isSafeInteger(numeric) || numeric < 0) return false;
    if (key === 'seed' && numeric > 0xffffffff) return false;
    if (key === 'version' && numeric < 1) return false;
  }
  if (Object.hasOwn(value, 'date')) {
    const date = value.date;
    if (
      !isPlainObject(date) ||
      !Number.isSafeInteger(date.year) ||
      (date.year as number) < 1 ||
      !Number.isInteger(date.month) ||
      (date.month as number) < 1 ||
      (date.month as number) > 12 ||
      !Number.isInteger(date.day) ||
      (date.day as number) < 1 ||
      (date.day as number) > 30
    )
      return false;
  }
  return true;
}

function shallowValidEnvelope(v: unknown): v is SaveFile {
  if (!isPlainObject(v)) return false;
  if (typeof v.version !== 'number' || !Number.isInteger(v.version) || v.version < 1) return false;
  if (typeof v.timestamp !== 'number' || !Number.isFinite(v.timestamp) || v.timestamp < 0)
    return false;
  if (!validSaveMeta(v.meta)) return false;
  if (!Array.isArray(v.pendingCommands)) return false;
  const state = v.state;
  if (!isPlainObject(state)) return false;
  for (const key of [
    'meta',
    'time',
    'rng',
    'clans',
    'officers',
    'castles',
    'districts',
    'events',
    'ai',
  ]) {
    if (!isPlainObject(state[key])) return false;
  }
  return true;
}

/** 16 §3.7: check the thirteen top-level shapes, not their nested payloads. */
function shallowValidState(state: GameState): boolean {
  return (
    [
      'time',
      'clans',
      'officers',
      'castles',
      'districts',
      'provinces',
      'armies',
      'battles',
      'diplomacy',
      'court',
      'events',
      'rng',
    ].every((key) => isPlainObject(state[key as keyof GameState])) && Array.isArray(state.reports)
  );
}

/**
 * 反序列化＋遷移＋驗證（16 §5.5）：
 * 1. JSON.parse 失敗 → invalidFile
 * 2. 信封淺驗證失敗 → invalidFile
 * 3. version > SAVE_FORMAT_VERSION → newerVersion
 * 4. 遷移鏈執行（失敗 → corrupt）
 * 5. validateState 不變量違規 → corrupt
 */
export function decodeSave(raw: string): SaveDecodeResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, code: 'invalidFile' };
  }
  if (!shallowValidEnvelope(parsed)) return { ok: false, code: 'invalidFile' };
  if (parsed.version > SAVE_FORMAT_VERSION) return { ok: false, code: 'newerVersion' };
  const migrated = parsed.version < SAVE_FORMAT_VERSION;
  try {
    runMigrationChain(parsed);
    defaultOmittedEventPersistenceFields(parsed.state);
    parsed.state.ai.intentLog = [];
  } catch {
    return { ok: false, code: 'corrupt' };
  }
  try {
    if (
      !shallowValidState(parsed.state) ||
      !validateSavedPendingCommands(parsed.pendingCommands, parsed.state.meta.playerClanId) ||
      !validateSavedAi(parsed.state) ||
      !validateSavedEvents(parsed.state) ||
      !validateSavedTaimei(parsed.state) ||
      validateState(parsed.state).length > 0
    )
      return { ok: false, code: 'corrupt' };
  } catch {
    return { ok: false, code: 'corrupt' };
  }
  return { ok: true, saveFile: parsed, migrated };
}
