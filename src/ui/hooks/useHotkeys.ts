import { useEffect, useRef } from 'react';
import { store } from '@app/store';
import type { GameLoopController } from '@app/gameLoop';
import {
  classifyHotkey,
  isMapBackgroundTarget,
  isNativeControlTarget,
  isTypingTarget,
} from '@app/hotkeys';
import { uiStore } from './uiStore';
import { useViewportBlocked } from '@ui/viewport';

export interface MainHotkeyHandlers {
  openDomestic?: () => void;
  openMarch?: () => void;
  focusHome?: () => void;
  toggleMiniMap?: () => void;
  pan?: (x: number, y: number) => void;
  zoom?: (direction: -1 | 1) => void;
}

/** Canonical11 routing; callbacks only affect UI/camera, never core or its command queue. */
export function useHotkeys(
  loop: GameLoopController,
  onToggleDebugPanel?: () => void,
  handlers: MainHotkeyHandlers = {},
): void {
  const viewportBlocked = useViewportBlocked();
  const callbacks = useRef(handlers);
  callbacks.current = handlers;
  useEffect(() => {
    const held = new Map<string, { x: number; y: number }>();
    let frame: number | null = null;
    const clearHeld = () => {
      held.clear();
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    };
    const canPan = () => {
      const ui = uiStore.getState();
      return (
        ui.screen === 'main' &&
        !viewportBlocked &&
        !store.getState().session.viewportBlocked &&
        ui.modal === null &&
        document.querySelector('[data-ui-dialog]') === null &&
        isMapBackgroundTarget(document.activeElement)
      );
    };
    const panFrame = () => {
      frame = null;
      if (!canPan()) {
        clearHeld();
        return;
      }
      let x = 0;
      let y = 0;
      for (const direction of held.values()) {
        x += direction.x;
        y += direction.y;
      }
      if (held.size > 0) {
        callbacks.current.pan?.(Math.sign(x), Math.sign(y));
        frame = requestAnimationFrame(panFrame);
      }
    };
    function onKeyDown(e: KeyboardEvent): void {
      const target = e.target instanceof HTMLElement ? e.target : document.activeElement;
      const ui = uiStore.getState();
      const action = classifyHotkey(e, {
        screen: ui.screen,
        typing: isTypingTarget(target),
        nativeControl: isNativeControlTarget(target),
        mapBackground: isMapBackgroundTarget(target),
        hasDialog: document.querySelector('[data-ui-dialog]') !== null,
        hasModal: ui.modal !== null,
        // Open panels do not disable a background map; focused panel content does.
        panelFocused: ui.panelStack.length > 0 && !isMapBackgroundTarget(target),
        viewportBlocked: viewportBlocked || store.getState().session.viewportBlocked,
      });
      if (action === null) {
        // Held F5 must not fall through to browser reload after its initial policy action.
        if (
          e.repeat &&
          /^F[1-7]$/.test(e.key) &&
          ui.screen === 'main' &&
          !viewportBlocked &&
          !store.getState().session.viewportBlocked &&
          !e.ctrlKey &&
          !e.metaKey &&
          !e.altKey &&
          !e.isComposing &&
          !isTypingTarget(target) &&
          document.querySelector('[data-ui-dialog]') === null &&
          ui.modal === null
        )
          e.preventDefault();
        return;
      }
      // March target-picking owns Escape back to composition.
      if (action.kind === 'escape' && ui.marchDraft?.phase === 'pickTarget') return;
      e.preventDefault();
      switch (action.kind) {
        case 'blur':
          if (target instanceof HTMLElement) target.blur();
          break;
        case 'escape':
          clearHeld();
          ui.actions.onEsc();
          break;
        case 'pause':
          if (store.getState().session.speed === 'paused') loop.resume();
          else loop.requestPause('user');
          break;
        case 'speed':
          loop.setSpeed(action.speed);
          break;
        case 'reports':
          clearHeld();
          ui.actions.openPanel('reports');
          break;
        case 'debug':
          onToggleDebugPanel?.();
          break;
        case 'home':
          callbacks.current.focusHome?.();
          break;
        case 'minimap':
          callbacks.current.toggleMiniMap?.();
          break;
        case 'zoom':
          callbacks.current.zoom?.(action.direction);
          break;
        case 'pan':
          if (!e.repeat && !held.has(e.key.toLowerCase())) {
            held.set(e.key.toLowerCase(), action);
            callbacks.current.pan?.(action.x, action.y);
            if (frame === null) frame = requestAnimationFrame(panFrame);
          }
          break;
        case 'theme':
          ui.actions.setAnalysisMode(ui.analysisMode === action.mode ? 'none' : action.mode);
          break;
        case 'rail': {
          clearHeld();
          if (action.index === 1) callbacks.current.openDomestic?.();
          else if (action.index === 2) callbacks.current.openMarch?.();
          else {
            const panels = {
              3: 'diplomacy',
              4: 'officers',
              5: 'policy',
              6: 'corps',
              7: 'taimei',
            } as const;
            ui.actions.openPanel(panels[action.index]);
          }
          break;
        }
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      held.delete(e.key.toLowerCase());
      if (held.size === 0) clearHeld();
    };
    const onFocus = () => {
      if (!canPan()) clearHeld();
    };
    const onVisibility = () => {
      if (document.hidden) clearHeld();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearHeld);
    document.addEventListener('focusin', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      clearHeld();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearHeld);
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [loop, onToggleDebugPanel, viewportBlocked]);
}
