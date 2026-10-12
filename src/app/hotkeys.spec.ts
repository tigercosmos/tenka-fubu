import { describe, expect, it } from 'vitest';
import {
  classifyHotkey,
  isTypingTarget,
  isNativeControlTarget,
  type HotkeyContext,
} from './hotkeys';

const main: HotkeyContext = {
  screen: 'main',
  typing: false,
  nativeControl: false,
  mapBackground: true,
  hasDialog: false,
  hasModal: false,
  panelFocused: false,
  viewportBlocked: false,
};
function route(
  key: string,
  context: Partial<HotkeyContext> = {},
  modifiers: KeyboardEventInit = {},
) {
  return classifyHotkey(new KeyboardEvent('keydown', { key, ...modifiers }), {
    ...main,
    ...context,
  });
}
describe('canonical context-aware hotkey router', () => {
  it('routes all seven rail targets, reports, home and minimap without F5 quicksave', () => {
    for (let index = 1; index <= 7; index++)
      expect(route(`F${index}`)).toEqual({ kind: 'rail', index });
    expect(route('r')).toEqual({ kind: 'reports' });
    expect(route('Home')).toEqual({ kind: 'home' });
    expect(route('M')).toEqual({ kind: 'minimap' });
    expect(route('F9')).toBeNull();
    expect(route('s', {}, { ctrlKey: true })).toBeNull();
    expect(route('Enter')).toBeNull(); // Dialog owns explicit primary semantics.
    expect(route('w', {}, { isComposing: true })).toBeNull();
  });
  it('routes canonical camera directions and zoom only on the map background', () => {
    for (const [key, x, y] of [
      ['w', 0, -1],
      ['ArrowUp', 0, -1],
      ['a', -1, 0],
      ['ArrowLeft', -1, 0],
      ['s', 0, 1],
      ['ArrowDown', 0, 1],
      ['d', 1, 0],
      ['ArrowRight', 1, 0],
    ] as const)
      expect(route(key)).toEqual({ kind: 'pan', x, y });
    expect(route('+')).toEqual({ kind: 'zoom', direction: 1 });
    expect(route('-')).toEqual({ kind: 'zoom', direction: -1 });
    for (const context of [
      { screen: 'title' },
      { screen: 'battle' },
      { typing: true },
      { nativeControl: true },
      { panelFocused: true },
      { viewportBlocked: true },
      { hasModal: true },
      { hasDialog: true },
      { mapBackground: false },
    ]) {
      for (const key of ['w', 'ArrowDown', '+', '-', 'Tab']) expect(route(key, context)).toBeNull();
    }
    for (const context of [
      { panelFocused: true, mapBackground: false },
      { mapBackground: false },
    ]) {
      expect(route('Home', context)).toEqual({ kind: 'home' });
      expect(route('m', context)).toEqual({ kind: 'minimap' });
    }
    for (const context of [
      { screen: 'title' },
      { screen: 'battle' },
      { typing: true },
      { nativeControl: true },
      { viewportBlocked: true },
      { hasModal: true },
      { hasDialog: true },
    ]) {
      expect(route('Home', context)).toBeNull();
      expect(route('m', context)).toBeNull();
    }
  });
  it('preserves native controls, typing, modifiers, repeat and dialog priority', () => {
    expect(route('Escape', { typing: true })).toEqual({ kind: 'blur' });
    expect(route('Escape', { hasModal: true })).toEqual({ kind: 'escape' });
    expect(route('Tab', {}, { shiftKey: true })).toBeNull();
    expect(route(' ', { nativeControl: true })).toBeNull();
    for (const key of [' ', '1', 'r', 'F5', 'Escape', 'Home', 'm']) {
      expect(route(key, { hasDialog: true })).toBeNull();
      expect(route(key, {}, { repeat: true })).toBeNull();
    }
    for (const key of ['1', '2', '3']) {
      expect(route(key, { screen: 'battle' })?.kind).toBe('speed');
      expect(route(key, { screen: 'title' })).toBeNull();
    }
    expect(route('1', {}, { altKey: true })).toEqual({ kind: 'theme', mode: 'faction' });
    expect(route('5', {}, { altKey: true })).toEqual({ kind: 'theme', mode: 'castleDefense' });
    expect(route('1', { nativeControl: true }, { altKey: true })).toBeNull();
  });
  it('recognizes select, nested editable content, native slider/menu descendants', () => {
    expect(isTypingTarget(document.createElement('select'))).toBe(true);
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    const child = document.createElement('span');
    editor.append(child);
    expect(isTypingTarget(child)).toBe(true);
    for (const role of ['slider', 'menu', 'menuitem', 'button']) {
      const control = document.createElement('div');
      control.setAttribute('role', role);
      control.append(child);
      expect(isNativeControlTarget(child)).toBe(true);
    }
  });
});
