import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const pixi = vi.hoisted(() => ({ apps: [] as { destroyed: boolean }[] }));
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
  return createPixiMockClasses(pixi.apps);
});

import { App } from '../../src/app/App';
import * as providers from '../../src/app/events/scenarioEventEngine';
import { getSessionEventEngine, resetBridgeForTests, runOneDay } from '../../src/app/bridge';
import { resetGameStoreForTests, setGame, store } from '../../src/app/store';
import { indexedDbSaveStorage } from '../../src/app/persistence/storage';
import { settingsStore } from '../../src/app/settings/runtime';
import { SettingsSchema } from '../../src/app/settings';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { createRuntimeEventEngine } from '../../src/core/systems/events/runtime';
import type { EventEngine } from '../../src/core/systems/events/engine';
import { calendarToDay, dayToCalendar } from '../../src/core/systems/time';
import { encodeSave } from '../../src/core/save/serialize';
import { t } from '../../src/i18n/zh-TW';
import catalog from '../../src/data/scenarios/s1560/events.json';
import { buildTinyState } from '../fixtures/tiny';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
  settingsStore.setState({ settings: SettingsSchema.parse({ effectsEnabled: false }) });
  vi.spyOn(indexedDbSaveStorage, 'get').mockResolvedValue(undefined);
  vi.spyOn(indexedDbSaveStorage, 'keys').mockResolvedValue([]);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});
afterEach(() => {
  cleanup();
  resetBridgeForTests();
  vi.restoreAllMocks();
  settingsStore.setState({ settings: SettingsSchema.parse({}) });
});

async function chooseOda() {
  fireEvent.click(screen.getByTestId('title-newgame'));
  await waitFor(() =>
    expect(screen.getByTestId('scenario-pick-s1560')).toHaveProperty('disabled', false),
  );
  fireEvent.click(screen.getByTestId('scenario-pick-s1560'));
  fireEvent.click(screen.getByTestId('clan-pick-clan.oda'));
  fireEvent.click(screen.getByTestId('daimyo-next'));
  fireEvent.click(screen.getByTestId('difficulty-next'));
  fireEvent.click(screen.getByTestId('newgame-start'));
}

describe('production event session acquisition', () => {
  it('fails visibly without publishing a game when its catalog cannot be prepared', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(providers, 'loadScenarioEventEngine').mockRejectedValueOnce(
      new Error('catalog unavailable'),
    );
    render(<App />);
    await chooseOda();
    await waitFor(() =>
      expect(store.getState().session.fatalError?.message).toBe('catalog unavailable'),
    );
    expect(store.getState().game).toBeNull();
    expect(getSessionEventEngine()).toBeNull();
  });
  it('publishes the real wizard only after its complete canonical catalog is available', async () => {
    const actual = await providers.loadScenarioEventEngine('s1560');
    const gate = deferred<EventEngine>();
    vi.spyOn(providers, 'loadScenarioEventEngine').mockReturnValueOnce(gate.promise);
    render(<App />);
    await chooseOda();
    expect(store.getState().game).toBeNull();
    expect(screen.queryByTestId('screen-strategy')).toBeNull();
    await act(async () => {
      gate.resolve(actual);
      await gate.promise;
    });
    await waitFor(() => expect(screen.getByTestId('screen-strategy')).toBeTruthy());
    expect(getSessionEventEngine()).toBe(actual);
    for (const def of catalog.events) expect(actual.getDef(def.id as never)?.id).toBe(def.id);
    expect(catalog.events).toHaveLength(21);
  });

  it('does not publish a late provider after leaving the wizard, even after returning to it', async () => {
    const gate = deferred<EventEngine>();
    vi.spyOn(providers, 'loadScenarioEventEngine').mockReturnValueOnce(gate.promise);
    render(<App />);
    await chooseOda();
    fireEvent.click(screen.getByTestId('seed-back'));
    fireEvent.click(screen.getByTestId('difficulty-back'));
    fireEvent.click(screen.getByTestId('daimyo-back'));
    await waitFor(() =>
      expect(screen.getByTestId('scenario-pick-s1560')).toHaveProperty('disabled', false),
    );
    fireEvent.click(screen.getByTestId('scenario-pick-s1560'));
    await act(async () => {
      gate.resolve(createRuntimeEventEngine([]));
      await gate.promise;
    });
    expect(store.getState().game).toBeNull();
    expect(screen.getByTestId('screen-daimyo-select')).toBeTruthy();
    expect(getSessionEventEngine()).toBeNull();
  });

  it('does not publish a late provider after external session replacement', async () => {
    const gate = deferred<EventEngine>();
    vi.spyOn(providers, 'loadScenarioEventEngine').mockReturnValueOnce(gate.promise);
    render(<App />);
    await chooseOda();
    // A new identity is an independent cancellation fence, even without an App navigation.
    const replacement = buildTinyState();
    act(() => setGame(replacement));
    await act(async () => {
      gate.resolve(createRuntimeEventEngine([]));
      await gate.promise;
    });
    expect(store.getState().game).toBe(replacement);
    expect(getSessionEventEngine()).toBeNull();
  });

  it('does not publish a provider that completes after App unmount', async () => {
    const gate = deferred<EventEngine>();
    vi.spyOn(providers, 'loadScenarioEventEngine').mockReturnValueOnce(gate.promise);
    const rendered = render(<App />);
    await chooseOda();
    rendered.unmount();
    await act(async () => {
      gate.resolve(createRuntimeEventEngine([]));
      await gate.promise;
    });
    expect(store.getState().game).toBeNull();
    expect(getSessionEventEngine()).toBeNull();
  });

  it('restores a naturally triggered historical pending choice with a fresh catalog before publication', async () => {
    const rendered = render(<App />);
    await chooseOda();
    await waitFor(() => expect(screen.getByTestId('screen-strategy')).toBeTruthy());
    const game = store.getState().game!;
    const originalEngine = getSessionEventEngine();
    // Controlled calendar prerequisite, not a fabricated event or effect: production Step3 fires it.
    const day = calendarToDay(1560, 4, 30);
    Object.assign(game.time, dayToCalendar(day), { day });
    act(() => {
      runOneDay();
    });
    expect(game.events.pendingChoiceEventId).toBe('evt.okehazama');
    expect(screen.getByRole('dialog').textContent).toContain('桶狹間');
    const binding = structuredClone(game.events.pendingChoiceBinding);
    const raw = encodeSave(game, 123);
    // A fresh app boot imports the actual saved pending binding through the public save UI.
    rendered.unmount();
    resetBridgeForTests();
    resetGameStoreForTests(null);
    uiStore.getState().actions.reset();
    render(<App />);
    fireEvent.click(screen.getByTestId('title-save-list'));
    await waitFor(() =>
      expect(screen.getByTestId('save-load-panel').getAttribute('aria-busy')).toBe('false'),
    );
    fireEvent.change(screen.getByTestId('save-import-file'), {
      target: { files: [{ size: raw.length, text: () => Promise.resolve(raw) }] },
    });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: t('ui.save.importLoad') })).toHaveProperty(
        'disabled',
        false,
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: t('ui.save.importLoad') }));
    fireEvent.click(screen.getByRole('button', { name: t('ui.common.confirm') }));
    await waitFor(() => expect(store.getState().game).not.toBeNull());
    expect(store.getState().game).not.toBe(game);
    expect(getSessionEventEngine()).not.toBe(originalEngine);
    expect(getSessionEventEngine()?.getDef('evt.okehazama' as never)).toBeDefined();
    expect(store.getState().game!.events.pendingChoiceBinding).toEqual(binding);
    expect(screen.getByRole('dialog').textContent).toContain('桶狹間');
    const restored = store.getState().game!;
    const restoredDay = restored.time.day;
    const firstChoice = catalog.events.find((event) => event.id === 'evt.okehazama')!.choices[0]!;
    fireEvent.click(screen.getByRole('button', { name: firstChoice.label }));
    await waitFor(() => expect(restored.events.pendingChoiceEventId).toBeNull());
    expect(restored.events.flags['okehazama-win']).toBe(1);
    expect(restored.officers['off.imagawa-yoshimoto' as never]?.status).toBe('dead');
    expect(restored.time.day).toBe(restoredDay + 1);
    expect(store.getState().session.speed).toBe('paused');
  }, 20_000);
});
