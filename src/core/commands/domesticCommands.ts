import { BAL } from '../balance';
import { castleFoodCap, facilityIsActive, hasPolicy } from '../domestic';
import { FACILITIES } from '../facilities';
import { POLICIES } from '../policies';
import { COURT_RANK_VALUES, RANK_VALUES } from '../state/enums';
import { buildMapGraph } from '../state/mapGraph';
import { nextId } from '../state/serialize';
import { computePath } from '../systems/pathfinding';
import type { GameState } from '../state/gameState';
import type { ValidationResult } from './types';
import type { CommandByType, EmitFn } from './registry';
import { REJECT_REASONS } from './reasons';
import { adjustLoyalty } from '../systems/officers';
import { traitModifier } from '../traits';

const ok: ValidationResult = { ok: true };
const reject = (reasonKey: string): ValidationResult => ({ ok: false, reasonKey });

function ownedCastle(state: Readonly<GameState>, clanId: string, castleId: string) {
  const castle = state.castles[castleId as keyof typeof state.castles];
  return castle?.ownerClanId === clanId ? castle : undefined;
}

function ownedDistrict(state: Readonly<GameState>, clanId: string, districtId: string) {
  const district = state.districts[districtId as keyof typeof state.districts];
  return district?.ownerClanId === clanId ? district : undefined;
}

export function validateSetDevelopFocus(
  state: Readonly<GameState>,
  cmd: CommandByType['setDevelopFocus'],
): ValidationResult {
  const district = ownedDistrict(state, cmd.clanId, cmd.districtId);
  if (!district) return reject(REJECT_REASONS.notOwner);
  if (district.stewardId !== null || !state.castles[district.castleId]?.directControl)
    return reject(REJECT_REASONS.officerBusy);
  return ok;
}
export function applySetDevelopFocus(
  state: GameState,
  cmd: CommandByType['setDevelopFocus'],
): void {
  state.districts[cmd.districtId]!.developFocus = cmd.focus;
}

export function validateGrantFief(
  state: Readonly<GameState>,
  cmd: CommandByType['grantFief'],
): ValidationResult {
  const district = ownedDistrict(state, cmd.clanId, cmd.districtId);
  if (!district) return reject(REJECT_REASONS.notOwner);
  if (cmd.officerId === null)
    return district.stewardId === null ? reject(REJECT_REASONS.invalidTarget) : ok;
  if (district.uprising !== null) return reject(REJECT_REASONS.invalidTarget);
  const officer = state.officers[cmd.officerId];
  const clan = state.clans[cmd.clanId];
  if (
    !officer ||
    officer.status !== 'serving' ||
    officer.clanId !== cmd.clanId ||
    officer.id === clan?.leaderId
  )
    return reject(REJECT_REASONS.invalidTarget);
  if (officer.armyId !== null || officer.locationCastleId !== district.castleId)
    return reject(REJECT_REASONS.officerBusy);
  const fiefs = Object.values(state.districts).filter(
    (d) => d.stewardId === officer.id && d.id !== district.id,
  ).length;
  const cap = BAL.fiefMaxByRank[RANK_VALUES.indexOf(officer.rank)] ?? 0;
  return fiefs + 1 <= cap ? ok : reject(REJECT_REASONS.rankTooLow);
}
export function applyGrantFief(state: GameState, cmd: CommandByType['grantFief']): void {
  const district = state.districts[cmd.districtId]!;
  const previousStewardId = district.stewardId;
  if (district.stewardId !== null && district.stewardId !== cmd.officerId) {
    const old = state.officers[district.stewardId];
    if (old) old.loyalty = Math.max(0, old.loyalty - BAL.loyaltyReduceFief);
  }
  district.stewardId = cmd.officerId;
  if (cmd.officerId !== null && cmd.officerId !== previousStewardId) {
    const recipient = state.officers[cmd.officerId];
    if (recipient) adjustLoyalty(recipient, BAL.loyaltyGrantFief);
  }
}

function facilityAvailable(
  state: Readonly<GameState>,
  castleId: string,
  facilityId: string,
): boolean {
  const castle = state.castles[castleId as keyof typeof state.castles];
  const def = FACILITIES[facilityId as keyof typeof FACILITIES];
  if (!castle || !def) return false;
  if (def.mainCastleOnly && castle.tier !== 'main') return false;
  if (def.requiresCoastal && !castle.coastal) return false;
  if (def.requiresFacility !== null && !castle.facilities.includes(def.requiresFacility))
    return false;
  if (def.requiresPolicy !== null && !hasPolicy(state, castle.ownerClanId, def.requiresPolicy))
    return false;
  if (def.exclusiveWith !== null && castle.facilities.includes(def.exclusiveWith)) return false;
  return true;
}

export function validateBuildFacility(
  state: Readonly<GameState>,
  cmd: CommandByType['buildFacility'],
): ValidationResult {
  const castle = ownedCastle(state, cmd.clanId, cmd.castleId);
  const def = FACILITIES[cmd.facilityTypeId];
  if (!castle) return reject(REJECT_REASONS.notOwner);
  if (!def || !facilityAvailable(state, castle.id, def.id))
    return reject(REJECT_REASONS.invalidTarget);
  if (
    castle.facilities.includes(def.id) ||
    castle.buildQueue.some((item) => item.facilityTypeId === def.id)
  )
    return reject(REJECT_REASONS.alreadyActive);
  const slots = castle.tier === 'main' ? BAL.facilitySlotsMain : BAL.facilitySlotsBranch;
  if (
    castle.facilities.length + castle.buildQueue.length >= slots ||
    castle.buildQueue.length >= BAL.buildQueueSize
  )
    return reject(REJECT_REASONS.invalidTarget);
  return (state.clans[cmd.clanId]?.gold ?? 0) >= def.costGold
    ? ok
    : reject(REJECT_REASONS.insufficientGold);
}
export function applyBuildFacility(state: GameState, cmd: CommandByType['buildFacility']): void {
  const def = FACILITIES[cmd.facilityTypeId]!;
  const castle = state.castles[cmd.castleId]!;
  const builder = castle.lordId === null ? undefined : state.officers[castle.lordId];
  const buildDays = Math.max(
    1,
    Math.ceil(def.buildDays * (builder ? traitModifier(builder, 'dev.facilityTimeMult').mult : 1)),
  );
  state.clans[cmd.clanId]!.gold -= def.costGold;
  castle.buildQueue.push({ facilityTypeId: def.id, daysLeft: buildDays });
}
export function validateCancelBuild(
  state: Readonly<GameState>,
  cmd: CommandByType['cancelBuild'],
): ValidationResult {
  const castle = ownedCastle(state, cmd.clanId, cmd.castleId);
  return castle && Number.isInteger(cmd.queueIndex) && castle.buildQueue[cmd.queueIndex]
    ? ok
    : reject(REJECT_REASONS.invalidTarget);
}
export function applyCancelBuild(state: GameState, cmd: CommandByType['cancelBuild']): void {
  const [order] = state.castles[cmd.castleId]!.buildQueue.splice(cmd.queueIndex, 1);
  if (order)
    state.clans[cmd.clanId]!.gold += Math.floor(
      (FACILITIES[order.facilityTypeId]?.costGold ?? 0) * BAL.buildRefundRate,
    );
}
export function validateDemolishFacility(
  state: Readonly<GameState>,
  cmd: CommandByType['demolishFacility'],
): ValidationResult {
  const castle = ownedCastle(state, cmd.clanId, cmd.castleId);
  return castle?.facilities.includes(cmd.facilityTypeId)
    ? ok
    : reject(REJECT_REASONS.invalidTarget);
}
export function applyDemolishFacility(
  state: GameState,
  cmd: CommandByType['demolishFacility'],
): void {
  const castle = state.castles[cmd.castleId]!;
  castle.facilities = castle.facilities.filter((id) => id !== cmd.facilityTypeId);
}

export function validateSetConscriptPolicy(
  state: Readonly<GameState>,
  cmd: CommandByType['setConscriptPolicy'],
): ValidationResult {
  const castle = ownedCastle(state, cmd.clanId, cmd.castleId);
  return castle?.directControl && castle.corpsId === null
    ? ok
    : reject(castle ? REJECT_REASONS.delegatedToCorps : REJECT_REASONS.notOwner);
}
export function applySetConscriptPolicy(
  state: GameState,
  cmd: CommandByType['setConscriptPolicy'],
): void {
  state.castles[cmd.castleId]!.conscriptPolicy = cmd.policy;
}

function transportPath(state: Readonly<GameState>, cmd: CommandByType['transport']) {
  return computePath(state, buildMapGraph(state.castles, state.districts, state.roads), {
    clanId: cmd.clanId,
    from: cmd.fromCastleId,
    to: cmd.toCastleId,
    speedFactor: 1,
  });
}
export function validateTransport(
  state: Readonly<GameState>,
  cmd: CommandByType['transport'],
): ValidationResult {
  const from = ownedCastle(state, cmd.clanId, cmd.fromCastleId);
  const to = ownedCastle(state, cmd.clanId, cmd.toCastleId);
  if (!from || !to || from.id === to.id) return reject(REJECT_REASONS.notOwner);
  if (
    ![cmd.soldiers, cmd.gold, cmd.food].every((n) => Number.isInteger(n) && n >= 0) ||
    cmd.soldiers + cmd.gold + cmd.food === 0
  )
    return reject(REJECT_REASONS.invalidTarget);
  if (cmd.soldiers > from.soldiers) return reject(REJECT_REASONS.insufficientTroops);
  if (cmd.food > from.food) return reject(REJECT_REASONS.insufficientFood);
  if (cmd.gold > (state.clans[cmd.clanId]?.gold ?? 0))
    return reject(REJECT_REASONS.insufficientGold);
  return transportPath(state, cmd).found ? ok : reject(REJECT_REASONS.pathBlocked);
}
export function applyTransport(state: GameState, cmd: CommandByType['transport']): void {
  const result = transportPath(state, cmd);
  const from = state.castles[cmd.fromCastleId]!;
  from.soldiers -= cmd.soldiers;
  from.food -= cmd.food;
  state.clans[cmd.clanId]!.gold -= cmd.gold;
  const id = nextId(state, 'transport');
  state.transports[id] = {
    id,
    clanId: cmd.clanId,
    fromCastleId: cmd.fromCastleId,
    toCastleId: cmd.toCastleId,
    soldiers: cmd.soldiers,
    gold: cmd.gold,
    food: cmd.food,
    path: result.nodes,
    pathCursor: 0,
    edgeProgressDays: 0,
    edgeCostDays: 0,
    returning: false,
  };
}
export function validateRecallTransport(
  state: Readonly<GameState>,
  cmd: CommandByType['recallTransport'],
): ValidationResult {
  const order = state.transports[cmd.transportId];
  return order?.clanId === cmd.clanId && !order.returning
    ? ok
    : reject(REJECT_REASONS.invalidTarget);
}
export function applyRecallTransport(
  state: GameState,
  cmd: CommandByType['recallTransport'],
): void {
  const order = state.transports[cmd.transportId]!;
  // 行進中折返：把「已走過的部分」改成回到上一節點所需距離，並暫以原下一節點作游標。
  // 若正位於節點（progress=0），transportDaily 會直接選前一條邊。
  if (order.edgeProgressDays > 0 && order.pathCursor + 1 < order.path.length) {
    order.pathCursor += 1;
    order.edgeCostDays = order.edgeProgressDays;
    order.edgeProgressDays = 0;
  }
  order.returning = true;
}

export function validateTradeRice(
  state: Readonly<GameState>,
  cmd: CommandByType['tradeRice'],
): ValidationResult {
  const castle = ownedCastle(state, cmd.clanId, cmd.castleId);
  if (!castle || !facilityIsActive(state, castle, 'fac.komedoiya'))
    return reject(REJECT_REASONS.invalidTarget);
  if (
    !Number.isInteger(cmd.amount) ||
    cmd.amount <= 0 ||
    castle.riceTradedThisMonth + cmd.amount > BAL.riceTradeCapMonthly
  )
    return reject(REJECT_REASONS.invalidTarget);
  if (cmd.mode === 'sell')
    return castle.food >= cmd.amount ? ok : reject(REJECT_REASONS.insufficientFood);
  return (state.clans[cmd.clanId]?.gold ?? 0) >= Math.ceil(cmd.amount * BAL.riceBuyRate)
    ? ok
    : reject(REJECT_REASONS.insufficientGold);
}
export function applyTradeRice(state: GameState, cmd: CommandByType['tradeRice']): void {
  const castle = state.castles[cmd.castleId]!;
  const clan = state.clans[cmd.clanId]!;
  if (cmd.mode === 'sell') {
    castle.food -= cmd.amount;
    clan.gold += Math.floor(cmd.amount * BAL.riceSellRate);
  } else {
    clan.gold -= Math.ceil(cmd.amount * BAL.riceBuyRate);
    castle.food = Math.min(castleFoodCap(castle), castle.food + cmd.amount);
  }
  castle.riceTradedThisMonth += cmd.amount;
}

export function policyUnlocked(
  state: Readonly<GameState>,
  cmd: CommandByType['enactPolicy'],
): boolean {
  const def = POLICIES[cmd.policyId];
  const clan = state.clans[cmd.clanId];
  if (!def || !clan) return false;
  const eventUnlock = def.unlockEvent !== null && state.events.fired[def.unlockEvent] !== undefined;
  const courtUnlock =
    def.unlockCourtRank !== null &&
    COURT_RANK_VALUES.indexOf(clan.courtRank) >= COURT_RANK_VALUES.indexOf(def.unlockCourtRank);
  const prestigeUnlock = clan.prestige >= def.unlockPrestige;
  const facilityOk =
    def.requiresFacility === null ||
    Object.values(state.castles).some(
      (castle) =>
        castle.ownerClanId === clan.id && castle.facilities.includes(def.requiresFacility!),
    );
  return eventUnlock || courtUnlock || (prestigeUnlock && facilityOk);
}
export function validateEnactPolicy(
  state: Readonly<GameState>,
  cmd: CommandByType['enactPolicy'],
): ValidationResult {
  const def = POLICIES[cmd.policyId];
  const clan = state.clans[cmd.clanId];
  const policies = state.policies[cmd.clanId];
  if (!def || !clan || !policies || !policyUnlocked(state, cmd))
    return reject(REJECT_REASONS.invalidTarget);
  if (policies.active.includes(def.id)) return reject(REJECT_REASONS.alreadyActive);
  if ((policies.cooldownUntil[def.id] ?? 0) > state.time.day)
    return reject(REJECT_REASONS.invalidTarget);
  if (def.exclusiveWith !== null && policies.active.includes(def.exclusiveWith))
    return reject(REJECT_REASONS.alreadyActive);
  const slots = Math.min(BAL.policySlotMax, 1 + Math.floor(clan.prestige / BAL.policySlotPrestige));
  if (policies.active.length >= slots) return reject(REJECT_REASONS.invalidTarget);
  return clan.gold >= def.upkeepGold ? ok : reject(REJECT_REASONS.insufficientGold);
}
export function applyEnactPolicy(
  state: GameState,
  cmd: CommandByType['enactPolicy'],
  emit: EmitFn,
): void {
  const def = POLICIES[cmd.policyId]!;
  state.clans[cmd.clanId]!.gold -= def.upkeepGold;
  state.policies[cmd.clanId]!.active.push(def.id);
  emit({
    type: 'policy.enacted',
    day: state.time.day,
    clanIds: [cmd.clanId],
    clanId: cmd.clanId,
    policyId: def.id,
  });
}
export function validateRevokePolicy(
  state: Readonly<GameState>,
  cmd: CommandByType['revokePolicy'],
): ValidationResult {
  return state.policies[cmd.clanId]?.active.includes(cmd.policyId)
    ? ok
    : reject(REJECT_REASONS.invalidTarget);
}
export function applyRevokePolicy(
  state: GameState,
  cmd: CommandByType['revokePolicy'],
  emit: EmitFn,
): void {
  const policies = state.policies[cmd.clanId]!;
  policies.active = policies.active.filter((id) => id !== cmd.policyId);
  policies.cooldownUntil[cmd.policyId] = state.time.day + BAL.policyReadoptCooldownMonths * 30;
  emit({
    type: 'policy.revoked',
    day: state.time.day,
    clanIds: [cmd.clanId],
    clanId: cmd.clanId,
    policyId: cmd.policyId,
  });
}

export function validateAppointLord(
  state: Readonly<GameState>,
  cmd: CommandByType['appointLord'],
): ValidationResult {
  const castle = ownedCastle(state, cmd.clanId, cmd.castleId);
  if (!castle) return reject(REJECT_REASONS.notOwner);
  if (castle.corpsId !== null) return reject(REJECT_REASONS.delegatedToCorps);
  if (cmd.officerId === null)
    return castle.lordId !== null ? ok : reject(REJECT_REASONS.invalidTarget);
  const officer = state.officers[cmd.officerId];
  return officer?.status === 'serving' &&
    officer.clanId === cmd.clanId &&
    officer.locationCastleId === castle.id &&
    officer.armyId === null &&
    RANK_VALUES.indexOf(officer.rank) >= RANK_VALUES.indexOf('samurai-taisho')
    ? ok
    : reject(REJECT_REASONS.rankTooLow);
}
export function applyAppointLord(state: GameState, cmd: CommandByType['appointLord']): void {
  const newLordId = cmd.officerId;
  for (const castle of Object.values(state.castles))
    if (newLordId !== null && castle.lordId === newLordId && castle.id !== cmd.castleId) {
      const old = state.officers[newLordId];
      if (old) old.loyalty = Math.max(0, old.loyalty - BAL.loyaltyDismiss);
      castle.lordId = null;
    }
  const target = state.castles[cmd.castleId]!;
  if (target.lordId !== null && target.lordId !== cmd.officerId) {
    const old = state.officers[target.lordId];
    if (old) old.loyalty = Math.max(0, old.loyalty - BAL.loyaltyDismiss);
  }
  target.lordId = cmd.officerId;
}
export function validateSetCastleControl(
  state: Readonly<GameState>,
  cmd: CommandByType['setCastleControl'],
): ValidationResult {
  const castle = ownedCastle(state, cmd.clanId, cmd.castleId);
  if (!castle) return reject(REJECT_REASONS.notOwner);
  if (castle.corpsId !== null) return reject(REJECT_REASONS.delegatedToCorps);
  return !cmd.directControl && castle.lordId === null ? reject(REJECT_REASONS.invalidTarget) : ok;
}
export function applySetCastleControl(
  state: GameState,
  cmd: CommandByType['setCastleControl'],
): void {
  state.castles[cmd.castleId]!.directControl = cmd.directControl;
}
