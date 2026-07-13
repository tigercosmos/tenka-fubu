// Dedicated battle-subloop transcript/replay harness (M5-9).
// Strategy command logs are day-based and cannot encode BattleCommand orders (plan/03 §3.7.2).

import type { Army, GameState } from '../../src/core/state/gameState';
import type {
  ArmyId,
  BattleId,
  CastleId,
  ClanId,
  MapNodeId,
  OfficerId,
} from '../../src/core/state/ids';
import { balanceHash, nextId, stateHash } from '../../src/core/state/serialize';
import {
  advanceBattleTick,
  applyStartKassen,
  type BattleCommand,
} from '../../src/core/systems/battle';
import { startFieldCombat } from '../../src/core/systems/fieldCombat';
import {
  buildMiniState,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_LORD,
  OFF_BETA_LORD,
} from '../fixtures/mini';

export const BATTLE_TRANSCRIPT_FORMAT_VERSION = 1 as const;
export const MINI_DUEL_LAYOUT_ID = 'mini-duel-v1' as const;

export interface BattleTranscriptEntry {
  /** Battle-subloop tick, starting at 1. */
  tick: number;
  /** Stable order within the tick, starting at 0. */
  seq: number;
  order: BattleCommand;
}

export interface BattleTranscriptCheckpoint {
  tick: number;
  hash: string;
}

export interface BattleTranscriptFile {
  formatVersion: typeof BATTLE_TRANSCRIPT_FORMAT_VERSION;
  scenarioId: 'mini';
  seed: number;
  balanceHash: string;
  initial: {
    layoutId: typeof MINI_DUEL_LAYOUT_ID;
    battleId: string;
    stateHash: string;
  };
  finalTick: number;
  entries: BattleTranscriptEntry[];
  checkpoints: BattleTranscriptCheckpoint[];
  finalHash: string;
}

export interface BattleTranscriptCheckpointResult extends BattleTranscriptCheckpoint {
  actualHash: string | null;
  match: boolean;
}

export interface BattleTranscriptReplayResult {
  match: boolean;
  balanceMismatch: boolean;
  initialMatch: boolean;
  expectedInitialHash: string;
  actualInitialHash: string;
  expectedFinalHash: string;
  actualFinalHash: string;
  checkpointResults: BattleTranscriptCheckpointResult[];
  executedTicks: number;
  resolved: boolean;
}

function makeArmy(
  id: ArmyId,
  clanId: ClanId,
  leaderId: OfficerId,
  originCastleId: CastleId,
  targetNodeId: MapNodeId,
  posNodeId: MapNodeId,
): Army {
  return {
    id,
    clanId,
    leaderId,
    deputyIds: [],
    soldiers: 1_500,
    initialTroops: 1_500,
    food: 1_800,
    morale: 86,
    status: 'holding',
    mission: 'conquer',
    originCastleId,
    targetNodeId,
    path: [posNodeId],
    pathCursor: 0,
    posNodeId,
    edgeProgressDays: 0,
    edgeCostDays: 0,
    battleId: null,
    siegeId: null,
    autoReturn: true,
    corpsId: null,
    pursuitEligibleArmyIds: [],
  };
}

function deployDuelArmy(
  state: GameState,
  clanId: ClanId,
  leaderId: OfficerId,
  originCastleId: CastleId,
  targetNodeId: MapNodeId,
): Army {
  const id = nextId(state, 'army');
  const army = makeArmy(id, clanId, leaderId, originCastleId, targetNodeId, CASTLE_A2);
  state.armies[id] = army;
  const officer = state.officers[leaderId]!;
  officer.armyId = id;
  officer.locationCastleId = null;
  const origin = state.castles[originCastleId]!;
  origin.soldiers -= army.soldiers;
  origin.food -= army.food;
  return army;
}

/** Rebuild the fixed pre-tick battle state solely from scenario seed and layout id. */
export function buildBattleTranscriptInitialState(
  seed: number,
  layoutId: string,
): { state: GameState; battleId: BattleId } {
  if (layoutId !== MINI_DUEL_LAYOUT_ID)
    throw new Error(`unknown battle transcript layout: ${layoutId}`);
  const state = buildMiniState({ seed });
  const attacker = deployDuelArmy(state, CLAN_ALPHA, OFF_ALPHA_LORD, CASTLE_A1, CASTLE_B1);
  const defender = deployDuelArmy(state, CLAN_BETA, OFF_BETA_LORD, CASTLE_B1, CASTLE_A1);
  startFieldCombat(state, CASTLE_A2, [attacker.id], [defender.id]);
  const combat = Object.values(state.fieldCombats)[0];
  if (!combat) throw new Error('mini duel failed to create its field combat');
  applyStartKassen(
    state,
    { type: 'startKassen', clanId: CLAN_ALPHA, fieldCombatId: combat.id },
    () => undefined,
  );
  const battleId = Object.keys(state.battles)[0] as BattleId | undefined;
  if (!battleId) throw new Error('mini duel failed to create its battle');
  return { state, battleId };
}

function assertTranscript(log: Readonly<BattleTranscriptFile>): void {
  if (log.formatVersion !== BATTLE_TRANSCRIPT_FORMAT_VERSION) {
    throw new Error(`unsupported battle transcript format: ${String(log.formatVersion)}`);
  }
  if (!Number.isInteger(log.seed)) throw new Error('battle transcript seed must be an integer');
  if (!Number.isInteger(log.finalTick) || log.finalTick < 1) {
    throw new Error('battle transcript finalTick must be a positive integer');
  }

  let previousTick = 0;
  let expectedSeq = 0;
  for (const entry of log.entries) {
    if (!Number.isInteger(entry.tick) || entry.tick < 1 || entry.tick > log.finalTick) {
      throw new Error(`battle transcript entry tick out of range: ${String(entry.tick)}`);
    }
    if (entry.tick !== previousTick) {
      if (entry.tick < previousTick) throw new Error('battle transcript entries must be ordered');
      previousTick = entry.tick;
      expectedSeq = 0;
    }
    if (entry.seq !== expectedSeq) {
      throw new Error(
        `battle transcript tick ${String(entry.tick)} expected seq ${String(expectedSeq)}`,
      );
    }
    expectedSeq += 1;
  }

  let previousCheckpoint = 0;
  for (const checkpoint of log.checkpoints) {
    if (
      !Number.isInteger(checkpoint.tick) ||
      checkpoint.tick <= previousCheckpoint ||
      checkpoint.tick > log.finalTick
    ) {
      throw new Error('battle transcript checkpoints must be strictly increasing and in range');
    }
    previousCheckpoint = checkpoint.tick;
  }
}

export function replayBattleTranscript(
  log: Readonly<BattleTranscriptFile>,
): BattleTranscriptReplayResult {
  assertTranscript(log);
  const { state, battleId } = buildBattleTranscriptInitialState(log.seed, log.initial.layoutId);
  const actualInitialHash = stateHash(state);
  const initialMatch =
    battleId === log.initial.battleId && actualInitialHash === log.initial.stateHash;
  const checkpointHashes = new Map<number, string>();
  let entryIndex = 0;
  let executedTicks = 0;

  for (let tick = 1; tick <= log.finalTick; tick += 1) {
    const orders: BattleCommand[] = [];
    while (log.entries[entryIndex]?.tick === tick) {
      orders.push(structuredClone(log.entries[entryIndex]!.order));
      entryIndex += 1;
    }
    const result = advanceBattleTick(state, battleId, orders);
    executedTicks = tick;
    if (log.checkpoints.some((checkpoint) => checkpoint.tick === tick)) {
      checkpointHashes.set(tick, stateHash(state));
    }
    if (result.resolved) break;
  }

  const checkpointResults = log.checkpoints.map((checkpoint) => {
    const actualHash = checkpointHashes.get(checkpoint.tick) ?? null;
    return { ...checkpoint, actualHash, match: actualHash === checkpoint.hash };
  });
  const actualFinalHash = stateHash(state);
  const resolved = state.battles[battleId]?.result != null;
  const balanceMismatch = log.balanceHash !== balanceHash();
  const match =
    !balanceMismatch &&
    initialMatch &&
    executedTicks === log.finalTick &&
    entryIndex === log.entries.length &&
    checkpointResults.every((checkpoint) => checkpoint.match) &&
    actualFinalHash === log.finalHash;

  return {
    match,
    balanceMismatch,
    initialMatch,
    expectedInitialHash: log.initial.stateHash,
    actualInitialHash,
    expectedFinalHash: log.finalHash,
    actualFinalHash,
    checkpointResults,
    executedTicks,
    resolved,
  };
}
