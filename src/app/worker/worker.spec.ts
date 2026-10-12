import { readFileSync } from 'node:fs';
import { describe, expect, it, afterEach, vi } from 'vitest';
import {
  buildTinyState,
  CLAN_BETA,
  CLAN_ALPHA,
  CASTLE_A1,
  OFF_ALPHA_BUSHO,
} from '../../../tests/fixtures/tiny';
import { advanceDay } from '../../core/systems';
import { createRuntimeEventEngine } from '../../core/systems/events/runtime';
import { dayToCalendar } from '../../core/systems/time';
import {
  installRustPathfinding,
  clearRustPathfinding,
  rustPathfindingImports,
} from '../../core/acceleration/pathfindingKernel';
import type { CommandEnvelope } from '../../core/commands/types';
import type { EventId } from '../../core/state/ids';
import type { EventDef } from '../../core/systems/events/types';
import { createWorkerExecutor } from './simulation.worker';
import { createSimulationWorkerClient } from './client';
import { reconcileWorkerTick, reconcileSnapshot } from './reconcile';
import type {
  SimulationWorkerReply,
  SimulationWorkerRequest,
  SimulationWorkerResult,
  SimulationWorkerMessage,
  SimulationWorkerMessageReply,
  WorkerInitializeRequest,
} from './protocol';

async function initializeRust() {
  const wasm = await WebAssembly.instantiate(
    readFileSync('public/wasm/tenka_engine.wasm'),
    rustPathfindingImports(),
  );
  installRustPathfinding(wasm.instance.exports);
  return (wasm.instance.exports.engine_abi_version as () => number)();
}
function eventDefinition(): EventDef {
  return {
    id: 'evt.worker' as EventId,
    kind: 'historical',
    priority: 20,
    target: 'fixed',
    ownerCandidates: [CLAN_ALPHA],
    cutscene: { title: 'Worker event', body: 'Worker event', monClanId: CLAN_ALPHA },
    trigger: {
      from: { year: 1560, month: 1, day: 1 },
      to: { year: 1561, month: 12, day: 30 },
      check: 'monthStart',
      hooks: [],
      conditions: [],
      probability: 1,
      once: true,
      cooldownDays: 0,
      cooldownKey: null,
    },
    effects: [{ op: 'addMerit', officerId: OFF_ALPHA_BUSHO, amount: 123 }],
    choices: [],
  };
}
function complete(request: SimulationWorkerRequest): SimulationWorkerReply {
  const state = structuredClone(request.state);
  const result = advanceDay(state, request.commands);
  return {
    kind: 'complete',
    epoch: request.epoch,
    requestId: request.requestId,
    beforeStateVersion: request.beforeStateVersion,
    state,
    result,
    fired: [],
    backend: 'rust-wasm',
    computeMs: 1,
  };
}
class FakeWorker extends EventTarget {
  sent: SimulationWorkerRequest[] = [];
  initializations: WorkerInitializeRequest[] = [];
  terminated = false;
  constructor(readonly autoReady = true) {
    super();
  }
  postMessage(request: SimulationWorkerMessage) {
    if (request.kind === 'initialize') {
      this.initializations.push(structuredClone(request));
      if (this.autoReady) this.ready();
    } else this.sent.push(structuredClone(request));
  }
  ready() {
    this.reply({
      kind: 'ready',
      epoch: this.initializations.at(-1)!.epoch,
      backend: 'rust-wasm',
      engineAbi: 1,
    });
  }
  terminate() {
    this.terminated = true;
  }
  reply(reply: SimulationWorkerMessageReply) {
    this.dispatchEvent(new MessageEvent('message', { data: reply }));
  }
}
afterEach(() => {
  clearRustPathfinding();
  vi.useRealTimers();
});

describe('simulation worker execution', () => {
  it('executes real commands/events with full state and RNG identical to synchronous core', async () => {
    const initial = buildTinyState();
    initial.time = { day: 29, ...dayToCalendar(29) };
    const commands: CommandEnvelope[] = [
      {
        seq: 1,
        issuedDay: 29,
        command: {
          type: 'setConscriptPolicy',
          clanId: CLAN_ALPHA,
          castleId: CASTLE_A1,
          policy: 'high',
        },
      },
    ];
    const defs = [eventDefinition()];
    const expected = structuredClone(initial);
    const sync = advanceDay(expected, commands, { eventEngine: createRuntimeEventEngine(defs) });
    const execute = createWorkerExecutor(initializeRust);
    const reply = await execute({
      kind: 'tick',
      epoch: 1,
      requestId: 1,
      beforeStateVersion: 0,
      state: structuredClone(initial),
      commands,
      eventDefs: defs,
    });
    expect(reply.kind).toBe('complete');
    if (reply.kind !== 'complete') throw new Error(reply.error.message);
    expect(reply.backend).toBe('rust-wasm');
    expect(reply.state).toEqual(expected);
    expect(reply.result.appliedCommands).toEqual(sync.appliedCommands);
    expect(reply.result.events).toEqual(sync.events);
    expect(reply.result.state).toBe(reply.state);
    expect(reply.fired).toEqual([
      {
        eventId: defs[0]!.id,
        binding: { clanId: CLAN_ALPHA, castleId: null, districtId: null },
        clanIds: [CLAN_ALPHA],
      },
    ]);
    expect(initial.meta.stateVersion).toBe(0);
    expect(initial.time.day).toBe(29);
    expect(initial.castles[CASTLE_A1]!.conscriptPolicy).not.toBe('high');
  });
  it('rejects a stale same-day request instead of applying duplicate commands', async () => {
    const execute = createWorkerExecutor(initializeRust);
    const request: SimulationWorkerRequest = {
      kind: 'tick',
      epoch: 5,
      requestId: 1,
      beforeStateVersion: 0,
      state: buildTinyState(),
      commands: [],
      eventDefs: null,
    };
    const [first, duplicate] = await Promise.all([
      execute(request),
      execute({ ...request, requestId: 2 }),
    ]);
    expect(first.kind).toBe('complete');
    expect(duplicate.kind).toBe('error');
    if (duplicate.kind === 'error') expect(duplicate.error.message).toMatch(/Stale/);
  });
  it('surfaces WASM initialization failure with no synchronous fallback or state mutation', async () => {
    const initial = buildTinyState();
    const before = structuredClone(initial);
    const execute = createWorkerExecutor(() => Promise.reject(new Error('WASM fetch failed')));
    const reply = await execute({
      kind: 'tick',
      epoch: 1,
      requestId: 1,
      beforeStateVersion: 0,
      state: structuredClone(initial),
      commands: [],
      eventDefs: null,
    });
    expect(reply.kind).toBe('error');
    if (reply.kind === 'error') expect(reply.error.message).toBe('WASM fetch failed');
    expect(initial).toEqual(before);
  });
});

describe('worker client lifecycle and reconciliation', () => {
  it('detaches snapshots, rejects overlap and ignores a stale response before accepting the current reply', async () => {
    const worker = new FakeWorker();
    const client = createSimulationWorkerClient({
      workerFactory: () => worker as unknown as Worker,
    });
    const game = buildTinyState();
    const promise = client.execute(game, [], null);
    game.clans[CLAN_ALPHA]!.gold++;
    expect(worker.sent[0]!.state.clans[CLAN_ALPHA]!.gold).toBe(game.clans[CLAN_ALPHA]!.gold - 1);
    await expect(client.execute(game, [], null)).rejects.toThrow(/in flight/);
    worker.reply({ ...complete(worker.sent[0]!), requestId: 99 });
    expect(client.getDiagnostics().pending).toBe(true);
    worker.reply(complete(worker.sent[0]!));
    const result = await promise;
    expect(result.result.state).toBe(result.state);
    expect(client.getDiagnostics()).toMatchObject({
      requests: 1,
      completed: 1,
      stale: 1,
      pending: false,
      backendReady: true,
      backend: 'rust-wasm',
    });
    client.destroy();
    expect(worker.terminated).toBe(true);
  });
  it('cancels an uncommitted tick, replaces worker/epoch and can execute the unchanged main snapshot', async () => {
    const workers: FakeWorker[] = [];
    const client = createSimulationWorkerClient({
      workerFactory: () => {
        const w = new FakeWorker();
        workers.push(w);
        return w as unknown as Worker;
      },
    });
    const game = buildTinyState();
    const oldEpoch = client.epoch;
    const first = client.execute(game, [], null);
    const rejection = expect(first).rejects.toThrow('save cancelled tick');
    client.cancelPending('save cancelled tick');
    await rejection;
    expect(workers[0]!.terminated).toBe(true);
    expect(client.epoch).not.toBe(oldEpoch);
    expect(game.meta.stateVersion).toBe(0);
    const second = client.execute(game, [], null);
    workers[1]!.reply(complete(workers[1]!.sent[0]!));
    expect((await second).beforeStateVersion).toBe(0);
    expect(client.getDiagnostics().cancelled).toBe(1);
    client.destroy();
  });
  it('destroy rejects pending work and later execution; timeouts terminate the worker', async () => {
    vi.useFakeTimers();
    const worker = new FakeWorker();
    const client = createSimulationWorkerClient({
      workerFactory: () => worker as unknown as Worker,
      timeoutMs: 10,
    });
    const promise = client.execute(buildTinyState(), [], null);
    const rejection = expect(promise).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(11);
    await rejection;
    expect(worker.terminated).toBe(true);
    await expect(client.execute(buildTinyState(), [], null)).rejects.toThrow('destroyed');
    const other = new FakeWorker();
    const next = createSimulationWorkerClient({ workerFactory: () => other as unknown as Worker });
    const waiting = next.execute(buildTinyState(), [], null);
    const destroyed = expect(waiting).rejects.toThrow('destroyed');
    next.destroy();
    await destroyed;
  });
  it('preserves surviving identities and refuses stale session/version results before mutation', () => {
    const game = buildTinyState(),
      castle = game.castles[CASTLE_A1]!,
      clan = game.clans[CLAN_ALPHA]!,
      armies = game.armies;
    const request: SimulationWorkerRequest = {
      kind: 'tick',
      epoch: 10,
      requestId: 1,
      beforeStateVersion: 0,
      state: game,
      commands: [],
      eventDefs: null,
    };
    const response = complete(request) as SimulationWorkerResult;
    expect(reconcileWorkerTick(game, response, { epoch: 9, currentGame: game })).toBe(false);
    expect(game.meta.stateVersion).toBe(0);
    expect(reconcileWorkerTick(game, response, { epoch: 10, currentGame: buildTinyState() })).toBe(
      false,
    );
    expect(reconcileWorkerTick(game, response, { epoch: 10, currentGame: game })).toBe(true);
    expect(game.castles[CASTLE_A1]).toBe(castle);
    expect(game.clans[CLAN_ALPHA]).toBe(clan);
    expect(game.armies).toBe(armies);
    expect(response.result.state).toBe(game);
    expect(game).toEqual(response.state);
    expect(reconcileWorkerTick(game, response, { epoch: 10, currentGame: game })).toBe(false);
  });
});

it('reconciliation splits stale target aliases while preserving distinct cache totals', () => {
  const game = buildTinyState();
  const shared = { computedDay: 1, entries: [], totalThreat: 0 };
  game.ai.clans[CLAN_ALPHA]!.threatCache = shared;
  game.ai.clans[CLAN_BETA]!.threatCache = shared;
  const next = structuredClone(game);
  next.ai.clans[CLAN_ALPHA]!.threatCache!.totalThreat = 1;
  next.ai.clans[CLAN_BETA]!.threatCache = { computedDay: 2, entries: [], totalThreat: 2 };
  reconcileSnapshot(game, next);
  expect(game).toEqual(next);
  expect(game.ai.clans[CLAN_ALPHA]!.threatCache).toBe(shared);
  expect(game.ai.clans[CLAN_BETA]!.threatCache).not.toBe(shared);
});
it('reconciliation restores source aliases when formerly distinct caches become shared', () => {
  const game = buildTinyState();
  game.ai.clans[CLAN_ALPHA]!.threatCache = { computedDay: 1, entries: [], totalThreat: 1 };
  game.ai.clans[CLAN_BETA]!.threatCache = { computedDay: 2, entries: [], totalThreat: 2 };
  const next = structuredClone(game);
  next.ai.clans[CLAN_BETA]!.threatCache = next.ai.clans[CLAN_ALPHA]!.threatCache;
  reconcileSnapshot(game, next);
  expect(game).toEqual(next);
  expect(game.ai.clans[CLAN_ALPHA]!.threatCache).toBe(game.ai.clans[CLAN_BETA]!.threatCache);
});

it('idle session reset accepts a new game starting at version zero with a new epoch', async () => {
  const workers: FakeWorker[] = [];
  const client = createSimulationWorkerClient({
    workerFactory: () => {
      const worker = new FakeWorker(workers.length === 0);
      workers.push(worker);
      return worker as unknown as Worker;
    },
  });
  const first = client.execute(buildTinyState(), [], null);
  workers[0]!.reply(complete(workers[0]!.sent[0]!));
  await first;
  const epoch = client.epoch;
  client.resetSession('new-game');
  expect(client.epoch).not.toBe(epoch);
  expect(workers[0]!.terminated).toBe(true);
  expect(client.getDiagnostics().backendReady).toBe(false);
  workers[1]!.ready();
  const second = client.execute(buildTinyState(), [], null);
  workers[1]!.reply(complete(workers[1]!.sent[0]!));
  expect((await second).beforeStateVersion).toBe(0);
  client.destroy();
});
it('worker retains its owned state identity across detached daily requests', async () => {
  const execute = createWorkerExecutor(initializeRust);
  const first = await execute({
    kind: 'tick',
    epoch: 12,
    requestId: 1,
    beforeStateVersion: 0,
    state: buildTinyState(),
    commands: [],
    eventDefs: null,
  });
  if (first.kind !== 'complete') throw new Error(first.error.message);
  const second = await execute({
    kind: 'tick',
    epoch: 12,
    requestId: 2,
    beforeStateVersion: 1,
    state: structuredClone(first.state),
    commands: [],
    eventDefs: null,
  });
  if (second.kind !== 'complete') throw new Error(second.error.message);
  expect(second.state).toBe(first.state);
  expect(second.state.meta.stateVersion).toBe(2);
});

it('consumes only the reserved AI prefix inside the detached worker snapshot', async () => {
  const game = buildTinyState();
  game.ai.allAi = true;
  const command = {
    type: 'setConscriptPolicy' as const,
    clanId: CLAN_ALPHA,
    castleId: CASTLE_A1,
    policy: 'high' as const,
  };
  const authority = { kind: 'clan' as const, clanId: CLAN_ALPHA };
  game.ai.pendingOrders.push({ command, authority });
  const envelope = { seq: 1, issuedDay: game.time.day, command, authority };
  const reference = structuredClone(game);
  reference.ai.pendingOrders.splice(0, 1);
  const expected = advanceDay(reference, [envelope]);
  const execute = createWorkerExecutor(initializeRust);
  const reply = await execute({
    kind: 'tick',
    epoch: 20,
    requestId: 1,
    beforeStateVersion: 0,
    state: structuredClone(game),
    commands: [envelope],
    eventDefs: null,
    consumedAiOrders: 1,
  });
  if (reply.kind !== 'complete') throw new Error(reply.error.message);
  expect(reply.result.appliedCommands).toEqual([envelope]);
  expect({ ...reply.result, perf: null }).toEqual({ ...expected, perf: null });
  expect(reply.state).toEqual(reference);
  expect(reply.state.castles[CASTLE_A1]!.conscriptPolicy).toBe('high');
  expect(game.ai.pendingOrders).toEqual([{ command, authority }]);
  expect(game.meta.stateVersion).toBe(0);
});
it('rejects malformed counts and mismatched AI reservations without executing a day', async () => {
  const game = buildTinyState();
  const command = {
    type: 'setConscriptPolicy' as const,
    clanId: CLAN_ALPHA,
    castleId: CASTLE_A1,
    policy: 'high' as const,
  };
  game.ai.pendingOrders.push({ command, authority: { kind: 'clan', clanId: CLAN_ALPHA } });
  const execute = createWorkerExecutor(initializeRust);
  for (const consumedAiOrders of [-1, 0.5, 2]) {
    const reply = await execute({
      kind: 'tick',
      epoch: 21,
      requestId: 1,
      beforeStateVersion: 0,
      state: structuredClone(game),
      commands: [{ seq: 1, issuedDay: 0, command }],
      eventDefs: null,
      consumedAiOrders,
    });
    expect(reply.kind).toBe('error');
  }
  const reply = await execute({
    kind: 'tick',
    epoch: 21,
    requestId: 1,
    beforeStateVersion: 0,
    state: structuredClone(game),
    commands: [{ seq: 1, issuedDay: 0, command }],
    eventDefs: null,
    consumedAiOrders: 1,
  });
  expect(reply.kind).toBe('error');
  if (reply.kind === 'error') expect(reply.error.message).toMatch(/reservation/);
});

describe('epoch-owned Rust readiness control plane', () => {
  it('keeps failure ownership stable when a subscriber replaces the worker during error delivery', async () => {
    const workers: FakeWorker[] = [];
    const client = createSimulationWorkerClient({
      workerFactory: () => {
        const worker = new FakeWorker(false);
        workers.push(worker);
        return worker as unknown as Worker;
      },
    });
    const oldEpoch = client.epoch;
    const rejected = expect(client.waitReady()).rejects.toThrow('old failure');
    client.subscribeInitializationFailure(() => client.resetSession('recover'));
    const delivered: number[] = [];
    client.subscribeInitializationFailure((_error, failedEpoch) => delivered.push(failedEpoch));
    workers[0]!.dispatchEvent(new ErrorEvent('error', { message: 'old failure' }));
    await rejected;
    expect(delivered).toEqual([oldEpoch]);
    expect(client.epoch).not.toBe(oldEpoch);
    expect(workers[1]!.terminated).toBe(false);
    expect(client.getDiagnostics().initializationState).toBe('initializing');
    workers[1]!.ready();
    await client.waitReady();
    client.destroy();
  });
  it('prewarms the actual engine once without advancing state, RNG or ticks, sharing initialization with an immediately submitted tick', async () => {
    let finish!: () => void;
    let loads = 0;
    const loading = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const execute = createWorkerExecutor(async () => {
      loads++;
      await loading;
      return initializeRust();
    });
    const game = buildTinyState(),
      before = structuredClone(game);
    const readiness = execute.initialize(7);
    const tick = execute({
      kind: 'tick',
      epoch: 7,
      requestId: 1,
      beforeStateVersion: 0,
      state: game,
      commands: [],
      eventDefs: null,
    });
    await Promise.resolve();
    expect(loads).toBe(1);
    expect(game).toEqual(before);
    finish();
    expect(await readiness).toEqual({
      kind: 'ready',
      epoch: 7,
      backend: 'rust-wasm',
      engineAbi: 1,
    });
    expect((await tick).kind).toBe('complete');
    expect(loads).toBe(1);
  });
  it('rejects initialization that claims an ABI without installing the actual engine and shares failures without retry', async () => {
    const load = vi.fn(() => Promise.resolve(1));
    const execute = createWorkerExecutor(load);
    await expect(execute.initialize(1)).rejects.toThrow('actual engine ABI');
    await expect(execute.initialize(1)).rejects.toThrow('actual engine ABI');
    expect(load).toHaveBeenCalledTimes(1);
    await expect(execute.initialize(0)).rejects.toThrow('epoch');
  });
  it('posts the unchanged tick immediately while readiness is delayed, and ready does not count as a tick', async () => {
    const worker = new FakeWorker(false);
    const client = createSimulationWorkerClient({
      workerFactory: () => worker as unknown as Worker,
    });
    const game = buildTinyState(),
      before = structuredClone(game);
    expect(worker.initializations).toEqual([{ kind: 'initialize', epoch: client.epoch }]);
    const ready = client.waitReady();
    const tick = client.execute(game, [], null);
    expect(worker.sent).toHaveLength(1);
    expect(worker.sent[0]).toMatchObject({
      kind: 'tick',
      epoch: client.epoch,
      requestId: 1,
      beforeStateVersion: 0,
    });
    expect(client.getDiagnostics()).toMatchObject({
      requests: 1,
      completed: 0,
      backendReady: false,
      pending: true,
    });
    worker.ready();
    await ready;
    expect(client.getDiagnostics()).toMatchObject({
      requests: 1,
      completed: 0,
      backendReady: true,
      pending: true,
    });
    expect(game).toEqual(before);
    worker.reply(complete(worker.sent[0]!));
    await tick;
    client.destroy();
  });
  it('never substitutes a complete reply for missing readiness and replays a cached initialization failure to late subscribers', async () => {
    const worker = new FakeWorker(false);
    const client = createSimulationWorkerClient({
      workerFactory: () => worker as unknown as Worker,
    });
    const readiness = expect(client.waitReady()).rejects.toThrow('confirm Rust readiness');
    const tick = client.execute(buildTinyState(), [], null);
    const rejected = expect(tick).rejects.toThrow('confirm Rust readiness');
    worker.reply(complete(worker.sent[0]!));
    await rejected;
    await readiness;
    const listener = vi.fn();
    client.subscribeInitializationFailure(listener);
    expect(listener).toHaveBeenCalledWith(expect.any(Error), client.epoch);
    expect(client.getDiagnostics()).toMatchObject({
      completed: 0,
      backendReady: false,
      initializationState: 'failed',
    });
    worker.ready();
    expect(client.getDiagnostics().backendReady).toBe(false);
    client.destroy();
  });
  it('rejects malformed readiness and initialization errors without a fallback', async () => {
    for (const malformed of [{ engineAbi: 2 }, { backend: 'js' }, { epoch: NaN }]) {
      const worker = new FakeWorker(false),
        client = createSimulationWorkerClient({ workerFactory: () => worker as unknown as Worker });
      const waiting = expect(client.waitReady()).rejects.toThrow(/invalid/i);
      worker.reply({
        kind: 'ready',
        epoch: client.epoch,
        backend: 'rust-wasm',
        engineAbi: 1,
        ...malformed,
      } as SimulationWorkerMessageReply);
      await waiting;
      expect(client.getDiagnostics().backendReady).toBe(false);
      client.destroy();
    }
    const worker = new FakeWorker(false),
      client = createSimulationWorkerClient({ workerFactory: () => worker as unknown as Worker });
    const waiting = expect(client.waitReady()).rejects.toThrow('WASM fetch failed');
    worker.reply({
      kind: 'initializationError',
      epoch: client.epoch,
      error: { name: 'FetchError', message: 'WASM fetch failed' },
    });
    await waiting;
    client.destroy();
  });
  it('rejects retired waiters and ignores an old worker handler even when it forges the current epoch', async () => {
    const workers: FakeWorker[] = [];
    const spy = vi.fn();
    const client = createSimulationWorkerClient({
      workerFactory: () => {
        const worker = new FakeWorker(false);
        spy.mockImplementation(worker.addEventListener.bind(worker));
        vi.spyOn(worker, 'addEventListener').mockImplementation(spy);
        workers.push(worker);
        return worker as unknown as Worker;
      },
    });
    const retired = spy.mock.calls.find(([type]) => type === 'message')![1] as EventListener;
    const old = expect(client.waitReady()).rejects.toThrow('new-game');
    client.resetSession('new-game');
    await old;
    retired(
      new MessageEvent('message', {
        data: { kind: 'ready', epoch: client.epoch, backend: 'rust-wasm', engineAbi: 1 },
      }),
    );
    retired(
      new MessageEvent('message', {
        data: {
          kind: 'initializationError',
          epoch: client.epoch,
          error: { name: 'Error', message: 'retired' },
        },
      }),
    );
    expect(client.getDiagnostics()).toMatchObject({
      backendReady: false,
      initializationState: 'initializing',
    });
    workers[1]!.ready();
    await client.waitReady();
    client.destroy();
  });
  it('cleans readiness and tick timers independently and handles missing readiness timeout', async () => {
    vi.useFakeTimers();
    const worker = new FakeWorker(false),
      client = createSimulationWorkerClient({
        workerFactory: () => worker as unknown as Worker,
        readyTimeoutMs: 10,
        timeoutMs: 100,
      });
    const ready = expect(client.waitReady()).rejects.toThrow('initialization timed out');
    const tick = expect(client.execute(buildTinyState(), [], null)).rejects.toThrow(
      'initialization timed out',
    );
    await vi.advanceTimersByTimeAsync(11);
    await ready;
    await tick;
    expect(worker.terminated).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    const activeWorker = new FakeWorker(),
      active = createSimulationWorkerClient({
        workerFactory: () => activeWorker as unknown as Worker,
        readyTimeoutMs: 10,
        timeoutMs: 100,
      });
    await active.waitReady();
    const work = active.execute(buildTinyState(), [], null);
    await vi.advanceTimersByTimeAsync(20);
    expect(active.getDiagnostics().pending).toBe(true);
    activeWorker.reply(complete(activeWorker.sent[0]!));
    await work;
    active.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('destroy and reset cancel readiness without emitting initialization failures or resurrecting a resolved old waiter', async () => {
    const worker = new FakeWorker(false),
      client = createSimulationWorkerClient({ workerFactory: () => worker as unknown as Worker });
    const failure = vi.fn();
    client.subscribeInitializationFailure(failure);
    const rejected = expect(client.waitReady()).rejects.toThrow('destroyed');
    client.destroy();
    await rejected;
    expect(failure).not.toHaveBeenCalled();
    const active = createSimulationWorkerClient({
      workerFactory: () => new FakeWorker() as unknown as Worker,
    });
    const waiting = expect(active.waitReady()).rejects.toThrow('current epoch');
    active.resetSession('reset before microtask');
    await waiting;
    active.destroy();
  });
});
