import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({ apps: [] as { destroyed: boolean }[] }));
vi.mock('pixi.js', async () => {
  const { createPixiMockClasses } = await import('../helpers/pixiMock');
  return createPixiMockClasses(hoisted.apps);
});

import { App } from '../../src/app/App';
import { resetBridgeForTests } from '../../src/app/bridge';
import {
  acknowledgeBattleResult,
  dispatchBattleOrder,
  resetBattleBridgeForTests,
  runBattleTick,
  snapshotPendingBattleOrders,
} from '../../src/app/battleBridge';
import { bumpTickSeq, resetGameStoreForTests, store } from '../../src/app/store';
import type { BattleState, BattleUnit } from '../../src/core/state/gameState';
import type { ArmyId, BattleId, ClanId, MapNodeId, OfficerId } from '../../src/core/state/ids';
import { makeLoopTestState, TEST_CLAN } from '../helpers/loopState';
import {
  buildTinyState,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_TAISHO,
  OFF_BETA_TAISHO,
} from '../fixtures/tiny';
import { applyMarch } from '../../src/core/commands/march';
import { validateCommand } from '../../src/core/commands/validate';
import { startFieldCombat } from '../../src/core/systems/fieldCombat';
import { applyStartKassen } from '../../src/core/systems/battle';
import { validateState } from '../../src/core/state/invariants';
import { canonicalStringify } from '../../src/core/state/serialize';
import { BAL } from '../../src/core/balance';
import { uiStore } from '../../src/ui/hooks/uiStore';

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
  uiStore.getState().actions.reset();
  const game = makeLoopTestState();
  game.battles[FIRST_BATTLE] = battle(FIRST_BATTLE);
  resetGameStoreForTests(game);
});

afterEach(() => {
  cleanup();
});

describe('App battle result lifecycle', () => {
  it('actual tactical resolution transfers survivors once; explicit return only acknowledges and clears orders', async () => {
    const { game, battleId } = realTacticalFixture();
    resetGameStoreForTests(game);
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('screen-battle')).toBeTruthy());
    const selected = game.battles[battleId]!.units.find((unit) => unit.side === 'attacker')!;
    let dispatchResult: ReturnType<typeof dispatchBattleOrder> | undefined;
    act(() => {
      dispatchResult = dispatchBattleOrder(battleId, {
        kind: 'toggleDelegate',
        unitId: selected.id,
        enabled: true,
      });
    });
    expect(dispatchResult).toEqual({ ok: true });
    act(() => {
      expect(runBattleTick(battleId).resolved).toBe(true);
    });
    await waitFor(() => expect(screen.getByRole('dialog', { name: '合戰勝利' })).toBeTruthy());
    const resolved = game.battles[battleId]!;
    expect(validateState(game)).toEqual([]);
    for (const unit of resolved.units) {
      const army = game.armies[unit.armyId];
      if (army) {
        expect(army.soldiers).toBe(unit.troops);
        expect(army.battleId).toBeNull();
      }
    }
    expect(snapshotPendingBattleOrders()).toEqual([]);
    const armiesBeforeAck = canonicalStringify(game.armies),
      rngBeforeAck = canonicalStringify(game.rng),
      dayBefore = game.time.day;
    const tickBefore = store.getState().tickSeq;
    const button = screen.getByRole('button', { name: '返回策略畫面' });
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByTestId('screen-strategy')).toBeTruthy());
    expect(game.battles[battleId]).toBeUndefined();
    expect(canonicalStringify(game.armies)).toBe(armiesBeforeAck);
    expect(canonicalStringify(game.rng)).toBe(rngBeforeAck);
    expect(game.time.day).toBe(dayBefore);
    expect(store.getState().tickSeq).toBe(tickBefore + 1);
    expect(acknowledgeBattleResult(battleId)).toEqual({ ok: false, reason: 'battleMissing' });
    expect(store.getState().tickSeq).toBe(tickBefore + 1);
    expect(validateState(game)).toEqual([]);
  });
  it('result cannot be bypassed with Escape, backdrop, quicksave or quickload', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('screen-battle')).toBeTruthy());
    const game = resolveSelectedBattleWithAnotherActive();
    delete game.battles[SECOND_BATTLE];
    const dialog = await screen.findByRole('dialog', { name: '合戰勝利' });
    const original = canonicalStringify(game);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    fireEvent.mouseDown(dialog.parentElement!);
    fireEvent.keyDown(window, { key: 's', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'F9' });
    expect(screen.getByRole('dialog', { name: '合戰勝利' })).toBe(dialog);
    expect(screen.getByTestId('screen-battle')).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: '儲存遊戲' })).toBeNull();
    expect(canonicalStringify(game)).toBe(original);
    expect(store.getState().session.screen).toBe('battle');
  });
  it('另一場未結束合戰出現時仍保留所選結果，確認後才 close 並返回策略畫面', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('screen-battle')).toBeTruthy());
    const selected = store.getState().game!.battles[FIRST_BATTLE]!.units[0]!;
    let dispatchResult: ReturnType<typeof dispatchBattleOrder> | undefined;
    act(() => {
      dispatchResult = dispatchBattleOrder(FIRST_BATTLE, {
        kind: 'toggleDelegate',
        unitId: selected.id,
        enabled: true,
      });
    });
    expect(dispatchResult).toEqual({ ok: true });
    const game = resolveSelectedBattleWithAnotherActive();

    await waitFor(() => expect(screen.getByRole('dialog').textContent).toContain('合戰勝利'));
    expect(game.battles[FIRST_BATTLE]).toBeDefined();
    expect(snapshotPendingBattleOrders()).toHaveLength(1);
    act(() => {
      dispatchResult = dispatchBattleOrder(FIRST_BATTLE, {
        kind: 'toggleDelegate',
        unitId: selected.id,
        enabled: false,
      });
    });
    expect(dispatchResult).toEqual({ ok: false, reason: 'battleResolved' });
    delete game.battles[SECOND_BATTLE];

    fireEvent.click(screen.getByRole('button', { name: '返回策略畫面' }));
    await waitFor(() => expect(screen.getByTestId('screen-strategy')).toBeTruthy());
    expect(game.battles[FIRST_BATTLE]).toBeUndefined();
    expect(snapshotPendingBattleOrders()).toEqual([]);
  });
});

/** Controlled tiny gameplay fixture: real march/start/resolve lifecycle, not historical data. */
function realTacticalFixture() {
  const game = buildTinyState();
  for (const [clanId, originCastleId, leaderId, targetNodeId] of [
    [CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, CASTLE_B1],
    [CLAN_BETA, CASTLE_B1, OFF_BETA_TAISHO, CASTLE_A2],
  ] as const) {
    game.castles[originCastleId]!.soldiers = 2500;
    const command = {
      type: 'march' as const,
      clanId,
      originCastleId,
      leaderId,
      deputyIds: [],
      soldiers: 2000,
      food: Math.ceil(2000 * BAL.fieldFoodPerSoldierDaily * 30),
      targetNodeId,
    };
    expect(validateCommand(game, command)).toEqual({ ok: true });
    applyMarch(game, command, () => {});
  }
  const armies = Object.values(game.armies);
  for (const army of armies) {
    army.posNodeId = CASTLE_A2;
    army.path = [CASTLE_A2];
    army.pathCursor = 0;
    army.edgeProgressDays = 0;
    army.edgeCostDays = 0;
    army.status = 'holding';
  }
  startFieldCombat(
    game,
    CASTLE_A2,
    armies.filter((army) => army.clanId === CLAN_ALPHA).map((army) => army.id),
    armies.filter((army) => army.clanId === CLAN_BETA).map((army) => army.id),
  );
  const combat = Object.values(game.fieldCombats)[0]!;
  const command = { type: 'startKassen' as const, clanId: CLAN_ALPHA, fieldCombatId: combat.id };
  expect(validateCommand(game, command)).toEqual({ ok: true });
  applyStartKassen(game, command, () => {});
  const active = Object.values(game.battles)[0]!;
  active.units.find((unit) => unit.side === 'defender')!.morale = BAL.moraleBreakThreshold;
  expect(validateState(game)).toEqual([]);
  return { game, battleId: active.id };
}

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
