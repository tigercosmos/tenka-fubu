import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const main = readFileSync(
  new URL('../../src/ui/screens/MainScreen.module.css', import.meta.url),
  'utf8',
);
const context = readFileSync(
  new URL('../../src/ui/components/ContextPanel/ContextPanel.module.css', import.meta.url),
  'utf8',
);
const resource = readFileSync(
  new URL('../../src/ui/components/ResourceBar/ResourceBar.module.css', import.meta.url),
  'utf8',
);
const mini = readFileSync(
  new URL('../../src/ui/components/MiniMap.module.css', import.meta.url),
  'utf8',
);
const layers = readFileSync(
  new URL('../../src/ui/components/LayerControl.module.css', import.meta.url),
  'utf8',
);

function rule(css: string, selector: string): string {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Missing CSS source rule ${selector}`);
  return css.slice(start, css.indexOf('}', start));
}

describe('atlas HUD source layout contracts, not native geometry or visual approval', () => {
  it('keeps compact rail text at least 12 CSS px and the crest independently tall across supported scales', () => {
    expect(rule(main, '.clanName')).toMatch(/font-size:\s*max\(12px, 0\.75rem\);/);
    expect(rule(main, '.clanName')).toMatch(/line-height:\s*max\(16px, 1rem\);/);
    expect(rule(main, '.rail > button:not(.crest)::after')).toMatch(
      /font-size:\s*max\(12px, var\(--font-size-xs\)\);/,
    );
    expect(rule(main, '.crest svg')).toMatch(/width:\s*max\(32px, 2rem\);/);
    expect(rule(main, '.rail > button.crest')).toMatch(/min-height:\s*max\(72px, 4\.5rem\);/);
    for (const scale of [0.8, 1, 1.5]) {
      const rem = 16 * scale;
      const interiorWidth = 4 * rem - 0.5 * rem - 2;
      const contentsHeight = Math.max(32, 2 * rem) + Math.max(16, rem) + 1.125 * rem + 1;
      expect(interiorWidth).toBeGreaterThanOrEqual(Math.max(32, 2 * rem));
      expect(Math.max(72, 4.5 * rem)).toBeGreaterThanOrEqual(contentsHeight);
    }
  });
  it('keeps compact resource labels readable within the unchanged physical HUD height', () => {
    const wide = resource.slice(0, resource.indexOf('@media (max-width: 1440px)'));
    expect(rule(wide, '.itemHeading')).toMatch(/font-size:\s*max\(12px, var\(--font-size-sm\)\);/);
    expect(rule(resource, '.foodCoverage')).toMatch(
      /font-size:\s*max\(12px, var\(--font-size-xs\)\);/,
    );
    expect(rule(resource, '.root > time')).toMatch(
      /font-size:\s*max\(12px, var\(--font-size-sm\)\);/,
    );
    const narrow = resource.slice(resource.indexOf('@media (max-width: 1440px)'));
    expect(rule(narrow, '.itemHeading')).toMatch(
      /font-size:\s*max\(12px, var\(--font-size-xs\)\);/,
    );
    expect(rule(narrow, '.itemHeading')).toMatch(/line-height:\s*1;/);
    expect(rule(narrow, '.foodValues')).toMatch(/line-height:\s*1;/);
    expect(rule(narrow, '.foodCoverage')).toMatch(/line-height:\s*1;/);
    for (const scale of [0.8, 1, 1.5]) {
      const rem = 16 * scale;
      const foodHeight = Math.max(12, 0.75 * rem) * 2 + rem;
      expect(foodHeight).toBeLessThanOrEqual(Math.max(40, 3 * rem) - 2);
    }
  });
  it('source contract: resources alone scroll and fixed commands fit a conservative 1280px budget at both supported scale extremes', () => {
    expect(rule(main, '.resourceViewport')).toMatch(/flex:\s*1 1 0;/);
    expect(rule(main, '.resourceViewport')).toMatch(/min-width:\s*0;/);
    expect(rule(main, '.resourceViewport')).toMatch(/overflow-x:\s*auto;/);
    expect(rule(main, '.commandBar')).toMatch(/flex:\s*0 0 auto;/);
    expect(rule(main, '.commandBar')).toMatch(/padding:\s*0 0\.625rem;/);
    expect(rule(main, '.commandBar button')).toMatch(/min-width:\s*32px;/);
    expect(rule(main, '.commandBar button')).toMatch(/min-height:\s*32px;/);
    expect(rule(main, ".commandBar > [role='status']")).toMatch(/max-width:\s*16rem;/);
    expect(rule(main, ".commandBar > [role='status']")).toMatch(/text-overflow:\s*ellipsis;/);
    for (const scale of [0.8, 1.5]) {
      const rem = 16 * scale;
      const height = Math.max(40, 3 * rem);
      // SpeedControl source: four 2rem buttons with 32px floor, 4px padding, 2px border.
      // Budget six buttons (all four speeds, system, optional active-Taimei), warning24px,
      // five gaps, and the declared 16rem maximum for any pending-count text.
      const buttons = 6 * Math.max(32, 2 * rem),
        speedFrame = 6;
      const pendingText = 16 * rem;
      const cluster = buttons + speedFrame + 24 + 5 * 0.5 * rem + 1.25 * rem + pendingText + 1;
      expect(cluster).toBeLessThan(1280 - 1.5 * rem - 2);
      expect(height - 2).toBeGreaterThanOrEqual(Math.max(32, 2 * rem) + speedFrame);
      expect(0.5 * rem + height).toBeLessThan(3.75 * rem); // unchanged report top
    }
  });
  it('floats the HUD with a physical height floor while keeping resources independently reachable at narrow widths', () => {
    const hud = rule(main, '.hud');
    expect(hud).toMatch(/inset:\s*0\.5rem 0\.75rem auto;/);
    expect(hud).toMatch(/height:\s*max\(40px, 3rem\);/);
    expect(hud).toMatch(/max-width:\s*calc\(100vw - 1\.5rem\);/);
    expect(hud).not.toMatch(/overflow-x:\s*auto;/);
    expect(rule(main, '.resourceViewport > *')).toMatch(/flex:\s*0 0 auto;/);
    // At 1024 CSS px / maximum supported scale, the declared frame remains
    // inside the viewport; overflowing content scrolls rather than losing ports.
    expect(1024 - 1.5 * 16 * 1.5).toBeGreaterThan(0);
    expect(0.5 + 3).toBeLessThan(3.75); // Existing panel/report top, in rem.
  });

  it('keeps dock labels, vertical reachability and physical button floors', () => {
    expect(rule(main, '.rail > button:not(.crest)::after')).toMatch(
      /content:\s*attr\(aria-label\);/,
    );
    expect(rule(main, '.rail')).toMatch(/overflow-y:\s*auto;/);
    expect(rule(main, '.rail')).toMatch(/max-height:\s*calc\(100dvh - 4\.75rem\);/);
    expect(rule(main, '.rail > button')).toMatch(/min-width:\s*32px;/);
    expect(rule(main, '.rail > button')).toMatch(/min-height:\s*32px;/);
    for (const selector of ['.root summary', '.opacity input'])
      expect(rule(layers, selector)).toMatch(/min-height:\s*max\(32px, 2rem\);/);
    expect(Math.max(32, 2 * 16 * 0.8)).toBe(32);
  });

  it('uses inverse command titles and readable ivory facts without changing visibility or minimap coordinates', () => {
    expect(rule(resource, '.root')).toMatch(/color:\s*var\(--text-inverse\);/);
    expect(rule(resource, '.foodCoverage')).toMatch(/color:\s*var\(--command-muted\);/);
    expect(rule(context, '.root > section > header')).toMatch(/color:\s*var\(--text-inverse\);/);
    expect(rule(context, '.root > section > header')).toMatch(
      /background:\s*var\(--surface-command\);/,
    );
    expect(rule(context, '.facts')).toMatch(/color:\s*var\(--text-primary\);/);
    expect(rule(context, '.root > section')).toMatch(/background:\s*var\(--surface-base\);/);
    expect(rule(context, '.root.open')).toMatch(/pointer-events:\s*auto;/);
    // Art Bible9.4 explicitly changes the material, not geometry or reachability.
    expect(rule(mini, '.frame')).toMatch(/background:\s*var\(--map-sea\);/);
    expect(rule(mini, '.frame')).not.toMatch(/\b(?:position|width|height|transform|padding)\s*:/);
    expect(rule(mini, '.frame::after')).toMatch(/pointer-events:\s*none;/);
    expect(rule(mini, '.frame::after')).toMatch(/inset:\s*0;/);
  });

  it('separates ink command surfaces from ivory map facts with restrained corners and active accents', () => {
    for (const selector of ['.hud', '.rail']) {
      expect(rule(main, selector)).toMatch(/background:\s*var\(--surface-command\);/);
      expect(rule(main, selector)).not.toMatch(/background-image\s*:|linear-gradient\(/);
      expect(rule(main, selector)).toMatch(/color:\s*var\(--text-inverse\);/);
      expect(rule(main, selector)).toMatch(/border-radius:\s*2px;/);
    }
    expect(rule(main, ".rail > button[aria-pressed='true']:hover:not(:disabled)")).toMatch(
      /background:\s*var\(--surface-command-raised\);/,
    );
    expect(rule(main, ".rail > button[aria-pressed='true']:hover:not(:disabled)")).toMatch(
      /box-shadow:\s*inset 3px 0 var\(--brand-red\);/,
    );
    expect(main).toMatch(
      /\.rail > button\[aria-pressed='true'\],\s*\.rail > button\[aria-pressed='true'\]:hover:not\(:disabled\)\s*\{/,
    );
    expect(rule(resource, '.foodCoverage .foodWarning')).toMatch(/text-decoration:\s*underline;/);
    expect(rule(layers, '.modes label')).toMatch(/min-height:\s*max\(32px, 2rem\);/);
    expect(rule(context, '.root > section')).toMatch(/border-radius:\s*2px;/);
    expect(rule(mini, '.frame')).toMatch(/border-radius:\s*2px;/);
  });
});
