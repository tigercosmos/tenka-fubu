// 合戰（戰術戰場）子迴圈契約：`advanceBattleTick` 假解算器 stub（M1-26）。
// 規格：plan/03-game-loop.md §3.7.2（Battle 子狀態機與自有 tick／原子寫回契約）；
//       plan/07-military.md §3.9／§5.4（battle tick 順序、勝敗判定）；plan/18-roadmap.md M1-26。
//
// 【M1-26 疑義裁決｜回寫 03 §8】03 §3.7.2 的 `advanceBattleTick` 簽名範例只列
// `(state, battleId)`，但同段散文明言「合戰內玩家操作（移動、戰法）以 BattleCommand 直接作為
// advanceBattleTick 的參數傳入」，且 07 §5.4 偽碼為 `advanceBattleTick(bs, orders)`（內部又需完整
// `state` 才能呼叫 `resolveBattle(state, bs)`）——三處互不一致。依 00>02>15>03 裁定：
// canonical 簽名採三參數 `(state, battleId, orders)`（本檔 `advanceBattleTick`），內部讀寫
// `state.battles[battleId]`（03 §3.7.2 讀寫邊界不變）。`BattleTickResult`／`BattleCommand` 兩型別
// 未見於 02/03/07 既有定義（只有 03 §3.7.2 提及型別名、無欄位），本檔依「回傳值僅供驅動器判斷本次
// 呼叫是否已 resolved」之語意新增最小 canonical 定義（見下）。已回寫 plan/03-game-loop.md §8。
//
// 【M1-26 範圍裁定】本檔為「假解算器」（roadmap 原文）：真實合戰逐 tick 交戰演算法（訂單消化、
// 移動、戰法、佔領、士氣、追擊……07 §5.4 step 1–7）留待 M5-2/M5-3 依 07 §5.4／§3.6–§3.9 完整實作；
// 本檔僅示範 03 §3.7.2 的「契約形狀」：
//   1. 凍結：`bs.result === null` 期間，每次呼叫只累加 `bs.tick`，不觸碰 `state.armies`／
//      `state.meta` 等策略層區塊（03 §3.7.2「不得觸碰策略層其他區塊，直到 resolved 寫回」）。
//   2. 勝敗判定：`bs.tick` 達 `BAL.kassenMaxTicks` 時，依 07 §3.9 規則 3（tiebreak，§8 D9 無平手）
//      以雙方 `BattleUnit.troops` 加總近似 07 §3.3 的 power 比較（真實 power 公式含地形／特性／
//      挾擊，留待 M5-2 對齊 07 §5.4 step 4 引入）。
//   3. 原子寫回：勝敗判定成立的同一次呼叫內，一次性完成——`bs.result` 寫入、`state.armies[armyId]`
//      依 `BattleUnit.troops`/`morale` 現值同步（03 §3.7.2「套用傷亡與士氣至 state.armies」）、
//      `battle.ended` 事件併入 `state.meta.deferredEvents`（03 §3.7.2「掛入下一個 tick 的事件流」）。
//      部隊全滅移除／俘虜入列／威風翻轉郡歸屬（`territoryChangedToday`）為 M5-2（軍隊移除）／
//      M5-5（`judgeAwe`）／M6-10（捕虜）之完整結算範圍，本 stub 明確不處理（`aweLevel` 恆 `'none'`、
//      不移除全滅部隊、不產生 `officer.captured`）——呼叫端（M1-26 測試）以殘存兵力恆 >0 的假想
//      合戰佈局驗證契約形狀，不構造全滅場景。

import { BAL } from '../balance';
import { CoreError } from '../errors';
import type { GameState, BattleResult, BattleSide, BattleState } from '../state/gameState';
import type { BattleId } from '../state/ids';

/**
 * 合戰內玩家操作之最小 shape（07 完整型別／語意留待 M5-3 依 07 §6.2 定案）。
 * M1-26 stub 僅供 `advanceBattleTick` 簽名成立；本檔不消化其內容（無逐 tick 交戰邏輯，見檔頭）。
 */
export interface BattleCommand {
  readonly kind: 'move' | 'tactic' | 'toggleDelegate';
  readonly unitId: string;
}

/**
 * `advanceBattleTick` 回傳值（03 §3.7.2 契約；型別未見於既有規格，依檔頭裁決新增 canonical 定義）。
 * 僅供驅動器（UI，M5-6）判斷本次呼叫是否已觸發原子寫回，藉此決定是否停止合戰 tick 計時器並開啟
 * 結果畫面；完整合戰狀態一律讀 `state.battles[battleId]`，不透過本回傳值鏡射。
 */
export interface BattleTickResult {
  battleId: BattleId;
  tick: number; // 本次呼叫後 bs.tick 現值
  resolved: boolean; // 本次呼叫是否使 bs.result 由 null 轉為非 null（原子寫回是否已發生）
}

/** 某側 `BattleUnit.troops` 加總（07 §3.3 power 公式之簡化近似，見檔頭範圍裁定）。 */
function sideTroops(bs: BattleState, side: BattleSide): number {
  let sum = 0;
  for (const unit of bs.units) {
    if (unit.side === side) sum += unit.troops;
  }
  return sum;
}

/** 07 §3.9 規則 3（時限到期 tiebreak，§8 D9：無平手）：攻方需 ≥ 守方 × `BAL.kassenTiebreakMult`。 */
function judgeWinnerByTiebreak(bs: BattleState): BattleSide {
  const attackerPower = sideTroops(bs, 'attacker');
  const defenderPower = sideTroops(bs, 'defender');
  return attackerPower >= defenderPower * BAL.kassenTiebreakMult ? 'attacker' : 'defender';
}

/**
 * 原子寫回（03 §3.7.2）：寫 `bs.result`、同步存活部隊兵力／士氣至 `state.armies`、
 * 將 `battle.ended` 併入 `state.meta.deferredEvents`。單次呼叫內一次性完成，呼叫前 `state.armies`
 * 對本合戰涉及部隊恆未變（見 `advanceBattleTick` 凍結段）。
 */
function resolveBattleStub(state: GameState, bs: BattleState): void {
  const winnerSide = judgeWinnerByTiebreak(bs);
  const attackerLosses = Math.max(
    0,
    bs.units
      .filter((u) => u.side === 'attacker')
      .reduce((acc, u) => acc + Math.max(0, u.battleInitialTroops - u.troops), 0),
  );
  const defenderLosses = Math.max(
    0,
    bs.units
      .filter((u) => u.side === 'defender')
      .reduce((acc, u) => acc + Math.max(0, u.battleInitialTroops - u.troops), 0),
  );

  const result: BattleResult = {
    winnerSide,
    endTick: bs.tick,
    attackerLosses,
    defenderLosses,
    aweLevel: 'none', // 真實威風判定（07 judgeAwe）留待 M5-5；本 stub 不觸發威風／領地翻轉
  };

  for (const unit of bs.units) {
    const army = state.armies[unit.armyId];
    if (army === undefined) {
      throw new CoreError(
        'DATA_INTEGRITY',
        `合戰 ${bs.id} 的部隊 ${unit.armyId} 於 state.armies 不存在（M1-26 契約：寫回前必須存在）`,
        { battleId: bs.id, armyId: unit.armyId },
      );
    }
    army.soldiers = unit.troops;
    army.morale = unit.morale;
  }

  bs.result = result;

  const winnerClanId = winnerSide === 'attacker' ? bs.attackerClanId : bs.defenderClanId;
  state.meta.deferredEvents.push({
    type: 'battle.ended',
    day: state.time.day,
    clanIds: [bs.attackerClanId, bs.defenderClanId],
    battleId: bs.id,
    winnerClanId,
    aweLevel: result.aweLevel,
    attackerLosses: result.attackerLosses,
    defenderLosses: result.defenderLosses,
    nodeId: bs.nodeId,
    attackerClanId: bs.attackerClanId,
    defenderClanId: bs.defenderClanId,
  });
}

/**
 * 合戰子迴圈 tick（03 §3.7.2；假解算器，見檔頭範圍裁定）。
 * 只讀寫 `state.battles[battleId]` 內部欄位；`bs.result` 轉非 null 之同一次呼叫內另原子寫回
 * `state.armies`（存活部隊）與 `state.meta.deferredEvents`（`battle.ended`），此為契約允許的
 * 唯一策略層觸碰點（03 §3.7.2）。呼叫端須在 `resolved:true` 後停止呼叫（UI 關閉 modal，
 * 03 §3.7.2「玩家關閉結果畫面」）；違反者擲 `CoreError`（缺陷，非規則拒絕，01 §3.10.1）。
 */
export function advanceBattleTick(
  state: GameState,
  battleId: BattleId,
  orders: readonly BattleCommand[] = [],
): BattleTickResult {
  const bs = state.battles[battleId];
  if (bs === undefined) {
    throw new CoreError('DATA_INTEGRITY', `合戰 ${battleId} 不存在`, { battleId });
  }
  if (bs.result !== null) {
    throw new CoreError(
      'INVALID_COMMAND_SHAPE',
      `合戰 ${battleId} 已結束（resolved），不得再呼叫 advanceBattleTick`,
      { battleId },
    );
  }

  // M1-26 假解算器：orders 型別存在供簽名成立，內容消化（移動/戰法/委任）留待 M5-2/M5-3。
  void orders;

  bs.tick += 1;

  if (bs.tick >= BAL.kassenMaxTicks) {
    resolveBattleStub(state, bs);
  }

  return { battleId, tick: bs.tick, resolved: bs.result !== null };
}
