import type { GameState } from '@core/state/gameState';
import type { CommandEnvelope } from '@core/commands/types';
import type { TickResult } from '@core/systems';
import type { EventBinding, EventDef } from '@core/systems/events/types';
import type { ClanId, EventId } from '@core/state/ids';

export interface ExecutedDay {
  state: GameState;
  result: TickResult;
  fired: { eventId: EventId; binding: EventBinding; clanIds: ClanId[] }[];
  backend: 'rust-wasm';
  computeMs: number;
}

export interface DayExecutor {
  readonly epoch: number;
  waitReady(): Promise<{ epoch: number; backend: 'rust-wasm'; engineAbi: number }>;
  subscribeInitializationFailure(listener: (error: Error, epoch: number) => void): () => void;
  getDiagnostics?(): {
    epoch: number;
    backendReady: boolean;
    stale: number;
    backend: string | null;
  };
  execute(
    state: GameState,
    commands: readonly CommandEnvelope[],
    events: readonly EventDef[] | null,
    consumedAiOrders?: number,
  ): Promise<ExecutedDay>;
  cancelPending(reason: string): void;
  resetSession?(reason: string): void;
}
