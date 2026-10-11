import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import type { GameState } from '../src/core/state/gameState';
import type { Command } from '../src/core/commands/types';
import { CommandQueue, enqueuePendingAiOrders } from '../src/core/commands/queue';
import { CommandLogRecorder, type CommandLogFile } from '../src/core/replay/commandLog';
import { advanceDay } from '../src/core/systems';
import { createRuntimeEventEngine } from '../src/core/systems/events/runtime';
import { zCanonicalEventsFile } from '../src/data/schemas/eventDefinitions';
import { validateState } from '../src/core/state/invariants';
import { RANK_VALUES } from '../src/core/state/enums';
import { encodeFullSnapshot } from './full-snapshot-transport';
import { test, expect } from './fixtures';

async function nativeGame(page: Page) {
  await page.goto('/?debug=1&seed=1');
  await page.getByTestId('title-newgame').click();
  await page.getByTestId('scenario-pick-s1560').click();
  await page.getByTestId('clan-pick-clan.oda').click();
  await page.getByTestId('newgame-start').click();
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
}

async function observeWorkerTraffic(page: Page) {
  await page.addInitScript(() => {
    const evidence = {
      created: 0,
      sent: [] as { kind: unknown; requestId: unknown }[],
      received: [] as {
        kind: unknown;
        requestId: unknown;
        backend: unknown;
        inconsistentThreatTotals: { clanId: string; total: number; sum: number }[];
      }[],
      longTasks: [] as { startTime: number; duration: number }[],
    };
    (window as unknown as { __workerEvidence: typeof evidence }).__workerEvidence = evidence;
    const NativeWorker = window.Worker;
    window.Worker = new Proxy(NativeWorker, {
      construct(target, argumentsList) {
        const worker = Reflect.construct(target, argumentsList) as Worker;
        const postMessage = worker.postMessage.bind(worker);
        evidence.created++;
        Object.defineProperty(worker, 'postMessage', {
          value: (...args: unknown[]) => {
            const data = args[0] as { kind?: unknown; requestId?: unknown };
            evidence.sent.push({ kind: data?.kind ?? null, requestId: data?.requestId ?? null });
            Reflect.apply(postMessage, worker, args);
          },
        });
        worker.addEventListener('message', (event: MessageEvent) => {
          const data = event.data as {
            kind?: unknown;
            requestId?: unknown;
            backend?: unknown;
            state?: GameState;
          };
          const inconsistentThreatTotals = Object.entries(data.state?.ai.clans ?? {})
            .filter(([, clan]) => clan.threatCache !== null)
            .map(([clanId, clan]) => ({
              clanId,
              total: clan.threatCache!.totalThreat,
              sum: clan.threatCache!.entries.reduce((sum, entry) => sum + entry.threat, 0),
            }))
            .filter((entry) => Math.abs(entry.total - entry.sum) > 1e-9);
          evidence.received.push({
            kind: data?.kind ?? null,
            requestId: data?.requestId ?? null,
            backend: data?.backend ?? null,
            inconsistentThreatTotals,
          });
        });
        return worker;
      },
    });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        evidence.longTasks.push({ startTime: entry.startTime, duration: entry.duration });
    }).observe({ type: 'longtask', buffered: true });
  });
}

async function snapshot(page: Page): Promise<GameState> {
  return JSON.parse(
    await page.evaluate<string>(
      `(${encodeFullSnapshot.toString()})(window.__tenka.debug.getState())`,
    ),
  ) as GameState;
}

function synchronousReference(
  initial: GameState,
  commands: readonly Command[],
  days: number,
  loaded = false,
) {
  const state = structuredClone(initial);
  const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  for (const command of commands) queue.enqueue(command, state.time.day);
  const catalog = zCanonicalEventsFile.parse(
    JSON.parse(
      readFileSync(new URL('../src/data/scenarios/s1560/events.json', import.meta.url), 'utf8'),
    ),
  );
  const engine = createRuntimeEventEngine(catalog.events);
  const recorder = new CommandLogRecorder();
  if (loaded) recorder.reset({ incompleteReason: 'loadedGame' });
  for (let day = 0; day < days; day++) {
    enqueuePendingAiOrders(state, queue);
    const submitted = queue.drain();
    const result = advanceDay(state, submitted, { eventEngine: engine });
    recorder.recordTick(result.appliedCommands, {
      ...(result.appliedCommands.length === submitted.length
        ? {}
        : { incompleteReason: 'hardRejection' as const }),
    });
  }
  return { state, log: recorder.export(state) };
}

test('native seeded full-world worker ticks preserve queued commands, complete state and replay log', async ({
  page,
}, info) => {
  const workers: string[] = [];
  const wasmResponses: { url: string; status: number }[] = [];
  page.on('worker', (worker) => workers.push(worker.url()));
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.endsWith('/wasm/tenka_engine.wasm'))
      wasmResponses.push({ url: response.url(), status: response.status() });
  });
  await observeWorkerTraffic(page);
  await nativeGame(page);
  const initial = await snapshot(page);
  expect(initial.meta.scenarioId).toBe('s1560');
  expect(initial.meta.seed).toBe(1);
  expect(Object.keys(initial.clans).length).toBeGreaterThan(20);
  expect(validateState(initial)).toEqual([]);
  const clanId = initial.meta.playerClanId;
  const castle = initial.castles[initial.clans[clanId]!.homeCastleId]!;
  const candidate = Object.values(initial.officers)
    .filter(
      (officer) =>
        officer.id !== castle.lordId &&
        officer.status === 'serving' &&
        officer.clanId === clanId &&
        officer.locationCastleId === castle.id &&
        officer.armyId === null &&
        RANK_VALUES.indexOf(officer.rank) >= RANK_VALUES.indexOf('samurai-taisho'),
    )
    .sort((a, b) => a.id.localeCompare(b.id))[0];
  expect(candidate).toBeDefined();
  const command: Command = {
    type: 'appointLord',
    clanId,
    castleId: castle.id,
    officerId: candidate!.id,
  };
  const accepted = await page.evaluate((cmd) => window.__tenka.debug.dispatch(cmd), command);
  expect(accepted.ok).toBe(true);
  expect(await snapshot(page)).toEqual(initial);
  const beforeLog = await page.evaluate(() => window.__tenka.debug.exportCommandLog());
  expect(beforeLog.entries).toEqual([]);
  // Normal resume must drive the production Worker, including a command that
  // remained queued during the pause. Stop at an observed day rather than a timer.
  await page.getByTestId('speed-1').click();
  await expect
    .poll(() => page.evaluate(() => window.__tenka.debug.getState().time.day), { intervals: [50] })
    .toBeGreaterThan(initial.time.day);
  await page.getByTestId('speed-pause').click();
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  await page.evaluate(() => window.__tenka.debug.waitSimulationIdle());
  const actual = await snapshot(page);
  const actualLog: CommandLogFile = await page.evaluate(() =>
    window.__tenka.debug.exportCommandLog(),
  );
  const days = actual.time.day - initial.time.day;
  const reference = synchronousReference(initial, [command], days);
  expect(days).toBeGreaterThan(0);
  expect(actual.castles[castle.id]!.lordId).toBe(candidate!.id);
  expect(validateState(actual)).toEqual([]);
  expect(actual).toEqual(reference.state);
  expect(actualLog).toEqual(reference.log);
  expect(workers.length, 'native strategy days use a real browser Worker').toBeGreaterThan(0);
  expect(wasmResponses.some((response) => response.status === 200)).toBe(true);
  const traffic = await page.evaluate(
    () =>
      (
        window as unknown as {
          __workerEvidence: {
            created: number;
            sent: { kind: unknown; requestId: unknown }[];
            received: { kind: unknown; requestId: unknown; backend: unknown }[];
            longTasks: { startTime: number; duration: number }[];
          };
        }
      ).__workerEvidence,
  );
  expect(traffic.created).toBeGreaterThan(0);
  expect(traffic.sent.length).toBeGreaterThan(0);
  expect(traffic.received.some((message) => message.backend === 'rust-wasm')).toBe(true);
  const simulation = await page.evaluate(() => window.__tenka.debug.getSimulationDiagnostics());
  expect(simulation.backend).toBe('worker');
  expect(simulation.wasmLoaded).toBe(true);
  expect(simulation.wasmBackend).toBe('rust-wasm');
  expect(simulation.completedWorkerTicks).toBeGreaterThanOrEqual(days);
  expect(simulation.pendingTicks).toBe(0);
  await info.attach('worker-full-world-reference', {
    body: JSON.stringify({
      workers,
      wasmResponses,
      traffic,
      simulation,
      days,
      initial,
      actual,
      actualLog,
      reference,
    }),
    contentType: 'application/json',
  });
});

test('native save and browser reload preserve an unconsumed command for the next worker day', async ({
  page,
}, info) => {
  await observeWorkerTraffic(page);
  await nativeGame(page);
  const initial = await snapshot(page);
  const clanId = initial.meta.playerClanId;
  const officer = Object.values(initial.officers).find(
    (entry) =>
      entry.clanId === clanId &&
      entry.id !== initial.clans[clanId]!.leaderId &&
      entry.status === 'serving' &&
      entry.hasComeOfAge,
  );
  expect(officer).toBeDefined();
  const command: Command = {
    type: 'rewardOfficer',
    clanId,
    officerId: officer!.id,
    tier: 'small',
  };
  expect(await page.evaluate((cmd) => window.__tenka.debug.dispatch(cmd), command)).toEqual({
    ok: true,
  });
  expect(await snapshot(page)).toEqual(initial);
  await page.getByRole('button', { name: '系統選單', exact: true }).click();
  await page.getByRole('button', { name: '存檔', exact: true }).click();
  const panel = page.getByTestId('save-load-panel');
  const slot = page.getByTestId('save-slot-manual:1');
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  await slot.getByRole('button', { name: '存檔', exact: true }).click();
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  await expect(slot).toContainText(initial.clans[clanId]!.name);
  await page.reload();
  await page.getByTestId('title-save-list').click();
  await expect(panel).toHaveAttribute('aria-busy', 'false');
  await slot.getByRole('button', { name: '載入', exact: true }).click();
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  expect(await snapshot(page)).toEqual(initial);
  await page.getByTestId('speed-1').click();
  await expect
    .poll(() => page.evaluate(() => window.__tenka.debug.getState().time.day), { intervals: [50] })
    .toBeGreaterThan(initial.time.day);
  await page.getByTestId('speed-pause').click();
  await page.evaluate(() => window.__tenka.debug.waitSimulationIdle());
  const actual = await snapshot(page);
  const actualLog = await page.evaluate(() => window.__tenka.debug.exportCommandLog());
  const reference = synchronousReference(
    initial,
    [command],
    actual.time.day - initial.time.day,
    true,
  );
  expect(actual).toEqual(reference.state);
  expect(actualLog).toEqual(reference.log);
  expect(actualLog.entries.filter((entry) => entry.command.type === 'rewardOfficer')).toHaveLength(
    1,
  );
  await info.attach('worker-pending-save-reload-reference', {
    body: JSON.stringify({ initial, command, actual, actualLog, reference }),
    contentType: 'application/json',
  });
});

for (const days of [60, 120]) {
  test(`same-host full-world ${days}-day synchronous and Worker measurements preserve complete state`, async ({
    page,
  }, info) => {
    await observeWorkerTraffic(page);
    const rows = [];
    const states: GameState[] = [];
    const logs: CommandLogFile[] = [];
    for (const backend of ['sync', 'worker'] as const) {
      await nativeGame(page);
      await page.evaluate(() => window.__tenka.debug.waitMapIdle(2));
      const initial = await snapshot(page);
      const measure = async (n: number) =>
        page.evaluate(
          async ({ backend, n }) => {
            const longTasks: { startTime: number; duration: number }[] = [];
            const frames: number[] = [];
            const observer = new PerformanceObserver((list) => {
              for (const entry of list.getEntries())
                longTasks.push({ startTime: entry.startTime, duration: entry.duration });
            });
            observer.observe({ type: 'longtask' });
            let frame = 0;
            const onFrame = () => {
              frames.push(performance.now());
              frame = requestAnimationFrame(onFrame);
            };
            frame = requestAnimationFrame(onFrame);
            await new Promise((resolve) => setTimeout(resolve, 50));
            const before = window.__tenka.debug.getState().time.day;
            const started = performance.now();
            if (backend === 'sync') window.__tenka.debug.measureSynchronousDays(n);
            else await window.__tenka.debug.stepDaysAsync(n);
            await window.__tenka.debug.waitSimulationIdle();
            const ended = performance.now();
            await new Promise((resolve) => setTimeout(resolve, 50));
            await new Promise<void>((resolve) => {
              requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
            });
            cancelAnimationFrame(frame);
            observer.disconnect();
            return {
              backend,
              requestedDays: n,
              completedDays: window.__tenka.debug.getState().time.day - before,
              durationMs: ended - started,
              started,
              ended,
              frames,
              frameGapsMs: frames.slice(1).map((value, i) => value - frames[i]!),
              longTasks: longTasks.filter(
                (entry) => entry.startTime < ended && entry.startTime + entry.duration > started,
              ),
              simulation: window.__tenka.debug.getSimulationDiagnostics(),
            };
          },
          { backend, n },
        );
      const cold = await measure(1);
      const warm = await measure(days);
      expect(cold.completedDays).toBe(1);
      expect(warm.completedDays).toBe(days);
      const state = await snapshot(page);
      expect(validateState(state)).toEqual([]);
      await page.evaluate(() => window.__tenka.debug.waitMapIdle(2));
      const publishedMap = await page.evaluate(() =>
        window.__tenka.debug.getMapPublishedViewSnapshot(),
      );
      const expectedMap = {
        districtOwner: Object.fromEntries(
          Object.values(state.districts).map((district) => [district.id, district.ownerClanId]),
        ),
        castles: Object.values(state.castles)
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((castle) => ({
            id: castle.id,
            ownerClanId: castle.ownerClanId,
            durability: castle.durability,
            maxDurability: castle.maxDurability,
            tier: castle.tier,
          })),
        armies: Object.values(state.armies)
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((army) => {
            const edgeT =
              army.edgeCostDays <= 0
                ? 0
                : Math.min(1, Math.max(0, army.edgeProgressDays / army.edgeCostDays));
            return {
              id: army.id,
              clanId: army.clanId,
              soldiers: army.soldiers,
              status: army.status,
              morale: army.morale,
              mission: army.mission,
              fromNode: army.reversingEdgeEndNodeId ?? army.posNodeId,
              toNode:
                army.reversingEdgeEndNodeId != null
                  ? army.posNodeId
                  : (army.path[army.pathCursor + 1] ?? null),
              edgeT: army.reversingEdgeEndNodeId != null ? 1 - edgeT : edgeT,
              corps: army.corpsId !== null,
            };
          }),
      };
      expect(publishedMap.day).toBe(state.time.day);
      expect(publishedMap.districtOwner).toEqual(expectedMap.districtOwner);
      expect(publishedMap.armies).toMatchObject(expectedMap.armies);
      expect(publishedMap.castles).toMatchObject(expectedMap.castles);
      const mapDiagnostics = await page.evaluate(() => window.__tenka.debug.getMapDiagnostics());
      expect(mapDiagnostics.armyRendering.viewCount).toBe(expectedMap.armies.length);
      expect(mapDiagnostics.elevationRendering.armies.map((army) => army.id).sort()).toEqual(
        expectedMap.armies.map((army) => army.id).sort(),
      );
      for (const castle of Object.values(state.castles)) {
        expect(
          mapDiagnostics.elevationRendering.nodes.find((node) => node.id === castle.id)?.canonical,
        ).toEqual(castle.pos);
      }
      const traffic: unknown = await page.evaluate(
        () => (window as unknown as { __workerEvidence: unknown }).__workerEvidence,
      );
      rows.push({ backend, initial, cold, warm, traffic, publishedMap, mapDiagnostics });
      states.push(state);
      logs.push(await page.evaluate(() => window.__tenka.debug.exportCommandLog()));
    }
    const path = info.outputPath(`same-host-${days}-day-worker-responsiveness.json`);
    await writeFile(path, JSON.stringify({ rows, states, logs }));
    await info.attach(`same-host-${days}-day-worker-responsiveness`, {
      path,
      contentType: 'application/json',
    });
    expect(rows[0]!.initial).toEqual(rows[1]!.initial);
    expect(states[0]).toEqual(states[1]);
    expect(logs[0]).toEqual(logs[1]);
  });
}

test('pausing an already posted native Worker day keeps state and its command for a fresh generation', async ({
  page,
}, info) => {
  await observeWorkerTraffic(page);
  await nativeGame(page);
  const initial = await snapshot(page);
  const clanId = initial.meta.playerClanId;
  const officer = Object.values(initial.officers).find(
    (entry) =>
      entry.clanId === clanId &&
      entry.id !== initial.clans[clanId]!.leaderId &&
      entry.status === 'serving' &&
      entry.hasComeOfAge,
  )!;
  const command: Command = { type: 'rewardOfficer', clanId, officerId: officer.id, tier: 'small' };
  expect(await page.evaluate((cmd) => window.__tenka.debug.dispatch(cmd), command)).toEqual({
    ok: true,
  });
  const cancelled = await page.evaluate(async () => {
    const before = window.__tenka.debug.getSimulationDiagnostics();
    const work = window.__tenka.debug.stepDaysAsync(1);
    // The bridge's submission microtask posts the real Worker request before
    // this continuation; its reply cannot be delivered until this task yields.
    await Promise.resolve();
    const posted = window.__tenka.debug.getSimulationDiagnostics();
    window.__tenka.debug.setSpeed('paused');
    await work;
    await window.__tenka.debug.waitSimulationIdle();
    return { before, posted, after: window.__tenka.debug.getSimulationDiagnostics() };
  });
  expect(cancelled.posted.pendingTicks).toBe(1);
  expect(cancelled.after.pendingTicks).toBe(0);
  expect(cancelled.after.generation).toBeGreaterThan(cancelled.before.generation);
  expect(cancelled.after.completedWorkerTicks).toBe(cancelled.before.completedWorkerTicks);
  expect(await snapshot(page)).toEqual(initial);
  expect((await page.evaluate(() => window.__tenka.debug.exportCommandLog())).entries).toEqual([]);
  await page.evaluate(() => window.__tenka.debug.stepDaysAsync(1));
  const actual = await snapshot(page);
  const log = await page.evaluate(() => window.__tenka.debug.exportCommandLog());
  const reference = synchronousReference(initial, [command], 1);
  expect(actual).toEqual(reference.state);
  expect(log).toEqual(reference.log);
  expect(log.entries.filter((entry) => entry.command.type === 'rewardOfficer')).toHaveLength(1);
  await info.attach('native-worker-cancel-generation-parity', {
    body: JSON.stringify({ cancelled, initial, command, actual, log, reference }),
    contentType: 'application/json',
  });
});

test('native x5 Worker flow and a paced synchronous reference retain state with raw main-thread timings', async ({
  page,
}, info) => {
  const rows = [];
  const states: GameState[] = [];
  const logs: CommandLogFile[] = [];
  const profileEnabled = process.env.SIMULATION_PROFILE === '1';
  let measuredDays = 60;
  for (const backend of ['worker', 'sync'] as const) {
    await nativeGame(page);
    await page.evaluate(() => window.__tenka.debug.waitMapIdle(2));
    if (backend === 'worker') await page.evaluate(() => window.__tenka.debug.stepDaysAsync(1));
    else await page.evaluate(() => window.__tenka.debug.measureSynchronousDays(1));
    const initial = await snapshot(page);
    const profiler = profileEnabled ? await page.context().newCDPSession(page) : null;
    if (profiler) {
      await profiler.send('Profiler.enable');
      await profiler.send('Profiler.start');
    }
    const row = await page.evaluate(
      async ({ backend, days, profileEnabled }) => {
        const tasks: { startTime: number; duration: number }[] = [];
        const frames: number[] = [];
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            tasks.push({ startTime: entry.startTime, duration: entry.duration });
        });
        observer.observe({ type: 'longtask' });
        let frame = 0;
        const onFrame = () => {
          frames.push(performance.now());
          frame = requestAnimationFrame(onFrame);
        };
        frame = requestAnimationFrame(onFrame);
        await new Promise((resolve) => setTimeout(resolve, 50));
        const before = window.__tenka.debug.getState().time.day;
        const started = performance.now();
        if (backend === 'worker') {
          window.__tenka.debug.setSpeed('x5');
          while (
            window.__tenka.debug.getState().time.day - before < days &&
            performance.now() - started < 20_000
          ) {
            await new Promise((resolve) => setTimeout(resolve, 10));
            if (
              window.__tenka.debug.getState().time.day > before &&
              document
                .querySelector('[data-testid="speed-pause"]')
                ?.getAttribute('aria-pressed') === 'true'
            )
              break;
          }
          window.__tenka.debug.setSpeed('paused');
          await window.__tenka.debug.waitSimulationIdle();
        } else {
          for (let day = 0; day < days; day++) {
            await new Promise((resolve) =>
              setTimeout(resolve, Math.max(0, started + (day + 1) * 120 - performance.now())),
            );
            window.__tenka.debug.measureSynchronousDays(1);
          }
        }
        const ended = performance.now();
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
        cancelAnimationFrame(frame);
        observer.disconnect();
        return {
          backend,
          requestedDays: days,
          completedDays: window.__tenka.debug.getState().time.day - before,
          durationMs: ended - started,
          started,
          ended,
          frames,
          frameGapsMs: frames.slice(1).map((value, i) => value - frames[i]!),
          longTasks: tasks.filter(
            (entry) => entry.startTime < ended && entry.startTime + entry.duration > started,
          ),
          simulation: window.__tenka.debug.getSimulationDiagnostics(),
          profilerEnabled: profileEnabled,
        };
      },
      { backend, days: measuredDays, profileEnabled },
    );
    if (profiler) {
      const profile: unknown = await profiler.send('Profiler.stop');
      await profiler.detach();
      const profilePath = info.outputPath(`normal-${backend}-main-thread-profile.json`);
      await writeFile(profilePath, JSON.stringify(profile));
      await info.attach(`normal-${backend}-main-thread-profile`, {
        path: profilePath,
        contentType: 'application/json',
      });
    }
    if (backend === 'worker') measuredDays = row.completedDays;
    await page.evaluate(() => window.__tenka.debug.waitMapIdle(2));
    const publishedMap = await page.evaluate(() =>
      window.__tenka.debug.getMapPublishedViewSnapshot(),
    );
    const mapDiagnostics = await page.evaluate(() => window.__tenka.debug.getMapDiagnostics());
    rows.push({ initial, ...row, publishedMap, mapDiagnostics });
    states.push(await snapshot(page));
    logs.push(await page.evaluate(() => window.__tenka.debug.exportCommandLog()));
  }
  const path = info.outputPath('normal-x5-worker-paced-sync-responsiveness.json');
  await writeFile(path, JSON.stringify({ rows, states, logs }));
  await info.attach('normal-x5-worker-paced-sync-responsiveness', {
    path,
    contentType: 'application/json',
  });
  expect(rows[0]!.publishedMap).toEqual(rows[1]!.publishedMap);
  expect(rows[0]!.mapDiagnostics.geographicLabelLayout.labels).toEqual(
    rows[1]!.mapDiagnostics.geographicLabelLayout.labels,
  );
  expect(measuredDays).toBeGreaterThan(0);
  expect(rows[0]!.initial).toEqual(rows[1]!.initial);
  expect(states[0]).toEqual(states[1]);
  expect(logs[0]).toEqual(logs[1]);
});
