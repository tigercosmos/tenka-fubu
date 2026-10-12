import { describe, expect, it } from 'vitest';
import { createGeographicLabelLayouter as createFrozen } from '../helpers/geographicWasmReference';
import {
  createGeographicPreparationOracle,
  geographicPreparationSignature,
} from '../helpers/geographicPreparationOracle';
import type { GeographicLabelCandidate } from '../../src/ui/map/geographicLabelLayout';

const label = (): GeographicLabelCandidate => ({
  id: 'label',
  kind: 'district',
  rect: { x: -0, y: 0, width: 20, height: 10 },
});

describe('frozen JS geographic preparation observation contract', () => {
  it('observes misses and hits without changing original placements, metadata, or cache lifetime', () => {
    const observed = createGeographicPreparationOracle();
    const reference = createFrozen();
    const labels = [label()];
    const primary = [
      { x: 10, y: -0, width: 10, height: 10, tag: 'first', absentValue: undefined },
      { x: 10, y: -0, width: 10, height: 10, tag: 'second' },
      { x: 1000, y: 1000, width: 20, height: 10, tag: 'far' },
    ];
    for (const frame of [labels, structuredClone(labels), []]) {
      const got = observed.layout(frame, primary, primary.slice(0, 1));
      expect([...got.placements]).toEqual([
        ...reference.layout(frame, primary, primary.slice(0, 1)),
      ]);
      expect(got.diagnostics).toEqual(reference.getDiagnostics());
      if (!got.steps.length) continue;
      const step = got.steps[0]!;
      expect(Object.is(step.rect.x, -0)).toBe(true);
      expect(step.primary).toEqual(primary);
      expect(step.nearPrimaryIndices).toEqual([0, 1]);
      expect(step.nearHardIndices).toEqual([0]);
      expect(step.nearReservedIndices).toEqual([0, 1, 3]);
      expect(step.firstOffsets).toHaveLength(7);
      expect(geographicPreparationSignature(step)).toBe(step.signature);
      if (step.scored) {
        expect(step.scoreArguments!.offsets.slice(0, 7)).toEqual(step.firstOffsets);
        if (step.winnerIndex >= 0)
          expect(step.offset).toEqual(step.scoreArguments!.offsets[step.winnerIndex]);
      } else expect(step.scoreArguments).toBeUndefined();
    }
  });

  it('retains the original absent/null/empty capsule signature distinction', () => {
    const oracle = createGeographicPreparationOracle();
    const absent = label(),
      nullable = { ...label(), roadCapsules: null },
      empty = { ...label(), roadCapsules: [] };
    const signatures = [absent, nullable, empty].map((candidate) => {
      const got = oracle.layout([candidate], [], []);
      expect(got.steps[0]!.scored).toBe(true);
      return got.steps[0]!.signature;
    });
    expect(new Set(signatures).size).toBe(3);
  });
});
