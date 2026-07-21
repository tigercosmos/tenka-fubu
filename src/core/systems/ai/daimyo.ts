// 最小大名 AI（MVP 先行實作；09 §3.4 完整評定四階段屬 M7，屆時本檔擴充為 Phase A–D）。
// 依使用者 2026-07-22「先完成可通關 MVP」指示：讓 AI 勢力具備最低限度的攻性行為，
// 使一局遊戲有輸贏張力。徵兵與內政已由既有系統自動運轉（conscription／development／economy
// 對全勢力一視同仁），本檔只補「出陣攻擊」決策。
//
// 設計原則：
// - 每月評定一次（scheduler 攤平消化，03 §3.8.2），每次評定至多發起一次出陣。
// - 完全決定論、無亂數：候選城／目標／人選皆以固定鍵排序，重放 bit-exact。
// - 指令走與玩家相同的 validateCommand／applyCommand 管線（權限、兵力、糧秣、路徑同一套
//   驗證；mission 由 march 管線自動判為 conquer → 抵達即攻城）。驗證不過＝該月放棄，不重試。
// - persona 掛鉤：aggression 線性下修攻擊門檻（BAL.aiAttackRatioBase −
//   aggression/100 × BAL.aiAttackRatioAggressionSpan）。其餘 persona 軸留待 M7。

import { BAL } from '../../balance';
import { applyCommand } from '../../commands/apply';
import { validateCommand } from '../../commands/validate';
import type { EmitFn } from '../../commands/registry';
import type { Command } from '../../commands/types';
import { RANK_VALUES } from '../../state/enums';
import { buildMapGraph } from '../../state/mapGraph';
import { computePath, getStance } from '../pathfinding';
import type { Castle, GameState, Officer } from '../../state/gameState';
import type { CastleId, ClanId } from '../../state/ids';

/** 城中可任大將的最強武將（統率＋成長降冪、id 升冪；無可用者 null）。 */
function pickLeader(
  state: Readonly<GameState>,
  clanId: ClanId,
  castleId: CastleId,
): Officer | null {
  let best: Officer | null = null;
  for (const officer of Object.values(state.officers)) {
    if (
      officer.status !== 'serving' ||
      !officer.hasComeOfAge ||
      officer.clanId !== clanId ||
      officer.locationCastleId !== castleId ||
      officer.armyId !== null
    ) {
      continue;
    }
    const ldr = officer.ldr + officer.statGrowth.ldr;
    const bestLdr = best === null ? -1 : best.ldr + best.statGrowth.ldr;
    if (ldr > bestLdr || (ldr === bestLdr && best !== null && officer.id < best.id)) {
      best = officer;
    }
  }
  return best;
}

/** 武將帶兵上限（與 validateMarch 同式：當主取最高階，餘依身分階；rankTroopCap）。 */
function troopCap(state: Readonly<GameState>, clanId: ClanId, officer: Officer): number {
  const rankIndex =
    state.clans[clanId]?.leaderId === officer.id
      ? RANK_VALUES.length - 1
      : RANK_VALUES.indexOf(officer.rank);
  return BAL.rankTroopCap[rankIndex] ?? 0;
}

/**
 * 單一 AI 勢力的月度評定本體（scheduler 消化時呼叫；MVP＝一次出陣決策）。
 * 出陣條件：在外部隊數 < BAL.aiMaxConcurrentArmies；出陣城保留 BAL.aiGarrisonFloorTroops
 * 守軍後仍有 ≥ minMarchTroops 可動兵；對最弱可及敵城的兵力比 ≥ persona 調整後門檻；
 * 行軍 ≤ BAL.aiAttackMaxTravelDays。
 */
export function runDaimyoCouncil(state: GameState, clanId: ClanId, emit: EmitFn): void {
  const clan = state.clans[clanId];
  if (clan?.alive !== true) return;
  let activeArmies = 0;
  for (const army of Object.values(state.armies)) {
    if (army.clanId === clanId) activeArmies += 1;
  }
  if (activeArmies >= BAL.aiMaxConcurrentArmies) return;

  const personaId = state.ai.clans[clanId]?.personaId;
  const aggression =
    (personaId !== undefined ? state.ai.personas[personaId]?.aggression : undefined) ?? 50;
  const ratio = BAL.aiAttackRatioBase - (aggression / 100) * BAL.aiAttackRatioAggressionSpan;

  // 目標候選：敵性（war/neutral）城，守軍升冪（先打最弱）、id 升冪
  const targets: Castle[] = Object.values(state.castles)
    .filter((castle) => {
      if (castle.ownerClanId === clanId) return false;
      const stance = getStance(state, clanId, castle.ownerClanId);
      return stance === 'war' || stance === 'neutral';
    })
    .sort((a, b) => a.soldiers - b.soldiers || (a.id < b.id ? -1 : 1));
  if (targets.length === 0) return;

  // 出陣城候選：直轄非軍團城，守軍降冪（先用最強城）、id 升冪
  const origins: Castle[] = Object.values(state.castles)
    .filter(
      (castle) => castle.ownerClanId === clanId && castle.directControl && castle.corpsId === null,
    )
    .sort((a, b) => b.soldiers - a.soldiers || (a.id < b.id ? -1 : 1));

  const graph = buildMapGraph(state.castles, state.districts, state.roads);
  for (const origin of origins) {
    const leader = pickLeader(state, clanId, origin.id);
    if (leader === null) continue;
    const marchable = Math.min(
      Math.floor(origin.soldiers - BAL.aiGarrisonFloorTroops),
      troopCap(state, clanId, leader),
    );
    if (marchable < BAL.minMarchTroops) continue;
    for (const target of targets) {
      if (marchable < Math.ceil(target.soldiers * ratio)) break; // 升冪排序：更強目標必也不足
      const path = computePath(state, graph, {
        clanId,
        from: origin.id,
        to: target.id,
        speedFactor: 1,
      });
      if (!path.found || path.travelDays > BAL.aiAttackMaxTravelDays) continue;
      // 攜行糧：目標 aiCarryDays 日份，且城中至少保留 aiFoodReserveRatio 比例存糧
      const desired = Math.floor(marchable * BAL.fieldFoodPerSoldierDaily * BAL.aiCarryDays);
      const spendable = Math.floor(origin.food * (1 - BAL.aiFoodReserveRatio));
      const food = Math.min(spendable, desired);
      if (food < marchable * BAL.fieldFoodPerSoldierDaily * BAL.minCarryDays) continue;
      const cmd: Command = {
        type: 'march',
        clanId,
        originCastleId: origin.id,
        leaderId: leader.id,
        deputyIds: [],
        soldiers: marchable,
        food,
        targetNodeId: target.id,
      };
      if (validateCommand(state, cmd).ok) {
        applyCommand(state, cmd, emit);
        return; // 每次評定至多一次出陣
      }
    }
  }
}
