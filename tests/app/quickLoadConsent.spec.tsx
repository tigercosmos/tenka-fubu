import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('pixi.js', async () => {
  const { createPixiMockClasses } = await import('../helpers/pixiMock');
  return createPixiMockClasses([]);
});
// Rendering only is stubbed; the wizard, App, controller, storage, codec and event catalog are real.
vi.mock('../../src/ui/screens/MainScreen', () => ({
  MainScreen: () => <main data-testid="screen-strategy" />,
}));
import { App } from '../../src/app/App';
import { initializeBridgeSession, resetBridgeForTests, runOneDay } from '../../src/app/bridge';
import { resetGameStoreForTests, setGame, store } from '../../src/app/store';
import { createMemorySaveStorage, indexedDbSaveStorage } from '../../src/app/persistence/storage';
import { createSaveStore } from '../../src/app/persistence/saveStore';
import { buildSaveFile, decodeSave, encodeSave } from '../../src/core/save/serialize';
import { validateState } from '../../src/core/state/invariants';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { t } from '../../src/i18n/zh-TW';
import { ConfirmDialog } from '../../src/ui/components';

beforeEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
});
afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
  vi.restoreAllMocks();
});
function handler(button: HTMLElement): () => void {
  const key = Object.keys(button).find((name) => name.startsWith('__reactProps$'));
  expect(key).toBeTruthy();
  return (button as unknown as Record<string, { onClick: () => void }>)[key!]!.onClick;
}
async function setup(open = true) {
  const memory = createMemorySaveStorage();
  const read = vi.spyOn(indexedDbSaveStorage, 'get').mockImplementation((key) => memory.get(key));
  vi.spyOn(indexedDbSaveStorage, 'setMany').mockImplementation((entries) =>
    memory.setMany(entries),
  );
  vi.spyOn(indexedDbSaveStorage, 'delMany').mockImplementation((keys) => memory.delMany(keys));
  const view = render(<App />);
  fireEvent.click(screen.getByTestId('title-save-list'));
  await waitFor(() =>
    expect(screen.getByTestId('save-load-panel').getAttribute('aria-busy')).toBe('false'),
  );
  fireEvent.click(screen.getByRole('button', { name: t('ui.common.back') }));
  fireEvent.click(screen.getByTestId('title-newgame'));
  await waitFor(() =>
    expect(screen.getByTestId('scenario-pick-s1560')).toHaveProperty('disabled', false),
  );
  fireEvent.click(screen.getByTestId('scenario-pick-s1560'));
  fireEvent.click(screen.getByTestId('clan-pick-clan.oda'));
  fireEvent.click(screen.getByTestId('newgame-start'));
  await waitFor(() => expect(screen.getByTestId('screen-strategy')).toBeTruthy());
  const game = store.getState().game!;
  expect(validateState(game)).toEqual([]);
  const saves = createSaveStore(indexedDbSaveStorage);
  expect(await saves.saveToSlot('quick:1', buildSaveFile(game, 123))).toEqual({ ok: true });
  act(() => {
    runOneDay();
    uiStore.getState().actions.reset();
  });
  if (open) fireEvent.keyDown(window, { key: 'F9' });
  const dialog = open ? await screen.findByRole('dialog') : null;
  const confirm = dialog
    ? handler(within(dialog).getByRole('button', { name: t('ui.common.confirm') }))
    : () => {};
  const cancel = dialog
    ? handler(within(dialog).getByRole('button', { name: t('ui.common.cancel') }))
    : () => {};
  read.mockClear();
  return { game, confirm, cancel, read, view, saves, memory };
}
it('does not let retained quickload consent load over a same-ID native replacement game', async () => {
  const { game, confirm, read } = await setup();
  const decoded = decodeSave(encodeSave(game, 456));
  expect(decoded.ok).toBe(true);
  if (!decoded.ok) throw new Error(decoded.code);
  const replacement = decoded.saveFile.state;
  act(() => {
    setGame(replacement);
    initializeBridgeSession(replacement);
  });
  const before = structuredClone(replacement);
  await act(async () => {
    confirm();
    await Promise.resolve();
  });
  expect(store.getState().game).toBe(replacement);
  expect(replacement).toEqual(before);
  expect(read).not.toHaveBeenCalled();
});

it.each(['unmount', 'title', 'viewport', 'native', 'fifo'] as const)(
  'rejects retained quickload confirmation after %s ownership loss',
  async (change) => {
    const { game, confirm, read, view } = await setup();
    act(() => {
      if (change === 'unmount') view.unmount();
      if (change === 'title') store.getState().actions.setScreen('title');
      if (change === 'viewport')
        store.setState((state) => ({ session: { ...state.session, viewportBlocked: true } }));
      if (change === 'fifo') {
        const original = uiStore.getState().modal;
        expect(original?.id).toBe('confirm');
        uiStore
          .getState()
          .actions.closeOwnedModal(original!, { resume: false, expectedGame: game });
        uiStore
          .getState()
          .actions.enqueueModal({ id: 'monthSummary', params: {}, pausesTime: true });
      }
    });
    if (change === 'native')
      render(
        <ConfirmDialog
          open
          title="Other owner"
          message="Unrelated"
          onConfirm={() => {}}
          onCancel={() => {}}
        />,
      );
    const before = structuredClone(game);
    await act(async () => {
      confirm();
      await Promise.resolve();
    });
    expect(read).not.toHaveBeenCalled();
    expect(store.getState().game).toBe(game);
    expect(game).toEqual(before);
  },
);

it('does not revive a canceled quickload callback when a new request opens', async () => {
  const { game, confirm, cancel, read } = await setup();
  act(cancel);
  fireEvent.keyDown(window, { key: 'F9' });
  const nextDialog = await screen.findByRole('dialog');
  // Opening the fresh request legitimately captures the current slot version.
  read.mockClear();
  await act(async () => {
    confirm();
    await Promise.resolve();
  });
  expect(read).not.toHaveBeenCalled();
  expect(store.getState().game).toBe(game);
  expect(nextDialog.isConnected).toBe(true);
});

it('loads the real quick slot once on current explicit consent and keeps manual pause', async () => {
  const { game, confirm } = await setup();
  await act(async () => {
    confirm();
    confirm();
    await Promise.resolve();
  });
  expect(store.getState().game).not.toBe(game);
  expect(store.getState().game!.time.day).toBe(0);
  expect(validateState(store.getState().game!)).toEqual([]);
  expect(store.getState().session.speed).toBe('paused');
});

it('does not load different quick-slot bytes written after the original consent opened', async () => {
  const { game, confirm, saves, memory } = await setup();
  const original = await saves.loadFromSlot('quick:1');
  expect(original.ok).toBe(true);
  if (!original.ok) throw new Error(original.error);
  const changed = structuredClone(original.save.state);
  changed.clans[changed.meta.playerClanId]!.gold += 1;
  expect(validateState(changed)).toEqual([]);
  const next = buildSaveFile(changed, original.save.timestamp);
  expect(next.meta).toEqual(original.save.meta);
  expect(await saves.saveToSlot('quick:1', next)).toEqual({ ok: true });
  const bytes = await memory.get('tf.save.quick:1.blob');
  const before = structuredClone(game);
  await act(async () => {
    confirm();
    await Promise.resolve();
  });
  expect(store.getState().game).toBe(game);
  expect(game).toEqual(before);
  expect(await memory.get('tf.save.quick:1.blob')).toBe(bytes);
  const alert = await screen.findByRole('dialog');
  fireEvent.click(within(alert).getByRole('button', { name: t('ui.common.back') }));
  fireEvent.keyDown(window, { key: 'F9' });
  const fresh = await screen.findByRole('dialog');
  await act(async () => {
    fireEvent.click(within(fresh).getByRole('button', { name: t('ui.common.confirm') }));
    await Promise.resolve();
  });
  expect(store.getState().game!.clans[changed.meta.playerClanId]!.gold).toBe(
    changed.clans[changed.meta.playerClanId]!.gold,
  );
  expect(validateState(store.getState().game!)).toEqual([]);
});

it('cannot revive old quickload consent after a foreign native dialog temporarily owns foreground', async () => {
  const { game, confirm, read } = await setup();
  const foreign = render(
    <ConfirmDialog
      open
      title="Other owner"
      message="Unrelated"
      onConfirm={() => {}}
      onCancel={() => {}}
    />,
  );
  foreign.unmount();
  await act(async () => {
    await Promise.resolve();
  });
  const before = structuredClone(game);
  await act(async () => {
    confirm();
    await Promise.resolve();
  });
  expect(store.getState().game).toBe(game);
  expect(game).toEqual(before);
  expect(read).not.toHaveBeenCalled();
});

it('keeps a required arrival queued until current quickload cancellation hands it off without resuming', async () => {
  const { game, cancel, read } = await setup();
  const original = uiStore.getState().modal;
  expect(original?.id).toBe('confirm');
  const arrival = { id: 'monthSummary' as const, params: {}, pausesTime: true };
  act(() => {
    uiStore.getState().actions.enqueueModal(arrival);
  });
  expect(uiStore.getState().modal).toBe(original);
  expect(uiStore.getState().modalQueue).toContain(arrival);
  expect(screen.getAllByRole('dialog')).toHaveLength(1);
  act(cancel);
  expect(uiStore.getState().modal).toBe(arrival);
  expect(store.getState().session.speed).toBe('paused');
  expect(store.getState().game).toBe(game);
  expect(read).not.toHaveBeenCalled();
});

it.each([false, true])(
  'bounds duplicate F9 capture and discards a replaced original game (replacement=%s)',
  async (replace) => {
    const { game, memory, read } = await setup(false);
    let release!: () => void;
    let started!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      started = resolve;
    });
    let captures = 0;
    read.mockImplementation(async (key) => {
      const value = await memory.get(key);
      if (key === 'tf.save.quick:1.blob') {
        captures += 1;
        started();
        await blocked;
      }
      return value;
    });
    fireEvent.keyDown(window, { key: 'F9' });
    fireEvent.keyDown(window, { key: 'F9' });
    await act(async () => {
      await entered;
    });
    expect(captures).toBe(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    let current = game;
    if (replace) {
      const decoded = decodeSave(encodeSave(game, 456));
      expect(decoded.ok).toBe(true);
      if (!decoded.ok) throw new Error(decoded.code);
      current = decoded.saveFile.state;
      act(() => {
        setGame(current);
        initializeBridgeSession(current);
      });
    }
    await act(async () => {
      release();
      await Promise.resolve();
    });
    if (replace) {
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(uiStore.getState().modal).toBeNull();
    } else {
      await screen.findByRole('dialog');
      expect(screen.getAllByRole('dialog')).toHaveLength(1);
      expect(uiStore.getState().modal?.params.owner).toBe('quickLoad');
      expect(uiStore.getState().modalQueue).toEqual([]);
    }
    expect(captures).toBe(1);
    expect(store.getState().game).toBe(current);
    expect(validateState(current)).toEqual([]);
  },
);
