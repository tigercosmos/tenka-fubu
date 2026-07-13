// checkInvariants(state)：dev 模式每 tick 後執行（不變量清單 INV-01..25）。
// 規格：plan/02-data-model.md §5.2（不變量清單原文）／§7（validateState 驗收：25 條各構造一違規 fixture 被偵測）。
//
// Violation 形狀依 02 §5.2 驗證器骨架原文逐字：
//   `v += g.check(state)  // 每筆 Violation = { inv: 'INV-04', message: string, refs: Id[] }`
// （refs 一律轉為 string[]：各不變量引用之實體橫跨多種 branded Id 型別，統一以字串承載。）

import type {
  Army,
  BattleState,
  Castle,
  Clan,
  Corps,
  District,
  GameState,
  Officer,
  Proposal,
  Siege,
  TransportOrder,
} from './gameState';
import type { ArmyId, CastleId, ClanId, DistrictId, MapNodeId, OfficerId } from './ids';
import { ID_PATTERN } from './ids';
import { ARMY_STATUS_VALUES, RANK_VALUES, type Rank } from './enums';
import { BAL } from '../balance';

export interface Violation {
  inv: string;
  message: string;
  refs: string[];
}

function violation(inv: string, message: string, refs: string[]): Violation {
  return { inv, message, refs };
}

const rankIndex = (r: Rank): number => RANK_VALUES.indexOf(r);

function inRange(n: number, min: number, max: number): boolean {
  return n >= min && n <= max;
}

function isNonNegInt(n: number): boolean {
  return Number.isInteger(n) && n >= 0;
}

// ═══════════════════════════════════════════════════════════════════
// INV-01｜Record<Id,Entity> 的 key === value.id，且 id 符合 §3.2 前綴 regex
// ═══════════════════════════════════════════════════════════════════
function checkRecordIds<K extends string, T extends { id: string }>(
  v: Violation[],
  label: string,
  record: Record<K, T>,
  pattern?: RegExp,
): void {
  for (const [key, value] of Object.entries<T>(record)) {
    if (key !== value.id) {
      v.push(
        violation('INV-01', `${label}：key '${key}' 與 value.id '${value.id}' 不一致`, [
          key,
          value.id,
        ]),
      );
      continue;
    }
    if (pattern && !pattern.test(value.id)) {
      v.push(violation('INV-01', `${label}：id '${value.id}' 不符合 §3.2 前綴格式`, [value.id]));
    }
  }
}

function checkInv01(state: GameState): Violation[] {
  const v: Violation[] = [];
  checkRecordIds(v, 'clans', state.clans, ID_PATTERN.ClanId);
  checkRecordIds(v, 'officers', state.officers, ID_PATTERN.OfficerId);
  checkRecordIds(v, 'castles', state.castles, ID_PATTERN.CastleId);
  checkRecordIds(v, 'districts', state.districts, ID_PATTERN.DistrictId);
  checkRecordIds(v, 'provinces', state.provinces, ID_PATTERN.ProvinceId);
  checkRecordIds(v, 'roads', state.roads, ID_PATTERN.RoadEdgeId);
  checkRecordIds(v, 'armies', state.armies, ID_PATTERN.ArmyId);
  // fieldCombats 內部 id（'fc.*'）非 §3.2 登記流水號，只驗 key===id（ids.ts 註解）。
  checkRecordIds(v, 'fieldCombats', state.fieldCombats);
  checkRecordIds(v, 'battles', state.battles, ID_PATTERN.BattleId);
  checkRecordIds(v, 'sieges', state.sieges, ID_PATTERN.SiegeId);
  checkRecordIds(v, 'corps', state.corps, ID_PATTERN.CorpsId);
  checkRecordIds(v, 'transports', state.transports, ID_PATTERN.TransportId);
  checkRecordIds(v, 'proposals', state.proposals, ID_PATTERN.ProposalId);
  return v;
}

// ═══════════════════════════════════════════════════════════════════
// INV-02｜castle/district.ownerClanId、army/corps.clanId 皆存在於 clans 且 alive
// ═══════════════════════════════════════════════════════════════════
function checkInv02(state: GameState): Violation[] {
  const v: Violation[] = [];
  const clanAlive = (clanId: ClanId): boolean => state.clans[clanId]?.alive === true;
  for (const castle of Object.values<Castle>(state.castles)) {
    if (!clanAlive(castle.ownerClanId)) {
      v.push(
        violation('INV-02', `城 ${castle.id} 的 ownerClanId ${castle.ownerClanId} 不存在或已滅亡`, [
          castle.id,
          castle.ownerClanId,
        ]),
      );
    }
  }
  for (const district of Object.values<District>(state.districts)) {
    if (!clanAlive(district.ownerClanId)) {
      v.push(
        violation(
          'INV-02',
          `郡 ${district.id} 的 ownerClanId ${district.ownerClanId} 不存在或已滅亡`,
          [district.id, district.ownerClanId],
        ),
      );
    }
  }
  for (const army of Object.values<Army>(state.armies)) {
    if (!clanAlive(army.clanId)) {
      v.push(
        violation('INV-02', `部隊 ${army.id} 的 clanId ${army.clanId} 不存在或已滅亡`, [
          army.id,
          army.clanId,
        ]),
      );
    }
  }
  for (const corps of Object.values<Corps>(state.corps)) {
    if (!clanAlive(corps.clanId)) {
      v.push(
        violation('INV-02', `軍團 ${corps.id} 的 clanId ${corps.clanId} 不存在或已滅亡`, [
          corps.id,
          corps.clanId,
        ]),
      );
    }
  }
  return v;
}

// ═══════════════════════════════════════════════════════════════════
// INV-03｜district.castleId 存在；castle.districtIds 與 district.castleId 互為鏡像
// ═══════════════════════════════════════════════════════════════════
function checkInv03(state: GameState): Violation[] {
  const v: Violation[] = [];
  const districtListedBy = new Map<DistrictId, CastleId>();
  for (const castle of Object.values<Castle>(state.castles)) {
    const seen = new Set<DistrictId>();
    for (const districtId of castle.districtIds) {
      if (seen.has(districtId)) {
        v.push(
          violation('INV-03', `城 ${castle.id} 的 districtIds 內重複 ${districtId}`, [
            castle.id,
            districtId,
          ]),
        );
      }
      seen.add(districtId);
      const prior = districtListedBy.get(districtId);
      if (prior !== undefined && prior !== castle.id) {
        v.push(
          violation(
            'INV-03',
            `郡 ${districtId} 同時出現在多座城的 districtIds（${prior} 與 ${castle.id}）`,
            [districtId, prior, castle.id],
          ),
        );
      } else {
        districtListedBy.set(districtId, castle.id);
      }
      const district = state.districts[districtId];
      if (!district) {
        v.push(
          violation('INV-03', `城 ${castle.id} 引用不存在的郡 ${districtId}`, [
            castle.id,
            districtId,
          ]),
        );
      } else if (district.castleId !== castle.id) {
        v.push(
          violation(
            'INV-03',
            `郡 ${districtId} 的 castleId ${district.castleId} 與所屬城 ${castle.id} 不一致（鏡像失敗）`,
            [districtId, district.castleId, castle.id],
          ),
        );
      }
    }
  }
  for (const district of Object.values<District>(state.districts)) {
    const castle = state.castles[district.castleId];
    if (!castle) {
      v.push(
        violation('INV-03', `郡 ${district.id} 的 castleId ${district.castleId} 不存在`, [
          district.id,
          district.castleId,
        ]),
      );
    } else if (!castle.districtIds.includes(district.id)) {
      v.push(
        violation(
          'INV-03',
          `郡 ${district.id} 未出現在城 ${castle.id} 的 districtIds（鏡像失敗）`,
          [district.id, castle.id],
        ),
      );
    }
  }
  return v;
}

// ═══════════════════════════════════════════════════════════════════
// INV-04｜castle.lordId≠null ⇒ serving＋同勢力＋rank≥samurai-taisho；同一武將至多任一城城主
// ═══════════════════════════════════════════════════════════════════
function checkInv04(state: GameState): Violation[] {
  const v: Violation[] = [];
  const lordOf = new Map<OfficerId, CastleId[]>();
  for (const castle of Object.values<Castle>(state.castles)) {
    if (castle.lordId === null) continue;
    const officer = state.officers[castle.lordId];
    if (!officer) {
      v.push(
        violation('INV-04', `城 ${castle.id} 的 lordId ${castle.lordId} 不存在`, [
          castle.id,
          castle.lordId,
        ]),
      );
      continue;
    }
    if (officer.status !== 'serving') {
      v.push(
        violation('INV-04', `城 ${castle.id} 城主 ${officer.id} 非 serving`, [
          castle.id,
          officer.id,
        ]),
      );
    }
    if (officer.clanId !== castle.ownerClanId) {
      v.push(
        violation(
          'INV-04',
          `城 ${castle.id} 城主 ${officer.id} 的 clanId 與城 ownerClanId 不一致`,
          [castle.id, officer.id],
        ),
      );
    }
    if (rankIndex(officer.rank) < rankIndex('samurai-taisho')) {
      v.push(
        violation(
          'INV-04',
          `城 ${castle.id} 城主 ${officer.id} 身分 ${officer.rank} 未達 samurai-taisho`,
          [castle.id, officer.id],
        ),
      );
    }
    const list = lordOf.get(officer.id) ?? [];
    list.push(castle.id);
    lordOf.set(officer.id, list);
  }
  for (const [officerId, castleIds] of lordOf) {
    if (castleIds.length > 1) {
      v.push(
        violation('INV-04', `武將 ${officerId} 同時是多座城城主：${castleIds.join(',')}`, [
          officerId,
          ...castleIds,
        ]),
      );
    }
  }
  return v;
}

// ═══════════════════════════════════════════════════════════════════
// INV-05｜district.stewardId≠null ⇒ serving＋同勢力；每武將受封郡數 ≤ fiefCapOf(rank)
// ═══════════════════════════════════════════════════════════════════
function checkInv05(state: GameState): Violation[] {
  const v: Violation[] = [];
  const stewardOf = new Map<OfficerId, DistrictId[]>();
  for (const district of Object.values<District>(state.districts)) {
    if (district.stewardId === null) continue;
    const officer = state.officers[district.stewardId];
    if (!officer) {
      v.push(
        violation('INV-05', `郡 ${district.id} 的 stewardId ${district.stewardId} 不存在`, [
          district.id,
          district.stewardId,
        ]),
      );
      continue;
    }
    if (officer.status !== 'serving') {
      v.push(
        violation('INV-05', `郡 ${district.id} 領主 ${officer.id} 非 serving`, [
          district.id,
          officer.id,
        ]),
      );
    }
    if (officer.clanId !== district.ownerClanId) {
      v.push(
        violation(
          'INV-05',
          `郡 ${district.id} 領主 ${officer.id} 的 clanId 與郡 ownerClanId 不一致`,
          [district.id, officer.id],
        ),
      );
    }
    const list = stewardOf.get(officer.id) ?? [];
    list.push(district.id);
    stewardOf.set(officer.id, list);
  }
  for (const [officerId, districtIds] of stewardOf) {
    const officer = state.officers[officerId];
    const cap = officer ? BAL.fiefMaxByRank[rankIndex(officer.rank)] : 0;
    if (districtIds.length > (cap ?? 0)) {
      v.push(
        violation(
          'INV-05',
          `武將 ${officerId} 受封郡數 ${String(districtIds.length)} 超過身分上限 ${String(cap)}`,
          [officerId, ...districtIds],
        ),
      );
    }
  }
  return v;
}

// ═══════════════════════════════════════════════════════════════════
// INV-06｜army.leaderId/deputyIds 皆 serving＋同勢力＋已元服＋armyId 回指；deputyIds≤上限；不得同時在兩部隊
// ═══════════════════════════════════════════════════════════════════
function checkInv06(state: GameState): Violation[] {
  const v: Violation[] = [];
  const officerArmies = new Map<OfficerId, ArmyId[]>();
  for (const army of Object.values<Army>(state.armies)) {
    if (
      !Array.isArray(army.pursuitEligibleArmyIds) ||
      new Set(army.pursuitEligibleArmyIds).size !== army.pursuitEligibleArmyIds.length ||
      army.pursuitEligibleArmyIds.includes(army.id)
    ) {
      v.push(
        violation('INV-06', `部隊 ${army.id} 的 pursuitEligibleArmyIds 缺失、重複或包含自身`, [
          army.id,
        ]),
      );
    }
    if (army.deputyIds.length > BAL.maxDeputies) {
      v.push(
        violation(
          'INV-06',
          `部隊 ${army.id} 副將數 ${String(army.deputyIds.length)} 超過上限 ${String(BAL.maxDeputies)}`,
          [army.id],
        ),
      );
    }
    const members: OfficerId[] = [army.leaderId, ...army.deputyIds];
    for (const officerId of members) {
      const officer = state.officers[officerId];
      if (!officer) {
        v.push(
          violation('INV-06', `部隊 ${army.id} 引用不存在的武將 ${officerId}`, [
            army.id,
            officerId,
          ]),
        );
        continue;
      }
      if (officer.status !== 'serving') {
        v.push(
          violation('INV-06', `部隊 ${army.id} 成員 ${officer.id} 非 serving`, [
            army.id,
            officer.id,
          ]),
        );
      }
      if (officer.clanId !== army.clanId) {
        v.push(
          violation('INV-06', `部隊 ${army.id} 成員 ${officer.id} clanId 與部隊不一致`, [
            army.id,
            officer.id,
          ]),
        );
      }
      if (!officer.hasComeOfAge) {
        v.push(
          violation('INV-06', `部隊 ${army.id} 成員 ${officer.id} 尚未元服`, [army.id, officer.id]),
        );
      }
      if (officer.armyId !== army.id) {
        v.push(
          violation('INV-06', `部隊 ${army.id} 成員 ${officer.id} 的 armyId 未回指本部隊`, [
            army.id,
            officer.id,
          ]),
        );
      }
      const list = officerArmies.get(officerId) ?? [];
      list.push(army.id);
      officerArmies.set(officerId, list);
    }
  }
  for (const [officerId, armyIds] of officerArmies) {
    if (armyIds.length > 1) {
      v.push(
        violation('INV-06', `武將 ${officerId} 同時隸屬多支部隊：${armyIds.join(',')}`, [
          officerId,
          ...armyIds,
        ]),
      );
    }
  }
  return v;
}

// ═══════════════════════════════════════════════════════════════════
// INV-07｜每位武將 locationCastleId 與 armyId 恰有一者非 null（status='dead' 時兩者皆 null）
// ═══════════════════════════════════════════════════════════════════
function checkInv07(state: GameState): Violation[] {
  const v: Violation[] = [];
  for (const officer of Object.values<Officer>(state.officers)) {
    const hasLocation = officer.locationCastleId !== null;
    const hasArmy = officer.armyId !== null;
    if (officer.status === 'dead') {
      if (hasLocation || hasArmy) {
        v.push(
          violation('INV-07', `武將 ${officer.id} 已死亡但 locationCastleId/armyId 非皆為 null`, [
            officer.id,
          ]),
        );
      }
    } else if (hasLocation === hasArmy) {
      v.push(
        violation('INV-07', `武將 ${officer.id} 的 locationCastleId 與 armyId 未恰有一者非 null`, [
          officer.id,
        ]),
      );
    }
  }
  return v;
}

// ═══════════════════════════════════════════════════════════════════
// INV-08｜alive 勢力 leaderId 為本家 serving＋loyalty=100；status 與 clanId 對應規則
// ═══════════════════════════════════════════════════════════════════
function checkInv08(state: GameState): Violation[] {
  const v: Violation[] = [];
  for (const clan of Object.values<Clan>(state.clans)) {
    if (!clan.alive) continue;
    const leader = state.officers[clan.leaderId];
    if (!leader) {
      v.push(
        violation('INV-08', `勢力 ${clan.id} 的 leaderId ${clan.leaderId} 不存在`, [
          clan.id,
          clan.leaderId,
        ]),
      );
      continue;
    }
    if (leader.status !== 'serving' || leader.clanId !== clan.id) {
      v.push(
        violation('INV-08', `勢力 ${clan.id} 當主 ${leader.id} 非本家 serving 武將`, [
          clan.id,
          leader.id,
        ]),
      );
    }
    if (leader.loyalty !== 100) {
      v.push(
        violation(
          'INV-08',
          `勢力 ${clan.id} 當主 ${leader.id} 忠誠 ${String(leader.loyalty)} ≠ 100`,
          [clan.id, leader.id],
        ),
      );
    }
  }
  for (const officer of Object.values<Officer>(state.officers)) {
    if (officer.status === 'serving') {
      if (officer.clanId === null || state.clans[officer.clanId]?.alive !== true) {
        v.push(
          violation('INV-08', `武將 ${officer.id} status=serving 但 clanId 缺失或勢力已滅亡`, [
            officer.id,
          ]),
        );
      }
    } else if (officer.status === 'captive') {
      if (officer.clanId === null) {
        v.push(
          violation('INV-08', `武將 ${officer.id} status=captive 但 clanId 為 null`, [officer.id]),
        );
      }
    } else if (officer.clanId !== null) {
      v.push(
        violation('INV-08', `武將 ${officer.id} status=${officer.status} 但 clanId 非 null`, [
          officer.id,
        ]),
      );
    }
  }
  return v;
}

// ═══════════════════════════════════════════════════════════════════
// INV-09｜clan.homeCastleId 存在、屬本家、tier='main'
// ═══════════════════════════════════════════════════════════════════
function checkInv09(state: GameState): Violation[] {
  const v: Violation[] = [];
  for (const clan of Object.values<Clan>(state.clans)) {
    if (!clan.alive) continue;
    const castle = state.castles[clan.homeCastleId];
    if (!castle) {
      v.push(
        violation('INV-09', `勢力 ${clan.id} 的 homeCastleId ${clan.homeCastleId} 不存在`, [
          clan.id,
          clan.homeCastleId,
        ]),
      );
      continue;
    }
    if (castle.ownerClanId !== clan.id) {
      v.push(
        violation('INV-09', `勢力 ${clan.id} 的本城 ${castle.id} 不屬於本家`, [clan.id, castle.id]),
      );
    }
    if (castle.tier !== 'main') {
      v.push(
        violation('INV-09', `勢力 ${clan.id} 的本城 ${castle.id} tier 非 main`, [
          clan.id,
          castle.id,
        ]),
      );
    }
  }
  return v;
}

// ═══════════════════════════════════════════════════════════════════
// INV-10｜corps.corpsLeaderId 為本家 serving 且 rank≥karo；castle.corpsId≠null ⇒ 該軍團存在且同勢力
// ═══════════════════════════════════════════════════════════════════
function checkInv10(state: GameState): Violation[] {
  const v: Violation[] = [];
  for (const corps of Object.values<Corps>(state.corps)) {
    const leader = state.officers[corps.corpsLeaderId];
    if (!leader) {
      v.push(
        violation('INV-10', `軍團 ${corps.id} 的 corpsLeaderId ${corps.corpsLeaderId} 不存在`, [
          corps.id,
          corps.corpsLeaderId,
        ]),
      );
      continue;
    }
    if (leader.status !== 'serving' || leader.clanId !== corps.clanId) {
      v.push(
        violation('INV-10', `軍團 ${corps.id} 軍團長 ${leader.id} 非本家 serving 武將`, [
          corps.id,
          leader.id,
        ]),
      );
    }
    if (rankIndex(leader.rank) < rankIndex('karo')) {
      v.push(
        violation('INV-10', `軍團 ${corps.id} 軍團長 ${leader.id} 身分 ${leader.rank} 未達 karo`, [
          corps.id,
          leader.id,
        ]),
      );
    }
  }
  for (const castle of Object.values<Castle>(state.castles)) {
    if (castle.corpsId === null) continue;
    const corps = state.corps[castle.corpsId];
    if (!corps) {
      v.push(
        violation('INV-10', `城 ${castle.id} 的 corpsId ${castle.corpsId} 不存在`, [
          castle.id,
          castle.corpsId,
        ]),
      );
    } else if (corps.clanId !== castle.ownerClanId) {
      v.push(
        violation('INV-10', `城 ${castle.id} 的 corpsId ${castle.corpsId} 勢力不一致`, [
          castle.id,
          castle.corpsId,
        ]),
      );
    }
  }
  return v;
}

// ═══════════════════════════════════════════════════════════════════
// INV-11｜RoadEdge 端點存在、a≠b、無向對不重複；全圖連通
// ═══════════════════════════════════════════════════════════════════
function checkInv11(state: GameState): Violation[] {
  const v: Violation[] = [];
  const nodeIds = new Set<MapNodeId>([
    ...(Object.keys(state.castles) as CastleId[]),
    ...(Object.keys(state.districts) as DistrictId[]),
  ]);
  const seenPairs = new Set<string>();
  const adjacency = new Map<MapNodeId, Set<MapNodeId>>();
  for (const id of nodeIds) adjacency.set(id, new Set());

  for (const edge of Object.values(state.roads)) {
    if (edge.a === edge.b) {
      v.push(violation('INV-11', `街道 ${edge.id} 的 a/b 相同`, [edge.id]));
      continue;
    }
    if (!nodeIds.has(edge.a)) {
      v.push(violation('INV-11', `街道 ${edge.id} 的端點 ${edge.a} 不存在`, [edge.id, edge.a]));
    }
    if (!nodeIds.has(edge.b)) {
      v.push(violation('INV-11', `街道 ${edge.id} 的端點 ${edge.b} 不存在`, [edge.id, edge.b]));
    }
    const pairKey = edge.a < edge.b ? `${edge.a}|${edge.b}` : `${edge.b}|${edge.a}`;
    if (seenPairs.has(pairKey)) {
      v.push(violation('INV-11', `街道端點對 ${pairKey} 重複出現`, [edge.id]));
    }
    seenPairs.add(pairKey);
    adjacency.get(edge.a)?.add(edge.b);
    adjacency.get(edge.b)?.add(edge.a);
  }

  const [start] = nodeIds;
  if (start !== undefined) {
    const visited = new Set<MapNodeId>([start]);
    const stack: MapNodeId[] = [start];
    while (stack.length > 0) {
      const current = stack.pop();
      if (current === undefined) break;
      for (const next of adjacency.get(current) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          stack.push(next);
        }
      }
    }
    if (visited.size !== nodeIds.size) {
      const unreached = [...nodeIds].filter((id) => !visited.has(id));
      v.push(
        violation('INV-11', `地圖節點圖不連通，未連通節點：${unreached.join(',')}`, unreached),
      );
    }
  }
  return v;
}

function edgeExists(state: GameState, a: MapNodeId, b: MapNodeId): boolean {
  return Object.values(state.roads).some(
    (edge) => (edge.a === a && edge.b === b) || (edge.a === b && edge.b === a),
  );
}

// ═══════════════════════════════════════════════════════════════════
// INV-12｜army.path 相鄰節點需有 RoadEdge；path[pathCursor]=posNodeId；pathCursor/edgeProgressDays 範圍
// （TransportOrder 同此模型，勘誤 E-11）
// ═══════════════════════════════════════════════════════════════════
function checkInv12(state: GameState): Violation[] {
  const v: Violation[] = [];
  for (const army of Object.values<Army>(state.armies)) {
    if (army.pathCursor < 0 || army.pathCursor >= army.path.length) {
      v.push(
        violation(
          'INV-12',
          `部隊 ${army.id} 的 pathCursor ${String(army.pathCursor)} 超出 path 範圍`,
          [army.id],
        ),
      );
    } else if (army.path[army.pathCursor] !== army.posNodeId) {
      v.push(
        violation('INV-12', `部隊 ${army.id} 的 path[pathCursor] 與 posNodeId 不一致`, [army.id]),
      );
    }
    for (let i = 0; i < army.path.length - 1; i += 1) {
      const from = army.path[i];
      const to = army.path[i + 1];
      if (from !== undefined && to !== undefined && !edgeExists(state, from, to)) {
        v.push(
          violation('INV-12', `部隊 ${army.id} 的 path 相鄰節點 ${from}→${to} 無街道相連`, [
            army.id,
          ]),
        );
      }
    }
    if (army.edgeProgressDays < 0 || army.edgeProgressDays > army.edgeCostDays) {
      v.push(
        violation(
          'INV-12',
          `部隊 ${army.id} 的 edgeProgressDays ${String(army.edgeProgressDays)} 超出 [0, edgeCostDays]`,
          [army.id],
        ),
      );
    }
  }
  for (const transport of Object.values<TransportOrder>(state.transports)) {
    if (transport.pathCursor < 0 || transport.pathCursor >= transport.path.length) {
      v.push(
        violation(
          'INV-12',
          `輸送隊 ${transport.id} 的 pathCursor ${String(transport.pathCursor)} 超出 path 範圍`,
          [transport.id],
        ),
      );
    }
    for (let i = 0; i < transport.path.length - 1; i += 1) {
      const from = transport.path[i];
      const to = transport.path[i + 1];
      if (from !== undefined && to !== undefined && !edgeExists(state, from, to)) {
        v.push(
          violation('INV-12', `輸送隊 ${transport.id} 的 path 相鄰節點無街道相連`, [transport.id]),
        );
      }
    }
    if (transport.edgeProgressDays < 0 || transport.edgeProgressDays > transport.edgeCostDays) {
      v.push(
        violation('INV-12', `輸送隊 ${transport.id} 的 edgeProgressDays 超出 [0, edgeCostDays]`, [
          transport.id,
        ]),
      );
    }
  }
  return v;
}

// ═══════════════════════════════════════════════════════════════════
// INV-13｜army.status='engaged' ⇔ 出現於 FieldCombat；battleId/siegeId 與所屬狀態一致；引用實體必存在
// ═══════════════════════════════════════════════════════════════════
function checkInv13(state: GameState): Violation[] {
  const v: Violation[] = [];
  const engagedArmyIds = new Set<ArmyId>();
  for (const fc of Object.values(state.fieldCombats)) {
    for (const armyId of [...fc.sideA.armyIds, ...fc.sideB.armyIds]) {
      engagedArmyIds.add(armyId);
      const army = state.armies[armyId];
      if (!army) {
        v.push(violation('INV-13', `野戰 ${fc.id} 引用不存在的部隊 ${armyId}`, [fc.id, armyId]));
      } else if (army.status !== 'engaged') {
        v.push(
          violation('INV-13', `野戰 ${fc.id} 引用的部隊 ${armyId} 狀態非 engaged`, [fc.id, armyId]),
        );
      }
    }
  }
  const siegingArmyIds = new Set<ArmyId>();
  for (const siege of Object.values<Siege>(state.sieges)) {
    for (const armyId of siege.attackerArmyIds) {
      siegingArmyIds.add(armyId);
      const army = state.armies[armyId];
      if (!army) {
        v.push(
          violation('INV-13', `攻城 ${siege.id} 引用不存在的部隊 ${armyId}`, [siege.id, armyId]),
        );
      } else if (
        (army.status !== 'sieging' && !(siege.interrupted && army.status === 'engaged')) ||
        army.siegeId !== siege.id
      ) {
        v.push(
          violation('INV-13', `攻城 ${siege.id} 引用的部隊 ${armyId} 狀態或 siegeId 不一致`, [
            siege.id,
            armyId,
          ]),
        );
      }
    }
  }
  const activeBattles = Object.values(state.battles).filter((battle) => battle.result === null);
  if (activeBattles.length > 1) {
    v.push(
      violation('INV-13', `同時存在 ${String(activeBattles.length)} 場未結束合戰（上限 1）`, [
        ...activeBattles.map((battle) => battle.id),
      ]),
    );
  }
  for (const battle of Object.values(state.battles)) {
    const jinIds = new Set(battle.jins.map((jin) => jin.id));
    const unitIds = new Set<string>();
    if (battle.result === null) {
      const source = state.fieldCombats[battle.fieldCombatId];
      if (!source || !source.interrupted || !source.kassenUsed) {
        v.push(
          violation('INV-13', `進行中合戰 ${battle.id} 的來源野戰不存在或未正確中斷`, [
            battle.id,
            battle.fieldCombatId,
          ]),
        );
      }
    }
    if (
      battle.jins.length < BAL.jinCountMin ||
      battle.jins.length > BAL.jinCountMax ||
      jinIds.size !== battle.jins.length
    ) {
      v.push(violation('INV-13', `合戰 ${battle.id} 的陣數或 id 唯一性不合法`, [battle.id]));
    }
    if (battle.jins.filter((jin) => jin.isHonjin).length !== 2) {
      v.push(violation('INV-13', `合戰 ${battle.id} 必須恰有兩座本陣`, [battle.id]));
    }
    for (const jin of battle.jins) {
      if (
        !Number.isInteger(jin.col) ||
        !Number.isInteger(jin.row) ||
        !inRange(jin.col, 0, 4) ||
        !inRange(jin.row, 0, 2) ||
        !inRange(jin.flagPower, 0, jin.flagPowerMax) ||
        !inRange(jin.defenseBonus, 0, 1)
      ) {
        v.push(
          violation('INV-13', `合戰 ${battle.id} 的陣 ${jin.id} 數值不合法`, [battle.id, jin.id]),
        );
      }
    }
    for (const edge of battle.edges) {
      if (
        !jinIds.has(edge.a) ||
        !jinIds.has(edge.b) ||
        edge.a === edge.b ||
        ![1, 2].includes(edge.moveCost)
      ) {
        v.push(
          violation('INV-13', `合戰 ${battle.id} 的陣邊 ${edge.a}-${edge.b} 不合法`, [battle.id]),
        );
      }
    }
    if (battle.jins.length > 0) {
      const visited = new Set<string>([battle.jins[0]!.id]);
      const queue = [battle.jins[0]!.id];
      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const current = queue[cursor]!;
        for (const edge of battle.edges) {
          const other = edge.a === current ? edge.b : edge.b === current ? edge.a : undefined;
          if (other === undefined || visited.has(other)) continue;
          visited.add(other);
          queue.push(other);
        }
      }
      if (visited.size !== battle.jins.length) {
        v.push(violation('INV-13', `合戰 ${battle.id} 的戰場圖不連通`, [battle.id]));
      }
    }
    if (
      !inRange(battle.saihai.attacker, 0, BAL.saihaiMax) ||
      !inRange(battle.saihai.defender, 0, BAL.saihaiMax)
    ) {
      v.push(violation('INV-13', `合戰 ${battle.id} 的采配超出範圍`, [battle.id]));
    }
    for (const unit of battle.units) {
      if (unitIds.has(unit.id)) {
        v.push(
          violation('INV-13', `合戰 ${battle.id} 的部隊 id ${unit.id} 重複`, [battle.id, unit.id]),
        );
      }
      unitIds.add(unit.id);
      const army = state.armies[unit.armyId];
      if (battle.result === null && (!army || army.battleId !== battle.id)) {
        v.push(
          violation('INV-13', `合戰 ${battle.id} 與部隊 ${unit.armyId} 的引用不互惠`, [
            battle.id,
            unit.armyId,
          ]),
        );
      }
      if (
        !jinIds.has(unit.jinId) ||
        (unit.moveTargetJinId !== null && !jinIds.has(unit.moveTargetJinId)) ||
        !isNonNegInt(unit.troops) ||
        !isNonNegInt(unit.battleInitialTroops) ||
        !inRange(unit.morale, 0, 100) ||
        !isNonNegInt(unit.moveProgress) ||
        !ARMY_STATUS_VALUES.includes(unit.strategyStatus)
      ) {
        v.push(
          violation('INV-13', `合戰 ${battle.id} 的 BattleUnit ${unit.id} 數值不合法`, [
            battle.id,
            unit.id,
          ]),
        );
      }
    }
  }
  for (const army of Object.values<Army>(state.armies)) {
    if (army.status === 'engaged' && !engagedArmyIds.has(army.id)) {
      v.push(violation('INV-13', `部隊 ${army.id} 狀態為 engaged 但未出現於任何野戰`, [army.id]));
    }
    if (army.battleId !== null) {
      const battle: BattleState | undefined = state.battles[army.battleId];
      if (!battle) {
        v.push(
          violation('INV-13', `部隊 ${army.id} 的 battleId ${army.battleId} 不存在`, [
            army.id,
            army.battleId,
          ]),
        );
      } else if (!battle.units.some((u) => u.armyId === army.id)) {
        v.push(
          violation('INV-13', `部隊 ${army.id} 的 battleId ${army.battleId} 中無對應 BattleUnit`, [
            army.id,
            army.battleId,
          ]),
        );
      }
    }
    if (army.status === 'sieging') {
      if (army.siegeId === null || !siegingArmyIds.has(army.id)) {
        v.push(
          violation('INV-13', `部隊 ${army.id} 狀態為 sieging 但 siegeId/攻城引用不一致`, [
            army.id,
          ]),
        );
      }
    } else if (
      army.siegeId !== null &&
      !(
        army.status === 'engaged' &&
        state.sieges[army.siegeId]?.interrupted === true &&
        state.sieges[army.siegeId]?.attackerArmyIds.includes(army.id)
      )
    ) {
      v.push(violation('INV-13', `部隊 ${army.id} 狀態非 sieging 但 siegeId 非 null`, [army.id]));
    }
  }
  return v;
}

// ═══════════════════════════════════════════════════════════════════
// INV-14｜DiplomacyRow.key=pairKey(a,b) 且 a<b；missions 同 (from,target) 至多一件、officerId 屬 from 方 serving
// ═══════════════════════════════════════════════════════════════════
function checkInv14(state: GameState): Violation[] {
  const v: Violation[] = [];
  for (const row of Object.values(state.diplomacy.rows)) {
    if (row.a === row.b) {
      v.push(violation('INV-14', `外交列 ${row.key} 的 a/b 相同`, [row.key]));
    } else if (row.a > row.b) {
      v.push(violation('INV-14', `外交列 ${row.key} 的 a 非字典序較小者`, [row.key]));
    }
    const expectedKey = `${row.a}|${row.b}`;
    if (row.key !== expectedKey) {
      v.push(
        violation('INV-14', `外交列 key ${row.key} 與 pairKey(a,b)=${expectedKey} 不一致`, [
          row.key,
        ]),
      );
    }
  }
  const missionPairsSeen = new Set<string>();
  for (const mission of state.diplomacy.missions) {
    const pairKey = `${mission.fromClanId}→${mission.target}`;
    if (missionPairsSeen.has(pairKey)) {
      v.push(
        violation('INV-14', `外交工作 (${mission.fromClanId},${mission.target}) 重複`, [
          mission.fromClanId,
          mission.target,
        ]),
      );
    }
    missionPairsSeen.add(pairKey);
    const officer = state.officers[mission.officerId];
    if (!officer || officer.status !== 'serving' || officer.clanId !== mission.fromClanId) {
      v.push(
        violation('INV-14', `外交工作執行者 ${mission.officerId} 非 from 方 serving 武將`, [
          mission.officerId,
        ]),
      );
    }
    if (mission.target !== 'court' && mission.target !== 'shogunate') {
      if (mission.target === mission.fromClanId) {
        v.push(
          violation('INV-14', `外交工作目標 ${mission.target} 與 fromClanId 相同`, [
            mission.fromClanId,
          ]),
        );
      }
      const fromAlive = state.clans[mission.fromClanId]?.alive === true;
      const targetAlive = state.clans[mission.target]?.alive === true;
      if (!fromAlive || !targetAlive) {
        v.push(violation('INV-14', `外交工作雙方需皆存活`, [mission.fromClanId, mission.target]));
      }
    }
  }
  return v;
}

// ═══════════════════════════════════════════════════════════════════
// INV-15｜status='pending' 的 Proposal：officerId 為該勢力 serving 武將、expiresDay>time.day、command.clanId 一致
// ═══════════════════════════════════════════════════════════════════
function checkInv15(state: GameState): Violation[] {
  const v: Violation[] = [];
  for (const proposal of Object.values<Proposal>(state.proposals)) {
    if (proposal.status !== 'pending') continue;
    const officer = state.officers[proposal.officerId];
    if (!officer || officer.status !== 'serving' || officer.clanId !== proposal.clanId) {
      v.push(
        violation(
          'INV-15',
          `具申 ${proposal.id} 的 officerId ${proposal.officerId} 非該勢力 serving 武將`,
          [proposal.id, proposal.officerId],
        ),
      );
    }
    if (proposal.expiresDay <= state.time.day) {
      v.push(violation('INV-15', `具申 ${proposal.id} 的 expiresDay 未大於當前日`, [proposal.id]));
    }
    if (proposal.command.clanId !== proposal.clanId) {
      v.push(
        violation('INV-15', `具申 ${proposal.id} 的 command.clanId 與 proposal.clanId 不一致`, [
          proposal.id,
        ]),
      );
    }
  }
  return v;
}

// ═══════════════════════════════════════════════════════════════════
// INV-16｜數值範圍（loyalty/morale/publicOrder/trust*/courtFavor∈[0,100]；sentiment*∈[-100,100]；
// ldr/val/int/pol∈[1,abilityMax]；prestige∈[0,prestigeMax]；commerce/kokudaka/population≤cap；
// durability≤maxDurability；gold/food/soldiers/merit≥0 整數）
// ═══════════════════════════════════════════════════════════════════
function checkInv16(state: GameState): Violation[] {
  const v: Violation[] = [];
  for (const officer of Object.values<Officer>(state.officers)) {
    if (!inRange(officer.loyalty, 0, 100)) {
      v.push(
        violation('INV-16', `武將 ${officer.id} loyalty ${String(officer.loyalty)} 超出 [0,100]`, [
          officer.id,
        ]),
      );
    }
    const stats: Array<[string, number]> = [
      ['ldr', officer.ldr],
      ['val', officer.val],
      ['int', officer.int],
      ['pol', officer.pol],
    ];
    for (const [dim, val] of stats) {
      if (!inRange(val, 1, BAL.abilityMax)) {
        v.push(
          violation(
            'INV-16',
            `武將 ${officer.id} ${dim} ${String(val)} 超出 [1,${String(BAL.abilityMax)}]`,
            [officer.id],
          ),
        );
      }
    }
    if (!isNonNegInt(officer.merit)) {
      v.push(
        violation('INV-16', `武將 ${officer.id} merit ${String(officer.merit)} 須為非負整數`, [
          officer.id,
        ]),
      );
    }
  }
  for (const clan of Object.values<Clan>(state.clans)) {
    if (!inRange(clan.prestige, 0, BAL.prestigeMax)) {
      v.push(
        violation(
          'INV-16',
          `勢力 ${clan.id} prestige ${String(clan.prestige)} 超出 [0,${String(BAL.prestigeMax)}]`,
          [clan.id],
        ),
      );
    }
    if (!isNonNegInt(clan.gold)) {
      v.push(
        violation('INV-16', `勢力 ${clan.id} gold ${String(clan.gold)} 須為非負整數`, [clan.id]),
      );
    }
  }
  for (const castle of Object.values<Castle>(state.castles)) {
    if (!inRange(castle.morale, 0, 100)) {
      v.push(
        violation('INV-16', `城 ${castle.id} morale ${String(castle.morale)} 超出 [0,100]`, [
          castle.id,
        ]),
      );
    }
    if (castle.durability > castle.maxDurability || castle.durability < 0) {
      v.push(
        violation(
          'INV-16',
          `城 ${castle.id} durability ${String(castle.durability)} 超出 [0,maxDurability]`,
          [castle.id],
        ),
      );
    }
    if (!isNonNegInt(castle.soldiers)) {
      v.push(
        violation('INV-16', `城 ${castle.id} soldiers ${String(castle.soldiers)} 須為非負整數`, [
          castle.id,
        ]),
      );
    }
    if (!isNonNegInt(castle.food)) {
      v.push(
        violation('INV-16', `城 ${castle.id} food ${String(castle.food)} 須為非負整數`, [
          castle.id,
        ]),
      );
    }
  }
  for (const district of Object.values<District>(state.districts)) {
    if (!inRange(district.publicOrder, 0, 100)) {
      v.push(
        violation(
          'INV-16',
          `郡 ${district.id} publicOrder ${String(district.publicOrder)} 超出 [0,100]`,
          [district.id],
        ),
      );
    }
    if (district.commerce > district.commerceCap || district.commerce < 0) {
      v.push(
        violation(
          'INV-16',
          `郡 ${district.id} commerce ${String(district.commerce)} 超出 [0,commerceCap]`,
          [district.id],
        ),
      );
    }
    if (district.kokudaka > district.kokudakaCap || district.kokudaka < 0) {
      v.push(
        violation(
          'INV-16',
          `郡 ${district.id} kokudaka ${String(district.kokudaka)} 超出 [0,kokudakaCap]`,
          [district.id],
        ),
      );
    }
    if (district.population > district.populationCap || district.population < 0) {
      v.push(
        violation(
          'INV-16',
          `郡 ${district.id} population ${String(district.population)} 超出 [0,populationCap]`,
          [district.id],
        ),
      );
    }
  }
  for (const army of Object.values<Army>(state.armies)) {
    if (!inRange(army.morale, 0, 100)) {
      v.push(
        violation('INV-16', `部隊 ${army.id} morale ${String(army.morale)} 超出 [0,100]`, [
          army.id,
        ]),
      );
    }
    if (!isNonNegInt(army.soldiers)) {
      v.push(
        violation('INV-16', `部隊 ${army.id} soldiers ${String(army.soldiers)} 須為非負整數`, [
          army.id,
        ]),
      );
    }
    if (!isNonNegInt(army.food)) {
      v.push(
        violation('INV-16', `部隊 ${army.id} food ${String(army.food)} 須為非負整數`, [army.id]),
      );
    }
  }
  for (const transport of Object.values<TransportOrder>(state.transports)) {
    if (!isNonNegInt(transport.soldiers)) {
      v.push(
        violation(
          'INV-16',
          `輸送隊 ${transport.id} soldiers ${String(transport.soldiers)} 須為非負整數`,
          [transport.id],
        ),
      );
    }
    if (!isNonNegInt(transport.food)) {
      v.push(
        violation('INV-16', `輸送隊 ${transport.id} food ${String(transport.food)} 須為非負整數`, [
          transport.id,
        ]),
      );
    }
    if (!isNonNegInt(transport.gold)) {
      v.push(
        violation('INV-16', `輸送隊 ${transport.id} gold ${String(transport.gold)} 須為非負整數`, [
          transport.id,
        ]),
      );
    }
  }
  for (const corps of Object.values<Corps>(state.corps)) {
    if (!isNonNegInt(corps.gold)) {
      v.push(
        violation('INV-16', `軍團 ${corps.id} gold ${String(corps.gold)} 須為非負整數`, [corps.id]),
      );
    }
  }
  for (const row of Object.values(state.diplomacy.rows)) {
    if (!inRange(row.trustAtoB, 0, 100) || !inRange(row.trustBtoA, 0, 100)) {
      v.push(violation('INV-16', `外交列 ${row.key} trust 超出 [0,100]`, [row.key]));
    }
    if (!inRange(row.sentimentAtoB, -100, 100) || !inRange(row.sentimentBtoA, -100, 100)) {
      v.push(violation('INV-16', `外交列 ${row.key} sentiment 超出 [-100,100]`, [row.key]));
    }
  }
  for (const [clanId, favor] of Object.entries(state.court.courtFavor)) {
    if (!inRange(favor, 0, 100)) {
      v.push(violation('INV-16', `朝廷友好度 ${clanId} ${String(favor)} 超出 [0,100]`, [clanId]));
    }
  }
  return v;
}

// ═══════════════════════════════════════════════════════════════════
// INV-17｜Pact.kind='vassal'⇒vassalClanId∈{a,b}；同 row 同 kind 至多一件；endDay=null 僅限 marriage/vassal
// ═══════════════════════════════════════════════════════════════════
function checkInv17(state: GameState): Violation[] {
  const v: Violation[] = [];
  for (const row of Object.values(state.diplomacy.rows)) {
    const kindsSeen = new Set<string>();
    for (const pact of row.pacts) {
      if (kindsSeen.has(pact.kind)) {
        v.push(violation('INV-17', `外交列 ${row.key} 同 kind ${pact.kind} 協定重複`, [row.key]));
      }
      kindsSeen.add(pact.kind);
      if (pact.kind === 'vassal') {
        if (pact.vassalClanId !== row.a && pact.vassalClanId !== row.b) {
          v.push(
            violation('INV-17', `外交列 ${row.key} vassal 協定的 vassalClanId 非 a/b`, [row.key]),
          );
        }
      } else if (pact.vassalClanId !== null) {
        v.push(
          violation('INV-17', `外交列 ${row.key} 的 ${pact.kind} 協定 vassalClanId 應為 null`, [
            row.key,
          ]),
        );
      }
      if (pact.endDay === null && pact.kind !== 'marriage' && pact.kind !== 'vassal') {
        v.push(
          violation('INV-17', `外交列 ${row.key} 的 ${pact.kind} 協定 endDay 不應為 null`, [
            row.key,
          ]),
        );
      }
    }
  }
  return v;
}

// ═══════════════════════════════════════════════════════════════════
// INV-18｜officer.status='captive' ⇔ capturedByClanId≠null（且該勢力 alive、locationCastleId 屬該勢力）
// ═══════════════════════════════════════════════════════════════════
function checkInv18(state: GameState): Violation[] {
  const v: Violation[] = [];
  for (const officer of Object.values<Officer>(state.officers)) {
    if (officer.status === 'captive') {
      if (officer.capturedByClanId === null) {
        v.push(
          violation('INV-18', `武將 ${officer.id} status=captive 但 capturedByClanId 為 null`, [
            officer.id,
          ]),
        );
      } else {
        const captor = state.clans[officer.capturedByClanId];
        if (captor?.alive !== true) {
          v.push(
            violation(
              'INV-18',
              `武將 ${officer.id} 的捕獲方 ${officer.capturedByClanId} 不存在或已滅亡`,
              [officer.id],
            ),
          );
        }
        const location =
          officer.locationCastleId !== null ? state.castles[officer.locationCastleId] : undefined;
        if (!location || location.ownerClanId !== officer.capturedByClanId) {
          v.push(violation('INV-18', `武將 ${officer.id} 的關押城不屬於捕獲方`, [officer.id]));
        }
      }
    } else if (officer.capturedByClanId !== null) {
      v.push(
        violation('INV-18', `武將 ${officer.id} status≠captive 但 capturedByClanId 非 null`, [
          officer.id,
        ]),
      );
    }
  }
  return v;
}

// ═══════════════════════════════════════════════════════════════════
// INV-19｜officer.status='dead' ⇒ 不被任何 lordId/stewardId/leaderId/corpsLeaderId/army/mission/proposal(pending) 引用
// ═══════════════════════════════════════════════════════════════════
function checkInv19(state: GameState): Violation[] {
  const v: Violation[] = [];
  const deadIds = new Set<OfficerId>(
    Object.values<Officer>(state.officers)
      .filter((o) => o.status === 'dead')
      .map((o) => o.id),
  );
  if (deadIds.size === 0) return v;
  for (const castle of Object.values<Castle>(state.castles)) {
    if (castle.lordId !== null && deadIds.has(castle.lordId)) {
      v.push(
        violation('INV-19', `已死亡武將 ${castle.lordId} 仍被城 ${castle.id} 引用為 lordId`, [
          castle.lordId,
          castle.id,
        ]),
      );
    }
  }
  for (const district of Object.values<District>(state.districts)) {
    if (district.stewardId !== null && deadIds.has(district.stewardId)) {
      v.push(
        violation(
          'INV-19',
          `已死亡武將 ${district.stewardId} 仍被郡 ${district.id} 引用為 stewardId`,
          [district.stewardId, district.id],
        ),
      );
    }
  }
  for (const army of Object.values<Army>(state.armies)) {
    if (deadIds.has(army.leaderId)) {
      v.push(
        violation('INV-19', `已死亡武將 ${army.leaderId} 仍被部隊 ${army.id} 引用為 leaderId`, [
          army.leaderId,
          army.id,
        ]),
      );
    }
    for (const dep of army.deputyIds) {
      if (deadIds.has(dep)) {
        v.push(
          violation('INV-19', `已死亡武將 ${dep} 仍被部隊 ${army.id} 引用為 deputyIds`, [
            dep,
            army.id,
          ]),
        );
      }
    }
  }
  for (const corps of Object.values<Corps>(state.corps)) {
    if (deadIds.has(corps.corpsLeaderId)) {
      v.push(
        violation(
          'INV-19',
          `已死亡武將 ${corps.corpsLeaderId} 仍被軍團 ${corps.id} 引用為 corpsLeaderId`,
          [corps.corpsLeaderId, corps.id],
        ),
      );
    }
  }
  for (const mission of state.diplomacy.missions) {
    if (deadIds.has(mission.officerId)) {
      v.push(
        violation('INV-19', `已死亡武將 ${mission.officerId} 仍被外交工作引用`, [
          mission.officerId,
        ]),
      );
    }
  }
  for (const proposal of Object.values<Proposal>(state.proposals)) {
    if (proposal.status === 'pending' && deadIds.has(proposal.officerId)) {
      v.push(
        violation('INV-19', `已死亡武將 ${proposal.officerId} 仍被具申 ${proposal.id} 引用`, [
          proposal.officerId,
          proposal.id,
        ]),
      );
    }
  }
  return v;
}

// ═══════════════════════════════════════════════════════════════════
// INV-20｜district.subjugation≠null ⇒ clanId≠ownerClanId、progress∈[0,100)、daysRequired≥1
// ═══════════════════════════════════════════════════════════════════
function checkInv20(state: GameState): Violation[] {
  const v: Violation[] = [];
  for (const district of Object.values<District>(state.districts)) {
    const s = district.subjugation;
    if (s === null) continue;
    if (s.clanId === district.ownerClanId) {
      v.push(violation('INV-20', `郡 ${district.id} 制壓方與 ownerClanId 相同`, [district.id]));
    }
    if (!(s.progress >= 0 && s.progress < 100)) {
      v.push(
        violation('INV-20', `郡 ${district.id} 制壓 progress ${String(s.progress)} 超出 [0,100)`, [
          district.id,
        ]),
      );
    }
    if (s.daysRequired < 1) {
      v.push(
        violation('INV-20', `郡 ${district.id} 制壓 daysRequired ${String(s.daysRequired)} < 1`, [
          district.id,
        ]),
      );
    }
  }
  return v;
}

// ═══════════════════════════════════════════════════════════════════
// INV-21｜facilities 不重複；buildQueue.length≤BAL.buildQueueSize；daysLeft≥0；建造中/已建成不重複
// ═══════════════════════════════════════════════════════════════════
function checkInv21(state: GameState): Violation[] {
  const v: Violation[] = [];
  for (const castle of Object.values<Castle>(state.castles)) {
    const facilitySet = new Set(castle.facilities);
    if (facilitySet.size !== castle.facilities.length) {
      v.push(violation('INV-21', `城 ${castle.id} facilities 內有重複施設`, [castle.id]));
    }
    if (castle.buildQueue.length > BAL.buildQueueSize) {
      v.push(
        violation(
          'INV-21',
          `城 ${castle.id} buildQueue 長度 ${String(castle.buildQueue.length)} 超過上限 ${String(BAL.buildQueueSize)}`,
          [castle.id],
        ),
      );
    }
    const queueTypes = new Set<string>();
    for (const order of castle.buildQueue) {
      if (order.daysLeft < 0) {
        v.push(
          violation('INV-21', `城 ${castle.id} 建造項 ${order.facilityTypeId} daysLeft < 0`, [
            castle.id,
          ]),
        );
      }
      if (queueTypes.has(order.facilityTypeId)) {
        v.push(
          violation('INV-21', `城 ${castle.id} buildQueue 內重複施設 ${order.facilityTypeId}`, [
            castle.id,
          ]),
        );
      }
      queueTypes.add(order.facilityTypeId);
      if (facilitySet.has(order.facilityTypeId)) {
        v.push(
          violation('INV-21', `城 ${castle.id} 施設 ${order.facilityTypeId} 已建成又重複建造`, [
            castle.id,
          ]),
        );
      }
    }
  }
  return v;
}

// ═══════════════════════════════════════════════════════════════════
// INV-22｜clan.alive=false ⇒ 不擁有任何城/郡/部隊/軍團、不出現在 pending Proposal 與 DiploMission
// ═══════════════════════════════════════════════════════════════════
function checkInv22(state: GameState): Violation[] {
  const v: Violation[] = [];
  for (const clan of Object.values<Clan>(state.clans)) {
    if (clan.alive) continue;
    for (const castle of Object.values<Castle>(state.castles)) {
      if (castle.ownerClanId === clan.id) {
        v.push(
          violation('INV-22', `已滅亡勢力 ${clan.id} 仍擁有城 ${castle.id}`, [clan.id, castle.id]),
        );
      }
    }
    for (const district of Object.values<District>(state.districts)) {
      if (district.ownerClanId === clan.id) {
        v.push(
          violation('INV-22', `已滅亡勢力 ${clan.id} 仍擁有郡 ${district.id}`, [
            clan.id,
            district.id,
          ]),
        );
      }
    }
    for (const army of Object.values<Army>(state.armies)) {
      if (army.clanId === clan.id) {
        v.push(
          violation('INV-22', `已滅亡勢力 ${clan.id} 仍擁有部隊 ${army.id}`, [clan.id, army.id]),
        );
      }
    }
    for (const corps of Object.values<Corps>(state.corps)) {
      if (corps.clanId === clan.id) {
        v.push(
          violation('INV-22', `已滅亡勢力 ${clan.id} 仍擁有軍團 ${corps.id}`, [clan.id, corps.id]),
        );
      }
    }
    for (const proposal of Object.values<Proposal>(state.proposals)) {
      if (proposal.status === 'pending' && proposal.clanId === clan.id) {
        v.push(
          violation('INV-22', `已滅亡勢力 ${clan.id} 仍有待決具申 ${proposal.id}`, [
            clan.id,
            proposal.id,
          ]),
        );
      }
    }
    for (const mission of state.diplomacy.missions) {
      if (mission.fromClanId === clan.id || mission.target === clan.id) {
        v.push(violation('INV-22', `已滅亡勢力 ${clan.id} 仍出現在外交工作中`, [clan.id]));
      }
    }
  }
  return v;
}

// ═══════════════════════════════════════════════════════════════════
// INV-23｜meta.playerClanId 存在
// ═══════════════════════════════════════════════════════════════════
function checkInv23(state: GameState): Violation[] {
  const v: Violation[] = [];
  if (!state.clans[state.meta.playerClanId]) {
    v.push(
      violation('INV-23', `meta.playerClanId ${state.meta.playerClanId} 不存在於 clans`, [
        state.meta.playerClanId,
      ]),
    );
  }
  return v;
}

// ═══════════════════════════════════════════════════════════════════
// INV-24｜time.year/month/dayOfMonth 與 day 換算一致（§5.6）；rng 各流 ∈ [0, 2^32)
// ═══════════════════════════════════════════════════════════════════
function checkInv24(state: GameState): Violation[] {
  const v: Violation[] = [];
  const { day, year, month, dayOfMonth } = state.time;
  const expectedYear = 1560 + Math.floor(day / 360);
  const dayOfYear = ((day % 360) + 360) % 360;
  const expectedMonth = Math.floor(dayOfYear / 30) + 1;
  const expectedDayOfMonth = (dayOfYear % 30) + 1;
  if (year !== expectedYear || month !== expectedMonth || dayOfMonth !== expectedDayOfMonth) {
    v.push(
      violation(
        'INV-24',
        `time.year/month/dayOfMonth 與 day=${String(day)} 換算不一致（預期 ${String(expectedYear)}/${String(expectedMonth)}/${String(expectedDayOfMonth)}，實際 ${String(year)}/${String(month)}/${String(dayOfMonth)}）`,
        [],
      ),
    );
  }
  for (const [streamName, value] of Object.entries(state.rng)) {
    if (!(Number.isInteger(value) && value >= 0 && value < 2 ** 32)) {
      v.push(violation('INV-24', `rng.${streamName} ${String(value)} 超出 [0, 2^32)`, []));
    }
  }
  return v;
}

// ═══════════════════════════════════════════════════════════════════
// INV-25｜全樹無 undefined/NaN/Infinity/函式/class instance；reports.length ≤ BAL.reportMaxKept
// ═══════════════════════════════════════════════════════════════════
function scanForInvalidValues(value: unknown, path: string, out: Violation[]): void {
  if (value === undefined) {
    out.push(violation('INV-25', `路徑 ${path} 值為 undefined`, [path]));
    return;
  }
  if (typeof value === 'number') {
    if (Number.isNaN(value)) {
      out.push(violation('INV-25', `路徑 ${path} 值為 NaN`, [path]));
    } else if (!Number.isFinite(value)) {
      out.push(violation('INV-25', `路徑 ${path} 值為 Infinity`, [path]));
    }
    return;
  }
  if (typeof value === 'function') {
    out.push(violation('INV-25', `路徑 ${path} 為函式`, [path]));
    return;
  }
  if (value === null || typeof value !== 'object') {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item: unknown, index: number) => {
      scanForInvalidValues(item, `${path}[${String(index)}]`, out);
    });
    return;
  }
  const proto: unknown = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) {
    out.push(violation('INV-25', `路徑 ${path} 為 class instance（非純物件）`, [path]));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    scanForInvalidValues(child, `${path}.${key}`, out);
  }
}

function checkInv25(state: GameState): Violation[] {
  const v: Violation[] = [];
  scanForInvalidValues(state, 'state', v);
  if (state.reports.length > BAL.reportMaxKept) {
    v.push(
      violation(
        'INV-25',
        `reports.length ${String(state.reports.length)} 超過上限 ${String(BAL.reportMaxKept)}`,
        [],
      ),
    );
  }
  return v;
}

// ═══════════════════════════════════════════════════════════════════
// validateState：依序執行 INV-01..25，回傳全部違規（空陣列＝通過）
// ═══════════════════════════════════════════════════════════════════
export function validateState(state: GameState): Violation[] {
  return [
    ...checkInv01(state),
    ...checkInv02(state),
    ...checkInv03(state),
    ...checkInv04(state),
    ...checkInv05(state),
    ...checkInv06(state),
    ...checkInv07(state),
    ...checkInv08(state),
    ...checkInv09(state),
    ...checkInv10(state),
    ...checkInv11(state),
    ...checkInv12(state),
    ...checkInv13(state),
    ...checkInv14(state),
    ...checkInv15(state),
    ...checkInv16(state),
    ...checkInv17(state),
    ...checkInv18(state),
    ...checkInv19(state),
    ...checkInv20(state),
    ...checkInv21(state),
    ...checkInv22(state),
    ...checkInv23(state),
    ...checkInv24(state),
    ...checkInv25(state),
  ];
}
