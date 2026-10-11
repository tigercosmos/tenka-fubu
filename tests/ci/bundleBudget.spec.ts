import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { BUNDLE_LIMITS, checkBundleBudget, SCENARIO_ENTRY } from '../../tools/ci/bundle-budget';

const temporary: string[] = [];
afterEach(() => {
  for (const directory of temporary.splice(0)) rmSync(directory, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'tenka-bundle-budget-'));
  temporary.push(root);
  mkdirSync(path.join(root, '.vite'));
  mkdirSync(path.join(root, 'assets'));
  mkdirSync(path.join(root, 'fonts'));
  const manifest: Record<string, Record<string, unknown>> = {
    'index.html': {
      file: 'assets/main.js',
      isEntry: true,
      imports: ['shared'],
      dynamicImports: [SCENARIO_ENTRY, 'lazy'],
    },
    shared: { file: 'assets/shared.js', imports: ['cycle'] },
    cycle: { file: 'assets/shared.js', imports: ['shared'] },
    [SCENARIO_ENTRY]: {
      file: 'assets/scenario.js',
      isDynamicEntry: true,
      imports: ['shared', 'data'],
      dynamicImports: ['lazy'],
    },
    data: { file: 'assets/data.js' },
    lazy: { file: 'assets/lazy.js', isDynamicEntry: true },
  };
  for (const name of ['main', 'shared', 'scenario', 'data', 'lazy'])
    writeFileSync(path.join(root, 'assets', `${name}.js`), `/* ${name} */`);
  writeFileSync(path.join(root, 'fonts/noto-serif-tc-subset.woff2'), Buffer.alloc(20));
  const save = () =>
    writeFileSync(path.join(root, '.vite/manifest.json'), JSON.stringify(manifest));
  save();
  return { root, manifest, save };
}

describe('static production bundle budgets', () => {
  it('uses canonical KiB limits', () => {
    expect(BUNDLE_LIMITS).toEqual({ initial: 819200, scenario: 1228800, font: 2097152 });
  });
  it('counts full static closures with cycles and file deduplication, excluding nested dynamics', () => {
    const { root } = fixture();
    const report = checkBundleBudget(root);
    expect(report.initial.files).toEqual(['assets/main.js', 'assets/shared.js']);
    expect(report.scenario.files).toEqual(['assets/data.js', 'assets/scenario.js']);
    expect(report.initial.bytes).toBe(
      gzipSync('/* main */').length + gzipSync('/* shared */').length,
    );
    expect(report.scenario.bytes).toBe(
      gzipSync('/* data */').length + gzipSync('/* scenario */').length,
    );
    expect(report.font.bytes).toBe(20);
    expect(report.initial.sizes[0]).toEqual({
      file: 'assets/main.js',
      rawBytes: 10,
      gzipBytes: gzipSync('/* main */').length,
    });
    expect(report.limits).toEqual(BUNDLE_LIMITS);
    expect(report.passed).toBe(true);
  });
  it('includes every initial entry and ignores non-JS payload sizes', () => {
    const { root, manifest, save } = fixture();
    manifest.other = { file: 'assets/other.js', isEntry: true, imports: ['style'] };
    manifest.style = { file: 'assets/style.css' };
    writeFileSync(path.join(root, 'assets/other.js'), 'other');
    writeFileSync(path.join(root, 'assets/style.css'), 'style');
    save();
    expect(checkBundleBudget(root).initial.files).toEqual([
      'assets/main.js',
      'assets/other.js',
      'assets/shared.js',
    ]);
  });
  it('accepts exact size limits and rejects each independent excess', () => {
    const { root } = fixture();
    const report = checkBundleBudget(root);
    const limits = {
      initial: report.initial.bytes,
      scenario: report.scenario.bytes,
      font: report.font.bytes,
    };
    expect(checkBundleBudget(root, limits).passed).toBe(true);
    for (const key of ['initial', 'scenario', 'font'] as const)
      expect(checkBundleBudget(root, { ...limits, [key]: limits[key] - 1 }).passed).toBe(false);
  });
  it.each([NaN, Infinity, -1])('rejects invalid limit %s', (initial) => {
    const { root } = fixture();
    expect(() => checkBundleBudget(root, { ...BUNDLE_LIMITS, initial })).toThrow(
      'Invalid bundle limit',
    );
  });
  it.each(['missing', 'not-entry'])('rejects %s index.html even with another entry', (kind) => {
    const { root, manifest, save } = fixture();
    manifest.other = { file: 'assets/main.js', isEntry: true, dynamicImports: [SCENARIO_ENTRY] };
    if (kind === 'missing') delete manifest['index.html'];
    else manifest['index.html']!.isEntry = false;
    save();
    expect(() => checkBundleBudget(root)).toThrow('Missing initial index.html');
  });
  it.each(['missing', 'not-dynamic', 'eager', 'unreachable'])(
    'rejects %s scenario entry',
    (kind) => {
      const { root, manifest, save } = fixture();
      if (kind === 'missing') {
        delete manifest[SCENARIO_ENTRY];
        manifest['index.html']!.dynamicImports = ['lazy'];
      }
      if (kind === 'not-dynamic') manifest[SCENARIO_ENTRY]!.isDynamicEntry = false;
      if (kind === 'eager') manifest['index.html']!.imports = [SCENARIO_ENTRY];
      if (kind === 'unreachable') manifest['index.html']!.dynamicImports = ['lazy'];
      save();
      expect(() => checkBundleBudget(root)).toThrow(/s1560/);
    },
  );
  it.each([
    '../outside.js',
    '/outside.js',
    'assets/../main.js',
    'C:/outside.js',
    'assets\\main.js',
    'assets//main.js',
  ])('rejects unsafe emitted path %s', (file) => {
    const { root, manifest, save } = fixture();
    manifest.lazy!.file = file;
    save();
    expect(() => checkBundleBudget(root)).toThrow('Unsafe bundle path');
  });
  it.each(['chunk', 'font', 'manifest'])('rejects escaped %s symlinks', (kind) => {
    const { root } = fixture();
    const outside = mkdtempSync(path.join(tmpdir(), 'tenka-bundle-outside-'));
    temporary.push(outside);
    const target = path.join(outside, 'payload');
    writeFileSync(target, '{}');
    const relative =
      kind === 'chunk'
        ? 'assets/lazy.js'
        : kind === 'font'
          ? 'fonts/noto-serif-tc-subset.woff2'
          : '.vite/manifest.json';
    rmSync(path.join(root, relative));
    symlinkSync(target, path.join(root, relative));
    expect(() => checkBundleBudget(root)).toThrow('Escaped bundle path');
  });
  it('rejects directory symlinks escaping the output tree', () => {
    const { root } = fixture();
    const outside = mkdtempSync(path.join(tmpdir(), 'tenka-bundle-outside-'));
    temporary.push(outside);
    writeFileSync(path.join(outside, 'noto-serif-tc-subset.woff2'), 'outside');
    rmSync(path.join(root, 'fonts'), { recursive: true });
    symlinkSync(outside, path.join(root, 'fonts'), 'dir');
    expect(() => checkBundleBudget(root)).toThrow('Escaped bundle path');
  });
  it('rejects a non-JavaScript application entry', () => {
    const { root, manifest, save } = fixture();
    writeFileSync(path.join(root, 'assets/style.css'), 'style');
    manifest['index.html']!.file = 'assets/style.css';
    save();
    expect(() => checkBundleBudget(root)).toThrow('Initial index.html entry is not JavaScript');
  });
  it('rejects malformed manifest, missing imports, absent files and absent entry', () => {
    const { root, manifest, save } = fixture();
    manifest.lazy!.imports = [42];
    save();
    expect(() => checkBundleBudget(root)).toThrow('Invalid imports');
    manifest.lazy!.imports = ['absent'];
    save();
    expect(() => checkBundleBudget(root)).toThrow('Missing manifest dependency');
    manifest.lazy!.imports = [];
    manifest['index.html']!.isEntry = false;
    save();
    expect(() => checkBundleBudget(root)).toThrow('Missing initial');
    manifest['index.html']!.isEntry = true;
    save();
    rmSync(path.join(root, 'assets/lazy.js'));
    expect(() => checkBundleBudget(root)).toThrow();
    writeFileSync(path.join(root, '.vite/manifest.json'), '[]');
    expect(() => checkBundleBudget(root)).toThrow('Invalid Vite manifest');
  });
  it('can be imported without running CLI or changing the process exit code', () => {
    expect(process.exitCode).toBeUndefined();
    expect(checkBundleBudget).toBeTypeOf('function');
  });
});
