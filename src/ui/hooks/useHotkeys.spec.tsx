// useHotkeys 單元測試（M1-16／01-A7 驗收：空白鍵暫停⇄繼續、1/2/3 變速；輸入框聚焦時停用）。
// 規格：plan/01-architecture.md §6.3（互動細節）。

import type { ReactElement } from 'react';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useHotkeys } from './useHotkeys';
import { createGameLoopController } from '../../app/gameLoop';
import { resetGameStoreForTests, store } from '../../app/store';
import { makeLoopTestState } from '../../../tests/helpers/loopState';
import { createManualScheduler } from '../../../tests/helpers/manualFrameScheduler';

function HotkeysHost({
  loop,
  onToggleDebugPanel,
}: {
  loop: ReturnType<typeof createGameLoopController>;
  onToggleDebugPanel?: () => void;
}): ReactElement {
  useHotkeys(loop, onToggleDebugPanel);
  return (
    <div>
      <input data-testid="text-input" />
    </div>
  );
}

let loop: ReturnType<typeof createGameLoopController>;

beforeEach(() => {
  resetGameStoreForTests(makeLoopTestState());
  store.getState().actions.setSpeed('x1');
  loop = createGameLoopController(createManualScheduler().scheduler);
});

describe('useHotkeys — 空白鍵／數字鍵（01 §6.3）', () => {
  it("空白鍵：目前非暫停時呼叫 requestPause('user')", async () => {
    const user = userEvent.setup();
    render(<HotkeysHost loop={loop} />);
    await user.keyboard(' ');
    expect(store.getState().session.speed).toBe('paused');
    expect(store.getState().session.lastPauseReason).toBe('user');
  });

  it('空白鍵：目前暫停中時呼叫 resume()', async () => {
    loop.requestPause('user');
    const user = userEvent.setup();
    render(<HotkeysHost loop={loop} />);
    await user.keyboard(' ');
    expect(store.getState().session.speed).toBe('x1');
  });

  it('數字鍵 1／2／3 切換 x1／x2／x5', async () => {
    const user = userEvent.setup();
    render(<HotkeysHost loop={loop} />);
    await user.keyboard('2');
    expect(store.getState().session.speed).toBe('x2');
    await user.keyboard('3');
    expect(store.getState().session.speed).toBe('x5');
    await user.keyboard('1');
    expect(store.getState().session.speed).toBe('x1');
  });

  it('輸入框聚焦時快捷鍵停用（01 §6.3）', async () => {
    const user = userEvent.setup();
    const { getByTestId } = render(<HotkeysHost loop={loop} />);
    const input = getByTestId('text-input');
    input.focus();
    await user.keyboard(' ');
    expect(store.getState().session.speed).toBe('x1'); // 未被觸發暫停
  });

  it('反引號呼叫 onToggleDebugPanel（若有傳入）', async () => {
    const onToggle = vi.fn();
    const user = userEvent.setup();
    render(<HotkeysHost loop={loop} onToggleDebugPanel={onToggle} />);
    await user.keyboard('`');
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
