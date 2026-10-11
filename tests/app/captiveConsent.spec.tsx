import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync } from 'react-dom';
import { CaptiveModal } from '../../src/ui/screens/CaptiveModal';
import {
  initializeBridgeSession,
  dispatchCommand,
  getQueuedPlayerCommands,
  resetBridgeForTests,
  runOneDay,
} from '../../src/app/bridge';
import { bumpTickSeq, resetGameStoreForTests, setGame, store } from '../../src/app/store';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { validateState } from '../../src/core/state/invariants';
import { captiveRecruitSuccessRate, officerAbilityScore } from '../../src/core/index';
import { createRngStream } from '../../src/core/rng';
import { BAL } from '../../src/core/balance';
import { t } from '../../src/i18n/zh-TW';
import { ConfirmDialog } from '../../src/ui/components';
import { buildTinyState, CASTLE_A1, OFF_BETA_BUSHO } from '../fixtures/tiny';

const captured = vi.hoisted(() => ({
  confirm: null as (() => void) | null,
  actions: [] as Parameters<
    typeof import('../../src/ui/components/CommandAction').CommandAction
  >[0][],
}));
vi.mock('../../src/ui/components/CommandAction', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/ui/components/CommandAction')>();
  return {
    ...original,
    CommandAction: (props: Parameters<typeof original.CommandAction>[0]) => {
      captured.actions.push(props);
      return <original.CommandAction {...props} />;
    },
  };
});
vi.mock('../../src/ui/components/ConfirmDialog/ConfirmDialog', async (importOriginal) => {
  const original =
    await importOriginal<typeof import('../../src/ui/components/ConfirmDialog/ConfirmDialog')>();
  return {
    ...original,
    ConfirmDialog: (props: Parameters<typeof original.ConfirmDialog>[0]) => {
      if (props.open) captured.confirm = props.onConfirm;
      return <original.ConfirmDialog {...props} />;
    },
  };
});
beforeEach(() => {
  resetBridgeForTests();
  uiStore.getState().actions.reset();
  captured.confirm = null;
  captured.actions = [];
});
it.each(['recruit', 'release', 'execute'] as const)(
  'rejects an old %s callback against a valid same-ID replacement game',
  (action) => {
    const { confirm } = setup();
    const old = captured.actions.find(
      (props) => props.command.type === 'handleCaptive' && props.command.action === action,
    )!;
    const replacement = gameFixture();
    act(() => {
      setGame(replacement);
      initializeBridgeSession(replacement);
    });
    const before = structuredClone(replacement);
    const modal = uiStore.getState().modal;
    let result;
    act(() => {
      if (action === 'execute') confirm();
      else result = old.onCommand!(old.command);
    });
    if (action !== 'execute') expect(result).toMatchObject({ ok: false });
    expect(replacement).toEqual(before);
    expect(getQueuedPlayerCommands(replacement)).toEqual([]);
    expect(uiStore.getState().queuedDecisionIds).toEqual([]);
    expect(uiStore.getState().modal).toBe(modal);
  },
);
afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
});
function gameFixture() {
  const game = buildTinyState();
  const captive = game.officers[OFF_BETA_BUSHO]!;
  captive.status = 'captive';
  captive.capturedByClanId = game.meta.playerClanId;
  captive.locationCastleId = CASTLE_A1;
  expect(validateState(game)).toEqual([]);
  return game;
}
function setup(confirming = true) {
  const game = gameFixture();
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  uiStore.getState().actions.enqueueModal({
    id: 'captive',
    params: { officerId: OFF_BETA_BUSHO },
    pausesTime: true,
  });
  const view = render(<CaptiveModal officerId={OFF_BETA_BUSHO} />);
  if (confirming) fireEvent.click(screen.getByRole('button', { name: t('cmd.captive.execute') }));
  const confirm = captured.confirm!;
  if (confirming) expect(confirm).toBeTypeOf('function');
  return { game, view, confirm };
}
it.each(['recruit', 'release', 'execute'] as const)(
  'rejects retained %s callbacks beneath an unrelated real native confirmation',
  (action) => {
    const { game, confirm } = setup(action === 'execute');
    const old = captured.actions.find(
      (props) => props.command.type === 'handleCaptive' && props.command.action === action,
    );
    render(
      <ConfirmDialog
        open
        title="Unrelated consent"
        message="Different subject"
        onConfirm={() => {}}
        onCancel={() => {}}
      />,
    );
    const before = structuredClone(game);
    const modal = uiStore.getState().modal;
    act(() => {
      if (action === 'execute') confirm();
      else old!.onCommand!(old!.command);
    });
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    expect(game).toEqual(before);
    expect(uiStore.getState().queuedDecisionIds).toEqual([]);
    expect(uiStore.getState().modal).toBe(modal);
  },
);
it('revokes the captured execution callback on native cancel', () => {
  const { game, confirm } = setup();
  fireEvent.click(
    within(screen.getAllByRole('dialog').at(-1)!).getByRole('button', {
      name: t('ui.common.cancel'),
    }),
  );
  const before = structuredClone(game);
  const modal = uiStore.getState().modal;
  act(() => confirm());
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(game).toEqual(before);
  expect(uiStore.getState().modal).toBe(modal);
  expect(uiStore.getState().queuedDecisionIds).toEqual([]);
});
it.each(['recruit', 'release', 'execute'] as const)(
  'preserves native/FIFO ownership when a successful %s port mounts an unrelated dialog',
  (action) => {
    const game = gameFixture();
    resetGameStoreForTests(game);
    initializeBridgeSession(game);
    store.getState().actions.setScreen('main');
    uiStore.getState().actions.enqueueModal({
      id: 'captive',
      params: { officerId: OFF_BETA_BUSHO },
      pausesTime: true,
    });
    const modal = uiStore.getState().modal;
    render(
      <CaptiveModal
        officerId={OFF_BETA_BUSHO}
        onCommand={(command) => {
          const result = dispatchCommand(command);
          expect(result).toEqual({ ok: true });
          flushSync(() => {
            render(
              <ConfirmDialog
                open
                title="New native owner"
                message="Another decision"
                onConfirm={() => {}}
                onCancel={() => {}}
              />,
            );
          });
          expect(screen.getByRole('dialog', { name: 'New native owner' })).toBeTruthy();
          return result;
        }}
      />,
    );
    const before = structuredClone(game);
    fireEvent.click(screen.getByRole('button', { name: t(`cmd.captive.${action}`) }));
    if (action === 'execute') act(() => captured.confirm!());
    expect(getQueuedPlayerCommands(game)).toHaveLength(1);
    expect(game).toEqual(before);
    expect(uiStore.getState().modal).toBe(modal);
    expect(uiStore.getState().queuedDecisionIds).toEqual([]);
    expect(screen.getByRole('dialog', { name: 'New native owner' })).toBeTruthy();
  },
);
it('does not close the captive FIFO on invalid-subject publication underneath another native owner', () => {
  const { game } = setup(false);
  render(
    <ConfirmDialog
      open
      title="Unrelated consent"
      message="Another decision"
      onConfirm={() => {}}
      onCancel={() => {}}
    />,
  );
  const modal = uiStore.getState().modal;
  act(() => {
    const officer = game.officers[OFF_BETA_BUSHO]!;
    officer.status = 'serving';
    officer.capturedByClanId = null;
    officer.locationCastleId = buildTinyState().officers[OFF_BETA_BUSHO]!.locationCastleId;
    bumpTickSeq();
  });
  expect(validateState(game)).toEqual([]);
  expect(uiStore.getState().modal).toBe(modal);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  const background = screen
    .getByTestId('captive-modal')
    .closest('[data-ui-dialog]')!.parentElement!;
  fireEvent.mouseDown(background);
  expect(uiStore.getState().modal).toBe(modal);
});
it('exposes disabled execution reasons accessibly and rejected confirmation feedback within its owned native dialog', () => {
  const { game, confirm } = setup();
  game.officers[OFF_BETA_BUSHO]!.capturedByClanId = game.officers[OFF_BETA_BUSHO]!.clanId;
  act(() => confirm());
  const dialog = screen.getAllByRole('dialog').at(-1)!;
  expect(within(dialog).getByRole('alert').textContent).toBeTruthy();
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  fireEvent.click(within(dialog).getByRole('button', { name: t('ui.common.cancel') }));
  act(() => bumpTickSeq());
  const button = screen.getByRole('button', { name: t('cmd.captive.execute') });
  expect(button.hasAttribute('disabled')).toBe(true);
  const reason = document.getElementById(button.getAttribute('aria-describedby')!);
  expect(reason?.textContent).toBe(button.getAttribute('title'));
});
it.each(['recruit', 'release', 'execute'] as const)(
  'queues the current legal %s action and settles only on the actual next day',
  (action) => {
    const { game, confirm } = setup(action === 'execute');
    const before = structuredClone(game);
    const success = createRngStream(structuredClone(game.rng), 'misc').chance(
      captiveRecruitSuccessRate(game, OFF_BETA_BUSHO, null, game.meta.playerClanId),
    );
    const signing =
      officerAbilityScore(game.officers[OFF_BETA_BUSHO]!) * BAL.recruitSigningBonusPerAbility;
    if (action === 'execute') act(() => confirm());
    else fireEvent.click(screen.getByRole('button', { name: t(`cmd.captive.${action}`) }));
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toHaveLength(1);
    expect(uiStore.getState().queuedDecisionIds).toEqual([OFF_BETA_BUSHO]);
    expect(uiStore.getState().modal).toBeNull();
    act(() => {
      runOneDay();
    });
    const target = game.officers[OFF_BETA_BUSHO]!;
    expect(target.status).toBe(
      action === 'execute' ? 'dead' : action === 'release' || success ? 'serving' : 'captive',
    );
    expect(game.clans[game.meta.playerClanId]!.gold).toBe(
      before.clans[game.meta.playerClanId]!.gold - (action === 'recruit' && success ? signing : 0),
    );
    expect(validateState(game)).toEqual([]);
  },
);
it.each(['status', 'captor', 'location'] as const)(
  'fresh central validation rejects changed %s facts without a tick notification',
  (change) => {
    const { game, confirm } = setup();
    const target = game.officers[OFF_BETA_BUSHO]!;
    if (change === 'status') target.status = 'serving';
    if (change === 'captor') target.capturedByClanId = target.clanId;
    if (change === 'location') target.locationCastleId = null;
    // Deliberately changed negative validator inputs, not claimed as a legal captured-state journey.
    const before = structuredClone(game);
    const modal = uiStore.getState().modal;
    act(() => confirm());
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    expect(uiStore.getState().modal).toBe(modal);
  },
);
it.each(['unmount', 'load', 'modal', 'subject', 'title', 'fatal', 'viewport', 'gameOver'] as const)(
  'rejects captured destructive consent after %s without core, RNG, queue or modal effects',
  (change) => {
    const { game, view, confirm } = setup();
    let current = game;
    act(() => {
      if (change === 'unmount') view.unmount();
      if (change === 'load') {
        current = gameFixture();
        setGame(current);
        initializeBridgeSession(current);
      }
      if (change === 'modal') {
        uiStore.getState().actions.closeModal();
        uiStore.getState().actions.enqueueModal({
          id: 'systemMenu',
          params: { officerId: OFF_BETA_BUSHO },
          pausesTime: false,
        });
      }
      if (change === 'subject') {
        game.officers[OFF_BETA_BUSHO] = structuredClone(game.officers[OFF_BETA_BUSHO]!);
        bumpTickSeq();
      }
      if (change === 'title') store.getState().actions.setScreen('title');
      if (change === 'fatal')
        store.setState({
          session: {
            ...store.getState().session,
            fatalError: { code: 'test', message: 'test', stack: '' },
          },
        });
      if (change === 'viewport') store.getState().actions.setViewportBlocked(true);
      if (change === 'gameOver') game.meta.gameOver = { kind: 'defeat', endingId: 'no-castle' };
    });
    const before = structuredClone(current);
    const modal = uiStore.getState().modal;
    const queued = [...uiStore.getState().queuedDecisionIds];
    act(() => confirm());
    expect(getQueuedPlayerCommands(current)).toEqual([]);
    expect(current).toEqual(before);
    expect(uiStore.getState().modal).toBe(modal);
    expect(uiStore.getState().queuedDecisionIds).toEqual(queued);
  },
);
it('retains legitimate consent on an ordinary tick and submits exactly once through normal settlement', () => {
  const { game, confirm } = setup();
  act(() => bumpTickSeq());
  expect(
    within(screen.getAllByRole('dialog').at(-1)!).getByRole('button', {
      name: t('ui.common.confirm'),
    }),
  ).toBeTruthy();
  const before = structuredClone(game);
  act(() => confirm());
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toHaveLength(1);
  expect(uiStore.getState().modal).toBeNull();
  act(() => confirm());
  expect(getQueuedPlayerCommands(game)).toHaveLength(1);
  act(() => {
    runOneDay();
  });
  expect(game.officers[OFF_BETA_BUSHO]!.status).toBe('dead');
  expect(validateState(game)).toEqual([]);
});
it.each(['game', 'modal', 'title'] as const)(
  'does not publish or close replacement ownership during the %s command port',
  (change) => {
    const game = gameFixture();
    resetGameStoreForTests(game);
    initializeBridgeSession(game);
    store.getState().actions.setScreen('main');
    uiStore.getState().actions.enqueueModal({
      id: 'captive',
      params: { officerId: OFF_BETA_BUSHO },
      pausesTime: true,
    });
    let replacement = game;
    render(
      <CaptiveModal
        officerId={OFF_BETA_BUSHO}
        onCommand={(command) => {
          const result = dispatchCommand(command);
          expect(result).toEqual({ ok: true });
          if (change === 'game') {
            replacement = gameFixture();
            setGame(replacement);
            initializeBridgeSession(replacement);
          }
          if (change === 'modal') {
            uiStore.getState().actions.closeModal();
            uiStore
              .getState()
              .actions.enqueueModal({ id: 'systemMenu', params: {}, pausesTime: false });
          }
          if (change === 'title') store.getState().actions.setScreen('title');
          return result;
        }}
      />,
    );
    const before = structuredClone(game);
    fireEvent.click(screen.getByRole('button', { name: t('cmd.captive.release') }));
    expect(game).toEqual(before);
    expect(uiStore.getState().queuedDecisionIds).toEqual([]);
    if (change === 'game') {
      expect(getQueuedPlayerCommands(replacement)).toEqual([]);
      expect(uiStore.getState().modal?.id).toBe('captive');
    } else {
      expect(getQueuedPlayerCommands(game)).toHaveLength(1);
      expect(uiStore.getState().modal?.id).toBe(change === 'modal' ? 'systemMenu' : 'captive');
    }
  },
);
it('does not close a different owner merely because it carries the invalid captive officer ID', () => {
  const game = gameFixture();
  game.officers[OFF_BETA_BUSHO]!.status = 'serving';
  game.officers[OFF_BETA_BUSHO]!.capturedByClanId = null;
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  uiStore.getState().actions.enqueueModal({
    id: 'systemMenu',
    params: { officerId: OFF_BETA_BUSHO },
    pausesTime: false,
  });
  const modal = uiStore.getState().modal;
  render(<CaptiveModal officerId={OFF_BETA_BUSHO} />);
  expect(uiStore.getState().modal).toBe(modal);
});
