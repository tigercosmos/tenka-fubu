import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { resetGameStoreForTests } from '@app/store';
import { BAL } from '@core/balance';
import type { Army, GameState } from '@core/state/gameState';
import type { ArmyId, SiegeId } from '@core/state/ids';
import { makeLoopTestState, TEST_CASTLE, TEST_CLAN } from '../../../tests/helpers/loopState';
import { SiegeOverlay } from './SiegeOverlay';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const SIEGE = 'siege.000001' as SiegeId;
const ARMY_1 = 'army.000001' as ArmyId;
const ARMY_2 = 'army.000002' as ArmyId;

function makeSiegeState(
  attackerTroops: readonly number[],
  mode: 'encircle' | 'assault',
): GameState {
  const game = makeLoopTestState({ day: 12, food: 3_000 });
  game.castles[TEST_CASTLE]!.name = '稻葉山城';
  game.castles[TEST_CASTLE]!.soldiers = 1_000;
  game.castles[TEST_CASTLE]!.durability = 600;
  game.castles[TEST_CASTLE]!.maxDurability = 1_000;
  const armyIds = [ARMY_1, ARMY_2].slice(0, attackerTroops.length);
  armyIds.forEach((armyId, index) => {
    game.armies[armyId] = { id: armyId, soldiers: attackerTroops[index] } as Army;
  });
  game.sieges[SIEGE] = {
    id: SIEGE,
    castleId: TEST_CASTLE,
    attackerClanId: TEST_CLAN,
    attackerArmyIds: armyIds,
    mode,
    startDay: 10,
    interrupted: false,
    betrayalUsed: false,
  };
  return game;
}

beforeEach(() => {
  const game = makeSiegeState([1_000 * BAL.encircleRatio - 1], 'encircle');
  resetGameStoreForTests(game);
});

describe('SiegeOverlay', () => {
  it('caps the dock in physical pixels with scrollable complete content and 32px radio labels (CSS contract, not native geometry)', () => {
    const css = readFileSync(resolve('src/ui/screens/SiegeOverlay.module.css'), 'utf8');
    expect(css).toMatch(/width:\s*min\(18rem,\s*280px\)/);
    expect(css).toMatch(/box-sizing:\s*border-box/);
    expect(css).toMatch(/overflow-y:\s*auto/);
    expect(css).toMatch(/\.overlay label\s*\{[^}]*min-height:\s*32px/);
    expect(css).toMatch(/\.overlay label\s*\{[^}]*min-width:\s*32px/);
    expect(css).not.toMatch(/transform:/);
  });
  it('accepts measured dock bounds without projecting onto the castle body', () => {
    render(
      <SiegeOverlay
        siegeId={SIEGE}
        dock={{ left: 112, top: 184, maxHeight: 300, maxWidth: 280 }}
      />,
    );
    const inspector = screen.getByTestId('siege-overlay');
    expect(inspector.style.left).toBe('112px');
    expect(inspector.style.top).toBe('184px');
    expect(inspector.style.maxHeight).toBe('300px');
    expect(inspector.style.maxWidth).toBe('280px');
    expect(inspector.tabIndex).toBe(0);
    expect(screen.getAllByRole('progressbar')).toHaveLength(3);
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });
  it('兵力低於門檻時停用包圍並顯示倍率提示，但仍可切換強攻', () => {
    const onCommand = vi.fn();
    render(<SiegeOverlay siegeId={SIEGE} onCommand={onCommand} />);

    expect(screen.getByText(/稻葉山城攻圍.*第3日/)).toBeTruthy();
    expect(screen.getAllByRole('progressbar')).toHaveLength(3);
    expect(screen.getByRole('progressbar', { name: /耐久/ })).toBeTruthy();
    expect(screen.getByRole('group', { name: '攻城方式' })).toBeTruthy();
    expect(screen.getByTestId('siege-overlay').style.left).toBe('');
    expect(screen.getByRole<HTMLInputElement>('radio', { name: '包圍' }).disabled).toBe(true);
    expect(screen.getByText('包圍需兵力達城兵3倍')).toBeTruthy();
    const assault = screen.getByRole<HTMLInputElement>('radio', { name: '強攻' });
    expect(assault.disabled).toBe(false);

    fireEvent.click(assault);
    expect(onCommand).toHaveBeenCalledWith({
      type: 'setSiegeMode',
      clanId: TEST_CLAN,
      siegeId: SIEGE,
      mode: 'assault',
    });
  });

  it('存活攻方部隊總兵力達門檻時啟用包圍', () => {
    resetGameStoreForTests(makeSiegeState([1_500, 1_500], 'assault'));
    const onCommand = vi.fn();
    render(<SiegeOverlay siegeId={SIEGE} onCommand={onCommand} />);

    const encircle = screen.getByRole<HTMLInputElement>('radio', { name: '包圍' });
    expect(encircle.disabled).toBe(false);
    expect(screen.queryByText('包圍需兵力達城兵3倍')).toBeNull();

    fireEvent.click(encircle);
    expect(onCommand).toHaveBeenCalledWith({
      type: 'setSiegeMode',
      clanId: TEST_CLAN,
      siegeId: SIEGE,
      mode: 'encircle',
    });
  });
});
