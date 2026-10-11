import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { resetBridgeForTests, initializeBridgeSession } from '@app/bridge';
import { resetGameStoreForTests } from '@app/store';
import { FACILITY_DEFS } from '@core/facilities';
import { buildTinyState, CASTLE_A1 } from '../../../../tests/fixtures/tiny';
import { uiStore } from '../../hooks/uiStore';
import { CastlePanel } from './CastlePanel';

beforeEach(() => {
  resetBridgeForTests();
  uiStore.getState().actions.reset();
});

it.each(['build', 'removal'] as const)(
  'old %s cleanup cannot close an owner replaced during synchronous publication',
  (kind) => {
    const game = buildTinyState();
    game.clans[game.meta.playerClanId]!.gold = 2000;
    if (kind === 'removal')
      game.castles[CASTLE_A1]!.facilities = [
        FACILITY_DEFS.find((def) => def.id === 'fac.ichi')!.id,
      ];
    resetGameStoreForTests(game);
    initializeBridgeSession(game);
    render(<CastlePanel castleId={CASTLE_A1} initialTab="domestic" />);
    if (kind === 'removal') fireEvent.click(screen.getByRole('button', { name: '拆除 市' }));
    else {
      fireEvent.click(screen.getAllByRole('button', { name: /空位/ })[0]!);
      fireEvent.click(screen.getByRole('button', { name: /市.*200貫.*60日/ }));
    }
    const owner = uiStore.getState().modal!;
    let replaced = false;
    const unsubscribe = uiStore.subscribe((next) => {
      if (replaced || next.modal !== owner) return;
      // The cleanup publishes its filtered queue before closing. Replace the old
      // owner synchronously, as another queued UI owner may do during publication.
      replaced = true;
      next.actions.closeModal();
      uiStore.getState().actions.enqueueModal({
        id: 'systemMenu',
        params: { owner: 'replacement' },
        pausesTime: false,
      });
    });
    try {
      fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: '取消' }));
      expect(replaced).toBe(true);
      expect(uiStore.getState().modal).toMatchObject({
        id: 'systemMenu',
        params: { owner: 'replacement' },
      });
    } finally {
      unsubscribe();
    }
  },
);
