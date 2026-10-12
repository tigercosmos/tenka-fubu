import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  createGeographicLabelLayouter,
  type GeographicLabelCandidate,
} from '../../src/ui/map/geographicLabelLayout';
import type { GeographicScorerInput } from '../../src/ui/map/wasmGeographicScorer';
import type { PlateRect } from '../../src/ui/map/armyPlateLayout';
import { roadLabelClearsCapsules } from '../../src/ui/map/roadLabelCapsules';
import { realGeographicWasm } from '../helpers/realGeographicWasm';
import type { createGeographicLabelLayouter as createFrozen } from '../helpers/geographicWasmReference';

/** Add observation to the immutable old algorithm, rather than reconstructing expected axes. */
function observedReference(observe: (input: GeographicScorerInput) => void) {
  const source = readFileSync('tests/helpers/geographicWasmReference.ts', 'utf8');
  expect(createHash('sha256').update(source).digest('hex')).toBe(
    'bda5b757e2bd8a2e82c5a42fde825ebe9c846337b8a578f8413938624899d9b2',
  );
  const marker = '    let best = { x: 0, y: 0 },';
  expect(source.split(marker)).toHaveLength(2);
  const observed = source.replace(
    marker,
    `    observePreparation({ rect, baselinePrimary, roadLine, roadCapsules, offsets,
      primary: nearPrimary, hard: nearHard, hardBaseline, reserved: nearReserved });\n${marker}`,
  );
  const compiled = ts.transpileModule(observed, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports: Record<string, unknown> = {};
  new Script(compiled.outputText, {
    filename: 'frozen-geographic-preparation.cjs',
  }).runInNewContext({
    exports,
    require: (path: string) => {
      if (!path.endsWith('/roadLabelCapsules'))
        throw new Error(`Unexpected frozen dependency: ${path}`);
      return { roadLabelClearsCapsules };
    },
    observePreparation: observe,
  });
  return (
    exports as { createGeographicLabelLayouter: typeof createFrozen }
  ).createGeographicLabelLayouter();
}

function exact(actual: unknown, expected: unknown, path = 'value'): void {
  if (typeof expected === 'number') {
    if (!Object.is(actual, expected))
      throw new Error(`${path}: f64 mismatch ${String(actual)} / ${String(expected)}`);
    return;
  }
  if (expected === null || typeof expected !== 'object') {
    if (actual !== expected) throw new Error(`${path}: scalar mismatch`);
    return;
  }
  if (actual === null || typeof actual !== 'object') throw new Error(`${path}: object missing`);
  const expectedKeys = Object.keys(expected),
    actualKeys = Object.keys(actual);
  if (expectedKeys.join('\0') !== actualKeys.join('\0'))
    throw new Error(`${path}: key/order mismatch`);
  for (const key of expectedKeys)
    exact(
      (actual as Record<string, unknown>)[key],
      (expected as Record<string, unknown>)[key],
      `${path}.${key}`,
    );
}

async function comparison() {
  const { scorer, getScoreCalls } = await realGeographicWasm();
  let expectedPrepared: GeographicScorerInput[] = [],
    actualPrepared: GeographicScorerInput[] = [];
  const reference = observedReference((input) => {
    expectedPrepared.push(structuredClone(input));
  });
  const actual = createGeographicLabelLayouter({
    score: (input) => {
      actualPrepared.push(structuredClone(input));
      return scorer.score(input);
    },
  });
  return {
    run(
      labels: GeographicLabelCandidate[],
      obstacles: PlateRect[],
      hard: PlateRect[],
      context: string,
    ) {
      expectedPrepared = [];
      actualPrepared = [];
      const wanted = reference.layout(labels, obstacles, hard);
      const got = actual.layout(labels, obstacles, hard);
      exact(actualPrepared, expectedPrepared, `${context}.allPreparedArguments`);
      exact([...got], [...wanted], `${context}.offsets`);
      expect(JSON.stringify([...got]), context).toBe(JSON.stringify([...wanted]));
      exact(actual.getDiagnostics(), reference.getDiagnostics(), `${context}.cacheDiagnostics`);
      return { calls: actualPrepared.length, total: getScoreCalls() };
    },
    dispose: () => scorer.dispose(),
  };
}
const label = (id = 'a'): GeographicLabelCandidate => ({
  id,
  kind: 'district',
  rect: { x: 0, y: 0, width: 20, height: 10 },
});

describe('fused geographic axes preserve original full preparation', () => {
  it.each([0, 1, 2, 3])(
    'matches seed batch %i with every cache/road/blocker/eviction transition and actual Rust',
    async (batch) => {
      const pair = await comparison();
      let state = 0x7e691755;
      const random = () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return state / 0x100000000;
      };
      // Preserve the original 320-scene random stream; each scene consumes 87 values.
      for (let skipped = 0; skipped < batch * 80 * 87; skipped++) random();
      try {
        for (let seed = batch * 80; seed < (batch + 1) * 80; seed++) {
          const labels = Array.from({ length: 3 }, (_, i): GeographicLabelCandidate => ({
            id: ['😀', '\uE000', 'a'][i]!,
            kind: i === 0 ? 'province' : i === 1 ? 'road' : 'district',
            rect: {
              x: random() * 180 - 90,
              y: random() * 100 - 50,
              width: random() * 70,
              height: random() * 25,
            },
            ...(i === 1
              ? {
                  roadLine: {
                    normal: { x: random() - 0.5, y: random() - 0.5 },
                    slack: random() * 30,
                  },
                  roadCapsules: [{ a: { x: -60, y: -20 }, b: { x: 100, y: 60 }, radius: 2 }],
                }
              : {}),
          }));
          const blockers = Array.from({ length: 18 }, (): PlateRect => ({
            x: random() * 300 - 150,
            y: random() * 240 - 120,
            width: random() * 60,
            height: random() * 35,
          }));
          const hard = blockers.filter((_, i) => i % 5 === 0).reverse();
          pair.run(labels, blockers, hard, `seed${seed}.initial`);
          expect(
            pair.run(
              structuredClone(labels),
              structuredClone(blockers),
              structuredClone(hard),
              `seed${seed}.clone`,
            ).calls,
          ).toBe(0);
          const changed = structuredClone(blockers);
          changed[0]!.x += 1 / 8;
          pair.run(labels, changed, hard, `seed${seed}.blocker`);
          labels[1]!.roadLine!.slack += 1 / 16;
          pair.run(labels, changed, hard, `seed${seed}.road`);
          labels[0]!.rect.width += 1 / 32;
          pair.run(labels, changed, hard, `seed${seed}.rect`);
          pair.run(labels.slice(1), changed, hard, `seed${seed}.evict`);
        }
      } finally {
        pair.dispose();
      }
    },
  );

  it('matches signed-zero, stable abs ties, cap16, radius/gap epsilon and extreme finite arithmetic', async () => {
    const pair = await comparison();
    try {
      for (const epsilon of [-(2 ** -40), -0, 0, 2 ** -40]) {
        const baseline = label();
        baseline.rect.x = -0;
        const blockers = Array.from({ length: 25 }, (_, i) => ({
          x: (i % 2 ? -1 : 1) * (i + 1) + epsilon,
          y: (i % 2 ? 1 : -1) * (i + 1),
          width: 20,
          height: 10,
        }));
        blockers.push(
          { x: 20 + 48 + epsilon, y: 0, width: 0, height: 0 },
          { x: -48 - 4 + epsilon, y: -0, width: 0, height: 0 },
        );
        pair.run([baseline], blockers, blockers.slice(0, 4), `epsilon${String(epsilon)}`);
        pair.run(
          [baseline],
          [...blockers].reverse(),
          blockers.slice(0, 4).reverse(),
          'reverseStableTies',
        );
      }
      let validScenes = 0;
      for (const magnitude of [1e16, 1e100, 1e308])
        for (const sign of [-1, 1])
          for (const size of [0, magnitude]) {
            const rect = { x: sign * magnitude, y: sign * magnitude, width: size, height: size };
            if (![rect.x + rect.width + 4, rect.y + rect.height + 4].every(Number.isFinite))
              continue;
            validScenes++;
            const candidate = { ...label('extreme'), rect };
            const blockers = [
              rect,
              { x: -sign * magnitude, y: -sign * magnitude, width: 0, height: 0 },
            ];
            pair.run([candidate], blockers, blockers, `extreme${sign}/${magnitude}/${size}`);
            expect(
              pair.run(
                structuredClone([candidate]),
                structuredClone(blockers),
                structuredClone(blockers),
                'extremeClone',
              ).calls,
            ).toBe(0);
          }
      expect(validScenes).toBe(11);
      pair.run([], [], [], 'emptyEviction');
    } finally {
      pair.dispose();
    }
  });
});
