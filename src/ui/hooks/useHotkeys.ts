// 鍵盤快捷鍵（空白鍵暫停⇄繼續、1/2/3 變速；反引號開除錯面板留待 M1-22）。
// 規格：plan/01-architecture.md §3.3、§6.3（互動細節）。M1-16（01-A7）實作空白鍵／數字鍵；
// 反引號（除錯面板）以 `onToggleDebugPanel` 參數預留擴充點，M1-22（01-A11）掛上時不必修改本檔簽章。

import { useEffect } from 'react';
import { store } from '@app/store';
import type { GameLoopController } from '@app/gameLoop';
import type { MapAnalysisMode } from '@app/store';
import { uiStore } from './uiStore';

/** 輸入框／可編輯元素聚焦時停用快捷鍵（01 §6.3）。 */
function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === 'INPUT' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable ||
      target.closest('[contenteditable="true"]') !== null)
  );
}

/**
 * 全域鍵盤快捷鍵（01 §6.3）：
 * - 空白鍵：暫停⇄繼續（`resume()` / `requestPause('user')`）。
 * - 數字鍵 1／2／3：切換 ×1／×2／×5。
 * - 反引號｀：呼叫 `onToggleDebugPanel`（僅 debug 模式下由呼叫端傳入；未傳入則不動作）。
 */
export function useHotkeys(loop: GameLoopController, onToggleDebugPanel?: () => void): void {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (isTypingTarget(e.target)) return;
      if (e.ctrlKey || e.metaKey) return;
      const ui = uiStore.getState();
      const mapTarget =
        e.target === document.body ||
        (e.target instanceof HTMLElement &&
          (e.target.tagName === 'CANVAS' || e.target.dataset.testid === 'map-canvas-host'));
      const themeKeys: Record<string, MapAnalysisMode> = {
        '1': 'faction',
        '2': 'supply',
        '3': 'roadCapacity',
        '4': 'terrainAdvantage',
        '5': 'castleDefense',
      };
      const theme =
        e.key === 'Tab' && !e.shiftKey && !e.altKey && mapTarget
          ? 'faction'
          : e.altKey
            ? themeKeys[e.key]
            : undefined;
      if (theme !== undefined) {
        if (ui.screen !== 'main' || ui.modal !== null || ui.panelStack.length > 0) return;
        e.preventDefault();
        if (!e.repeat) ui.actions.setAnalysisMode(ui.analysisMode === theme ? 'none' : theme);
        return;
      }
      if (e.altKey) return;
      switch (e.key) {
        case ' ':
        case 'Spacebar': {
          if (
            e.target instanceof HTMLElement &&
            e.target.closest('button, summary, a[href], [role="button"], [role="link"]') !== null
          )
            return;
          e.preventDefault();
          if (store.getState().session.speed === 'paused') {
            loop.resume();
          } else {
            loop.requestPause('user');
          }
          break;
        }
        case '1':
          loop.setSpeed('x1');
          break;
        case '2':
          loop.setSpeed('x2');
          break;
        case '3':
          loop.setSpeed('x5');
          break;
        case '`':
          onToggleDebugPanel?.();
          break;
        default:
          break;
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [loop, onToggleDebugPanel]);
}
