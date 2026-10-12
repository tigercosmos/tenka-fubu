import { describe, expect, it } from 'vitest';
import { buildGameStateFromScenario } from '../../src/core/state/builder';
import { canonicalStringify, fnv1a64, stateHash } from '../../src/core/state/serialize';
import { loadS1560Scenario } from '../../src/data/scenarios/s1560';
import { fnv1a64 as legacyFnv1a64 } from './fixtures/fnvBigIntB1';
import type { ClanId } from '../../src/core/state/ids';

describe('FNV64 limb compatibility with frozen BigInt implementation', () => {
  it('matches all individual UTF-16 units, including lone surrogates', () => {
    for (let unit = 0; unit < 65536; unit++) {
      const value = String.fromCharCode(unit);
      expect(fnv1a64(value)).toBe(legacyFnv1a64(value));
    }
  });

  it('matches surrogate pairs, edge units, and deterministic long strings', () => {
    const edge = [
      0, 1, 127, 128, 255, 256, 0x7ff, 0x800, 0xd7ff, 0xd800, 0xdbff, 0xdc00, 0xdfff, 0xe000,
      0xffff,
    ];
    for (const first of edge)
      for (const second of edge) {
        const value = String.fromCharCode(first, second);
        expect(fnv1a64(value)).toBe(legacyFnv1a64(value));
      }
    let seed = 0x84222325;
    const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
    for (let trial = 0; trial < 2000; trial++) {
      const length = next() % 201;
      let value = '';
      for (let i = 0; i < length; i++) value += String.fromCharCode(next() & 0xffff);
      expect(fnv1a64(value)).toBe(legacyFnv1a64(value));
    }
  });

  it('keeps the full national state hash equal to the frozen reference', async () => {
    const state = buildGameStateFromScenario(await loadS1560Scenario(), {
      appVersion: '0.0.0',
      seed: 42,
      playerClanId: 'clan.miyoshi' as ClanId,
      difficulty: 'normal',
      startDay: 0,
    });
    const persistent = { ...state, ai: { ...state.ai, intentLog: [] } };
    expect(stateHash(state)).toBe(legacyFnv1a64(canonicalStringify(persistent)));
    expect(fnv1a64('')).toBe('cbf29ce484222325');
  });
});
