// src/app/gameLoop.ts 單元測試（M1-16／01-A7 驗收）。
// 規格：plan/01-architecture.md §4.2（GameLoopController 介面）／§5.1（rAF 累加器演算法）／
//       §5.4（debug 時間跳轉）／§3.5.2（邊界條件：暫停歸零、變速不清空、積欠丟棄）。
//
// 累加器精確毫秒邊界改以手動 FrameScheduler 驅動（見 tests/helpers/manualFrameScheduler.ts
// 檔頭說明：jsdom 下 vi.useFakeTimers() 無法控制 requestAnimationFrame callback 的 `now` 引數）；
// debug 時間跳轉（stepDays）之 setTimeout 鏈則以 vi.useFakeTimers() 驅動（不受上述限制）。

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGameLoopController } from '../../src/app/gameLoop';
import { resetGameStoreForTests, store } from '../../src/app/store';
import type { EventId } from '../../src/core/state/ids';
import { makeLoopTestState } from '../helpers/loopState';
import { createManualScheduler, type ManualScheduler } from '../helpers/manualFrameScheduler';

let manual: ManualScheduler;
let loop: ReturnType<typeof createGameLoopController>;

beforeEach(() => {
  resetGameStoreForTests(makeLoopTestState({ day: 0 }));
  manual = createManualScheduler();
  loop = createGameLoopController(manual.scheduler);
});

afterEach(() => {
  loop.stop();
});

function tickSeq(): number {
  return store.getState().tickSeq;
}

describe('start／stop（§4.2）', () => {
  it('start 排下一幀；重複呼叫為 no-op；stop 取消排程並重置 isRunning', () => {
    expect(loop.isRunning()).toBe(false);
    loop.start();
    expect(loop.isRunning()).toBe(true);
    expect(manual.pendingCount()).toBe(1);

    loop.start(); // no-op：不應重複排程
    expect(manual.pendingCount()).toBe(1);

    loop.stop();
    expect(loop.isRunning()).toBe(false);
    expect(manual.pendingCount()).toBe(0);
  });
});

describe('累加器演算法（§5.1）：×1 下 600ms 累積恰跑 1 tick', () => {
  it('6 幀各 100ms（合計 600ms）在第 6 幀恰好觸發 1 次 tick', () => {
    store.getState().actions.setSpeed('x1'); // 600ms/日
    loop.start();

    manual.fire(0); // 建立 lastFrameTs，不計 dt
    expect(tickSeq()).toBe(0);
    manual.fire(100);
    manual.fire(200);
    manual.fire(300);
    manual.fire(400);
    manual.fire(500);
    expect(tickSeq()).toBe(0); // 累積 500ms，未達 600ms 門檻

    manual.fire(600); // 累積達 600ms
    expect(tickSeq()).toBe(1);
    expect(store.getState().game?.time.day).toBe(1);
  });

  it('×5 下 120ms/日：3 幀各 40ms 恰好觸發 1 次 tick', () => {
    store.getState().actions.setSpeed('x5');
    loop.start();
    manual.fire(0);
    manual.fire(40);
    manual.fire(80);
    expect(tickSeq()).toBe(0);
    manual.fire(120);
    expect(tickSeq()).toBe(1);
  });
});

describe('單幀 dt 夾限與單幀最多 4 tick（§3.5.2／§8-D10：積欠丟棄，時間變慢而非補跑）', () => {
  it('dt=5000ms（分頁切回等長時間停頓）被夾到 250ms，單幀至多 floor(250/dayMs) 個 tick、不死亡螺旋', () => {
    store.getState().actions.setSpeed('x5'); // dayMs = 120
    loop.start();
    manual.fire(0);
    manual.fire(5000); // 原始 dt=5000ms，遠大於 frameDtCapMs=250

    // 250ms 夾限下最多只能跑 floor(250/120)=2 個 tick（遠低於 maxTicksPerFrame=4 的上限），
    // 證明 frameDtCapMs 在 maxTicksPerFrame 介入前已先擋下暴衝、不會補跑 5000ms 累積的 41 個 tick。
    expect(tickSeq()).toBe(2);
    expect(store.getState().game?.time.day).toBe(2);

    // 餘量（250-240=10ms）遠小於 dayMs，下一個小增量幀不會立刻補跑額外 tick。
    manual.fire(5010);
    expect(tickSeq()).toBe(2);
  });

  it('連續多次巨幅 dt 停頓，tick 速率仍被 frameDtCapMs 限制在每幀 ≤2 次（不因重複停頓而愈補愈欠）', () => {
    store.getState().actions.setSpeed('x5');
    loop.start();
    manual.fire(0);
    manual.fire(5000);
    expect(tickSeq()).toBe(2);
    manual.fire(10000); // 再一次巨幅停頓（原始 dt=5000ms，一樣被夾到 250ms）
    expect(tickSeq()).toBe(4); // 每次巨幅停頓最多再補 2 個 tick，累計 4，而非无限增長
  });
});

describe('策略時間凍結（03 §3.7.1 hasBlockingInteraction）：行為等同暫停', () => {
  it('待玩家選擇的歷史事件存在時，累加器歸零、不結算，不會在凍結期間累積 backlog', () => {
    store.getState().actions.setSpeed('x5'); // dayMs = 120
    loop.start();

    const game = store.getState().game;
    if (game === null) throw new Error('test setup: game is null');
    game.events.pendingChoiceEventId = 'evt.test' as EventId;

    manual.fire(0);
    for (let now = 100; now <= 1000; now += 100) {
      manual.fire(now); // 凍結中：即使多幀合計遠超 120ms，累加器每幀皆歸零，不結算
    }
    expect(tickSeq()).toBe(0);

    game.events.pendingChoiceEventId = null; // 解凍
    manual.fire(1010); // 建立新的 lastFrameTs 基準（凍結期間最後一次 fire 已設 lastFrameTs=1000）

    // 解凍後行為如同剛從暫停恢復：僅計入本幀 dt（10ms），未曾因凍結期間的 backlog 而補跑。
    expect(tickSeq()).toBe(0);
    manual.fire(1130); // dt=120，恰好達 x5 門檻
    expect(tickSeq()).toBe(1);
  });
});

describe('requestPause／resume（§3.5.2／§3.5.3）', () => {
  it('暫停後累加器歸零：暫停前的未結算毫秒不會在恢復後延續造成提早補跑', () => {
    store.getState().actions.setSpeed('x1'); // dayMs = 600
    loop.start();
    manual.fire(0);
    manual.fire(200); // acc=200
    manual.fire(400); // acc=400（尚未達 600，未 tick）
    expect(tickSeq()).toBe(0);

    loop.requestPause('user');
    expect(store.getState().session.speed).toBe('paused');
    loop.resume();
    expect(store.getState().session.speed).toBe('x1');

    // 若累加器未歸零（殘留 400），此幀 dt=250 會使 400+250=650 ≥ 600 立即觸發 1 tick；
    // 正確歸零時 0+250=250 < 600，不應觸發。
    manual.fire(650);
    expect(tickSeq()).toBe(0);
  });

  it('requestPause 記錄暫停前檔位；resume 恢復同一檔位', () => {
    store.getState().actions.setSpeed('x5');
    loop.requestPause('windowHidden');
    expect(store.getState().session.lastPauseReason).toBe('windowHidden');
    loop.resume();
    expect(store.getState().session.speed).toBe('x5');
    expect(store.getState().session.lastPauseReason).toBeNull();
  });

  it("setSpeed('paused') 等同 requestPause('user')", () => {
    store.getState().actions.setSpeed('x1');
    loop.setSpeed('paused');
    expect(store.getState().session.speed).toBe('paused');
    expect(store.getState().session.lastPauseReason).toBe('user');
  });
});

describe('變速不清空累加器（§3.5.2）', () => {
  it('x1→x5 切換時保留既有累積毫秒', () => {
    store.getState().actions.setSpeed('x1'); // 600ms/日
    loop.start();
    manual.fire(0);
    manual.fire(100); // acc=100（x1 尚遠不足 600）
    expect(tickSeq()).toBe(0);

    loop.setSpeed('x5'); // 改為 120ms/日，累加器不清空
    manual.fire(140); // dt=40 → acc=140 ≥ 120（x5 門檻），應立即觸發
    expect(tickSeq()).toBe(1);
  });
});

describe('debug 時間跳轉 stepDays（§5.4）', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('跳轉 45 日（chunk=30）：呼叫當下同步跑完第一個 30 日 chunk，其餘經 setTimeout 鏈完成', () => {
    loop.stepDays(45);

    expect(store.getState().game?.time.day).toBe(30); // 第一個 chunk 同步完成
    expect(store.getState().session.debug.jumping).toEqual({ totalDays: 45, doneDays: 30 });
    expect(store.getState().session.speed).toBe('paused');

    vi.runAllTimers(); // 驅動剩餘 setTimeout(chunk, 0) 鏈

    expect(store.getState().game?.time.day).toBe(45);
    expect(store.getState().session.debug.jumping).toBeNull();
  });

  it('n < 1 或非整數：忽略、不進入跳轉狀態', () => {
    loop.stepDays(0);
    expect(store.getState().session.debug.jumping).toBeNull();
    loop.stepDays(1.5);
    expect(store.getState().session.debug.jumping).toBeNull();
  });

  it('跳轉進行中再次呼叫 stepDays：忽略（不重疊啟動）', () => {
    loop.stepDays(60);
    const jumpingAfterFirstCall = store.getState().session.debug.jumping;
    loop.stepDays(10); // 應被忽略
    expect(store.getState().session.debug.jumping).toEqual(jumpingAfterFirstCall);
    vi.runAllTimers();
    expect(store.getState().game?.time.day).toBe(60); // 未被第二次呼叫干擾
  });

  it('跳轉中遇到待選擇歷史事件（hasBlockingInteraction）即中止（§3.9.2 點 d）', () => {
    loop.stepDays(90); // 3 個 chunk
    const game = store.getState().game;
    if (game === null) throw new Error('test setup: game is null');
    // 於第一個 chunk 完成後置入待選擇事件：偵測時機在「每跑完一日」之後（見 gameLoop.ts
    // stepDaysChunk 實作），故下一個 chunk 會先執行 1 日、偵測到凍結才中止（30+1=31）。
    game.events.pendingChoiceEventId = 'evt.test' as EventId;

    vi.runAllTimers();

    expect(store.getState().game?.time.day).toBe(31);
    expect(store.getState().session.debug.jumping).toBeNull();
  });
});
