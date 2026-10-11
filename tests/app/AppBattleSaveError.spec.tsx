import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  return createPixiMockClasses([]);
});
import { App } from '../../src/app/App';
import { resetBridgeForTests } from '../../src/app/bridge';
import { bumpTickSeq, resetGameStoreForTests, store } from '../../src/app/store';
import {
  clearAllBattleOrders,
  dispatchBattleOrder,
  snapshotPendingBattleOrders,
} from '../../src/app/battleBridge';
import { indexedDbSaveStorage } from '../../src/app/persistence/storage';
import { settingsStore } from '../../src/app/settings/runtime';
import { SettingsSchema } from '../../src/app/settings';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { buildBattleTranscriptInitialState, MINI_DUEL_LAYOUT_ID } from '../golden/battleTranscript';
import { validateState } from '../../src/core/state/invariants';
import { t } from '../../src/i18n/zh-TW';

beforeEach(() => {
  resetBridgeForTests();
  clearAllBattleOrders();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
  settingsStore.setState({ settings: SettingsSchema.parse({ effectsEnabled: false }) });
  vi.spyOn(indexedDbSaveStorage, 'get').mockResolvedValue(undefined);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});
afterEach(() => {
  cleanup();
  resetBridgeForTests();
  clearAllBattleOrders();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
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
  fireEvent.click(screen.getByTestId('newgame-start'));
  await waitFor(() => expect(screen.getByTestId('screen-strategy')).toBeTruthy());
}
describe('App save error export boundary', () => {
  it('retains current-state export for a failed strategy quicksave', async () => {
    vi.spyOn(indexedDbSaveStorage, 'setMany').mockRejectedValue(
      new DOMException('quota', 'QuotaExceededError'),
    );
    await enterMain();
    fireEvent.keyDown(document.body, { key: 's', ctrlKey: true });
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(t('error.save.quotaExceeded')),
    );
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: t('ui.save.exportCurrent') }).disabled,
    ).toBe(false);
    expect(screen.queryByText(t('ui.save.battleUnavailable'))).toBeNull();
  });
  it('async strategy save failure arriving in the same battle session cannot export unsaved tactical orders', async () => {
    let failWrite: ((reason: unknown) => void) | undefined;
    const write = vi.spyOn(indexedDbSaveStorage, 'setMany').mockImplementation(
      () =>
        new Promise<void>((_resolve, reject) => {
          failWrite = reject;
        }),
    );
    await enterMain();
    const session = store.getState().game!;
    fireEvent.keyDown(document.body, { key: 's', ctrlKey: true });
    await waitFor(() => expect(write).toHaveBeenCalledOnce());
    // Controlled invariant-valid combat fixture, preserving the live session identity.
    // This exercises real App/save routing, not the strategy combat-generation algorithm.
    const { state } = buildBattleTranscriptInitialState(42, MINI_DUEL_LAYOUT_ID);
    act(() => {
      Object.assign(session, state);
      bumpTickSeq();
    });
    expect(validateState(session)).toEqual([]);
    await waitFor(() => expect(screen.getByTestId('screen-battle')).toBeTruthy());
    const battle = Object.values(session.battles)[0]!;
    act(() => {
      expect(
        dispatchBattleOrder(battle.id, {
          kind: 'toggleDelegate',
          unitId: battle.units[0]!.id,
          enabled: true,
        }),
      ).toEqual({ ok: true });
    });
    expect(snapshotPendingBattleOrders()).toHaveLength(1);
    const before = structuredClone(session);
    if (failWrite === undefined) throw new Error('Save did not reach the asynchronous adapter');
    await act(async () => {
      failWrite!(new DOMException('quota', 'QuotaExceededError'));
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(screen.getByRole('alert').textContent).toBe(t('error.save.quotaExceeded')),
    );
    expect(screen.getByText(t('ui.save.battleUnavailable'))).toBeTruthy();
    expect(screen.queryByRole('button', { name: t('ui.save.exportCurrent') })).toBeNull();
    expect(store.getState().session.screen).toBe('battle');
    expect(store.getState().game).toBe(session);
    expect(session).toEqual(before);
    expect(snapshotPendingBattleOrders()[0]!.orders).toHaveLength(1);
  });
});
