import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { CommandAction } from '../../src/ui/components/CommandAction';
import { resetGameStoreForTests, store } from '../../src/app/store';
import {
  dispatchCommand,
  getQueuedPlayerCommands,
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
} from '../../src/app/bridge';
import { validateCommand } from '../../src/core/commands/validate';
import { validateState } from '../../src/core/state/invariants';
import { t } from '../../src/i18n/zh-TW';
import {
  buildTinyState,
  CLAN_ALPHA,
  CLAN_BETA,
  CASTLE_B1,
  OFF_ALPHA_BUSHO,
} from '../fixtures/tiny';

afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests(null);
});

it('names the actual busy plot executor after legal queued Court work settles', () => {
  const game = buildTinyState();
  resetGameStoreForTests(game);
  store.getState().actions.setScreen('main');
  initializeBridgeSession(game);
  act(() => {
    expect(
      dispatchCommand({
        type: 'startDiploWork',
        clanId: CLAN_ALPHA,
        target: 'court',
        executorId: OFF_ALPHA_BUSHO,
      }),
    ).toEqual({ ok: true });
    runOneDay();
  });
  expect(validateState(game)).toEqual([]);
  const command = {
    type: 'startPlot' as const,
    clanId: CLAN_ALPHA,
    kind: 'rumor' as const,
    executorId: OFF_ALPHA_BUSHO,
    targetClanId: CLAN_BETA,
    targetOfficerId: null,
    targetCastleId: CASTLE_B1,
    investGold: 0,
  };
  const before = structuredClone(game);
  const name = game.officers[OFF_ALPHA_BUSHO]!.name;
  expect(validateCommand(game, command)).toEqual({
    ok: false,
    reasonKey: 'cmd.reject.officerBusy',
    params: { name },
  });
  render(<CommandAction command={command} label={t('cmd.plot.start')} />);
  const button = screen.getByRole('button');
  expect((button as HTMLButtonElement).disabled).toBe(true);
  expect(button.title).toBe(t('cmd.reject.officerBusy', { name }));
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});
