import { createStore } from 'zustand/vanilla';
import type { GameState } from '@core/state/gameState';
import type { TickResult } from '@core/systems';
import { store, type GameSpeed } from './store';
import { settingsStore } from './settings/runtime';
import { uiStore } from '../ui/hooks/uiStore';
import { buildMonthSummaryView, type MonthSummaryView } from '../ui/reports/monthSummary';
import type { ReportPresentationOptions } from '../ui/reports/renderReport';

type RunningSpeed = Exclude<GameSpeed, 'paused'>;
interface MonthlyFlow {
  readonly game: GameState;
  readonly speed: RunningSpeed | null;
  canResume: boolean;
  accepted: boolean;
}

/** Presentation only: neither this cache nor its continuation state enters a save file. */
export const monthSummaryStore = createStore<{
  game: GameState | null;
  view: MonthSummaryView | null;
  toast: MonthSummaryView | null;
}>()(() => ({ game: null, view: null, toast: null }));

let owner: GameState | null = null;
let flow: MonthlyFlow | null = null;
let nextKey = 1;
let generation = 0;
let finishing = false;
let lastPublishedDay: number | null = null;
const views = new Map<string, MonthSummaryView>();
const ownedKeys = new Set<string>();
const ownedReasons = new Set(['modalOpen', 'monthStart', 'proposalArrived', 'diploEnvoy']);

function tryFinish(): void {
  const pending = flow;
  const ui = uiStore.getState();
  if (pending === null && ui.modal === null && ui.modalQueue.length === 0) {
    ownedKeys.clear();
    return;
  }
  if (finishing || !pending?.accepted || ui.modal !== null || ui.modalQueue.length > 0) return;
  const revision = generation;
  finishing = true;
  try {
    views.clear();
    ownedKeys.clear();
    // Keep cancellation live while synchronous subscribers observe both publication boundaries.
    uiStore.setState({ queueResumeBlocked: false, restoreSpeedOnQueueDrain: false });
    if (revision !== generation || flow !== pending) return;
    const afterUnblock = uiStore.getState();
    if (afterUnblock.modal !== null || afterUnblock.modalQueue.length > 0) {
      uiStore.setState({ queueResumeBlocked: true, restoreSpeedOnQueueDrain: false });
      return;
    }
    monthSummaryStore.setState({ view: null });
    if (revision !== generation || flow !== pending) return;
    const afterPublication = uiStore.getState();
    if (afterPublication.modal !== null || afterPublication.modalQueue.length > 0) {
      uiStore.setState({ queueResumeBlocked: true, restoreSpeedOnQueueDrain: false });
      return;
    }
    const { game, session } = store.getState();
    const resume =
      pending.canResume &&
      pending.speed !== null &&
      game === pending.game &&
      game.meta.gameOver === null &&
      session.screen === 'main' &&
      session.speed === 'paused' &&
      ownedReasons.has(session.lastPauseReason ?? '') &&
      !session.viewportBlocked &&
      session.fatalError === null;
    flow = null;
    if (resume && pending.speed !== null) store.getState().actions.setSpeed(pending.speed);
  } finally {
    finishing = false;
  }
}

/** Clears only monthly descriptors; reset/load/ending never restores the old session's speed. */
export function resetMonthSummaries(game: GameState | null): void {
  const revision = ++generation;
  const keys = new Set([...ownedKeys, ...views.keys()]);
  const ui = uiStore.getState();
  const owns = (modal: NonNullable<typeof ui.modal>) =>
    (modal.id === 'monthSummary' && keys.has(modal.params.summaryKey ?? '')) ||
    keys.has(modal.params.monthSummaryOwner ?? '');
  const activeOwned = ui.modal !== null && owns(ui.modal);
  const hadFlow = flow !== null;
  flow = null;
  views.clear();
  ownedKeys.clear();
  lastPublishedDay = null;
  owner = game;
  uiStore.setState({
    modalQueue: ui.modalQueue.filter((modal) => !owns(modal)),
    queueResumeBlocked: activeOwned,
    ...(hadFlow || activeOwned ? { restoreSpeedOnQueueDrain: false } : {}),
  });
  if (revision !== generation) return;
  if (activeOwned && uiStore.getState().modal === ui.modal) ui.actions.closeModal();
  if (revision !== generation) return;
  uiStore.setState({
    queueResumeBlocked: false,
    ...(hadFlow ? { restoreSpeedOnQueueDrain: false } : {}),
  });
  if (revision !== generation) return;
  monthSummaryStore.setState({ game, view: null, toast: null });
}

/** Reads never initialize a session, dispatch a command, drain a queue, or manufacture history. */
export function getMonthSummaryView(game: GameState | null, key: string): MonthSummaryView | null {
  return game !== null && game === owner && game === store.getState().game
    ? (views.get(key) ?? null)
    : null;
}

export function dismissMonthSummaryToast(game: GameState | null, key: string): void {
  const current = monthSummaryStore.getState();
  if (game === owner && game === store.getState().game && current.toast?.key === key)
    monthSummaryStore.setState({ toast: null });
}

/** Existing arrival behavior is preserved; synchronous insertion keeps arrivals ahead of summary. */
function queueArrivals(game: GameState, key: string, current: () => boolean): boolean {
  const queued = new Set(uiStore.getState().queuedDecisionIds);
  for (const envoy of game.diplomacy.pendingProposals) {
    if (!current()) return false;
    if (envoy.toClanId !== game.meta.playerClanId || queued.has(envoy.id)) continue;
    const ui = uiStore.getState();
    if (
      ui.modal?.params.proposalId === envoy.id ||
      ui.modalQueue.some((modal) => modal.params.proposalId === envoy.id)
    )
      continue;
    ui.actions.enqueueModal({
      id: 'envoy',
      params: { proposalId: envoy.id, monthSummaryOwner: key },
      pausesTime: true,
    });
  }
  if (!current()) return false;
  const hasProposals = Object.values(game.proposals).some(
    (proposal) =>
      proposal.clanId === game.meta.playerClanId &&
      proposal.status === 'pending' &&
      !queued.has(proposal.id),
  );
  const ui = uiStore.getState();
  if (
    hasProposals &&
    ui.modal?.id !== 'proposalInbox' &&
    !ui.modalQueue.some((modal) => modal.id === 'proposalInbox')
  )
    ui.actions.enqueueModal({
      id: 'proposalInbox',
      params: { monthSummaryOwner: key },
      pausesTime: true,
    });
  return current();
}

/** Bridge calls this after event synchronization and before publishing the tick to React. */
export function publishMonthSummary(
  game: GameState,
  result: TickResult,
  wasRunningSpeed: RunningSpeed | null,
  options: ReportPresentationOptions = {},
): void {
  const session = store.getState().session;
  const opening = result.monthOpeningSettlement;
  if (
    store.getState().game !== game ||
    result.state !== game ||
    game.meta.gameOver !== null ||
    session.screen !== 'main' ||
    session.debug.jumping !== null ||
    opening === undefined ||
    opening.day !== game.time.day ||
    opening.dayOfMonth !== 1 ||
    !result.events.some((event) => event.type === 'time.monthStart')
  )
    return;
  if (owner !== game) resetMonthSummaries(game);
  const revision = generation;
  const current = () =>
    generation === revision &&
    owner === game &&
    store.getState().game === game &&
    game.meta.gameOver === null;
  if (!current() || (lastPublishedDay !== null && opening.day <= lastPublishedDay)) return;
  lastPublishedDay = opening.day;
  const view = Object.freeze({
    ...buildMonthSummaryView(game, opening, options),
    key: `month-summary:${nextKey++}:${opening.day}`,
  });
  if (!current()) return;
  if (!settingsStore.getState().settings.autoPause.monthStart) {
    monthSummaryStore.setState({ game, view: null, toast: view });
    return;
  }
  views.set(view.key, view);
  ownedKeys.add(view.key);
  if (flow === null) {
    const preferences = settingsStore.getState().settings.autoPause;
    const independentPause = result.autoPauseReasons.some(
      (reason) =>
        (reason === 'siegeOnPlayer' && preferences.siege) ||
        (reason === 'battleAvailable' && preferences.battle),
    );
    flow = {
      game,
      speed: wasRunningSpeed,
      canResume:
        wasRunningSpeed !== null &&
        !independentPause &&
        !session.viewportBlocked &&
        session.fatalError === null &&
        (session.speed !== 'paused' || ownedReasons.has(session.lastPauseReason ?? '')),
      accepted: false,
    };
  }
  uiStore.setState({ queueResumeBlocked: true });
  if (!current()) return;
  if (store.getState().session.speed !== 'paused')
    store.getState().actions.requestPause('monthStart');
  if (!current() || !queueArrivals(game, view.key, current)) return;
  uiStore.getState().actions.enqueueModal({
    id: 'monthSummary',
    params: { summaryKey: view.key },
    pausesTime: true,
  });
  if (!current()) return;
  monthSummaryStore.setState({ game, view, toast: null });
}

/** Only the visible monthly owner can acknowledge; decisions remain queued until a normal tick. */
export function continueMonthSummary(game: GameState | null, key: string): boolean {
  const ui = uiStore.getState();
  if (
    game === null ||
    game !== owner ||
    game !== store.getState().game ||
    store.getState().session.screen !== 'main' ||
    ui.modal?.id !== 'monthSummary' ||
    ui.modal.params.summaryKey !== key ||
    !views.has(key) ||
    flow === null
  )
    return false;
  views.delete(key);
  flow.accepted = true;
  ui.actions.closeModal();
  tryFinish();
  return true;
}

/** Transfer the visible summary into the same FIFO before accepting its pause owner. */
export function openMonthSummaryRewards(game: GameState | null, key: string): boolean {
  const ui = uiStore.getState();
  const session = store.getState().session;
  if (
    game === null ||
    game !== owner ||
    game !== store.getState().game ||
    session.screen !== 'main' ||
    session.fatalError !== null ||
    session.viewportBlocked ||
    game.meta.gameOver !== null ||
    ui.modal?.id !== 'monthSummary' ||
    ui.modal.params.summaryKey !== key ||
    !views.has(key) ||
    flow === null
  )
    return false;
  ui.actions.enqueueModal({ id: 'rewards', params: { monthSummaryOwner: key }, pausesTime: true });
  return continueMonthSummary(game, key);
}

/** A non-pausing notification uses the ordinary dialog pause, but retains session cleanup ownership. */
export function openMonthSummaryToastRewards(game: GameState | null, key: string): boolean {
  const current = monthSummaryStore.getState();
  const session = store.getState().session;
  if (
    game === null ||
    game !== owner ||
    game !== store.getState().game ||
    current.game !== game ||
    current.toast?.key !== key ||
    session.screen !== 'main' ||
    session.fatalError !== null ||
    session.viewportBlocked ||
    game.meta.gameOver !== null ||
    flow !== null
  )
    return false;
  ownedKeys.add(key);
  const pending: MonthlyFlow = {
    game,
    speed: session.speed === 'paused' ? null : session.speed,
    canResume: session.speed !== 'paused',
    accepted: false,
  };
  flow = pending;
  uiStore.setState({ queueResumeBlocked: true });
  uiStore
    .getState()
    .actions.enqueueModal({ id: 'rewards', params: { monthSummaryOwner: key }, pausesTime: true });
  if (game !== owner || game !== store.getState().game || flow !== pending) return false;
  pending.accepted = true;
  dismissMonthSummaryToast(game, key);
  return true;
}

uiStore.subscribe(tryFinish);
store.subscribe((current) => {
  if (owner === null) return;
  if (
    current.game !== owner ||
    current.session.screen === 'title' ||
    current.session.screen === 'ending' ||
    owner.meta.gameOver !== null
  ) {
    resetMonthSummaries(current.game);
    return;
  }
  if (
    flow !== null &&
    (current.session.screen !== 'main' ||
      current.session.viewportBlocked ||
      current.session.fatalError !== null ||
      current.session.speed !== 'paused' ||
      !ownedReasons.has(current.session.lastPauseReason ?? ''))
  )
    flow.canResume = false;
});
