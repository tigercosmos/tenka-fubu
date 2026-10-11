import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { GameEvent } from '@core/state/events';
import type { ArmyId, ReportId, TaimeiId } from '@core/state/ids';
import { validateState } from '@core/state/invariants';
import { resetBridgeForTests } from '@app/bridge';
import { resetGameStoreForTests, store } from '@app/store';
import { uiStore } from '../hooks/uiStore';
import {
  buildTinyState,
  CLAN_ALPHA,
  CLAN_BETA,
  CASTLE_A1,
  CASTLE_A2,
  OFF_ALPHA_LORD,
} from '../../../tests/fixtures/tiny';
import { MainScreen } from './MainScreen';

const captured = vi.hoisted(() => ({
  items: [] as import('../components/ReportStack/ReportStack').ToastItem[],
}));
vi.mock('pixi.js', async () => {
  const { createPixiMockClasses } = await import('../../../tests/helpers/pixiMock');
  return createPixiMockClasses([]);
});
vi.mock('../components/ReportStack/ReportStack', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../components/ReportStack/ReportStack')>();
  return {
    ...actual,
    ReportStack(props: import('../components/ReportStack/ReportStack').ReportStackProps) {
      // Capture initial projection before the real max-five overflow effect dismisses its sixth item.
      if (captured.items.length === 0) captured.items = props.items;
      return <actual.ReportStack {...props} />;
    },
  };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  resetBridgeForTests();
});

it('projects all six canonical event families into actual toast props without changing core or commands', () => {
  captured.items = [];
  resetBridgeForTests();
  const game = buildTinyState();
  const base = { day: game.time.day, clanIds: [CLAN_ALPHA] };
  const events: GameEvent[] = [
    { ...base, type: 'economy.income', clanId: CLAN_ALPHA, gold: 10, foodByCastle: {} },
    {
      ...base,
      type: 'army.departed',
      armyId: 'army.deleted' as ArmyId,
      clanId: CLAN_ALPHA,
      originCastleId: CASTLE_A1,
      targetNodeId: CASTLE_A2,
      leaderId: OFF_ALPHA_LORD,
    },
    {
      ...base,
      type: 'pact.signed',
      aClanId: CLAN_ALPHA,
      bClanId: CLAN_BETA,
      kind: 'alliance',
      endDay: 180,
    },
    {
      ...base,
      type: 'officer.promoted',
      officerId: OFF_ALPHA_LORD,
      clanId: CLAN_ALPHA,
      newRank: 'busho',
    },
    { ...base, type: 'taimei.invoked', clanId: CLAN_ALPHA, taimeiId: 'taimei.teppeki' as TaimeiId },
    {
      ...base,
      type: 'command.rejected',
      commandType: 'march',
      reasonKey: 'cmd.reject.notOwner',
      params: {},
    },
  ];
  game.reports = events.map((event, index) => ({
    id: `rep.${index + 1}` as ReportId,
    day: event.day,
    event,
    read: false,
  }));
  resetGameStoreForTests(game);
  store.getState().actions.setScreen('main');
  uiStore.getState().actions.reset();
  uiStore.getState().actions.setScreen('main');
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
  const before = structuredClone(game);
  render(<MainScreen />);
  expect(
    game.reports.map((report) => captured.items.find((item) => item.id === report.id)?.category),
  ).toEqual(['domestic', 'military', 'diplomacy', 'personnel', 'event', 'system']);
  expect(store.getState().game).toEqual(before);
  expect(store.getState().session.pendingCommandCount).toBe(0);
  expect(validateState(game)).toEqual([]);
});
