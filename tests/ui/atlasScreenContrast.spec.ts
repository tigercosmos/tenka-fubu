import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const screenCss = (name: string) =>
  readFileSync(new URL(`../../src/ui/screens/${name}.module.css`, import.meta.url), 'utf8');

it('source contract: event heading matches the shared command-ink dialog header', () => {
  const dialog = readFileSync(
    new URL('../../src/ui/components/Dialog/Dialog.module.css', import.meta.url),
    'utf8',
  );
  const header = dialog.match(/\.dialog header\s*\{([^}]+)\}/)?.[1];
  expect(header).toMatch(/background:\s*var\(--surface-command\)/);
  expect(header).toMatch(/color:\s*var\(--text-inverse\)/);
  const heading = screenCss('EventModal').match(/> header h2\s*\{([^}]+)\}/)?.[1];
  expect(heading).toBeDefined();
  expect(heading).toMatch(/color:\s*var\(--text-inverse\)/);
  expect(heading).not.toContain('--text-primary');
});

it('source contract: editorial primary and selection colors use the shared vermilion token', () => {
  const primary = screenCss('TitleScreen').match(/\.menu \.primary\s*\{([^}]+)\}/)?.[1];
  expect(primary).toMatch(/background:\s*var\(--brand-red\)/);
  const selected = screenCss('DaimyoSelect').match(
    /\.clan\[aria-pressed='true'\]\s*\{([^}]+)\}/,
  )?.[1];
  expect(selected).toMatch(/border-color:\s*var\(--brand-red\)/);
});
