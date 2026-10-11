import { describe, expect, it } from 'vitest';
import { ROAD_INNER_WIDTH, ROAD_STAGE_WIDTH_MULT } from '@ui/map/mapViewConfig';
import { ROAD_MATERIAL, landRoadSurfaceMaterial } from '@ui/map/roads/roadMaterial';
import { MAP_PALETTE_NUM } from '@ui/styles/tokens';

// Screen-space paint contract; routing geometry and nominal safety bounds stay unchanged.
describe('earth road screen readability', () => {
  it('keeps the smallest land surface at least one CSS pixel at every reference LOD', () => {
    for (const [stage, scale] of [
      ['far', 0.25],
      ['mid', 0.5],
      ['near', 1.25],
    ] as const) {
      for (const grade of [1, 2, 3] as const) {
        const width =
          landRoadSurfaceMaterial(
            ROAD_INNER_WIDTH[grade],
            ROAD_STAGE_WIDTH_MULT[stage],
            grade === 3 ? MAP_PALETTE_NUM.roadArterial : MAP_PALETTE_NUM.roadMinor,
          ).width * scale;
        expect(width).toBeGreaterThanOrEqual(1);
      }
    }
    expect(ROAD_MATERIAL.landWidthFactor).toBeLessThanOrEqual(1);
  });

  it('separates a restrained light earth surface from its darker casing without fading it away', () => {
    const channel = (color: number, shift: number) => (color >> shift) & 255;
    for (const surface of [ROAD_MATERIAL.arterial, ROAD_MATERIAL.minor]) {
      for (const shift of [16, 8, 0]) {
        expect(
          channel(surface, shift) - channel(ROAD_MATERIAL.casing, shift),
        ).toBeGreaterThanOrEqual(40);
      }
      expect(channel(surface, 16)).toBeGreaterThan(channel(surface, 8));
      expect(channel(surface, 8)).toBeGreaterThan(channel(surface, 0));
    }
    expect(ROAD_MATERIAL.surfaceAlpha).toBeGreaterThanOrEqual(0.9);
    expect(ROAD_MATERIAL.pathCasingAlpha).toBeGreaterThanOrEqual(0.65);
  });

  it('preserves the existing sea presentation and bridge envelope', () => {
    expect(ROAD_MATERIAL.seaInnerWidth).toBe(0.8);
    expect(ROAD_MATERIAL.seaOuterAlpha).toBe(0.12);
  });
});
