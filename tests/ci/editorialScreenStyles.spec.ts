import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = (name: string) =>
  readFileSync(new URL(`../../src/ui/screens/${name}.module.css`, import.meta.url), 'utf8');
const owned = [
  'TitleScreen',
  'ScenarioSelect',
  'DaimyoSelect',
  'OfficerList',
  'OfficerDetail',
  'M6Panel',
  'SystemMenu',
  'SaveLoadPanel',
  'SettingsPanel',
  'BattleScreen',
  'EndingScreen',
  'panels/CastlePanel',
  'panels/DistrictPanel',
  'panels/PolicyPanel',
];
const declarations = (source: string, selector: string) => {
  const blocks = [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  return blocks
    .filter((match) =>
      match[1]!
        .split(',')
        .map((s) => s.trim())
        .includes(selector),
    )
    .map((match) => match[2])
    .join('\n');
};

describe('editorial command-desk CSS contracts (not computed browser geometry)', () => {
  it('uses compact corners across all fourteen owned surfaces, without leftover large card radii', () => {
    for (const name of owned)
      expect(css(name), name).not.toMatch(/border-radius:\s*(?:[5-9]|1[0-9])px\b/);
    expect(css('OfficerList')).toContain('white-space: nowrap');
    expect(css('panels/CastlePanel')).toContain('min-height: 40px');
  });

  it.each([
    [
      'SaveLoadPanel',
      '.panel .header',
      '--surface-raised',
      '--text-primary',
      'transparent',
      '--surface-hover',
      '--brand-gold',
    ],
    [
      'SettingsPanel',
      '.header',
      '--surface-command',
      '--text-inverse',
      '--surface-command-raised',
      null,
      '--command-gold',
    ],
  ] as const)(
    'pairs %s actual header role with explicit control paint and contrasting brass focus',
    (name, header, background, ink, controlBackground, hoverBackground, focusInk) => {
      const source = css(name);
      expect(declarations(source, header)).toContain(`background: var(${background})`);
      expect(declarations(source, header)).toContain(`color: var(${ink})`);
      const control = declarations(source, `${header} button`);
      expect(control).toContain(`color: var(${ink})`);
      expect(control).toContain(
        `background: ${controlBackground === 'transparent' ? 'transparent' : `var(${controlBackground})`}`,
      );
      const hover = declarations(source, `${header} button:hover:not(:disabled)`);
      if (hoverBackground !== null) expect(hover).toContain(`background: var(${hoverBackground})`);
      else {
        // Settings deliberately inherits its explicit command-raised control background on hover.
        expect(hover).not.toMatch(/background\s*:/);
        expect(hover).toContain('color: var(--command-gold)');
      }
      expect(declarations(source, `${header} button:focus-visible`)).toContain(
        `outline-color: var(${focusInk})`,
      );
    },
  );

  it('keeps title primary action vermilion on ivory and preserves its contrasting hover text', () => {
    const source = css('TitleScreen');
    expect(declarations(source, '.menu .primary')).toContain('background: var(--brand-red)');
    expect(declarations(source, '.menu .primary')).toContain('color: var(--text-inverse)');
    expect(declarations(source, '.menu .primary:hover:not(:disabled)')).toContain(
      'color: var(--text-inverse)',
    );
    expect(source).toContain('min-height: max(64px, 4rem)');
  });

  it('gives the title footer its own readable paper surface and removes the split on mobile', () => {
    const source = css('TitleScreen');
    expect(declarations(source, '.footer')).toContain('background: var(--surface-panel)');
    expect(declarations(source, '.footer')).toContain('color: var(--text-secondary)');
    const mobile = source.slice(source.indexOf('@media (max-width: 800px)'));
    expect(declarations(mobile, '.screen')).toContain('background: var(--surface-base)');
  });

  it('keeps entry selection responsive with distinct dark detail and light roster roles', () => {
    const source = css('DaimyoSelect');
    expect(declarations(source, '.selection')).toContain('color: var(--text-inverse)');
    expect(declarations(source, '.clan')).toContain('background: var(--surface-panel)');
    expect(declarations(source, ".clan[aria-pressed='true']")).toContain(
      'border-color: var(--brand-red)',
    );
    expect(source).toContain('@media (max-width: 640px)');
    expect(declarations(source, '.start')).toContain('min-height: max(48px, 3rem)');
  });

  it('maintains contrasting battle command controls and independent scrolling sidebars', () => {
    const source = css('BattleScreen');
    expect(declarations(source, '.header')).toContain('color: var(--text-inverse)');
    expect(declarations(source, '.tacticButtons button:not(:disabled)')).toContain(
      'background: var(--surface-command-raised)',
    );
    expect(declarations(source, '.tacticButtons button:hover:not(:disabled)')).toContain(
      'color: var(--text-inverse)',
    );
    expect(source).toContain('min-height: 40px');
    expect(declarations(source, '.logScroll')).toContain('overflow: auto');
  });
});
