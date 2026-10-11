import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { store, resetGameStoreForTests } from '@app/store';
import { initializeBridgeSession, getBridgeProgressMark, resetBridgeForTests } from '@app/bridge';
import { uiStore } from '../hooks/uiStore';
import { buildTinyState } from '../../../tests/fixtures/tiny';
import BattleLayoutGallery from './BattleLayoutGallery';
import { createBattleLayoutFixture } from './battleLayoutFixture';

vi.mock('../battle/BattleRenderer', () => ({
  BattleRenderer: class {
    async init(): Promise<void> {}
    update(): void {}
    destroy(): void {}
  },
}));
vi.mock('../map/mapFontReady', () => ({ waitForMapFont: async () => {} }));
afterEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(null);
  vi.restoreAllMocks();
});
describe('DEV tactical presentation gallery', () => {
  it('uses deterministic detached fixtures with eight or twelve units and real crossing progress', () => {
    for (const kind of ['dense8', 'full12', 'crossing8'] as const) {
      const first = createBattleLayoutFixture(kind),
        second = createBattleLayoutFixture(kind);
      expect(first).toEqual(second);
      expect(first).not.toBe(second);
      expect(first.units).toHaveLength(kind === 'full12' ? 12 : 8);
      if (kind === 'crossing8')
        expect(
          first.units.every((unit) => unit.moveProgress === 1 && unit.moveTargetJinId !== null),
        ).toBe(true);
    }
  });
  it('keeps game, RNG, progress and global UI scale unchanged while all fixture actions stay local', async () => {
    const game = buildTinyState();
    resetGameStoreForTests(game);
    initializeBridgeSession(game);
    const beforeGame = structuredClone(game),
      beforeMark = getBridgeProgressMark();
    const scale = uiStore.getState().uiScale;
    render(<BattleLayoutGallery />);
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByTestId('battle-layout-full12'));
    fireEvent.click(screen.getByTestId('battle-layout-scale-1.5'));
    fireEvent.click(screen.getByTestId('battle-layout-size-large'));
    fireEvent.click(screen.getByTestId('battle-unit-bu.layout-03'));
    expect(screen.getByTestId('battle-layout-selected').textContent).toBe('bu.layout-03');
    expect(screen.getByTestId('battle-layout-action').dataset.kind).toBe('select');
    fireEvent.click(screen.getByTestId('battle-unit-bu.layout-02'));
    expect(screen.getByTestId('battle-layout-action').dataset.id).toBe('bu.layout-02');
    expect(screen.getByTestId('battle-layout-action').dataset.kind).toBe('enemy');
    fireEvent.click(screen.getByTestId('battle-jin-jin.2-0'));
    expect(screen.getByTestId('battle-layout-action').dataset.kind).toBe('node');
    expect(store.getState().game).toBe(game);
    expect(game).toEqual(beforeGame);
    expect(getBridgeProgressMark()).toEqual(beforeMark);
    expect(uiStore.getState().uiScale).toBe(scale);
  });
});
