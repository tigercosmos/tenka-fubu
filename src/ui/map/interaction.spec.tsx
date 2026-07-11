// `useMapEvents`（src/ui/map/interaction.ts）React hook 測試。
// 規格：plan/04-map-and-movement.md §3.12.2「React 以 hook `useMapEvents` 訂閱」；
// 18-roadmap.md M2-17（04-T12 部分）。
//
// 需要 React/jsdom（`renderHook`），故本檔為 `.spec.tsx`（於 ui project 執行，
// `src/ui/**/*.spec.tsx`；純邏輯測試見 tests/ui/interaction.spec.ts，同 MapCanvasHost.spec.tsx 慣例）。

import { describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useMapEvents, type MapEventHandlers } from './interaction';
import type { MapRendererEvent } from './mapViewTypes';

describe('useMapEvents（04 §3.12.2）', () => {
  it('回傳的 callback 在重render間保持穩定參考（useCallback([])）', () => {
    const { result, rerender } = renderHook(
      (handlers: MapEventHandlers) => useMapEvents(handlers),
      {
        initialProps: {},
      },
    );
    const first = result.current;
    rerender({ onEmptyClick: vi.fn() });
    expect(result.current).toBe(first);
  });

  it('nodeHover 事件轉呼叫 onNodeHover（hover 城 tooltip 事件協定）', () => {
    const onNodeHover = vi.fn();
    const { result } = renderHook(() => useMapEvents({ onNodeHover }));
    const event: MapRendererEvent = {
      type: 'nodeHover',
      nodeKind: 'castle',
      id: 'castle.kiyosu',
      screenX: 10,
      screenY: 20,
    };
    result.current(event);
    expect(onNodeHover).toHaveBeenCalledWith(event);
  });

  it('nodeClick 事件轉呼叫 onNodeClick（點城開面板事件協定）', () => {
    const onNodeClick = vi.fn();
    const { result } = renderHook(() => useMapEvents({ onNodeClick }));
    const event: MapRendererEvent = { type: 'nodeClick', nodeKind: 'castle', id: 'castle.kiyosu' };
    result.current(event);
    expect(onNodeClick).toHaveBeenCalledWith(event);
  });

  it('armyClick／emptyClick／rightClick／pathPick 依 type 分派至對應 handler', () => {
    const handlers = {
      onArmyClick: vi.fn(),
      onEmptyClick: vi.fn(),
      onRightClick: vi.fn(),
      onPathPick: vi.fn(),
    };
    const { result } = renderHook(() => useMapEvents(handlers));

    result.current({ type: 'armyClick', id: 'army.000001' });
    expect(handlers.onArmyClick).toHaveBeenCalledWith({ type: 'armyClick', id: 'army.000001' });

    result.current({ type: 'emptyClick' });
    expect(handlers.onEmptyClick).toHaveBeenCalledTimes(1);

    result.current({ type: 'rightClick' });
    expect(handlers.onRightClick).toHaveBeenCalledTimes(1);

    result.current({ type: 'pathPick', nodeId: 'castle.kiyosu' });
    expect(handlers.onPathPick).toHaveBeenCalledWith({ type: 'pathPick', nodeId: 'castle.kiyosu' });
  });

  it('省略的 handler 不拋錯（未提供對應 handler 時無操作）', () => {
    const { result } = renderHook(() => useMapEvents({}));
    expect(() => {
      result.current({ type: 'emptyClick' });
    }).not.toThrow();
  });

  it('handlers 於重render後更新（以 ref 保存最新值，不受 useCallback([]) 影響）', () => {
    const onEmptyClickA = vi.fn();
    const onEmptyClickB = vi.fn();
    const { result, rerender } = renderHook(
      (handlers: MapEventHandlers) => useMapEvents(handlers),
      { initialProps: { onEmptyClick: onEmptyClickA } },
    );
    result.current({ type: 'emptyClick' });
    expect(onEmptyClickA).toHaveBeenCalledTimes(1);

    rerender({ onEmptyClick: onEmptyClickB });
    result.current({ type: 'emptyClick' });
    expect(onEmptyClickB).toHaveBeenCalledTimes(1);
    expect(onEmptyClickA).toHaveBeenCalledTimes(1); // 未再被呼叫
  });
});
