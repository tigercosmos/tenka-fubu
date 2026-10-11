import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { flushSync } from 'react-dom';
import { DiplomacyPanel } from '../../src/ui/screens/DiplomacyPanel';
import { bumpTickSeq, resetGameStoreForTests, setGame, store } from '../../src/app/store';
import {
  dispatchCommand,
  getQueuedPlayerCommands,
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
} from '../../src/app/bridge';
import { BAL } from '../../src/core/balance';
import { evaluateProposal } from '../../src/core/index';
import {
  adjustTrust,
  adjustSentiment,
  getTrust,
  getSentiment,
} from '../../src/core/systems/diplomacyCommon';
import { validateState } from '../../src/core/state/invariants';
import type { ClanId } from '../../src/core/state/ids';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { pairKey } from '../../src/core/state/serialize';
import { t } from '../../src/i18n/zh-TW';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { ConfirmDialog } from '../../src/ui/components';
import {
  buildTinyState,
  CLAN_ALPHA,
  CLAN_BETA,
  TINY_SCENARIO,
  CASTLE_A2,
  OFF_ALPHA_TAISHO,
} from '../fixtures/tiny';

const THIRD = 'clan.third-credit' as ClanId;

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
function setup(confirming = true, running = false, thirdParty = false) {
  const scenario = structuredClone(TINY_SCENARIO);
  if (thirdParty) {
    // Same valid three-house fixture construction as the core credit-penalty tests;
    // its alliance is still established below through the actual command queue.
    scenario.clanPersonaIds[THIRD] = scenario.clanPersonaIds[CLAN_ALPHA]!;
    scenario.clans.push({
      ...structuredClone(scenario.clans[0]!),
      id: THIRD,
      name: 'Third clan',
      leaderId: OFF_ALPHA_TAISHO,
      homeCastleId: CASTLE_A2,
      colorIndex: 2,
    });
    const castle = scenario.castles.find((candidate) => candidate.id === CASTLE_A2)!;
    castle.ownerClanId = THIRD;
    castle.tier = 'main';
    for (const district of scenario.districts)
      if (castle.districtIds.includes(district.id)) district.ownerClanId = THIRD;
    const leader = scenario.officers.find((officer) => officer.id === OFF_ALPHA_TAISHO)!;
    leader.clanId = THIRD;
    leader.loyalty = 100;
  }
  const game = buildTinyState(scenario);
  adjustTrust(game, CLAN_ALPHA, CLAN_BETA, BAL.trustMax);
  adjustSentiment(game, CLAN_BETA, CLAN_ALPHA, 100);
  if (thirdParty) {
    adjustTrust(game, THIRD, CLAN_ALPHA, 70);
    adjustTrust(game, CLAN_ALPHA, THIRD, 45);
  }
  expect(validateState(game)).toEqual([]);
  expect(evaluateProposal(game, CLAN_ALPHA, CLAN_BETA, 'proposeAlliance')).toBeGreaterThanOrEqual(
    BAL.dipAcceptThreshold,
  );
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  store.getState().actions.requestPause('user');
  expect(
    dispatchCommand({
      type: 'proposePact',
      clanId: CLAN_ALPHA,
      targetClanId: CLAN_BETA,
      kind: 'proposeAlliance',
      reinforceAgainstClanId: null,
    }),
  ).toEqual({ ok: true });
  let events: ReturnType<typeof runOneDay> = [];
  act(() => {
    events = runOneDay();
  });
  expect(events.filter((event) => event.type === 'pact.signed')).toHaveLength(1);
  expect(validateState(game)).toEqual([]);
  const row = game.diplomacy.rows[pairKey(CLAN_ALPHA, CLAN_BETA)]!;
  expect(row).toBeTruthy();
  const pact = row.pacts.find((candidate) => candidate.kind === 'alliance')!;
  expect(pact).toBeTruthy();
  expect(game.diplomacy.pendingProposals).toEqual([]);
  if (running) store.getState().actions.setSpeed('x2');
  uiStore.getState().actions.openPanel('diplomacy');
  const view = render(<DiplomacyPanel />);
  const button = screen.getByRole('button', { name: t('cmd.diplomacy.breakPact') });
  const invoke = handler(button);
  const close = handler(screen.getByRole('button', { name: t('ui.diplomacy.title') }));
  if (confirming) fireEvent.click(button);
  const dialog = confirming ? screen.getByRole('dialog') : null;
  const confirm = dialog
    ? handler(within(dialog).getByRole('button', { name: t('ui.common.confirm') }))
    : () => {};
  const cancel = dialog
    ? handler(within(dialog).getByRole('button', { name: t('ui.common.cancel') }))
    : () => {};
  return { game, pact, row, view, invoke, close, confirm, cancel };
}

it('rejects retained actual pact-breaking consent after same-ID reload', () => {
  const { game, confirm } = setup();
  const replacement = structuredClone(game);
  act(() => {
    setGame(replacement);
    initializeBridgeSession(replacement);
  });
  const before = structuredClone(replacement);
  act(() => confirm());
  expect(replacement).toEqual(before);
  expect(getQueuedPlayerCommands(replacement)).toEqual([]);
  expect(validateState(replacement)).toEqual([]);
});

it.each(['object', 'endDay', 'startDay', 'vassalClanId'] as const)(
  'revokes exact pact consent when %s changes',
  (change) => {
    const { game, pact, row, confirm } = setup();
    act(() => {
      if (change === 'object')
        row.pacts = row.pacts.map((item) => (item === pact ? structuredClone(pact) : item));
      if (change === 'endDay') pact.endDay! += 30;
      if (change === 'startDay') pact.startDay += 1;
      if (change === 'vassalClanId') pact.vassalClanId = CLAN_BETA;
      bumpTickSeq();
    });
    const before = structuredClone(game);
    act(() => confirm());
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    // vassalClanId on alliance is deliberately malformed defensive input, not a valid-state claim.
    if (change !== 'vassalClanId') expect(validateState(game)).toEqual([]);
  },
);

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
] as const)('rejects retained pact confirm after %s', (blocker) => {
  const { game, view, confirm, cancel } = setup();
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
          title="Other consent"
          message="Other owner"
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
  const panels = uiStore.getState().panelStack;
  act(() => confirm());
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(uiStore.getState().modal).toBe(modal);
  expect(uiStore.getState().panelStack).toBe(panels);
});

it('owns a nonpausing FIFO confirmation and advances the next required arrival once on cancel', () => {
  const { game, cancel } = setup(true, true);
  const owned = uiStore.getState().modal;
  expect(owned).toMatchObject({ id: 'confirm', pausesTime: false });
  expect(store.getState().session.speed).toBe('x2');
  const arrival = {
    id: 'monthSummary' as const,
    params: { summaryKey: 'required-next' },
    pausesTime: true,
  };
  act(() => uiStore.getState().actions.enqueueModal(arrival));
  expect(uiStore.getState().modal).toBe(owned);
  expect(uiStore.getState().modalQueue).toEqual([arrival]);
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  const before = structuredClone(game);
  act(() => {
    cancel();
    cancel();
  });
  expect(uiStore.getState().modal).toBe(arrival);
  expect(uiStore.getState().modalQueue).toEqual([]);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(store.getState().session.speed).toBe('paused');
  expect(store.getState().session.lastPauseReason).toBe('modalOpen');
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});

it('irrevocably rejects original consent removed and restored in one batch', () => {
  const { game, confirm } = setup();
  const owned = uiStore.getState().modal!;
  act(() => {
    uiStore.getState().actions.closeModal();
    uiStore.getState().actions.enqueueModal(owned);
  });
  const before = structuredClone(game);
  act(() => confirm());
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(uiStore.getState().modal).toBe(owned);
});

it('preserves ordinary-tick consent and queues one truthful normal-day betrayal settlement', () => {
  const { game, pact, row, confirm } = setup();
  const dialog = screen.getByRole('dialog');
  const owned = uiStore.getState().modal;
  act(() => bumpTickSeq());
  expect(screen.getByRole('dialog')).toBe(dialog);
  expect(uiStore.getState().modal).toBe(owned);
  const before = structuredClone(game);
  act(() => {
    confirm();
    confirm();
  });
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([
    { type: 'breakPact', clanId: CLAN_ALPHA, targetClanId: CLAN_BETA, kind: 'alliance' },
  ]);
  let events: ReturnType<typeof runOneDay> = [];
  act(() => {
    events = runOneDay();
  });
  expect(row.pacts).not.toContain(pact);
  expect(row.pacts.some((item) => item.kind === 'alliance')).toBe(false);
  expect(getTrust(game, CLAN_ALPHA, CLAN_BETA)).toBe(0);
  expect(getTrust(game, CLAN_BETA, CLAN_ALPHA)).toBe(getTrust(before, CLAN_BETA, CLAN_ALPHA));
  expect(getSentiment(game, CLAN_BETA, CLAN_ALPHA)).toBe(
    Math.max(-100, getSentiment(before, CLAN_BETA, CLAN_ALPHA) + BAL.sentimentBetrayalHit),
  );
  expect(game.clans[CLAN_ALPHA]!.prestige).toBe(
    Math.max(0, before.clans[CLAN_ALPHA]!.prestige - BAL.betrayalPrestigeHit),
  );
  expect(events.filter((event) => event.type === 'pact.broken')).toEqual([
    expect.objectContaining({ breakerClanId: CLAN_ALPHA, kind: 'alliance' }),
  ]);
  expect(validateState(game)).toEqual([]);
  expect(store.getState().session.speed).toBe('paused');
  expect(store.getState().session.lastPauseReason).toBe('user');
});

it('does not let a canceled old request confirm or cancel a new consent', () => {
  const { game, confirm, cancel, invoke } = setup();
  act(() => cancel());
  act(() => invoke());
  const dialog = screen.getByRole('dialog');
  const owned = uiStore.getState().modal;
  const before = structuredClone(game);
  act(() => {
    confirm();
    cancel();
  });
  expect(screen.getByRole('dialog')).toBe(dialog);
  expect(uiStore.getState().modal).toBe(owned);
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});

it('does not let a retained old close remove a reopened diplomacy panel', () => {
  const { game, close } = setup(false);
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

it.each(['unmount', 'title', 'fifo', 'native', 'replacement'] as const)(
  'rejects retained break invocation after %s',
  (blocker) => {
    const { game, view, invoke } = setup(false);
    let current = game;
    act(() => {
      if (blocker === 'unmount') view.unmount();
      if (blocker === 'title') store.getState().actions.setScreen('title');
      if (blocker === 'fifo')
        uiStore.getState().actions.enqueueModal({ id: 'systemMenu', params: {}, pausesTime: true });
      if (blocker === 'native')
        render(
          <ConfirmDialog
            open
            title="Other consent"
            message="Other owner"
            onConfirm={() => {}}
            onCancel={() => {}}
          />,
        );
      if (blocker === 'replacement') {
        current = structuredClone(game);
        setGame(current);
        initializeBridgeSession(current);
      }
    });
    const modal = uiStore.getState().modal;
    const dialogs = screen.queryAllByRole('dialog');
    const before = structuredClone(current);
    act(() => invoke());
    expect(uiStore.getState().modal).toBe(modal);
    expect(screen.queryAllByRole('dialog')).toEqual(dialogs);
    expect(current).toEqual(before);
    expect(getQueuedPlayerCommands(current)).toEqual([]);
  },
);

it('rejects fresh in-place renewed pact fields before any tick publication', () => {
  const { game, pact, confirm } = setup();
  pact.endDay! += 30;
  expect(validateState(game)).toEqual([]);
  const before = structuredClone(game);
  act(() => confirm());
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});

it('preserves new same-action consent opened inside the actual old command publication', () => {
  const { game, confirm, cancel, invoke } = setup();
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

it('applies directed third-party penalties only on the actual queued normal-day breach', () => {
  const { game, confirm } = setup(true, false, true);
  const before = structuredClone(game);
  act(() => confirm());
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toHaveLength(1);
  act(() => {
    runOneDay();
  });
  expect(getTrust(game, THIRD, CLAN_ALPHA)).toBe(
    Math.max(0, getTrust(before, THIRD, CLAN_ALPHA) - BAL.betrayalTrustPenaltyOthers),
  );
  expect(getTrust(game, CLAN_ALPHA, THIRD)).toBe(getTrust(before, CLAN_ALPHA, THIRD));
  expect(getSentiment(game, THIRD, CLAN_ALPHA)).toBe(
    Math.max(-100, getSentiment(before, THIRD, CLAN_ALPHA) + BAL.betrayalGlobalSentimentHit),
  );
  expect(validateState(game)).toEqual([]);
});

it.each(['unmount', 'reload', 'pactReplacement'] as const)(
  'cleans up only owned consent on %s and preserves the waiting required arrival',
  (change) => {
    const { game, row, pact, view, confirm } = setup();
    const arrival = {
      id: 'monthSummary' as const,
      params: { summaryKey: 'required-next' },
      pausesTime: true,
    };
    act(() => uiStore.getState().actions.enqueueModal(arrival));
    let current = game;
    act(() => {
      if (change === 'unmount') view.unmount();
      if (change === 'reload') {
        const decoded = decodeSave(encodeSave(game, 42));
        expect(decoded.ok).toBe(true);
        if (!decoded.ok) throw new Error(decoded.code);
        current = decoded.saveFile.state;
        setGame(current);
        initializeBridgeSession(current, decoded.saveFile.pendingCommands, { loaded: true });
      }
      if (change === 'pactReplacement') {
        row.pacts = row.pacts.map((item) => (item === pact ? structuredClone(pact) : item));
        bumpTickSeq();
      }
    });
    expect(uiStore.getState().modal).toBe(arrival);
    expect(uiStore.getState().modalQueue).toEqual([]);
    const before = structuredClone(current);
    act(() => confirm());
    expect(uiStore.getState().modal).toBe(arrival);
    expect(getQueuedPlayerCommands(current)).toEqual([]);
    expect(current).toEqual(before);
    expect(store.getState().session.speed).toBe('paused');
  },
);

it('continues an actual native save containing the confirmed pending breach identically', () => {
  const { game, confirm } = setup();
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
  const expected = structuredClone(game);
  const actual = structuredClone(restored);
  // Native saves deliberately omit the transient AI diagnostic log only.
  expected.ai.intentLog = [];
  actual.ai.intentLog = [];
  expect(actual).toEqual(expected);
  expect(restored.rng).toEqual(game.rng);
  expect(validateState(restored)).toEqual([]);
});

it('blocks background target and tab changes during consent, but allows navigation after cancel', () => {
  const { game, confirm, cancel } = setup(true, false, true);
  const dialog = screen.getByRole('dialog');
  const original = uiStore.getState().modal;
  const before = structuredClone(game);
  const clansTab = screen.getByRole('tab', { name: t('ui.diplomacy.clans') });
  const courtTab = screen.getByRole('tab', { name: t('ui.court.title') });
  const thirdTarget = screen.getByRole('button', { name: /Third clan/ });
  fireEvent.click(thirdTarget);
  fireEvent.click(courtTab);
  expect(thirdTarget.getAttribute('aria-pressed')).toBe('false');
  expect(clansTab.getAttribute('aria-selected')).toBe('true');
  expect(screen.getByRole('dialog')).toBe(dialog);
  expect(uiStore.getState().modal).toBe(original);
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  act(() => cancel());
  fireEvent.click(courtTab);
  expect(courtTab.getAttribute('aria-selected')).toBe('true');
  act(() => confirm());
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});
