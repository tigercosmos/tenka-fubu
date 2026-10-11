import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { UI_THEME } from '../../src/ui/styles/tokens';

const componentCss = (name: string) =>
  readFileSync(new URL(`../../src/ui/components/${name}.module.css`, import.meta.url), 'utf8');

describe('command desk design source contracts (not rendered visual approval)', () => {
  it('defines complementary ink command surfaces and paper information surfaces', () => {
    expect(UI_THEME['--surface-command']).toBe('#17252c');
    expect(UI_THEME['--surface-panel']).toBe('#fbf8f0');
    expect(UI_THEME['--brand-red']).toBe('#a63a32');
    expect(UI_THEME['--radius-panel']).toBe('4px');
    expect(UI_THEME['--radius-control']).toBe('3px');
  });

  it('uses the same vermilion selection hierarchy in tables, cards and tabs', () => {
    for (const name of [
      'DataTable/DataTable',
      'OfficerCard/OfficerCard',
      'CastleListItem/CastleListItem',
    ]) {
      expect(componentCss(name)).toMatch(/inset 3px 0 var\(--brand-red\)/);
    }
    const tabs = componentCss('TabView/TabView');
    expect(tabs).toMatch(/overflow-x:\s*auto/);
    expect(tabs).toMatch(/flex-shrink:\s*0/);
    expect(tabs).toMatch(/inset 0 -3px var\(--brand-red\)/);
  });

  it('keeps command headers legible above paper content and distinguishes actions from neutral controls', () => {
    const panel = componentCss('Panel/Panel');
    const dialog = componentCss('Dialog/Dialog');
    for (const header of [
      panel.match(/\.header\s*\{([^}]+)\}/)?.[1],
      dialog.match(/\.dialog header\s*\{([^}]+)\}/)?.[1],
    ]) {
      expect(header).toBeDefined();
      expect(header).toMatch(/background:\s*var\(--surface-command\)/);
      expect(header).toMatch(/color:\s*var\(--text-inverse\)/);
      expect(header).toMatch(/border-top:\s*2px solid var\(--command-gold\)/);
    }
    expect(panel.match(/\.panel\s*\{([^}]+)\}/)?.[1]).toMatch(
      /background-color:\s*var\(--surface-panel\)/,
    );
    const dialogBody = dialog.match(/\.dialog\s*\{([^}]+)\}/)?.[1];
    expect(dialogBody).toMatch(/background:\s*var\(--surface-panel\)/);
    expect(dialogBody).toMatch(/color:\s*var\(--text-primary\)/);
    expect(componentCss('CommandAction')).toMatch(/background: var\(--brand-red\)/);
    expect(componentCss('CommandAction')).toMatch(/min-height: 32px/);
  });
});
