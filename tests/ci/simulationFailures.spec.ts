import { describe, expect, it } from 'vitest';
import {
  invalidateFailedSimulationAcceptance,
  recordSimulationFailure,
} from '../../tools/ci/simulation-failures';

/** Minimal accepted-result shapes isolate failure accounting, not simulation proof. */
function acceptance(specification: '15 §5.6' | '18 §5.4') {
  return {
    specification,
    status: 'pass' as 'pass' | 'fail' | 'incomplete',
    metrics: { rate: 1, nested: { observations: [1, 2, 3] } },
    reasons: [] as Array<{ kind: 'fail' | 'incomplete'; code: string; seed?: number }>,
  };
}

describe('explicit simulation failure accounting', () => {
  it('retains an unobserved day for setup failures without inventing a start-day observation', () => {
    expect(recordSimulationFailure(42, 'primary', null, 'scenario loading failed')).toEqual({
      seed: 42,
      phase: 'primary',
      day: null,
      error: 'scenario loading failed',
    });
  });
  it('retains the original Error stack, seed, phase and observed day', () => {
    const error = new Error('INV02 at actual day450');
    const result = recordSimulationFailure(42, 'primary', 450, error);
    expect(result).toEqual({ seed: 42, phase: 'primary', day: 450, error: error.stack });
    expect(result.error).toContain('INV02');
  });
  it('retains Error diagnostics without a stack', () => {
    const error = new Error('missing stack');
    delete error.stack;
    expect(recordSimulationFailure(7, 'repeat', 99, error).error).toBe('Error: missing stack');
  });
  it.each([
    ['raw diagnostic', 'raw diagnostic'],
    [null, 'null'],
    [undefined, 'undefined'],
    [42, '42'],
    [{ problem: 'unexpected value' }, '[object Object]'],
  ])('records non-Error thrown value %s', (value, expected) => {
    expect(recordSimulationFailure(1, 'repeat', 7, value).error).toBe(expected);
  });
  it.each(['15 §5.6', '18 §5.4'] as const)(
    'invalidates %s despite a passing survivor-only result',
    (specification) => {
      const original = acceptance(specification);
      const failures = [
        recordSimulationFailure(21, 'primary', 450, new Error('INV02')),
        recordSimulationFailure(3, 'repeat', 600, 'repeat mismatch'),
      ];
      const before = JSON.stringify([original, failures]);
      const result = invalidateFailedSimulationAcceptance(original, failures);
      expect(result.status).toBe('incomplete');
      expect(result.reasons).toEqual([
        { kind: 'incomplete', code: 'primary-simulation-failed', seed: 21 },
        { kind: 'incomplete', code: 'repeat-simulation-failed', seed: 3 },
      ]);
      expect(result.metrics).toEqual(original.metrics);
      expect(JSON.stringify([original, failures])).toBe(before);
      result.metrics.nested.observations.push(9);
      result.reasons[0]!.seed = 99;
      expect(original.metrics.nested.observations).toEqual([1, 2, 3]);
      expect(failures[0]!.seed).toBe(21);
    },
  );
  it('keeps existing failed criteria while marking the observation incomplete', () => {
    const original = acceptance('15 §5.6');
    original.status = 'fail';
    original.reasons.push({ kind: 'fail', code: 'monthly-resource-more-than-double', seed: 2 });
    const result = invalidateFailedSimulationAcceptance(original, [
      recordSimulationFailure(2, 'primary', 900, 'INV22'),
    ]);
    expect(result.status).toBe('incomplete');
    expect(result.reasons[0]).toEqual(original.reasons[0]);
    expect(result.reasons).toHaveLength(2);
    expect(original.reasons).toHaveLength(1);
  });
  it('returns detached equal values for empty failures', () => {
    const original = acceptance('18 §5.4');
    const result = invalidateFailedSimulationAcceptance(original, []);
    expect(result).toEqual(original);
    expect(result).not.toBe(original);
    expect(result.metrics).not.toBe(original.metrics);
    expect(result.reasons).not.toBe(original.reasons);
  });
});
