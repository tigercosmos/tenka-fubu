// 勝敗判定與勢力滅亡收尾（Step 12；規格：plan/10-events-and-victory.md §3.8／§5.6）。
// MVP 先行實作（原屬 M8-9／M8-10；依使用者 2026-07-22「先完成可通關 MVP」指示提前）：
// - §5.6 (1) 滅亡結算：既有征服路徑（siege.ts absorbDefeatedClan／military.ts disbandArmy／
//   officers.ts 繼承失敗）已於事發點自清並發 clan.destroyed，本步為規格要求的收尾保險，
//   僅處理「存活但持城數 0」的殘餘勢力（destroyClanRemnants；交戰中部隊存在時延後一日，
//   讓 07 的參戰者退出規則先收束，避免懸掛參照）。
// - §5.6 (2) 玩家敗北：no-heir（旗標由 officers/siege 設定）→ no-castle。
// - §5.6 (3) 天下統一：領土變動日檢查支配圈是否持有全部城。
// - §5.6 (4) 天下人＋結局統計：每月 1 日檢查石高占比與山城國，連續達標
//   BAL.victoryTenkabitoMonths 個月成立；maxCastles／maxKokudaka 同時更新。
// - battlesFought/battlesWon：規格原定 M8 事件引擎 Step 3 消費 hook 訊號更新（10 §3.8.5）；
//   事件引擎落地前，本步直接消費本 tick 事件流的 battle.ended（時序同 tick、決定論不變），
//   M8-3 落地時再遷移。
// - gameOver ≠ null 時一切 Command 已由 validate.ts 中央閘門拒絕（10 §5）。

import { BAL } from '../balance';
import type { GameEvent } from '../state/events';
import type { Clan, GameState } from '../state/gameState';
import type { ClanId, ProvinceId } from '../state/ids';

/** 天下人條件之「京都所在國」（10 §3.8.1；山城國須玩家本家直接持有，§8 D13）。 */
export const TENKABITO_PROVINCE_ID = 'prov.yamashiro' as ProvinceId;

/** 各勢力持城數（一次走訪；僅計存活勢力所有權）。 */
function castleCountByClan(state: Readonly<GameState>): Map<ClanId, number> {
  const counts = new Map<ClanId, number>();
  for (const castle of Object.values(state.castles)) {
    counts.set(castle.ownerClanId, (counts.get(castle.ownerClanId) ?? 0) + 1);
  }
  return counts;
}

/**
 * 支配圈（10 §3.8.1）：玩家本家 ∪ 以玩家為宗主的從屬勢力（vassal 協定中從屬方為對向者）。
 * MVP 尚無締結從屬的入口（M6-4），讀既有 pacts 結構使規則自 M6 落地起即生效。
 */
export function dominionClanIds(state: Readonly<GameState>, playerClanId: ClanId): Set<ClanId> {
  const ids = new Set<ClanId>([playerClanId]);
  for (const row of Object.values(state.diplomacy.rows)) {
    if (row.a !== playerClanId && row.b !== playerClanId) continue;
    const other = row.a === playerClanId ? row.b : row.a;
    for (const pact of row.pacts) {
      if (pact.kind === 'vassal' && pact.vassalClanId === other && state.clans[other]?.alive) {
        ids.add(other);
      }
    }
  }
  return ids;
}

/** 支配圈石高占全國比例（0..1；分母為全部郡石高合計，10 §3.8.1）。 */
function dominionKokudakaShare(state: Readonly<GameState>, dominion: ReadonlySet<ClanId>): number {
  let total = 0;
  let held = 0;
  for (const district of Object.values(state.districts)) {
    total += district.kokudaka;
    if (dominion.has(district.ownerClanId)) held += district.kokudaka;
  }
  return total > 0 ? held / total : 0;
}

/**
 * 本家直接持有一國全部城（10 §3.8.1 山城國條款）。
 * 該國於劇本中無任何城（如未載入近畿的 mini fixture）→ false（空集不成立，防止條件真空成立）。
 */
export function ownsProvinceAll(
  state: Readonly<GameState>,
  clanId: ClanId,
  provinceId: ProvinceId,
): boolean {
  let seen = false;
  for (const castle of Object.values(state.castles)) {
    if (castle.provinceId !== provinceId) continue;
    seen = true;
    if (castle.ownerClanId !== clanId) return false;
  }
  return seen;
}

/**
 * 滅亡收尾（10 §3.8.3 destroyClan；安全網版）：清除 0 城存活勢力的一切殘餘持分。
 * 前置守門：該勢力尚有部隊在合戰／野戰中 → 本 tick 不結算（07 參戰者退出規則先收束，
 * 次一個領土變動日重試）；攻城中部隊直接解圍撤除（附屬 Siege 一併結束）。
 */
export function destroyClanRemnants(state: GameState, clan: Clan, events: GameEvent[]): boolean {
  const clanId = clan.id;
  const inFieldCombat = new Set<string>();
  for (const fc of Object.values(state.fieldCombats)) {
    for (const armyId of [...fc.sideA.armyIds, ...fc.sideB.armyIds]) inFieldCombat.add(armyId);
  }
  const engaged = Object.values(state.armies).some(
    (army) => army.clanId === clanId && (army.battleId !== null || inFieldCombat.has(army.id)),
  );
  if (engaged) return false;

  // 1) 攻城戰退場（該勢力為攻方的 Siege 全數結束；§3.8.3-3 部隊移除的前置）
  for (const siege of Object.values(state.sieges)) {
    if (siege.attackerClanId !== clanId) continue;
    delete state.sieges[siege.id];
    events.push({
      type: 'siege.ended',
      day: state.time.day,
      clanIds: [clanId],
      siegeId: siege.id,
      castleId: siege.castleId,
      fallen: false,
      newOwnerClanId: null,
    });
  }
  // 2) 部隊全滅（兵潰散、攜行糧散失；§3.8.3-3）＋輸送隊移除
  for (const army of Object.values(state.armies)) {
    if (army.clanId === clanId) delete state.armies[army.id];
  }
  for (const transport of Object.values(state.transports)) {
    if (transport.clanId === clanId) delete state.transports[transport.id];
  }
  // 3) 郡：進行中制壓歸零；仍掛名的郡回歸所轄城現任持有者（INV-22）
  for (const district of Object.values(state.districts)) {
    if (district.subjugation?.clanId === clanId) district.subjugation = null;
    if (district.ownerClanId === clanId) {
      district.ownerClanId = state.castles[district.castleId]!.ownerClanId;
      district.stewardId = null;
      state.meta.territoryChangedToday = true;
    }
  }
  // 4) 軍團移除（§3.8.3-4）
  for (const corps of Object.values(state.corps)) {
    if (corps.clanId === clanId) delete state.corps[corps.id];
  }
  // 5) 武將：serving → 浪人（就地寄寓）；被本勢力關押者就地釋放（§3.8.3-1/2）
  for (const officer of Object.values(state.officers)) {
    if (officer.status === 'serving' && officer.clanId === clanId) {
      officer.status = 'ronin';
      officer.clanId = null;
      officer.armyId = null;
      officer.locationCastleId ??= officer.debutCastleId;
    } else if (officer.status === 'captive' && officer.capturedByClanId === clanId) {
      officer.status = 'ronin';
      officer.clanId = null;
      officer.capturedByClanId = null;
      officer.locationCastleId ??= officer.debutCastleId;
    }
  }
  // 6) 外交：pacts 消滅（不發毀約懲罰）、進行中工作／調略／外交提案移除（§3.8.3-4/5）
  for (const row of Object.values(state.diplomacy.rows)) {
    if ((row.a === clanId || row.b === clanId) && row.pacts.length > 0) row.pacts = [];
  }
  state.diplomacy.missions = state.diplomacy.missions.filter((m) => m.fromClanId !== clanId);
  state.diplomacy.plots = state.diplomacy.plots.filter(
    (p) => p.ownerClanId !== clanId && p.targetClanId !== clanId,
  );
  state.diplomacy.pendingProposals = state.diplomacy.pendingProposals.filter(
    (p) => p.fromClanId !== clanId && p.toClanId !== clanId,
  );
  // 7) 具申作廢（§3.8.3-4）
  for (const proposal of Object.values(state.proposals)) {
    if (proposal.clanId === clanId && proposal.status === 'pending') proposal.status = 'expired';
  }
  // 8) 大命歸零（§3.8.3-6）
  clan.taimei.activeTaimeiId = null;
  clan.taimei.activeUntilDay = 0;
  // 9) 幕府將軍家滅亡 → 幕府全套失效（§3.8.3 末段；等同 endShogunate）
  if (state.court.shogunClanId === clanId) {
    state.court.shogunateExists = false;
    state.court.shogunClanId = null;
    state.court.patronClanId = null;
    for (const other of Object.values(state.clans)) other.shogunateTitle = 'none';
    events.push({ type: 'shogunate.collapsed', day: state.time.day, clanIds: [] });
  }
  clan.alive = false;
  clan.destroyedDay = state.time.day;
  events.push({
    type: 'clan.destroyed',
    day: state.time.day,
    clanIds: [clanId],
    clanId,
    byClanId: null,
  });
  return true;
}

/**
 * Step 12 勝敗判定（10 §5.6 victorySystem 逐條落地）。
 * `tickEvents`：本 tick 至本步為止的事件全集（advanceDay ctx.events），供結局統計消費
 * battle.ended（檔頭說明之 M8 前過渡措施）。
 */
export function victorySystem(state: GameState, tickEvents: readonly GameEvent[]): GameEvent[] {
  const events: GameEvent[] = [];
  if (state.meta.gameOver !== null) return events;
  const playerClanId = state.meta.playerClanId;
  const stats = state.events.stats;

  // 結局統計：玩家參與的野戰／合戰場數與勝場（10 §3.8.5；battle.ended 於 Step 8 發出）
  for (const event of tickEvents) {
    if (event.type !== 'battle.ended' || !event.clanIds.includes(playerClanId)) continue;
    stats.battlesFought += 1;
    if (event.winnerClanId === playerClanId) stats.battlesWon += 1;
  }

  // (1) 滅亡收尾（每日，僅領土變動日；字典序決定論）
  if (state.meta.territoryChangedToday) {
    const counts = castleCountByClan(state);
    for (const clanId of Object.keys(state.clans).sort() as ClanId[]) {
      const clan = state.clans[clanId];
      if (clan?.alive === true && (counts.get(clanId) ?? 0) === 0) {
        destroyClanRemnants(state, clan, events);
      }
    }
  }

  // (2) 玩家敗北（10 §3.8.2）
  if (state.events.flags['defeat.no-heir'] === 1) {
    state.meta.gameOver = { kind: 'defeat', endingId: 'no-heir' };
    events.push({
      type: 'game.defeat',
      day: state.time.day,
      clanIds: [playerClanId],
      clanId: playerClanId,
      condition: 'no-heir',
    });
    return events;
  }
  if (state.clans[playerClanId]?.alive !== true) {
    state.meta.gameOver = { kind: 'defeat', endingId: 'no-castle' };
    events.push({
      type: 'game.defeat',
      day: state.time.day,
      clanIds: [playerClanId],
      clanId: playerClanId,
      condition: 'no-castle',
    });
    return events;
  }

  // (3) 天下統一（領土變動日；已達成並「繼續治世」者不再判定）
  if (state.meta.territoryChangedToday && state.events.flags['victory.ack.unification'] !== 1) {
    const dominion = dominionClanIds(state, playerClanId);
    const unified = Object.values(state.castles).every((castle) =>
      dominion.has(castle.ownerClanId),
    );
    if (unified) {
      state.meta.gameOver = { kind: 'victory', endingId: 'unification' };
      events.push({
        type: 'game.victory',
        day: state.time.day,
        clanIds: [playerClanId],
        clanId: playerClanId,
        condition: 'unification',
      });
      return events;
    }
  }

  // (4) 天下人＋統計快照（每月 1 日）
  if (state.time.dayOfMonth === 1) {
    const counts = castleCountByClan(state);
    stats.maxCastles = Math.max(stats.maxCastles, counts.get(playerClanId) ?? 0);
    let playerKokudaka = 0;
    for (const district of Object.values(state.districts)) {
      if (district.ownerClanId === playerClanId) playerKokudaka += district.kokudaka;
    }
    stats.maxKokudaka = Math.max(stats.maxKokudaka, Math.floor(playerKokudaka));
    if (state.events.flags['victory.ack.tenkabito'] !== 1) {
      const dominion = dominionClanIds(state, playerClanId);
      const ok =
        dominionKokudakaShare(state, dominion) >= BAL.victoryKokudakaSharePct / 100 &&
        ownsProvinceAll(state, playerClanId, TENKABITO_PROVINCE_ID);
      state.events.tenkabitoStreakMonths = ok ? state.events.tenkabitoStreakMonths + 1 : 0;
      if (state.events.tenkabitoStreakMonths >= 6) {
        events.push({
          type: 'victory.tenkabitoProgress',
          day: state.time.day,
          clanIds: [playerClanId],
          clanId: playerClanId,
          months: state.events.tenkabitoStreakMonths,
        });
      }
      if (state.events.tenkabitoStreakMonths >= BAL.victoryTenkabitoMonths) {
        state.meta.gameOver = { kind: 'victory', endingId: 'tenkabito' };
        events.push({
          type: 'game.victory',
          day: state.time.day,
          clanIds: [playerClanId],
          clanId: playerClanId,
          condition: 'tenkabito',
        });
      }
    }
  }
  return events;
}

/**
 * 結局畫面動作（10 §3.8.4；非 Command，外殼直接呼叫，比照存讀檔 §8 D8）。
 * - 'continue'（勝利限定「繼續治世」）：記 ack 旗標、解除 gameOver；該條件此後不再判定。
 * - 'observe'（敗北限定「繼續觀戰」）：gameOver 維持原值（指令持續被拒），外殼自行切回地圖。
 * 條件不符時為防禦性 no-op。
 */
export function acknowledgeGameOver(state: GameState, mode: 'continue' | 'observe'): void {
  const over = state.meta.gameOver;
  if (over === null) return;
  if (mode === 'continue' && over.kind === 'victory') {
    state.events.flags[`victory.ack.${over.endingId}`] = 1;
    state.meta.gameOver = null;
  }
}
