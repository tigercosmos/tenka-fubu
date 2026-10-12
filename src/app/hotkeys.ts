import type { MapAnalysisMode } from './store';

export function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.matches('input, textarea, select') ||
      target.isContentEditable ||
      target.closest('[contenteditable]:not([contenteditable="false"])') !== null)
  );
}

export function isNativeControlTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest(
      'button, summary, a[href], input, textarea, select, [role="button"], [role="link"], [role="slider"], [role="menu"], [role="menuitem"], [role="tab"]',
    ) !== null
  );
}

export function isMapBackgroundTarget(target: EventTarget | null): boolean {
  return (
    target === document.body ||
    (target instanceof HTMLElement &&
      (target.tagName === 'CANVAS' || target.dataset.testid === 'map-canvas-host'))
  );
}

export interface HotkeyContext {
  screen: string;
  typing: boolean;
  nativeControl: boolean;
  mapBackground: boolean;
  hasDialog: boolean;
  hasModal: boolean;
  panelFocused: boolean;
  viewportBlocked: boolean;
}
export type HotkeyAction =
  | { kind: 'blur' | 'escape' | 'pause' | 'reports' | 'home' | 'minimap' | 'debug' }
  | { kind: 'speed'; speed: 'x1' | 'x2' | 'x5' }
  | { kind: 'rail'; index: 1 | 2 | 3 | 4 | 5 | 6 | 7 }
  | { kind: 'theme'; mode: MapAnalysisMode }
  | { kind: 'pan'; x: number; y: number }
  | { kind: 'zoom'; direction: -1 | 1 };

/** Pure routing only; caller owns DOM focus, local battle speed, camera and UI transitions. */
export function classifyHotkey(
  input: Pick<
    KeyboardEvent,
    | 'key'
    | 'ctrlKey'
    | 'metaKey'
    | 'altKey'
    | 'shiftKey'
    | 'repeat'
    | 'defaultPrevented'
    | 'isComposing'
  >,
  context: Readonly<HotkeyContext>,
): HotkeyAction | null {
  if (context.viewportBlocked) return null;
  if (
    input.defaultPrevented ||
    input.isComposing ||
    input.ctrlKey ||
    input.metaKey ||
    context.hasDialog
  )
    return null;
  if (context.typing) return input.key === 'Escape' && !input.repeat ? { kind: 'blur' } : null;
  if (input.key === 'Escape') return !input.repeat ? { kind: 'escape' } : null;
  if (context.hasModal) return null;
  const main = context.screen === 'main';
  const map = main && context.mapBackground && !context.nativeControl && !context.panelFocused;
  const themes: Record<string, MapAnalysisMode> = {
    '1': 'faction',
    '2': 'supply',
    '3': 'roadCapacity',
    '4': 'terrainAdvantage',
    '5': 'castleDefense',
  };
  if (input.altKey)
    return map && !input.repeat && themes[input.key] !== undefined
      ? { kind: 'theme', mode: themes[input.key]! }
      : null;
  if (input.key === 'Tab')
    return map && !input.shiftKey && !input.repeat ? { kind: 'theme', mode: 'faction' } : null;
  if (main && !input.repeat) {
    if (/^F[1-7]$/.test(input.key))
      return { kind: 'rail', index: Number(input.key.slice(1)) as 1 | 2 | 3 | 4 | 5 | 6 | 7 };
    if (input.key.toLowerCase() === 'r') return { kind: 'reports' };
    if (input.key === '`') return { kind: 'debug' };
    if (!context.nativeControl && input.key === 'Home') return { kind: 'home' };
    if (!context.nativeControl && input.key.toLowerCase() === 'm') return { kind: 'minimap' };
  }
  if (map) {
    const directions: Record<string, readonly [number, number]> = {
      w: [0, -1],
      ArrowUp: [0, -1],
      a: [-1, 0],
      ArrowLeft: [-1, 0],
      s: [0, 1],
      ArrowDown: [0, 1],
      d: [1, 0],
      ArrowRight: [1, 0],
    };
    const direction = directions[input.key] ?? directions[input.key.toLowerCase()];
    if (direction !== undefined) return { kind: 'pan', x: direction[0], y: direction[1] };
    if (input.key === '+' || input.key === '=' || input.key === '＋')
      return { kind: 'zoom', direction: 1 };
    if (input.key === '-' || input.key === '−' || input.key === '－')
      return { kind: 'zoom', direction: -1 };
  }
  if (main || context.screen === 'battle') {
    if ((input.key === ' ' || input.key === 'Spacebar') && !context.nativeControl && !input.repeat)
      return { kind: 'pause' };
    const speeds = { '1': 'x1', '2': 'x2', '3': 'x5' } as const;
    if (!input.repeat && input.key in speeds)
      return { kind: 'speed', speed: speeds[input.key as keyof typeof speeds] };
  }
  return null;
}
