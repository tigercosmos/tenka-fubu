import type { Texture } from 'pixi.js';

/** Mid-only shared-texture additive light; premultiplied alpha preserves transparent edges. */
export const ARMY_BODY_MID_LIGHT_ALPHA = 0.28;

export type ArmyFacing = 'east' | 'west' | 'north' | 'south';
export interface ArmyBodyArtSpec {
  readonly assetId: string;
  readonly contentBounds: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly groundAnchor: { readonly x: number; readonly y: number };
}
export type ArmyBodyArt = Partial<Record<ArmyFacing, { texture: Texture; spec: ArmyBodyArtSpec }>>;

/** Dominant axis and null/tie rules match the existing authored vector views. */
export function armyFacing(heading: { x: number; y: number } | null | undefined): ArmyFacing {
  if (!heading || (heading.x === 0 && heading.y === 0)) return 'east';
  if (Math.abs(heading.x) >= Math.abs(heading.y)) return heading.x < 0 ? 'west' : 'east';
  return heading.y < 0 ? 'north' : 'south';
}

/** Operational 32×34 / unchanged close 26×28 uniform fit; front feet join local (11, -1). */
export function armyBodyArtPlacement(spec: ArmyBodyArtSpec, stage: 'mid' | 'near' = 'near') {
  const scale = Math.min(
    (stage === 'mid' ? 32 : 26) / spec.contentBounds.width,
    (stage === 'mid' ? 34 : 28) / spec.contentBounds.height,
  );
  return { scale, x: 11 - spec.groundAnchor.x * scale, y: -1 - spec.groundAnchor.y * scale };
}

/** Actual alpha>8 content frames; anchors are visually authored front-foot baselines. */
export const ARMY_BODY_ART: Readonly<Record<ArmyFacing, ArmyBodyArtSpec>> = {
  east: {
    assetId: 'texture.army.infantry-east-v1',
    contentBounds: { x: 125, y: 82, width: 1005, height: 1089 },
    groundAnchor: { x: 627, y: 1170 },
  },
  west: {
    assetId: 'texture.army.infantry-west-v1',
    contentBounds: { x: 114, y: 85, width: 1061, height: 992 },
    groundAnchor: { x: 644, y: 1076 },
  },
  north: {
    assetId: 'texture.army.infantry-north-v1',
    contentBounds: { x: 318, y: 88, width: 652, height: 1097 },
    groundAnchor: { x: 644, y: 1184 },
  },
  south: {
    assetId: 'texture.army.infantry-south-v1',
    contentBounds: { x: 163, y: 95, width: 962, height: 1103 },
    groundAnchor: { x: 627, y: 1197 },
  },
};
