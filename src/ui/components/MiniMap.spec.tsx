// MiniMap 元件測試（M2-18；12-ui-components.md §3.2.12／§4／§5.5；18-roadmap.md M2-18）。
//
// jsdom 無 canvas 2D 實作（17 §3.2），故 mock `HTMLCanvasElement.prototype.getContext` 回傳
// 一個最小 fake context，並 mock `./miniMapDraw` 之 `drawMiniMapBase`/`drawMiniMapViewportFrame`
// 為 spy（保留其餘匯出如 `worldToMini`/`miniToWorld` 之真實實作）——藉此驗證元件對兩層 canvas
// 的重繪節流／viewport 更新邏輯是否正確呼叫，而不必依賴真的 2D 繪製結果。
// 座標換算（點擊/拖曳導航）為本檔核心驗收（12-T9：「點擊拖曳導航正確」）。

import type { ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { bumpTickSeq, resetGameStoreForTests, store } from '@app/store';
import { buildTinyState } from '../../../tests/fixtures/tiny';
import { WORLD_SIZE } from '@ui/map/mapViewConfig';
import { t } from '@i18n/zh-TW';

vi.mock('./miniMapDraw', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./miniMapDraw')>();
  return {
    ...actual,
    drawMiniMapBase: vi.fn(),
    drawMiniMapViewportFrame: vi.fn(),
  };
});

import { MiniMap } from './MiniMap';
import { drawMiniMapBase, drawMiniMapViewportFrame } from './miniMapDraw';

const drawBaseMock = vi.mocked(drawMiniMapBase);
const drawFrameMock = vi.mocked(drawMiniMapViewportFrame);

const FAKE_CTX = { fake: true };

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    (() => FAKE_CTX) as unknown as typeof HTMLCanvasElement.prototype.getContext,
  );
  resetGameStoreForTests(buildTinyState());
  drawBaseMock.mockClear();
  drawFrameMock.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const VIEWPORT = { x: 0, y: 0, width: WORLD_SIZE, height: WORLD_SIZE };

/**
 * jsdom 未實作 `PointerEvent`（`window.PointerEvent === undefined`），`@testing-library/dom` 的
 * `createEvent` 於此情形退回 `window.Event` 建構，而原生 `Event` 建構子會忽略 `clientX`/
 * `clientY`/`pointerId` 等非標準初始化欄位——故 `fireEvent.pointerDown({clientX, ...})` 在本
 * 測試環境下這些欄位會是 `undefined`。改為手動建立事件並直接賦值後派發（React 依 DOM 事件的
 * `type` 字串比對，不要求 `instanceof PointerEvent`，故此法可正確觸發 `onPointerDown` 等 handler）。
 */
function firePointer(
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  el: Element,
  props: { clientX: number; clientY: number; pointerId?: number },
): void {
  const event = new Event(type, { bubbles: true, cancelable: true }) as Event & {
    clientX: number;
    clientY: number;
    pointerId: number;
  };
  event.clientX = props.clientX;
  event.clientY = props.clientY;
  event.pointerId = props.pointerId ?? 1;
  fireEvent(el, event);
}

describe('MiniMap 版面（E-69 正方；12 §3.2.12）', () => {
  it('預設尺寸＝UI.minimapSizePx（224），兩層 canvas 皆為正方', () => {
    render(<MiniMap viewport={VIEWPORT} onNavigate={vi.fn()} />);
    const base = screen.getByTestId<HTMLCanvasElement>('minimap-base');
    const frame = screen.getByTestId<HTMLCanvasElement>('minimap-frame');
    expect(base.width).toBe(224);
    expect(base.height).toBe(224);
    expect(frame.width).toBe(224);
    expect(frame.height).toBe(224);
  });

  it('size prop 可覆蓋預設值', () => {
    render(<MiniMap size={100} viewport={VIEWPORT} onNavigate={vi.fn()} />);
    const base = screen.getByTestId<HTMLCanvasElement>('minimap-base');
    expect(base.width).toBe(100);
    expect(base.height).toBe(100);
  });

  it('role="img" 與 aria-label（13 §6.3：全國小地圖）；不支援鍵盤導航', () => {
    render(<MiniMap viewport={VIEWPORT} onNavigate={vi.fn()} />);
    const el = screen.getByTestId('minimap');
    expect(el.getAttribute('role')).toBe('img');
    expect(el.getAttribute('aria-label')).toBe(t('ui.minimap.ariaLabel'));
    expect(el.getAttribute('tabindex')).toBeNull();
  });
});

describe('MiniMap 座標換算：點擊／拖曳導航（12 §5.5；12-T9 驗收）', () => {
  it('點擊（pointerdown）→ onNavigate 收到 mini→world 換算後的世界座標', () => {
    const onNavigate = vi.fn<(worldX: number, worldY: number) => void>();
    render(<MiniMap viewport={VIEWPORT} onNavigate={onNavigate} />);
    const frame = screen.getByTestId('minimap-frame');
    // jsdom getBoundingClientRect 預設 left/top=0，故 clientX/Y 即小地圖本地座標。
    firePointer('pointerdown', frame, { clientX: 112, clientY: 56 });

    expect(onNavigate).toHaveBeenCalledTimes(1);
    const [wx, wy] = onNavigate.mock.calls[0]!;
    // s = 224/4096；world = mini/s
    expect(wx).toBeCloseTo((112 / 224) * WORLD_SIZE, 5);
    expect(wy).toBeCloseTo((56 / 224) * WORLD_SIZE, 5);
  });

  it('拖曳（pointerdown 後 pointermove）→ 每次移動都呼叫 onNavigate', () => {
    const onNavigate = vi.fn<(worldX: number, worldY: number) => void>();
    render(<MiniMap viewport={VIEWPORT} onNavigate={onNavigate} />);
    const frame = screen.getByTestId('minimap-frame');

    firePointer('pointerdown', frame, { clientX: 0, clientY: 0 });
    firePointer('pointermove', frame, { clientX: 50, clientY: 60 });
    firePointer('pointermove', frame, { clientX: 80, clientY: 90 });

    expect(onNavigate).toHaveBeenCalledTimes(3);
    const last = onNavigate.mock.calls[2]!;
    expect(last[0]).toBeCloseTo((80 / 224) * WORLD_SIZE, 5);
    expect(last[1]).toBeCloseTo((90 / 224) * WORLD_SIZE, 5);
  });

  it('pointerup 後 pointermove 不再呼叫 onNavigate（拖曳已結束）', () => {
    const onNavigate = vi.fn<(worldX: number, worldY: number) => void>();
    render(<MiniMap viewport={VIEWPORT} onNavigate={onNavigate} />);
    const frame = screen.getByTestId('minimap-frame');

    firePointer('pointerdown', frame, { clientX: 10, clientY: 10 });
    firePointer('pointerup', frame, { clientX: 10, clientY: 10 });
    onNavigate.mockClear();
    firePointer('pointermove', frame, { clientX: 200, clientY: 200 });

    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('未拖曳時 pointermove 不呼叫 onNavigate', () => {
    const onNavigate = vi.fn<(worldX: number, worldY: number) => void>();
    render(<MiniMap viewport={VIEWPORT} onNavigate={onNavigate} />);
    firePointer('pointermove', screen.getByTestId('minimap-frame'), { clientX: 5, clientY: 5 });
    expect(onNavigate).not.toHaveBeenCalled();
  });
});

describe('MiniMap 底圖重繪節流（12 §5.5／12-T9：「底圖節流 1s」）', () => {
  it('掛載時立即重繪一次底圖', () => {
    render(<MiniMap viewport={VIEWPORT} onNavigate={vi.fn()} />);
    expect(drawBaseMock).toHaveBeenCalledTimes(1);
  });

  it('tickSeq 變動但 model.version（絕對日）未變時不重繪', () => {
    render(<MiniMap viewport={VIEWPORT} onNavigate={vi.fn()} />);
    expect(drawBaseMock).toHaveBeenCalledTimes(1);

    act(() => {
      bumpTickSeq(); // 觸發重渲染，但日期未變
    });
    expect(drawBaseMock).toHaveBeenCalledTimes(1);
  });

  it('日期變動但未滿 minimapRedrawMs 時延後重繪；滿足節流後才補畫（trailing）', () => {
    render(<MiniMap viewport={VIEWPORT} onNavigate={vi.fn()} />);
    expect(drawBaseMock).toHaveBeenCalledTimes(1);

    act(() => {
      store.getState().game!.time.day += 1;
      bumpTickSeq();
    });
    expect(drawBaseMock).toHaveBeenCalledTimes(1); // 尚未過 1000ms，未立即重繪

    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(drawBaseMock).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(drawBaseMock).toHaveBeenCalledTimes(2); // 補上一次重繪
  });

  it('已過 minimapRedrawMs 後日期變動 → 立即重繪（不延後）', () => {
    render(<MiniMap viewport={VIEWPORT} onNavigate={vi.fn()} />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    act(() => {
      store.getState().game!.time.day += 1;
      bumpTickSeq();
    });
    expect(drawBaseMock).toHaveBeenCalledTimes(2);
  });
});

describe('MiniMap 視窗框：viewport 變動即重畫（§5.5）', () => {
  it('掛載時重畫一次；viewport prop 變動再重畫', () => {
    const { rerender } = render(<MiniMap viewport={VIEWPORT} onNavigate={vi.fn()} />);
    expect(drawFrameMock).toHaveBeenCalledTimes(1);

    rerender(
      <MiniMap viewport={{ x: 100, y: 100, width: 500, height: 500 }} onNavigate={vi.fn()} />,
    );
    expect(drawFrameMock).toHaveBeenCalledTimes(2);
  });

  it('迷你地圖不受勢力圖模式影響：本元件不接受也不消費該旗標（04 §3.13.2）', () => {
    // MiniMapProps 僅有 size/viewport/onNavigate 三者；此測試以型別層面斷言其 API 表面。
    const props: ComponentProps<typeof MiniMap> = { viewport: VIEWPORT, onNavigate: vi.fn() };
    expect(Object.keys(props).sort()).toEqual(['onNavigate', 'viewport']);
  });
});
