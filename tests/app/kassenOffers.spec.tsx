import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  initializeBridgeSession,
  getQueuedPlayerCommands,
  runOneDay,
  exportCommandLog,
} from '@app/bridge';
import { resetGameStoreForTests, store, setGame, bumpTickSeq } from '@app/store';
import { settingsStore } from '@app/settings/runtime';
import { applyMarch } from '@core/commands/march';
import { startFieldCombat } from '@core/systems/fieldCombat';
import {
  buildTinyState,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_TAISHO,
  OFF_BETA_TAISHO,
  OFF_ALPHA_BUSHO,
  OFF_BETA_BUSHO,
} from '../fixtures/tiny';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { useKassenOffers } from '../../src/ui/hooks/useKassenOffers';

function setupCombat() {
  const game = buildTinyState();
  for (const [clanId, castle, leader, target] of [
    [CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, CASTLE_B1],
    [CLAN_BETA, CASTLE_B1, OFF_BETA_TAISHO, CASTLE_A2],
  ] as const) {
    game.castles[castle]!.soldiers = 3000;
    applyMarch(
      game,
      {
        type: 'march',
        clanId,
        originCastleId: castle,
        leaderId: leader,
        deputyIds: [],
        soldiers: 2000,
        food: 1000,
        targetNodeId: target,
      },
      () => {},
    );
  }
  const [alpha, beta] = Object.values(game.armies);
  for (const army of [alpha!, beta!]) {
    army.posNodeId = CASTLE_A2;
    army.path = [CASTLE_A2];
    army.pathCursor = army.edgeProgressDays = army.edgeCostDays = 0;
    army.status = 'holding';
  }
  const events = startFieldCombat(game, CASTLE_A2, [alpha!.id], [beta!.id]);
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  uiStore.getState().actions.setScreen('main');
  store.getState().actions.setScreen('main');
  return { game, id: Object.keys(game.fieldCombats)[0]!, alpha: alpha!.id, beta: beta!.id, events };
}

beforeEach(() => {
  resetGameStoreForTests();
  uiStore.getState().actions.reset();
  settingsStore.getState().updateSettings({ autoPause: { battle: true } });
});
afterEach(() => {
  cleanup();
  settingsStore.getState().resetSettings();
});

describe('canonical strategic kassen offers through the app bridge', () => {
  it('uses real fc identity, queues after existing owner, and leaves state/RNG untouched', () => {
    const { game, id, events } = setupCombat();
    const before = JSON.stringify(game);
    expect(events.find((event) => event.type === 'battle.kassenAvailable')).toMatchObject({
      battleId: id,
    });
    uiStore
      .getState()
      .actions.enqueueModal({ id: 'event', params: { eventId: 'existing' }, pausesTime: true });
    const hook = renderHook(useKassenOffers);
    expect(hook.result.current.activeOffer).toBeNull();
    expect(uiStore.getState().modal?.id).toBe('event');
    expect(uiStore.getState().modalQueue).toHaveLength(1);
    expect(uiStore.getState().modalQueue[0]?.params.fieldCombatId).toBe(id);
    expect(JSON.stringify(game)).toBe(before);
    act(() => uiStore.getState().actions.closeModal());
    expect(hook.result.current.activeOffer?.fieldCombatId).toBe(id);
  });

  it('decline/escape retain manual encounter without an automatic reopen or command', () => {
    const { game, id, alpha, beta } = setupCombat();
    const before = JSON.stringify(game);
    const hook = renderHook(useKassenOffers);
    act(() => uiStore.getState().actions.onEsc());
    act(() => bumpTickSeq());
    expect(hook.result.current.activeOffer).toBeNull();
    expect(hook.result.current.manualEntry(alpha)?.fieldCombatId).toBe(id);
    expect(hook.result.current.manualEntry(beta)).toBeNull();
    expect(hook.result.current.manualEntry('army.missing')).toBeNull();
    act(() => {
      expect(hook.result.current.openOffer(id)).toBe(true);
    });
    act(() => hook.result.current.declineOffer(id));
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    expect(JSON.stringify(game)).toBe(before);
  });

  it('disabled battle preference suppresses automatic prompt, not validated manual entry', () => {
    const { game, id, alpha } = setupCombat();
    settingsStore.getState().updateSettings({ autoPause: { battle: false } });
    store.getState().actions.setSpeed('x2');
    const hook = renderHook(useKassenOffers);
    expect(uiStore.getState().modal).toBeNull();
    expect(store.getState().session.speed).toBe('x2');
    expect(hook.result.current.manualEntry(alpha)?.fieldCombatId).toBe(id);
    const before = JSON.stringify(game);
    act(() => {
      expect(hook.result.current.openOffer(id)).toBe(true);
    });
    expect(store.getState().session.speed).toBe('paused');
    act(() => hook.result.current.declineOffer(id));
    expect(store.getState().session.speed).toBe('x2');
    expect(JSON.stringify(game)).toBe(before);
  });

  it('acceptance queues once, never creates a tactical battle before the actual next tick', () => {
    const { game, id, alpha } = setupCombat();
    const hook = renderHook(useKassenOffers);
    const before = JSON.stringify(game);
    act(() => {
      expect(hook.result.current.acceptOffer(id)).toEqual({ ok: true });
    });
    expect(JSON.stringify(game)).toBe(before);
    expect(Object.keys(game.battles)).toHaveLength(0);
    expect(getQueuedPlayerCommands(game)).toEqual([
      { type: 'startKassen', clanId: CLAN_ALPHA, fieldCombatId: id },
    ]);
    expect(hook.result.current.manualEntry(alpha)?.queued).toBe(true);
    act(() => {
      expect(hook.result.current.openOffer(id)).toBe(false);
    });
    act(() => {
      expect(hook.result.current.acceptOffer(id).ok).toBe(false);
    });
    expect(getQueuedPlayerCommands(game)).toHaveLength(1);
    act(() => {
      runOneDay();
    });
    expect(Object.keys(game.battles)).toHaveLength(1);
    expect(game.fieldCombats[id]?.kassenUsed).toBe(true);
    expect(
      exportCommandLog().entries.filter((entry) => entry.command.type === 'startKassen'),
    ).toHaveLength(1);
  });

  it('reserves the single tactical slot across two different eligible field encounters', () => {
    const { game, id } = setupCombat();
    const originalIds = new Set(Object.keys(game.armies));
    for (const [clanId, castle, leader, target] of [
      [CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_BUSHO, CASTLE_B1],
      [CLAN_BETA, CASTLE_B1, OFF_BETA_BUSHO, CASTLE_A2],
    ] as const) {
      game.castles[castle]!.soldiers = 3000;
      applyMarch(
        game,
        {
          type: 'march',
          clanId,
          originCastleId: castle,
          leaderId: leader,
          deputyIds: [],
          soldiers: 2000,
          food: 1000,
          targetNodeId: target,
        },
        () => {},
      );
    }
    const secondArmies = Object.values(game.armies).filter((army) => !originalIds.has(army.id));
    for (const army of secondArmies) {
      army.posNodeId = CASTLE_B1;
      army.path = [CASTLE_B1];
      army.pathCursor = army.edgeProgressDays = army.edgeCostDays = 0;
      army.status = 'holding';
    }
    startFieldCombat(game, CASTLE_B1, [secondArmies[0]!.id], [secondArmies[1]!.id]);
    const secondId = Object.keys(game.fieldCombats).find((candidate) => candidate !== id)!;
    initializeBridgeSession(game);
    const hook = renderHook(useKassenOffers);
    expect(uiStore.getState().modalQueue).toHaveLength(1);
    const activeId = hook.result.current.activeOffer!.fieldCombatId;
    const otherId = activeId === id ? secondId : id;
    const before = JSON.stringify(game);
    act(() => {
      expect(hook.result.current.acceptOffer(activeId)).toEqual({ ok: true });
    });
    expect(uiStore.getState().modal).toBeNull();
    expect(uiStore.getState().modalQueue).toEqual([]);
    act(() => {
      expect(hook.result.current.openOffer(otherId)).toBe(false);
      expect(hook.result.current.acceptOffer(otherId).ok).toBe(false);
    });
    expect(hook.result.current.manualEntry(secondArmies[0]!.id)?.queued).toBe(true);
    expect(getQueuedPlayerCommands(game)).toHaveLength(1);
    expect(JSON.stringify(game)).toBe(before);
    act(() => {
      runOneDay();
    });
    expect(Object.keys(game.battles)).toHaveLength(1);
    expect(
      exportCommandLog().entries.filter((entry) => entry.command.type === 'startKassen'),
    ).toHaveLength(1);
  });

  it('revalidates actual eligibility and removes only its stale FIFO descriptor', () => {
    const { game, id } = setupCombat();
    uiStore.getState().actions.enqueueModal({ id: 'event', params: {}, pausesTime: true });
    const hook = renderHook(useKassenOffers);
    uiStore
      .getState()
      .actions.enqueueModal({ id: 'confirm', params: { owner: 'unrelated' }, pausesTime: true });
    act(() => {
      game.fieldCombats[id]!.interrupted = true;
      bumpTickSeq();
    });
    expect(uiStore.getState().modal?.id).toBe('event');
    expect(uiStore.getState().modalQueue.map((item) => item.id)).toEqual(['confirm']);
    expect(hook.result.current.openOffer(id)).toBe(false);
    expect(hook.result.current.acceptOffer(id).ok).toBe(false);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
  });

  it('old-session callbacks cannot queue, close a replacement owner, or resume the new game', () => {
    const { game, id } = setupCombat();
    const hook = renderHook(useKassenOffers);
    const previous = hook.result.current;
    const replacement = buildTinyState();
    act(() => {
      setGame(replacement);
      initializeBridgeSession(replacement);
    });
    expect(hook.result.current.activeOffer).toBeNull();
    expect(uiStore.getState().modal).toBeNull();
    expect(store.getState().session.speed).toBe('paused');
    act(() => {
      uiStore.getState().actions.enqueueModal({ id: 'confirm', params: {}, pausesTime: false });
    });
    act(() => {
      expect(previous.acceptOffer(id).ok).toBe(false);
      expect(previous.openOffer(id)).toBe(false);
      previous.declineOffer(id);
    });
    expect(uiStore.getState().modal?.id).toBe('confirm');
    expect(getQueuedPlayerCommands(replacement)).toEqual([]);
    expect(game.battles).toEqual({});
  });
});
