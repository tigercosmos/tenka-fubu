import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import { App } from '../../src/app/App';
import {
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
  getBridgeProgressMark,
} from '../../src/app/bridge';
import { resetGameStoreForTests, setGame, store } from '../../src/app/store';
import { settingsStore } from '../../src/app/settings/runtime';
import { SettingsSchema } from '../../src/app/settings';
import { indexedDbSaveStorage } from '../../src/app/persistence/storage';
import { createRuntimeEventEngine } from '../../src/core/systems/events/runtime';
import type { EventDef } from '../../src/core/systems/events/types';
import type { GameState } from '../../src/core/state/gameState';
import { validateState } from '../../src/core/state/invariants';
import { getTaimeiDef } from '../../src/core/systems/events/taimeiCatalog';
import type { EventId, TaimeiId } from '../../src/core/state/ids';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { t } from '../../src/i18n/zh-TW';
import { zCanonicalEventsFile } from '../../src/data/schemas/eventDefinitions';
import eventData from '../../src/data/scenarios/s1560/events.json';
import { calendarToDay, dayToCalendar } from '../../src/core/systems/time';
import { useUIStore } from '../../src/ui/hooks/uiStore';
import LZString from 'lz-string';
import { getEventPresentationSnapshot } from '../../src/app/events/eventPresentationQueue';

beforeEach(() => {
  resetBridgeForTests();
  useUIStore.getState().actions.reset();
  resetGameStoreForTests(null);
  settingsStore.setState({ settings: SettingsSchema.parse({ effectsEnabled: false }) });
  vi.spyOn(indexedDbSaveStorage, 'get').mockResolvedValue(undefined);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});
afterEach(() => {
  cleanup();
  resetBridgeForTests();
  useUIStore.getState().actions.reset();
  settingsStore.setState({ settings: SettingsSchema.parse({}) });
  document.documentElement.style.removeProperty('--ui-scale');
  document.documentElement.style.removeProperty('font-size');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function startRealGame(): Promise<GameState> {
  render(<App />);
  // Await real save UI initialization so export is available in failure cases too.
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
  const game = store.getState().game;
  if (game === null) throw new Error('Real wizard did not mount its game');
  return game;
}
function preparePending(game: GameState): EventDef {
  const castle = Object.values(game.castles).find(
    (row) => row.ownerClanId === game.meta.playerClanId,
  )!;
  const district = Object.values(game.districts).find((row) => row.castleId === castle.id)!;
  const id = 'evt.app-integration' as EventId;
  game.events.pendingChoiceEventId = id;
  game.events.pendingChoiceBinding = {
    clanId: game.meta.playerClanId,
    castleId: castle.id,
    districtId: district.id,
  };
  game.events.fired[id] = game.time.day;
  return {
    id,
    kind: 'historical',
    priority: 20,
    target: 'randomDistrict',
    ownerCandidates: ['$clan'],
    trigger: {
      from: { year: 1560, month: 1, day: 1 },
      to: { year: 1562, month: 12, day: 30 },
      check: 'monthStart',
      hooks: [],
      conditions: [],
      probability: 1,
      once: true,
      cooldownDays: 0,
      cooldownKey: null,
    },
    cutscene: {
      title: '存檔中的抉擇',
      body: '{clanName}／{castleName}／{districtName}',
      monClanId: '$clan',
    },
    effects: [],
    choices: [
      {
        label: '作出抉擇',
        conditions: [],
        aiWeight: 1,
        effects: [{ op: 'setFlag', key: 'app.integration.chosen', value: 1 }],
      },
    ],
  };
}
function publish(game: GameState, def: EventDef | null): void {
  act(() => {
    setGame(game);
    initializeBridgeSession(game, [], def ? { eventEngine: createRuntimeEventEngine([def]) } : {});
    store.getState().actions.setSpeed('x2');
    store.getState().actions.requestPause('user');
  });
}

describe('real App pending event integration', () => {
  it('opens Taimei from the real App rail and applies confirmed consent only at the normal tick', async () => {
    const game = await startRealGame();
    act(() => {
      game.clans[game.meta.playerClanId]!.prestige = 1000;
      store.setState((state) => ({ tickSeq: state.tickSeq + 1 }));
      store.getState().actions.setSpeed('x2');
      store.getState().actions.requestPause('user');
    });
    fireEvent.click(screen.getByTestId('rail-taimei'));
    expect(screen.getByTestId('taimei-panel')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^外交攻勢/ }));
    const before = structuredClone(game);
    fireEvent.click(screen.getByRole('button', { name: t('ui.taimei.invoke') }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: t('ui.common.confirm') }));
    expect(getBridgeProgressMark()?.pendingCommands).toEqual([
      { type: 'invokeTaimei', clanId: game.meta.playerClanId, taimeiId: 'taimei.gaiko-kosei' },
    ]);
    expect(game).toEqual(before);
    expect(store.getState().session.speed).toBe('paused');
    expect(store.getState().session.lastPauseReason).toBe('user');
    let events: ReturnType<typeof runOneDay> = [];
    act(() => {
      events = runOneDay();
    });
    const def = getTaimeiDef('taimei.gaiko-kosei' as TaimeiId)!;
    expect(game.time.day).toBe(before.time.day + 1);
    expect(game.clans[game.meta.playerClanId]!.taimei.activeTaimeiId).toBe(def.id);
    expect(game.clans[game.meta.playerClanId]!.prestige).toBe(1000 - def.prestigeCost);
    expect(events.filter((event) => event.type === 'taimei.invoked')).toHaveLength(1);
    expect(getBridgeProgressMark()?.pendingCommands).toEqual([]);
    expect(validateState(game)).toEqual([]);
    expect(store.getState().session.speed).toBe('paused');
    expect(store.getState().session.lastPauseReason).toBe('user');
  });
  it('restores a saved pending choice through the actual App quick-load mount order without losing its owned modal', async () => {
    const game = await startRealGame();
    const saved = structuredClone(game);
    preparePending(saved);
    const blob = LZString.compressToUTF16(encodeSave(saved, 123));
    vi.spyOn(indexedDbSaveStorage, 'get').mockImplementation((key) =>
      Promise.resolve(key === 'tf.save.quick:1.blob' ? blob : undefined),
    );
    fireEvent.keyDown(window, { key: 'F9' });
    await waitFor(() => expect(screen.getByTestId('event-unavailable')).toBeTruthy());
    const restored = store.getState().game!;
    expect(restored).not.toBe(game);
    expect(restored.events.pendingChoiceEventId).toBe(saved.events.pendingChoiceEventId);
    expect(restored.events.pendingChoiceBinding).toEqual(saved.events.pendingChoiceBinding);
    const entries = getEventPresentationSnapshot();
    expect(entries).toMatchObject([
      { kind: 'pending', eventId: saved.events.pendingChoiceEventId },
    ]);
    expect(useUIStore.getState().modal?.params.presentationId).toBe(String(entries[0]!.id));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(restored.events.pendingChoiceEventId).not.toBeNull();
    expect(screen.getByTestId('event-unavailable')).toBeTruthy();
    expect(store.getState().session.speed).toBe('paused');
  });
  it('shows an actual generic harvest from a real Step3 firing, without inventing a pending choice', async () => {
    const game = await startRealGame();
    const harvest = zCanonicalEventsFile
      .parse(eventData)
      .events.find((def) => def.id === 'evt.gen-hosaku')!;
    // Certain occurrence in this fixture; all authored effects, targets and text remain intact.
    harvest.trigger.probability = 1;
    const day = calendarToDay(1560, 8, 30);
    game.time = { day, ...dayToCalendar(day) };
    act(() => {
      initializeBridgeSession(game, [], { eventEngine: createRuntimeEventEngine([harvest]) });
      store.getState().actions.requestPause('user');
      runOneDay();
    });
    expect(game.events.pendingChoiceEventId).toBeNull();
    expect(game.events.flags[`harvest.1560.${game.meta.playerClanId}`]).toBe(120);
    const before = structuredClone(game);
    expect(screen.getByRole('heading', { name: '五穀豐登' })).toBeTruthy();
    expect(screen.getByTestId('event-text').textContent).toContain(
      game.clans[game.meta.playerClanId]!.name,
    );
    fireEvent.click(screen.getByRole('button', { name: '繼續' }));
    expect(screen.queryByRole('heading', { name: '五穀豐登' })).toBeNull();
    expect(game).toEqual(before);
    expect(store.getState().session.speed).toBe('paused');
    expect(store.getState().session.lastPauseReason).toBe('user');
  });

  it('shows a mandatory event and applies exactly one canonical tick while preserving manual pause', async () => {
    const game = await startRealGame();
    const def = preparePending(game);
    publish(game, def);
    const watermark = screen.getByTestId('event-modal').querySelector('[data-kamon-shape="ring"]');
    expect(watermark?.getAttribute('width')).toBe('64');
    expect(watermark?.closest('[aria-hidden="true"]')).not.toBeNull();
    const day = game.time.day;
    const sequence = game.meta.lastAppliedCmdSeq;
    const session = structuredClone(store.getState().session);
    const button = screen.getByRole('button', { name: '作出抉擇' });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(game.events.pendingChoiceEventId).toBeNull());
    expect(screen.queryByRole('button', { name: '作出抉擇' })).toBeNull();
    expect(game.time.day).toBe(day + 1);
    expect(game.meta.lastAppliedCmdSeq).toBe(sequence + 1);
    expect(game.events.flags['app.integration.chosen']).toBe(1);
    expect(store.getState().session.speed).toBe(session.speed);
    expect(store.getState().session.resumeSpeed).toBe(session.resumeSpeed);
    expect(store.getState().session.lastPauseReason).toBe(session.lastPauseReason);
  });

  it('rebuilds actual saved district/castle/clan names after codec restoration and session reinitialization', async () => {
    const game = await startRealGame();
    const def = preparePending(game);
    const decoded = decodeSave(encodeSave(game, 123));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.code);
    const restored = decoded.saveFile.state;
    publish(restored, def);
    const binding = restored.events.pendingChoiceBinding!;
    const expected = `${restored.clans[binding.clanId!]!.name}／${restored.castles[binding.castleId!]!.name}／${restored.districts[binding.districtId!]!.name}`;
    expect(screen.getByRole('dialog').textContent).toContain(expected);
    expect(restored.events.pendingChoiceBinding).toEqual(game.events.pendingChoiceBinding);
    expect(restored.rng).toEqual(game.rng);
    expect(restored.time).toEqual(game.time);
  });

  it('keeps an unavailable engine mandatory and exports current progress without clearing or advancing state', async () => {
    const game = await startRealGame();
    preparePending(game);
    publish(game, null);
    const before = structuredClone(game);
    const createUrl = vi.fn(() => 'blob:event-backup');
    const revoke = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: createUrl, revokeObjectURL: revoke });
    const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    expect(screen.getByTestId('event-unavailable').textContent).toBe(
      t('ui.event.unavailableMessage'),
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: t('ui.save.exportCurrent') }));
    await waitFor(() => expect(download).toHaveBeenCalledOnce());
    expect(createUrl).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith('blob:event-backup');
    expect(screen.getByTestId('event-unavailable')).toBeTruthy();
    expect(game).toEqual(before);
  });
});
