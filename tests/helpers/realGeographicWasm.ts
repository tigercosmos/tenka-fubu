import { readFile } from 'node:fs/promises';
import {
  createWasmGeographicScorer,
  geographicScorerImports,
} from '../../src/ui/map/wasmGeographicScorer';

/** Actual committed artifact and independent instance; no synthetic scorer exports. */
export async function realGeographicWasm() {
  const bytes = new Uint8Array(
    await readFile(new URL('../../public/wasm/tenka_engine.wasm', import.meta.url)),
  );
  const { instance } = await WebAssembly.instantiate(bytes, geographicScorerImports());
  let calls = 0;
  const realScore = instance.exports.geo_score;
  if (typeof realScore !== 'function') throw new Error('Compiled artifact lacks geo_score');
  const score = realScore as (pointer: number, words: number) => number;
  const scorer = createWasmGeographicScorer({
    ...instance.exports,
    geo_score: (pointer: number, words: number) => {
      calls++;
      return score(pointer, words);
    },
  });
  return { scorer, instance, getScoreCalls: () => calls };
}
