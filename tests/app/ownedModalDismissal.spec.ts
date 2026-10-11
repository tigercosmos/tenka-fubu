import { afterEach, beforeEach, expect, it } from 'vitest';
import { resetGameStoreForTests, setGame, store } from '../../src/app/store';
import { uiStore, type ModalInstance } from '../../src/ui/hooks/uiStore';
import { buildTinyState } from '../fixtures/tiny';

beforeEach(() => {
  resetGameStoreForTests(buildTinyState());
  store.getState().actions.setScreen('main');
  uiStore.getState().actions.reset();
  store.getState().actions.setSpeed('x2');
});
afterEach(() => {
  uiStore.getState().actions.reset();
  resetGameStoreForTests();
});
function modal(token: string, pausesTime = false): ModalInstance {
  return { id: 'confirm', params: { owner: 'test', requestId: token }, pausesTime };
}
it('ignores an equal-looking replacement rather than dismissing the current exact owner', () => {
  const expected = modal('a');
  uiStore.getState().actions.enqueueModal(expected);
  const before = uiStore.getState();
  expect(uiStore.getState().actions.closeOwnedModal(structuredClone(expected))).toBe(false);
  expect(uiStore.getState()).toBe(before);
  expect(store.getState().session.speed).toBe('x2');
});
it('removes only its queued descriptor while preserving the current owner and FIFO order', () => {
  const [current, first, expected, last] = ['current', 'first', 'own', 'last'].map((id) =>
    modal(id),
  );
  for (const entry of [current!, first!, expected!, last!])
    uiStore.getState().actions.enqueueModal(entry);
  expect(uiStore.getState().actions.closeOwnedModal(expected!, { resume: false })).toBe(true);
  expect(uiStore.getState().modal).toBe(current);
  expect(uiStore.getState().modalQueue).toEqual([first, last]);
  expect(store.getState().session.speed).toBe('x2');
});
it('atomically promotes the next forced owner and applies its own pause', () => {
  const expected = modal('own');
  const next = modal('required', true);
  uiStore.getState().actions.enqueueModal(expected);
  uiStore.getState().actions.enqueueModal(next);
  const seen: (ModalInstance | null)[] = [];
  const unsubscribe = uiStore.subscribe((state) => seen.push(state.modal));
  try {
    expect(uiStore.getState().actions.closeOwnedModal(expected)).toBe(true);
    expect(seen).toEqual([next]);
    expect(uiStore.getState().modal).toBe(next);
    expect(store.getState().session.speed).toBe('paused');
    expect(store.getState().session.lastPauseReason).toBe('modalOpen');
  } finally {
    unsubscribe();
  }
});
it('does not pause or change running speed for a nonpausing confirmation', () => {
  const expected = modal('own');
  uiStore.getState().actions.enqueueModal(expected);
  expect(store.getState().session.speed).toBe('x2');
  expect(uiStore.getState().actions.closeOwnedModal(expected)).toBe(true);
  expect(uiStore.getState().modal).toBeNull();
  expect(store.getState().session.speed).toBe('x2');
});
it('restores an owned pause only after the entire normal FIFO drains', () => {
  const first = modal('forced', true);
  const last = modal('own');
  uiStore.getState().actions.enqueueModal(first);
  uiStore.getState().actions.enqueueModal(last);
  expect(uiStore.getState().actions.closeOwnedModal(first)).toBe(true);
  expect(store.getState().session.speed).toBe('paused');
  expect(uiStore.getState().actions.closeOwnedModal(last)).toBe(true);
  expect(store.getState().session.speed).toBe('x2');
});
it('cleanup clears a stale restore latch without resuming now or on a later unrelated close', () => {
  const expected = modal('own', true);
  uiStore.getState().actions.enqueueModal(expected);
  expect(uiStore.getState().actions.closeOwnedModal(expected, { resume: false })).toBe(true);
  expect(store.getState().session.speed).toBe('paused');
  expect(uiStore.getState().restoreSpeedOnQueueDrain).toBe(false);
  const unrelated = modal('new');
  uiStore.getState().actions.enqueueModal(unrelated);
  uiStore.getState().actions.closeModal();
  expect(store.getState().session.speed).toBe('paused');
});
it('same-game cleanup still gives the next forced arrival its independent pause', () => {
  const expected = modal('own');
  const next = modal('required', true);
  uiStore.getState().actions.enqueueModal(expected);
  uiStore.getState().actions.enqueueModal(next);
  expect(uiStore.getState().actions.closeOwnedModal(expected, { resume: false })).toBe(true);
  expect(uiStore.getState().modal).toBe(next);
  expect(store.getState().session.speed).toBe('paused');
  expect(uiStore.getState().actions.closeOwnedModal(next)).toBe(true);
  expect(store.getState().session.speed).toBe('x2');
});
it('stale-game cleanup removes its old UI owner without pausing or changing the replacement session', () => {
  const old = store.getState().game!;
  const expected = modal('own');
  const next = modal('next', true);
  uiStore.getState().actions.enqueueModal(expected);
  uiStore.getState().actions.enqueueModal(next);
  setGame(buildTinyState());
  const before = store.getState();
  expect(
    uiStore.getState().actions.closeOwnedModal(expected, {
      resume: false,
      expectedGame: old,
    }),
  ).toBe(true);
  expect(uiStore.getState().modal).toBe(next);
  expect(store.getState()).toBe(before);
});
it('does not mutate replacement ownership during synchronous UI dismissal publication', () => {
  const expected = modal('own', true);
  const replacement = modal('replacement');
  uiStore.getState().actions.enqueueModal(expected);
  let swapped = false;
  const unsubscribe = uiStore.subscribe((state) => {
    if (!swapped && state.modal !== expected) {
      swapped = true;
      setGame(buildTinyState());
      uiStore.getState().actions.reset();
      uiStore.getState().actions.enqueueModal(replacement);
      store.getState().actions.setSpeed('x5');
    }
  });
  try {
    expect(uiStore.getState().actions.closeOwnedModal(expected)).toBe(true);
    expect(swapped).toBe(true);
    expect(uiStore.getState().modal).toBe(replacement);
    expect(store.getState().session.speed).toBe('x5');
  } finally {
    unsubscribe();
  }
});
it('preserves a new manual pause published while promoting a forced arrival', () => {
  const expected = modal('own');
  const next = modal('required', true);
  uiStore.getState().actions.enqueueModal(expected);
  uiStore.getState().actions.enqueueModal(next);
  const unsubscribe = uiStore.subscribe((state) => {
    if (state.modal === next) store.getState().actions.requestPause('user');
  });
  try {
    expect(uiStore.getState().actions.closeOwnedModal(expected)).toBe(true);
    expect(store.getState().session.lastPauseReason).toBe('user');
  } finally {
    unsubscribe();
  }
  uiStore.getState().actions.closeOwnedModal(next);
  expect(store.getState().session.speed).toBe('paused');
  expect(store.getState().session.lastPauseReason).toBe('user');
});
it.each(['user', 'fatal', 'viewport'] as const)(
  'never restores after a %s interruption',
  (kind) => {
    const expected = modal('own', true);
    uiStore.getState().actions.enqueueModal(expected);
    if (kind === 'user') store.getState().actions.requestPause('user');
    if (kind === 'fatal')
      store.getState().actions.setFatalError({ code: 'test', message: 'Fatal', stack: '' });
    if (kind === 'viewport') store.getState().actions.setViewportBlocked(true);
    expect(uiStore.getState().actions.closeOwnedModal(expected)).toBe(true);
    expect(store.getState().session.speed).toBe('paused');
  },
);
it('never resumes a terminal game before the main screen has reacted', () => {
  const expected = modal('own', true);
  uiStore.getState().actions.enqueueModal(expected);
  store.getState().game!.meta.gameOver = { kind: 'defeat', endingId: 'no-castle' };
  uiStore.getState().actions.closeOwnedModal(expected);
  expect(store.getState().session.screen).toBe('main');
  expect(store.getState().session.speed).toBe('paused');
});
it('still pauses a forced arrival after unrelated pending-count publication', () => {
  const expected = modal('own');
  const next = modal('required', true);
  uiStore.getState().actions.enqueueModal(expected);
  uiStore.getState().actions.enqueueModal(next);
  const unsubscribe = uiStore.subscribe((state) => {
    if (state.modal === next)
      store.setState((app) => ({ session: { ...app.session, pendingCommandCount: 1 } }));
  });
  try {
    uiStore.getState().actions.closeOwnedModal(expected);
    expect(store.getState().session.pendingCommandCount).toBe(1);
    expect(store.getState().session.speed).toBe('paused');
    expect(store.getState().session.lastPauseReason).toBe('modalOpen');
  } finally {
    unsubscribe();
  }
});
