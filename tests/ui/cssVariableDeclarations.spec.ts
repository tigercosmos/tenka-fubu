import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { expect, it } from 'vitest';
import {
  buildBaseCssVarEntries,
  buildClanCssVarEntries,
  UI_THEME,
} from '../../src/ui/styles/tokens';

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(file);
    return /\.(css|tsx?)$/.test(file) && !/\.spec\.tsx?$/.test(file) ? [file] : [];
  });
}

it('CSS variable spellings have a declared token, local declaration, or fallback', () => {
  const files = sourceFiles(path.resolve('src'));
  const declared = new Set([
    ...buildBaseCssVarEntries().map(([name]) => name),
    ...buildClanCssVarEntries().map(([name]) => name),
    ...Object.keys(UI_THEME),
  ]);
  const styles = new Map<string, string>();
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    if (file.endsWith('.css')) {
      const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
      styles.set(file, css);
      for (const match of css.matchAll(/(--[\w-]+)\s*:/g)) declared.add(match[1]!);
    } else {
      const syntax = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
      const visit = (node: ts.Node): void => {
        if (
          ts.isPropertyAssignment(node) &&
          ts.isStringLiteral(node.name) &&
          node.name.text.startsWith('--')
        )
          declared.add(node.name.text);
        ts.forEachChild(node, visit);
      };
      visit(syntax);
    }
  }
  // This checks names, not cascade ownership or computed paint; native tests cover those.
  const missing: string[] = [];
  for (const [file, css] of styles) {
    for (const match of css.matchAll(/var\(\s*(--[\w-]+)\s*([,)])/g)) {
      if (!declared.has(match[1]!) && match[2] !== ',') {
        const line = css.slice(0, match.index).split('\n').length;
        missing.push(`${path.relative(process.cwd(), file)}:${line}: ${match[1]}`);
      }
    }
  }
  expect(missing).toEqual([]);
});
