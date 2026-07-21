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

/** 列表顯示用摘要（16 §4.1 SaveMeta 子集；不需解壓 state 即可渲染）。 */
export interface SaveMeta {
  scenarioId: string;
  appVersion: string;
  clanId: string;
  clanName: string;
  leaderName: string;
  day: number; // 遊戲內絕對日（日期文字由 UI 以 i18n formatDate 導出）
  castleCount: number;
  officerCount: number;
  totalKokudaka: number; // 石（floor）
  difficulty: string;
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
export function buildSaveMeta(state: GameState): SaveMeta {
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
    appVersion: state.meta.appVersion,
    clanId: playerClanId,
    clanName: clan?.name ?? '',
    leaderName: leader?.name ?? '',
    day: state.time.day,
    castleCount,
    officerCount,
    totalKokudaka: Math.floor(clanKokudaka(state, createDerivedCache(), playerClanId)),
    difficulty: state.meta.difficulty,
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
): SaveFile {
  return {
    version: SAVE_FORMAT_VERSION,
    timestamp,
    meta: buildSaveMeta(state),
    state: JSON.parse(JSON.stringify(state)) as GameState,
    pendingCommands: JSON.parse(JSON.stringify(pendingCommands)) as Command[],
  };
}

/** 序列化（16 §3.2 規則 3：JSON.stringify、無自訂 replacer）。 */
export function encodeSave(
  state: GameState,
  timestamp: number,
  pendingCommands: Command[] = [],
): string {
  return JSON.stringify(buildSaveFile(state, timestamp, pendingCommands));
}

/** 信封淺驗證（16 §5.5 步驟 3/5 的手寫版；只驗型別骨架，深度交給 invariants）。 */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function shallowValidEnvelope(v: unknown): v is SaveFile {
  if (!isPlainObject(v)) return false;
  if (typeof v.version !== 'number' || !Number.isInteger(v.version) || v.version < 1) return false;
  if (typeof v.timestamp !== 'number') return false;
  if (!isPlainObject(v.meta)) return false;
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
  } catch {
    return { ok: false, code: 'corrupt' };
  }
  try {
    if (validateState(parsed.state).length > 0) return { ok: false, code: 'corrupt' };
  } catch {
    return { ok: false, code: 'corrupt' };
  }
  return { ok: true, saveFile: parsed, migrated };
}
