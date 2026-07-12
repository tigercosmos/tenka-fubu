import { beforeEach, describe, expect, it } from 'vitest';
import { resetGameStoreForTests, store as gameStore } from '@app/store';
import { uiStore } from './uiStore';

describe('UI navigation store', () => {
  beforeEach(() => {
    resetGameStoreForTests();
    uiStore.getState().actions.reset();
  });

  it('deduplicates panels, moves them to the top, and caps the stack at three', () => {
    const a = uiStore.getState().actions;
    a.openPanel('castle', { castleId: 'castle.a' });
    a.openPanel('officers');
    a.openPanel('district');
    a.openPanel('policy');
    a.openPanel('officers', { tab: 'all' });
    expect(uiStore.getState().panelStack).toEqual([
      { id: 'district', params: {} },
      { id: 'policy', params: {} },
      { id: 'officers', params: { tab: 'all' } },
    ]);
  });

  it('pumps modals FIFO and restores speed only after the queue drains', () => {
    gameStore.getState().actions.setSpeed('x5');
    const a = uiStore.getState().actions;
    a.enqueueModal({ id: 'event', params: {}, pausesTime: true });
    a.enqueueModal({ id: 'systemMenu', params: {}, pausesTime: false });
    expect(gameStore.getState().session.speed).toBe('paused');
    a.closeModal();
    expect(uiStore.getState().modal?.id).toBe('systemMenu');
    expect(gameStore.getState().session.speed).toBe('paused');
    a.closeModal();
    expect(gameStore.getState().session.speed).toBe('x5');
  });

  it('does not resume a game that was already paused before a modal opened', () => {
    const a = uiStore.getState().actions;
    a.enqueueModal({ id: 'event', params: {}, pausesTime: true });
    a.closeModal();
    expect(gameStore.getState().session.speed).toBe('paused');
  });

  it('applies the canonical ESC priority and cannot dismiss forced modals', () => {
    const a = uiStore.getState().actions;
    a.setSelection({ kind: 'castle', id: 'castle.a' });
    a.openPanel('castle');
    a.enqueueModal({ id: 'event', params: {}, pausesTime: true });
    a.onEsc();
    expect(uiStore.getState().modal?.id).toBe('event');
    a.closeModal();
    a.onEsc();
    expect(uiStore.getState().panelStack).toHaveLength(0);
    a.onEsc();
    expect(uiStore.getState().selection).toBeNull();
    a.onEsc();
    expect(uiStore.getState().modal?.id).toBe('systemMenu');
  });
});
