import { describe, expect, it } from 'vitest';
import {
  allowsSecondaryLabels,
  labelStageForDensity,
  mapMotionReduced,
} from './presentationSettings';

describe('map presentation preferences', () => {
  it('combines runtime OS motion preference and map effects without persisting a setting', () => {
    expect(mapMotionReduced({ mapLabelDensity: 'medium', effectsEnabled: true })).toBe(false);
    expect(
      mapMotionReduced({ mapLabelDensity: 'medium', effectsEnabled: true, reducedMotion: true }),
    ).toBe(true);
    expect(
      mapMotionReduced({ mapLabelDensity: 'medium', effectsEnabled: false, reducedMotion: false }),
    ).toBe(true);
  });
  it('preserves default LOD and promotes only label density for high detail', () => {
    expect(labelStageForDensity('far', 'medium')).toBe('far');
    expect(labelStageForDensity('mid', 'low')).toBe('mid');
    expect(labelStageForDensity('far', 'high')).toBe('mid');
    expect(labelStageForDensity('mid', 'high')).toBe('near');
    expect(labelStageForDensity('near', 'high')).toBe('near');
    expect(allowsSecondaryLabels('low')).toBe(false);
    expect(allowsSecondaryLabels('medium')).toBe(true);
  });
});
