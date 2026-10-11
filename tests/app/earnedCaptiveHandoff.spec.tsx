import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import {
  captureSaveSnapshot,
  dispatchCommand,
  exportCommandLog,
  getQueuedPlayerCommands,
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
} from '../../src/app/bridge';
import {
  publishCapturedOfficers,
  resetCapturedOfficerPresentations,
} from '../../src/app/captivePresentation';
import { createGameLoopController } from '../../src/app/gameLoop';
import { resetGameStoreForTests, setGame, store } from '../../src/app/store';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { CaptiveModal } from '../../src/ui/screens/CaptiveModal';
import {
  buildMiniState,
  CASTLE_B1,
  CASTLE_B2,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_BETA_LORD,
} from '../fixtures/mini';
import { validateState } from '../../src/core/state/invariants';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { BAL } from '../../src/core/balance';
import type { Command } from '../../src/core/commands/types';
import type { GameState } from '../../src/core/state/gameState';
import type { GameEvent } from '../../src/core/state/events';
import { t } from '../../src/i18n/zh-TW';
import oldMilitaryRoute from '../replay/cases/m4-military-siege-fall.tfulog.json';

function reset() {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
}
afterEach(reset);
function persistent(game: GameState) {
  const copy = structuredClone(game);
  copy.ai.intentLog = []; // The codec intentionally omits this diagnostic history only.
  return copy;
}
function restorePending(game: GameState) {
  const before = structuredClone(game);
  const snapshot = captureSaveSnapshot(0);
  const decoded = decodeSave(encodeSave(snapshot.state, 0, snapshot.pendingCommands));
  expect(game).toEqual(before);
  if (!decoded.ok) throw Error(decoded.code);
  expect(persistent(decoded.saveFile.state)).toEqual(persistent(game));
  setGame(decoded.saveFile.state);
  initializeBridgeSession(decoded.saveFile.state, decoded.saveFile.pendingCommands, {
    loaded: true,
  });
  store.getState().actions.setScreen('main');
  return decoded.saveFile.state;
}

/** Unchanged mini42; six actual player orders, all natural AI retained, daily INV0.
 * Normal bridge + mounted CaptiveModal proof, not a full Main/native-browser journey.
 */
function earnCapture(
  nativeInitial = false,
  beforeCapture?: (game: GameState) => () => void,
  debugCapture = false,
) {
  let game = buildMiniState({ seed: 42 });
  setGame(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  const history: GameEvent[][] = [];
  for (let tick = 1; tick <= 62; tick++) {
    for (const entry of oldMilitaryRoute.entries.filter((entry) => entry.day === tick))
      expect(dispatchCommand(structuredClone(entry.command) as Command)).toEqual({ ok: true });
    if (nativeInitial && tick === 1) {
      expect(getQueuedPlayerCommands(game)).toHaveLength(2);
      game = restorePending(game);
    }
    const dispose = tick === 62 ? beforeCapture?.(game) : undefined;
    let events: GameEvent[];
    try {
      if (debugCapture && tick === 62) {
        const loop = createGameLoopController();
        loop.stepDays(1);
        loop.stop();
        events = game.reports
          .filter((report) => report.day === game.time.day)
          .map((report) => report.event);
      } else events = runOneDay();
    } finally {
      dispose?.();
    }
    expect(
      events.filter((event) => event.type === 'command.rejected'),
      `tick ${tick}`,
    ).toEqual([]);
    expect(validateState(game), `day ${game.time.day}`).toEqual([]);
    expect(store.getState().session.fatalError).toBeNull();
    history.push(events);
  }
  expect(game.time.day).toBe(152);
  expect(history.flat()).toContainEqual(expect.objectContaining({ type: 'siege.started' }));
  expect(history.at(-1)).toContainEqual(
    expect.objectContaining({ type: 'siege.ended', castleId: CASTLE_B2, fallen: true }),
  );
  expect(history.at(-1)).toContainEqual(
    expect.objectContaining({
      type: 'officer.captured',
      officerId: OFF_BETA_LORD,
      byClanId: CLAN_ALPHA,
    }),
  );
  expect(game.castles[CASTLE_B2]!.ownerClanId).toBe(CLAN_ALPHA);
  expect(game.officers[OFF_BETA_LORD]).toMatchObject({
    status: 'captive',
    clanId: CLAN_BETA,
    capturedByClanId: CLAN_ALPHA,
  });
  return { game, history };
}

it('hands the earned day152 siege captive to FIFO after existing monthly owners, without simulation changes or duplicates', () => {
  const { game, history } = earnCapture();
  const ui = uiStore.getState();
  expect(ui.modal?.id).toBe('monthSummary');
  expect(ui.modalQueue.map((modal) => modal.id)).toEqual(['monthSummary', 'captive']);
  expect(ui.modalQueue.at(-1)?.params.officerId).toBe(OFF_BETA_LORD);
  expect(ui.modalQueue.at(-1)?.pausesTime).toBe(true);
  expect(store.getState().session.speed).toBe('paused');
  const before = structuredClone(game);
  publishCapturedOfficers(game, history.at(-1)!, () => store.getState().game === game);
  expect(uiStore.getState().modal).toBe(ui.modal);
  expect(uiStore.getState().modalQueue).toEqual(ui.modalQueue);
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  const log = exportCommandLog();
  expect(log.entries).toHaveLength(14);
  expect(log.entries.filter((entry) => entry.authority)).toHaveLength(8);
  expect(log.truncated).toBe(false);
});

function releaseEarned(native = false) {
  const earned = earnCapture(native);
  let game = earned.game;
  const history = earned.history;
  // Exact API dismissals finish prior summary owners; no fabricated captive descriptor.
  while (uiStore.getState().modal?.id === 'monthSummary') {
    const modal = uiStore.getState().modal!;
    uiStore.getState().actions.closeOwnedModal(modal, { resume: false, expectedGame: game });
  }
  expect(uiStore.getState().modal).toMatchObject({
    id: 'captive',
    params: { officerId: OFF_BETA_LORD },
  });
  render(<CaptiveModal officerId={OFF_BETA_LORD} />);
  expect(screen.getByTestId('captive-modal')).toBeTruthy();
  const before = structuredClone(game);
  fireEvent.click(screen.getByRole('button', { name: t('cmd.captive.release') }));
  expect(game).toEqual(before); // Including RNG: UI queues rather than applying disposal.
  const command: Command = {
    type: 'handleCaptive',
    clanId: CLAN_ALPHA,
    officerId: OFF_BETA_LORD,
    action: 'release',
    executorId: null,
  };
  expect(getQueuedPlayerCommands(game)).toEqual([command]);
  expect(game.officers[OFF_BETA_LORD]!.status).toBe('captive');
  expect(uiStore.getState().modal).toBeNull();
  publishCapturedOfficers(game, history.at(-1)!, () => store.getState().game === game);
  expect(uiStore.getState().modal).toBeNull(); // Actual queued decision suppresses repeated arrival.
  if (native) {
    cleanup();
    game = restorePending(game);
    // Load never replays historical captures; the actual pending disposal survives.
    expect(
      [uiStore.getState().modal, ...uiStore.getState().modalQueue].some(
        (modal) => modal?.id === 'captive',
      ),
    ).toBe(false);
    expect(getQueuedPlayerCommands(game)).toEqual([command]);
  }
  let released: GameEvent[] = [];
  act(() => {
    released = runOneDay();
  });
  expect(released.filter((event) => event.type === 'command.rejected')).toEqual([]);
  expect(
    released.filter(
      (event) => event.type === 'officer.released' && event.officerId === OFF_BETA_LORD,
    ),
  ).toHaveLength(1);
  expect(game.officers[OFF_BETA_LORD]).toMatchObject({
    status: 'serving',
    clanId: CLAN_BETA,
    capturedByClanId: null,
    locationCastleId: CASTLE_B1,
  });
  expect(game.clans[CLAN_ALPHA]!.prestige).toBe(
    Math.min(BAL.prestigeMax, before.clans[CLAN_ALPHA]!.prestige + BAL.releasePrestigeGain),
  );
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(validateState(game)).toEqual([]);
  cleanup(); // UI journey is complete; the remaining gate check is helper-only.
  uiStore.getState().actions.clearQueuedDecisions();
  publishCapturedOfficers(game, history.at(-1)!, () => store.getState().game === game);
  expect(uiStore.getState().modal).toBeNull(); // Actual released subject is no longer eligible.
  return { game, history, released };
}

it('actual earned-captive UI release and initial-march/pending-release native continuation agree in persistent state, RNG and events', () => {
  const original = releaseEarned();
  reset();
  const restored = releaseEarned(true);
  expect(restored.history).toEqual(original.history);
  expect(restored.released).toEqual(original.released);
  expect(restored.game.rng).toEqual(original.game.rng);
  expect(persistent(restored.game)).toEqual(persistent(original.game));
});

it('native loading an earned undisposed captive does not synthesize a historical capture arrival', () => {
  let { game } = earnCapture();
  game = restorePending(game);
  expect(game.officers[OFF_BETA_LORD]!.status).toBe('captive');
  expect(
    [uiStore.getState().modal, ...uiStore.getState().modalQueue].some(
      (modal) => modal?.id === 'captive',
    ),
  ).toBe(false);
  expect(validateState(game)).toEqual([]);
});

it('an actual capture publication replacing the session preserves the completed old tick but no obsolete UI or replacement tick mutation', () => {
  const decoded = decodeSave(encodeSave(buildMiniState({ seed: 42 }), 0));
  if (!decoded.ok) throw Error(decoded.code);
  const replacement = decoded.saveFile.state;
  const successor = { id: 'systemMenu' as const, params: {}, pausesTime: false };
  let swapped = false;
  let replacementTickSeq = -1;
  const original = earnCapture(false, () =>
    uiStore.subscribe((next) => {
      if (swapped || ![next.modal, ...next.modalQueue].some((modal) => modal?.id === 'captive'))
        return;
      swapped = true;
      setGame(replacement);
      initializeBridgeSession(replacement, [], { loaded: true });
      store.getState().actions.setScreen('main');
      uiStore.getState().actions.enqueueModal(successor);
      replacementTickSeq = store.getState().tickSeq;
    }),
  );
  expect(swapped).toBe(true);
  expect(store.getState().game).toBe(replacement);
  expect(replacement.meta.stateVersion).toBe(0);
  expect(store.getState().tickSeq).toBe(replacementTickSeq);
  expect(store.getState().session.pendingCommandCount).toBe(0);
  expect(uiStore.getState().modal).toBe(successor);
  expect(uiStore.getState().modalQueue).toEqual([]);
  expect(original.game.officers[OFF_BETA_LORD]!.status).toBe('captive');
  expect(validateState(replacement)).toEqual([]);
});

it('a stale original tick or non-main foreground cannot reinsert the actual earned capture', () => {
  const { game, history } = earnCapture();
  const capture = uiStore.getState().modalQueue.at(-1)!;
  uiStore.getState().actions.closeOwnedModal(capture, { resume: false, expectedGame: game });
  const before = structuredClone(game);
  const ui = uiStore.getState();
  publishCapturedOfficers(game, history.at(-1)!, () => false);
  expect(uiStore.getState().modal).toBe(ui.modal);
  expect(uiStore.getState().modalQueue).toEqual(ui.modalQueue);
  store.getState().actions.setScreen('title');
  const afterTitle = uiStore.getState(); // Existing title teardown legitimately removes monthly owners.
  publishCapturedOfficers(game, history.at(-1)!, () => true);
  expect(uiStore.getState().modal).toBe(afterTitle.modal);
  expect(uiStore.getState().modalQueue).toEqual(afterTitle.modalQueue);
  expect(game).toEqual(before);
});

it('an actual debug step earns the same siege capture but suppresses interactive capture handoff', () => {
  const { game } = earnCapture(false, undefined, true);
  expect(game.officers[OFF_BETA_LORD]!.status).toBe('captive');
  expect(
    [uiStore.getState().modal, ...uiStore.getState().modalQueue].some(
      (modal) => modal?.id === 'captive',
    ),
  ).toBe(false);
  expect(store.getState().session.debug.jumping).toBeNull();
  expect(validateState(game)).toEqual([]);
});

it('old reset publication cannot delete a new session capture descriptor added synchronously', () => {
  const { game, history } = earnCapture();
  const decoded = decodeSave(encodeSave(game, 0));
  if (!decoded.ok) throw Error(decoded.code);
  const replacement = decoded.saveFile.state;
  while (uiStore.getState().modal?.id === 'monthSummary')
    uiStore
      .getState()
      .actions.closeOwnedModal(uiStore.getState().modal!, { resume: false, expectedGame: game });
  const original = uiStore.getState().modal!;
  let published = false;
  const unsubscribe = uiStore.subscribe((next, previous) => {
    if (published || previous.modal !== original || next.modal === original) return;
    published = true;
    setGame(replacement);
    initializeBridgeSession(replacement, [], { loaded: true });
    store.getState().actions.setScreen('main');
    // Isolated reset-publication witness using real earned facts, NOT automatic load reconciliation.
    publishCapturedOfficers(
      replacement,
      history.at(-1)!,
      () => store.getState().game === replacement,
    );
  });
  try {
    resetCapturedOfficerPresentations();
  } finally {
    unsubscribe();
  }
  expect(published).toBe(true);
  expect(uiStore.getState().modal).toMatchObject({
    id: 'captive',
    params: { officerId: OFF_BETA_LORD },
  });
  expect(uiStore.getState().modal).not.toBe(original);
  expect(store.getState().game).toBe(replacement);
  expect(validateState(game)).toEqual([]);
  expect(validateState(replacement)).toEqual([]);
});

it('isolated ending, fatal and foreign-captor admission gates do not enqueue or mutate the genuine earned captive', () => {
  const { game, history } = earnCapture();
  const arrival = uiStore.getState().modalQueue.at(-1)!;
  uiStore.getState().actions.closeOwnedModal(arrival, { resume: false, expectedGame: game });
  const captured = history.at(-1)!.find((event) => event.type === 'officer.captured')!;
  if (captured.type !== 'officer.captured') throw Error('Expected real capture event');
  // Controlled presentation-negative inputs below, not a claim of earned victory/fatal/foreign capture.
  const assertBlocked = (events: readonly GameEvent[]) => {
    const before = structuredClone(game);
    const ui = uiStore.getState();
    publishCapturedOfficers(game, events, () => store.getState().game === game);
    expect(game).toEqual(before);
    expect(uiStore.getState().modal).toBe(ui.modal);
    expect(uiStore.getState().modalQueue).toEqual(ui.modalQueue);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
  };
  assertBlocked([{ ...captured, byClanId: CLAN_BETA }]);
  game.meta.gameOver = { kind: 'victory', endingId: 'tenkabito' };
  assertBlocked([captured]);
  game.meta.gameOver = null;
  store.getState().actions.setFatalError({
    code: 'TEST',
    message: 'Controlled presentation-negative fatal',
    stack: '',
  });
  assertBlocked([captured]);
});
