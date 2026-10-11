import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  openMonthSummaryRewards,
  openMonthSummaryToastRewards,
  monthSummaryStore,
  publishMonthSummary,
  resetMonthSummaries,
} from '../../src/app/monthSummaryFlow';
import { resetGameStoreForTests, setGame, store } from '../../src/app/store';
import { settingsStore } from '../../src/app/settings/runtime';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { advanceDay } from '../../src/core/systems';
import { calendarToDay, dayToCalendar } from '../../src/core/systems/time';
import { proposalOfficerCooldownKey } from '../../src/core/systems/proposals';
import { canonicalStringify } from '../../src/core/state/serialize';
import { buildTinyState } from '../fixtures/tiny';

function reset() {
  resetMonthSummaries(null);
  uiStore.getState().actions.reset();
  resetGameStoreForTests(null);
  settingsStore.getState().resetSettings();
}
beforeEach(reset);
afterEach(reset);
function opening(autoPause = true) {
  const game = buildTinyState();
  const day = calendarToDay(1560, 4, 30);
  game.time = { day, ...dayToCalendar(day) };
  for (const officer of Object.values(game.officers))
    game.events.cooldownUntil[proposalOfficerCooldownKey(officer.id)] = day + 60;
  resetGameStoreForTests(game);
  store.getState().actions.setScreen('main');
  store.getState().actions.setSpeed('x2');
  if (!autoPause) {
    const settings = settingsStore.getState().settings;
    settingsStore.setState({
      settings: { ...settings, autoPause: { ...settings.autoPause, monthStart: false } },
    });
  }
  const result = advanceDay(game, []);
  publishMonthSummary(game, result, 'x2');
  const view = autoPause ? monthSummaryStore.getState().view : monthSummaryStore.getState().toast;
  if (!view) throw new Error('Expected actual monthly notification');
  return { game, key: view.key };
}
describe('monthly reward navigation ownership', () => {
  it.each([true, false])(
    'a synchronous game replacement during reward enqueue cannot leave an old dialog (autoPause=%s)',
    (autoPause) => {
      const { game, key } = opening(autoPause);
      let changed = false;
      const unsubscribe = uiStore.subscribe((ui) => {
        if (!changed && ui.modalQueue.some((m) => m.id === 'rewards')) {
          changed = true;
          setGame(buildTinyState());
        }
      });
      try {
        const open = autoPause ? openMonthSummaryRewards : openMonthSummaryToastRewards;
        expect(open(game, key)).toBe(false);
      } finally {
        unsubscribe();
      }
      expect(changed).toBe(true);
      expect(uiStore.getState().modal).toBeNull();
      expect(uiStore.getState().modalQueue).toEqual([]);
      expect(store.getState().session.speed).toBe(autoPause ? 'paused' : 'x2');
    },
  );
  it('queues rewards before accepting summary, stays paused until close, and never writes game state', () => {
    const { game, key } = opening();
    const before = canonicalStringify(game);
    expect(openMonthSummaryRewards(game, key)).toBe(true);
    expect(uiStore.getState().modal).toMatchObject({
      id: 'rewards',
      params: { monthSummaryOwner: key },
    });
    expect(store.getState().session.speed).toBe('paused');
    expect(openMonthSummaryRewards(game, key)).toBe(false);
    expect(canonicalStringify(game)).toBe(before);
    uiStore.getState().actions.closeModal();
    expect(store.getState().session.speed).toBe('x2');
  });
  it('preserves the existing FIFO ahead of the reward dialog', () => {
    const { game, key } = opening();
    uiStore.getState().actions.enqueueModal({
      id: 'confirm',
      params: { owner: 'later-decision' },
      pausesTime: true,
    });
    expect(openMonthSummaryRewards(game, key)).toBe(true);
    expect(uiStore.getState().modal?.id).toBe('confirm');
    expect(uiStore.getState().modalQueue.map((m) => m.id)).toEqual(['rewards']);
    uiStore.getState().actions.closeModal();
    expect(uiStore.getState().modal?.id).toBe('rewards');
    expect(store.getState().session.speed).toBe('paused');
    uiStore.getState().actions.closeModal();
    expect(store.getState().session.speed).toBe('x2');
  });
  it('rejects wrong keys and stale session callbacks without adding a dialog', () => {
    const { game, key } = opening();
    expect(openMonthSummaryRewards(game, 'wrong')).toBe(false);
    setGame(buildTinyState());
    expect(openMonthSummaryRewards(game, key)).toBe(false);
    expect(uiStore.getState().modal).toBeNull();
    expect(uiStore.getState().modalQueue).toEqual([]);
  });
  it.each(['manual', 'viewport', 'fatal', 'title', 'replace'] as const)(
    'does not resume after %s interrupts rewards',
    (kind) => {
      const { game, key } = opening();
      expect(openMonthSummaryRewards(game, key)).toBe(true);
      if (kind === 'manual') store.getState().actions.requestPause('user');
      if (kind === 'viewport')
        store.setState((s) => ({ session: { ...s.session, viewportBlocked: true } }));
      if (kind === 'fatal')
        store.setState((s) => ({
          session: {
            ...s.session,
            fatalError: { code: 'test', message: 'test failure', stack: '' },
          },
        }));
      if (kind === 'title') store.getState().actions.setScreen('title');
      if (kind === 'replace') setGame(buildTinyState());
      uiStore.getState().actions.closeModal();
      expect(store.getState().session.speed).toBe('paused');
    },
  );
  it('opens from non-pausing monthly toast, preserves state and suppresses duplicate/stale clicks', () => {
    const { game, key } = opening(false);
    const before = canonicalStringify(game);
    expect(store.getState().session.speed).toBe('x2');
    expect(openMonthSummaryToastRewards(game, key)).toBe(true);
    expect(uiStore.getState().modal?.id).toBe('rewards');
    expect(store.getState().session.speed).toBe('paused');
    expect(monthSummaryStore.getState().toast).toBeNull();
    expect(openMonthSummaryToastRewards(game, key)).toBe(false);
    expect(canonicalStringify(game)).toBe(before);
    setGame(buildTinyState());
    expect(uiStore.getState().modal).toBeNull();
    expect(store.getState().session.speed).toBe('paused');
  });
  it.each(['manual', 'viewport', 'fatal', 'title', 'replace'] as const)(
    'a toast reward keeps irreversible %s interruption ownership',
    (kind) => {
      const { game, key } = opening(false);
      expect(openMonthSummaryToastRewards(game, key)).toBe(true);
      if (kind === 'manual') store.getState().actions.requestPause('user');
      if (kind === 'viewport') {
        store.setState((s) => ({ session: { ...s.session, viewportBlocked: true } }));
        store.setState((s) => ({ session: { ...s.session, viewportBlocked: false } }));
      }
      if (kind === 'fatal') {
        store.getState().actions.setFatalError({ code: 'test', message: 'failure', stack: '' });
        store.getState().actions.setFatalError(null);
      }
      if (kind === 'title') store.getState().actions.setScreen('title');
      if (kind === 'replace') setGame(buildTinyState());
      uiStore.getState().actions.closeModal();
      expect(store.getState().session.speed).toBe('paused');
    },
  );
});
