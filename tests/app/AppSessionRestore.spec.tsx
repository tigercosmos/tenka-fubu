import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import LZString from 'lz-string';

const hoisted = vi.hoisted(() => ({ apps: [] as { destroyed: boolean }[] }));
// Component renderer fixtures use the actual committed WASM with an independent owner.
vi.mock('@ui/map/wasmGeographicScorer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ui/map/wasmGeographicScorer')>();
  const { realRenderWasmExports } = await import('../helpers/realRenderWasm');
  return {
    ...actual,
    createWasmGeographicScorer: (exports?: Record<string, unknown>) =>
      actual.createWasmGeographicScorer(exports ?? realRenderWasmExports()),
  };
});

vi.mock('pixi.js', async () => {
  const { createPixiMockClasses } = await import('../helpers/pixiMock');
  return createPixiMockClasses(hoisted.apps);
});
// Only screen rendering is stubbed: App routing, wizard, persistence, codec and mountGame are real.
// The synthetic mini battle has no production catalog; all real scenarios use the real provider.
vi.mock('../../src/app/events/scenarioEventEngine', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/app/events/scenarioEventEngine')>();
  const { createRuntimeEventEngine } = await import('../../src/core/systems/events/runtime');
  return {
    loadScenarioEventEngine: (id: string) =>
      id === 'mini'
        ? Promise.resolve(createRuntimeEventEngine([]))
        : actual.loadScenarioEventEngine(id),
  };
});
vi.mock('../../src/ui/screens/MainScreen', () => ({
  MainScreen: () => <main data-testid="screen-strategy" />,
}));
vi.mock('../../src/ui/screens/BattleScreen', () => ({
  BattleScreen: () => <main data-testid="screen-battle" />,
}));

import { App } from '../../src/app/App';
import { initializeBridgeSession, resetBridgeForTests, runOneDay } from '../../src/app/bridge';
import { resetGameStoreForTests, setGame, store } from '../../src/app/store';
import { settingsStore } from '../../src/app/settings/runtime';
import { SettingsSchema } from '../../src/app/settings';
import { indexedDbSaveStorage } from '../../src/app/persistence/storage';
import { createMemorySaveStorage } from '../../src/app/persistence/storage';
import { createSaveStore } from '../../src/app/persistence/saveStore';
import { buildSaveFile } from '../../src/core/save/serialize';
import { useUIStore } from '../../src/ui/hooks/uiStore';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { validateState } from '../../src/core/state/invariants';
import { buildTinyState } from '../fixtures/tiny';
import { buildBattleTranscriptInitialState, MINI_DUEL_LAYOUT_ID } from '../golden/battleTranscript';
import { t } from '../../src/i18n/zh-TW';
import type { GameState } from '../../src/core/state/gameState';

beforeEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(null);
  useUIStore.getState().actions.reset();
  settingsStore.setState({ settings: SettingsSchema.parse({ effectsEnabled: false }) });
  vi.spyOn(indexedDbSaveStorage, 'get').mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests(null);
  useUIStore.getState().actions.reset();
  settingsStore.setState({ settings: SettingsSchema.parse({}) });
  document.documentElement.style.removeProperty('--ui-scale');
  document.documentElement.style.removeProperty('font-size');
  vi.restoreAllMocks();
});

async function enterMain(): Promise<void> {
  render(<App />);
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
  fireEvent.click(screen.getByTestId('daimyo-next'));
  fireEvent.click(screen.getByTestId('difficulty-next'));
  fireEvent.click(screen.getByTestId('newgame-start'));
  await waitFor(() => expect(screen.getByTestId('screen-strategy')).toBeTruthy());
}
async function quickLoad(saved: GameState): Promise<void> {
  expect(validateState(saved)).toEqual([]);
  const previous = store.getState().game,
    tickSeq = store.getState().tickSeq;
  const blob = LZString.compressToUTF16(encodeSave(saved, 123));
  vi.spyOn(indexedDbSaveStorage, 'get').mockImplementation((key) =>
    Promise.resolve(key === 'tf.save.quick:1.blob' ? blob : undefined),
  );
  fireEvent.keyDown(window, { key: 'F9' });
  await waitFor(() => expect(store.getState().game).not.toBe(previous));
  expect(store.getState().tickSeq).toBe(tickSeq);
  expect(store.getState().game).toEqual(saved);
}

describe('App loaded session routing without a strategy tick', () => {
  it('keeps SystemMenu ownership while a real nested delete refreshes its save list', async () => {
    const memory = createMemorySaveStorage();
    vi.spyOn(indexedDbSaveStorage, 'get').mockImplementation((key) => memory.get(key));
    vi.spyOn(indexedDbSaveStorage, 'setMany').mockImplementation((entries) =>
      memory.setMany(entries),
    );
    vi.spyOn(indexedDbSaveStorage, 'delMany').mockImplementation((keys) => memory.delMany(keys));
    const saves = createSaveStore(indexedDbSaveStorage);
    expect(await saves.saveToSlot('manual:1', buildSaveFile(buildTinyState(), 123))).toEqual({
      ok: true,
    });
    await enterMain();
    const game = store.getState().game;
    act(() =>
      useUIStore
        .getState()
        .actions.enqueueModal({ id: 'systemMenu', params: {}, pausesTime: true }),
    );
    const parent = useUIStore.getState().modal;
    fireEvent.click(screen.getByRole('button', { name: t('ui.system.load') }));
    await waitFor(() =>
      expect(screen.getByTestId('save-load-panel').getAttribute('aria-busy')).toBe('false'),
    );
    fireEvent.click(
      within(screen.getByTestId('save-slot-manual:1')).getByRole('button', {
        name: t('ui.save.action.delete'),
      }),
    );
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(useUIStore.getState().modal).toBe(parent);
    fireEvent.click(screen.getByRole('button', { name: t('ui.common.confirm') }));
    await waitFor(async () => expect(await memory.get('tf.save.manual:1.blob')).toBeUndefined());
    await waitFor(() =>
      expect(screen.getByTestId('save-load-panel').getAttribute('aria-busy')).toBe('false'),
    );
    expect(useUIStore.getState().modal).toBe(parent);
    expect(store.getState().game).toBe(game);
    expect(store.getState().session.speed).toBe('paused');
    fireEvent.click(screen.getByRole('button', { name: t('ui.common.back') }));
    expect(screen.getByRole('button', { name: t('ui.system.resume') })).toBeTruthy();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
  });

  it('deletes a title-list save through one owned native confirmation and real controller/storage codec', async () => {
    const memory = createMemorySaveStorage();
    vi.spyOn(indexedDbSaveStorage, 'get').mockImplementation((key) => memory.get(key));
    vi.spyOn(indexedDbSaveStorage, 'setMany').mockImplementation((entries) =>
      memory.setMany(entries),
    );
    vi.spyOn(indexedDbSaveStorage, 'delMany').mockImplementation((keys) => memory.delMany(keys));
    const saves = createSaveStore(indexedDbSaveStorage);
    const saved = buildSaveFile(buildTinyState(), 123);
    expect(validateState(saved.state)).toEqual([]);
    expect(await saves.saveToSlot('manual:1', saved)).toEqual({ ok: true });
    render(<App />);
    fireEvent.click(screen.getByTestId('title-save-list'));
    await waitFor(() =>
      expect(screen.getByTestId('save-load-panel').getAttribute('aria-busy')).toBe('false'),
    );
    fireEvent.click(
      within(screen.getByTestId('save-slot-manual:1')).getByRole('button', {
        name: t('ui.save.action.delete'),
      }),
    );
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: t('ui.common.back') })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: t('ui.common.confirm') }));
    await waitFor(async () => expect(await memory.get('tf.save.manual:1.blob')).toBeUndefined());
    await waitFor(() =>
      expect(screen.getByTestId('save-load-panel').getAttribute('aria-busy')).toBe('false'),
    );
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(store.getState().game).toBeNull();
    expect(store.getState().session.screen).toBe('title');
    expect(screen.getByRole('button', { name: t('ui.common.back') })).toBeTruthy();
  });

  it.each(['pause', 'ui-reset'] as const)(
    'preserves a same-game replacement menu opened during title %s publication',
    async (publication) => {
      await enterMain();
      const game = store.getState().game!;
      act(() =>
        useUIStore.getState().actions.enqueueModal({
          id: 'systemMenu',
          params: {},
          pausesTime: true,
        }),
      );
      const original = useUIStore.getState().modal!;
      const replacement = { ...original, params: { requestId: 'new-menu' } };
      let replaced = false;
      const replace = () => {
        if (replaced) return;
        replaced = true;
        if (useUIStore.getState().modal === original)
          useUIStore
            .getState()
            .actions.closeOwnedModal(original, { resume: false, expectedGame: game });
        useUIStore.getState().actions.enqueueModal(replacement);
      };
      const unsubscribe =
        publication === 'ui-reset'
          ? useUIStore.subscribe((next, previous) => {
              if (previous.modal === original && next.modal === null) replace();
            })
          : store.subscribe((next, previous) => {
              if (next.game === game && next.session !== previous.session) replace();
            });
      const before = structuredClone(game);
      try {
        fireEvent.click(screen.getByRole('button', { name: t('ui.system.toTitle') }));
        expect(replaced).toBe(true);
        expect(store.getState().game).toBe(game);
        expect(useUIStore.getState().modal).toBe(replacement);
        expect(store.getState().session.screen).toBe('main');
        expect(game).toEqual(before);
      } finally {
        unsubscribe();
      }
    },
  );
  it('cancels dirty title consent without state changes and discards only after real confirmation', async () => {
    await enterMain();
    act(() => {
      runOneDay();
    });
    const game = store.getState().game!;
    const before = structuredClone(game);
    expect(validateState(game)).toEqual([]);
    act(() =>
      useUIStore.getState().actions.enqueueModal({
        id: 'systemMenu',
        params: {},
        pausesTime: true,
      }),
    );
    const owner = useUIStore.getState().modal;
    fireEvent.click(screen.getByRole('button', { name: t('ui.system.toTitle') }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(useUIStore.getState().modal).toBe(owner);
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: t('ui.common.cancel') }),
    );
    expect(store.getState().game).toBe(game);
    expect(game).toEqual(before);
    fireEvent.click(screen.getByRole('button', { name: t('ui.system.toTitle') }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: t('ui.common.confirm') }),
    );
    expect(store.getState().game).toBeNull();
    expect(store.getState().session.screen).toBe('title');
    expect(store.getState().session.speed).toBe('paused');
    expect(screen.getByTestId('title-newgame')).toBeTruthy();
    expect(game).toEqual(before);
  });
  it('keeps the real quick-loaded replacement safe from retained dirty-title confirmation', async () => {
    await enterMain();
    act(() => {
      runOneDay();
    });
    const original = store.getState().game!;
    const payload = encodeSave(original, 123);
    const blob = LZString.compressToUTF16(payload);
    vi.spyOn(indexedDbSaveStorage, 'get').mockImplementation((key) =>
      Promise.resolve(key === 'tf.save.quick:1.blob' ? blob : undefined),
    );
    act(() =>
      useUIStore.getState().actions.enqueueModal({
        id: 'systemMenu',
        params: {},
        pausesTime: true,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: t('ui.system.toTitle') }));
    const confirmButton = within(screen.getByRole('dialog')).getByRole('button', {
      name: t('ui.common.confirm'),
    });
    const propsKey = Object.keys(confirmButton).find((key) => key.startsWith('__reactProps$'))!;
    const retained = (confirmButton as unknown as Record<string, { onClick: () => void }>)[
      propsKey
    ]!.onClick;
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: t('ui.common.cancel') }),
    );
    fireEvent.click(screen.getByRole('button', { name: t('ui.system.resume') }));
    fireEvent.keyDown(window, { key: 'F9' });
    fireEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', {
        name: t('ui.common.confirm'),
      }),
    );
    await waitFor(() => expect(store.getState().game).not.toBe(original));
    const replacement = store.getState().game!;
    expect(replacement.meta).toEqual(original.meta);
    const before = structuredClone(replacement);
    act(() => retained());
    expect(store.getState().game).toBe(replacement);
    expect(replacement).toEqual(before);
    expect(store.getState().session.screen).toBe('main');
    expect(validateState(replacement)).toEqual([]);
  });
  it.each(['pause', 'ui-reset', 'game-null'] as const)(
    'does not discard a native replacement installed during title %s publication',
    async (publication) => {
      await enterMain();
      const original = store.getState().game!;
      const decoded = decodeSave(encodeSave(original, 123));
      expect(decoded.ok).toBe(true);
      if (!decoded.ok) throw new Error(decoded.code);
      const replacement = decoded.saveFile.state;
      expect(validateState(replacement)).toEqual([]);
      act(() =>
        useUIStore.getState().actions.enqueueModal({
          id: 'systemMenu',
          params: {},
          pausesTime: true,
        }),
      );
      const owner = useUIStore.getState().modal;
      let replaced = false;
      const replace = () => {
        if (replaced) return;
        replaced = true;
        setGame(replacement);
        initializeBridgeSession(replacement, [], { loaded: true });
      };
      const unsubscribe =
        publication === 'ui-reset'
          ? useUIStore.subscribe((next, previous) => {
              if (previous.modal === owner && next.modal === null) replace();
            })
          : store.subscribe((next, previous) => {
              if (
                publication === 'pause'
                  ? next.game === original && next.session !== previous.session
                  : previous.game === original && next.game === null
              )
                replace();
            });
      const before = structuredClone(replacement);
      try {
        fireEvent.click(screen.getByRole('button', { name: t('ui.system.toTitle') }));
        expect(replaced).toBe(true);
        expect(store.getState().game).toBe(replacement);
        expect(replacement).toEqual(before);
        expect(store.getState().session.screen).toBe('main');
        expect(screen.getByTestId('screen-strategy')).toBeTruthy();
        expect(validateState(replacement)).toEqual([]);
      } finally {
        unsubscribe();
      }
    },
  );
  it('routes a saved unresolved battle immediately when the prior battle selection is null', async () => {
    await enterMain();
    const { state } = buildBattleTranscriptInitialState(42, MINI_DUEL_LAYOUT_ID);
    await quickLoad(state);
    await waitFor(() => expect(screen.getByTestId('screen-battle')).toBeTruthy());
    expect(store.getState().session.screen).toBe('battle');
    expect(store.getState().session.speed).toBe('paused');
  });
  it('routes a saved ending immediately when observing was already false', async () => {
    await enterMain();
    const state = buildTinyState();
    state.meta.gameOver = { kind: 'victory', endingId: 'tenkabito' };
    await quickLoad(state);
    await waitFor(() => expect(screen.getByTestId('screen-ending')).toBeTruthy());
    expect(store.getState().session.screen).toBe('ending');
    expect(store.getState().session.speed).toBe('paused');
  });
  it('keeps a saved terminal ending ahead of an unresolved battle', async () => {
    await enterMain();
    const { state } = buildBattleTranscriptInitialState(42, MINI_DUEL_LAYOUT_ID);
    state.meta.gameOver = { kind: 'victory', endingId: 'tenkabito' };
    await quickLoad(state);
    await waitFor(() => expect(screen.getByTestId('screen-ending')).toBeTruthy());
    expect(screen.queryByTestId('screen-battle')).toBeNull();
    expect(store.getState().session.screen).toBe('ending');
    expect(store.getState().session.speed).toBe('paused');
  });
});
