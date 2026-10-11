// dispatchCommand / publishTick / runOneDay（core ↔ UI 橋接）。
// 規格：plan/01-architecture.md §3.4.3（Command 佇列 API）／§3.4.4（publishTick）／§5.2（runOneDay 流程）。
// M1-15（01-A6）實作。
//
// 佇列實作採 03-game-loop.md 的 `CommandQueue`（core/commands/queue.ts），而非 01 §3.4.3 示意的
// 裸 `Command[]`：`advanceDay` 簽章需要帶 `seq` 的 `CommandEnvelope[]`（03 §4.2），03 已提供完整的
// seq 指派／drain API 且明文「app 層每局持有一個實例」，直接複用不重複造輪（01 §8 D17）。
//
// `evaluateAutoPause` 未在本檔內直接呼叫（避免與 autoPause.ts↔gameLoop.ts 形成循環 import，
// 01 §8 D17）：本檔改為透過 `onAutoPauseReasons` 讓 autoPause.ts 於安裝時註冊回呼，
// `runOneDay` 每 tick 結束呼叫該回呼並傳入 `TickResult.autoPauseReasons`，行為與 01 §5.2
// 步驟 9 等價，只是改由 autoPause.ts 主動訂閱而非本檔主動 import。

import { advanceDay, STEP_SEQUENCE } from '@core/systems/index';
import type { AutoPauseReason, TickResult } from '@core/systems/index';
import { validateCommand } from '@core/commands/validate';
import { CommandQueue, enqueuePendingAiOrders } from '@core/commands/queue';
import type { Command, CmdResolveEventChoice } from '@core/commands/types';
import type { GameEvent } from '@core/state/events';
import type { GameState } from '@core/state/gameState';
import type { ClanId, TransportId } from '@core/state/ids';
import { CommandLogRecorder, type CommandLogFile } from '@core/replay/commandLog';
import { CoreError } from '@core/errors';
import { store } from './store';
import { uiStore } from '../ui/hooks/uiStore';
import { snapshotPendingBattleOrders, type PendingBattleOrders } from './battleBridge';
import { captureFatalError } from './errors';
import { perfMonitor } from './perfMonitor';
import { checkDevInvariantsAfterTick, isDevInvariantTick } from './devInvariants';
import { publishMonthSummary, resetMonthSummaries } from './monthSummaryFlow';
import { publishCapturedOfficers, resetCapturedOfficerPresentations } from './captivePresentation';
import { autosave } from './persistence';
import { buildSaveFile, type SaveFile, type SaveMetadataContext } from '@core/save/serialize';
import { isCommandShape, validateSavedPendingCommands } from '@core/save/validatePendingCommands';
import type { EventEngine } from '@core/systems/events/engine';
import type { CommandContext } from '@core/commands/registry';
import { BAL } from '@core/balance';
import type { LiveArmySlot } from './liveMapWorkload';
import type { DayExecutor } from './dayExecutor';
import { reconcileSnapshot } from './worker/reconcile';
import type { CommandEnvelope } from '@core/commands/types';
import type { CmdSetArmyTarget } from '@core/commands/types';
import type { ExecutionAuthority } from '@core/commands/authority';
import { buildEventModalVM } from './events/eventViewModel';
import { getEventPresentationOptions } from './events/presentationMetadata';
import {
  enqueueEventPresentation,
  enqueuePendingEventPresentation,
  synchronizePendingEventPresentations,
  resetEventPresentations,
} from './events/eventPresentationQueue';

let commandQueue = new CommandQueue();
let commandLogGame: GameState | null = null;
let sessionEventEngine: EventEngine | null = null;
let unsubscribeEventPresentations: (() => void) | null = null;
let deferredTickPresentations: { game: GameState; publish: (() => void)[] } | null = null;
const commandLogRecorder = new CommandLogRecorder();

export interface DebugLiveArmyDriver {
  readonly slots: readonly LiveArmySlot[];
  beforeDay(game: Readonly<GameState>): readonly CmdSetArmyTarget[];
  afterDay(game: Readonly<GameState>, result: Readonly<TickResult>): void;
  dispose(reason: string): void;
}
type LiveDriverRegistration = {
  game: GameState;
  driver: DebugLiveArmyDriver;
  unsubscribe: () => void;
  bindings: Map<string, { clanId: ClanId; authority: ExecutionAuthority }>;
};
let liveDriver: LiveDriverRegistration | null = null;
function clearLiveDriver(reason: string): void {
  const previous = liveDriver;
  liveDriver = null;
  previous?.unsubscribe();
  try {
    previous?.driver.dispose(reason);
  } catch {
    /* Debug observer cannot change strategy rules. */
  }
}
/** Debug-only scoped command source. Cleanup cannot remove a newer registration. */
export function registerDebugLiveArmyDriver(
  game: GameState,
  driver: DebugLiveArmyDriver,
): () => void {
  if (store.getState().game !== game || commandLogGame !== game)
    throw new Error('Live driver requires initialized current session');
  const bindings = new Map<string, { clanId: ClanId; authority: ExecutionAuthority }>();
  for (const slot of driver.slots) {
    const army = game.armies[slot.armyId];
    if (
      !army ||
      bindings.has(slot.armyId) ||
      army.originCastleId !== slot.castleId ||
      game.castles[slot.castleId]?.ownerClanId !== army.clanId
    )
      throw new Error('Live driver requires unique existing source-owned armies');
    bindings.set(slot.armyId, {
      clanId: army.clanId,
      authority:
        army.clanId === game.meta.playerClanId
          ? { kind: 'player' }
          : { kind: 'clan', clanId: army.clanId },
    });
  }
  if (bindings.size !== 40) throw new Error('Live driver requires exactly forty armies');
  clearLiveDriver('replaced');
  const registration = { game, driver, bindings, unsubscribe: () => {} };
  liveDriver = registration;
  registration.unsubscribe = store.subscribe((state) => {
    if (liveDriver !== registration) return;
    if (state.game !== game) clearLiveDriver('session-replaced');
    else if (
      state.session.screen === 'title' ||
      state.session.screen === 'ending' ||
      state.session.fatalError !== null ||
      game.meta.gameOver !== null
    )
      clearLiveDriver('session-ended');
  });
  return () => {
    if (liveDriver === registration) clearLiveDriver('disposed');
  };
}

function enqueueLiveArmyTargets(game: GameState): void {
  const registration = liveDriver;
  const session = store.getState().session;
  if (
    !registration ||
    registration.game !== game ||
    session.screen !== 'main' ||
    session.viewportBlocked ||
    session.fatalError !== null ||
    session.debug.jumping !== null ||
    game.meta.gameOver !== null ||
    (session.speed === 'paused' && !hasQueuedEventChoiceResolution())
  )
    return;
  try {
    const expectedQueue = commandQueue;
    const commands = registration.driver.beforeDay(game);
    if (
      liveDriver !== registration ||
      commandQueue !== expectedQueue ||
      store.getState().game !== game
    )
      return;
    const seen = new Set<string>();
    const intents = commands.map((command) => {
      const binding = registration.bindings.get(command.armyId);
      const army = game.armies[command.armyId];
      if (
        !isCommandShape(command) ||
        command.type !== 'setArmyTarget' ||
        !binding ||
        !army ||
        seen.has(command.armyId) ||
        army.clanId !== command.clanId ||
        binding.clanId !== command.clanId ||
        !validateCommand(game, command, binding.authority, commandContext()).ok
      )
        throw new Error(`Live driver command rejected: ${command.armyId}`);
      seen.add(command.armyId);
      return { command, authority: binding.authority };
    });
    if (
      liveDriver !== registration ||
      store.getState().game !== game ||
      commandLogGame !== game ||
      commandQueue !== expectedQueue
    )
      return;
    for (const intent of intents)
      commandQueue.enqueue(structuredClone(intent.command), game.time.day, intent.authority);
  } catch (error) {
    if (liveDriver === registration)
      clearLiveDriver(error instanceof Error ? error.message : 'live-driver-failure');
  }
}

function prepareCommandLog(game: GameState, loaded = false): void {
  if (commandLogGame === game) return;
  cancelPendingDay('session-replaced');
  clearLiveDriver('session-initialized');
  unsubscribeEventPresentations?.();
  unsubscribeEventPresentations = null;
  resetEventPresentations(game);
  resetCapturedOfficerPresentations();
  resetMonthSummaries(game);
  commandLogGame = game;
  sessionEventEngine = null;
  // 讀檔／換局時必須同步清掉前一局 pending，並從存檔的已消耗 seq 後續接。
  commandQueue = new CommandQueue(game.meta.lastAppliedCmdSeq + 1);
  store.getState().actions.setPendingCommandCount(0);
  // 從進度中存檔開始無法由劇本初始狀態完整重放，明確標記為 truncated。
  commandLogRecorder.reset({
    ...(loaded || game.meta.stateVersion !== 0 ? { incompleteReason: 'loadedGame' as const } : {}),
  });
}

/** 恢復原待結算指令，不提前套用或剔除；即時驗證僅決定已提交同意的 UI 隱藏資格。 */
export function initializeBridgeSession(
  game: GameState,
  pendingCommands: readonly Command[] = [],
  options: { loaded?: boolean; eventEngine?: EventEngine } = {},
): void {
  cancelPendingDay('session-initialized');
  if (
    store.getState().game !== game ||
    !validateSavedPendingCommands(pendingCommands, game.meta.playerClanId)
  )
    throw new CoreError(
      'INVALID_COMMAND_SHAPE',
      'initializeBridgeSession: invalid session or pending commands',
    );
  // 同一物件也必須重設：明確初始化與懶初始化不同，不沿用上一局的佇列。
  commandLogGame = null;
  prepareCommandLog(game, options.loaded === true);
  sessionEventEngine = options.eventEngine ?? null;
  const engine = sessionEventEngine;
  if (engine)
    unsubscribeEventPresentations = engine.subscribeFired((notice, state) => {
      const publish = () => publishEventNotice(state, notice, engine);
      if (deferredTickPresentations?.game === state)
        deferredTickPresentations.publish.push(publish);
      else publish();
    });
  const restored = JSON.parse(JSON.stringify(pendingCommands)) as Command[];
  const restoredQueue = commandQueue;
  const ownsRestoredSession = () =>
    store.getState().game === game && commandLogGame === game && commandQueue === restoredQueue;
  for (const command of restored) commandQueue.enqueue(command, game.time.day);
  store.getState().actions.setPendingCommandCount(commandQueue.size);
  if (!ownsRestoredSession()) return;
  // Core subjects remain pending until the normal tick. The native queue, not
  // transient dialog state, proves that their player consent was already submitted.
  const queuedDecisionIds = restored.flatMap((command) =>
    (command.type === 'resolveProposal' ||
      command.type === 'respondPact' ||
      command.type === 'handleCaptive') &&
    command.clanId === game.meta.playerClanId &&
    validateCommand(game, command).ok
      ? [command.type === 'handleCaptive' ? command.officerId : command.proposalId]
      : [],
  );
  uiStore.setState({ queuedDecisionIds: [...new Set(queuedDecisionIds)] });
  if (!ownsRestoredSession()) return;
  synchronizePendingEventPresentations(game);
}

function publishEventNotice(
  state: GameState,
  notice: Parameters<Parameters<EventEngine['subscribeFired']>[0]>[0],
  engine: EventEngine,
): void {
  if (
    state === commandLogGame &&
    state === store.getState().game &&
    state.events.pendingChoiceEventId === notice.def.id
  ) {
    enqueuePendingEventPresentation(state, notice.def.id);
    return;
  }
  if (
    state !== commandLogGame ||
    state !== store.getState().game ||
    state.events.pendingChoiceEventId === notice.def.id ||
    (notice.def.kind !== 'historical' &&
      !notice.clanIds.includes(state.meta.playerClanId) &&
      !notice.def.ownerCandidates.includes(state.meta.playerClanId))
  )
    return;
  enqueueEventPresentation(
    state,
    buildEventModalVM(state, notice.def, notice.binding, engine, {
      ...getEventPresentationOptions(notice.def.id, notice.binding),
      resolved: true,
    }),
  );
}

let dayExecutor: DayExecutor | null = null;
let pendingDay: {
  game: GameState;
  queue: CommandQueue;
  aiSequences: number[];
  beforeVersion: number;
  tickSeq: number;
  promise: Promise<GameEvent[]>;
} | null = null;
let completedWorkerTicks = 0;
let droppedStaleResponses = 0;

export function configureDayExecutor(executor: DayExecutor | null): void {
  cancelPendingDay('executor-replaced');
  dayExecutor = executor;
}
export function hasAsyncDayExecutor(): boolean {
  return dayExecutor !== null;
}
export function isDayPending(): boolean {
  return pendingDay !== null;
}
export async function waitSimulationIdle(): Promise<void> {
  await pendingDay?.promise;
}
export function cancelPendingDay(reason: string): void {
  const pending = pendingDay;
  if (!pending) return;
  pendingDay = null;
  pending.queue.cancelReservations(pending.aiSequences);
  dayExecutor?.cancelPending(reason);
  if (store.getState().game === pending.game && commandQueue === pending.queue)
    store.getState().actions.setPendingCommandCount(commandQueue.size);
}
export function getSimulationDiagnostics() {
  const diagnostics = dayExecutor?.getDiagnostics?.();
  return {
    backend: dayExecutor ? 'worker' : 'sync',
    workerReady: diagnostics?.backendReady ?? false,
    wasmLoaded: diagnostics?.backendReady ?? false,
    wasmBackend: diagnostics?.backend ?? null,
    pathfinderBackend: diagnostics?.backend ?? null,
    generation: diagnostics?.epoch ?? 0,
    pendingTicks: pendingDay ? 1 : 0,
    completedWorkerTicks,
    droppedStaleResponses: droppedStaleResponses + (diagnostics?.stale ?? 0),
  };
}
// Committed state remains untouched until a complete, still-owned worker day returns.
export function runOneDayAsync(): Promise<GameEvent[]> {
  if (!dayExecutor) return Promise.resolve(runOneDay());
  if (pendingDay) return pendingDay.promise;
  const game = store.getState().game;
  if (!game)
    return Promise.reject(new CoreError('DATA_INTEGRITY', 'runOneDayAsync: game 尚未初始化'));
  if (store.getState().session.viewportBlocked) return Promise.resolve([]);
  prepareCommandLog(game);
  const submittedQueue = commandQueue;
  enqueueLiveArmyTargets(game);
  if (store.getState().game !== game || commandQueue !== submittedQueue) return Promise.resolve([]);
  const aiOrders = game.ai.pendingOrders.slice(
    0,
    Math.max(0, BAL.maxCommandsPerTick - commandQueue.size),
  );
  const aiSequences = aiOrders.map(
    (order) =>
      commandQueue.enqueue(structuredClone(order.command), game.time.day, order.authority).seq,
  );
  const commands = submittedQueue.snapshotEnvelopes();
  const workGame = structuredClone(game);
  workGame.ai.pendingOrders.splice(0, aiOrders.length);
  const beforeVersion = game.meta.stateVersion;
  const tickSeq = store.getState().tickSeq;
  const context: DayPublication = {
    game,
    submittedQueue,
    tickLiveDriver: liveDriver,
    queue: commands,
    startingSpeed: store.getState().session.speed,
    startingDebugJumping: store.getState().session.debug.jumping,
    beforeVersion,
    pendingPresentations: { game, publish: [] },
    elapsed: 0,
  };
  const executor = dayExecutor;
  const transaction = {
    game,
    queue: submittedQueue,
    aiSequences,
    beforeVersion,
    tickSeq,
    promise: Promise.resolve([] as GameEvent[]),
  };
  pendingDay = transaction;
  transaction.promise = Promise.resolve()
    .then(() => {
      if (pendingDay !== transaction) return null;
      return executor.execute(workGame, commands, sessionEventEngine?.getDefs() ?? null);
    })
    .then((executed) => {
      if (!executed) return [];
      if (
        pendingDay !== transaction ||
        store.getState().game !== game ||
        commandLogGame !== game ||
        commandQueue !== submittedQueue ||
        game.meta.stateVersion !== beforeVersion ||
        store.getState().tickSeq !== tickSeq
      ) {
        droppedStaleResponses++;
        if (pendingDay === transaction) cancelPendingDay('stale-day');
        return [];
      }
      submittedQueue.consumePrefix(commands);
      pendingDay = null;
      reconcileSnapshot(game, executed.state);
      executed.result.state = game;
      context.elapsed = executed.computeMs;
      const engine = sessionEventEngine;
      if (engine)
        for (const notice of executed.fired) {
          const def = engine.getDef(notice.eventId);
          if (def)
            context.pendingPresentations!.publish.push(() =>
              publishEventNotice(game, { ...notice, def }, engine),
            );
        }
      completedWorkerTicks++;
      return finishDay(context, executed.result);
    })
    .catch((error) => {
      if (pendingDay !== transaction) return [];
      cancelPendingDay('tick-failed');
      clearLiveDriver('tick-failed');
      if (store.getState().game === game && commandQueue === submittedQueue)
        store.getState().actions.setFatalError(captureFatalError(error));
      return [];
    });
  return transaction.promise;
}
store.subscribe((state, previous) => {
  if (
    pendingDay &&
    (state.game !== pendingDay.game ||
      state.tickSeq !== pendingDay.tickSeq ||
      state.session.viewportBlocked ||
      state.session.screen !== previous.session.screen ||
      (state.session.speed === 'paused' && previous.session.speed !== 'paused'))
  )
    cancelPendingDay('session-boundary');
});

/** 不 drain、不更動 seq 的 tick 邊界存檔快照；同步捕捉 state 與尚未結算的玩家指令。 */
export function captureSaveSnapshot(
  timestamp: number,
  context: SaveMetadataContext = {},
): SaveFile {
  cancelPendingDay('save-boundary');
  const game = store.getState().game;
  if (game === null) throw new CoreError('DATA_INTEGRITY', 'captureSaveSnapshot: game 尚未初始化');
  prepareCommandLog(game);
  const pending = commandQueue.snapshotPlayerCommands();
  if (!validateSavedPendingCommands(pending, game.meta.playerClanId))
    throw new CoreError('INVALID_COMMAND_SHAPE', 'captureSaveSnapshot: invalid pending commands');
  return buildSaveFile(game, timestamp, pending, context);
}

/** App progress mark without copying GameState or consuming pending commands. */
export function getBridgeProgressMark(): {
  tick: number;
  lastAppliedCmdSeq: number;
  pendingCommands: Command[];
  tickSeq: number;
  pendingBattleOrders: PendingBattleOrders[];
} | null {
  const game = store.getState().game;
  if (game === null) return null;
  prepareCommandLog(game);
  return {
    tick: game.meta.stateVersion,
    lastAppliedCmdSeq: game.meta.lastAppliedCmdSeq,
    pendingCommands: commandQueue.snapshotPlayerCommands(),
    tickSeq: store.getState().tickSeq,
    pendingBattleOrders: snapshotPendingBattleOrders(),
  };
}

/** Detached, identity-scoped presentation snapshot; never initializes or drains the queue. */
export function getQueuedPlayerCommands(expectedGame: GameState): readonly Command[] {
  return store.getState().game === expectedGame && commandLogGame === expectedGame
    ? commandQueue.snapshotPlayerCommands()
    : [];
}

/** Presentation-only duplicate guard; never initializes or drains the command queue. */
export function hasQueuedTaimeiInvocation(clanId: ClanId): boolean {
  const game = store.getState().game;
  return (
    game !== null &&
    commandLogGame === game &&
    commandQueue
      .snapshotPlayerCommands()
      .some((cmd) => cmd.type === 'invokeTaimei' && cmd.clanId === clanId)
  );
}

/** Presentation-only recall guard; never initializes or drains the command queue. */
export function hasQueuedTransportRecall(clanId: ClanId, transportId: TransportId): boolean {
  const game = store.getState().game;
  return (
    game !== null &&
    commandLogGame === game &&
    commandQueue
      .snapshotPlayerCommands()
      .some(
        (cmd) =>
          cmd.type === 'recallTransport' &&
          cmd.clanId === clanId &&
          cmd.transportId === transportId,
      )
  );
}

/** Read-only thaw gate: only a currently valid player decision can enter normal Step 1. */
export function hasQueuedEventChoiceResolution(): boolean {
  const game = store.getState().game;
  if (game === null || commandLogGame !== game || game.events.pendingChoiceEventId === null)
    return false;
  return commandQueue
    .snapshotPlayerCommands()
    .some(
      (command) =>
        isCommandShape(command) &&
        command.type === 'resolveEventChoice' &&
        command.clanId === game.meta.playerClanId &&
        command.eventId === game.events.pendingChoiceEventId &&
        validateCommand(game, command, undefined, commandContext()).ok,
    );
}

function commandContext(): CommandContext {
  return sessionEventEngine ? { eventEngine: sessionEventEngine } : {};
}

export function getSessionEventEngine(): EventEngine | null {
  return commandLogGame === store.getState().game ? sessionEventEngine : null;
}

/** dispatchCommand 的同步預檢結果（01 §4.5）。
 * `reason` 直接沿用 core `ValidationResult.reasonKey` 原始值（已含 `cmd.reject.` 前綴，見
 * core/commands/reasons.ts）；UI 以 `t(reason)` 顯示，不再如 01 §4.5 註解所述自行組
 * `cmd.reject.${reason}`（該註解假設 reason 為短尾碼，與 03 已定案的全字串 reasonKey 慣例不符，
 * 依 00>02>15>系統文件優先序採已實作之 03 慣例；01 §8 D17）。`'cmd.reject.notBooted'` 為本檔新增
 * 之 app 層專屬原因（game 尚未 boot），沿用相同前綴慣例以利未來 13 統一登錄字串 key。 */
export type CommandDispatchResult =
  { ok: true } | { ok: false; reason: string; params?: Record<string, string | number> };

/** UI 對遊戲狀態的唯一寫入路徑（01 §3.4.3）。 */
export function dispatchCommand(cmd: Command): CommandDispatchResult {
  if (!isCommandShape(cmd))
    throw new CoreError('INVALID_COMMAND_SHAPE', 'dispatchCommand: invalid command shape');
  const game = store.getState().game;
  if (game === null) {
    return { ok: false, reason: 'cmd.reject.notBooted' };
  }
  if (cmd.clanId !== game.meta.playerClanId) return { ok: false, reason: 'cmd.reject.notOwner' };
  prepareCommandLog(game);
  const verdict = validateCommand(game, cmd, undefined, commandContext());
  if (!verdict.ok) {
    // exactOptionalPropertyTypes：verdict.params 為 undefined 時不得顯式帶入該 key。
    return verdict.params === undefined
      ? { ok: false, reason: verdict.reasonKey }
      : { ok: false, reason: verdict.reasonKey, params: verdict.params };
  }
  // Copy the accepted intent before its caller can mutate fields or nested ID arrays.
  commandQueue.enqueue(JSON.parse(JSON.stringify(cmd)) as Command, game.time.day);
  store.getState().actions.setPendingCommandCount(commandQueue.size);
  return { ok: true };
}

/**
 * Mandatory choice exception to the paused app driver (10 §5.3/D7).
 * Submit normally, then run bounded FIFO tick batches without changing pause ownership/speed.
 * Success means this decision was consumed and its pending event cleared or changed; a rejected,
 * aborted, or still-pending decision returns failure. UI always re-reads the actual pending event.
 */
export async function resolvePendingEventChoice(
  cmd: CmdResolveEventChoice,
): Promise<CommandDispatchResult> {
  if (!isCommandShape(cmd))
    throw new CoreError(
      'INVALID_COMMAND_SHAPE',
      'resolvePendingEventChoice: invalid command shape',
    );
  const game = store.getState().game;
  if (game === null) return { ok: false, reason: 'cmd.reject.notBooted' };
  if (game.meta.gameOver !== null) return { ok: false, reason: 'cmd.reject.gameOver' };
  const eventId = cmd.eventId;
  const invalid = (): CommandDispatchResult => ({ ok: false, reason: 'cmd.reject.invalidTarget' });
  const battleActive = (): boolean =>
    Object.values(game.battles).some(
      (battle) =>
        battle.result === null &&
        (battle.attackerClanId === game.meta.playerClanId ||
          battle.defenderClanId === game.meta.playerClanId),
    );
  if (
    cmd.type !== 'resolveEventChoice' ||
    game.events.pendingChoiceEventId !== eventId ||
    store.getState().session.fatalError !== null ||
    store.getState().session.viewportBlocked ||
    battleActive()
  )
    return invalid();
  prepareCommandLog(game);
  // Lazy initialization publishes pendingCount; a synchronous subscriber can replace this session.
  if (store.getState().game !== game || commandLogGame !== game) return invalid();
  const submittedQueue = commandQueue;
  cancelPendingDay('event-choice');
  const submittedSeq = submittedQueue.nextSequence;
  const result = dispatchCommand(cmd);
  if (!result.ok) return result;
  const maxBatches = Math.ceil(submittedQueue.size / BAL.maxCommandsPerTick);
  const current = (): boolean =>
    store.getState().game === game &&
    commandQueue === submittedQueue &&
    game.meta.gameOver === null &&
    store.getState().session.fatalError === null &&
    !store.getState().session.viewportBlocked &&
    !battleActive();
  const finished = (): CommandDispatchResult =>
    game.events.pendingChoiceEventId !== eventId ? { ok: true } : invalid();
  for (let batch = 0; batch < maxBatches; batch += 1) {
    if (!current()) return invalid();
    if (game.meta.lastAppliedCmdSeq >= submittedSeq) return finished();
    await runOneDayAsync();
    if (!current()) return invalid();
    if (game.meta.lastAppliedCmdSeq >= submittedSeq) return finished();
    if (batch + 1 < maxBatches) await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
  return invalid();
}

type AutoPauseHandler = (reasons: readonly AutoPauseReason[]) => void;
let autoPauseHandler: AutoPauseHandler | null = null;
let seasonalAutosave: { handler: () => void } | null = null;

/** App owns synchronous snapshot capture; the bridge signals canonical time.seasonStart ticks. */
export function registerSeasonalAutosave(handler: () => void): () => void {
  const registration = { handler };
  seasonalAutosave = registration;
  return () => {
    if (seasonalAutosave === registration) seasonalAutosave = null;
  };
}

/** autoPause.ts 安裝掛鉤用（01 §8 D17）；傳 null 解除安裝。 */
export function onAutoPauseReasons(handler: AutoPauseHandler | null): void {
  autoPauseHandler = handler;
}

/**
 * 每 tick 橋接流程（01 §3.4.4／§5.2）：drain 佇列→advanceDay→publishTick→自動暫停判定。
 *
 * 致命錯誤攔截（01 §3.10.2／M1-18）：`advanceDay` 以 try/catch 包住——core 內例外一律代表
 * 缺陷（§3.10.1「例外只用於缺陷」，不論是否為型別化的 `CoreError`），捕獲後經
 * `captureFatalError` 正規化並寫入 `session.fatalError`，顯示與 `ErrorBoundary.tsx` 相同的
 * 致命錯誤畫面（後者走 React 渲染例外，本路徑走 store 狀態，兩者為 01 §3.10.2 描述的兩個獨立
 * 攔截點，見 `src/app/errors.ts` 檔頭）。本函式不直接呼叫 `loop.stop()`（避免與 gameLoop.ts
 * 形成循環 import，同本檔既有 `onAutoPauseReasons` 慣例）：`gameLoop.ts` 的 `onFrame` 於每次
 * `runOneDay()` 後檢查 `session.fatalError`，非 null 時代為停止迴圈。
 */
export function runOneDay(): GameEvent[] {
  cancelPendingDay('synchronous-tick');
  if (store.getState().session.viewportBlocked) return [];
  const game = store.getState().game;
  if (game === null) {
    throw new CoreError('DATA_INTEGRITY', 'runOneDay: game 尚未初始化');
  }
  prepareCommandLog(game);
  if (store.getState().session.viewportBlocked) return [];
  const beforeDriverQueue = commandQueue;
  enqueueLiveArmyTargets(game);
  if (
    store.getState().game !== game ||
    commandLogGame !== game ||
    commandQueue !== beforeDriverQueue
  )
    return [];
  enqueuePendingAiOrders(game, commandQueue);
  const submittedQueue = commandQueue;
  const tickLiveDriver = liveDriver;
  const queue = commandQueue.drain();
  const startingSpeed = store.getState().session.speed;
  const startingDebugJumping = store.getState().session.debug.jumping;
  const beforeVersion = game.meta.stateVersion;
  const pendingPresentations = isDevInvariantTick(beforeVersion + 1)
    ? { game, publish: [] as (() => void)[] }
    : null;
  deferredTickPresentations = pendingPresentations;
  const t0 = performance.now(); // §3.9.4／M1-23：tick 耗時取樣（perfMonitor 環形緩衝）
  let result: TickResult;
  try {
    result = advanceDay(game, queue, { now: () => performance.now(), ...commandContext() });
  } catch (err) {
    if (deferredTickPresentations === pendingPresentations) deferredTickPresentations = null;
    if (
      store.getState().game !== game ||
      commandLogGame !== game ||
      commandQueue !== submittedQueue
    )
      return [];
    clearLiveDriver('tick-failed');
    if (
      store.getState().game !== game ||
      commandLogGame !== game ||
      commandQueue !== submittedQueue
    )
      return [];
    perfMonitor.recordTick(performance.now() - t0);
    store.getState().actions.setFatalError(captureFatalError(err));
    return [];
  }
  if (deferredTickPresentations === pendingPresentations) deferredTickPresentations = null;
  const elapsed = performance.now() - t0;
  if (store.getState().game !== game || commandLogGame !== game || commandQueue !== submittedQueue)
    return [];
  return finishDay(
    {
      game,
      submittedQueue,
      tickLiveDriver,
      queue,
      startingSpeed,
      startingDebugJumping,
      beforeVersion,
      pendingPresentations,
      elapsed,
    },
    result,
  );
}

interface DayPublication {
  game: GameState;
  submittedQueue: CommandQueue;
  tickLiveDriver: LiveDriverRegistration | null;
  queue: readonly CommandEnvelope[];
  startingSpeed: import('./store').GameSpeed;
  startingDebugJumping: import('./store').DebugSessionState['jumping'];
  beforeVersion: number;
  pendingPresentations: { game: GameState; publish: (() => void)[] } | null;
  elapsed: number;
}

function finishDay(context: DayPublication, result: TickResult): GameEvent[] {
  const {
    game,
    submittedQueue,
    tickLiveDriver,
    queue,
    startingSpeed,
    startingDebugJumping,
    beforeVersion,
    pendingPresentations,
    elapsed,
  } = context;
  perfMonitor.recordTick(elapsed);
  perfMonitor.recordSystems(
    Object.fromEntries(
      STEP_SEQUENCE.map((name, index) => [
        name === 'ai' ? 'ai' : name,
        result.perf.stepMs[index] ?? 0,
      ]),
    ),
  );
  commandLogRecorder.recordTick(result.appliedCommands, {
    ...(result.appliedCommands.length === queue.length
      ? {}
      : { incompleteReason: 'hardRejection' as const }),
  });
  try {
    checkDevInvariantsAfterTick(game, beforeVersion);
  } catch (err) {
    if (
      store.getState().game !== game ||
      commandLogGame !== game ||
      commandQueue !== submittedQueue
    )
      return [];
    clearLiveDriver('tick-failed');
    if (
      store.getState().game !== game ||
      commandLogGame !== game ||
      commandQueue !== submittedQueue
    )
      return [];
    store.getState().actions.setFatalError(captureFatalError(err));
    return [];
  }
  for (const publish of pendingPresentations?.publish ?? []) {
    if (
      store.getState().game !== game ||
      commandLogGame !== game ||
      commandQueue !== submittedQueue
    )
      return [];
    publish();
  }
  if (store.getState().game !== game || commandLogGame !== game || commandQueue !== submittedQueue)
    return [];
  if (game.meta.gameOver !== null) resetEventPresentations(game);
  else synchronizePendingEventPresentations(game);
  if (startingDebugJumping === null) {
    publishCapturedOfficers(
      game,
      result.events,
      () =>
        store.getState().game === game &&
        commandLogGame === game &&
        commandQueue === submittedQueue,
    );
  }
  if (store.getState().game !== game || commandLogGame !== game || commandQueue !== submittedQueue)
    return result.events;
  publishMonthSummary(game, result, startingSpeed === 'paused' ? null : startingSpeed, {
    eventTitle: (id) => sessionEventEngine?.getDef(id)?.cutscene.title,
  });
  if (store.getState().game !== game || commandLogGame !== game || commandQueue !== submittedQueue)
    return result.events;
  store.setState((s) => ({ tickSeq: s.tickSeq + 1 }));
  if (store.getState().game !== game || commandLogGame !== game || commandQueue !== submittedQueue)
    return result.events;
  store.getState().actions.setPendingCommandCount(commandQueue.size);
  if (store.getState().game !== game || commandLogGame !== game || commandQueue !== submittedQueue)
    return result.events;
  // 月結自動存檔（03 §3.9.1：驅動器讀 autosaveDue 旗標；debug 時間跳轉期間抑制）。
  if (result.autosaveDue === 'monthly' && startingDebugJumping === null) {
    if (seasonalAutosave !== null) {
      if (result.events.some((event) => event.type === 'time.seasonStart'))
        seasonalAutosave.handler();
    } else {
      autosave(game, commandQueue.snapshotPlayerCommands());
    }
  }
  autoPauseHandler?.(result.autoPauseReasons);
  if (
    tickLiveDriver &&
    liveDriver === tickLiveDriver &&
    commandQueue === submittedQueue &&
    tickLiveDriver.game === game &&
    store.getState().game === game
  ) {
    try {
      tickLiveDriver.driver.afterDay(game, result);
    } catch (error) {
      if (liveDriver === tickLiveDriver)
        clearLiveDriver(error instanceof Error ? error.message : 'live-observer-failure');
    }
  }
  return result.events;
}

/** 匯出目前局的 success-only command log；檔案的 hash 對應匯出當下狀態。 */
export function exportCommandLog(): CommandLogFile {
  cancelPendingDay('log-boundary');
  const game = store.getState().game;
  if (game === null) {
    throw new CoreError('DATA_INTEGRITY', 'exportCommandLog: game 尚未初始化');
  }
  prepareCommandLog(game);
  return commandLogRecorder.export(game);
}

/** 供測試重置模組私有佇列與回呼（非產品程式碼路徑）。 */
export function resetBridgeForTests(): void {
  cancelPendingDay('test-reset');
  dayExecutor = null;
  deferredTickPresentations = null;
  clearLiveDriver('test-reset');
  unsubscribeEventPresentations?.();
  unsubscribeEventPresentations = null;
  resetEventPresentations(null);
  resetCapturedOfficerPresentations();
  resetMonthSummaries(null);
  sessionEventEngine = null;
  commandQueue = new CommandQueue();
  commandLogGame = null;
  commandLogRecorder.reset();
  autoPauseHandler = null;
  seasonalAutosave = null;
}

/** 供測試直接觸發已註冊的自動暫停回呼（非產品程式碼路徑）：M1 骨架期 `advanceDay` 的
 * `autoPauseReasons` 恆為空陣列（Step 13 尚未實作），無法透過真實 `runOneDay()` 產生非空案例；
 * 本函式讓 tests/app/autoPause.spec.ts 得以驗證 installAutoPause↔bridge 轉譯管線本身。 */
export function triggerAutoPauseHandlerForTests(reasons: readonly AutoPauseReason[]): void {
  autoPauseHandler?.(reasons);
}
