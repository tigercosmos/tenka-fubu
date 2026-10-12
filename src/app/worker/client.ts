import type { CommandEnvelope } from '../../core/commands/types';
import type { GameState } from '../../core/state/gameState';
import type { EventDef } from '../../core/systems/events/types';
import type {
  SimulationWorkerMessageReply,
  SimulationWorkerRequest,
  SimulationWorkerResult,
  WorkerReadyReply,
} from './protocol';

let nextEpoch = 1;
type InitializationState = 'initializing' | 'ready' | 'failed' | 'destroyed';
type FailureListener = (error: Error, epoch: number) => void;
export interface SimulationWorkerDiagnostics {
  epoch: number;
  requests: number;
  completed: number;
  stale: number;
  cancelled: number;
  pending: boolean;
  backendReady: boolean;
  backend: 'rust-wasm' | null;
  initializationState: InitializationState;
}
export interface SimulationWorkerClient {
  readonly epoch: number;
  waitReady(): Promise<WorkerReadyReply>;
  subscribeInitializationFailure(listener: FailureListener): () => void;
  execute(
    game: GameState,
    commands: readonly CommandEnvelope[],
    eventDefs: readonly EventDef[] | null,
    consumedAiOrders?: number,
  ): Promise<SimulationWorkerResult>;
  cancelPending(reason: string): void;
  resetSession(reason: string): void;
  getDiagnostics(): SimulationWorkerDiagnostics;
  destroy(): void;
}
export function createSimulationWorkerClient(
  options: { workerFactory?: () => Worker; timeoutMs?: number; readyTimeoutMs?: number } = {},
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
  let initializationState: InitializationState = 'initializing';
  let failure: { error: Error; epoch: number } | null = null;
  const failureListeners = new Set<FailureListener>();
  let readiness: {
    epoch: number;
    promise: Promise<WorkerReadyReply>;
    resolve: (reply: WorkerReadyReply) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  let pending: {
    request: SimulationWorkerRequest;
    resolve: (result: SimulationWorkerResult) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  let removeListeners = () => {};
  const clearPending = () => {
    const current = pending;
    if (current) clearTimeout(current.timer);
    pending = null;
    return current;
  };
  const cancelReadiness = (reason: string) => {
    if (readiness) {
      clearTimeout(readiness.timer);
      if (initializationState === 'initializing') readiness.reject(new Error(reason));
    }
    readiness = null;
    backendReady = false;
  };
  const failInitialization = (error: Error) => {
    if (destroyed || failure?.epoch === epoch) return;
    const failedEpoch = epoch;
    failure = { error, epoch: failedEpoch };
    initializationState = 'failed';
    backendReady = false;
    if (readiness) {
      clearTimeout(readiness.timer);
      readiness.reject(error);
    }
    clearPending()?.reject(error);
    for (const listener of [...failureListeners]) listener(error, failedEpoch);
  };
  const terminate = () => {
    removeListeners();
    worker.terminate();
  };
  const listen = () => {
    const ownedWorker = worker;
    const ownedEpoch = epoch;
    const owns = () => !destroyed && worker === ownedWorker && epoch === ownedEpoch;
    const onMessage = (event: MessageEvent<SimulationWorkerMessageReply>) => {
      if (!owns()) {
        stale++;
        return;
      }
      const reply = event.data;
      if (reply?.kind === 'ready' || reply?.kind === 'initializationError') {
        if (!Number.isSafeInteger(reply.epoch) || reply.epoch <= 0) {
          failInitialization(
            new Error('Simulation worker returned an invalid initialization epoch'),
          );
          return;
        }
        if (reply.epoch !== ownedEpoch || initializationState !== 'initializing') {
          stale++;
          return;
        }
        if (reply.kind === 'initializationError') {
          if (
            typeof reply.error?.name !== 'string' ||
            typeof reply.error.message !== 'string' ||
            (reply.error.stack !== undefined && typeof reply.error.stack !== 'string')
          ) {
            failInitialization(
              new Error('Simulation worker returned an invalid initialization error'),
            );
          } else {
            const error = new Error(reply.error.message);
            error.name = reply.error.name;
            if (reply.error.stack) error.stack = reply.error.stack;
            failInitialization(error);
          }
        } else if (reply.backend !== 'rust-wasm' || reply.engineAbi !== 1) {
          failInitialization(new Error('Simulation worker returned invalid Rust readiness'));
        } else {
          backendReady = true;
          initializationState = 'ready';
          if (readiness) {
            clearTimeout(readiness.timer);
            readiness.resolve(reply);
          }
        }
        return;
      }
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
      if (!backendReady) {
        failInitialization(new Error('Simulation worker did not confirm Rust readiness'));
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
        completed++;
        reply.result.state = reply.state;
        current.resolve(reply);
      }
    };
    const onFailure = (event: Event) => {
      if (!owns()) return;
      failInitialization(
        new Error(
          event instanceof ErrorEvent
            ? event.message
            : 'Simulation worker message could not be decoded',
        ),
      );
      if (owns()) client.destroy();
    };
    ownedWorker.addEventListener('message', onMessage);
    ownedWorker.addEventListener('error', onFailure);
    ownedWorker.addEventListener('messageerror', onFailure);
    removeListeners = () => {
      ownedWorker.removeEventListener('message', onMessage);
      ownedWorker.removeEventListener('error', onFailure);
      ownedWorker.removeEventListener('messageerror', onFailure);
    };
  };
  const startInitialization = () => {
    const ownedWorker = worker;
    const ownedEpoch = epoch;
    let resolve!: (reply: WorkerReadyReply) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<WorkerReadyReply>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    // Observe lifecycle rejection immediately, while preserving the rejected promise for callers.
    void promise.catch(() => {});
    const timer = setTimeout(
      () => {
        if (!destroyed && worker === ownedWorker && epoch === ownedEpoch) {
          failInitialization(new Error('Simulation worker initialization timed out'));
          if (worker === ownedWorker && epoch === ownedEpoch) client.destroy();
        }
      },
      options.readyTimeoutMs ?? options.timeoutMs ?? 120_000,
    );
    readiness = { epoch: ownedEpoch, promise, resolve, reject, timer };
    try {
      ownedWorker.postMessage({ kind: 'initialize', epoch: ownedEpoch });
    } catch (error) {
      failInitialization(error instanceof Error ? error : new Error(String(error)));
      if (worker === ownedWorker && epoch === ownedEpoch) client.destroy();
    }
  };
  const client: SimulationWorkerClient = {
    get epoch() {
      return epoch;
    },
    waitReady() {
      if (failure?.epoch === epoch) return Promise.reject(failure.error);
      if (destroyed || !readiness)
        return Promise.reject(new Error('Simulation worker has been destroyed'));
      const ownedWorker = worker;
      const ownedEpoch = epoch;
      return readiness.promise.then((reply) => {
        if (destroyed || worker !== ownedWorker || epoch !== ownedEpoch)
          throw new Error('Simulation worker initialization no longer owns the current epoch');
        if (failure?.epoch === ownedEpoch) throw failure.error;
        return reply;
      });
    },
    subscribeInitializationFailure(listener) {
      failureListeners.add(listener);
      if (failure?.epoch === epoch) listener(failure.error, failure.epoch);
      return () => {
        failureListeners.delete(listener);
      };
    },
    execute(game, commands, eventDefs, consumedAiOrders = 0) {
      if (destroyed) return Promise.reject(new Error('Simulation worker has been destroyed'));
      if (failure?.epoch === epoch) return Promise.reject(failure.error);
      if (pending) return Promise.reject(new Error('Simulation tick already in flight'));
      const request: SimulationWorkerRequest = {
        kind: 'tick',
        epoch,
        requestId: ++requestId,
        beforeStateVersion: game.meta.stateVersion,
        state: game,
        commands,
        eventDefs,
        consumedAiOrders,
      };
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
      client.resetSession(reason);
    },
    resetSession(reason) {
      if (destroyed) return;
      const current = clearPending();
      if (current) {
        current.reject(new Error(reason));
        cancelled++;
      }
      cancelReadiness(reason);
      terminate();
      epoch = nextEpoch++;
      initializationState = 'initializing';
      failure = null;
      try {
        worker = makeWorker();
        listen();
        startInitialization();
      } catch (error) {
        failInitialization(error instanceof Error ? error : new Error(String(error)));
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
        initializationState,
      };
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelReadiness('Simulation worker has been destroyed');
      if (initializationState !== 'failed') initializationState = 'destroyed';
      clearPending()?.reject(new Error('Simulation worker has been destroyed'));
      terminate();
      failureListeners.clear();
    },
  };
  listen();
  startInitialization();
  return client;
}
