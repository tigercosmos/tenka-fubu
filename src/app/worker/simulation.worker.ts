import { advanceDay } from '../../core/systems';
import { createRuntimeEventEngine } from '../../core/systems/events/runtime';
import {
  installRustPathfinding,
  isRustPathfindingReady,
  rustPathfindingImports,
} from '../../core/acceleration/pathfindingKernel';
import type { SimulationWorkerReply, SimulationWorkerRequest, WorkerFiredEvent } from './protocol';

async function initializeRustBackend(): Promise<void> {
  if (isRustPathfindingReady()) return;
  const response = await fetch(
    new URL(`${import.meta.env.BASE_URL}wasm/tenka_engine.wasm`, globalThis.location.origin),
  );
  if (!response.ok) throw new Error(`Rust simulation module load failed: HTTP ${response.status}`);
  const wasm = await WebAssembly.instantiate(
    await response.arrayBuffer(),
    rustPathfindingImports(),
  );
  installRustPathfinding(wasm.instance.exports);
  if (!isRustPathfindingReady())
    throw new Error('Rust simulation module did not install its pathfinding kernel');
}

/** Each message owns a detached snapshot; all messages execute serially in one worker. */
export function createWorkerExecutor(
  initializeBackend: () => Promise<void> = initializeRustBackend,
) {
  let initialization: Promise<void> | null = null;
  let serial = Promise.resolve();
  const sessions = new Map<number, { requestId: number; stateVersion: number }>();
  return (request: SimulationWorkerRequest): Promise<SimulationWorkerReply> => {
    const execute = async (): Promise<SimulationWorkerReply> => {
      try {
        const previous = sessions.get(request.epoch);
        if (
          request.kind !== 'tick' ||
          !Number.isSafeInteger(request.epoch) ||
          request.epoch <= 0 ||
          !Number.isSafeInteger(request.requestId) ||
          request.requestId <= 0 ||
          !Number.isSafeInteger(request.beforeStateVersion) ||
          request.beforeStateVersion < 0 ||
          request.beforeStateVersion !== request.state.meta.stateVersion ||
          (previous &&
            (request.requestId <= previous.requestId ||
              request.beforeStateVersion < previous.stateVersion))
        )
          throw new Error('Stale or invalid simulation worker request');
        initialization ??= initializeBackend();
        await initialization;
        const state = structuredClone(request.state);
        const fired: WorkerFiredEvent[] = [];
        const eventEngine =
          request.eventDefs === null ? null : createRuntimeEventEngine(request.eventDefs);
        const unsubscribe = eventEngine?.subscribeFired(({ def, binding, clanIds }) => {
          fired.push(structuredClone({ eventId: def.id, binding, clanIds: [...clanIds] }));
        });
        const started = performance.now();
        try {
          const result = advanceDay(state, request.commands, {
            now: () => performance.now(),
            ...(eventEngine ? { eventEngine } : {}),
          });
          sessions.set(request.epoch, {
            requestId: request.requestId,
            stateVersion: state.meta.stateVersion,
          });
          return {
            kind: 'complete',
            epoch: request.epoch,
            requestId: request.requestId,
            beforeStateVersion: request.beforeStateVersion,
            state,
            result,
            fired,
            backend: 'rust-wasm',
            computeMs: performance.now() - started,
          };
        } finally {
          unsubscribe?.();
        }
      } catch (error) {
        const actual = error instanceof Error ? error : new Error(String(error));
        return {
          kind: 'error',
          epoch: request.epoch,
          requestId: request.requestId,
          beforeStateVersion: request.beforeStateVersion,
          error: {
            name: actual.name,
            message: actual.message,
            ...(actual.stack ? { stack: actual.stack } : {}),
          },
        };
      }
    };
    const next = serial.then(execute);
    serial = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };
}

// The export is also exercised by Node tests; only a real worker installs its message handler.
if (
  typeof document === 'undefined' &&
  typeof globalThis.postMessage === 'function' &&
  typeof globalThis.addEventListener === 'function'
) {
  const execute = createWorkerExecutor();
  globalThis.addEventListener('message', (event: MessageEvent<SimulationWorkerRequest>) => {
    void execute(event.data).then((reply) => globalThis.postMessage(reply));
  });
}
