// Static size budgets from plan/01 §3.9.1 (KiB). This does not measure interactivity.
import { readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

export const BUNDLE_LIMITS = { initial: 800 * 1024, scenario: 1200 * 1024, font: 2048 * 1024 };
export const SCENARIO_ENTRY = 'src/data/scenarios/s1560/index.ts';
interface Chunk {
  file: string;
  imports: string[];
  dynamicImports: string[];
  isEntry: boolean;
  isDynamicEntry: boolean;
}
export interface BundleBudgetReport {
  initial: {
    files: string[];
    bytes: number;
    sizes: { file: string; rawBytes: number; gzipBytes: number }[];
  };
  scenario: {
    files: string[];
    bytes: number;
    sizes: { file: string; rawBytes: number; gzipBytes: number }[];
  };
  font: { file: string; bytes: number };
  limits: typeof BUNDLE_LIMITS;
  passed: boolean;
}

/** Lexical and real-path checks apply to the manifest, chunks and font, including symlinks. */
function safeFile(root: string, relative: string): string {
  if (
    relative.length === 0 ||
    relative.includes('\\') ||
    relative.includes('\0') ||
    path.posix.isAbsolute(relative) ||
    /^[A-Za-z]:/.test(relative) ||
    relative.split('/').some((part) => part === '..' || part === '.' || part === '')
  )
    throw new Error(`Unsafe bundle path: ${relative}`);
  const resolved = realpathSync(path.join(root, relative));
  const fromRoot = path.relative(root, resolved);
  if (
    fromRoot === '' ||
    fromRoot.startsWith(`..${path.sep}`) ||
    fromRoot === '..' ||
    path.isAbsolute(fromRoot)
  ) {
    throw new Error(`Escaped bundle path: ${relative}`);
  }
  if (!statSync(resolved).isFile()) throw new Error(`Not a bundle file: ${relative}`);
  return resolved;
}

function parseManifest(raw: unknown): Map<string, Chunk> {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw))
    throw new Error('Invalid Vite manifest');
  const chunks = new Map<string, Chunk>();
  for (const [key, value] of Object.entries(raw)) {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
      throw new Error(`Invalid chunk: ${key}`);
    const record = value as Record<string, unknown>;
    const list = (name: string): string[] => {
      const field = record[name];
      if (field === undefined) return [];
      if (!Array.isArray(field) || !field.every((item): item is string => typeof item === 'string'))
        throw new Error(`Invalid ${name}: ${key}`);
      return field;
    };
    if (typeof record.file !== 'string') throw new Error(`Invalid file: ${key}`);
    for (const flag of ['isEntry', 'isDynamicEntry']) {
      if (record[flag] !== undefined && typeof record[flag] !== 'boolean')
        throw new Error(`Invalid ${flag}: ${key}`);
    }
    chunks.set(key, {
      file: record.file,
      imports: list('imports'),
      dynamicImports: list('dynamicImports'),
      isEntry: record.isEntry === true,
      isDynamicEntry: record.isDynamicEntry === true,
    });
  }
  for (const [key, chunk] of chunks) {
    for (const dependency of [...chunk.imports, ...chunk.dynamicImports]) {
      if (!chunks.has(dependency))
        throw new Error(`Missing manifest dependency: ${key} -> ${dependency}`);
    }
  }
  return chunks;
}

/** Each unique emitted JS file is gzip-compressed separately, as separately served responses. */
export function checkBundleBudget(
  distDirectory: string,
  limits = BUNDLE_LIMITS,
): BundleBudgetReport {
  for (const value of Object.values(limits)) {
    if (!Number.isFinite(value) || value < 0) throw new Error('Invalid bundle limit');
  }
  const root = realpathSync(distDirectory);
  const raw: unknown = JSON.parse(readFileSync(safeFile(root, '.vite/manifest.json'), 'utf8'));
  const chunks = parseManifest(raw);
  // Validate every emitted chunk path, even dynamically loaded chunks outside the measured closure.
  for (const chunk of chunks.values()) safeFile(root, chunk.file);
  const entries = [...chunks].filter(([, chunk]) => chunk.isEntry).map(([key]) => key);
  if (!chunks.get('index.html')?.isEntry)
    throw new Error('Missing initial index.html manifest entry');
  if (!/\.(?:m?js)$/.test(chunks.get('index.html')!.file))
    throw new Error('Initial index.html entry is not JavaScript');
  const scenario = chunks.get(SCENARIO_ENTRY);
  if (!scenario || !scenario.isDynamicEntry) throw new Error('Missing dynamic s1560 entry');
  const closure = (roots: string[], dynamic = false): Set<string> => {
    const visited = new Set<string>();
    const todo = [...roots];
    while (todo.length > 0) {
      const key = todo.pop()!;
      if (visited.has(key)) continue;
      visited.add(key);
      const chunk = chunks.get(key)!;
      todo.push(...chunk.imports, ...(dynamic ? chunk.dynamicImports : []));
    }
    return visited;
  };
  const initialKeys = closure(entries);
  const initialFiles = new Set([...initialKeys].map((key) => chunks.get(key)!.file));
  if (initialKeys.has(SCENARIO_ENTRY) || initialFiles.has(scenario.file))
    throw new Error('Eager s1560 entry');
  if (!closure(entries, true).has(SCENARIO_ENTRY))
    throw new Error('Unreachable dynamic s1560 entry');
  const measure = (keys: Set<string>, excluded = new Set<string>()) => {
    const files = [...new Set([...keys].map((key) => chunks.get(key)!.file))]
      .filter((file) => /\.(?:m?js)$/.test(file) && !excluded.has(file))
      .sort();
    const sizes = files.map((file) => {
      const data = readFileSync(safeFile(root, file));
      return { file, rawBytes: data.length, gzipBytes: gzipSync(data).length };
    });
    return {
      files,
      sizes,
      bytes: sizes.reduce((sum, size) => sum + size.gzipBytes, 0),
    };
  };
  const initial = measure(initialKeys);
  const incremental = measure(closure([SCENARIO_ENTRY]), initialFiles);
  if (!/\.(?:m?js)$/.test(scenario.file)) throw new Error('s1560 entry is not JavaScript');
  const fontFile = 'fonts/noto-serif-tc-subset.woff2';
  const font = { file: fontFile, bytes: statSync(safeFile(root, fontFile)).size };
  return {
    initial,
    scenario: incremental,
    font,
    limits: { ...limits },
    passed:
      initial.bytes <= limits.initial &&
      incremental.bytes <= limits.scenario &&
      font.bytes <= limits.font,
  };
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  try {
    if (process.argv.length > 3) throw new Error('Usage: bundle-budget.ts [dist-directory]');
    const report = checkBundleBudget(
      process.argv[2] ?? fileURLToPath(new URL('../../dist', import.meta.url)),
    );
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
