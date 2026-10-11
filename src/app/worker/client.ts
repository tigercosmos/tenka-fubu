import type { CommandEnvelope } from '../../core/commands/types';
import type { GameState } from '../../core/state/gameState';
import type { EventDef } from '../../core/systems/events/types';
import type {
  SimulationWorkerReply,
  SimulationWorkerRequest,
  SimulationWorkerResult,
} from './protocol';

let nextEpoch = 1;
export interface SimulationWorkerDiagnostics {
  epoch: number;
  requests: number;
  completed: number;
  stale: number;
  cancelled: number;
  pending: boolean;
  backendReady: boolean;
  backend: 'rust-wasm' | null;
}
export interface SimulationWorkerClient {
  readonly epoch: number;
  execute(
    game: GameState,
    commands: readonly CommandEnvelope[],
    eventDefs: readonly EventDef[] | null,
  ): Promise<SimulationWorkerResult>;
  cancelPending(reason: string): void;
  getDiagnostics(): SimulationWorkerDiagnostics;
  destroy(): void;
}
export function createSimulationWorkerClient(
  options: { workerFactory?: () => Worker; timeoutMs?: number } = {},
): SimulationWorkerClient {
  let epoch = nextEpoch++;
  const makeWorker =
    options.workerFactory ??
    (() => new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' }));
  let worker = makeWorker();
  let destroyed = false;
  let requestId = 0;
  let requests = 0,
    completed = 0,
    stale = 0,
    cancelled = 0;
  let backendReady = false;
  let pending: {
    request: SimulationWorkerRequest;
    resolve: (result: SimulationWorkerResult) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  const clearPending = () => {
    const current = pending;
    if (current) clearTimeout(current.timer);
    pending = null;
    return current;
  };
  const onMessage = (event: MessageEvent<SimulationWorkerReply>) => {
    const reply = event.data;
    const current = pending;
    if (
      !reply ||
      !current ||
      reply.epoch !== epoch ||
      reply.requestId !== current.request.requestId
    ) {
      stale++;
      return;
    }
    clearPending();
    if (reply.beforeStateVersion !== current.request.beforeStateVersion) {
      current.reject(new Error('Simulation worker returned a stale state version'));
    } else if (reply.kind === 'error') {
      const error = new Error(reply.error.message);
      error.name = reply.error.name;
      if (reply.error.stack) error.stack = reply.error.stack;
      current.reject(error);
    } else if (
      reply.backend !== 'rust-wasm' ||
      reply.state.meta.stateVersion !== current.request.beforeStateVersion + 1
    ) {
      current.reject(new Error('Simulation worker returned an invalid tick result'));
    } else {
      backendReady = true;
      completed++;
      reply.result.state = reply.state;
      current.resolve(reply);
    }
  };
  const onFailure = (event: Event) => {
    const current = clearPending();
    current?.reject(
      new Error(
        event instanceof ErrorEvent
          ? event.message
          : 'Simulation worker message could not be decoded',
      ),
    );
    client.destroy();
  };
  const listen = () => {
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onFailure);
    worker.addEventListener('messageerror', onFailure);
  };
  const terminate = () => {
    worker.removeEventListener('message', onMessage);
    worker.removeEventListener('error', onFailure);
    worker.removeEventListener('messageerror', onFailure);
    worker.terminate();
  };
  const client: SimulationWorkerClient = {
    get epoch() {
      return epoch;
    },
    execute(game, commands, eventDefs) {
      if (destroyed) return Promise.reject(new Error('Simulation worker has been destroyed'));
      if (pending) return Promise.reject(new Error('Simulation tick already in flight'));
      const request: SimulationWorkerRequest = structuredClone({
        kind: 'tick',
        epoch,
        requestId: ++requestId,
        beforeStateVersion: game.meta.stateVersion,
        state: game,
        commands,
        eventDefs,
      });
      requests++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          clearPending()?.reject(new Error('Simulation worker timed out'));
          client.destroy();
        }, options.timeoutMs ?? 120_000);
        pending = { request, resolve, reject, timer };
        try {
          worker.postMessage(request);
        } catch (error) {
          clearPending();
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
    },
    cancelPending(reason) {
      if (destroyed || !pending) return;
      clearPending()?.reject(new Error(reason));
      cancelled++;
      terminate();
      epoch = nextEpoch++;
      backendReady = false;
      try {
        worker = makeWorker();
        listen();
      } catch (error) {
        destroyed = true;
        throw error;
      }
    },
    getDiagnostics() {
      return {
        epoch,
        requests,
        completed,
        stale,
        cancelled,
        pending: pending !== null,
        backendReady,
        backend: backendReady ? 'rust-wasm' : null,
      };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearPending()?.reject(new Error('Simulation worker has been destroyed'));
      terminate();
    },
  };
  listen();
  return client;
}
