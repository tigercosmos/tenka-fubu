import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { CommandAction } from '../../src/ui/components/CommandAction';
import { resetGameStoreForTests, store } from '../../src/app/store';
import {
  dispatchCommand,
  getQueuedPlayerCommands,
  resetBridgeForTests,
} from '../../src/app/bridge';
import { applyStartPlot } from '../../src/core/commands/plotCommands';
import { validateCommand } from '../../src/core/index';
import { validateState } from '../../src/core/state/invariants';
import type { OfficerId } from '../../src/core/state/ids';
import { t } from '../../src/i18n/zh-TW';
import { buildTinyState, CASTLE_A1, CASTLE_B1, OFF_ALPHA_BUSHO } from '../fixtures/tiny';

afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests(null);
});
it('renders the actual busy recruitment executor name without placeholders or query side effects', () => {
  const game = buildTinyState();
  const targetId = 'off.busy-recruit-target' as OfficerId;
  game.officers[targetId] = {
    ...structuredClone(game.officers[OFF_ALPHA_BUSHO]!),
    id: targetId,
    name: '在野武將',
    status: 'ronin',
    clanId: null,
    spouseId: null,
  };
  const plot = {
    type: 'startPlot' as const,
    kind: 'rumor' as const,
    clanId: game.meta.playerClanId,
    executorId: OFF_ALPHA_BUSHO,
    targetClanId: game.castles[CASTLE_B1]!.ownerClanId,
    targetOfficerId: null,
    targetCastleId: CASTLE_B1,
    investGold: 0,
  };
  expect(game.officers[targetId].locationCastleId).toBe(CASTLE_A1);
  expect(validateCommand(game, plot)).toEqual({ ok: true });
  applyStartPlot(game, plot, () => {});
  expect(validateState(game)).toEqual([]);
  resetGameStoreForTests(game);
  store.getState().actions.setScreen('main');
  const before = structuredClone(game);
  const command = {
    type: 'recruitRonin' as const,
    clanId: game.meta.playerClanId,
    officerId: targetId,
    executorId: OFF_ALPHA_BUSHO,
  };
  const name = game.officers[OFF_ALPHA_BUSHO]!.name;
  expect(validateCommand(game, command)).toMatchObject({
    ok: false,
    reasonKey: 'cmd.reject.officerBusy',
    params: { name },
  });
  render(<CommandAction command={command} label={t('cmd.officer.recruit')} />);
  const button = screen.getByRole('button', { name: t('cmd.officer.recruit') });
  expect(button.hasAttribute('disabled')).toBe(true);
  expect(button.title).toBe(t('cmd.reject.officerBusy', { name }));
  expect(button.title).not.toMatch(/\{name\}/);
  expect(dispatchCommand(command)).toMatchObject({ ok: false });
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
});
