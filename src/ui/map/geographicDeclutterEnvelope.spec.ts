import { describe, expect, it } from 'vitest';
import { geographicDeclutterEnvelope } from './geographicDeclutterEnvelope';

describe('geography paint-independent occupancy', () => {
  it('retains the same legacy envelope for each narrower warm halo', () => {
    const anchor = { x: 206.7, y: 360.64 };
    const legacy = geographicDeclutterEnvelope(anchor, 14, 50, 16.04, 2);
    for (const halo of [0, 1, 1.5, 2]) {
      expect(geographicDeclutterEnvelope(anchor, 14, 48 + halo, 14.04 + halo, halo)).toEqual(
        legacy,
      );
    }
    expect(anchor).toEqual({ x: 206.7, y: 360.64 });
  });
  it('does not shrink a wider actual paint footprint or change its original gap', () => {
    expect(geographicDeclutterEnvelope({ x: 40, y: 50 }, 14, 60, 20, 3)).toEqual({
      x: 10,
      y: 64,
      width: 60,
      height: 20,
    });
  });
});
