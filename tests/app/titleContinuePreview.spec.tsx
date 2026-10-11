import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('pixi.js', async () => {
  const { createPixiMockClasses } = await import('../helpers/pixiMock');
  return createPixiMockClasses([]);
});
import { App } from '../../src/app/App';
import { resetGameStoreForTests, store } from '../../src/app/store';
import {
  captureSaveSnapshot,
  getBridgeProgressMark,
  getQueuedPlayerCommands,
  initializeBridgeSession,
  resetBridgeForTests,
} from '../../src/app/bridge';
import { createMemorySaveStorage, indexedDbSaveStorage } from '../../src/app/persistence/storage';
import { createSaveStore } from '../../src/app/persistence/saveStore';
import { buildSaveFile, encodeSave, type SaveFile } from '../../src/core/save/serialize';
import { createSaveSessionController } from '../../src/app/persistence/saveSession';
import { createSessionProgressBinding } from '../../src/app/persistence/sessionProgress';
import { useSaveLoad } from '../../src/app/persistence/useSaveLoad';
import { validateState } from '../../src/core/state/invariants';
import { formatDate } from '../../src/i18n/zh-TW';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { buildTinyState, CLAN_ALPHA } from '../fixtures/tiny';

beforeEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
  vi.restoreAllMocks();
  localStorage.clear();
});

it('shows the real latest persisted save clan, game date and real time below Continue without changing game or queue', async () => {
  const memory = createMemorySaveStorage();
  const saves = createSaveStore(memory);
  const older = buildTinyState();
  older.clans[CLAN_ALPHA]!.name = '舊本家';
  const latest = buildTinyState();
  latest.clans[CLAN_ALPHA]!.name = '最新本家';
  expect(validateState(older)).toEqual([]);
  expect(validateState(latest)).toEqual([]);
  const before = structuredClone(latest);
  const timestamp = Date.UTC(2026, 0, 2, 3, 4, 5);
  expect(await saves.saveToSlot('manual:1', buildSaveFile(older, timestamp - 1000))).toEqual({
    ok: true,
  });
  expect(await saves.saveToSlot('manual:2', buildSaveFile(latest, timestamp))).toEqual({
    ok: true,
  });
  vi.spyOn(indexedDbSaveStorage, 'get').mockImplementation((key) => memory.get(key));
  vi.spyOn(indexedDbSaveStorage, 'setMany').mockImplementation((entries) =>
    memory.setMany(entries),
  );
  vi.spyOn(indexedDbSaveStorage, 'delMany').mockImplementation((keys) => memory.delMany(keys));
  vi.spyOn(indexedDbSaveStorage, 'keys').mockImplementation(() => memory.keys());
  render(<App />);
  await waitFor(() =>
    expect(screen.getByTestId('title-loadgame')).toHaveProperty('disabled', false),
  );
  expect(screen.getByTestId('title-continue-preview').textContent).toContain('最新本家');
  expect(screen.getByTestId('title-continue-preview').textContent).toContain(
    formatDate(latest.time.day),
  );
  expect(screen.getByTestId('title-continue-preview').textContent).toContain(
    new Date(timestamp).toLocaleString('zh-TW'),
  );
  expect(screen.getByTestId('title-loadgame').getAttribute('aria-describedby')).toBe(
    screen.getByTestId('title-continue-preview').id,
  );
  expect(screen.getByTestId('title-continue-preview').textContent).not.toContain('舊本家');
  expect(store.getState().game).toBeNull();
  expect(getBridgeProgressMark()).toBeNull();
  expect(store.getState().session.pendingCommandCount).toBe(0);
  expect(latest).toEqual(before);
  fireEvent.click(screen.getByTestId('title-loadgame'));
  await waitFor(() => expect(store.getState().game?.clans[CLAN_ALPHA]?.name).toBe('最新本家'));
  expect(store.getState().session.screen).toBe('main');
  expect(store.getState().session.speed).toBe('paused');
  expect(store.getState().game?.time).toEqual(latest.time);
  expect(store.getState().game?.rng).toEqual(latest.rng);
  expect(validateState(store.getState().game!)).toEqual([]);
  expect(getQueuedPlayerCommands(store.getState().game!)).toEqual([]);
});

function hookHarness(memory = createMemorySaveStorage()) {
  const game = buildTinyState();
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  const progress = createSessionProgressBinding({
    getSession: () => store.getState().game,
    getMark: getBridgeProgressMark,
    subscribe: (listener) => store.subscribe(listener),
    now: () => 0,
    target: { addEventListener() {}, removeEventListener() {} },
  });
  const controller = createSaveSessionController({
    adapter: memory,
    progress,
    getSession: () => store.getState().game,
    captureSnapshot: captureSaveSnapshot,
    wallNow: () => 123,
    appVersion: 'test',
  });
  controller.resetSession();
  const onLoad = vi.fn((_save: SaveFile, current: () => boolean) => expect(current()).toBe(true));
  return { game, controller, onLoad };
}

it('skips the newest corrupt native blob and loads exactly the previewed valid save', async () => {
  const memory = createMemorySaveStorage();
  const h = hookHarness(memory);
  const selected = buildSaveFile(h.game, 100);
  const corrupt = buildSaveFile(h.game, 200);
  expect(await h.controller.store.saveToSlot('manual:1', selected)).toEqual({ ok: true });
  expect(await h.controller.store.saveToSlot('manual:2', corrupt)).toEqual({ ok: true });
  // Real storage corruption: retain the newer summary but replace its native blob.
  await memory.setMany([['tf.save.manual:2.blob', 'broken native save']]);
  const before = structuredClone(h.game);
  const hook = renderHook(() => useSaveLoad(h.controller, h.onLoad));
  await waitFor(() => expect(hook.result.current.busy).toBe(false));
  expect(hook.result.current.continuePreview).toMatchObject({
    timestamp: 100,
    clanName: selected.meta.clanName,
  });
  await act(async () => hook.result.current.continueLatest());
  expect(h.onLoad).toHaveBeenCalledOnce();
  expect(h.onLoad.mock.calls[0]?.[0]).toEqual(selected);
  expect(h.game).toEqual(before);
  expect(getQueuedPlayerCommands(h.game)).toEqual([]);
  expect(validateState(h.game)).toEqual([]);
});

it('refreshes a detached preview after newer real writes and clears it after all saves are deleted', async () => {
  const h = hookHarness();
  const first = buildSaveFile(h.game, 100);
  await h.controller.store.saveToSlot('manual:1', first);
  const before = structuredClone(h.game);
  const hook = renderHook(() => useSaveLoad(h.controller, h.onLoad));
  await waitFor(() => expect(hook.result.current.busy).toBe(false));
  const originalPreview = hook.result.current.continuePreview;
  const secondGame = buildTinyState();
  secondGame.clans[CLAN_ALPHA]!.name = '新存檔本家';
  const second = buildSaveFile(secondGame, 300);
  await h.controller.store.saveToSlot('quick:1', second);
  await act(async () => {
    await hook.result.current.refresh();
  });
  expect(originalPreview).toMatchObject({ timestamp: 100, clanName: first.meta.clanName });
  expect(hook.result.current.continuePreview).toMatchObject({
    timestamp: 300,
    clanName: '新存檔本家',
  });
  await act(async () => hook.result.current.continueLatest());
  expect(h.onLoad.mock.calls[0]?.[0]).toEqual(second);
  await h.controller.store.deleteSlot('manual:1');
  await h.controller.store.deleteSlot('quick:1');
  await act(async () => {
    await hook.result.current.refresh();
  });
  expect(hook.result.current.continuePreview).toBeNull();
  expect(hook.result.current.hasSave).toBe(false);
  expect(h.game).toEqual(before);
  expect(getQueuedPlayerCommands(h.game)).toEqual([]);
});

it('uses the same legacy fallback selection for preview and loading, with persisted saves winning timestamp ties', async () => {
  const h = hookHarness();
  const persisted = buildSaveFile(h.game, 100);
  await h.controller.store.saveToSlot('manual:1', persisted);
  const legacyGame = buildTinyState();
  legacyGame.clans[CLAN_ALPHA]!.name = '舊格式本家';
  const legacy = buildSaveFile(legacyGame, 200);
  localStorage.setItem('tf.save.quick:1.blob', encodeSave(legacyGame, 200));
  // The real legacy medium stays available when copying into durable storage fails.
  vi.spyOn(h.controller.store, 'importLegacySlotIfEmpty').mockRejectedValue(
    new Error('blocked legacy copy'),
  );
  const hook = renderHook(() => useSaveLoad(h.controller, h.onLoad));
  await waitFor(() => expect(hook.result.current.busy).toBe(false));
  expect(hook.result.current.continuePreview).toMatchObject({
    timestamp: 200,
    clanName: legacy.meta.clanName,
  });
  await act(async () => hook.result.current.continueLatest());
  expect(h.onLoad.mock.calls[0]?.[0]).toEqual(legacy);
  const tied = buildSaveFile(h.game, 200);
  await h.controller.store.saveToSlot('manual:1', tied);
  await act(async () => {
    await hook.result.current.refresh();
  });
  expect(hook.result.current.continuePreview).toMatchObject({
    timestamp: 200,
    clanName: tied.meta.clanName,
  });
  await act(async () => hook.result.current.continueLatest());
  expect(h.onLoad.mock.calls[1]?.[0]).toEqual(tied);
});

it('keeps Continue disabled without a preview when every real storage slot is empty', async () => {
  const memory = createMemorySaveStorage();
  vi.spyOn(indexedDbSaveStorage, 'get').mockImplementation((key) => memory.get(key));
  vi.spyOn(indexedDbSaveStorage, 'setMany').mockImplementation((entries) =>
    memory.setMany(entries),
  );
  vi.spyOn(indexedDbSaveStorage, 'delMany').mockImplementation((keys) => memory.delMany(keys));
  vi.spyOn(indexedDbSaveStorage, 'keys').mockImplementation(() => memory.keys());
  render(<App />);
  fireEvent.click(screen.getByTestId('title-save-list'));
  await waitFor(() =>
    expect(screen.getByTestId('save-load-panel').getAttribute('aria-busy')).toBe('false'),
  );
  expect(screen.getByTestId('title-loadgame')).toHaveProperty('disabled', true);
  expect(screen.queryByTestId('title-continue-preview')).toBeNull();
  expect(store.getState().game).toBeNull();
  expect(getBridgeProgressMark()).toBeNull();
  expect(store.getState().session.pendingCommandCount).toBe(0);
});
