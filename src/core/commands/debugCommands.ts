// debug 指令（debugSkipDays／debugGrant）之驗證器與套用函式。
// 規格：plan/03-game-loop.md §3.9.2（debug 指令契約）／§3.3.2（reasonKey）；03 專有、02 §4.18 未收。
//
// debugSkipDays：驗證 debugMode＋days∈[1,BAL.debugSkipMaxDays]；套用為 core no-op——實際連續
//   advanceDay（空佇列）由 app 層驅動器執行（§3.9.2；M1-16／M1-22）。
// debugGrant：驗證 debugMode＋目標存在；套用直接加資源（gold→clan.gold、food→castle.food）。

import type { GameState } from '../state/gameState';
import type { CmdDebugGrant, CmdDebugSkipDays, ValidationResult } from './types';
import { REJECT_REASONS } from './reasons';
import { BAL } from '../balance';

/** debugSkipDays 驗證（03 §3.9.2）：需 debug 模式、days 為 1..BAL.debugSkipMaxDays 之整數。 */
export function validateDebugSkipDays(
  state: Readonly<GameState>,
  cmd: CmdDebugSkipDays,
): ValidationResult {
  if (!state.meta.debugMode) {
    return { ok: false, reasonKey: REJECT_REASONS.debugOnly };
  }
  if (!Number.isInteger(cmd.days) || cmd.days < 1 || cmd.days > BAL.debugSkipMaxDays) {
    return {
      ok: false,
      reasonKey: REJECT_REASONS.debugBadRange,
      params: { max: BAL.debugSkipMaxDays },
    };
  }
  return { ok: true };
}

/**
 * debugSkipDays 套用（03 §3.9.2）：core no-op。時間跳轉由 app 層驅動器連續呼叫 advanceDay 執行；
 * 套用成功（未被拒）即為驅動器可據以進入跳轉模式之訊號。無參數以避開 noUnusedParameters
 *（少於 Applier 簽名之尾端參數仍可指派）。
 */
export function applyDebugSkipDays(): void {
  // 刻意留空：見上（M1-16／M1-22 於 app 層實作實際跳轉）。
}

/** debugGrant 驗證（03 §3.9.2）：需 debug 模式；發令勢力存在；food 非 0 時需存在的目標城。 */
export function validateDebugGrant(
  state: Readonly<GameState>,
  cmd: CmdDebugGrant,
): ValidationResult {
  if (!state.meta.debugMode) {
    return { ok: false, reasonKey: REJECT_REASONS.debugOnly };
  }
  if (state.clans[cmd.clanId] === undefined) {
    return { ok: false, reasonKey: REJECT_REASONS.invalidTarget };
  }
  if (cmd.castleId !== null && state.castles[cmd.castleId] === undefined) {
    return { ok: false, reasonKey: REJECT_REASONS.invalidTarget };
  }
  // food 為城資源：非 null 且非 0 時必須指定存在的城
  if (cmd.food !== null && cmd.food !== 0 && cmd.castleId === null) {
    return { ok: false, reasonKey: REJECT_REASONS.invalidTarget };
  }
  return { ok: true };
}

/**
 * debugGrant 套用（03 §3.9.2）：gold 加至發令勢力 clan.gold、food 加至 castleId 城 castle.food。
 * 目標存在性已於 validate 保證；此處對缺項 fail-fast（§3.3.3；理論不可達）。emit 未用（尾端省略）。
 */
export function applyDebugGrant(state: GameState, cmd: CmdDebugGrant): void {
  if (cmd.gold !== null) {
    const clan = state.clans[cmd.clanId];
    if (clan === undefined) {
      throw new Error(`applyDebugGrant: clan '${cmd.clanId}' vanished after validation`);
    }
    clan.gold += cmd.gold;
  }
  if (cmd.food !== null && cmd.castleId !== null) {
    const castle = state.castles[cmd.castleId];
    if (castle === undefined) {
      throw new Error(`applyDebugGrant: castle '${cmd.castleId}' vanished after validation`);
    }
    castle.food += cmd.food;
  }
}
