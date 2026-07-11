// Step 13 reports 系統：GameEvent 匯流排 → Report 落地／修剪、severity 分級、AutoPauseReason（M1-8）。
// 規格：plan/03-game-loop.md §3.4（GameEvent 匯流排與報告系統）——
//   §3.4.2 重要度分級與自動暫停對應表（canonical）／§3.4.3 reports 系統行為（NOT_REPORTED、push 規則、
//   dedupedAutoPauseReasons）／§5.4 reports 修剪演算法；plan/00-foundations.md §5.2（自動暫停事件列名）。
//
// 報告渲染契約（CLAUDE.md）：core 只存原始 `event`（02 §4.17 Report{id,day,event,read}），
// 顯示用 messageKey/params 由 UI 層 `renderReport`（13 §3.7）於渲染時導出——本檔不 import i18n、
// 不組裝任何顯示字串。
//
// 【push 排序裁決】02 §4.17 comment 明文「reports 陣列新→舊排列」（供 UI 報告中心直讀），
// 與 03 §3.4.3 虛擬碼之 `state.reports.push(makeReport(e))`（尾端追加＝舊→新）字面相牴觸；
// 依 00>02>系統（03）優先序採 02 之「新→舊」不變量，故本檔逐筆 `unshift` 於陣列前端插入
// （同 tick 內較晚發出之事件視為較新，故置於較前端，見 `reportsSystem` 迴圈）；03 之 `push`
// 視為虛擬碼簡化寫法、不影響修剪演算法正確性（修剪以 `Report.day` 與即時推導之 severity
// 判定「最舊」，不依賴陣列實體順序）。已回寫 plan/03-game-loop.md §8。
//
// 【autoPauseReasons 不讀 state.settings 裁決】03 §3.4.3 虛擬碼末行
// `dedupedAutoPauseReasons(events, state.settings)` 引用之 `state.settings` 不存在於 02 §4.1
// canonical GameState 樹（型別唯一真相；02 未收錄此欄位）。依 00>02 裁定：core 不持有／不讀取
// UI 偏好設定（「每項皆可於設定關閉」屬 app／UI 層關注點，00 §5.2 僅描述使用者可見行為，非 core
// 資料契約）；本檔 `reportsSystem` 只回傳「本 tick 全部適用之 AutoPauseReason」，是否真的暫停、
// 由 app 層驅動器（M1-16 起）依使用者設定過濾。已回寫 plan/03-game-loop.md §8。

import { BAL } from '../balance';
import type { ClanId } from '../state/ids';
import type { GameEvent, GameEventType } from '../state/events';
import type { GameState, Report } from '../state/gameState';
import { nextId } from '../state/serialize';
import type { AutoPauseReason } from './index';

/** 報告重要度三級（03 §3.4.2；不入庫，逐次由 event 即時推導）。 */
export type Severity = 'info' | 'warning' | 'critical';

/**
 * 不產生 Report 之事件型別（03 §3.4.3／13 §3.7(5) 權威登錄，逐字轉錄）。
 * 命中即不 push，即使 `isPlayerRelevant` 為真或 severity !== 'info' 亦然。
 */
export const NOT_REPORTED: ReadonlySet<GameEventType> = new Set<GameEventType>([
  'time.monthStart',
  'time.seasonStart', // app 層季首自動存檔消費（16 §5.3）
  'game.victory',
  'game.defeat', // 直接切結局畫面（10 §6.4）
  'policy.enacted',
  'policy.revoked', // 玩家主動操作之即時結果，UI 當下已回饋
  'proposal.resolved', // 玩家裁決之即時結果，UI 當下已回饋
  'conscript.completed', // 逐城逐月觸發，逐一報告灌爆報告匣
]);

/**
 * 事件是否與玩家勢力相關（03 §3.4.3；供 push 判定與部分 severity 分支共用）。
 * `event.clanIds` 為空陣列（純時間事件／世界級廣播）時恆為 false（02 §4.19 GameEventBase 註解）。
 */
export function isPlayerRelevant(event: GameEvent, playerClanId: ClanId): boolean {
  return event.clanIds.includes(playerClanId);
}

/**
 * 依 03 §3.4.2 canonical 分級表逐列判定 severity（視角別：`playerClanId`）。
 * 未列於表中的事件型別一律 info（表末「其餘未列事件」列）。
 */
export function severityOf(event: GameEvent, playerClanId: ClanId): Severity {
  switch (event.type) {
    // ── flat info（00 §5.2 列名，不分視角）──
    case 'time.monthStart':
    case 'proposal.submitted':
      return 'info';

    // ── flat critical（不分視角）──
    case 'siege.started': // 我方城被圍（00 §5.2 列名；本身恆 critical）
    case 'battle.kassenAvailable': // 玩家可發動（00 §5.2 列名）
    case 'shogunate.nominated': // 世界級廣播（六輪裁決 1）
    case 'shogunate.collapsed': // 世界級廣播（六輪裁決 1）
    case 'game.victory':
    case 'game.defeat':
      return 'critical';

    // ── flat warning（不分視角）──
    case 'diplo.envoyArrived':
    case 'command.rejected':
    case 'officer.loyaltyLow':
    case 'economy.upkeepUnpaid':
    case 'economy.foodShortage':
    case 'economy.granaryOverflow':
    case 'policy.autoRevoked':
      return 'warning';

    // ── flat info（明文定案，非表末預設落空）──
    case 'officer.recruitFailed': // 七輪裁決 2(b)
    case 'victory.tenkabitoProgress': // 七輪裁決 2(c)
    case 'clan.destroyed': // 涉我方另走 game.defeat
      return 'info';

    // ── event.fired：hasChoice 分流（00 §5.2 列名）──
    case 'event.fired':
      return event.hasChoice ? 'critical' : 'info';

    // ── battle.ended：我方參戰 critical；否則 info ──
    case 'battle.ended':
      return event.attackerClanId === playerClanId || event.defenderClanId === playerClanId
        ? 'critical'
        : 'info';

    // ── siege.ended／clan.succession：涉我方 critical；他勢力 info（以 clanIds 判定）──
    case 'siege.ended':
    case 'clan.succession':
      return isPlayerRelevant(event, playerClanId) ? 'critical' : 'info';

    // ── 涉我方 warning；他勢力 info（以 clanIds 判定；欄位語意見各事件說明）──
    case 'siege.relief': // 圍城方／守城方（clanIds=[圍城方,守城方]，七輪裁決 2）
    case 'army.routed': // 我方（clanId）
    case 'uprising.started': // 我方領內
    case 'uprising.ended': // 我方領內（六輪裁決 1）
      return isPlayerRelevant(event, playerClanId) ? 'warning' : 'info';

    case 'officer.died':
      return event.clanId === playerClanId ? 'warning' : 'info';
    case 'officer.defected':
      return event.fromClanId === playerClanId || event.toClanId === playerClanId
        ? 'warning'
        : 'info';
    case 'pact.expired':
    case 'pact.broken':
      return event.aClanId === playerClanId || event.bClanId === playerClanId ? 'warning' : 'info';

    // ── court.mediationResult：涉我方 critical；否則 warning（例外：非 info，朝廷/幕府政局大事）──
    case 'court.mediationResult':
      return event.clanId === playerClanId || event.targetClanId === playerClanId
        ? 'critical'
        : 'warning';

    // ── 當事勢力 warning；否則預設 info（clanIds 僅含當事勢力，六輪裁決 1）──
    case 'shogunate.patronLost':
      return event.clanId === playerClanId ? 'warning' : 'info';

    // ── diplo.workStopped：涉我方 warning；否則 info ──
    case 'diplo.workStopped':
      return event.clanId === playerClanId ? 'warning' : 'info';

    // ── transport.looted：被劫方視角 warning；劫方/第三方 info（六輪裁決追記）──
    case 'transport.looted':
      return event.ownerClanId === playerClanId ? 'warning' : 'info';

    // ── plot.exposed／plot.betrayalActivated：target critical；actor warning；否則 info ──
    case 'plot.exposed':
    case 'plot.betrayalActivated':
      if (event.targetClanId === playerClanId) return 'critical';
      if (event.actorClanId === playerClanId) return 'warning';
      return 'info';

    // ── 其餘未列事件 → info（03 §3.4.2 表末預設） ──
    default:
      return 'info';
  }
}

/** 自動暫停原因 canonical 排序（03 §3.4.2 表列序：先 monthStart，後續依表列出現順序）。 */
const AUTO_PAUSE_ORDER: readonly AutoPauseReason[] = [
  'monthStart',
  'siegeOnPlayer',
  'battleAvailable',
  'proposalArrived',
  'envoyArrived',
  'historicalEvent',
];

/** 單一事件對應之 AutoPauseReason（03 §3.4.2 表「自動暫停原因」欄；無對應則 null）。 */
function autoPauseReasonFor(event: GameEvent, playerClanId: ClanId): AutoPauseReason | null {
  switch (event.type) {
    case 'time.monthStart':
      return 'monthStart';
    case 'siege.started':
      // 我方城被圍（00 §5.2）：player 非攻方、但屬本次圍城之關聯勢力（即守方）。
      return event.attackerClanId !== playerClanId && event.clanIds.includes(playerClanId)
        ? 'siegeOnPlayer'
        : null;
    case 'battle.kassenAvailable':
      return 'battleAvailable';
    case 'proposal.submitted':
      return 'proposalArrived';
    case 'diplo.envoyArrived':
      return 'envoyArrived';
    case 'event.fired':
      return event.hasChoice ? 'historicalEvent' : null;
    default:
      return null;
  }
}

/** 本 tick 事件全集 → 去重＋依表列序排序後的 AutoPauseReason 陣列（03 §3.4.2 末段）。 */
function computeAutoPauseReasons(
  events: readonly GameEvent[],
  playerClanId: ClanId,
): AutoPauseReason[] {
  const present = new Set<AutoPauseReason>();
  for (const event of events) {
    const reason = autoPauseReasonFor(event, playerClanId);
    if (reason !== null) {
      present.add(reason);
    }
  }
  return AUTO_PAUSE_ORDER.filter((reason) => present.has(reason));
}

/** 修剪之犧牲者索引（03 §5.4）：由陣列尾端（最舊）向前找第一筆 info；若無則找第一筆 warning。 */
function findTrimVictimIndex(reports: readonly Report[], playerClanId: ClanId): number {
  let warningIdx = -1;
  for (let i = reports.length - 1; i >= 0; i -= 1) {
    const report = reports[i];
    if (!report) continue;
    const sev = severityOf(report.event, playerClanId);
    if (sev === 'info') return i;
    if (sev === 'warning' && warningIdx === -1) warningIdx = i;
  }
  return warningIdx; // 僅剩 critical 時為 -1（03 §5.4：critical 不受總數修剪）
}

/**
 * reports 修剪（03 §5.4）：先移除超過保留期（`BAL.reportRetentionDays`＝360 日）之全部項目，
 * 再逐一移除最舊的 info（無則 warning）直到 `reports.length ≤ BAL.reportMaxKept`（500）；
 * 僅剩 critical 時停止修剪（即使仍超量）。就地修改 `state.reports`。
 */
function trimReports(state: GameState): void {
  const cutoff = state.time.day - BAL.reportRetentionDays;
  const kept = state.reports.filter((r) => r.day >= cutoff);
  state.reports.length = 0;
  state.reports.push(...kept);

  while (state.reports.length > BAL.reportMaxKept) {
    const victimIndex = findTrimVictimIndex(state.reports, state.meta.playerClanId);
    if (victimIndex === -1) break; // 僅剩 critical，停止修剪（03 §5.4）
    state.reports.splice(victimIndex, 1);
  }
}

/**
 * Step 13 reports（03 §3.4.3）：消費本 tick 事件全集 → 依 NOT_REPORTED／severity／isPlayerRelevant
 * 追加 `Report`（新→舊插入，見檔頭裁決）、修剪保留期與總量、回傳去重排序後的 AutoPauseReason 陣列。
 * 就地修改 `state.reports`；不發出任何 GameEvent（本步為事件的終端消費者）。
 */
export function reportsSystem(state: GameState, events: readonly GameEvent[]): AutoPauseReason[] {
  const playerClanId = state.meta.playerClanId;

  for (const event of events) {
    if (NOT_REPORTED.has(event.type)) continue; // 13 §3.7(5) 權威登錄之排除集
    const sev = severityOf(event, playerClanId);
    if (isPlayerRelevant(event, playerClanId) || sev !== 'info') {
      // 逐筆 unshift（而非蒐集後批次插入）：確保同 tick 內較晚發出者位於陣列較前端，
      // 與跨 tick 之「新→舊」不變量（02 §4.17）在語意上一致（較晚發生＝較新）。
      state.reports.unshift({
        id: nextId(state, 'report'),
        day: event.day,
        event,
        read: false,
      });
    }
  }

  trimReports(state);

  return computeAutoPauseReasons(events, playerClanId);
}
