// AI 排程器骨架（M1-24；規格：plan/03-game-loop.md §3.8.2／§7-T10、plan/18-roadmap.md M1-24）。
// 型別唯一真相：plan/02-data-model.md §4.20（AiState／AiClanState／CouncilPhase，已於
// src/core/state/gameState.ts 逐字轉錄）。
//
// 範圍（M1 骨架 vs M7-4 完整版，見 03 §8-D12）：
// 本檔本階段只實作「排程攤平」——每月入列、每 tick 以固定家數消化——評定「本體」
// （威脅／軍事／內政／外交四階段之實際決策內容，09 §3.4）為空殼：一個勢力被排到後，
// 直接視為完成評定，不下達任何 Command、不寫 intentLog。
// M7-4（09-T4）將擴充為 09 §3.3／§5.9 的完整版：councilOffset 錯開全月＋單一勢力
// 攤平為 4 階段＋以 BAL.aiCouncilMaxPerTick 做「階段」層級削峰（deferredPhases 佇列）。
// 本檔的 pendingPhases 因此只在「滿載四階段」與「清空」兩個合法後綴間切換，
// 不會停留在局部後綴——局部後綴狀態是 M7-4 逐階段執行後才會出現。

import { BAL } from '../../balance';
import type { AiClanState, AiState, CouncilPhase } from '../../state/gameState';
import type { ClanId } from '../../state/ids';

/** 評定四階段，依序執行（09 §3.4；02 §4.20 CouncilPhase）。 */
const COUNCIL_PHASES: readonly CouncilPhase[] = ['threat', 'military', 'domestic', 'diplomacy'];

/** 本月尚待入列：目前無待辦階段，且最近一次完成評定早於本月月初（含從未評定過）。 */
function needsEnrollment(clan: AiClanState, monthStartDay: number): boolean {
  return clan.pendingPhases.length === 0 && clan.lastCouncilDay < monthStartDay;
}

/**
 * 入列（03 §3.8.2「入列」）：每月 1 日呼叫一次。
 * 對呼叫端指定的 AI 勢力（存活、非玩家勢力之篩選責任在呼叫端，本模組不讀 Clan/meta），
 * 若本月尚未評定，將其 `pendingPhases` 填滿四階段、等待後續 tick 消化。
 * 依 clanId 字典序處理以維持決定論（雖然填滿順序不影響結果，仍與消化端排序方式一致）。
 */
export function enrollMonthlyCouncils(
  ai: Pick<AiState, 'clans'>,
  aiClanIds: readonly ClanId[],
  monthStartDay: number,
): void {
  for (const clanId of [...aiClanIds].sort()) {
    const clan = ai.clans[clanId];
    if (clan !== undefined && needsEnrollment(clan, monthStartDay)) {
      clan.pendingPhases = [...COUNCIL_PHASES];
    }
  }
}

/**
 * 消化游標（03 §3.8.2「消化」／§8-D8）：每 tick 呼叫一次（含入列當日）。
 * 依 clanId 字典序取至多 `BAL.aiCouncilsPerTick` 家仍有待辦評定的勢力，各執行一次評定
 * （本體空殼，見檔頭說明），使 40 家於 10 tick 內各評定恰一次、不重不漏。
 * 回傳本 tick 實際完成評定的 clanId（決定論，供測試／debug 使用）。
 */
export function runCouncilTick(ai: Pick<AiState, 'clans'>, today: number): ClanId[] {
  const due = Object.values(ai.clans)
    .filter((clan) => clan.pendingPhases.length > 0)
    .sort((a, b) => (a.clanId < b.clanId ? -1 : a.clanId > b.clanId ? 1 : 0));

  const executed: ClanId[] = [];
  for (const clan of due) {
    if (executed.length >= BAL.aiCouncilsPerTick) {
      break;
    }
    runCouncilStub(clan, today);
    executed.push(clan.clanId);
  }
  return executed;
}

/**
 * 評定本體（空殼；M7-4 依 09 §3.4 逐階段補完實際決策內容）。
 * M1 骨架直接視為四階段一次完成：清空 pendingPhases、記錄完成日，不下達 Command。
 */
function runCouncilStub(clan: AiClanState, today: number): void {
  clan.pendingPhases = [];
  clan.lastCouncilDay = today;
}
