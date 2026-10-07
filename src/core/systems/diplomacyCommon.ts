import { BAL } from '../balance';
import type { DiplomacyRow, GameState } from '../state/gameState';
import type { CastleId, ClanId, ClanPairKey, DistrictId, OfficerId } from '../state/ids';
import type { PactKind } from '../state/enums';
import { defaultDiplomacyRow, pairKey } from '../state/serialize';
import { DAYS_PER_MONTH } from './time';

/** Read-only lookups never materialize sparse rows. */
export function getDiplomacyRow(
  state: Readonly<GameState>,
  from: ClanId,
  to: ClanId,
): Readonly<DiplomacyRow> {
  return state.diplomacy.rows[pairKey(from, to)] ?? defaultDiplomacyRow(from, to);
}
export function ensureDiplomacyRow(state: GameState, from: ClanId, to: ClanId): DiplomacyRow {
  const key = pairKey(from, to);
  return (state.diplomacy.rows[key] ??= defaultDiplomacyRow(from, to));
}
export function getTrust(state: Readonly<GameState>, from: ClanId, to: ClanId): number {
  const row = getDiplomacyRow(state, from, to);
  return row.a === from ? row.trustAtoB : row.trustBtoA;
}
export function getSentiment(state: Readonly<GameState>, from: ClanId, to: ClanId): number {
  const row = getDiplomacyRow(state, from, to);
  return row.a === from ? row.sentimentAtoB : row.sentimentBtoA;
}
export function adjustTrust(state: GameState, from: ClanId, to: ClanId, delta: number): void {
  const row = ensureDiplomacyRow(state, from, to);
  const field = row.a === from ? 'trustAtoB' : 'trustBtoA';
  row[field] = Math.max(0, Math.min(BAL.trustMax, row[field] + delta));
}
export function adjustSentiment(state: GameState, from: ClanId, to: ClanId, delta: number): void {
  if (from === to || delta === 0) return;
  const row = ensureDiplomacyRow(state, from, to);
  const field = row.a === from ? 'sentimentAtoB' : 'sentimentBtoA';
  row[field] = Math.max(-100, Math.min(100, row[field] + delta));
}
export function hasPact(state: Readonly<GameState>, a: ClanId, b: ClanId, kind: PactKind): boolean {
  return getDiplomacyRow(state, a, b).pacts.some(
    (pact) => pact.kind === kind && (pact.endDay === null || state.time.day <= pact.endDay),
  );
}
export function isAtWar(
  state: Pick<GameState, 'diplomacy' | 'time'>,
  a: ClanId,
  b: ClanId,
): boolean {
  const row = state.diplomacy.rows[pairKey(a, b)];
  return (
    a !== b &&
    row !== undefined &&
    row.lastHostileDay !== null &&
    state.time.day - row.lastHostileDay < BAL.warStateMonths * DAYS_PER_MONTH &&
    !row.pacts.some((pact) => pact.endDay === null || state.time.day <= pact.endDay)
  );
}
export function canPlot(state: Readonly<GameState>, actor: ClanId, target: ClanId): boolean {
  return (
    actor !== target &&
    !!state.clans[actor]?.alive &&
    !!state.clans[target]?.alive &&
    !hasPact(state, actor, target, 'alliance') &&
    !hasPact(state, actor, target, 'marriage') &&
    !hasPact(state, actor, target, 'vassal') &&
    !hasPact(state, actor, target, 'ceasefire')
  );
}
export function isOfficerBusy(state: Readonly<GameState>, officerId: OfficerId): boolean {
  return (
    state.officers[officerId]?.armyId != null ||
    state.diplomacy.missions.some((mission) => mission.officerId === officerId) ||
    state.diplomacy.plots.some((plot) => plot.officerId === officerId)
  );
}
/** Ownership is evaluated now, never cached across captures or subjugation. */
export function buildAdjacency(state: Readonly<GameState>): Set<ClanPairKey> {
  const result = new Set<ClanPairKey>();
  for (const road of Object.values(state.roads)) {
    const a =
      state.castles[road.a as CastleId]?.ownerClanId ??
      state.districts[road.a as DistrictId]?.ownerClanId;
    const b =
      state.castles[road.b as CastleId]?.ownerClanId ??
      state.districts[road.b as DistrictId]?.ownerClanId;
    if (a !== undefined && b !== undefined && a !== b) result.add(pairKey(a, b));
  }
  return result;
}
