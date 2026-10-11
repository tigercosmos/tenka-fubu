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
} from './protocol';

async function initializeRust() {
  const wasm = await WebAssembly.instantiate(
    readFileSync('public/wasm/tenka_engine.wasm'),
    rustPathfindingImports(),
  );
  installRustPathfinding(wasm.instance.exports);
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
  terminated = false;
  postMessage(request: SimulationWorkerRequest) {
    this.sent.push(structuredClone(request));
  }
  terminate() {
    this.terminated = true;
  }
  reply(reply: SimulationWorkerReply) {
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
      const worker = new FakeWorker();
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
