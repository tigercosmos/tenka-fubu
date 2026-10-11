import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CastlePanel } from '../../src/ui/screens/panels/CastlePanel';
import { validateState } from '../../src/core/state/invariants';
import { resetGameStoreForTests, store, setGame } from '../../src/app/store';
import { act } from '@testing-library/react';
import {
  getQueuedPlayerCommands,
  initializeBridgeSession,
  resetBridgeForTests,
  dispatchCommand,
  runOneDay,
} from '../../src/app/bridge';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { t } from '../../src/i18n/zh-TW';
import type { OfficerId } from '../../src/core/state/ids';
import {
  buildTinyState,
  CASTLE_A1,
  OFF_ALPHA_BUSHO,
  OFF_ALPHA_LORD,
  CLAN_ALPHA,
} from '../fixtures/tiny';

afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
});

it('shows resident officers but disables selection and deployment after real corps delegation', () => {
  const { game } = fixture();
  expect(
    dispatchCommand({
      type: 'createCorps',
      clanId: CLAN_ALPHA,
      corpsLeaderId: OFF_ALPHA_LORD,
      castleIds: [CASTLE_A1],
      directive: 'hold',
      targetNodeId: null,
    }),
  ).toEqual({ ok: true });
  act(() => {
    runOneDay();
  });
  expect(validateState(game)).toEqual([]);
  const before = structuredClone(game);
  const open = vi.fn();
  render(<CastlePanel castleId={CASTLE_A1} initialTab="military" onOpenMarch={open} />);
  expect(screen.getByRole<HTMLInputElement>('checkbox', { name: /Selection0/ }).disabled).toBe(
    true,
  );
  const deploy = screen.getByRole<HTMLButtonElement>('button', { name: t('ui.castle.deploy') });
  expect(deploy.disabled).toBe(true);
  fireEvent.click(deploy);
  expect(open).not.toHaveBeenCalled();
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});

it('promotes the next explicitly selected officer after unchecking the commander', () => {
  const { ids } = fixture();
  const open = vi.fn();
  render(<CastlePanel castleId={CASTLE_A1} initialTab="military" onOpenMarch={open} />);
  fireEvent.click(screen.getByRole('checkbox', { name: /Selection2/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: /Selection1/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: /Selection2/ }));
  expect(screen.getByRole('checkbox', { name: /Selection1.*大將/ })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: t('ui.castle.deploy') }));
  expect(open).toHaveBeenCalledTimes(1);
  expect(open).toHaveBeenCalledWith(CASTLE_A1, [ids[1]]);
});

it('keeps the empty selection blank and uses shared defaults for a selected fallback commander', () => {
  const { ids, game } = fixture();
  const before = structuredClone(game);
  const view = render(<CastlePanel castleId={CASTLE_A1} initialTab="military" />);
  fireEvent.click(screen.getByRole('button', { name: t('ui.castle.deploy') }));
  expect(uiStore.getState().marchDraft).toMatchObject({
    leaderOfficerId: null,
    subOfficerIds: [],
    soldiers: 0,
    food: 0,
  });
  act(() => {
    uiStore.getState().actions.closeModal();
    uiStore.getState().actions.setMarchDraft(null);
  });
  view.unmount();
  render(<CastlePanel castleId={CASTLE_A1} initialTab="military" />);
  fireEvent.click(screen.getByRole('checkbox', { name: /Selection0/ }));
  fireEvent.click(screen.getByRole('button', { name: t('ui.castle.deploy') }));
  expect(uiStore.getState().marchDraft).toMatchObject({
    leaderOfficerId: ids[0],
    subOfficerIds: [],
  });
  expect(uiStore.getState().marchDraft!.soldiers).toBeGreaterThan(0);
  expect(game).toEqual(before);
  expect(validateState(game)).toEqual([]);
});

it('does not enqueue the old march modal after a synchronous draft subscriber replaces its draft', () => {
  fixture();
  render(<CastlePanel castleId={CASTLE_A1} initialTab="military" />);
  let successor: ReturnType<typeof uiStore.getState>['marchDraft'] = null;
  const unsubscribe = uiStore.subscribe((state, previous) => {
    if (previous.marchDraft === null && state.marchDraft !== null) {
      successor = { ...state.marchDraft, soldiers: 100 };
      uiStore.getState().actions.setMarchDraft(successor);
    }
  });
  fireEvent.click(screen.getByRole('button', { name: t('ui.castle.deploy') }));
  unsubscribe();
  expect(uiStore.getState().modal).toBeNull();
  expect(uiStore.getState().marchDraft).toBe(successor);
});

it('rejects stale selected eligibility and resets selection on same-ID game replacement', () => {
  const { game, ids } = fixture();
  const open = vi.fn();
  render(<CastlePanel castleId={CASTLE_A1} initialTab="military" onOpenMarch={open} />);
  fireEvent.click(screen.getByRole('checkbox', { name: /Selection0/ }));
  game.officers[ids[0]!]!.hasComeOfAge = false;
  fireEvent.click(screen.getByRole('button', { name: t('ui.castle.deploy') }));
  expect(open).not.toHaveBeenCalled();
  game.officers[ids[0]!]!.hasComeOfAge = true;
  act(() => {
    const replacement = structuredClone(game);
    setGame(replacement);
    initializeBridgeSession(replacement);
  });
  expect(screen.getByRole<HTMLInputElement>('checkbox', { name: /Selection0/ }).checked).toBe(
    false,
  );
  fireEvent.click(screen.getByRole('button', { name: t('ui.castle.deploy') }));
  expect(open).toHaveBeenCalledTimes(1);
  expect(open).toHaveBeenCalledWith(CASTLE_A1, []);
});

function fixture() {
  const game = buildTinyState();
  const ids = [0, 1, 2, 3].map((index) => `off.selection${index}` as OfficerId);
  for (const [index, id] of ids.entries()) {
    game.officers[id] = {
      ...structuredClone(game.officers[OFF_ALPHA_BUSHO]!),
      id,
      name: `Selection${index}`,
      armyId: null,
      spouseId: null,
    };
  }
  expect(validateState(game)).toEqual([]);
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  uiStore.getState().actions.reset();
  return { game, ids };
}

it('prefills commander then deputies in explicit checkbox selection order without gameplay writes', () => {
  const { game, ids } = fixture();
  const before = structuredClone(game);
  const open = vi.fn();
  render(<CastlePanel castleId={CASTLE_A1} initialTab="military" onOpenMarch={open} />);
  fireEvent.click(screen.getByRole('checkbox', { name: /Selection2/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: /Selection0/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: /Selection1/ }));
  expect(screen.getByRole<HTMLInputElement>('checkbox', { name: /Selection3/ }).disabled).toBe(
    true,
  );
  fireEvent.click(screen.getByRole('button', { name: t('ui.castle.deploy') }));
  expect(open).toHaveBeenCalledTimes(1);
  expect(open).toHaveBeenCalledWith(CASTLE_A1, [ids[2], ids[0], ids[1]]);
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});
