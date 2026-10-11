import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { flushSync } from 'react-dom';
import { DiplomacyPanel } from '../../src/ui/screens/DiplomacyPanel';
import { CourtPage } from '../../src/ui/screens/CourtPage';
import { buildNewGameState, loadScenario } from '../../src/app/boot';
import { bumpTickSeq, resetGameStoreForTests, setGame, store } from '../../src/app/store';
import {
  getQueuedPlayerCommands,
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
} from '../../src/app/bridge';
import { BAL } from '../../src/core/balance';
import { validateCommand } from '../../src/core/index';
import { validateState } from '../../src/core/state/invariants';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import type { ClanId, CastleId } from '../../src/core/state/ids';
import { t } from '../../src/i18n/zh-TW';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { ConfirmDialog } from '../../src/ui/components';
import { collapseShogunate } from '../../src/core/systems/court';
import { getSentiment } from '../../src/core/systems/diplomacyCommon';

const ASHIKAGA = 'clan.ashikaga' as ClanId;
const NIJO = 'castle.nijo' as CastleId;
const MIYOSHI = 'clan.miyoshi' as ClanId;
beforeEach(() => {
  resetBridgeForTests();
  uiStore.getState().actions.reset();
});
afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests();
  uiStore.getState().actions.reset();
});
function handler(button: HTMLElement): () => void {
  const key = Object.keys(button).find((k) => k.startsWith('__reactProps$'));
  expect(key).toBeTruthy();
  const props = (button as unknown as Record<string, { onClick?: () => void }>)[key!];
  expect(props?.onClick).toBeTypeOf('function');
  return props!.onClick!;
}
async function setup(confirming = true, standalone = false) {
  const game = buildNewGameState(await loadScenario('s1560'), {
    playerClanId: ASHIKAGA,
    difficulty: 'normal',
    seed: 42,
  });
  expect(game.castles[NIJO]!.ownerClanId).toBe(ASHIKAGA);
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  store.getState().actions.requestPause('user');
  // Warm up one real day so later nomination settlement is not a month-opening tick.
  act(() => {
    runOneDay();
  });
  uiStore.getState().actions.reset();
  game.court.shogunateFavor[ASHIKAGA] = 50;
  game.court.patronClanId = null;
  expect(BAL.shogunNominateFavorMin).toBe(50);
  expect(validateState(game)).toEqual([]);
  expect(validateCommand(game, { type: 'nominateShogun', clanId: ASHIKAGA })).toEqual({ ok: true });
  uiStore.getState().actions.openPanel('diplomacy');
  const view = render(standalone ? <CourtPage target="shogunate" /> : <DiplomacyPanel />);
  if (!standalone) fireEvent.click(screen.getByRole('tab', { name: t('ui.shogunate.title') }));
  const invokeButton = screen.getByRole('button', { name: t('cmd.shogunate.nominate') });
  const invoke = handler(invokeButton);
  const close = standalone
    ? () => {}
    : handler(screen.getByRole('button', { name: t('ui.diplomacy.title') }));
  if (confirming) fireEvent.click(invokeButton);
  const dialog = confirming ? screen.getByRole('dialog') : null;
  const confirm = dialog
    ? handler(within(dialog).getByRole('button', { name: t('ui.common.confirm') }))
    : () => {};
  const cancel = dialog
    ? handler(within(dialog).getByRole('button', { name: t('ui.common.cancel') }))
    : () => {};
  return { game, view, invoke, close, confirm, cancel };
}

it('rejects retained native nomination confirmation after same-ID native reload', async () => {
  const { game, confirm } = await setup();
  const decoded = decodeSave(encodeSave(game, 42));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error(decoded.code);
  const replacement = decoded.saveFile.state;
  act(() => {
    setGame(replacement);
    initializeBridgeSession(replacement, decoded.saveFile.pendingCommands, { loaded: true });
  });
  const before = structuredClone(replacement);
  act(() => confirm());
  expect(replacement).toEqual(before);
  expect(getQueuedPlayerCommands(replacement)).toEqual([]);
  expect(validateState(replacement)).toEqual([]);
});

it.each([
  'unmount',
  'cancel',
  'panel',
  'fifo',
  'native',
  'title',
  'fatal',
  'viewport',
  'gameOver',
] as const)('rejects retained nomination consent after %s', async (blocker) => {
  const { game, view, confirm, cancel } = await setup();
  act(() => {
    if (blocker === 'unmount') view.unmount();
    if (blocker === 'cancel') cancel();
    if (blocker === 'panel') {
      uiStore.getState().actions.closePanelById('diplomacy');
      uiStore.getState().actions.openPanel('diplomacy');
    }
    if (blocker === 'fifo') {
      uiStore.getState().actions.closeModal();
      uiStore.getState().actions.enqueueModal({ id: 'systemMenu', params: {}, pausesTime: true });
    }
    if (blocker === 'native')
      render(
        <ConfirmDialog
          open
          title="Other owner"
          message="Other consent"
          onConfirm={() => {}}
          onCancel={() => {}}
        />,
      );
    if (blocker === 'title') store.getState().actions.setScreen('title');
    if (blocker === 'fatal')
      store.getState().actions.setFatalError({ code: 'test', message: 'Fatal', stack: '' });
    if (blocker === 'viewport') store.getState().actions.setViewportBlocked(true);
    if (blocker === 'gameOver') game.meta.gameOver = { kind: 'defeat', endingId: 'no-castle' };
  });
  const before = structuredClone(game);
  const modal = uiStore.getState().modal;
  act(() => confirm());
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(uiStore.getState().modal).toBe(modal);
});

it.each(['favor49', 'capitalOwner', 'patron', 'collapse'] as const)(
  'rechecks actual central nomination admission after %s changes',
  async (change) => {
    const { game, confirm } = await setup();
    if (change === 'favor49') game.court.shogunateFavor[ASHIKAGA] = 49;
    if (change === 'capitalOwner') game.castles[NIJO]!.ownerClanId = MIYOSHI;
    if (change === 'patron') game.court.patronClanId = MIYOSHI;
    if (change === 'collapse') collapseShogunate(game, () => {});
    expect(validateCommand(game, { type: 'nominateShogun', clanId: ASHIKAGA }).ok).toBe(false);
    // Raw capital-owner change is a defensive partial capture input, not a valid whole-world transfer.
    if (change !== 'capitalOwner') expect(validateState(game)).toEqual([]);
    const before = structuredClone(game);
    act(() => confirm());
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
  },
);

it('preserves valid favor changes and ordinary-tick consent, then settles exactly one real nomination', async () => {
  const { game, confirm } = await setup();
  const dialog = screen.getByRole('dialog');
  const modal = uiStore.getState().modal;
  game.court.shogunateFavor[ASHIKAGA] = 51;
  act(() => bumpTickSeq());
  expect(screen.getByRole('dialog')).toBe(dialog);
  expect(uiStore.getState().modal).toBe(modal);
  expect(validateState(game)).toEqual([]);
  const before = structuredClone(game);
  act(() => {
    confirm();
    confirm();
  });
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([{ type: 'nominateShogun', clanId: ASHIKAGA }]);
  let events: ReturnType<typeof runOneDay> = [];
  act(() => {
    events = runOneDay();
  });
  expect(game.court.patronClanId).toBe(ASHIKAGA);
  expect(game.clans[ASHIKAGA]!.prestige).toBe(
    Math.min(BAL.prestigeMax, before.clans[ASHIKAGA]!.prestige + BAL.shogunNominatePrestigeGain),
  );
  expect(game.court.shogunateFavor[ASHIKAGA]).toBe(51);
  for (const clan of Object.values(before.clans).filter(
    (item) => item.alive && item.id !== ASHIKAGA,
  )) {
    expect(getSentiment(game, clan.id, ASHIKAGA)).toBe(
      Math.min(100, getSentiment(before, clan.id, ASHIKAGA) + BAL.shogunPatronSentimentGain),
    );
    expect(getSentiment(game, ASHIKAGA, clan.id)).toBe(getSentiment(before, ASHIKAGA, clan.id));
  }
  expect(events.filter((event) => event.type === 'shogunate.nominated')).toEqual([
    expect.objectContaining({ clanId: ASHIKAGA }),
  ]);
  expect(validateState(game)).toEqual([]);
  expect(store.getState().session.speed).toBe('paused');
  expect(store.getState().session.lastPauseReason).toBe('user');
});

it('queues the literal favor50 admission boundary without immediate writes', async () => {
  const { game, confirm } = await setup();
  expect(game.court.shogunateFavor[ASHIKAGA]).toBe(50);
  const before = structuredClone(game);
  act(() => confirm());
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([{ type: 'nominateShogun', clanId: ASHIKAGA }]);
});

it('revokes an old canceled request without allowing it to close or confirm a new request', async () => {
  const { game, confirm, cancel, invoke } = await setup();
  act(() => cancel());
  act(() => invoke());
  const dialog = screen.getByRole('dialog');
  const modal = uiStore.getState().modal;
  const before = structuredClone(game);
  act(() => {
    confirm();
    cancel();
  });
  expect(screen.getByRole('dialog')).toBe(dialog);
  expect(uiStore.getState().modal).toBe(modal);
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});

it('keeps required arrivals queued behind nonpausing nomination consent', async () => {
  const { game, cancel } = await setup();
  const modal = uiStore.getState().modal;
  expect(modal).toMatchObject({
    id: 'confirm',
    params: { owner: 'nominateShogun' },
    pausesTime: false,
  });
  const arrival = {
    id: 'monthSummary' as const,
    params: { summaryKey: 'required-next' },
    pausesTime: true,
  };
  act(() => uiStore.getState().actions.enqueueModal(arrival));
  expect(uiStore.getState().modal).toBe(modal);
  expect(uiStore.getState().modalQueue).toEqual([arrival]);
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  const before = structuredClone(game);
  act(() => {
    cancel();
    cancel();
  });
  expect(uiStore.getState().modal).toBe(arrival);
  expect(uiStore.getState().modalQueue).toEqual([]);
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(store.getState().session.lastPauseReason).toBe('user');
});

it('irrevocably rejects consent removed then restored as the exact same FIFO descriptor', async () => {
  const { game, confirm } = await setup();
  const modal = uiStore.getState().modal!;
  act(() => {
    uiStore.getState().actions.closeModal();
    uiStore.getState().actions.enqueueModal(modal);
  });
  const before = structuredClone(game);
  act(() => confirm());
  expect(uiStore.getState().modal).toBe(modal);
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});

it('revokes nomination when standalone CourtPage target changes', async () => {
  const { game, view, confirm } = await setup(true, true);
  view.rerender(<CourtPage target="court" />);
  const before = structuredClone(game);
  act(() => confirm());
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(uiStore.getState().modal).toBeNull();
});

it('blocks background tab changes but allows navigation after cancel', async () => {
  const { game, confirm, cancel } = await setup();
  const courtTab = screen.getByRole('tab', { name: t('ui.court.title') });
  fireEvent.click(courtTab);
  expect(
    screen.getByRole('tab', { name: t('ui.shogunate.title') }).getAttribute('aria-selected'),
  ).toBe('true');
  const before = structuredClone(game);
  act(() => cancel());
  fireEvent.click(courtTab);
  expect(courtTab.getAttribute('aria-selected')).toBe('true');
  act(() => confirm());
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});

it('preserves a replacement consent opened during actual command publication', async () => {
  const { game, confirm, cancel, invoke } = await setup();
  const oldDialog = screen.getByRole('dialog');
  let replacement: HTMLElement | null = null;
  const unsubscribe = store.subscribe((next, previous) => {
    if (
      replacement === null &&
      next.session.pendingCommandCount > previous.session.pendingCommandCount
    ) {
      flushSync(() => cancel());
      expect(screen.queryByRole('dialog')).toBeNull();
      flushSync(() => invoke());
      replacement = screen.getByRole('dialog');
      expect(replacement).not.toBe(oldDialog);
    }
  });
  const before = structuredClone(game);
  try {
    act(() => confirm());
    expect(replacement).not.toBeNull();
    expect(screen.getByRole('dialog')).toBe(replacement);
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toHaveLength(1);
  } finally {
    unsubscribe();
  }
});

it('does not let an old close callback close a reopened diplomacy panel', async () => {
  const { game, close } = await setup(false);
  act(() => {
    uiStore.getState().actions.closePanelById('diplomacy');
    uiStore.getState().actions.openPanel('diplomacy');
  });
  const panel = uiStore.getState().panelStack.at(-1);
  const before = structuredClone(game);
  act(() => close());
  expect(uiStore.getState().panelStack.at(-1)).toBe(panel);
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});

it.each(['unmount', 'replacement'] as const)(
  'rejects retained nomination invocation after %s',
  async (change) => {
    const { game, view, invoke } = await setup(false);
    let current = game;
    act(() => {
      if (change === 'unmount') view.unmount();
      if (change === 'replacement') {
        current = structuredClone(game);
        setGame(current);
        initializeBridgeSession(current);
      }
    });
    const before = structuredClone(current);
    const modal = uiStore.getState().modal;
    act(() => invoke());
    expect(uiStore.getState().modal).toBe(modal);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(current).toEqual(before);
    expect(getQueuedPlayerCommands(current)).toEqual([]);
  },
);

it('continues a native saved pending nomination through the actual normal bridge tick identically', async () => {
  const { game, confirm } = await setup();
  act(() => confirm());
  const beforeSave = structuredClone(game);
  const decoded = decodeSave(encodeSave(game, 42, [...getQueuedPlayerCommands(game)]));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error(decoded.code);
  expect(game).toEqual(beforeSave);
  let originalEvents: ReturnType<typeof runOneDay> = [];
  act(() => {
    originalEvents = runOneDay();
  });
  const restored = decoded.saveFile.state;
  act(() => {
    setGame(restored);
    initializeBridgeSession(restored, decoded.saveFile.pendingCommands, { loaded: true });
  });
  let restoredEvents: ReturnType<typeof runOneDay> = [];
  act(() => {
    restoredEvents = runOneDay();
  });
  expect(restoredEvents).toEqual(originalEvents);
  const actual = structuredClone(restored);
  const expected = structuredClone(game);
  // Save codec excludes only this transient diagnostic log from the persistent state comparison.
  actual.ai.intentLog = [];
  expected.ai.intentLog = [];
  expect(actual).toEqual(expected);
  expect(restored.rng).toEqual(game.rng);
  expect(validateState(restored)).toEqual([]);
});
