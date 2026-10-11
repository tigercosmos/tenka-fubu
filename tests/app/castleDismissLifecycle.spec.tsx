import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Dialog } from '../../src/ui/components';
import { CastleLordDismissPane } from '../../src/ui/screens/panels/CastleLordDismissPane';
import { buildMiniState, CASTLE_A2 } from '../fixtures/mini';
import { resetGameStoreForTests, setGame, store } from '../../src/app/store';
import {
  getQueuedPlayerCommands,
  initializeBridgeSession,
  resetBridgeForTests,
} from '../../src/app/bridge';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { validateState } from '../../src/core/state/invariants';
import { t } from '../../src/i18n/zh-TW';

afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
});
function setup() {
  const game = buildMiniState();
  expect(validateState(game)).toEqual([]);
  setGame(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  render(<CastleLordDismissPane castleId={CASTLE_A2} />);
  fireEvent.click(screen.getByRole('button', { name: t('ui.castle.dismissLord') }));
  return game;
}
it('cannot pause a replacement game when stale cleanup advances an old queued month summary', () => {
  setup();
  const queued = { id: 'monthSummary' as const, params: { key: 'old-month' }, pausesTime: true };
  act(() => {
    uiStore.getState().actions.enqueueModal(queued);
  });
  const replacement = buildMiniState();
  expect(validateState(replacement)).toEqual([]);
  store.getState().actions.setSpeed('x2');
  act(() => {
    setGame(replacement);
  });
  expect(store.getState().game).toBe(replacement);
  expect(store.getState().session.speed).toBe('x2');
  expect(getQueuedPlayerCommands(replacement)).toEqual([]);
  expect(validateState(replacement)).toEqual([]);
});
it('irrevocably rejects old consent after an actual foreign native dialog appears and disappears', () => {
  const game = setup();
  const confirm = within(screen.getByRole('dialog')).getByRole('button', {
    name: t('ui.common.confirm'),
  });
  const key = Object.keys(confirm).find((item) => item.startsWith('__reactProps$'));
  if (!key) throw new Error('Missing React event props');
  const click = (confirm as unknown as Record<string, { onClick: () => void }>)[key]!.onClick;
  const before = structuredClone(game);
  const foreign = render(
    <Dialog open title="foreign native" onClose={() => {}}>
      foreign
    </Dialog>,
  );
  expect(screen.getAllByRole('dialog')).toHaveLength(2);
  foreign.unmount();
  act(click);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  expect(game).toEqual(before);
  expect(validateState(game)).toEqual([]);
});
