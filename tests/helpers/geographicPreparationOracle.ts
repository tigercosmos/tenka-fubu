import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import ts from 'typescript';
import type { PlateRect } from '../../src/ui/map/armyPlateLayout';
import type { GeographicLabelCandidate } from '../../src/ui/map/geographicLabelLayout';
import type { GeographicScorerInput } from '../../src/ui/map/wasmGeographicScorer';

export const GEOGRAPHIC_PREPARATION_ORACLE_SOURCES = {
  productionCommit: 'fc464a42f7d8b4fda97ea87f3e42cd5a7685730c',
  productionSHA256: 'fbf127f31dbb5d8318acdf1ff1dd8bc56b77e808ba23247b779ad74ed28c3bdd',
  referenceSHA256: 'bda5b757e2bd8a2e82c5a42fde825ebe9c846337b8a578f8413938624899d9b2',
  roadCapsulesSHA256: 'aa529d9d17eb558a511a152cbd0985d39d127981042d3becfec2335336ea4d76',
} as const;

type Offset = { x: number; y: number };
export interface GeographicPreparationStep {
  id: string;
  rect: PlateRect;
  roadLine: GeographicScorerInput['roadLine'];
  roadCapsules: GeographicScorerInput['roadCapsules'];
  primary: PlateRect[];
  hard: PlateRect[];
  placed: PlateRect[];
  reserved: PlateRect[];
  nearPrimary: PlateRect[];
  nearHard: PlateRect[];
  nearReserved: PlateRect[];
  nearPrimaryIndices: number[];
  nearHardIndices: number[];
  nearReservedIndices: number[];
  baselinePrimary: number;
  hardBaseline: number[];
  intersecting: PlateRect[];
  directions: Offset[];
  firstOffsets: Offset[];
  xs: number[];
  ys: number[];
  signature: string;
  scored: boolean;
  scoreArguments?: GeographicScorerInput;
  winnerIndex: number;
  offset: Offset;
}

function pinnedSource(source: string, expected: string): string {
  if (createHash('sha256').update(source).digest('hex') !== expected)
    throw new Error('Frozen geographic oracle source changed');
  return source;
}

function replaceOnce(source: string, marker: string, replacement: string): string {
  if (source.split(marker).length !== 2) throw new Error('Frozen oracle marker changed');
  return source.replace(marker, replacement);
}

/** Execute the immutable original JS with observation hooks; no Rust or copied preparation math. */
export function createGeographicPreparationOracle(productionSource?: string) {
  const source =
    productionSource === undefined
      ? pinnedSource(
          readFileSync(new URL('./geographicWasmReference.ts', import.meta.url), 'utf8'),
          GEOGRAPHIC_PREPARATION_ORACLE_SOURCES.referenceSHA256,
        )
      : pinnedSource(productionSource, GEOGRAPHIC_PREPARATION_ORACLE_SOURCES.productionSHA256);
  const roadSource = pinnedSource(
    readFileSync(new URL('../../src/ui/map/roadLabelCapsules.ts', import.meta.url), 'utf8'),
    GEOGRAPHIC_PREPARATION_ORACLE_SOURCES.roadCapsulesSHA256,
  );
  const compile = (text: string) =>
    ts.transpileModule(text, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
  const roadExports: Record<string, unknown> = {};
  new Script(compile(roadSource), { filename: 'frozen-road-capsules.cjs' }).runInNewContext({
    exports: roadExports,
  });
  let steps: GeographicPreparationStep[] = [];
  let observed = replaceOnce(
    source,
    '    const cached = cache?.placements.get(id);',
    `    observeStep({ id, rect, roadLine, roadCapsules, primary, hard, placed, reserved,
      nearPrimary, nearHard, nearReserved, baselinePrimary, hardBaseline, intersecting,
      directions, firstOffsets: offsets.slice(0, 7), xs, ys, signature,
      nearPrimaryIndices: nearPrimary.map(r => primary.indexOf(r)),
      nearHardIndices: nearHard.map(r => hard.indexOf(r)),
      nearReservedIndices: nearReserved.map(r => reserved.indexOf(r)),
      scored: false, winnerIndex: -1, offset: { x: 0, y: 0 } });
    const cached = cache?.placements.get(id);`,
  );
  observed = replaceOnce(
    observed,
    '      result.set(id, { ...cached.offset });',
    '      observeWinner(-1, cached.offset);\n      result.set(id, { ...cached.offset });',
  );
  observed = replaceOnce(
    observed,
    '    let best = { x: 0, y: 0 },',
    `    observeScore({ rect, baselinePrimary, roadLine, roadCapsules, offsets,
      primary: nearPrimary, hard: nearHard, hardBaseline, reserved: nearReserved });
    let best = { x: 0, y: 0 },`,
  );
  observed = replaceOnce(
    observed,
    '    result.set(id, { ...best });',
    '    observeWinner(offsets.indexOf(best), best);\n    result.set(id, { ...best });',
  );
  const exports: Record<string, unknown> = {};
  new Script(compile(observed), {
    filename: 'frozen-geographic-preparation-oracle.cjs',
  }).runInNewContext({
    exports,
    require: (path: string) => {
      if (!path.endsWith('/roadLabelCapsules'))
        throw new Error('Unexpected frozen oracle dependency');
      return roadExports;
    },
    observeStep: (step: GeographicPreparationStep) => {
      steps.push(structuredClone(step));
    },
    observeScore: (input: GeographicScorerInput) => {
      const step = steps.at(-1)!;
      step.scored = true;
      step.scoreArguments = structuredClone(input);
    },
    observeWinner: (index: number, offset: Offset) => {
      const step = steps.at(-1)!;
      step.winnerIndex = index;
      step.offset = structuredClone(offset);
    },
  });
  const factory = exports.createGeographicLabelLayouter as () => {
    layout(
      candidates: readonly GeographicLabelCandidate[],
      obstacles: readonly PlateRect[],
      hard: readonly PlateRect[],
    ): Map<string, Offset>;
    getDiagnostics(): { computed: number; reused: number; entries: number };
  };
  const layouter = factory();
  return {
    layout(
      candidates: readonly GeographicLabelCandidate[],
      obstacles: readonly PlateRect[],
      hard: readonly PlateRect[] = [],
    ) {
      steps = [];
      const placements = layouter.layout(candidates, obstacles, hard);
      return { placements, steps, diagnostics: layouter.getDiagnostics() };
    },
  };
}

/** This is the actual original JSON string, not a reconstruction from packed Rust rows. */
export function geographicPreparationSignature(step: GeographicPreparationStep): string {
  return step.signature;
}
