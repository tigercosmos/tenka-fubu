import { describe, expect, it } from 'vitest';
import {
  landRoadMaterial,
  landRoadSurfaceMaterial,
  ROAD_MATERIAL,
} from '@ui/map/roads/roadMaterial';
import { ROAD_DEPTH_STYLE } from '@ui/map/roads/roadsDraw';
import {
  ROAD_CASING_WIDTH,
  ROAD_GROUND_STYLE,
  ROAD_INNER_WIDTH,
  ROAD_STAGE_WIDTH_MULT,
  SEA_ROUTE_WIDTH,
} from '@ui/map/mapViewConfig';
import { MAP_PALETTE_NUM } from '@ui/styles/tokens';

// Independent approved paint literals, driven by actual nominal caller inputs.
// CPU style/envelope contract, not GPU AA coverage or screenshot equivalence.
describe('road material mapping against current nominal roles', () => {
  it('expands only interior surfaces within the unchanged painted casing at every LOD', () => {
    for (const m of [5, 2.5, 1])
      for (const grade of [1, 2, 3] as const) {
        const paint = landRoadSurfaceMaterial(
          ROAD_INNER_WIDTH[grade],
          m,
          grade === 3 ? MAP_PALETTE_NUM.roadArterial : MAP_PALETTE_NUM.roadMinor,
        );
        expect(paint.width).toBe({ 1: 0.8, 2: 0.8, 3: 1.2 }[grade] * m);
        const casing = landRoadMaterial(ROAD_CASING_WIDTH[grade] * m, MAP_PALETTE_NUM.roadCasing);
        expect(paint.width).toBeLessThanOrEqual(casing.width);
        expect(casing.width).toBeCloseTo({ 1: 0.9, 2: 1.5, 3: 2.4 }[grade] * m);
      }
    expect(ROAD_MATERIAL.landWidthFactor).toBe(0.6);
  });
  it('keeps a readable earth edge over light ground and a warm surface over wooded ground without widening', () => {
    const rgb = (color: number) => [(color >>> 16) & 255, (color >>> 8) & 255, color & 255];
    const contrast = (paint: ReturnType<typeof landRoadMaterial>, ground: number) =>
      Math.hypot(
        ...rgb(paint.color).map((value, index) => (value - rgb(ground)[index]!) * paint.alpha),
      );
    const edge = landRoadMaterial(2, MAP_PALETTE_NUM.roadCasing, ROAD_GROUND_STYLE.casingAlpha);
    expect(contrast(edge, MAP_PALETTE_NUM.plainLight)).toBeGreaterThan(100);
    for (const [color, minimum] of [
      [MAP_PALETTE_NUM.roadArterial, 130],
      [MAP_PALETTE_NUM.roadMinor, 120],
    ]) {
      const surface = landRoadMaterial(1, color!);
      expect(contrast(surface, MAP_PALETTE_NUM.forestMoss)).toBeGreaterThan(minimum!);
      expect(surface.width).toBe(0.6);
    }
    expect(edge.width).toBe(1.2);
  });
  it('maps the actual ground verge, casing, surface and grain inputs without widening any stroke', () => {
    for (const stage of ['far', 'mid', 'near'] as const) {
      const m = ROAD_STAGE_WIDTH_MULT[stage];
      for (const grade of [2, 3] as const) {
        const roles = [
          {
            width: (ROAD_CASING_WIDTH[grade] + ROAD_GROUND_STYLE.vergeExtraWidth) * m,
            color: MAP_PALETTE_NUM.roadCasing,
            alpha: ROAD_GROUND_STYLE.vergeAlpha,
            expectedColor: 0x6f604c,
            expectedAlpha: 0.06,
          },
          {
            width: ROAD_CASING_WIDTH[grade] * m,
            color: MAP_PALETTE_NUM.roadCasing,
            alpha: ROAD_GROUND_STYLE.casingAlpha,
            expectedColor: 0x6f604c,
            expectedAlpha: 0.88,
          },
          {
            width: ROAD_INNER_WIDTH[grade] * m,
            color: grade === 3 ? MAP_PALETTE_NUM.roadArterial : MAP_PALETTE_NUM.roadMinor,
            alpha: ROAD_GROUND_STYLE.surfaceAlpha,
            expectedColor: grade === 3 ? 0xe4c89a : 0xe4cfa9,
            expectedAlpha: 0.98,
          },
          {
            width: ROAD_GROUND_STYLE.grainStrokeWidth * m,
            color: MAP_PALETTE_NUM.roadCasing,
            alpha: ROAD_GROUND_STYLE.grainAlpha,
            expectedColor: 0x6f604c,
            expectedAlpha: 0.08,
          },
        ];
        for (const role of roles) {
          const surface =
            role.color === MAP_PALETTE_NUM.roadArterial || role.color === MAP_PALETTE_NUM.roadMinor;
          const paint = surface
            ? landRoadSurfaceMaterial(ROAD_INNER_WIDTH[grade], m, role.color, role.alpha)
            : landRoadMaterial(role.width, role.color, role.alpha);
          expect(paint).toEqual({
            width: surface ? Math.max(role.width * 0.6, 0.8 * m) : role.width * 0.6,
            color: role.expectedColor,
            alpha: role.expectedAlpha,
          });
          expect(paint.width).toBeLessThanOrEqual(role.width);
        }
      }
    }
  });

  it('maps actual shifted shadow, highlight and opaque casing inputs while preserving grade widths', () => {
    for (const m of Object.values(ROAD_STAGE_WIDTH_MULT)) {
      for (const grade of [1, 2, 3] as const) {
        const width = ROAD_CASING_WIDTH[grade] * m;
        expect(
          landRoadMaterial(width, MAP_PALETTE_NUM.reliefInk, ROAD_DEPTH_STYLE.shadowAlpha),
        ).toEqual({ width: width * 0.6, color: 0x6f604c, alpha: 0.08 });
        expect(landRoadMaterial(width, MAP_PALETTE_NUM.roadCasing)).toEqual({
          width: width * 0.6,
          color: 0x6f604c,
          alpha: 0.88,
        });
      }
      expect(
        landRoadMaterial(0.45 * m, MAP_PALETTE_NUM.plainLight, ROAD_DEPTH_STYLE.highlightAlpha),
      ).toEqual({ width: 0.45 * m * 0.6, color: MAP_PALETTE_NUM.plainLight, alpha: 0.12 });
      const widths = ([1, 2, 3] as const).map(
        (grade) => landRoadMaterial(ROAD_CASING_WIDTH[grade] * m, MAP_PALETTE_NUM.roadCasing).width,
      );
      expect(widths[0]).toBeLessThan(widths[1]!);
      expect(widths[1]).toBeLessThan(widths[2]!);
    }
  });

  it('keeps the approved sea inner width inside the unchanged nominal halo at every LOD', () => {
    expect(ROAD_MATERIAL.seaInnerWidth).toBe(0.8);
    expect(ROAD_MATERIAL.seaOuterAlpha).toBe(0.12);
    expect(ROAD_MATERIAL.landWidthFactor).toBe(0.6);
    for (const m of Object.values(ROAD_STAGE_WIDTH_MULT)) {
      expect(ROAD_MATERIAL.seaInnerWidth * m).toBeLessThanOrEqual(SEA_ROUTE_WIDTH.inner * m);
      expect(ROAD_MATERIAL.seaInnerWidth * m).toBeLessThan(SEA_ROUTE_WIDTH.outer * m);
    }
  });
});
