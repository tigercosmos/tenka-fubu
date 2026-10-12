import {
  assertRenderNumericArtifact,
  assertRenderNumericVariant,
  selectRenderNumericArtifact,
  type RenderNumericArtifact,
} from '../../wasm/renderNumericVariant';
import { advanceDay } from '../../core/systems';
import { envelopeAuthority } from '../../core/commands/authority';
import { canonicalStringify } from '../../core/state/serialize';
import type { GameState } from '../../core/state/gameState';
import { reconcileSnapshot } from './reconcile';
import { createRuntimeEventEngine } from '../../core/systems/events/runtime';
import {
  installRustPathfinding,
  isRustPathfindingReady,
  rustPathfindingImports,
} from '../../core/acceleration/pathfindingKernel';
import type {
  SimulationWorkerReply,
  SimulationWorkerRequest,
  SimulationWorkerMessage,
  WorkerReadyReply,
  WorkerInitializationError,
  WorkerFiredEvent,
} from './protocol';

export async function initializeRustBackend(artifact?: RenderNumericArtifact): Promise<number> {
  const selected =
    artifact === undefined ? selectRenderNumericArtifact(import.meta.env.BASE_URL) : artifact;
  assertRenderNumericArtifact(selected);
  const response = await fetch(new URL(selected.url, globalThis.location.origin));
  if (!response.ok) throw new Error(`Rust simulation module load failed: HTTP ${response.status}`);
  const wasm = await WebAssembly.instantiate(
    await response.arrayBuffer(),
    rustPathfindingImports(),
  );
  assertRenderNumericVariant(wasm.instance.exports, selected.variant);
  installRustPathfinding(wasm.instance.exports);
  if (!isRustPathfindingReady())
    throw new Error('Rust simulation module did not install its pathfinding kernel');
  return (wasm.instance.exports.engine_abi_version as () => number)();
}

/** Each message owns a detached snapshot; all messages execute serially in one worker. */
export function createWorkerExecutor(
  initializeBackend: () => Promise<number> = initializeRustBackend,
) {
  let initialization: Promise<number> | null = null;
  const initializeOnce = () => {
    initialization ??= Promise.resolve()
      .then(initializeBackend)
      .then((engineAbi) => {
        if (engineAbi !== 1 || !isRustPathfindingReady())
          throw new Error('Rust simulation initialization did not validate its actual engine ABI');
        return engineAbi;
      });
    return initialization;
  };
  let serial = Promise.resolve();
  let catalogKey: string | null = null;
  let cachedEngine: ReturnType<typeof createRuntimeEventEngine> | null = null;
  const sessions = new Map<number, { requestId: number; stateVersion: number; state: GameState }>();
  const execute = (request: SimulationWorkerRequest): Promise<SimulationWorkerReply> => {
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
        const consumedAiOrders = request.consumedAiOrders ?? 0;
        if (
          !Number.isSafeInteger(consumedAiOrders) ||
          consumedAiOrders < 0 ||
          consumedAiOrders > request.state.ai.pendingOrders.length ||
          consumedAiOrders > request.commands.length
        )
          throw new Error('Invalid consumed AI order count');
        for (let index = 0; index < consumedAiOrders; index++) {
          const order = request.state.ai.pendingOrders[index]!;
          const envelope = request.commands[request.commands.length - consumedAiOrders + index]!;
          if (
            canonicalStringify(order.command) !== canonicalStringify(envelope.command) ||
            canonicalStringify(order.authority) !== canonicalStringify(envelopeAuthority(envelope))
          )
            throw new Error('Consumed AI reservation does not match its command envelope');
        }
        await initializeOnce();
        // Preserve worker-owned identity so pure-core WeakMap caches follow the same lifecycle as synchronous days.
        const state = previous?.state ?? request.state;
        if (previous) reconcileSnapshot(state, request.state);
        state.ai.pendingOrders.splice(0, consumedAiOrders);
        const fired: WorkerFiredEvent[] = [];
        const nextCatalogKey =
          request.eventDefs === null ? null : JSON.stringify(request.eventDefs);
        if (nextCatalogKey !== catalogKey) {
          cachedEngine =
            request.eventDefs === null ? null : createRuntimeEventEngine(request.eventDefs);
          catalogKey = nextCatalogKey;
        }
        const eventEngine = cachedEngine;
        const unsubscribe = eventEngine?.subscribeFired(({ def, binding, clanIds }) => {
          fired.push(
            structuredClone({
              eventId: def.id,
              binding,
              clanIds: [...clanIds],
            }),
          );
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
            state,
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
  return Object.assign(execute, {
    async initialize(epoch: number): Promise<WorkerReadyReply> {
      if (!Number.isSafeInteger(epoch) || epoch <= 0)
        throw new Error('Invalid simulation initialization epoch');
      const engineAbi = await initializeOnce();
      return { kind: 'ready', epoch, backend: 'rust-wasm', engineAbi };
    },
  });
}

// The export is also exercised by Node tests; only a real worker installs its message handler.
if (
  typeof document === 'undefined' &&
  typeof globalThis.postMessage === 'function' &&
  typeof globalThis.addEventListener === 'function'
) {
  const execute = createWorkerExecutor();
  globalThis.addEventListener('message', (event: MessageEvent<SimulationWorkerMessage>) => {
    const request = event.data;
    if (request?.kind === 'initialize') {
      void execute.initialize(request.epoch).then(
        (reply) => globalThis.postMessage(reply),
        (error: unknown) => {
          const actual = error instanceof Error ? error : new Error(String(error));
          const reply: WorkerInitializationError = {
            kind: 'initializationError',
            epoch: request.epoch,
            error: {
              name: actual.name,
              message: actual.message,
              ...(actual.stack ? { stack: actual.stack } : {}),
            },
          };
          globalThis.postMessage(reply);
        },
      );
    } else void execute(request).then((reply) => globalThis.postMessage(reply));
  });
}
