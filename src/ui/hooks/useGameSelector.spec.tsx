// useGameSelector／useCachedGameSelector 單元測試（M1-15／01-A6 驗收：
// 「selector 輸出未變時元件不重渲染（以 render 計數器測）」）。
// 規格：plan/01-architecture.md §3.4.2（selector 粒度策略）／§5.3（帶版本快取的彙總 selector）。

import { act, type ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useCachedGameSelector, useGameSelector, makeCachedSelector } from './useGameSelector';
import { bumpTickSeq, resetGameStoreForTests, store } from '../../app/store';
import type { GameState } from '../../core/state/gameState';
import { makeLoopTestState, TEST_CLAN } from '../../../tests/helpers/loopState';

beforeEach(() => {
  resetGameStoreForTests(makeLoopTestState({ gold: 100 }));
});

function GoldDisplay({ onRender }: { onRender: () => void }): ReactElement {
  onRender();
  const gold = useGameSelector((g: GameState) => g.clans[TEST_CLAN]?.gold ?? 0);
  return <div data-testid="gold">{gold}</div>;
}

describe('useGameSelector — 輸出未變時不重渲染（useShallow 淺比較）', () => {
  it('bumpTickSeq 但選取值不變：不觸發重渲染；值改變才重渲染', () => {
    let renderCount = 0;
    render(<GoldDisplay onRender={() => (renderCount += 1)} />);
    expect(renderCount).toBe(1);
    expect(screen.getByTestId('gold').textContent).toBe('100');

    act(() => {
      bumpTickSeq(); // game.clans[...].gold 未變
    });
    expect(renderCount).toBe(1); // 值未變，不重渲染

    act(() => {
      const game = store.getState().game;
      if (game === null) throw new Error('test setup: game is null');
      const clan = game.clans[TEST_CLAN];
      if (clan === undefined) throw new Error('test setup: clan missing');
      clan.gold = 999; // core 就地變異（§8-D1 慣例，此處直接模擬）
      bumpTickSeq();
    });
    expect(renderCount).toBe(2); // 值改變，重渲染一次
    expect(screen.getByTestId('gold').textContent).toBe('999');
  });
});

describe('makeCachedSelector／useCachedGameSelector（01 §5.3）', () => {
  it('同一 tickSeq 內重複呼叫回傳快取值，compute 只呼叫一次', () => {
    let computeCalls = 0;
    const cached = makeCachedSelector((g: GameState) => {
      computeCalls += 1;
      return Object.keys(g.clans).length;
    });
    const game = store.getState().game;
    if (game === null) throw new Error('test setup: game is null');

    expect(cached(game, 0)).toBe(1);
    expect(cached(game, 0)).toBe(1); // 同 tickSeq，命中快取
    expect(computeCalls).toBe(1);

    expect(cached(game, 1)).toBe(1); // tickSeq 變動，重算
    expect(computeCalls).toBe(2);
  });

  it('useCachedGameSelector 自動代入目前 tickSeq；輸出未變時元件不重渲染', () => {
    let renderCount = 0;
    let computeCalls = 0;
    const cached = makeCachedSelector((g: GameState) => {
      computeCalls += 1;
      return Object.keys(g.clans).length;
    });

    function ClanCount(): ReactElement {
      renderCount += 1;
      const count = useCachedGameSelector(cached);
      return <div data-testid="count">{count}</div>;
    }

    render(<ClanCount />);
    expect(renderCount).toBe(1);
    expect(computeCalls).toBe(1);
    expect(screen.getByTestId('count').textContent).toBe('1');

    act(() => {
      bumpTickSeq();
    });
    // tickSeq 改變會使 useCachedGameSelector 內的 useGameSelector 重跑一次 compute，
    // 但輸出值（勢力數）未變，元件本身不因此重渲染。
    expect(renderCount).toBe(1);
  });
});
