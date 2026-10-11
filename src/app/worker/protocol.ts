import type { CommandEnvelope } from '../../core/commands/types';
import type { GameState } from '../../core/state/gameState';
import type { ClanId, EventId } from '../../core/state/ids';
import type { TickResult } from '../../core/systems';
import type { EventBinding, EventDef } from '../../core/systems/events/types';

export interface SimulationWorkerRequest {
  kind: 'tick';
  epoch: number;
  requestId: number;
  beforeStateVersion: number;
  state: GameState;
  commands: readonly CommandEnvelope[];
  eventDefs: readonly EventDef[] | null;
  consumedAiOrders?: number;
}
export interface WorkerFiredEvent {
  eventId: EventId;
  binding: EventBinding;
  clanIds: ClanId[];
}
export interface SimulationWorkerResult {
  epoch: number;
  requestId: number;
  beforeStateVersion: number;
  state: GameState;
  result: TickResult;
  fired: WorkerFiredEvent[];
  backend: 'rust-wasm';
  computeMs: number;
}
export type SimulationWorkerReply =
  | ({ kind: 'complete' } & SimulationWorkerResult)
  | {
      kind: 'error';
      epoch: number;
      requestId: number;
      beforeStateVersion: number;
      error: { name: string; message: string; stack?: string };
    };
