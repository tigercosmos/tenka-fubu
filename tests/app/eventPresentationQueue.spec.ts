import { beforeEach, describe, expect, it, vi } from 'vitest';
import { initializeBridgeSession, resetBridgeForTests } from '../../src/app/bridge';
import { resetGameStoreForTests, store } from '../../src/app/store';
import { useUIStore } from '../../src/ui/hooks/uiStore';
import { createRuntimeEventEngine } from '../../src/core/systems/events/runtime';
import { buildTinyState } from '../fixtures/tiny';
import type { EventDef } from '../../src/core/systems/events/types';
import type { EventId } from '../../src/core/state/ids';
import {
  acknowledgeEventPresentation,
  getEventPresentationSnapshot,
  resetEventPresentations,
  subscribeEventPresentations,
  synchronizePendingEventPresentations,
} from '../../src/app/events/eventPresentationQueue';

beforeEach(() => {
  resetBridgeForTests();
  useUIStore.getState().actions.reset();
  resetGameStoreForTests(null);
});
function observedDef(): EventDef {
  return {
    id: 'evt.observed' as EventId,
    kind: 'generic',
    priority: 1,
    target: 'player',
    ownerCandidates: ['$clan'],
    trigger: {
      from: null,
      to: null,
      check: 'monthStart',
      hooks: [],
      conditions: [],
      probability: 1,
      once: true,
      cooldownDays: 0,
      cooldownKey: null,
    },
    cutscene: { title: '事件', body: '事件。', monClanId: '$clan' },
    choices: [],
    effects: [{ op: 'addGold', clanId: '$clan', amount: 7 }],
  };
}
function boot() {
  const state = buildTinyState(),
    engine = createRuntimeEventEngine([observedDef()]);
  resetGameStoreForTests(state);
  initializeBridgeSession(state, [], { eventEngine: engine });
  return { state, engine, fire: () => engine.run(state, () => undefined) };
}
describe('session-scoped informational event presentations', () => {
  it('captures a stable VM snapshot and synchronously owns the existing modal pause until acknowledged', () => {
    const { state, fire } = boot();
    store.getState().actions.setSpeed('x5');
    const notify = vi.fn(),
      dispose = subscribeEventPresentations(notify);
    fire();
    const items = getEventPresentationSnapshot();
    expect(items).toHaveLength(1);
    const first = items[0]!;
    expect(first.kind).toBe('resolved');
    if (first.kind !== 'resolved') throw new Error('Expected resolved presentation');
    expect(first.result.ok).toBe(true);
    expect(getEventPresentationSnapshot()).toBe(items);
    expect(store.getState().session.speed).toBe('paused');
    expect(useUIStore.getState().modal?.params.presentationId).toBe(String(items[0]!.id));
    state.clans[state.meta.playerClanId]!.name = 'Changed after firing';
    expect(getEventPresentationSnapshot()).toBe(items);
    acknowledgeEventPresentation(items[0]!.id);
    expect(getEventPresentationSnapshot()).toHaveLength(0);
    expect(store.getState().session.speed).toBe('x5');
    expect(notify).toHaveBeenCalledTimes(2);
    dispose();
  });
  it('preserves manual pause and another active modal/FIFO ownership', () => {
    const { fire } = boot();
    store.getState().actions.requestPause('user');
    fire();
    acknowledgeEventPresentation(getEventPresentationSnapshot()[0]!.id);
    expect(store.getState().session.speed).toBe('paused');
    const next = boot();
    store.getState().actions.setSpeed('x2');
    useUIStore.getState().actions.enqueueModal({ id: 'systemMenu', params: {}, pausesTime: true });
    next.fire();
    const id = getEventPresentationSnapshot()[0]!.id;
    acknowledgeEventPresentation(id);
    expect(getEventPresentationSnapshot()).toHaveLength(1);
    expect(useUIStore.getState().modal?.id).toBe('systemMenu');
    useUIStore.getState().actions.closeModal();
    acknowledgeEventPresentation(id);
    expect(store.getState().session.speed).toBe('x2');
  });
  it('resets only owned descriptors, unsubscribes the old engine, and rejects stale acknowledgment IDs', () => {
    const prior = boot();
    prior.fire();
    const oldId = getEventPresentationSnapshot()[0]!.id;
    useUIStore
      .getState()
      .actions.enqueueModal({ id: 'confirm', params: { owner: 'other' }, pausesTime: false });
    const next = boot();
    expect(getEventPresentationSnapshot()).toHaveLength(0);
    expect(useUIStore.getState().modal?.id).toBe('confirm');
    prior.state.events.fired = {};
    prior.fire();
    expect(getEventPresentationSnapshot()).toHaveLength(0);
    next.fire();
    acknowledgeEventPresentation(oldId);
    expect(getEventPresentationSnapshot()).toHaveLength(1);
  });
  it('clears ending descriptors without resuming time', () => {
    const next = boot();
    next.fire();
    next.state.meta.gameOver = { kind: 'defeat', endingId: 'no-heir' };
    resetEventPresentations(next.state);
    expect(getEventPresentationSnapshot()).toHaveLength(0);
    expect(useUIStore.getState().modal).toBeNull();
    expect(store.getState().session.speed).toBe('paused');
  });
  it('presents ownerless historical events and already AI-resolved choices, but never duplicates a pending choice', () => {
    const state = buildTinyState(),
      historical = observedDef();
    historical.kind = 'historical';
    historical.target = 'fixed';
    historical.ownerCandidates = [];
    historical.cutscene.monClanId = null;
    historical.effects = [];
    const engine = createRuntimeEventEngine([historical]);
    resetGameStoreForTests(state);
    initializeBridgeSession(state, [], { eventEngine: engine });
    engine.run(state, () => undefined);
    expect(getEventPresentationSnapshot()).toHaveLength(1);
    const aiState = buildTinyState();
    aiState.ai.allAi = true;
    const choice = observedDef();
    choice.choices = [
      {
        label: '選項',
        conditions: [],
        aiWeight: 1,
        effects: [{ op: 'addGold', clanId: '$clan', amount: 10 }],
      },
    ];
    const ai = createRuntimeEventEngine([choice]);
    resetGameStoreForTests(aiState);
    initializeBridgeSession(aiState, [], { eventEngine: ai });
    ai.run(aiState, () => undefined);
    const entry = getEventPresentationSnapshot()[0]!;
    if (entry.kind !== 'resolved') throw new Error('Expected resolved presentation');
    const result = entry.result;
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.vm.requiresChoice).toBe(false);
      expect(result.vm.choices).toHaveLength(0);
    }
    const player = buildTinyState(),
      pending = createRuntimeEventEngine([choice]);
    resetGameStoreForTests(player);
    initializeBridgeSession(player, [], { eventEngine: pending });
    pending.run(player, () => undefined);
    expect(player.events.pendingChoiceEventId).toBe(choice.id);
    expect(getEventPresentationSnapshot()).toMatchObject([{ kind: 'pending', eventId: choice.id }]);
  });
  it('restores one mandatory identity and removes cleared inactive descriptors without touching other owners', () => {
    const { state } = boot();
    useUIStore.getState().actions.enqueueModal({ id: 'systemMenu', params: {}, pausesTime: true });
    state.events.pendingChoiceEventId = 'evt.restored' as EventId;
    synchronizePendingEventPresentations(state);
    synchronizePendingEventPresentations(state);
    expect(getEventPresentationSnapshot()).toHaveLength(1);
    const id = getEventPresentationSnapshot()[0]!.id;
    acknowledgeEventPresentation(id);
    expect(getEventPresentationSnapshot()).toHaveLength(1);
    expect(useUIStore.getState().modal?.id).toBe('systemMenu');
    state.events.pendingChoiceEventId = null;
    synchronizePendingEventPresentations(state);
    expect(getEventPresentationSnapshot()).toHaveLength(0);
    expect(useUIStore.getState().modalQueue).toHaveLength(0);
    expect(useUIStore.getState().modal?.id).toBe('systemMenu');
  });
});
