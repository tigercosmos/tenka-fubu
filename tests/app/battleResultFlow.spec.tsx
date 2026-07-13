import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({ apps: [] as { destroyed: boolean }[] }));
vi.mock('pixi.js', async () => {
  const { createPixiMockClasses } = await import('../helpers/pixiMock');
  return createPixiMockClasses(hoisted.apps);
});

import { App } from '../../src/app/App';
import { resetBridgeForTests } from '../../src/app/bridge';
import { resetBattleBridgeForTests } from '../../src/app/battleBridge';
import { bumpTickSeq, resetGameStoreForTests, store } from '../../src/app/store';
import type { BattleState, BattleUnit } from '../../src/core/state/gameState';
import type { ArmyId, BattleId, ClanId, MapNodeId, OfficerId } from '../../src/core/state/ids';
import { makeLoopTestState, TEST_CLAN } from '../helpers/loopState';

const FIRST_BATTLE = 'battle.000001' as BattleId;
const SECOND_BATTLE = 'battle.000002' as BattleId;

function unit(id: string, side: 'attacker' | 'defender', jinId: string): BattleUnit {
  return {
    id,
    armyId: `army.${id}` as ArmyId,
    side,
    generalId: `officer.${id}` as OfficerId,
    troops: 1_000,
    battleInitialTroops: 1_000,
    morale: 70,
    jinId,
    moveTargetJinId: null,
    moveProgress: 0,
    attackTargetUnitId: null,
    activeTactics: [],
    tacticCooldowns: {},
    delegated: false,
    routed: false,
    exited: false,
    strategyStatus: 'engaged',
  };
}

function battle(id: BattleId): BattleState {
  return {
    id,
    fieldCombatId: `fc.${id}`,
    nodeId: 'castle.test' as MapNodeId,
    terrain: 'plain',
    attackerClanId: TEST_CLAN,
    defenderClanId: 'clan.enemy' as ClanId,
    jins: [
      {
        id: 'jin.a',
        col: 0,
        row: 1,
        owner: 'attacker',
        isHonjin: true,
        flagPower: 100,
        flagPowerMax: 100,
        defenseBonus: 0.2,
      },
      {
        id: 'jin.b',
        col: 2,
        row: 1,
        owner: 'defender',
        isHonjin: true,
        flagPower: 100,
        flagPowerMax: 100,
        defenseBonus: 0.2,
      },
    ],
    edges: [],
    units: [unit(`bu.${id}.a`, 'attacker', 'jin.a'), unit(`bu.${id}.b`, 'defender', 'jin.b')],
    tick: 3,
    saihai: { attacker: 4, defender: 4 },
    honjinFallenTick: null,
    result: null,
  };
}

beforeEach(() => {
  resetBridgeForTests();
  resetBattleBridgeForTests();
  const game = makeLoopTestState();
  game.battles[FIRST_BATTLE] = battle(FIRST_BATTLE);
  resetGameStoreForTests(game);
});

afterEach(() => {
  cleanup();
});

describe('App battle result lifecycle', () => {
  it('另一場未結束合戰出現時仍保留所選結果，確認後才 close 並返回策略畫面', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('screen-battle')).toBeTruthy());
    const game = resolveSelectedBattleWithAnotherActive();

    await waitFor(() => expect(screen.getByRole('dialog').textContent).toContain('合戰勝利'));
    expect(game.battles[FIRST_BATTLE]).toBeDefined();
    delete game.battles[SECOND_BATTLE];

    fireEvent.click(screen.getByRole('button', { name: '返回策略畫面' }));
    await waitFor(() => expect(screen.getByTestId('screen-strategy')).toBeTruthy());
    expect(game.battles[FIRST_BATTLE]).toBeUndefined();
  });
});

function resolveSelectedBattleWithAnotherActive() {
  const game = store.getState().game!;
  act(() => {
    game.battles[FIRST_BATTLE]!.result = {
      winnerSide: 'attacker',
      endTick: 3,
      attackerLosses: 100,
      defenderLosses: 1_000,
      aweLevel: 'small',
    };
    game.battles[SECOND_BATTLE] = battle(SECOND_BATTLE);
    bumpTickSeq();
  });
  return game;
}
