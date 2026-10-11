import { MAP_PALETTE_NUM } from '../../styles/tokens';

/** World-sized bridge artwork; far remains hidden. Nominal safety envelopes stay conservative. */
export const BRIDGE_DISPLAY_SCALE = { far: 1, mid: 1, near: 1 } as const;

/** Mid/near packed soil and bridge timber; legacy far/paths/sea paint stays independent. */
export const ROAD_SOIL_MATERIAL = Object.freeze({
  arterial: 0xc6a675,
  minor: 0xba9e72,
  midArterial: 0xd1b17e,
  midMinor: 0xcbbb99,
  casing: 0x56432f,
  wearColor: 0x897858,
  wearAlpha: 0.24,
  wearWidthFactor: 0.3,
  wearLengthFactor: 0.3,
});

export const BRIDGE_MATERIAL = Object.freeze({
  deck: 0x9b8058,
  woodDark: 0x594b38,
  stone: 0x756f60,
  highlight: 0xc4ad82,
});

/** Paint only: nominal footprint/protection, graph geometry and travel costs stay unchanged. */
export const ROAD_MATERIAL = {
  landWidthFactor: 0.6,
  // One CSS pixel at the authored near/mid/far reference camera scales; inside every casing.
  surfaceMinWidth: 0.8,
  casing: 0x6f604c,
  arterial: 0xe4c89a,
  minor: 0xe4cfa9,
  vergeAlpha: 0.06,
  casingAlpha: 0.88,
  pathCasingAlpha: 0.88,
  surfaceAlpha: 0.98,
  grainAlpha: 0.08,
  shadowAlpha: 0.08,
  highlightAlpha: 0.12,
  seaOuterAlpha: 0.12,
  seaInnerWidth: 0.8,
} as const;

/** Interior paint only: never widen the casing, nominal protection or route geometry. */
export function landRoadSurfaceMaterial(
  nominalWidth: number,
  stageMultiplier: number,
  color: number,
  alpha = 1,
) {
  const paint = landRoadMaterial(nominalWidth * stageMultiplier, color, alpha);
  return {
    ...paint,
    width:
      Math.max(nominalWidth * ROAD_MATERIAL.landWidthFactor, ROAD_MATERIAL.surfaceMinWidth) *
      stageMultiplier,
  };
}

export function landRoadMaterial(width: number, color: number, alpha = 1) {
  let paintColor = color,
    paintAlpha = alpha;
  if (color === MAP_PALETTE_NUM.roadCasing) {
    paintColor = ROAD_MATERIAL.casing;
    paintAlpha =
      alpha === 0.14
        ? ROAD_MATERIAL.vergeAlpha
        : alpha === 0.62
          ? ROAD_MATERIAL.casingAlpha
          : alpha === 0.23
            ? ROAD_MATERIAL.grainAlpha
            : ROAD_MATERIAL.pathCasingAlpha;
  } else if (color === MAP_PALETTE_NUM.roadArterial || color === MAP_PALETTE_NUM.roadMinor) {
    paintColor =
      color === MAP_PALETTE_NUM.roadArterial ? ROAD_MATERIAL.arterial : ROAD_MATERIAL.minor;
    paintAlpha = ROAD_MATERIAL.surfaceAlpha;
  } else if (color === MAP_PALETTE_NUM.plainLight) {
    paintAlpha = ROAD_MATERIAL.highlightAlpha;
  } else if (color === MAP_PALETTE_NUM.reliefInk) {
    paintColor = ROAD_MATERIAL.casing;
    paintAlpha = ROAD_MATERIAL.shadowAlpha;
  }
  return { width: width * ROAD_MATERIAL.landWidthFactor, color: paintColor, alpha: paintAlpha };
}
