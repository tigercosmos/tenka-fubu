// src/app/autoPause.ts 單元測試（M1-17／01-A8 驗收：模擬 visibility 事件）。
// 規格：plan/01-architecture.md §3.5.3（自動暫停兩來源）／§8 D4（失焦暫停不自動續跑）；
//       plan/03-game-loop.md §4.1（AutoPauseReason）。

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createGameLoopController } from '../../src/app/gameLoop';
import { installAutoPause, translateAutoPauseReasons } from '../../src/app/autoPause';
import {
  resetBridgeForTests,
  runOneDay,
  triggerAutoPauseHandlerForTests,
} from '../../src/app/bridge';
import { resetGameStoreForTests, store } from '../../src/app/store';
import { makeLoopTestState } from '../helpers/loopState';
import { createManualScheduler } from '../helpers/manualFrameScheduler';

function setDocumentHidden(hidden: boolean): void {
  Object.defineProperty(document, 'hidden', { value: hidden, configurable: true });
}

let uninstall: (() => void) | null = null;

beforeEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(makeLoopTestState());
  store.getState().actions.setSpeed('x1');
});

afterEach(() => {
  uninstall?.();
  uninstall = null;
  setDocumentHidden(false);
});

describe('失焦自動暫停（01-A8 主要交付）', () => {
  it("document.hidden 變 true 時觸發 visibilitychange → loop.requestPause('windowHidden')", () => {
    const loop = createGameLoopController(createManualScheduler().scheduler);
    uninstall = installAutoPause(loop);

    expect(store.getState().session.speed).toBe('x1');
    setDocumentHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));

    expect(store.getState().session.speed).toBe('paused');
    expect(store.getState().session.lastPauseReason).toBe('windowHidden');
    expect(store.getState().session.resumeSpeed).toBe('x1'); // 記住暫停前檔位
  });

  it('恢復可見（hidden→false）不自動續跑（01 §8 D4）：仍維持 paused，需手動 resume()', () => {
    const loop = createGameLoopController(createManualScheduler().scheduler);
    uninstall = installAutoPause(loop);

    setDocumentHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(store.getState().session.speed).toBe('paused');

    setDocumentHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(store.getState().session.speed).toBe('paused'); // 未自動恢復

    loop.resume(); // 玩家按「繼續」
    expect(store.getState().session.speed).toBe('x1'); // 回到暫停前檔位
  });

  it('已在暫停中（如玩家手動暫停）時失焦不覆寫原暫停前檔位', () => {
    const loop = createGameLoopController(createManualScheduler().scheduler);
    uninstall = installAutoPause(loop);

    loop.requestPause('user');
    expect(store.getState().session.resumeSpeed).toBe('x1');

    setDocumentHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(store.getState().session.lastPauseReason).toBe('windowHidden');
    expect(store.getState().session.resumeSpeed).toBe('x1'); // 仍是原本的暫停前檔位

    loop.resume();
    expect(store.getState().session.speed).toBe('x1');
  });

  it('uninstall 後 visibilitychange 不再觸發暫停', () => {
    const loop = createGameLoopController(createManualScheduler().scheduler);
    uninstall = installAutoPause(loop);
    uninstall();
    uninstall = null;

    setDocumentHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    expect(store.getState().session.speed).toBe('x1'); // 未被暫停
  });
});

describe('translateAutoPauseReasons — core AutoPauseReason → app PauseReason（01 §3.5.3／03 §4.1）', () => {
  it('依 03 §4.1 全部 6 種原因逐一轉譯正確', () => {
    expect(translateAutoPauseReasons(['siegeOnPlayer'])).toBe('castleBesieged');
    expect(translateAutoPauseReasons(['battleAvailable'])).toBe('battleOffer');
    expect(translateAutoPauseReasons(['proposalArrived'])).toBe('proposalArrived');
    expect(translateAutoPauseReasons(['envoyArrived'])).toBe('diploEnvoy');
    expect(translateAutoPauseReasons(['historicalEvent'])).toBe('historicalEvent');
    expect(translateAutoPauseReasons(['monthStart'])).toBe('monthStart');
  });

  it('多原因時取第一項；空陣列回傳 null', () => {
    expect(translateAutoPauseReasons(['monthStart', 'proposalArrived'])).toBe('monthStart');
    expect(translateAutoPauseReasons([])).toBeNull();
  });
});

describe('installAutoPause 與 bridge.runOneDay 的整合（01 §3.4.4 步驟 9 對應）', () => {
  it('runOneDay 每次結束都會呼叫已安裝的回呼（M1 骨架期 autoPauseReasons 恆空，不觸發暫停）', () => {
    const loop = createGameLoopController(createManualScheduler().scheduler);
    uninstall = installAutoPause(loop);

    expect(() => runOneDay()).not.toThrow();
    expect(store.getState().session.speed).toBe('x1'); // 空陣列不觸發暫停
  });

  it(
    '已註冊回呼收到非空 autoPauseReasons 時命中即暫停（模擬未來 Step 13 實作後的情境；' +
      '以 triggerAutoPauseHandlerForTests 觸發，見 bridge.ts 檔頭說明）',
    () => {
      const loop = createGameLoopController(createManualScheduler().scheduler);
      uninstall = installAutoPause(loop);

      triggerAutoPauseHandlerForTests(['siegeOnPlayer']);

      expect(store.getState().session.speed).toBe('paused');
      expect(store.getState().session.lastPauseReason).toBe('castleBesieged');
    },
  );
});
