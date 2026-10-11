import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Synthetic tiny campaign, not a production national journey. Only map presentation is stubbed.
vi.mock('../../src/ui/screens/MainScreen', () => ({
  MainScreen: () => <main data-testid="screen-strategy" />,
}));

import { App } from '../../src/app/App';
import {
  dispatchCommand,
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
} from '../../src/app/bridge';
import { resetGameStoreForTests, store } from '../../src/app/store';
import { settingsStore } from '../../src/app/settings/runtime';
import { SettingsSchema } from '../../src/app/settings';
import { indexedDbSaveStorage } from '../../src/app/persistence/storage';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { createRuntimeEventEngine } from '../../src/core/systems/events/runtime';
import { validateState } from '../../src/core/state/invariants';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { stateHash } from '../../src/core/state/serialize';
import type { GameEvent } from '../../src/core/state/events';
import {
  buildTinyState,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_TAISHO,
} from '../fixtures/tiny';

beforeEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
  settingsStore.setState({ settings: SettingsSchema.parse({}) });
  vi.spyOn(indexedDbSaveStorage, 'get').mockResolvedValue(undefined);
});
afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
  settingsStore.setState({ settings: SettingsSchema.parse({}) });
  vi.restoreAllMocks();
});

describe('App command-driven synthetic tiny campaign ending', () => {
  it.each(['continue', 'title'] as const)(
    'captures the last enemy castle through real ticks and handles %s without a phantom day',
    async (action) => {
      const game = buildTinyState();
      // Declared initial campaign conditions only; never write ownership or gameOver.
      game.castles[CASTLE_A2]!.soldiers = 2000;
      game.castles[CASTLE_A2]!.food = 20000;
      game.castles[CASTLE_B1]!.soldiers = 20;
      game.castles[CASTLE_B1]!.durability = 10;
      expect(validateState(game)).toEqual([]);
      resetGameStoreForTests(game);
      store.getState().actions.setScreen('main');
      initializeBridgeSession(game, [], { eventEngine: createRuntimeEventEngine([]) });
      render(<App />);
      const command = {
        type: 'march' as const,
        clanId: CLAN_ALPHA,
        originCastleId: CASTLE_A2,
        leaderId: OFF_ALPHA_TAISHO,
        deputyIds: [],
        soldiers: 1800,
        food: 3000,
        targetNodeId: CASTLE_B1,
      };
      const before = stateHash(game);
      act(() => {
        expect(dispatchCommand(command)).toEqual({ ok: true });
      });
      expect(stateHash(game)).toBe(before);
      const events: GameEvent[] = [];
      for (let day = 0; day < 90 && game.meta.gameOver === null; day++) {
        act(() => {
          events.push(...runOneDay());
        });
        expect(events.filter((event) => event.type === 'command.rejected')).toEqual([]);
        expect(validateState(game)).toEqual([]);
      }
      expect(events.some((event) => event.type === 'siege.started')).toBe(true);
      expect(game.castles[CASTLE_B1]!.ownerClanId).toBe(CLAN_ALPHA);
      expect(game.clans[CLAN_BETA]!.alive).toBe(false);
      expect(game.meta.gameOver).toEqual({ kind: 'victory', endingId: 'unification' });
      expect(events.filter((event) => event.type === 'game.victory')).toHaveLength(1);
      await waitFor(() => expect(screen.getByTestId('screen-ending')).toBeTruthy());
      expect(store.getState().session.speed).toBe('paused');
      const decoded = decodeSave(encodeSave(game, 123));
      expect(decoded.ok).toBe(true);
      if (!decoded.ok) throw new Error('Actual campaign ending failed native codec');
      expect(decoded.saveFile.state.meta.gameOver).toEqual(game.meta.gameOver);
      expect(validateState(decoded.saveFile.state)).toEqual([]);
      const day = game.time.day,
        rng = structuredClone(game.rng);
      const ended = stateHash(game);
      act(() => {
        expect(dispatchCommand(command).ok).toBe(false);
      });
      expect(stateHash(game)).toBe(ended);
      expect(store.getState().session.pendingCommandCount).toBe(0);
      if (action === 'title') {
        fireEvent.click(screen.getByTestId('ending-title'));
        await waitFor(() => expect(screen.getByTestId('screen-title')).toBeTruthy());
        expect(store.getState().game).toBeNull();
        expect(store.getState().session.speed).toBe('paused');
        expect(uiStore.getState().modal).toBeNull();
        expect(uiStore.getState().modalQueue).toEqual([]);
        expect(game.time.day).toBe(day);
        expect(game.rng).toEqual(rng);
        expect(() => runOneDay()).toThrow('runOneDay: game 尚未初始化');
        return;
      }
      fireEvent.click(screen.getByTestId('ending-continue'));
      await waitFor(() => expect(screen.getByTestId('screen-strategy')).toBeTruthy());
      expect(game.meta.gameOver).toBeNull();
      expect(game.events.flags['victory.ack.unification']).toBe(1);
      expect(game.time.day).toBe(day);
      expect(game.rng).toEqual(rng);
      act(() => {
        expect(runOneDay().filter((event) => event.type === 'game.victory')).toEqual([]);
      });
      expect(validateState(game)).toEqual([]);
    },
  );
});
