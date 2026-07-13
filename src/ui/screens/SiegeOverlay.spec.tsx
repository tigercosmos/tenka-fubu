import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { resetGameStoreForTests } from '@app/store';
import type { SiegeId } from '@core/state/ids';
import { makeLoopTestState, TEST_CASTLE, TEST_CLAN } from '../../../tests/helpers/loopState';
import { SiegeOverlay } from './SiegeOverlay';

const SIEGE = 'siege.000001' as SiegeId;

beforeEach(() => {
  const game = makeLoopTestState({ day: 12, food: 3_000 });
  game.castles[TEST_CASTLE]!.name = '稻葉山城';
  game.castles[TEST_CASTLE]!.soldiers = 1_000;
  game.castles[TEST_CASTLE]!.durability = 600;
  game.castles[TEST_CASTLE]!.maxDurability = 1_000;
  game.sieges[SIEGE] = {
    id: SIEGE,
    castleId: TEST_CASTLE,
    attackerClanId: TEST_CLAN,
    attackerArmyIds: [],
    mode: 'encircle',
    startDay: 10,
    interrupted: false,
    betrayalUsed: false,
  };
  resetGameStoreForTests(game);
});

describe('SiegeOverlay', () => {
  it('呈現耐久、士氣、城糧估算並可切換攻城模式', () => {
    const onCommand = vi.fn();
    render(<SiegeOverlay siegeId={SIEGE} onCommand={onCommand} anchor={{ x: 120, y: 240 }} />);

    expect(screen.getByText(/稻葉山城攻圍.*第3日/)).toBeTruthy();
    expect(screen.getAllByRole('progressbar')).toHaveLength(3);
    expect(screen.getByRole('progressbar', { name: /耐久/ })).toBeTruthy();
    expect(screen.getByRole('group', { name: '攻城方式' })).toBeTruthy();
    expect(screen.getByTestId('siege-overlay').style.left).toBe('120px');
    fireEvent.click(screen.getByRole('radio', { name: '強攻' }));
    expect(onCommand).toHaveBeenCalledWith({
      type: 'setSiegeMode',
      clanId: TEST_CLAN,
      siegeId: SIEGE,
      mode: 'assault',
    });
  });
});
