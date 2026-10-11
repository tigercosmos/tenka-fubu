import type { Command, ValidationResult } from '../../commands/types';
import type { ExecutionAuthority } from '../../commands/authority';
import type { AiIntent } from '../../state/gameState';
import type { ArmyId, CastleId, ClanId, CorpsId, MapNodeId } from '../../state/ids';

/** Internal movement signal; not a report or persisted public GameEvent. */
export interface AiSignal {
  type: 'army.enteredTerritory';
  armyId: ArmyId;
  nodeId: MapNodeId;
  clanId: ClanId;
  ownerClanId: ClanId;
}

export type {
  AiPersona,
  AiClanState,
  AiState,
  AiIntent,
  AttackPlan,
  AttackPlanStage,
  CouncilPhase,
  ThreatCache,
  ThreatEntry,
} from '../../state/gameState';

/** Transient order for next-tick execution through the ordinary command pipeline. */
export interface AiOrder {
  command: Command;
  authority: ExecutionAuthority;
}

/** Decision modules may update AI bookkeeping, but all gameplay changes use this sink. */
export interface AiSink {
  canEnqueue?(command: Command, authority: ExecutionAuthority): ValidationResult;
  enqueue(command: Command, authority: ExecutionAuthority): ValidationResult;
  record(intent: AiIntent): void;
}

export interface AiScope {
  clanId: ClanId;
  corpsId: CorpsId | null;
  castleIds: readonly CastleId[];
  targetNodeId: MapNodeId | null;
}

export interface DifficultyMods {
  incomeMult: number;
  moraleBonus: number;
  councilTimes: number;
  coopMax: number;
}
