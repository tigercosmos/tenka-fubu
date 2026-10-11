import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { flushSync } from 'react-dom';
import { PlotPanel } from '../../src/ui/screens/PlotPanel';
import { bumpTickSeq, resetGameStoreForTests, setGame, store } from '../../src/app/store';
import {
  dispatchCommand,
  getQueuedPlayerCommands,
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
} from '../../src/app/bridge';
import { BAL } from '../../src/core/balance';
import { validateCommand } from '../../src/core/index';
import { validateState } from '../../src/core/state/invariants';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { t } from '../../src/i18n/zh-TW';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { ConfirmDialog } from '../../src/ui/components';
import { isOfficerBusy } from '../../src/core/systems/diplomacyCommon';
import {
  buildTinyState,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_BUSHO,
  OFF_ALPHA_TAISHO,
  OFF_BETA_TAISHO,
  OFF_BETA_BUSHO,
} from '../fixtures/tiny';

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
function setup(confirming = true, investment: number = BAL.plotPoachInvestGoldOptions[0]) {
  const game = buildTinyState();
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  store.getState().actions.requestPause('user');
  act(() => {
    runOneDay();
  });
  uiStore.getState().actions.reset();
  // Explicit controlled legal plot admission, not an earned loyalty/intelligence campaign.
  game.officers[OFF_ALPHA_BUSHO]!.int = 100;
  game.officers[OFF_ALPHA_BUSHO]!.traits = [];
  Object.assign(game.officers[OFF_BETA_TAISHO]!, { loyalty: 10, kinship: 'tozama', traits: [] });
  const command = {
    type: 'startPlot' as const,
    clanId: CLAN_ALPHA,
    kind: 'poach' as const,
    executorId: OFF_ALPHA_BUSHO,
    targetClanId: CLAN_BETA,
    targetOfficerId: OFF_BETA_TAISHO,
    targetCastleId: null,
    investGold: investment,
  };
  expect(validateState(game)).toEqual([]);
  expect(validateCommand(game, command)).toEqual({ ok: true });
  const gold = game.clans[CLAN_ALPHA]!.gold;
  expect(dispatchCommand(command)).toEqual({ ok: true });
  act(() => {
    runOneDay();
  });
  expect(game.clans[CLAN_ALPHA]!.gold).toBe(gold - command.investGold);
  expect(validateState(game)).toEqual([]);
  const plot = game.diplomacy.plots[0]!;
  expect(plot).toMatchObject({
    kind: 'poach',
    officerId: OFF_ALPHA_BUSHO,
    targetOfficerId: OFF_BETA_TAISHO,
    investGold: command.investGold,
  });
  uiStore.getState().actions.openPanel('plot');
  const view = render(<PlotPanel />);
  const invokeButton = screen.getByRole('button', { name: t('cmd.plot.cancel') });
  const invoke = handler(invokeButton);
  const close = handler(screen.getByRole('button', { name: t('ui.plot.title') }));
  if (confirming) fireEvent.click(invokeButton);
  const dialog = confirming ? screen.getByRole('dialog') : null;
  const confirm = dialog
    ? handler(within(dialog).getByRole('button', { name: t('ui.common.confirm') }))
    : () => {};
  const cancel = dialog
    ? handler(within(dialog).getByRole('button', { name: t('ui.common.cancel') }))
    : () => {};
  return { game, plot, view, invoke, close, confirm, cancel, startCommand: command };
}

it('rejects retained plot cancellation consent after same-ID native reload', () => {
  const { game, confirm } = setup();
  const decoded = decodeSave(encodeSave(game, 42));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error(decoded.code);
  const restored = decoded.saveFile.state;
  act(() => {
    setGame(restored);
    initializeBridgeSession(restored, decoded.saveFile.pendingCommands, { loaded: true });
  });
  const before = structuredClone(restored);
  act(() => confirm());
  expect(restored).toEqual(before);
  expect(getQueuedPlayerCommands(restored)).toEqual([]);
  expect(validateState(restored)).toEqual([]);
});

it.each([
  'object',
  'kind',
  'owner',
  'executor',
  'targetClan',
  'targetOfficer',
  'targetCastle',
  'investment',
  'startedDay',
] as const)('revokes cancellation consent when stable plot %s changes', (change) => {
  const { game, plot, confirm } = setup();
  act(() => {
    if (change === 'object')
      game.diplomacy.plots = game.diplomacy.plots.map((item) =>
        item === plot ? structuredClone(plot) : item,
      );
    if (change === 'kind') plot.kind = 'rumor';
    if (change === 'owner') plot.ownerClanId = CLAN_BETA;
    if (change === 'executor') plot.officerId = OFF_BETA_TAISHO;
    if (change === 'targetClan') plot.targetClanId = CLAN_ALPHA;
    if (change === 'targetOfficer') plot.targetOfficerId = OFF_ALPHA_BUSHO;
    if (change === 'targetCastle')
      plot.targetCastleId = game.officers[OFF_BETA_TAISHO]!.locationCastleId;
    if (change === 'investment') plot.investGold += 1;
    if (change === 'startedDay') plot.startedDay -= 1;
    bumpTickSeq();
  });
  // Stable-field mutations are deliberate stale-consent diagnostic inputs,
  // not claims that the original financial/target journey remains valid.
  const before = structuredClone(game);
  act(() => confirm());
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
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
] as const)('rejects retained plot cancellation after %s', (blocker) => {
  const { game, view, confirm, cancel } = setup();
  act(() => {
    if (blocker === 'unmount') view.unmount();
    if (blocker === 'cancel') cancel();
    if (blocker === 'panel') {
      uiStore.getState().actions.closePanelById('plot');
      uiStore.getState().actions.openPanel('plot');
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

it('owns a nonpausing FIFO slot, keeps required arrivals waiting and cancels only its own request', () => {
  const { game, cancel } = setup();
  const modal = uiStore.getState().modal;
  expect(modal).toMatchObject({
    id: 'confirm',
    params: { owner: 'cancelPlot' },
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

it('irreversibly revokes removed then restored original cancellation consent', () => {
  const { game, confirm } = setup();
  const original = uiStore.getState().modal!;
  act(() => {
    uiStore.getState().actions.closeModal();
    uiStore.getState().actions.enqueueModal(original);
  });
  const before = structuredClone(game);
  act(() => confirm());
  expect(uiStore.getState().modal).toBe(original);
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});

it('keeps ordinary tick and real monthly progress updates live without freezing the plot', () => {
  const { game, plot, confirm } = setup();
  const original = uiStore.getState().modal;
  const dialog = screen.getByRole('dialog');
  act(() => bumpTickSeq());
  expect(screen.getByRole('dialog')).toBe(dialog);
  act(() => {
    while (game.time.dayOfMonth !== 1) runOneDay();
  });
  expect(game.diplomacy.plots).toContain(plot);
  expect(plot.progress).toBeGreaterThan(0);
  expect(plot.progress).toBeLessThan(BAL.plotProgressMax);
  expect(validateState(game)).toEqual([]);
  expect(screen.getByRole('dialog')).toBe(dialog);
  expect(uiStore.getState().modal).toBe(original);
  const before = structuredClone(game);
  act(() => confirm());
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([
    { type: 'cancelPlot', clanId: CLAN_ALPHA, plotId: plot.id },
  ]);
});

it('queues one cancellation and only deletes at the normal day with no refund or invented event', () => {
  const { game, plot, confirm, startCommand } = setup();
  expect(isOfficerBusy(game, OFF_ALPHA_BUSHO)).toBe(true);
  const before = structuredClone(game);
  act(() => {
    confirm();
    confirm();
  });
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([
    { type: 'cancelPlot', clanId: CLAN_ALPHA, plotId: plot.id },
  ]);
  let events: ReturnType<typeof runOneDay> = [];
  act(() => {
    events = runOneDay();
  });
  expect(game.diplomacy.plots).toEqual([]);
  expect(game.clans[CLAN_ALPHA]!.gold).toBe(before.clans[CLAN_ALPHA]!.gold);
  expect(isOfficerBusy(game, OFF_ALPHA_BUSHO)).toBe(false);
  expect(validateCommand(game, startCommand)).toEqual({ ok: true });
  expect(events.filter((event) => event.type.startsWith('plot.'))).toEqual([]);
  expect(validateState(game)).toEqual([]);
  expect(store.getState().session.speed).toBe('paused');
  expect(store.getState().session.lastPauseReason).toBe('user');
});

it('does not let a canceled old request act on a new consent', () => {
  const { game, confirm, cancel, invoke } = setup();
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

it('preserves new same-action consent opened inside actual old command publication', () => {
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

it('keeps a reopened panel safe from the old close callback', () => {
  const { game, close } = setup(false);
  act(() => {
    uiStore.getState().actions.closePanelById('plot');
    uiStore.getState().actions.openPanel('plot');
  });
  const panel = uiStore.getState().panelStack.at(-1);
  const before = structuredClone(game);
  act(() => close());
  expect(uiStore.getState().panelStack.at(-1)).toBe(panel);
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});

it('continues an actual saved pending cancellation through normal bridge ticks identically', () => {
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
  const actual = structuredClone(restored);
  const expected = structuredClone(game);
  actual.ai.intentLog = [];
  expected.ai.intentLog = [];
  expect(actual).toEqual(expected);
  expect(restored.rng).toEqual(game.rng);
  expect(validateState(restored)).toEqual([]);
});

it('keeps a blank start form editable after a no-op Cancel', () => {
  const { game } = setup(false);
  const before = structuredClone(game);
  fireEvent.click(screen.getByRole('button', { name: t('ui.common.cancel') }));
  const targetClan = screen.getByRole<HTMLSelectElement>('combobox', {
    name: t('ui.plot.targetClan'),
  });
  fireEvent.change(targetClan, { target: { value: CLAN_BETA } });
  expect(targetClan.value).toBe(CLAN_BETA);
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});

function prepareSecondDraft() {
  const result = setup(false);
  Object.assign(result.game.officers[OFF_BETA_BUSHO]!, {
    loyalty: 10,
    kinship: 'tozama',
    traits: [],
  });
  act(() => bumpTickSeq());
  const command = {
    ...result.startCommand,
    executorId: OFF_ALPHA_TAISHO,
    targetOfficerId: OFF_BETA_BUSHO,
    investGold: BAL.plotPoachInvestGoldOptions[1],
  };
  expect(validateState(result.game)).toEqual([]);
  expect(validateCommand(result.game, command)).toEqual({ ok: true });
  fireEvent.change(screen.getByRole('combobox', { name: t('ui.plot.targetClan') }), {
    target: { value: CLAN_BETA },
  });
  fireEvent.change(screen.getByRole('combobox', { name: t('ui.plot.target') }), {
    target: { value: OFF_BETA_BUSHO },
  });
  fireEvent.change(screen.getByRole('combobox', { name: t('ui.plot.executor') }), {
    target: { value: OFF_ALPHA_TAISHO },
  });
  fireEvent.change(screen.getByRole('combobox', { name: t('ui.plot.investGold') }), {
    target: { value: String(command.investGold) },
  });
  const button = screen.getByRole('button', { name: t('cmd.plot.start') });
  expect(button.hasAttribute('disabled')).toBe(false);
  return { ...result, command, submit: handler(button) };
}

it.each(['changed', 'restored'] as const)(
  'does not reset a %s new draft during actual start-command publication',
  (change) => {
    const { game, command, submit } = prepareSecondDraft();
    let published = false;
    const setTarget = (value: string) =>
      flushSync(() =>
        fireEvent.change(screen.getByRole('combobox', { name: t('ui.plot.target') }), {
          target: { value },
        }),
      );
    const setInvestment = (value: number) =>
      flushSync(() =>
        fireEvent.change(screen.getByRole('combobox', { name: t('ui.plot.investGold') }), {
          target: { value: String(value) },
        }),
      );
    const unsubscribe = store.subscribe((next, previous) => {
      if (!published && next.session.pendingCommandCount > previous.session.pendingCommandCount) {
        published = true;
        setTarget(OFF_BETA_TAISHO);
        setInvestment(BAL.plotPoachInvestGoldOptions[2]);
        if (change === 'restored') {
          setTarget(OFF_BETA_BUSHO);
          setInvestment(command.investGold);
        }
      }
    });
    const before = structuredClone(game);
    try {
      act(() => submit());
      expect(published).toBe(true);
      expect(
        screen.getByRole<HTMLSelectElement>('combobox', { name: t('ui.plot.target') }).value,
      ).toBe(change === 'restored' ? OFF_BETA_BUSHO : OFF_BETA_TAISHO);
      expect(
        screen.getByRole<HTMLSelectElement>('combobox', { name: t('ui.plot.investGold') }).value,
      ).toBe(
        String(change === 'restored' ? command.investGold : BAL.plotPoachInvestGoldOptions[2]),
      );
      expect(game).toEqual(before);
      expect(getQueuedPlayerCommands(game)).toEqual([command]);
    } finally {
      unsubscribe();
    }
  },
);

it('cannot recursively queue a second start with the same actual retained handler', () => {
  const { game, command, submit } = prepareSecondDraft();
  let reentered = false;
  const unsubscribe = store.subscribe((next, previous) => {
    if (!reentered && next.session.pendingCommandCount > previous.session.pendingCommandCount) {
      reentered = true;
      submit();
    }
  });
  const before = structuredClone(game);
  try {
    act(() => submit());
    expect(reentered).toBe(true);
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([command]);
  } finally {
    unsubscribe();
  }
});

it('does not refund a real positive two-hundred-gold plot investment on normal cancellation', () => {
  expect(BAL.plotPoachInvestGoldOptions[1]).toBe(200);
  const { game, plot, confirm } = setup(true, BAL.plotPoachInvestGoldOptions[1]);
  expect(plot.investGold).toBe(200);
  const before = structuredClone(game);
  act(() => confirm());
  expect(game).toEqual(before);
  act(() => {
    runOneDay();
  });
  expect(game.diplomacy.plots).toEqual([]);
  expect(game.clans[CLAN_ALPHA]!.gold).toBe(before.clans[CLAN_ALPHA]!.gold);
  expect(validateState(game)).toEqual([]);
});
