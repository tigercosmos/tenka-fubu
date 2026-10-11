import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  continueMonthSummary,
  dismissMonthSummaryToast,
  getMonthSummaryView,
  monthSummaryStore,
  publishMonthSummary,
  resetMonthSummaries,
} from '../../src/app/monthSummaryFlow';
import {
  resetGameStoreForTests,
  setGame,
  store,
  type GameSpeed,
  type PauseReason,
} from '../../src/app/store';
import { settingsStore } from '../../src/app/settings/runtime';
import { useUIStore } from '../../src/ui/hooks/uiStore';
import { advanceDay } from '../../src/core/systems';
import { calendarToDay, dayToCalendar } from '../../src/core/systems/time';
import { proposalOfficerCooldownKey } from '../../src/core/systems/proposals';
import { canonicalStringify } from '../../src/core/state/serialize';
import { initializeBridgeSession, resetBridgeForTests, runOneDay } from '../../src/app/bridge';
import { buildTinyState } from '../fixtures/tiny';

beforeEach(() => {
  resetBridgeForTests();
  resetMonthSummaries(null);
  useUIStore.getState().actions.reset();
  resetGameStoreForTests(null);
  settingsStore.getState().resetSettings();
});
afterEach(() => {
  resetBridgeForTests();
  resetMonthSummaries(null);
  useUIStore.getState().actions.reset();
  resetGameStoreForTests(null);
});

function opening(speed: GameSpeed = 'x2', allowProposals = false) {
  const game = buildTinyState();
  const day = calendarToDay(1560, 4, 30);
  game.time = { day, ...dayToCalendar(day) };
  if (!allowProposals)
    for (const officer of Object.values(game.officers))
      game.events.cooldownUntil[proposalOfficerCooldownKey(officer.id)] = day + 60;
  resetGameStoreForTests(game);
  store.getState().actions.setScreen('main');
  if (speed === 'paused') store.getState().actions.requestPause('user');
  else store.getState().actions.setSpeed(speed);
  const result = advanceDay(game, []);
  expect(result.monthOpeningSettlement).toBeDefined();
  return { game, result };
}

function viewKey() {
  const view = monthSummaryStore.getState().view;
  expect(view).not.toBeNull();
  if (!view) throw new Error('Expected actual opening summary view');
  return view.key;
}

describe('session-owned actual month-opening summary flow', () => {
  it.each(['unblock', 'view-cleared'] as const)(
    'a new owner enqueued by the %s observer retains the accepted flow until it drains',
    (boundary) => {
      const { game, result } = opening();
      publishMonthSummary(game, result, 'x2');
      const key = viewKey();
      const before = canonicalStringify(game);
      let enqueued = false;
      const enqueue = () => {
        if (enqueued) return;
        enqueued = true;
        useUIStore.getState().actions.enqueueModal({
          id: 'confirm',
          params: { owner: 'observer-owned' },
          pausesTime: true,
        });
      };
      const unsubscribe =
        boundary === 'unblock'
          ? useUIStore.subscribe((ui, previous) => {
              if (previous.queueResumeBlocked && !ui.queueResumeBlocked) enqueue();
            })
          : monthSummaryStore.subscribe((current, previous) => {
              if (previous.view !== null && current.view === null) enqueue();
            });
      try {
        expect(continueMonthSummary(game, key)).toBe(true);
      } finally {
        unsubscribe();
      }
      expect(enqueued).toBe(true);
      expect(useUIStore.getState().modal).toMatchObject({
        id: 'confirm',
        params: { owner: 'observer-owned' },
      });
      expect(store.getState().session.speed).toBe('paused');
      expect(canonicalStringify(game)).toBe(before);
      useUIStore.getState().actions.closeModal();
      expect(store.getState().session.speed).toBe('x2');
      expect(canonicalStringify(game)).toBe(before);
    },
  );

  it.each(['replace', 'viewport-recovery'] as const)(
    'a reentrant %s during drain never restores an obsolete running speed',
    (kind) => {
      const { game, result } = opening();
      publishMonthSummary(game, result, 'x2');
      const key = viewKey();
      let interrupted = false;
      const unsubscribe = useUIStore.subscribe((ui, previous) => {
        if (interrupted || !previous.queueResumeBlocked || ui.queueResumeBlocked) return;
        interrupted = true;
        if (kind === 'replace') setGame(buildTinyState());
        else {
          store.getState().actions.setViewportBlocked(true);
          store.getState().actions.setViewportBlocked(false);
        }
      });
      try {
        expect(continueMonthSummary(game, key)).toBe(true);
      } finally {
        unsubscribe();
      }
      expect(interrupted).toBe(true);
      expect(store.getState().session.speed).toBe('paused');
      expect(monthSummaryStore.getState().view).toBeNull();
    },
  );

  it.each(['replace', 'same-object-reset'] as const)(
    'a reentrant %s aborts publication and removes old monthly owners',
    (kind) => {
      const { game, result } = opening('x2', true);
      const next = kind === 'replace' ? buildTinyState() : game;
      let reset = false;
      const unsubscribe = useUIStore.subscribe((ui) => {
        if (reset || (ui.modalQueue.length === 0 && ui.modal === null)) return;
        reset = true;
        if (kind === 'replace') setGame(next);
        else resetMonthSummaries(game);
      });
      try {
        publishMonthSummary(game, result, 'x2');
      } finally {
        unsubscribe();
      }
      expect(reset).toBe(true);
      expect(monthSummaryStore.getState().view).toBeNull();
      expect(monthSummaryStore.getState().toast).toBeNull();
      expect(useUIStore.getState().modal).toBeNull();
      expect(useUIStore.getState().modalQueue).toEqual([]);
      expect(store.getState().session.speed).toBe('paused');
    },
  );

  it('real bridge publishes proposals and summary before notifying the tick observer', () => {
    const game = buildTinyState();
    const day = calendarToDay(1560, 4, 30);
    game.time = { day, ...dayToCalendar(day) };
    resetGameStoreForTests(game);
    store.getState().actions.setScreen('main');
    store.getState().actions.setSpeed('x2');
    initializeBridgeSession(game);
    const observations: {
      tickSeq: number;
      owner: string | undefined;
      queued: string[];
      key: string | undefined;
    }[] = [];
    const unsubscribe = store.subscribe((current, previous) => {
      if (current.tickSeq === previous.tickSeq) return;
      observations.push({
        tickSeq: current.tickSeq,
        owner: useUIStore.getState().modal?.id,
        queued: useUIStore.getState().modalQueue.map((modal) => modal.id),
        key: monthSummaryStore.getState().view?.key,
      });
    });
    try {
      const events = runOneDay();
      expect(events.some((event) => event.type === 'time.monthStart')).toBe(true);
    } finally {
      unsubscribe();
    }
    expect(observations).toEqual([
      { tickSeq: 1, owner: 'proposalInbox', queued: ['monthSummary'], key: viewKey() },
    ]);
    const before = canonicalStringify(game);
    expect(continueMonthSummary(game, viewKey())).toBe(false);
    useUIStore.getState().actions.closeModal();
    expect(continueMonthSummary(game, viewKey())).toBe(true);
    expect(canonicalStringify(game)).toBe(before);
    expect(store.getState().tickSeq).toBe(1);
    expect(store.getState().session.speed).toBe('x2');
  });

  it.each(['siegeOnPlayer', 'battleAvailable'] as const)(
    'does not acquire an enabled independent %s pause',
    (reason) => {
      const { game, result } = opening();
      // App boundary predicate coverage; the settlement itself comes from a real tick.
      publishMonthSummary(game, { ...result, autoPauseReasons: [reason] }, 'x2');
      expect(continueMonthSummary(game, viewKey())).toBe(true);
      expect(store.getState().session.speed).toBe('paused');
    },
  );

  it('reset removes only its owned descriptor and activates an unrelated waiting owner without resuming', () => {
    const { game, result } = opening();
    publishMonthSummary(game, result, 'x2');
    useUIStore
      .getState()
      .actions.enqueueModal({ id: 'confirm', params: { owner: 'unrelated' }, pausesTime: true });
    resetMonthSummaries(game);
    expect(useUIStore.getState().modal).toMatchObject({
      id: 'confirm',
      params: { owner: 'unrelated' },
    });
    expect(monthSummaryStore.getState().view).toBeNull();
    expect(store.getState().session.speed).toBe('paused');
  });

  it('publishes a detached view once, keeps core/RNG unchanged, and resumes its own running speed after continuation', () => {
    const { game, result } = opening('x5');
    const before = canonicalStringify(game);
    publishMonthSummary(game, result, 'x5');
    const key = viewKey();
    expect(useUIStore.getState().modal).toMatchObject({
      id: 'monthSummary',
      params: { summaryKey: key },
    });
    expect(store.getState().session.speed).toBe('paused');
    const view = getMonthSummaryView(game, key);
    expect(view).toMatchObject({ year: 1560, month: 5 });
    publishMonthSummary(game, result, 'x5');
    expect(useUIStore.getState().modalQueue).toEqual([]);
    expect(getMonthSummaryView(game, key)).toBe(view);
    expect(canonicalStringify(game)).toBe(before);
    expect(continueMonthSummary(game, 'wrong-key')).toBe(false);
    expect(continueMonthSummary(game, key)).toBe(true);
    expect(useUIStore.getState().modal).toBeNull();
    expect(store.getState().session.speed).toBe('x5');
    expect(continueMonthSummary(game, key)).toBe(false);
    expect(canonicalStringify(game)).toBe(before);
  });

  it('queues existing event ownership, a real pending proposal, then summary without duplicate descriptors', () => {
    const { game, result } = opening('x2', true);
    expect(
      Object.values(game.proposals).some(
        (proposal) => proposal.clanId === game.meta.playerClanId && proposal.status === 'pending',
      ),
    ).toBe(true);
    useUIStore.getState().actions.enqueueModal({
      id: 'event',
      params: { presentationId: 'existing-owned-event' },
      pausesTime: true,
    });
    const before = canonicalStringify(game);
    publishMonthSummary(game, result, 'x2');
    publishMonthSummary(game, result, 'x2');
    expect(useUIStore.getState().modal?.id).toBe('event');
    expect(useUIStore.getState().modalQueue.map((item) => item.id)).toEqual([
      'proposalInbox',
      'monthSummary',
    ]);
    const key = viewKey();
    expect(continueMonthSummary(game, key)).toBe(false);
    useUIStore.getState().actions.closeModal();
    expect(useUIStore.getState().modal?.id).toBe('proposalInbox');
    expect(store.getState().session.speed).toBe('paused');
    useUIStore.getState().actions.closeModal();
    expect(useUIStore.getState().modal?.id).toBe('monthSummary');
    expect(continueMonthSummary(game, key)).toBe(true);
    expect(store.getState().session.speed).toBe('x2');
    expect(canonicalStringify(game)).toBe(before);
  });

  it('does not resume until a later ordinary owner has also drained', () => {
    const { game, result } = opening();
    publishMonthSummary(game, result, 'x2');
    const key = viewKey();
    useUIStore
      .getState()
      .actions.enqueueModal({ id: 'confirm', params: { owner: 'later' }, pausesTime: false });
    expect(continueMonthSummary(game, key)).toBe(true);
    expect(useUIStore.getState().modal?.id).toBe('confirm');
    expect(store.getState().session.speed).toBe('paused');
    useUIStore.getState().actions.closeModal();
    expect(store.getState().session.speed).toBe('x2');
  });

  it('never acquires a pre-existing manual pause', () => {
    const { game, result } = opening('paused');
    publishMonthSummary(game, result, null);
    expect(continueMonthSummary(game, viewKey())).toBe(true);
    expect(store.getState().session.speed).toBe('paused');
  });

  it.each<PauseReason>(['user', 'windowHidden', 'fatalError'])(
    'a newer %s pause permanently cancels monthly restoration through later queue drain',
    (reason) => {
      const { game, result } = opening();
      publishMonthSummary(game, result, 'x2');
      const key = viewKey();
      useUIStore.getState().actions.enqueueModal({ id: 'confirm', params: {}, pausesTime: false });
      store.getState().actions.requestPause(reason);
      expect(continueMonthSummary(game, key)).toBe(true);
      useUIStore.getState().actions.closeModal();
      expect(store.getState().session.speed).toBe('paused');
    },
  );

  it('viewport recovery does not revive the flow-owned pause', () => {
    const { game, result } = opening();
    publishMonthSummary(game, result, 'x2');
    const key = viewKey();
    store.getState().actions.setViewportBlocked(true);
    store.getState().actions.setViewportBlocked(false);
    expect(continueMonthSummary(game, key)).toBe(true);
    expect(store.getState().session.speed).toBe('paused');
  });

  it('an actual fatal error prevents restoration even without a second pause request', () => {
    const { game, result } = opening();
    publishMonthSummary(game, result, 'x2');
    const key = viewKey();
    store
      .getState()
      .actions.setFatalError({ code: 'TEST', message: 'actual session fault', stack: '' });
    expect(continueMonthSummary(game, key)).toBe(true);
    expect(store.getState().session.speed).toBe('paused');
  });

  it('disabled month-start pause publishes only an owned dismissible toast while preserving a mandatory event', () => {
    const { game, result } = opening();
    settingsStore.getState().updateSettings({ autoPause: { monthStart: false } });
    useUIStore.getState().actions.enqueueModal({
      id: 'event',
      params: { presentationId: 'mandatory' },
      pausesTime: true,
    });
    const before = canonicalStringify(game);
    publishMonthSummary(game, result, 'x2');
    const toast = monthSummaryStore.getState().toast;
    expect(toast).toMatchObject({ year: 1560, month: 5 });
    expect(useUIStore.getState().modal?.id).toBe('event');
    expect(useUIStore.getState().modalQueue).toEqual([]);
    expect(continueMonthSummary(game, toast!.key)).toBe(false);
    dismissMonthSummaryToast(game, 'wrong-key');
    expect(monthSummaryStore.getState().toast).toBe(toast);
    dismissMonthSummaryToast(game, toast!.key);
    expect(monthSummaryStore.getState().toast).toBeNull();
    expect(canonicalStringify(game)).toBe(before);
  });

  it('rejects stale sessions, resets cache, and does not resurrect a cancelled flow on returning to main', () => {
    const { game, result } = opening();
    publishMonthSummary(game, result, 'x2');
    const key = viewKey();
    store.getState().actions.setScreen('battle');
    store.getState().actions.setScreen('main');
    expect(continueMonthSummary(game, key)).toBe(true);
    expect(store.getState().session.speed).toBe('paused');
    const next = buildTinyState();
    resetGameStoreForTests(next);
    store.getState().actions.setScreen('main');
    resetMonthSummaries(next);
    expect(getMonthSummaryView(game, key)).toBeNull();
    expect(continueMonthSummary(game, key)).toBe(false);
    publishMonthSummary(game, result, 'x2');
    expect(monthSummaryStore.getState().view).toBeNull();
    expect(useUIStore.getState().modal).toBeNull();
    expect(store.getState().session.speed).toBe('paused');
  });

  it('skips non-opening ticks, ending screens, debug jumps, and foreign screen ownership', () => {
    const { game } = opening();
    const ordinary = advanceDay(game, []);
    publishMonthSummary(game, ordinary, 'x2');
    expect(monthSummaryStore.getState().view).toBeNull();
    for (const screen of ['title', 'battle', 'ending'] as const) {
      const next = opening();
      store.getState().actions.setScreen(screen);
      publishMonthSummary(next.game, next.result, 'x2');
      expect(monthSummaryStore.getState().view).toBeNull();
    }
    const jumping = opening();
    store.getState().actions.setDebugJumping({ doneDays: 0, totalDays: 1 });
    publishMonthSummary(jumping.game, jumping.result, 'x2');
    expect(monthSummaryStore.getState().view).toBeNull();
    store.getState().actions.setDebugJumping(null);
    jumping.game.meta.gameOver = { kind: 'defeat', endingId: 'no-heir' };
    publishMonthSummary(jumping.game, jumping.result, 'x2');
    expect(monthSummaryStore.getState().view).toBeNull();
  });
});
