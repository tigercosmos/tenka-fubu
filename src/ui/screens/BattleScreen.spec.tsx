import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { resetGameStoreForTests } from '@app/store';
import { getPendingBattleOrdersForTests, resetBattleBridgeForTests } from '@app/battleBridge';
import type { BattleState, BattleUnit, GameState } from '@core/state/gameState';
import type { ArmyId, BattleId, ClanId, MapNodeId, OfficerId } from '@core/state/ids';
import { makeLoopTestState, TEST_CLAN } from '../../../tests/helpers/loopState';
import { BattleScreen } from './BattleScreen';

const BATTLE = 'battle.000001' as BattleId;
const ENEMY_CLAN = 'clan.enemy' as ClanId;

function unit(
  id: string,
  side: 'attacker' | 'defender',
  jinId: string,
  overrides: Partial<BattleUnit> = {},
): BattleUnit {
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
    ...overrides,
  };
}

function makeBattleGame(overrides: Partial<BattleState> = {}): GameState {
  const game = makeLoopTestState({ debugMode: false });
  game.battles[BATTLE] = {
    id: BATTLE,
    fieldCombatId: 'fc.test',
    nodeId: 'castle.test' as MapNodeId,
    terrain: 'plain',
    attackerClanId: TEST_CLAN,
    defenderClanId: ENEMY_CLAN,
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
        id: 'jin.center',
        col: 1,
        row: 1,
        owner: 'neutral',
        isHonjin: false,
        flagPower: 50,
        flagPowerMax: 100,
        defenseBonus: 0,
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
    units: [
      unit('bu.alpha-1', 'attacker', 'jin.a'),
      unit('bu.alpha-2', 'attacker', 'jin.a', { delegated: true }),
      unit('bu.beta-1', 'defender', 'jin.b', { troops: 900 }),
    ],
    tick: 3,
    saihai: { attacker: 4, defender: 8 },
    honjinFallenTick: null,
    result: null,
    ...overrides,
  };
  return game;
}

beforeEach(() => {
  resetBattleBridgeForTests();
  resetGameStoreForTests(makeBattleGame());
});

describe('BattleScreen', () => {
  it('使用 canonical 采配上限 20，依采配不足與冷卻停用戰法', () => {
    const game = makeBattleGame();
    game.battles[BATTLE]!.units[0]!.tacticCooldowns['tac.volley'] = 2;
    resetGameStoreForTests(game);
    render(<BattleScreen battleId={BATTLE} onExit={vi.fn()} onRetreat={vi.fn()} />);

    const saihai = screen.getByRole('progressbar', { name: '采配 4／20' });
    expect(saihai.getAttribute('aria-valuemax')).toBe('20');
    expect(screen.queryByTestId('battle-retreat')).toBeNull();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '突擊 5' }).disabled).toBe(true);
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: '齊射 4（冷卻 2）' }).disabled,
    ).toBe(true);
  });

  it('全軍委任為每支我方部隊排入獨立委任 order', () => {
    render(<BattleScreen battleId={BATTLE} onExit={vi.fn()} onRetreat={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '全軍委任：關' }));

    expect(getPendingBattleOrdersForTests(BATTLE)).toEqual([
      { kind: 'toggleDelegate', unitId: 'bu.alpha-1', enabled: true },
      { kind: 'toggleDelegate', unitId: 'bu.alpha-2', enabled: true },
    ]);
  });

  it('可對空陣移動、直接攻擊敵軍，需目標戰法會等待敵軍選取', () => {
    render(<BattleScreen battleId={BATTLE} onExit={vi.fn()} onRetreat={vi.fn()} />);
    const volley = screen.getByRole<HTMLButtonElement>('button', { name: '齊射 4' });
    expect(volley.disabled).toBe(false);

    fireEvent.click(volley);
    expect(screen.getByText('請選擇敵方部隊')).toBeTruthy();
    const enemy = screen.getByRole('button', { name: '敵軍 900人' });
    fireEvent.click(enemy);
    fireEvent.click(enemy);
    fireEvent.click(screen.getByTestId('battle-jin-jin.center'));

    expect(getPendingBattleOrdersForTests(BATTLE)).toEqual([
      {
        kind: 'tactic',
        unitId: 'bu.alpha-1',
        tacticId: 'tac.volley',
        targetUnitId: 'bu.beta-1',
      },
      { kind: 'attack', unitId: 'bu.alpha-1', targetUnitId: 'bu.beta-1' },
      { kind: 'move', unitId: 'bu.alpha-1', targetJinId: 'jin.center' },
    ]);
  });

  it('保留結果 dialog，確認後才呼叫離場 callback', () => {
    resetGameStoreForTests(
      makeBattleGame({
        result: {
          winnerSide: 'attacker',
          endTick: 12,
          attackerLosses: 200,
          defenderLosses: 900,
          aweLevel: 'large',
        },
      }),
    );
    const onExit = vi.fn();
    render(<BattleScreen battleId={BATTLE} onExit={onExit} onRetreat={vi.fn()} />);

    expect(screen.getByRole('dialog').textContent).toContain('合戰勝利');
    expect(screen.getByRole('dialog').textContent).toContain('我方損兵 200人');
    expect(screen.getByRole('dialog').textContent).toContain('敵方損兵 900人');
    expect(screen.getByRole('dialog').textContent).toContain('威風：大');
    expect(onExit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '返回策略畫面' }));
    expect(onExit).toHaveBeenCalledOnce();
  });
});
